// 取景纯函数：不让任何点出画；细长的一组点比包围球取景更紧；注视点平移后更居中。
import { describe, expect, test } from 'vitest'
import type { Vec3 } from '../kinematics/vec'
import { fitDistance, fitView, sphereDistance } from './framing'

const TAN_V = Math.tan((32 * Math.PI) / 360) // fov 32°
const aspect = 1040 / 560
const TAN_H = TAN_V * aspect

/** 点在相机里的横、纵向正切值（要 ≤ tanH / tanV 才在画面内） */
function project(p: Vec3, target: Vec3, dir: Vec3, dist: number) {
  const len = Math.hypot(...dir)
  const d: Vec3 = [dir[0] / len, dir[1] / len, dir[2] / len]
  let r: Vec3 = [d[2], 0, -d[0]]
  const rl = Math.hypot(...r)
  r = [r[0] / rl, r[1] / rl, r[2] / rl]
  const u: Vec3 = [d[1] * r[2] - d[2] * r[1], d[2] * r[0] - d[0] * r[2], d[0] * r[1] - d[1] * r[0]]
  const q: Vec3 = [p[0] - target[0], p[1] - target[1], p[2] - target[2]]
  const z = q[0] * d[0] + q[1] * d[1] + q[2] * d[2]
  const depth = dist - z
  return { x: (q[0] * r[0] + q[1] * r[1] + q[2] * r[2]) / depth, y: (q[0] * u[0] + q[1] * u[1] + q[2] * u[2]) / depth, depth }
}

// 细长的一组点：像石磨的推杆（沿 x 方向 1600 长）加一个磨盘（半径 300 的圆盘）
const rod: Vec3[] = []
for (const x of [-300, 1300]) for (const y of [0, 40]) for (const z of [-20, 20]) rod.push([x, y, z])
for (let k = 0; k < 24; k++) rod.push([300 * Math.cos((k / 24) * 2 * Math.PI), 100, 300 * Math.sin((k / 24) * 2 * Math.PI)])
const bbCenter: Vec3 = [500, 50, 0]
const dir: Vec3 = [1, 0.8, 1.4]

describe('取景', () => {
  test('fitDistance：全部点都在画面内（边缘刚好贴着）', () => {
    const dist = fitDistance(rod, bbCenter, dir, TAN_H, TAN_V)
    let maxX = 0
    let maxY = 0
    for (const p of rod) {
      const q = project(p, bbCenter, dir, dist)
      maxX = Math.max(maxX, Math.abs(q.x))
      maxY = Math.max(maxY, Math.abs(q.y))
      expect(q.depth).toBeGreaterThan(0)
    }
    expect(maxX).toBeLessThanOrEqual(TAN_H + 1e-9)
    expect(maxY).toBeLessThanOrEqual(TAN_V + 1e-9)
    // 至少有一个方向是贴边的
    expect(Math.max(maxX / TAN_H, maxY / TAN_V)).toBeGreaterThan(0.999)
  })

  test('fitView：注视点平移后全部点仍在画面内，距离不比 fitDistance 远', () => {
    const base = fitDistance(rod, bbCenter, dir, TAN_H, TAN_V)
    const { target, dist } = fitView(rod, bbCenter, dir, TAN_H, TAN_V)
    expect(dist).toBeLessThanOrEqual(base * 1.001)
    for (const p of rod) {
      const q = project(p, target, dir, dist)
      expect(q.depth).toBeGreaterThan(0)
      expect(Math.abs(q.x)).toBeLessThanOrEqual(TAN_H * 1.002)
      expect(Math.abs(q.y)).toBeLessThanOrEqual(TAN_V * 1.002)
    }
  })

  test('一边偏的点集：fitView 比不平移更近', () => {
    // 点集偏在中心一侧：中心取得不好时，平移注视点能省出距离
    const off: Vec3[] = [
      [0, 0, 0],
      [0, 100, 0],
      [800, 0, 0],
      [800, 100, 0],
    ]
    const badCenter: Vec3 = [100, 50, 0]
    const base = fitDistance(off, badCenter, [0, 0, 1], TAN_H, TAN_V)
    const { dist, target } = fitView(off, badCenter, [0, 0, 1], TAN_H, TAN_V)
    expect(dist).toBeLessThan(base * 0.8)
    expect(target[0]).toBeGreaterThan(300) // 注视点挪向点集中央（x = 400）
    for (const p of off) {
      const q = project(p, target, [0, 0, 1], dist)
      expect(Math.abs(q.x)).toBeLessThanOrEqual(TAN_H * 1.002)
      expect(Math.abs(q.y)).toBeLessThanOrEqual(TAN_V * 1.002)
    }
  })

  test('比包围球取景更紧：长 1600 的推杆加磨盘，球取景要远得多', () => {
    const { dist } = fitView(rod, bbCenter, dir, TAN_H, TAN_V)
    // 包围球：中心到最远点
    const radius = Math.max(...rod.map((p) => Math.hypot(p[0] - bbCenter[0], p[1] - bbCenter[1], p[2] - bbCenter[2])))
    const sph = sphereDistance(radius * 1.0, TAN_H, TAN_V)
    expect(dist).toBeLessThan(sph * 0.85)
  })

  test('朝向正对竖直方向时不出 NaN', () => {
    const { dist, target } = fitView(rod, bbCenter, [0, 1, 0], TAN_H, TAN_V)
    expect(Number.isFinite(dist)).toBe(true)
    expect(target.every(Number.isFinite)).toBe(true)
  })
})
