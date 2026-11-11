// 位姿（Pose）：位置 + 姿态四元数。展品的 pose(s) 返回它；展台与审计都把它换算成矩阵。
import type { Quat, Vec3 } from './vec'

export interface Pose {
  /** 位置（mm，世界坐标） */
  p: Vec3
  /** 姿态四元数 [x,y,z,w]，省略即不旋转 */
  q?: Quat
}

export const IDENTITY_Q: Quat = [0, 0, 0, 1]
export const ORIGIN: Pose = { p: [0, 0, 0] }

export function quatAxisAngle(axis: Vec3, angle: number): Quat {
  const l = Math.hypot(axis[0], axis[1], axis[2])
  const s = Math.sin(angle / 2) / l
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)]
}

export const rotX = (a: number) => quatAxisAngle([1, 0, 0], a)
export const rotY = (a: number) => quatAxisAngle([0, 1, 0], a)
export const rotZ = (a: number) => quatAxisAngle([0, 0, 1], a)

/** 四元数乘法 a·b：先施加 b，再施加 a。 */
export function quatMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

export function quatRotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (y * v[2] - z * v[1])
  const ty = 2 * (z * v[0] - x * v[2])
  const tz = 2 * (x * v[1] - y * v[0])
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ]
}

export function quatConj(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]]
}

export function pose(p: Vec3, q?: Quat): Pose {
  return q ? { p, q } : { p }
}

/** 把局部点变换到世界坐标。 */
export function poseApply(ps: Pose, v: Vec3): Vec3 {
  const r = ps.q ? quatRotate(ps.q, v) : v
  return [r[0] + ps.p[0], r[1] + ps.p[1], r[2] + ps.p[2]]
}

/** 复合位姿：先施加 child（局部），再施加 parent。 */
export function poseCompose(parent: Pose, child: Pose): Pose {
  const q = parent.q && child.q ? quatMul(parent.q, child.q) : (parent.q ?? child.q)
  return { p: poseApply(parent, child.p), q }
}

export function poseInverse(ps: Pose): Pose {
  const qi = ps.q ? quatConj(ps.q) : undefined
  const p = qi ? quatRotate(qi, ps.p) : ps.p
  return { p: [-p[0], -p[1], -p[2]], q: qi }
}

export function poseTranslate(ps: Pose, d: Vec3): Pose {
  return { p: [ps.p[0] + d[0], ps.p[1] + d[1], ps.p[2] + d[2]], q: ps.q }
}

/** 4×4 列主序矩阵（manifold 的 Mat4 约定；最后一行被忽略）。 */
export type Mat4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
]

export function poseToMat4(ps: Pose): Mat4 {
  const [x, y, z, w] = ps.q ?? IDENTITY_Q
  const xx = x * x, yy = y * y, zz = z * z
  const xy = x * y, xz = x * z, yz = y * z
  const wx = w * x, wy = w * y, wz = w * z
  return [
    1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0,
    2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0,
    2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0,
    ps.p[0], ps.p[1], ps.p[2], 1,
  ]
}
