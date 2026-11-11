// 水碓的真值模型：纯函数 simulate(t, c) → 状态。读数、运动、协同链点亮都只读这里。
//
// 坐标：Y 朝上，水轮与横轴沿 Z；碓杆躺在 XY 平面内（各占 Z 方向上的一条「道」）。
// 横轴从 +Z 看顺时针转（右侧向下），所以拨板转到轴右下方时从上面压向碓尾。
// 碓杆是以支点轴为转轴的杠杆：碓尾（靠近横轴一端）被压下 → 碓头（远端）抬起。
//
// 拨板压着碓尾的那段行程，碓杆转角由 kinematics/cam.ts 的接触解析式给出（圆头与碓尾上表面相切）；
// 拨板滑出碓尾末端之后，碓杆按匀角加速度下落，碓头落进臼里即停。碓杆转角只是横轴转角的函数。
import { makeRockerCycle, rockerWithPegs, type RockerGeom, type RockerStage } from '../../kinematics/cam'
import { poseCompose, rotZ, type Pose } from '../../kinematics/pose'
import { TAU, deg, type Vec3 } from '../../kinematics/vec'
import type { WaterwheelOpts } from '../../kit/waterwheel'

/** 配合间隙（mm） */
export const CLEAR = 0.1

/** 全部尺寸为本站设定（mm），原文只说「长可数尺」「高可丈餘」，没有统一尺寸。 */
export const DIM = {
  // 横轴
  shaftY: 1150,
  shaftR: 85,
  shaftZ0: -380,
  shaftZ1: 1840,
  // 水轮
  wheelZ: 0,
  // 拨板：圆头圆心到轴心的距离、圆头半径（板厚 = 2×圆头半径）、板宽（沿 Z）
  pegOrbit: 320,
  pegR: 30,
  pegW: 120,
  // 碓杆
  pivotX: 430,
  pivotY: 840,
  /** 支点到碓尾末端 */
  tail: 360,
  /** 支点到碓杆头端 */
  head: 820,
  /** 碓杆截面半高 / 半宽（沿 Z） */
  beamHalfH: 70,
  beamHalfZ: 55,
  /** 支点轴半径、碓杆孔半径 */
  axleR: 36,
  /** 碓头中线到支点的水平距离 */
  pestleX: 760,
  pestleStemR: 40,
  pestleHeadR: 54,
  pestleHeadLen: 170,
  // 臼
  mortarH: 430,
  mortarR: 195,
  bowlDepth: 140,
  bowlTopR: 172,
  bowlFloorR: 84,
  grainTop: 32,
  // 机架
  bearingW: 340,
  bearingT: 150,
  postW: 140,
  postT: 120,
} as const

/** 每个碓占一条「道」：碓杆、拨板、碓头、臼都在这条道的 Z 位置上 */
export const LANES = [640, 1020, 1400] as const
export const N_LEVERS = LANES.length
/** 轴承座 Z 位置：水轮外侧、水轮与碓之间、碓之外 */
export const BEARING_Z = [-290, 300, 1750] as const
/** 支点架两根立柱的 Z 位置 */
export const POST_Z = [480, 1560] as const

/**
 * 每个碓有两块拨板，在横轴上相隔 180°；三个碓依次错开 60°，
 * 所以横轴每转一圈，三个碓轮流各起落两次，每隔 60° 就有一下。角度为拨板在横轴局部坐标里的方向。
 */
export const PEG_BETA: readonly (readonly number[])[] = LANES.map((_, k) => [deg(60 * k), deg(60 * k + 180)])
export const PEGS_PER_LEVER = PEG_BETA[0].length
export const N_PEGS = N_LEVERS * PEGS_PER_LEVER

/** 水轮转一周的时间（s）：约 6 转/分，本站设定。 */
export const PERIOD = 10
export const OMEGA = TAU / PERIOD
/** 脱开后碓杆下落的角加速度（rad/s²），本站设定。 */
export const FALL_ACCEL = 14
/** 落进臼里之后多少秒内算「正在砸」（用于点亮协同链），本站设定。 */
export const STRIKE_FLASH = 0.5

export const WHEEL: WaterwheelOpts = {
  outerR: 900,
  rimW: 70,
  rimT: 40,
  width: 360,
  hubR: 140,
  bore: DIM.shaftR + 1,
  spokes: 8,
  spokeW: 70,
  blades: 14,
  bladeDepth: 100,
  bladeT: 26,
}

