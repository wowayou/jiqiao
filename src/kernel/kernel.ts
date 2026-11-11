// Kernel：几何内核的统一入口。浏览器与 Node 共用同一套 API。
// 约定：Y 轴朝上，单位 mm，旋转用弧度（rotateDeg 除外）。
import type { ManifoldToplevel } from 'manifold-3d'
import type { Pose } from '../kinematics/pose'
import type { Vec2, Vec3 } from '../kinematics/vec'
import { runScope } from './arena'
import { AXIS_MAT, Region, Solid, type Axis, type Box3 } from './solid'

export interface CylinderOpts {
  /** 半径 */
  r: number
  /** 高（沿 axis） */
  h: number
  /** 顶端半径（做圆台/圆锥），默认等于 r */
  r2?: number
  axis?: Axis
  /** 默认 true：沿轴向居中；false 时从 0 到 h */
  center?: boolean
  segments?: number
}

export interface Kernel {
  /** 底层 WASM 模块（逃生口，见 Solid.raw 的说明）。 */
  readonly wasm: ManifoldToplevel

  /** 在作用域内运行同步函数：返回值保留，其余几何对象自动释放。 */
  scope<T>(fn: () => T): T

  // —— 三维基本体 ——
  /** 长方体，默认中心在原点。 */
  box(size: Vec3, center?: boolean): Solid
  /** 由两个对角点给出的长方体（不要求顺序）。 */
  boxFromTo(a: Vec3, b: Vec3): Solid
  cylinder(o: CylinderOpts): Solid
  /** 两点之间的圆杆（绳、杆、轴）。 */
  rod(from: Vec3, to: Vec3, r: number, segments?: number): Solid
  sphere(r: number, segments?: number): Solid
  /** 圆环（绕 Y 轴）：大半径 R，截面半径 r。 */
  torus(R: number, r: number, segments?: number, tubeSegments?: number): Solid
  union(solids: readonly Solid[]): Solid
  /** 点集或实体的凸包。 */
  hull(items: readonly (Solid | Vec3)[]): Solid

  // —— 二维 ——
  polygon(points: readonly Vec2[] | readonly (readonly Vec2[])[]): Region
  rect(w: number, h: number, center?: boolean): Region
  circle(r: number, segments?: number): Region
  regionUnion(regions: readonly Region[]): Region

  // —— 二维 → 三维 ——
  /** 截面拉伸，截面坐标约定见 AXIS_MAT（axis 'y' 时截面是 (z, x)）。 */
  extrude(profile: readonly Vec2[] | Region, depth: number, axis?: Axis, center?: boolean): Solid
  /** 绕 Y 轴旋转成型：profile 点为 (半径, 高度)。 */
  revolve(profile: readonly Vec2[] | Region, segments?: number, degrees?: number): Solid

  // —— 审计 ——
  /** 两实体（各自按位姿放置后）的交集体积。 */
  intersectionVolume(a: Solid, b: Solid, poseA?: Pose, poseB?: Pose): number
  /** 世界包围盒。 */
  bboxOf(s: Solid, pose?: Pose): Box3
}

export function isGeometry(x: unknown): x is Solid | Region {
  return x instanceof Solid || x instanceof Region
}

export function createKernel(wasm: ManifoldToplevel): Kernel {
  const { Manifold, CrossSection } = wasm

  const toRegion = (p: readonly Vec2[] | Region): Region =>
    p instanceof Region ? p : new Region(new CrossSection([p.map((v) => [v[0], v[1]] as Vec2)], 'EvenOdd'))

  const k: Kernel = {
    wasm,
    scope: (fn) => runScope(fn, isGeometry),

    box(size, center = true) {
      return new Solid(Manifold.cube(size, center))
    },
    boxFromTo(a, b) {
      const min: Vec3 = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])]
      const size: Vec3 = [Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])]
      const c = Manifold.cube(size, false)
      const m = c.translate(min)
      c.delete()
      return new Solid(m)
    },
    cylinder({ r, h, r2, axis = 'y', center = true, segments }) {
      const c = Manifold.cylinder(h, r, r2 ?? r, segments ?? 0, center)
      if (axis === 'z') return new Solid(c)
      const m = c.transform(AXIS_MAT[axis])
      c.delete()
      return new Solid(m)
    },
    rod(from, to, r, segments = 16) {
      const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
      const len = Math.hypot(d[0], d[1], d[2])
      if (len === 0) throw new Error('rod 两端重合')
      const c = Manifold.cylinder(len, r, r, segments, false)
      // 把 +Z 转到 d：绕 z×d 旋转 acos(dz/len)
      const ax: Vec3 = [-d[1], d[0], 0]
      const angle = Math.acos(Math.max(-1, Math.min(1, d[2] / len)))
      const axisLen = Math.hypot(ax[0], ax[1])
      const rotated = new Solid(c)
      const r1 = axisLen < 1e-12 ? (d[2] < 0 ? rotated.rotate([1, 0, 0], Math.PI) : rotated) : rotated.rotate(ax, angle)
      return r1.translate(from)
    },
    sphere(r, segments) {
      return new Solid(Manifold.sphere(r, segments ?? 0))
    },
    torus(R, r, segments = 64, tubeSegments = 16) {
      return k.revolve(k.circle(r, tubeSegments).translate([R, 0]), segments)
    },
    union(solids) {
      if (solids.length === 0) throw new Error('union 需要至少一个实体')
      return new Solid(Manifold.union(solids.map((s) => s.raw)))
    },
    hull(items) {
      const pts = items.map((x) => (x instanceof Solid ? x.raw : x))
      return new Solid(Manifold.hull(pts))
    },

    polygon(points) {
      const contours = (Array.isArray(points[0]?.[0]) ? points : [points]) as Vec2[][]
      return new Region(new CrossSection(contours, 'EvenOdd'))
    },
    rect(w, h, center = true) {
      return new Region(CrossSection.square([w, h], center))
    },
    circle(r, segments) {
      return new Region(CrossSection.circle(r, segments ?? 0))
    },
    regionUnion(regions) {
      if (regions.length === 0) throw new Error('regionUnion 需要至少一个区域')
      return new Region(CrossSection.union(regions.map((r) => r.raw)))
    },

    extrude(profile, depth, axis = 'z', center = false) {
      return toRegion(profile).extrude(depth, axis, center)
    },
    revolve(profile, segments, degrees) {
      return toRegion(profile).revolve(segments, degrees)
    },

    intersectionVolume(a, b, poseA, poseB) {
      return k.scope(() => {
        const A = poseA ? a.place(poseA) : a
        const B = poseB ? b.place(poseB) : b
        return A.intersect(B).volume()
      })
    },
    bboxOf(s, pose) {
      if (!pose) return s.bbox()
      return k.scope(() => s.place(pose).bbox())
    },
  }
  return k
}
