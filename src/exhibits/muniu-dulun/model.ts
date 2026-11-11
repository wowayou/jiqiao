// 木牛流马 · 独轮车说的真值模型：纯函数 simulate(t, c) → 状态。读数、运动、协同链点亮都只读这里。
//
// 这是一种复原假说，不是史实：全部尺寸、重量、节奏都是本站设定（见 content.ts）。
//
// 坐标：Y 朝上，车头朝 +X，车把朝 −X，轮轴沿 Z。局部坐标原点 = 轮轴中心。
// 车架绕轮轴转：正角度（绕 +Z 逆时针）= 车尾（−X）往下沉，所以停车时 β = BETA0 > 0，推行时 β = 0（车架水平）。
// 车是杠杆：轮轴是支点；货物的重力在轴后 d 处，人手在车把末端向上抬。
//
// 一个周期（PERIOD 秒，循环）：停车 → 加力（人手渐渐抬起，支脚渐渐卸载）→ 抬平（车把抬起、支脚离地）
// → 推行（车轮正好滚一整圈）→ 放把（车把放下）→ 卸力（支脚重新承重，人手松开）。
import { rotZ, poseApply, poseCompose, type Pose } from '../../kinematics/pose'
import { TAU, deg, type Vec3 } from '../../kinematics/vec'

/** 配合间隙（mm） */
export const CLEAR = 0.1

// —— 车轮与地面 ——
export const WHEEL_R = 360
/** 轮底离地 0.2 mm（地面顶面在 y = 0） */
export const AXLE_Y = WHEEL_R + 0.2
export const WHEEL = { rimT: 36, rimHalfW: 40, hubR: 58, hubHalfW: 55, bore: 24.5, barW: 34, barT: 30 } as const
export const AXLE_R = 22
/** 轮轴半长：两端止于纵梁外侧的盲孔里 */
export const AXLE_HALF = 150

// —— 车架（局部坐标：x 向前，原点在轮轴） ——
export const FRAME = {
  rearX: -900,
  frontX: 450,
  railH: 40, // 纵梁截面半高
  zi: 90, // 纵梁内侧面
  zo: 160, // 纵梁外侧面
  zc: 125, // 纵梁中线
  shelfZ1: 480,
  shelfX0: -890,
  shelfX1: 330,
  holeR: 23.5,
  mortiseHalf: 22.2,
  tenonHalf: 22,
} as const

/** 车把：从纵梁后端起翘到握持处 */
export const GRIP: readonly [number, number] = [-1380, 220]
export const HANDLE_START_X = -916
export const FRONT_END_X = 1250

// —— 货物 / 重量（本站设定） ——
export const SACK = { a: 250, b: 150, c: 130, base: 110, z: 320 } as const
/** 粮袋重心（车架局部）高度：压在货板顶面（y = 40）上 */
export const SACK_Y = FRAME.railH + CLEAR * 2 + SACK.base
/** 两个粮袋合计 */
export const CARGO_KG = 80
/** 车自重，及其重心在轴后多远（局部 x = −SELF_ARM） */
export const SELF_KG = 30
export const SELF_ARM = 300
export const TOTAL_KG = CARGO_KG + SELF_KG
/** 货物位置控件的范围：货物中心在轴后多远（mm） */
export const D_MIN = 0
export const D_MAX = 600
export const D_DEFAULT = 400

// —— 支脚 ——
export const BETA0 = deg(9)
export const LEG = { halfW: 25, localX: -760, tieLow: 90, tieHigh: 140 } as const
/** 停车时支脚底面离地 0.3 mm */
export const LEG_GAP = 0.3
const attach = ((): { x: number; y: number } => {
  const x = LEG.localX
  const y = -(FRAME.railH + 0.2)
  return { x: x * Math.cos(BETA0) - y * Math.sin(BETA0), y: x * Math.sin(BETA0) + y * Math.cos(BETA0) }
})()
/** 停车时支脚中心相对轮轴的水平位置（负 = 在轴后） */
export const LEG_XW = attach.x
export const LEG_ARM = -LEG_XW

// —— 地面标记 ——
/** 推行一圈的距离 = 轮周长；标记间距取轮周长的 1/6，所以一圈后标记图案正好重合 */
export const CIRC = TAU * WHEEL_R
export const MARK_P = CIRC / 6
export const MARK_K = 4
export const GROUND_HALF = MARK_K * MARK_P
export const MARK = { halfW: 20, h: 14, z0: 210, z1: 480 } as const
export const N_MARKS = 2 * MARK_K + 2

// —— 节奏 ——
export const PERIOD = 18
export const PHASE = {
  park: [0, 2],
  load: [2, 4],
  raise: [4, 6],
  push: [6, 14],
  lower: [14, 16],
  unload: [16, 18],
} as const

export type Stage = keyof typeof PHASE

export interface DulunControls {
  /** 货物中心在轮轴后多远（mm） */
  cargoD: number
}

