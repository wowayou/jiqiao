// 渐开线齿轮零件 → Solid。齿轮轴一律沿局部 Z（钟表机芯：前后方向），齿形在 (x, y) 平面，
// 齿位约定同 kinematics/gears.ts：转角 0 时 0 号齿中心在 +X 方向。须在 kernel.scope 内调用。
import type { Kernel, Region, Solid } from '../kernel'
import { involuteGeometry, involuteOutline, type InvoluteSpec } from '../kinematics/involute'
import type { Vec2 } from '../kinematics/vec'

/** 沿 Z 的圆杆（轴、轴颈、管），从 z0 到 z1。 */
export function arborZ(k: Kernel, o: { r: number; z0: number; z1: number; bore?: number; segments?: number }): Solid {
  const seg = o.segments ?? 24
  let s = k.cylinder({ r: o.r, h: o.z1 - o.z0, axis: 'z', center: false, segments: seg }).translate([0, 0, o.z0])
  if (o.bore) s = s.subtract(k.cylinder({ r: o.bore, h: o.z1 - o.z0 + 2, axis: 'z', center: false, segments: seg }).translate([0, 0, o.z0 - 1]))
  return s
}

export interface CrossingOpts {
  /** 辐条数 */
  count: number
  /** 轮辋宽（从齿根圆往里，mm） */
  rim: number
  /** 辐条宽（mm） */
  arm: number
  /** 轮毂半径（mm） */
  hub: number
  /** 第一根辐条的方位角（rad），默认 0 */
  phase?: number
}

/** 轮辐间的镂空区域（齿轮平面内）：内辋与轮毂之间的环减去辐条。 */
export function crossingWindows(k: Kernel, rimInner: number, o: CrossingOpts): Region | null {
  if (rimInner <= o.hub + 2) return null
  let win = k.circle(rimInner, 96).subtract(k.circle(o.hub, 48))
  for (let i = 0; i < o.count; i++) {
    const a = (o.phase ?? 0) + (i * 2 * Math.PI) / o.count
    win = win.subtract(k.rect(rimInner + 2, o.arm, false).translate([0, -o.arm / 2]).rotate(a))
  }
  return win
}

export interface GearWheelOpts {
  /** 齿宽（沿 Z） */
  thickness: number
  /** 齿面所在的 z 起点（默认 0） */
  z0?: number
  /** 中心孔半径（与轴的间隙由调用方决定）；0 = 实心 */
  bore?: number
  /** 镂空轮辐（大轮才用） */
  crossing?: CrossingOpts
  /** 齿形离散精度 */
  flank?: number
}

/** 渐开线齿轮（或小齿轮）：齿形拉伸，可带轮辐镂空与中心孔。 */
export function involuteGear(k: Kernel, spec: InvoluteSpec, o: GearWheelOpts): Solid {
  const g = involuteGeometry(spec)
  let region: Region = k.polygon(involuteOutline(spec, { flank: o.flank ?? 6 }) as Vec2[])
  if (o.crossing) {
    const win = crossingWindows(k, g.rf - o.crossing.rim, o.crossing)
    if (win) region = region.subtract(win)
  }
  if (o.bore) region = region.subtract(k.circle(o.bore, 32))
  return region.extrude(o.thickness, 'z').translate([0, 0, o.z0 ?? 0])
}

/** 渐开线齿轮的分度圆、齿顶圆等（转发，便于零件文件只引一个模块）。 */
export { involuteGeometry }
