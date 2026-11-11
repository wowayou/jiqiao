// 木作零件：长方料、榫头（+）、卯眼（−，可带出口放大段）、锯缝、楔。
//
// 坐标约定（本文件所有函数一致）：
//   - 带榫的料（横料）沿 +X 伸展，肩（榫头根部）在 x = 0 平面；榫头朝 −X 伸出。
//   - 截面：高度沿 Y，厚度沿 Z；默认以料的中心线为 y = z = 0。
//   - 卯眼刀具：入口在 x = 0，沿 −X 贯穿 depth。把它平移到立料的入口面再相减。
// 这样「榫头的局部坐标」与「卯眼刀具的局部坐标」在装配好时重合，只差一个平移。
import type { Kernel, Solid } from '../kernel'
import type { Vec2, Vec3 } from '../kinematics/vec'

/** 默认配合间隙（每侧，mm）：刚体模型里避免面面重合导致的数值干涉。 */
export const FIT_CLEARANCE = 0.1
/** 刀具伸出面外的余量，保证布尔运算切得干净 */
const OVERSHOOT = 1

export interface BeamOpts {
  /** 沿 +X 的长度 */
  length: number
  /** 高（Y） */
  height: number
  /** 厚（Z） */
  thickness: number
}

/** 长方料：x ∈ [0, length]，截面居中。 */
export function beamX(k: Kernel, o: BeamOpts): Solid {
  return k.boxFromTo([0, -o.height / 2, -o.thickness / 2], [o.length, o.height / 2, o.thickness / 2])
}

export interface TenonSpec {
  /** 榫长：从肩（x=0）向 −X */
  length: number
  /** 榫厚（Z） */
  thickness: number
  /** 榫高（Y） */
  height: number
  /** 榫中心相对料中心的偏移 (y, z) */
  offset?: Vec2
}

/** 榫头实体：x ∈ [−length, 0]。 */
export function tenon(k: Kernel, t: TenonSpec): Solid {
  const [oy, oz] = t.offset ?? [0, 0]
  return k.boxFromTo([-t.length, oy - t.height / 2, oz - t.thickness / 2], [0, oy + t.height / 2, oz + t.thickness / 2])
}

export interface KerfSpec {
  /** 锯缝深度：从榫头端面向肩的方向 */
  depth: number
  /** 端面处缝宽（Y 向） */
  open: number
  /** 缝底宽 */
  tip: number
}

function kerfProfile(t: TenonSpec, kf: KerfSpec, shrink: number, headExtra: number): Vec2[] {
  const [oy] = t.offset ?? [0, 0]
  const x0 = -t.length // 榫头端面
  const x1 = x0 + kf.depth // 缝底
  const slope = (kf.open - kf.tip) / 2 / kf.depth // 每 mm 半宽变化
  const xh = x0 - headExtra
  const halfHead = kf.open / 2 + slope * headExtra - shrink
  const halfTip = Math.max(kf.tip / 2 - shrink, 0.05)
  return [
    [xh, oy - halfHead],
    [x1 - shrink, oy - halfTip],
    [x1 - shrink, oy + halfTip],
    [xh, oy + halfHead],
  ]
}

/** 锯缝刀具（V 形，贯穿榫厚）。 */
export function kerfCutter(k: Kernel, t: TenonSpec, kf: KerfSpec): Solid {
  const [, oz] = t.offset ?? [0, 0]
  return k.extrude(kerfProfile(t, kf, 0, OVERSHOOT), t.thickness + 2 * OVERSHOOT, 'z', true).translate([0, 0, oz])
}

export interface WedgeOpts {
  /** 每侧间隙，默认 FIT_CLEARANCE */
  clearance?: number
  /** 楔头露出榫头端面的长度 */
  protrude?: number
}

/** 与锯缝同形的楔（装配好的位置，横料坐标系）。 */
export function wedgeFor(k: Kernel, t: TenonSpec, kf: KerfSpec, o: WedgeOpts = {}): Solid {
  const c = o.clearance ?? FIT_CLEARANCE
  const [, oz] = t.offset ?? [0, 0]
  return k.extrude(kerfProfile(t, kf, c, o.protrude ?? 8), t.thickness - 2 * c, 'z', true).translate([0, 0, oz])
}

export interface RailOpts extends BeamOpts {
  tenon: TenonSpec
  kerf?: KerfSpec
}

/** 带榫横料：料身 x ∈ [0, length]，榫头朝 −X，可带锯缝。 */
export function railWithTenon(k: Kernel, o: RailOpts): Solid {
  const body = beamX(k, o).add(tenon(k, o.tenon))
  return o.kerf ? body.subtract(kerfCutter(k, o.tenon, o.kerf)) : body
}

