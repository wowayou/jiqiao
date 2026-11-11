// 锚式擒纵摆钟的真值模型：纯函数 simulate(t, c) → 状态。读数、位姿、协同链点亮都只读这里。
//
// 时间轴：一个周期 = 12 小时（43 200 s），时针恰好转一圈，所有转角在周期处闭合；
// 重锤在周期最后 30 分钟被提回原高（演示上弦），所以重锤高度也闭合。
// 摆：小角度简谐（model）。擒纵：几何求解（kinematics/escapement.ts）——每一时刻由叉角与齿、叉瓦的接触决定轮子转角。
// 走时轮系：全部由擒纵轮转角按齿数比与啮合相位推出（kinematics/gears.ts 的 meshPlanar）。
import { meshPlanar } from '../../kinematics/gears'
import { escapementAt, grahamEscapement, solveEscapement, type EscPhase, type PalletName } from '../../kinematics/escapement'
import { pendulumAngle, pendulumLength } from '../../kinematics/pendulum'
import { rotZ, type Pose } from '../../kinematics/pose'
import { TAU, smoothstep, type Vec2, type Vec3 } from '../../kinematics/vec'
import type { InvoluteSpec } from '../../kinematics/involute'

const deg = (d: number) => (d * Math.PI) / 180

// ———————————— 摆与时间 ————————————

/** 摆的周期（s）：「秒摆」，每摆过一次 1 s。本站设定。 */
export const PENDULUM_PERIOD = 2
/** 摆长（mm）：由周期按单摆公式算出（calc） */
export const PENDULUM_LENGTH = pendulumLength(PENDULUM_PERIOD)
/** 摆幅（rad）：本站设定 */
export const AMPLITUDE = deg(4)
/** 时间轴周期：12 小时 */
export const PERIOD = 12 * 3600
/** 时间轴 t = 0 对应的钟面时间（10:08:30，为了让指针一眼可读）；须为摆周期的整数倍 */
export const CLOCK_OFFSET = 10 * 3600 + 8 * 60 + 30
/** 上弦演示：时间轴最后 WIND 秒内把重锤提回原高 */
export const WIND = 30 * 60

// ———————————— 擒纵 ————————————

export const ESCAPEMENT = grahamEscapement({
  teeth: 30,
  tipR: 45,
  rootR: 38.5,
  span: 7.5,
  lift: deg(2.4),
  lock: deg(0.8),
  lockFace: deg(4.5),
  impulseWheel: deg(4.5),
  palletTail: deg(12),
  tooth: { land: 0.3, rake: deg(14), rootWidth: 3.4 },
})

/** 落的等效角加速度（rad/s²）= 驱动力矩 / 轮系等效转动惯量。本站设定，取值使「落」约 30 ms，慢放可见。 */
export const FREE_ACCEL = 60
export const ESC_STEPS = 2000

export const ESC_SOLUTION = solveEscapement(ESCAPEMENT, {
  anchor: (t) => pendulumAngle(t, AMPLITUDE, PENDULUM_PERIOD),
  period: PENDULUM_PERIOD,
  steps: ESC_STEPS,
  freeAccel: FREE_ACCEL,
  backoff: 2e-4,
  psiGuess: ESCAPEMENT.lockedTipAngle[0] - deg(0.5),
})

// ———————————— 轮系 ————————————

const PINION = { teeth: 8, shift: 0.6, addendum: 0.75 } as const
const WHEEL_SHIFT = -0.6

export interface GearDef {
  spec: InvoluteSpec
}

