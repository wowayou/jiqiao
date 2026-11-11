// 渐开线齿轮的纯数学：齿形轮廓、变位、啮合检查（重合度、齿顶干涉、齿顶变尖）。
//
// 齿位约定同 gears.ts：齿轮转角为 0 时 0 号齿的齿中心线在局部 0 角方向，第 j 号齿在 2πj/z。
// 所以啮合相位直接用 gears.ts 的 meshPlanar / meshAngle（对渐开线齿轮，齿中心对齿槽中心即正确相位，
// 而且渐开线保证速比恒定，两侧齿隙在整个啮合过程中保持不变）。
// 本文件只用公开的齿轮几何公式（渐开线函数 inv α = tan α − α 等），不含第三方代码。
import { TAU, v2, type Vec2 } from './vec'

export interface InvoluteSpec {
  /** 模数 m（mm） */
  module: number
  /** 齿数 */
  teeth: number
  /** 压力角（rad），默认 20° */
  pressureAngle?: number
  /** 变位系数 x（正变位加厚齿根、避免小齿数根切） */
  shift?: number
  /** 齿顶高系数，默认 1 */
  addendum?: number
  /** 齿根高系数，默认 1.25 */
  dedendum?: number
  /** 本齿轮在分度圆上减薄的弧长（mm），即本轮分担的齿隙 */
  backlash?: number
}

export interface InvoluteGeometry {
  m: number
  z: number
  alpha: number
  x: number
  /** 分度圆、基圆、齿顶圆、齿根圆半径 */
  r: number
  rb: number
  ra: number
  rf: number
  /** 分度圆上的齿厚（弧长） */
  thickness: number
  /** 半径 ρ 处（ρ ≥ rb）齿厚所对的半角 */
  halfAngleAt(rho: number): number
  /** 齿顶厚（弧长）；≤ 0 表示齿顶变尖 */
  tipThickness: number
}

export const inv = (a: number) => Math.tan(a) - a

export function involuteGeometry(s: InvoluteSpec): InvoluteGeometry {
  const m = s.module
  const z = s.teeth
  const alpha = s.pressureAngle ?? (20 * Math.PI) / 180
  const x = s.shift ?? 0
  const ha = s.addendum ?? 1
  const hf = s.dedendum ?? 1.25
  const r = (m * z) / 2
  const rb = r * Math.cos(alpha)
  const ra = r + m * (ha + x)
  const rf = r - m * (hf - x)
  const thickness = m * (Math.PI / 2 + 2 * x * Math.tan(alpha)) - (s.backlash ?? 0)
  const psiP = thickness / (2 * r)
  const halfAngleAt = (rho: number) => {
    const aRho = Math.acos(Math.min(1, rb / rho))
    return psiP + inv(alpha) - inv(aRho)
  }
  return { m, z, alpha, x, r, rb, ra, rf, thickness, halfAngleAt, tipThickness: 2 * halfAngleAt(ra) * ra }
}

/**
 * 整个齿轮的外轮廓（逆时针多边形）。每个齿：根圆 → 径向齿根 → 渐开线齿面 → 齿顶圆弧 → 另一侧齿面 → 根圆。
 * 基圆以内的齿根取径向直线（无根切时的通行近似；是否会被对方齿顶碰到由 meshCheck 判断）。
 */
export function involuteOutline(s: InvoluteSpec, o: { flank?: number; tip?: number; root?: number } = {}): Vec2[] {
  const g = involuteGeometry(s)
  const nF = o.flank ?? 8
  const nT = o.tip ?? 2
  const nR = o.root ?? 3
  if (g.tipThickness <= 0) throw new Error(`齿顶变尖：z=${g.z}, x=${g.x}`)
  const rStart = Math.max(g.rb, g.rf)
  const halfStart = g.halfAngleAt(rStart)
  const pitch = TAU / g.z
  const pts: Vec2[] = []
  for (let j = 0; j < g.z; j++) {
    const c = j * pitch
    // 右侧齿面（角度小的一侧）自下而上
    if (g.rf < rStart) pts.push(v2.polar(g.rf, c - halfStart))
    for (let i = 0; i <= nF; i++) {
      const rho = rStart + ((g.ra - rStart) * i) / nF
      pts.push(v2.polar(rho, c - g.halfAngleAt(rho)))
    }
    const tipHalf = g.halfAngleAt(g.ra)
    for (let i = 1; i < nT; i++) pts.push(v2.polar(g.ra, c - tipHalf + (2 * tipHalf * i) / nT))
    for (let i = nF; i >= 0; i--) {
      const rho = rStart + ((g.ra - rStart) * i) / nF
      pts.push(v2.polar(rho, c + g.halfAngleAt(rho)))
    }
    if (g.rf < rStart) pts.push(v2.polar(g.rf, c + halfStart))
    // 齿根圆弧到下一个齿
    const a0 = c + halfStart
    const a1 = c + pitch - halfStart
    for (let i = 1; i < nR; i++) pts.push(v2.polar(g.rf, a0 + ((a1 - a0) * i) / nR))
  }
  return pts
}

export interface MeshReport {
  centerDistance: number
  /** 重合度（> 1 才能连续传动） */
  contactRatio: number
  /** 对方齿顶在本轮上的最低接触半径与基圆之差（< 0 表示齿顶伸进基圆以内，会碰到非渐开线齿根 = 干涉） */
  marginA: number
  marginB: number
  /** 顶隙：齿顶圆与对方齿根圆之间的间隙 */
  clearanceA: number
  clearanceB: number
  /** 法向齿隙之和（mm） */
  backlash: number
}

/** 外啮合检查。两轮变位系数之和须为 0（标准中心距），否则抛错。 */
export function meshCheck(a: InvoluteSpec, b: InvoluteSpec): MeshReport {
  const A = involuteGeometry(a)
  const B = involuteGeometry(b)
  if (Math.abs(A.m - B.m) > 1e-12 || Math.abs(A.alpha - B.alpha) > 1e-12) throw new Error('啮合的两轮模数与压力角须相同')
  if (Math.abs(A.x + B.x) > 1e-9) throw new Error('本实现只支持零和变位（标准中心距）')
  const cd = A.r + B.r
  const pb = Math.PI * A.m * Math.cos(A.alpha)
  const la = Math.sqrt(A.ra ** 2 - A.rb ** 2)
  const lb = Math.sqrt(B.ra ** 2 - B.rb ** 2)
  const line = cd * Math.sin(A.alpha)
  return {
    centerDistance: cd,
    contactRatio: (la + lb - line) / pb,
    marginA: line - lb,
    marginB: line - la,
    clearanceA: cd - A.ra - B.rf,
    clearanceB: cd - B.ra - A.rf,
    backlash: ((a.backlash ?? 0) + (b.backlash ?? 0)) * Math.cos(A.alpha),
  }
}
