// Solid（三维实体）与 Region（二维区域）：对 manifold 对象的不可变包装。
// 每个操作都返回新对象并登记到当前 scope；原对象不变。
import type { CrossSection, Manifold } from 'manifold-3d'
import { poseToMat4, quatAxisAngle, type Mat4, type Pose } from '../kinematics/pose'
import type { Vec2, Vec3 } from '../kinematics/vec'
import { track, type Disposable } from './arena'

export type Axis = 'x' | 'y' | 'z'

export interface Box3 {
  min: Vec3
  max: Vec3
}

/**
 * 轴向置换：manifold 的拉伸、旋转成型都沿自身 Z 轴。
 * 把局部 (a, b, h) 映射到世界坐标，h 为拉伸方向。均为循环置换（纯旋转、不镜像）：
 *   axis 'z'：(a, b, h) → (x=a, y=b, z=h)
 *   axis 'x'：(a, b, h) → (x=h, y=a, z=b)
 *   axis 'y'：(a, b, h) → (x=b, y=h, z=a)   ← 注意：截面坐标是 (z, x)
 */
export const AXIS_MAT: Record<Axis, Mat4> = {
  z: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  // 列主序：第 1 列 = a 轴在世界中的方向
  x: [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1],
  y: [0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
}

function assertLive(d: { deleted: boolean }) {
  if (d.deleted) throw new Error('该几何对象已释放（delete 之后又被使用）')
}

export class Solid implements Disposable {
  #m: Manifold
  #deleted = false

  constructor(m: Manifold) {
    this.#m = m
    track(this)
  }

  get deleted() {
    return this.#deleted
  }

  /** 底层 manifold 对象。逃生口：用它创建的新对象需要自己 delete，或用 new Solid() 包回来。 */
  get raw(): Manifold {
    assertLive(this)
    return this.#m
  }

  delete() {
    if (!this.#deleted) {
      this.#deleted = true
      this.#m.delete()
    }
  }

  // —— 变换 ——
  translate(v: Vec3): Solid {
    return new Solid(this.raw.translate(v))
  }
  /** 绕过原点的轴旋转（弧度）。 */
  rotate(axis: Vec3, angle: number): Solid {
    return this.place({ p: [0, 0, 0], q: quatAxisAngle(axis, angle) })
  }
  /** 绕 X、Y、Z 轴旋转（角度制，按世界 X→Y→Z 顺序），90° 倍数时无舍入误差。 */
  rotateDeg(xyz: Vec3): Solid {
    return new Solid(this.raw.rotate(xyz))
  }
  scale(v: Vec3 | number): Solid {
    return new Solid(this.raw.scale(v))
  }
  mirror(normal: Vec3): Solid {
    return new Solid(this.raw.mirror(normal))
  }
  transform(m: Mat4): Solid {
    return new Solid(this.raw.transform(m))
  }
  /** 按位姿放置（先转后移）。 */
  place(pose: Pose): Solid {
    return this.transform(poseToMat4(pose))
  }

  // —— 布尔 ——
  add(...others: Solid[]): Solid {
    if (others.length === 0) return new Solid(this.raw.translate([0, 0, 0]))
    let m = this.raw.add(others[0].raw)
    for (let i = 1; i < others.length; i++) {
      const next = m.add(others[i].raw)
      m.delete()
      m = next
    }
    return new Solid(m)
  }
  subtract(...others: Solid[]): Solid {
    if (others.length === 0) return new Solid(this.raw.translate([0, 0, 0]))
    let m = this.raw.subtract(others[0].raw)
    for (let i = 1; i < others.length; i++) {
      const next = m.subtract(others[i].raw)
      m.delete()
      m = next
    }
    return new Solid(m)
  }
  intersect(other: Solid): Solid {
    return new Solid(this.raw.intersect(other.raw))
  }
  /** 只保留 normal·x ≥ offset 的一侧（平面裁切）。 */
  trim(normal: Vec3, offset: number): Solid {
    return new Solid(this.raw.trimByPlane(normal, offset))
  }
  /** 沿平面一分为二：[normal 一侧, 另一侧]。 */
  splitByPlane(normal: Vec3, offset: number): [Solid, Solid] {
    const [a, b] = this.raw.splitByPlane(normal, offset)
    return [new Solid(a), new Solid(b)]
  }
  hull(): Solid {
    return new Solid(this.raw.hull())
  }

  // —— 查询 ——
  volume(): number {
    return this.raw.volume()
  }
  surfaceArea(): number {
    return this.raw.surfaceArea()
  }
  genus(): number {
    return this.raw.genus()
  }
  isEmpty(): boolean {
    return this.raw.isEmpty()
  }
  numTri(): number {
    return this.raw.numTri()
  }
  status(): string {
    return this.raw.status()
  }
  bbox(): Box3 {
    const b = this.raw.boundingBox()
    return { min: [b.min[0], b.min[1], b.min[2]], max: [b.max[0], b.max[1], b.max[2]] }
  }
}

export class Region implements Disposable {
  #c: CrossSection
  #deleted = false

  constructor(c: CrossSection) {
    this.#c = c
    track(this)
  }

  get deleted() {
    return this.#deleted
  }
  get raw(): CrossSection {
    assertLive(this)
    return this.#c
  }
  delete() {
    if (!this.#deleted) {
      this.#deleted = true
      this.#c.delete()
    }
  }

  translate(v: Vec2): Region {
    return new Region(this.raw.translate(v))
  }
  /** 逆时针旋转（弧度）。 */
  rotate(angle: number): Region {
    return new Region(this.raw.rotate((angle * 180) / Math.PI))
  }
  scale(v: Vec2 | number): Region {
    return new Region(this.raw.scale(v))
  }
  mirror(axis: Vec2): Region {
    return new Region(this.raw.mirror(axis))
  }
  add(other: Region): Region {
    return new Region(this.raw.add(other.raw))
  }
  subtract(other: Region): Region {
    return new Region(this.raw.subtract(other.raw))
  }
  intersect(other: Region): Region {
    return new Region(this.raw.intersect(other.raw))
  }
  /** 等距偏移：delta > 0 外扩。 */
  offset(delta: number, join: 'Square' | 'Round' | 'Miter' = 'Miter'): Region {
    return new Region(this.raw.offset(delta, join))
  }
  area(): number {
    return this.raw.area()
  }
  isEmpty(): boolean {
    return this.raw.isEmpty()
  }
  /**
   * 拉伸成实体。截面坐标 (a, b) 与拉伸方向的对应见 AXIS_MAT。
   * center = true 时沿拉伸方向居中，否则从 0 拉到 depth。
   */
  extrude(depth: number, axis: Axis = 'z', center = false): Solid {
    const m = this.raw.extrude(depth, 0, 0, [1, 1], center)
    if (axis === 'z') return new Solid(m)
    const r = m.transform(AXIS_MAT[axis])
    m.delete()
    return new Solid(r)
  }
  /** 绕世界 Y 轴旋转成型：截面坐标 (a, b) = (半径, 高度)，只取 a > 0 的部分。 */
  revolve(segments?: number, degrees = 360): Solid {
    const m = this.raw.revolve(segments, degrees)
    const r = m.transform(AXIS_MAT.y)
    m.delete()
    return new Solid(r)
  }
}