/** 齿数与模数（本站设定）。小齿轮 8 齿正变位 0.6、齿顶高 0.75 以免根切；配对大轮负变位 0.6，中心距不变。 */
export const GEARS = {
  great: { module: 1.6, teeth: 96, shift: WHEEL_SHIFT, backlash: 0.08 },
  centerPinion: { module: 1.6, ...PINION, backlash: 0.08 },
  center: { module: 1.5, teeth: 64, shift: WHEEL_SHIFT, backlash: 0.08 },
  thirdPinion: { module: 1.5, ...PINION, backlash: 0.08 },
  third: { module: 1.5, teeth: 60, shift: WHEEL_SHIFT, backlash: 0.08 },
  escapePinion: { module: 1.5, ...PINION, backlash: 0.08 },
  cannon: { module: 1.0, teeth: 12, shift: 0.4, addendum: 0.9, backlash: 0.06 },
  minute: { module: 1.0, teeth: 36, shift: -0.4, backlash: 0.06 },
  minutePinion: { module: 1.2, ...PINION, backlash: 0.06 },
  hour: { module: 1.2, teeth: 32, shift: WHEEL_SHIFT, backlash: 0.06 },
} satisfies Record<string, InvoluteSpec>

const cd = (a: InvoluteSpec, b: InvoluteSpec) => (a.module * (a.teeth + b.teeth)) / 2

/** 机芯平面坐标（mm，相对中心轴；x 向右、y 向上） */
export const AXES = (() => {
  const C: Vec2 = [0, 0]
  const E: Vec2 = [0, 92]
  const dCT = cd(GEARS.center, GEARS.thirdPinion)
  const dTE = cd(GEARS.third, GEARS.escapePinion)
  // 三轮：同时到中心轴 dCT、到擒纵轴 dTE，取右侧
  const y = (dCT * dCT - dTE * dTE + E[1] * E[1]) / (2 * E[1])
  const T: Vec2 = [Math.sqrt(dCT * dCT - y * y), y]
  const dGC = cd(GEARS.great, GEARS.centerPinion)
  const G: Vec2 = [dGC * Math.cos(deg(240)), dGC * Math.sin(deg(240))]
  const dCM = cd(GEARS.cannon, GEARS.minute)
  const M: Vec2 = [dCM * Math.cos(deg(-50)), dCM * Math.sin(deg(-50))]
  const P: Vec2 = [E[0] + ESCAPEMENT.pivot[0], E[1] + ESCAPEMENT.pivot[1]]
  return { C, E, T, G, M, P }
})()

/** 机芯在世界中的位置：中心轴的世界坐标。摆锤中心离地约 160 mm。 */
export const ORIGIN: Vec3 = [0, Math.round(160 + PENDULUM_LENGTH - AXES.P[1]), 0]
export const W = (p: Vec2, z: number): Vec3 => [ORIGIN[0] + p[0], ORIGIN[1] + p[1], z]

/** 各零件的 z 层（mm，前为 +）。夹板内侧面在 ±35。 */
export const Z = {
  backPlate: [-40, -35],
  frontPlate: [35, 40],
  great: [-31, -28],
  centerPinion: [-33, -26],
  barrel: [-24, 8],
  escape: [-28, -25],
  pallet: [-29.5, -23.5],
  anchor: [-29, -24],
  center: [12, 15],
  thirdPinion: [10, 17],
  third: [24, 27],
  escapePinion: [22, 29],
  cannon: [42, 46],
  minute: [42.4, 45.4],
  minutePinion: [46, 51.5],
  hour: [47.5, 50.5],
  dial: [58, 60],
  secondHand: [60.6, 61.6],
  hourHand: [63, 64.4],
  minuteHand: [66, 67.4],
  pendulum: [-62, -48],
} as const

/** 绳轮半径（绳心）与重锤行程 */
export const BARREL_R = 34
export const CORD_R = 1.3
export const WEIGHT_DROP = TAU * (BARREL_R + CORD_R)

// ———————————— 状态 ————————————

/** 本展品没有控件（运动全部由时间决定） */
export type ClockControls = Record<string, never>

