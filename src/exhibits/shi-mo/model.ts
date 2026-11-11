// 石磨的真值模型：纯函数 simulate(t, c) → 状态。读数、运动、协同链点亮都只读这里。
//
// 机构：推杆 + 磨拐 = 曲柄滑块「反过来用」。人手（滑块）沿 X 往复，推杆（连杆）推动磨拐（曲柄销），
// 上扇（曲柄）连续转动。推杆与磨拐共线时力臂为 0（死点），此刻靠上扇的惯性转过去。
// 本模型取上扇匀速转动（理想化：惯性足够大），人手的往复运动由几何反推。
import { crankSlider, type CrankSliderState } from '../../kinematics/linkage'
import { rotY, type Pose } from '../../kinematics/pose'
import { TAU, clamp, v2, type Vec2, type Vec3 } from '../../kinematics/vec'

/** 全部尺寸为本站设定（mm），原文未给任何尺寸。 */
export const DIM = {
  standHeight: 520,
  standWidth: 840,
  trayR: 490,
  trayRim: 50,
  trayFloor: 60,
  trayHeight: 130,
  stoneR: 300,
  lowerT: 130,
  upperT: 150,
  /** 上下扇之间的研磨间隙 */
  gap: 2,
  spindleR: 15,
  spindleLen: 112,
  /** 磨眼：上扇局部平面坐标 */
  eyeR: 28,
  eyeAt: [-110, 0] as Vec2,
  dishR: 240,
  dishDepth: 18,
  hollowR: 130,
  hollowDepth: 12,
  /** 磨拐销（竖直木橛）到磨心的距离 = 曲柄半径 */
  crankR: 360,
  /** 推杆长：磨拐销到手柄横把 */
  rodLen: 1200,
  /** 推杆高度：上扇局部坐标 */
  rodLocalY: 195,
  rodR: 20,
  grainR: 10,
} as const

export const Y = {
  trayBase: DIM.standHeight,
  trayFloorTop: DIM.standHeight + DIM.trayFloor,
  lowerBase: DIM.standHeight + DIM.trayFloor,
  lowerTop: DIM.standHeight + DIM.trayFloor + DIM.lowerT,
  upperBase: DIM.standHeight + DIM.trayFloor + DIM.lowerT + DIM.gap,
  get upperTop() {
    return this.upperBase + DIM.upperT
  },
  get rod() {
    return this.upperBase + DIM.rodLocalY
  },
  get gapMid() {
    return this.lowerTop + DIM.gap / 2
  },
}

/** 上扇转一圈的时间（s）。约 15 转/分，本站设定。 */
export const PERIOD = 4
/** 力臂小于曲柄半径的这一比例时，判为「越过死点」阶段（本站设定，用于点亮协同链）。 */
export const DEAD_ARM_RATIO = 0.3
export const GRAIN_COUNT = 12

export interface MillControls {
  /** 显示粮粒 */
  grain: boolean
}

export type GrainStage = 'wait' | 'eye' | 'gap' | 'drop'

export interface GrainState {
  stage: GrainStage
  /** 世界坐标 */
  pos: Vec3
  /** 本粒在一次行程中的进度 [0,1) */
  phase: number
}

export type Phase = 'push' | 'pull' | 'dead'

export interface MillState {
  t: number
  /** 上扇转角（rad，[0, 2π)），绕 +Y */
  theta: number
  omega: number
  crank: CrankSliderState
  /** 手柄处（推杆末端）沿 X 的速度，mm/s；负值 = 往磨推 */
  handVel: number
  phase: Phase
  /** 最近的死点：'far' 推到头（磨拐在远侧），'near' 拉到头（磨拐在人这一侧） */
  deadPoint: 'far' | 'near' | null
  grains: GrainState[]
  /** 示踪粒（0 号）的阶段，驱动协同链后三环 */
  tracer: GrainStage
  showGrain: boolean
}

const LINK = { r: DIM.crankR, l: DIM.rodLen }

/** 平面 (u, v) = (x, −z) → 世界 */
export const planToWorld = (p: Vec2, y: number): Vec3 => [p[0], y, -p[1]]

