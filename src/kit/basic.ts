// 通用参数化零件：圆盘、轴、手柄、连杆、绳/杆、带孔的杆端。
// 全部返回局部坐标系下的 Solid（单位 mm，Y 朝上）。须在 kernel.scope 内调用（展台和审计会替你包好）。
import type { Axis, Kernel, Solid } from '../kernel'
import type { Vec2, Vec3 } from '../kinematics/vec'

export interface DiscOpts {
  r: number
  /** 厚度（沿 Y） */
  h: number
  /** 中心孔半径 */
  hole?: number
  /** 边缘倒角（mm） */
  chamfer?: number
  segments?: number
  /** 底面在 y=0（默认），或 'center' 居中 */
  base?: 'bottom' | 'center'
}

/** 圆盘：绕 Y 轴。可带中心孔与边缘倒角。 */
export function disc(k: Kernel, o: DiscOpts): Solid {
  const c = Math.min(o.chamfer ?? 0, o.h / 3, o.r / 3)
  const rIn = o.hole ?? 0
  const prof: Vec2[] =
    c > 0
      ? [[rIn, 0], [o.r - c, 0], [o.r, c], [o.r, o.h - c], [o.r - c, o.h], [rIn, o.h]]
      : [[rIn, 0], [o.r, 0], [o.r, o.h], [rIn, o.h]]
  const s = k.revolve(prof, o.segments ?? 96)
  return o.base === 'center' ? s.translate([0, -o.h / 2, 0]) : s
}

export interface ShaftOpts {
  r: number
  length: number
  axis?: Axis
  /** 默认居中；false 时从 0 到 length */
  center?: boolean
  /** 两端倒角 */
  chamfer?: number
  segments?: number
}

/** 轴/销：圆柱，可带两端倒角。 */
export function shaft(k: Kernel, o: ShaftOpts): Solid {
  const c = Math.min(o.chamfer ?? 0, o.r / 2, o.length / 4)
  const L = o.length
  const prof: Vec2[] = c > 0 ? [[0, 0], [o.r - c, 0], [o.r, c], [o.r, L - c], [o.r - c, L], [0, L]] : [[0, 0], [o.r, 0], [o.r, L], [0, L]]
  let s = k.revolve(prof, o.segments ?? 32)
  if (o.center !== false) s = s.translate([0, -L / 2, 0])
  const axis = o.axis ?? 'y'
  if (axis === 'x') s = s.rotate([0, 0, 1], -Math.PI / 2)
  if (axis === 'z') s = s.rotate([1, 0, 0], Math.PI / 2)
  return s
}

export interface HandleOpts {
  /** 握杆半径 */
  r: number
  /** 握杆长（沿 +Y，从 y=0 起） */
  length: number
  /** 顶端圆头半径，0 为平头 */
  knob?: number
  segments?: number
}

/** 竖直手柄/木橛：沿 +Y 的圆杆，顶端可带圆头。 */
export function handle(k: Kernel, o: HandleOpts): Solid {
  const body = shaft(k, { r: o.r, length: o.length, center: false, chamfer: o.knob ? 0 : o.r * 0.25, segments: o.segments })
  if (!o.knob) return body
  return body.add(k.sphere(o.knob, o.segments ?? 32).translate([0, o.length, 0]))
}

export interface LinkOpts {
  /** 两孔中心距（沿 +X，孔 0 在原点） */
  length: number
  /** 杆宽（Z 向） */
  width: number
  /** 杆厚（Y 向） */
  thickness: number
  /** 孔半径，0 为无孔 */
  holeR?: number
  segments?: number
}

/** 平板连杆：两端圆头，孔轴沿 Y。孔 0 在原点，孔 1 在 (length, 0, 0)。 */
export function linkBar(k: Kernel, o: LinkOpts): Solid {
  const r = o.width / 2
  const seg = o.segments ?? 32
  // 截面在 (z, x) 平面（axis 'y' 的约定），先在 (x, z) 里构造再交换坐标
  const outline = k.regionUnion([
    k.circle(r, seg),
    k.circle(r, seg).translate([0, o.length]),
    k.rect(o.width, o.length, false).translate([-r, 0]),
  ])
  let region = outline
  if (o.holeR) region = region.subtract(k.circle(o.holeR, seg)).subtract(k.circle(o.holeR, seg).translate([0, o.length]))
  return region.extrude(o.thickness, 'y', true)
}

export interface PoleOpts {
  from: Vec3
  to: Vec3
  r: number
  segments?: number
}

/** 两点之间的圆杆（推杆、拉杆、细绳段）。 */
export function pole(k: Kernel, o: PoleOpts): Solid {
  return k.rod(o.from, o.to, o.r, o.segments ?? 24)
}

/** 折线绳：每段一根细杆，拐点处用小球补圆。 */
export function rope(k: Kernel, points: Vec3[], r: number, segments = 12): Solid {
  if (points.length < 2) throw new Error('rope 至少需要两点')
  const parts: Solid[] = []
  for (let i = 0; i + 1 < points.length; i++) parts.push(k.rod(points[i], points[i + 1], r, segments))
  for (let i = 1; i + 1 < points.length; i++) parts.push(k.sphere(r, segments).translate(points[i]))
  return k.union(parts)
}

export interface EyeOpts {
  /** 孔半径 */
  holeR: number
  /** 外半径 */
  outerR: number
  /** 厚度（沿 Y，居中） */
  thickness: number
  segments?: number
}

/** 杆端圆环（套在销上）：轴沿 Y，中心在原点。 */
export function eyeRing(k: Kernel, o: EyeOpts): Solid {
  return disc(k, { r: o.outerR, h: o.thickness, hole: o.holeR, segments: o.segments ?? 48, base: 'center', chamfer: 1.5 })
}