export interface ClockState {
  t: number
  /** 钟面时间（s，0–43 200） */
  clock: number
  /** 摆角 = 叉角（世界：逆时针为正） */
  pendulum: number
  /** 擒纵轮累计转角（规范坐标，前进为正） */
  psi: number
  phase: EscPhase
  pallet: PalletName
  /** 各轴世界转角（逆时针为正） */
  angle: { escape: number; third: number; center: number; great: number; minute: number; hour: number; barrel: number }
  /** 三根针自 12 点起顺时针转过的角度（rad，[0, 2π)） */
  hands: { second: number; minute: number; hour: number }
  /** 重锤顶面的世界高度（mm）与已下降量 */
  weightY: number
  weightDrop: number
  winding: boolean
  /** 轮系此刻是否在转（冲击或落） */
  moving: boolean
}

/** t = 0 的擒纵轮规范转角：擒纵轮世界转角 = −(psi + ESC0)，擒纵小齿轮在零件里预转 ESC0 以对上相位 */
export const ESC0 = escapementAt(ESC_SOLUTION, 0).psi

/** 擒纵轮累计转角（任意实数时刻，钟面时间 τ） */
const psiCum = (tau: number) => escapementAt(ESC_SOLUTION, tau).psi - ESC0

/** 由擒纵轮（世界转角）推出全部轮系的世界转角。各轮转角 0 时 0 号齿中心朝 +X。 */
export function trainAngles(escape: number) {
  const { C, E, T, G, M } = AXES
  const third = meshPlanar({ z: GEARS.escapePinion.teeth, center: E, angle: escape }, { z: GEARS.third.teeth, center: T })
  const center = meshPlanar({ z: GEARS.thirdPinion.teeth, center: T, angle: third }, { z: GEARS.center.teeth, center: C })
  const great = meshPlanar({ z: GEARS.centerPinion.teeth, center: C, angle: center }, { z: GEARS.great.teeth, center: G })
  const minute = meshPlanar({ z: GEARS.cannon.teeth, center: C, angle: center }, { z: GEARS.minute.teeth, center: M })
  const hour = meshPlanar({ z: GEARS.minutePinion.teeth, center: M, angle: minute }, { z: GEARS.hour.teeth, center: C })
  return { escape, third, center, great, minute, hour }
}

const TRAIN0 = trainAngles(0)

export function simulate(t: number, _c?: ClockControls): ClockState {
  const tt = ((t % PERIOD) + PERIOD) % PERIOD
  const clock = (tt + CLOCK_OFFSET) % PERIOD
  const esc = escapementAt(ESC_SOLUTION, clock)
  const psi = esc.psi - ESC0
  const tr = trainAngles(-psi)
  // 重锤：从时间轴起点算起绳轮放出的角度 = 大轮转过的角度；最后 WIND 秒内把它倒卷回去
  const greatRun = (psiCum(tt + CLOCK_OFFSET) - psiCum(CLOCK_OFFSET)) / 720
  const windU = tt > PERIOD - WIND ? smoothstep((tt - (PERIOD - WIND)) / WIND) : 0
  const barrelRun = greatRun - windU * TAU
  const weightDrop = (BARREL_R + CORD_R) * barrelRun
  const wrap = (a: number) => ((a % TAU) + TAU) % TAU
  return {
    t: tt,
    clock,
    pendulum: -esc.phi,
    psi,
    phase: esc.phase,
    pallet: esc.pallet,
    angle: { ...tr, barrel: tr.great - windU * TAU },
    hands: {
      second: wrap(-(tr.escape - TRAIN0.escape)),
      minute: wrap(-(tr.center - TRAIN0.center)),
      hour: wrap(-(tr.hour - TRAIN0.hour)),
    },
    weightY: WEIGHT_TOP - weightDrop,
    weightDrop,
    winding: windU > 0,
    moving: esc.phase !== 'lock',
  }
}

/** 重锤顶面最高位置（世界 y） */
export const WEIGHT_TOP = W(AXES.G, 0)[1] - 125

// ———————————— 位姿 ————————————

export const spin = (p: Vec2, z: number, a: number): Pose => ({ p: W(p, z), q: rotZ(a) })
