// 平面连杆的纯数学：两圆交点、二杆组（dyad）、曲柄滑块、四杆机构。
// 所有函数在一个平面坐标系（u, v）里工作；展品自己决定这个平面在三维里的位置。
import { v2, type Vec2 } from './vec'

/** 两圆交点：0、1 或 2 个。按「A→B 左侧在前」排序。 */
export function circleIntersections(c1: Vec2, r1: number, c2: Vec2, r2: number, eps = 1e-9): Vec2[] {
  const d = v2.dist(c1, c2)
  if (d < eps) return []
  if (d > r1 + r2 + eps || d < Math.abs(r1 - r2) - eps) return []
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
  const h2 = r1 * r1 - a * a
  const h = h2 > 0 ? Math.sqrt(h2) : 0
  const ex: Vec2 = [(c2[0] - c1[0]) / d, (c2[1] - c1[1]) / d]
  const base: Vec2 = [c1[0] + a * ex[0], c1[1] + a * ex[1]]
  if (h < eps) return [base]
  const left: Vec2 = [base[0] - h * ex[1], base[1] + h * ex[0]]
  const right: Vec2 = [base[0] + h * ex[1], base[1] - h * ex[0]]
  return [left, right]
}

/**
 * 二杆组：已知两端铰点 A、B 与杆长 la、lb，求公共铰点 P。
 * branch = 1 取 A→B 左侧的解，-1 取右侧。够不着时抛错（机构在此位置锁死或尺寸错误）。
 */
export function dyad(A: Vec2, la: number, B: Vec2, lb: number, branch: 1 | -1 = 1): Vec2 {
  const pts = circleIntersections(A, la, B, lb)
  if (pts.length === 0) throw new Error(`二杆组无解：|AB|=${v2.dist(A, B).toFixed(4)}，杆长 ${la}、${lb}`)
  if (pts.length === 1) return pts[0]
  return branch === 1 ? pts[0] : pts[1]
}

export interface CrankSlider {
  /** 曲柄半径（曲柄轴心到曲柄销） */
  r: number
  /** 连杆长（曲柄销到滑块铰点） */
  l: number
  /** 偏距：滑块导路相对曲柄轴心的垂直偏移（沿 v） */
  e?: number
}

export interface CrankSliderState {
  /** 曲柄销位置 */
  pin: Vec2
  /** 滑块铰点位置（导路平行于 u 轴，位于曲柄轴心 +u 一侧） */
  slider: Vec2
  /** 滑块沿导路的位置 */
  x: number
  /** 连杆方向角（从曲柄销指向滑块） */
  rodAngle: number
  /** dx/dθ：曲柄每转过 1 rad 滑块移动多少 */
  dxdTheta: number
  /**
   * 力臂：曲柄轴心到连杆中心线的垂直距离。
   * 反过来用（人推滑块带动曲柄）时，推力产生的转矩 = 推杆力 × 力臂；力臂为 0 即死点。
   */
  arm: number
}

/** 曲柄滑块：曲柄转角 θ（曲柄销 = r(cosθ, sinθ)）。 */
export function crankSlider(m: CrankSlider, theta: number): CrankSliderState {
  const e = m.e ?? 0
  const pin: Vec2 = [m.r * Math.cos(theta), m.r * Math.sin(theta)]
  const dv = e - pin[1]
  const under = m.l * m.l - dv * dv
  if (under < 0) throw new Error('曲柄滑块无解：连杆太短')
  const root = Math.sqrt(under)
  const x = pin[0] + root
  const slider: Vec2 = [x, e]
  const rodAngle = Math.atan2(slider[1] - pin[1], slider[0] - pin[0])
  // d(pin.y)/dθ = r cosθ；d(root)/dθ = (dv · r cosθ) / root
  const dxdTheta = -m.r * Math.sin(theta) + (dv * m.r * Math.cos(theta)) / root
  const dir: Vec2 = [Math.cos(rodAngle), Math.sin(rodAngle)]
  const arm = Math.abs(v2.cross(dir, v2.sub([0, 0], pin)))
  return { pin, slider, x, rodAngle, dxdTheta, arm }
}

export interface FourBar {
  /** 机架长：O2 = (0,0)，O4 = (ground, 0) */
  ground: number
  /** 曲柄（输入杆）长 */
  crank: number
  /** 连杆长 */
  coupler: number
  /** 摇杆（输出杆）长 */
  rocker: number
}

export interface FourBarState {
  A: Vec2
  B: Vec2
  /** 连杆角 */
  theta3: number
  /** 摇杆角 */
  theta4: number
}

/** 四杆机构位置解：输入角 θ2（曲柄绕 O2）。branch 选装配构型。 */
export function fourBar(m: FourBar, theta2: number, branch: 1 | -1 = 1): FourBarState {
  const O4: Vec2 = [m.ground, 0]
  const A = v2.polar(m.crank, theta2)
  const B = dyad(A, m.coupler, O4, m.rocker, branch)
  return {
    A,
    B,
    theta3: v2.angle(v2.sub(B, A)),
    theta4: v2.angle(v2.sub(B, O4)),
  }
}

export type GrashofClass = 'crank-rocker' | 'double-crank' | 'double-rocker' | 'change-point' | 'non-grashof'

/** 格拉肖夫判别：最短杆 + 最长杆 ≤ 另两杆之和时，存在能整周转动的杆。 */
export function grashof(m: FourBar): GrashofClass {
  const links = [
    { k: 'ground', l: m.ground },
    { k: 'crank', l: m.crank },
    { k: 'coupler', l: m.coupler },
    { k: 'rocker', l: m.rocker },
  ].sort((a, b) => a.l - b.l)
  const s = links[0].l + links[3].l
  const pq = links[1].l + links[2].l
  if (Math.abs(s - pq) < 1e-12) return 'change-point'
  if (s > pq) return 'non-grashof'
  if (links[0].k === 'ground') return 'double-crank'
  if (links[0].k === 'crank' || links[0].k === 'rocker') return 'crank-rocker'
  return 'double-rocker'
}
