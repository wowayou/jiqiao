// 记里鼓车的真值模型：纯函数 simulate(t, c) → 状态。读数、运动、协同链点亮都只读这里。
//
// 传动链（卢道隆，天圣五年；同轴关系按文意推定）：
//   足轮 = 立轮（18 齿，附于左足）→ 下平轮（54）＝ 立贯心轴 ＝ 铜旋风轮（3）→ 中平轮（100）＝ 小平轮（10）→ 上平轮（100）
// 一级、三级：销齿按齿数比匀速转（非共轭齿形，靠齿隙不穿模，测试逐相位量间隙）。
// 二级：三齿拨百齿，恒定速比必然穿模，改由几何接触求中平轮转角——「一拨一停」（kinematics/pegGear.ts）。
//
// 坐标：Y 朝上，mm。车头朝 +X，左侧为 −Z。车原地不动，车轮转、地面刻线后移。
// 时间：1× 时足轮每 T_F 秒转一周。周期取 3000 周（30 里），见 PERIOD 的说明。
import { restOnProfile, solveArmPinDrive } from '../../kinematics/pegGear'
import { quatMul, rotX, rotY, rotZ, type Pose } from '../../kinematics/pose'
import { TAU, type Vec2, type Vec3 } from '../../kinematics/vec'
import { rimCamProfile, type RimCamOpts } from '../../kit/pegGear'

// —— 原文数字（单位：宋尺；「少半」= 三分之一）——
export const TEXT = {
  foot: { d: 6, c: 18 },
  /** 一周行地三步；古法六尺为步、三百步为里；今法五尺为步、三百六十步为里 */
  stepsPerRev: 3,
  oldStep: 6,
  oldStepsPerLi: 300,
  newStep: 5,
  newStepsPerLi: 360,
  li: { d: 1.38, c: 4.14, z: 18, pitch: 0.23 },
  xia: { d: 4.14, c: 12.42, z: 54, pitch: 0.23 },
  xuan: { z: 3, pitch: 0.12 },
  zhong: { d: 4, c: 12, z: 100, pitch: 0.12 },
  xiao: { d: 1 / 3, c: 1, z: 10, pitch: 0.15 },
  shang: { d: 10 / 3, c: 10, z: 100, pitch: 0.15 },
  totalTeeth: 285,
  wheels: 8,
} as const

/** 1 宋尺折合的毫米数：原文未给，本站设定。 */
export const CHI_MM = 310
const mm = (chi: number) => chi * CHI_MM

/** 节圆半径：照录原文的「径」（mm）。旋风轮原文无径，取 3 × 中平轮齿距 / 2π。 */
export const R = {
  wheel: mm(TEXT.foot.d) / 2,
  li: mm(TEXT.li.d) / 2,
  xia: mm(TEXT.xia.d) / 2,
  zhong: mm(TEXT.zhong.d) / 2,
  xiao: mm(TEXT.xiao.d) / 2,
  shang: mm(TEXT.shang.d) / 2,
  get xuan() {
    return (this.zhong * TEXT.xuan.z) / TEXT.zhong.z
  },
}

/** 节圆上的真实齿距（mm）：2πr / z */
export const pitchOf = (r: number, z: number) => (TAU * r) / z

// —— 时间 ——
/** 1× 时足轮转一周的秒数（本站设定；车速 ≈ 5.84 m / 2 s ≈ 10.5 km/h）。 */
export const T_F = 2
/**
 * 时间轴周期 = 足轮 3000 周（30 里）。上平轮闭合只要 1000 周，但下平轮与旋风轮转速为足轮的 1/3，
 * 1000 周时它们转了 333⅓ 周，不闭合；3000 周是全部轮子转整数周的最小公倍数。
 */
export const PERIOD_REVS = 3000
export const PERIOD = PERIOD_REVS * T_F

// —— 布局（全部为本站设定） ——
export const Y0 = R.wheel + 0.5 // 车轴高；车轮底离地 0.5 mm
export const Z_WHEEL = 1000 // 左右轮中心面
export const Z_LI = -860 // 立轮所在竖直面（左轮内侧）
export const Y_P = Y0 + R.li // 立轮与下平轮的节点高度

/** 平面图坐标 (u, v) = (x, −z) */
export const toPlan = (x: number, z: number): Vec2 => [x, -z]
export const fromPlan = (p: Vec2, y: number): Vec3 => [p[0], y, -p[1]]

