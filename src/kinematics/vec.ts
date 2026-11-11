// 纯数学向量工具。不依赖 three，可在 Node 与浏览器共用。
// 约定：Y 轴朝上，单位毫米（mm），角度用弧度（rad）。

export type Vec2 = [number, number]
export type Vec3 = [number, number, number]
/** 四元数 [x, y, z, w]，与 three.js 的 Quaternion 分量顺序一致。 */
export type Quat = [number, number, number, number]

export const TAU = Math.PI * 2

export const v3 = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  len: (a: Vec3): number => Math.hypot(a[0], a[1], a[2]),
  dist: (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  norm: (a: Vec3): Vec3 => {
    const l = Math.hypot(a[0], a[1], a[2])
    if (l === 0) throw new Error('零向量无法归一化')
    return [a[0] / l, a[1] / l, a[2] / l]
  },
  lerp: (a: Vec3, b: Vec3, t: number): Vec3 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ],
}

export const v2 = {
  add: (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]],
  sub: (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]],
  scale: (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s],
  dot: (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1],
  cross: (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0],
  len: (a: Vec2): number => Math.hypot(a[0], a[1]),
  dist: (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]),
  polar: (r: number, angle: number): Vec2 => [r * Math.cos(angle), r * Math.sin(angle)],
  angle: (a: Vec2): number => Math.atan2(a[1], a[0]),
  rotate: (a: Vec2, angle: number): Vec2 => {
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    return [a[0] * c - a[1] * s, a[0] * s + a[1] * c]
  },
}

/** 把角度规整到 [0, 2π)。 */
export function wrapAngle(a: number): number {
  const r = a % TAU
  return r < 0 ? r + TAU : r
}

/** 把角度规整到 (-π, π]。 */
export function wrapPi(a: number): number {
  const r = wrapAngle(a)
  return r > Math.PI ? r - TAU : r
}

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** 平滑步进：0→1 的三次缓动，两端导数为 0。 */
export function smoothstep(x: number): number {
  const t = clamp(x, 0, 1)
  return t * t * (3 - 2 * t)
}

export const deg = (d: number) => (d * Math.PI) / 180