/** 圆头与碓尾上表面相切；圆头半径多算一个配合间隙，所以画面里留 0.1 mm 缝。 */
export const GEOM: RockerGeom = {
  pivot: [DIM.pivotX, DIM.pivotY],
  axis: [0, DIM.shaftY],
  orbit: DIM.pegOrbit,
  noseR: DIM.pegR + CLEAR,
  face: DIM.beamHalfH,
  tailMin: -DIM.tail,
  tailMax: 0,
}

/** 水轮顺时针转（从 +Z 看），拨板方向角随转角递减。 */
export const CYCLE = makeRockerCycle(GEOM, { dir: -1, omega: OMEGA, accel: FALL_ACCEL })

// —— 臼与碓头 ——
export const MORTAR_X = DIM.pivotX + DIM.pestleX
export const BOWL_FLOOR_Y = DIM.mortarH - DIM.bowlDepth
export const GRAIN_TOP_Y = BOWL_FLOOR_Y + DIM.grainTop
/** 碓头最低点到碓杆中线的距离：落到位时刚好停在谷粒面上方 2 mm */
export const PESTLE_DROP = DIM.pivotY - (GRAIN_TOP_Y + 2)

/** 碓头最低点相对静止位置抬起的高度（mm）：碓头绕支点转 φ。 */
export const headLift = (phi: number) => DIM.pestleX * Math.sin(phi) + PESTLE_DROP * (1 - Math.cos(phi))

export type LeverStage = 'push' | 'fall' | 'strike' | 'idle'

export interface LeverState {
  /** push 压尾抬头 / fall 脱开下落 / strike 刚砸进臼里 / idle 静候 */
  stage: LeverStage
  /** 碓杆转角 φ（rad），0 = 碓头落在臼里 */
  phi: number
  /** 碓杆角速度（rad/s） */
  dphi: number
  /** 正在作用（或最近作用）的是第几块拨板 */
  peg: number
  /** 碓头抬起高度（mm） */
  lift: number
  /** 压着时：接触点在碓尾上离支点多远（mm，负值 = 在碓尾一侧）；否则 null */
  contactX: number | null
}

export interface DuiState {
  t: number
  /** 水轮 / 横轴转角（rad，[0, 2π)，顺时针为正） */
  theta: number
  omega: number
  levers: LeverState[]
  showWater: boolean
}

export interface DuiControls {
  /** 显示水流示意 */
  water: boolean
}

const STAGE_OF: Record<RockerStage, LeverStage> = { push: 'push', fall: 'fall', rest: 'idle' }

export function simulate(t: number, c: DuiControls): DuiState {
  const theta = (((t * OMEGA) % TAU) + TAU) % TAU
  const levers = LANES.map((_, k): LeverState => {
    const r = rockerWithPegs(CYCLE, -theta, PEG_BETA[k])
    const stage: LeverStage = r.stage === 'rest' && r.sinceLanding !== null && r.sinceLanding < STRIKE_FLASH ? 'strike' : STAGE_OF[r.stage]
    return { stage, phi: r.phi, dphi: r.dphi, peg: r.peg, lift: headLift(r.phi), contactX: r.contactX }
  })
  return { t, theta, omega: OMEGA, levers, showWater: c.water }
}

/** 每分钟舂击次数：每块拨板每转一圈让碓头落一次（由 PEGS 的数量与周期得到，测试里用数值计数核对）。 */
export const strikesPerMinute = (pegs = N_PEGS, period = PERIOD) => (pegs * 60) / period

// —— 位姿（parts.ts 用） ——

export const shaftPose = (s: DuiState): Pose => ({ p: [0, DIM.shaftY, 0], q: rotZ(-s.theta) })
export const wheelPose = (s: DuiState): Pose => ({ p: [0, DIM.shaftY, DIM.wheelZ], q: rotZ(-s.theta) })
export const pegPose = (k: number, j: number, s: DuiState): Pose => ({
  p: [0, DIM.shaftY, LANES[k]],
  q: rotZ(PEG_BETA[k][j] - s.theta),
})
export const leverPose = (k: number, s: DuiState): Pose => ({
  p: [DIM.pivotX, DIM.pivotY, LANES[k]],
  q: rotZ(s.levers[k].phi),
})
export const pestlePose = (k: number, s: DuiState): Pose => poseCompose(leverPose(k, s), { p: [DIM.pestleX, 0, 0] })
export const leverRest = (k: number): Pose => ({ p: [DIM.pivotX, DIM.pivotY, LANES[k]] })
export const pestleRest = (k: number): Pose => ({ p: [MORTAR_X, DIM.pivotY, LANES[k]] })

export const lanePos = (k: number, x: number, y: number): Vec3 => [x, y, LANES[k]]