/** 各竖轴的世界 (x, z) */
export const S_XZ: Vec2 = [0, Z_LI + R.xia]
const D2 = R.xuan + R.zhong
const O2_Z = 275
export const O2_XZ: Vec2 = [S_XZ[0] - Math.sqrt(D2 ** 2 - (O2_Z - S_XZ[1]) ** 2), O2_Z]
const D3 = R.xiao + R.shang
const O3_Z = -290
export const O3_XZ: Vec2 = [O2_XZ[0] + Math.sqrt(D3 ** 2 - (O3_Z - O2_XZ[1]) ** 2), O3_Z]

/** 各层高度（mm） */
export const H = {
  floor: [1000, 1040],
  xiaPinBottom: Y_P - 17,
  xiaRim: [Y_P + 26, Y_P + 56],
  xiaHub: [1160, 1210],
  bars: [1214, 1229],
  zhongShaftBottom: Y_P + 59,
  guanTop: 1234,
  xuanHub: [1234.3, 1258],
  xuanArm: [1238, 1254],
  zhongPinBottom: 1236,
  zhongRim: [1262, 1292],
  zhongHub: [1262, 1300],
  xiaoDisc: [1305, 1318],
  xiaoPinTop: 1352,
  shangPinBottom: 1324,
  shangRim: [1358, 1388],
  shangHub: [1358, 1400],
  shangShaft: [1327, 1515],
  zhongShaftTop: 1455,
  deck1: [1460, 1490],
  deck2: [2040, 2070],
} as const

export const GEAR = {
  li: { pegR: 9, pegIn: R.li - 24, pegOut: R.li + 20, rimIn: R.li - 62, rimOut: R.li - 20, halfT: 12 },
  xia: { pinR: 9, rimIn: R.xia - 42, rimOut: R.xia + 13 },
  xuan: { armR: 4, rootR: 8, tipR: 24, hubR: 10 },
  zhong: { pinR: 5, rimIn: R.zhong - 50, rimOut: R.zhong + 8 },
  xiao: { pinR: 6, discR: R.xiao + 7 },
  shang: { pinR: 5, rimIn: R.shang - 36, rimOut: R.shang + 7 },
} as const

/** 恒定速比两级的装配相位（齿距的分数），由间隙测试校核：驱动侧最小间隙约 1.5 mm。 */
export const PHASE = { li: 0.18, xiao: 0.12 } as const

// —— 二级：三齿旋风轮拨百齿中平轮 ——
export const DRIVE = solveArmPinDrive({
  arms: TEXT.xuan.z,
  pins: TEXT.zhong.z,
  center: D2,
  pinCircleR: R.zhong,
  pinR: GEAR.zhong.pinR,
  armR: GEAR.xuan.armR,
  rootR: GEAR.xuan.rootR,
  tipR: GEAR.xuan.tipR,
})
/** 标准坐标系（旋风轮在原点、逆时针）到世界平面图的换算：世界 = S + Rot(γ2)·镜像(标准)。旋风轮实际顺时针转。 */
export const GAMMA2 = Math.atan2(toPlan(...O2_XZ)[1] - toPlan(...S_XZ)[1], toPlan(...O2_XZ)[0] - toPlan(...S_XZ)[0])
export const GAMMA3 = Math.atan2(toPlan(...O3_XZ)[1] - toPlan(...O2_XZ)[1], toPlan(...O3_XZ)[0] - toPlan(...O2_XZ)[0])
/** 击鼓的释放发生在中平轮推程的这一比例处（本站设定，须在 (0,1) 内）。 */
const F_RELEASE = 0.6
/** 足轮 N = 0 时旋风轮在标准坐标系里的转角：使 N = 100k 恰为击鼓释放的瞬间 */
const PHI0 = DRIVE.phiAt(F_RELEASE)
const TAU_Z = TAU / TEXT.zhong.z

// —— 拨子（斜坡凸轮）与提杆、木人槌臂（本站设定） ——
export interface StrikerCfg {
  id: 'lower' | 'upper'
  /** 提杆在哪个轮缘上：半径（圆脚中心）、平面角 */
  footR: number
  footA: number
  /** 轮心 (x, z) 与轮缘顶面高度 */
  wheelXZ: Vec2
  rimTop: number
  /** 轮的转向：+1 逆时针（俯视），−1 顺时针 */
  sense: 1 | -1
  /** 斜坡跨的平面角、升程 */
  span: number
  lift: number
  /** 提杆圆脚半径（脚轴沿径向）与径向半长 */
  footRad: number
  footHalf: number
  /** 木人：击打方向（世界 x, z 单位向量）、肩轴高度、提杆到肩轴的水平距、木人身体在臂平面哪一侧 */
  dir: Vec2
  pivotY: number
  rodOffset: number
  bodySide: 1 | -1
  /** 每隔多少周足轮击一次 */
  everyRevs: number
}