export interface DulunState {
  t: number
  stage: Stage
  /** 车架俯仰角 β（rad），BETA0 = 停车，0 = 水平 */
  beta: number
  /** 人手托起程度 λ ∈ [0,1]：0 = 全靠支脚，1 = 支脚已不受力 */
  lam: number
  /** 推行距离（mm），0 … CIRC */
  s: number
  /** 车轮转角（rad）= s / 轮半径 */
  theta: number
  /** 货物离轴（控件值） */
  d: number
  /** 货 / 车自重 / 手 到轮轴的水平力臂（mm） */
  armCargo: number
  armSelf: number
  armHand: number
  /** 货与车自重对轮轴的力矩（kg·mm） */
  moment: number
  handKg: number
  legKg: number
  wheelKg: number
  /** 省力比 = 总重 ÷ 人手承担；人手不受力时为 null */
  ratio: number | null
}

export const smootherstep = (u: number) => {
  const x = Math.min(1, Math.max(0, u))
  return x * x * x * (x * (x * 6 - 15) + 10)
}

/** 局部点 (x, y) 在车架俯仰 β 时，到轮轴的水平距离（轴后为正）。 */
export const armOf = (x: number, y: number, beta: number) => -(x * Math.cos(beta) - y * Math.sin(beta))

/** 受力：转矩平衡 + 竖向平衡。λ = 人手托起程度；λ < 1 时支脚还在地上（β 必为 BETA0）。 */
export function loads(beta: number, d: number, lam: number) {
  const armCargo = armOf(-d, SACK_Y, beta)
  const armSelf = armOf(-SELF_ARM, 0, beta)
  const armHand = armOf(GRIP[0], GRIP[1], beta)
  const moment = CARGO_KG * armCargo + SELF_KG * armSelf
  const handKg = (lam * moment) / armHand
  const legKg = ((1 - lam) * moment) / LEG_ARM
  const wheelKg = TOTAL_KG - handKg - legKg
  return { armCargo, armSelf, armHand, moment, handKg, legKg, wheelKg }
}

export const stageAt = (tt: number): Stage => {
  for (const k of Object.keys(PHASE) as Stage[]) if (tt >= PHASE[k][0] && tt < PHASE[k][1]) return k
  return 'unload'
}

export function simulate(t: number, c: DulunControls): DulunState {
  const tt = ((t % PERIOD) + PERIOD) % PERIOD
  const stage = stageAt(tt)
  const u = (k: Stage) => (tt - PHASE[k][0]) / (PHASE[k][1] - PHASE[k][0])
  let beta = BETA0
  let lam = 0
  let s = 0
  switch (stage) {
    case 'park':
      break
    case 'load':
      lam = smootherstep(u('load'))
      break
    case 'raise':
      lam = 1
      beta = BETA0 * (1 - smootherstep(u('raise')))
      break
    case 'push':
      lam = 1
      beta = 0
      s = CIRC * smootherstep(u('push'))
      break
    case 'lower':
      lam = 1
      beta = BETA0 * smootherstep(u('lower'))
      s = CIRC
      break
    case 'unload':
      lam = 1 - smootherstep(u('unload'))
      s = CIRC
      break
  }
  const d = Math.min(D_MAX, Math.max(D_MIN, c.cargoD))
  const L = loads(beta, d, lam)
  return {
    t: tt,
    stage,
    beta,
    lam,
    s,
    theta: s / WHEEL_R,
    d,
    ...L,
    ratio: L.handKg > 0.05 ? TOTAL_KG / L.handKg : null,
  }
}

// —— 位姿 ——

/** 车架（及固定在它上面的零件）的位姿：绕轮轴转 β。 */
export const framePose = (s: DulunState): Pose => ({ p: [0, AXLE_Y, 0], q: rotZ(s.beta) })
export const frameRest: Pose = { p: [0, AXLE_Y, 0], q: rotZ(BETA0) }
export const wheelPose = (s: DulunState): Pose => ({ p: [0, AXLE_Y, 0], q: rotZ(-s.theta) })
export const axlePose: Pose = { p: [0, AXLE_Y, 0] }

/** 粮袋在车架局部的位置（copy 0 在 +z 侧，copy 1 在 −z 侧） */
export const sackLocal = (d: number, copy: number): Vec3 => [-d, SACK_Y, copy === 0 ? SACK.z : -SACK.z]
export const sackPose = (s: DulunState, copy: number): Pose => poseCompose(framePose(s), { p: sackLocal(s.d, copy) })
export const sackRest = (d = D_DEFAULT): Pose => poseCompose(frameRest, { p: sackLocal(d, 0) })

/** 握持处（车把末端，车架局部） */
export const gripLocal = (copy: number): Vec3 => [GRIP[0], GRIP[1], copy === 0 ? FRAME.zc : -FRAME.zc]
export const gripWorld = (s: DulunState, copy: number): Vec3 => poseApply(framePose(s), gripLocal(copy))

/** 地面标记：当前这一帧里车往前走了 s，标记相对车往后退 s（周期上取模，间距 = 轮周长/6，所以一圈闭合）。 */
export const markShift = (s: number) => {
  const m = ((s % MARK_P) + MARK_P) % MARK_P
  return MARK_P - m < 1e-6 ? 0 : m
}
export const markX = (s: DulunState, i: number) => (i - MARK_K) * MARK_P - markShift(s.s)
export const markVisible = (s: DulunState, i: number) => Math.abs(markX(s, i)) <= GROUND_HALF - 30