export interface MortiseSpec {
  /** 贯穿深度（立料在 X 向的厚度） */
  depth: number
  /** 卯眼高（Y），一般等于榫高 */
  height: number
  /** 卯眼宽（Z），一般等于榫厚 */
  thickness: number
  offset?: Vec2
  /** 每侧间隙，默认 FIT_CLEARANCE */
  clearance?: number
  /** 出口放大段：最后 depth 长度内上下各放大 amount（为楔撑开的榫头留位） */
  flare?: { depth: number; amount: number }
  /** 盲卯（不贯穿）时设为 false，默认贯穿 */
  through?: boolean
}

/** 卯眼刀具：入口 x = 0，沿 −X。 */
export function mortiseCutter(k: Kernel, m: MortiseSpec): Solid {
  const c = m.clearance ?? FIT_CLEARANCE
  const [oy, oz] = m.offset ?? [0, 0]
  const h = m.height / 2 + c
  const through = m.through !== false
  const xEnd = -m.depth - (through ? OVERSHOOT : 0)
  const pts: Vec2[] = [[OVERSHOOT, oy - h]]
  if (m.flare && through) {
    const xf = -(m.depth - m.flare.depth)
    const slope = m.flare.amount / m.flare.depth
    const hEnd = h + m.flare.amount + slope * OVERSHOOT
    pts.push([xf, oy - h], [xEnd, oy - hEnd], [xEnd, oy + hEnd], [xf, oy + h])
  } else {
    pts.push([xEnd, oy - h], [xEnd, oy + h])
  }
  pts.push([OVERSHOOT, oy + h])
  return k.extrude(pts, m.thickness + 2 * c, 'z', true).translate([0, 0, oz])
}

export interface PostOpts {
  /** 立料尺寸 [X, Y, Z]，中心在原点 */
  size: Vec3
  /** 卯眼；入口面为 x = +size[0]/2 */
  mortise: Omit<MortiseSpec, 'depth'> & { depth?: number }
}

/** 带贯穿卯眼的立料：卯眼从 +X 面进、−X 面出。 */
export function postWithMortise(k: Kernel, o: PostOpts): Solid {
  const depth = o.mortise.depth ?? o.size[0]
  return k.box(o.size).subtract(mortiseCutter(k, { ...o.mortise, depth }).translate([o.size[0] / 2, 0, 0]))
}

/** 楔形块（一般用途）：沿 +X 从厚 thick 收到 thin，长 length，宽（Z）width，截面在 XY 平面对称。 */
export function wedge(k: Kernel, o: { length: number; thick: number; thin: number; width: number }): Solid {
  return k.extrude(
    [
      [0, -o.thick / 2],
      [o.length, -o.thin / 2],
      [o.length, o.thin / 2],
      [0, o.thick / 2],
    ],
    o.width,
    'z',
    true,
  )
}

export interface StandOpts {
  /** 外廓宽（X）与深（Z） */
  width: number
  depth: number
  /** 总高（腿底 y = 0，顶面 y = height） */
  height: number
  /** 腿截面边长 */
  leg: number
  /** 牙板（顶部横枨）高 */
  apron: number
  /** 牙板厚，默认取腿截面的 0.6 */
  apronThickness?: number
  /** 下部横枨离地高度，省略则不设 */
  stretcherAt?: number
}

/** 四腿木架：四条腿 + 顶部一圈牙板（+ 可选下枨），合成一个实体。 */
export function fourLegStand(k: Kernel, o: StandOpts): Solid {
  const hw = o.width / 2
  const hd = o.depth / 2
  const l = o.leg
  const at = o.apronThickness ?? l * 0.6
  const parts: Solid[] = []
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      parts.push(k.boxFromTo([sx * hw, 0, sz * hd], [sx * (hw - l), o.height, sz * (hd - l)]))
  const ring = (y0: number, y1: number) => {
    for (const sz of [-1, 1]) parts.push(k.boxFromTo([-hw + l / 2, y0, sz * (hd - l / 2 - at / 2)], [hw - l / 2, y1, sz * (hd - l / 2 + at / 2)]))
    for (const sx of [-1, 1]) parts.push(k.boxFromTo([sx * (hw - l / 2 - at / 2), y0, -hd + l / 2], [sx * (hw - l / 2 + at / 2), y1, hd - l / 2]))
  }
  ring(o.height - o.apron, o.height)
  if (o.stretcherAt !== undefined) ring(o.stretcherAt, o.stretcherAt + l * 0.6)
  return k.union(parts)
}