export const ARM = {
  /** 槌臂：肩轴在原点，沿 +x；上下半厚 12（下沿离轴 12），侧向半厚 7 */
  half: 12,
  side: 7,
  len: 260,
  rear: 14,
  holeR: 6.5,
  pinR: 6,
  /** 槌头：圆柱，轴垂直于臂，下端面到臂轴线 67 */
  headR: 20,
  headDrop: 67,
  /** 提杆：杆半径与杆顶圆头半径 */
  rodR: 8,
  tipR: 8,
  /** 静止（槌落在鼓面上）时的臂角 */
  restAngle: (-8 * Math.PI) / 180,
} as const

const rodXZ = (c: StrikerCfg): Vec2 => {
  const [u, v] = [Math.cos(c.footA), Math.sin(c.footA)]
  const p = toPlan(...c.wheelXZ)
  return [p[0] + c.footR * u, -(p[1] + c.footR * v)]
}

export const STRIKERS: Record<'lower' | 'upper', StrikerCfg> = {
  lower: {
    id: 'lower',
    footR: 600,
    footA: (-30 * Math.PI) / 180,
    wheelXZ: O2_XZ,
    rimTop: H.zhongRim[1],
    sense: 1,
    span: (36 * Math.PI) / 180,
    lift: 28,
    footRad: 5,
    footHalf: 8,
    dir: [1, 0],
    pivotY: H.deck1[1] + 300,
    rodOffset: 120,
    bodySide: -1,
    everyRevs: 100,
  },
  upper: {
    id: 'upper',
    footR: 505,
    footA: Math.PI / 2,
    wheelXZ: O3_XZ,
    rimTop: H.shangRim[1],
    sense: -1,
    span: (36 * Math.PI) / 180,
    lift: 22,
    footRad: 3,
    footHalf: 8,
    dir: [1, 0],
    pivotY: H.deck2[1] + 300,
    rodOffset: 120,
    bodySide: 1,
    everyRevs: 1000,
  },
}

export const FOOT_CLEAR = 0.3
const G = 9810

/** 每个击打件的推导几何：提杆位置、杆长、肩轴位置、鼓/鐲面高度、凸轮在轮上的安装角 */
export interface StrikerGeo {
  cfg: StrikerCfg
  rod: Vec2
  pivot: Vec3
  /** 臂朝向：rotY(heading) 把局部 +X 转到 dir */
  heading: number
  rodLen: number
  /** 提杆处于最低（圆脚落在轮缘上）时的杆顶圆心高度 */
  rodTopRest: number
  /** 被击面（鼓皮/鐲顶）高度与水平位置 */
  faceY: number
  faceXZ: Vec2
  cam: RimCamOpts
  profile: [number, number][]
  /** 足轮转到释放时（N ≡ 0）圆脚离坡底的弧长 */
  sRelease: number
  liftRelease: number
}

/** 臂角 α：杆顶圆头（半径 tipR）顶住臂下沿（离轴 half） */
export function armAngle(dx: number, dy: number): number {
  const Rr = Math.hypot(dx, dy)
  return Math.atan2(dy, dx) + Math.asin((ARM.tipR + ARM.half) / Rr)
}

/** 槌头下端面在臂角 α 时相对肩轴的 (水平, 竖直) 坐标与最低点 */
export function headBottom(alpha: number): { u: number; y: number; low: number } {
  const [c, s] = [Math.cos(alpha), Math.sin(alpha)]
  const u = ARM.len * c + ARM.headDrop * s
  const y = ARM.len * s - ARM.headDrop * c
  return { u, y, low: y - ARM.headR * Math.abs(s) }
}

