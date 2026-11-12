// 取景的纯函数：给定一组世界坐标点、取景中心与朝向，求「刚好全部装进画面」的相机距离。
import type { Vec3 } from '../kinematics/vec'

/**
 * 相机放在 center + dir × dist、看向 center：所有点都在视锥内所需的最小 dist。
 * tanH / tanV 是半视场角的正切（水平、可用的垂直方向）。透视投影下点离相机的深度是 dist − z，
 * 所以条件是 dist ≥ z + |x| / tanH 且 dist ≥ z + |y| / tanV，逐点取最大。
 * 比「包围球」紧：细长的一组零件（石磨的推杆、摆钟的摆）按投影后的范围取景，不被球半径撑大。
 */
export function fitDistance(points: readonly Vec3[], center: Vec3, dir: Vec3, tanH: number, tanV: number): number {
  const { d, r, u } = basis(dir)
  let dist = 0
  for (const p of points) {
    const q: Vec3 = [p[0] - center[0], p[1] - center[1], p[2] - center[2]]
    const z = dot(q, d)
    dist = Math.max(dist, z + Math.abs(dot(q, r)) / tanH, z + Math.abs(dot(q, u)) / tanV)
  }
  return dist
}

/** 相机坐标基：d 朝向相机（单位）、r 向右、u 向上 */
function basis(dir: Vec3): { d: Vec3; r: Vec3; u: Vec3 } {
  const len = Math.hypot(...dir) || 1
  const d: Vec3 = [dir[0] / len, dir[1] / len, dir[2] / len]
  let r: Vec3 = [d[2], 0, -d[0]]
  let rl = Math.hypot(...r)
  if (rl < 1e-6) {
    r = [1, 0, 0]
    rl = 1
  }
  r = [r[0] / rl, r[1] / rl, r[2] / rl]
  const u: Vec3 = [d[1] * r[2] - d[2] * r[1], d[2] * r[0] - d[0] * r[2], d[0] * r[1] - d[1] * r[0]]
  return { d, r, u }
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * 比 fitDistance 再紧一步：相机的注视点也可以在画面平面内平移（不改变深度），让一边的富余匀给另一边。
 * 水平、垂直两个方向互相独立：每个方向上，给定距离 D，注视点偏移 s 要满足对所有点 |x_i − s| ≤ t·(D − z_i)，
 * 即 s 落在 [max(x_i − t·(D − z_i)), min(x_i + t·(D − z_i))]，区间非空的最小 D 用二分求，取两个方向较大者；
 * 偏移取区间中点。返回新的注视点与距离。
 */
export function fitView(points: readonly Vec3[], center: Vec3, dir: Vec3, tanH: number, tanV: number): { target: Vec3; dist: number } {
  if (points.length === 0) return { target: center, dist: 0 }
  const { d, r, u } = basis(dir)
  const zs: number[] = []
  const xs: number[] = []
  const ys: number[] = []
  for (const p of points) {
    const q: Vec3 = [p[0] - center[0], p[1] - center[1], p[2] - center[2]]
    zs.push(dot(q, d))
    xs.push(dot(q, r))
    ys.push(dot(q, u))
  }
  const interval = (lat: number[], t: number, D: number): [number, number] => {
    let lo = -Infinity
    let hi = Infinity
    for (let i = 0; i < lat.length; i++) {
      const w = t * (D - zs[i])
      lo = Math.max(lo, lat[i] - w)
      hi = Math.min(hi, lat[i] + w)
    }
    return [lo, hi]
  }
  const minZ = Math.max(...zs)
  const feasible = (lat: number[], t: number, D: number) => {
    if (D <= minZ) return false
    const [lo, hi] = interval(lat, t, D)
    return lo <= hi
  }
  const solve = (lat: number[], t: number, hiD: number) => {
    let lo = Math.max(minZ, 0)
    let hi = hiD
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2
      if (feasible(lat, t, mid)) hi = mid
      else lo = mid
    }
    return hi
  }
  const upper = fitDistance(points, center, dir, tanH, tanV) // 注视点不动时一定可行
  const dist = Math.max(solve(xs, tanH, upper), solve(ys, tanV, upper)) * 1.0005
  const [xl, xh] = interval(xs, tanH, dist)
  const [yl, yh] = interval(ys, tanV, dist)
  const sx = (xl + xh) / 2
  const sy = (yl + yh) / 2
  return { target: [center[0] + r[0] * sx + u[0] * sy, center[1] + r[1] * sx + u[1] * sy, center[2] + r[2] * sx + u[2] * sy], dist }
}

/** 包围球取景：球刚好装进画面较窄的一边（旧做法，预设机位仍用它） */
export function sphereDistance(radius: number, tanH: number, tanV: number): number {
  return radius / Math.sin(Math.atan(Math.min(tanH, tanV)))
}