/** 粮粒一次行程的阶段划分（占上扇一圈的比例）。本站设定。 */
export const GRAIN_STAGES = { wait: 0.12, eye: 0.27, gap: 0.85 } as const

function grainAt(phase: number, theta: number): GrainState {
  const g = DIM.grainR
  const eyeAng = Math.atan2(DIM.eyeAt[1], DIM.eyeAt[0])
  const eyeDist = v2.len(DIM.eyeAt)
  // 本粒进入当前阶段时上扇已转过的角度，用于让粮粒「跟着上扇走」
  const thetaAt = (ph: number) => theta - (phase - ph) * TAU
  if (phase < GRAIN_STAGES.wait) {
    // 在上扇顶面浅盘里，向磨眼滑去，随上扇转动
    const u = phase / GRAIN_STAGES.wait
    const r = eyeDist - 60 * (1 - u)
    const p = v2.polar(r, eyeAng + theta)
    return { stage: 'wait', phase, pos: planToWorld(p, Y.upperTop - DIM.dishDepth + g) }
  }
  if (phase < GRAIN_STAGES.eye) {
    const u = (phase - GRAIN_STAGES.wait) / (GRAIN_STAGES.eye - GRAIN_STAGES.wait)
    const p = v2.polar(eyeDist, eyeAng + theta)
    const y0 = Y.upperTop - DIM.dishDepth + g
    const y1 = Y.gapMid
    return { stage: 'eye', phase, pos: planToWorld(p, y0 + (y1 - y0) * u * u) }
  }
  if (phase < GRAIN_STAGES.gap) {
    // 两扇之间：被上扇拖着走（角速度取上扇的一半），同时被磨齿赶向边缘
    const u = (phase - GRAIN_STAGES.eye) / (GRAIN_STAGES.gap - GRAIN_STAGES.eye)
    const th0 = thetaAt(GRAIN_STAGES.eye)
    const ang = eyeAng + th0 + 0.5 * (theta - th0)
    const r = eyeDist + (DIM.stoneR + 4 - eyeDist) * u
    return { stage: 'gap', phase, pos: planToWorld(v2.polar(r, ang), Y.gapMid) }
  }
  // 从边缘落入磨盘
  const u = (phase - GRAIN_STAGES.gap) / (1 - GRAIN_STAGES.gap)
  const th0 = thetaAt(GRAIN_STAGES.eye)
  const th1 = thetaAt(GRAIN_STAGES.gap)
  const ang = eyeAng + th0 + 0.5 * (th1 - th0)
  const r = DIM.stoneR + 4 + 70 * u
  const y = Y.gapMid + (Y.trayFloorTop + g - Y.gapMid) * Math.min(1, u * 1.6) ** 2
  return { stage: 'drop', phase, pos: planToWorld(v2.polar(r, ang), y) }
}

export function simulate(t: number, c: MillControls): MillState {
  const omega = TAU / PERIOD
  const theta = (((t * omega) % TAU) + TAU) % TAU
  const crank = crankSlider(LINK, theta)
  const handVel = crank.dxdTheta * omega
  const dead = crank.arm < DEAD_ARM_RATIO * DIM.crankR
  const phase: Phase = dead ? 'dead' : handVel < 0 ? 'push' : 'pull'
  const deadPoint = dead ? (Math.cos(theta) > 0 ? 'near' : 'far') : null
  const rev = theta / TAU
  const grains = Array.from({ length: GRAIN_COUNT }, (_, i) => {
    const ph = (rev + i / GRAIN_COUNT) % 1
    return grainAt(ph, theta)
  })
  return { t, theta, omega, crank, handVel, phase, deadPoint, grains, tracer: grains[0].stage, showGrain: c.grain }
}

// —— 位姿（parts.ts 用） ——

export const upperPose = (s: MillState): Pose => ({ p: [0, Y.upperBase, 0], q: rotY(s.theta) })

export const rodPose = (s: MillState): Pose => ({
  p: planToWorld(s.crank.pin, Y.rod),
  q: rotY(s.crank.rodAngle),
})

export const grainPose = (s: MillState, i: number): Pose => ({ p: s.grains[i].pos })

/** 力臂占曲柄半径的比例 [0,1] */
export const armRatio = (s: MillState) => clamp(s.crank.arm / DIM.crankR, 0, 1)