function strikerGeo(c: StrikerCfg, wheelAngleAtRelease: number): StrikerGeo {
  const rod = rodXZ(c)
  const pivotXZ: Vec2 = [rod[0] - c.dir[0] * c.rodOffset, rod[1] - c.dir[1] * c.rodOffset]
  const pivot: Vec3 = [pivotXZ[0], c.pivotY, pivotXZ[1]]
  const heading = Math.atan2(-c.dir[1], c.dir[0])
  // 静止臂角 → 杆顶高度：dx·sinα − dy·cosα = tipR + half
  const a0 = ARM.restAngle
  const dy0 = (c.rodOffset * Math.sin(a0) - (ARM.tipR + ARM.half)) / Math.cos(a0)
  const rodTopRest = c.pivotY + dy0
  const footRest = c.rimTop + FOOT_CLEAR + c.footRad
  const hb = headBottom(a0)
  const faceY = c.pivotY + hb.low - 0.5
  const faceXZ: Vec2 = [pivotXZ[0] + c.dir[0] * hb.u, pivotXZ[1] + c.dir[1] * hb.u]
  // 凸轮：用圆脚最内端半径计轮廓（最陡、最晚释放，偏安全）
  const rIn = c.footR - c.footHalf
  const tmpCam = { r0: c.footR - 15, r1: c.footR + 15, aLow: 0, aHigh: c.span, y0: c.rimTop, height: c.lift }
  const profile = rimCamProfile(tmpCam, rIn)
  const sRelease = c.span * rIn + c.footRad
  // 释放时（轮角 = wheelAngleAtRelease）圆脚已越过坡底 sRelease：s = sense·(Ψ + aLow − footA)·rIn
  const aLow = c.footA - wheelAngleAtRelease + (c.sense * sRelease) / rIn
  const cam: RimCamOpts = { ...tmpCam, aLow, aHigh: aLow - c.sense * c.span }
  return {
    cfg: c,
    rod,
    pivot,
    heading,
    rodLen: rodTopRest - footRest,
    rodTopRest,
    faceY,
    faceXZ,
    cam,
    profile,
    sRelease,
    liftRelease: restOnProfile(profile, sRelease, c.footRad),
  }
}

// —— 由足轮周数 N 求各轮转角（世界，连续不取模） ——
export interface Angles {
  /** 足轮与立轮：绕 +Z（从 +X 向 +Y 为正），车前进时减小 */
  wheel: number
  /** 下平轮：绕 +Y */
  xia: number
  /** 旋风轮（与下平轮同轴，安装相位不同） */
  xuan: number
  /** 中平轮累计前进的齿数（连续） */
  zhongTeeth: number
  zhong: number
  xiao: number
  shang: number
  /** 旋风轮此刻是否在推中平轮 */
  pushing: boolean
}

export function anglesAt(N: number): Angles {
  const wheel = Math.PI / 2 - TAU * N
  const tXia = TAU / TEXT.xia.z
  // 一级：立轮 0 号销 N=0 时在正上方；下平轮按 18/54 匀速，装配相位 PHASE.li
  const xia = Math.PI / 2 + ((wheel - Math.PI / 2) * TEXT.li.z) / TEXT.xia.z - tXia * (0.5 - PHASE.li)
  // 二级：几何接触
  const phi = PHI0 + (TAU / TEXT.xuan.z) * N
  const zhongTeeth = DRIVE.advance(phi)
  const xuan = GAMMA2 - phi
  const zhong = GAMMA2 - DRIVE.restAngle + zhongTeeth * TAU_Z
  // 三级：小平与中平同轴；上平按 10/100 匀速反转，装配相位 PHASE.xiao
  const xiao = zhong
  const thc = xiao - GAMMA3
  const shang = GAMMA3 + Math.PI - (thc * TEXT.xiao.z) / TEXT.shang.z + (TAU / TEXT.shang.z) * (0.5 + PHASE.xiao)
  return { wheel, xia, xuan, zhongTeeth, zhong, xiao, shang, pushing: DRIVE.pushing(phi) }
}

const A0 = anglesAt(0)
export const STRIKER_GEO = {
  lower: strikerGeo(STRIKERS.lower, A0.zhong),
  upper: strikerGeo(STRIKERS.upper, A0.shang),
}

export interface StrikeState {
  /** 圆脚中心高出「落在轮缘上」的量（mm） */
  lift: number
  footY: number
  rodTopY: number
  /** 臂角 */
  arm: number
  /** 自上次释放以来的足轮周数 */
  sinceRevs: number
  /** 正在被拨子顶起 / 刚落下击打 */
  lifting: boolean
  striking: boolean
  /** 槌头离被击面（mm） */
  gap: number
}

/** 「击打」窗口：释放后这么多周足轮之内算击打瞬间（协同链点亮，本站设定） */
export const STRIKE_WINDOW_REVS = 0.5

function strikeAt(g: StrikerGeo, wheelAngle: number, N: number): StrikeState {
  const c = g.cfg
  const rIn = c.footR - c.footHalf
  const s = c.sense * (wheelAngle + g.cam.aLow - c.footA) * rIn
  // 只在本次释放之前的一圈里看凸轮（凸轮每转一周才来一次；用相位把 s 规整到 (sRelease − 一周, sRelease]）
  const circ = TAU * rIn
  let sl = s
  const k = Math.ceil((sl - g.sRelease) / circ)
  sl -= k * circ
  const profileLift = restOnProfile(g.profile, sl, c.footRad)
  const sinceRevs = ((N % c.everyRevs) + c.everyRevs) % c.everyRevs
  const dt = sinceRevs * T_F
  const fall = g.liftRelease - 0.5 * G * dt * dt
  const lift = Math.max(profileLift, fall) - c.footRad
  const footY = c.rimTop + FOOT_CLEAR + c.footRad + lift
  const rodTopY = footY + g.rodLen
  const arm = armAngle(c.rodOffset, rodTopY - c.pivotY)
  const gap = c.pivotY + headBottom(arm).low - g.faceY
  const striking = sinceRevs < STRIKE_WINDOW_REVS
  return { lift, footY, rodTopY, arm, sinceRevs, lifting: !striking && lift > 0.5, striking, gap }
}

// —— 状态 ——
export interface CarControls {
  /** 显示地面刻线 */
  marks: boolean
}

export interface CarState {
  t: number
  /** 足轮累计周数（连续） */
  revs: number
  ang: Angles
  lower: StrikeState
  upper: StrikeState
  /** 地面相对车后移的距离（mm，真实滚动 = 2πR × 周数） */
  ground: number
  showMarks: boolean
}

export function revsAt(t: number): number {
  const tt = ((t % PERIOD) + PERIOD) % PERIOD
  return tt / T_F
}

export function stateAtRevs(N: number, c: CarControls, t = N * T_F): CarState {
  const ang = anglesAt(N)
  return {
    t,
    revs: N,
    ang,
    lower: strikeAt(STRIKER_GEO.lower, ang.zhong, N),
    upper: strikeAt(STRIKER_GEO.upper, ang.shang, N),
    ground: TAU * R.wheel * N,
    showMarks: c.marks,
  }
}

export function simulate(t: number, c: CarControls): CarState {
  return stateAtRevs(revsAt(t), c, t)
}

// —— 位姿 ——
const VERTICAL = rotX(Math.PI / 2) // 局部 +Y（轮轴）→ 世界 +Z
export const wheelPose = (z: number) => (s: CarState): Pose => ({ p: [0, Y0, z], q: quatMul(rotZ(s.ang.wheel), VERTICAL) })
export const liPose = (s: CarState): Pose => ({ p: [0, Y0, Z_LI], q: quatMul(rotZ(s.ang.wheel), VERTICAL) })
const at = (xz: Vec2, y = 0): Vec3 => [xz[0], y, xz[1]]
export const xiaPose = (s: CarState): Pose => ({ p: at(S_XZ), q: rotY(s.ang.xia) })
export const xuanPose = (s: CarState): Pose => ({ p: at(S_XZ), q: rotY(s.ang.xuan) })
export const zhongPose = (s: CarState): Pose => ({ p: at(O2_XZ), q: rotY(s.ang.zhong) })
export const shangPose = (s: CarState): Pose => ({ p: at(O3_XZ), q: rotY(s.ang.shang) })

export const rodPose = (id: 'lower' | 'upper') => (s: CarState): Pose => {
  const g = STRIKER_GEO[id]
  // 提杆局部：圆脚中心在原点、脚轴沿 +X（转到径向）、杆沿 +Y
  return { p: [g.rod[0], s[id].footY, g.rod[1]], q: rotY(g.cfg.footA) }
}
export const armPose = (id: 'lower' | 'upper') => (s: CarState): Pose => {
  const g = STRIKER_GEO[id]
  return { p: g.pivot, q: quatMul(rotY(g.heading), rotZ(s[id].arm)) }
}

/** 地面刻线：每半步一道（足轮转 1/6 周的真实滚动距离），共 MARKS 道在 ±1.5 道距之间循环 */
export const MARK_SPACING = (TAU * R.wheel) / 6
export const MARKS = 3
export const markX = (s: CarState, i: number) => {
  const span = MARKS * MARK_SPACING
  const x = -span / 2 + i * MARK_SPACING - s.ground
  return ((((x + span / 2) % span) + span) % span) - span / 2
}

// —— 读数用 ——
export const frac = (x: number) => x - Math.floor(x)
/** 中平轮（含小平轮）累计周数、上平轮累计周数 */
export const zhongRevs = (s: CarState) => (s.ang.zhongTeeth - F_RELEASE) / TEXT.zhong.z
export const shangRevs = (s: CarState) => zhongRevs(s) * (TEXT.xiao.z / TEXT.shang.z)
export const xiaRevs = (s: CarState) => (s.revs * TEXT.li.z) / TEXT.xia.z
