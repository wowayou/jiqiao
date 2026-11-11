// 销齿（圆木销）与拨齿的纯数学：不依赖 three，可在 Node 与浏览器共用。
//
// 古代木齿轮不是渐开线齿轮。这里处理两类非共轭的「销齿」啮合：
//
// 1. 恒定速比的销齿对（齿数多、齿距相对销径大）：从动轮按齿数比匀速转，靠齿隙避免穿模。
//    非共轭齿形在恒定速比下两销的距离会随转角起伏，用 minCapsuleClearance 逐相位量最小间隙，
//    间隙 ≥ 0 即不穿模（销用「胶囊体」——两端为半球的圆柱——包住，胶囊不相交则实体必不相交）。
//
// 2. 「一拨一停」的拨齿（齿数极少，如三齿旋风轮拨百齿平轮）：恒定速比必然穿模，
//    改由几何接触求从动轮转角：拨齿（平面里的胶囊）碰到销就推着走，脱开后从动轮停住，
//    直到下一个拨齿碰上下一根销。见 solveArmPinDrive。
//
// 角度约定与 gears.ts 一致：齿/销 j 在本轮转动坐标系的 2πj/z 方向，转角正方向按右手定则。
import { TAU, v2, type Vec2, type Vec3 } from './vec'

// —— 距离 ——

/** 平面上点到线段的距离。 */
export function pointSegDist2(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = v2.sub(b, a)
  const l2 = v2.dot(ab, ab)
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, v2.dot(v2.sub(p, a), ab) / l2))
  return v2.dist(p, v2.add(a, v2.scale(ab, t)))
}

/** 空间两线段之间的最短距离（标准的分段夹取法）。 */
export function segSegDist3(p0: Vec3, p1: Vec3, q0: Vec3, q1: Vec3): number {
  const d1: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
  const d2: Vec3 = [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]]
  const r: Vec3 = [p0[0] - q0[0], p0[1] - q0[1], p0[2] - q0[2]]
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const a = dot(d1, d1)
  const e = dot(d2, d2)
  const f = dot(d2, r)
  const EPS = 1e-12
  let s: number
  let t: number
  if (a <= EPS && e <= EPS) {
    s = 0
    t = 0
  } else if (a <= EPS) {
    s = 0
    t = Math.max(0, Math.min(1, f / e))
  } else {
    const c = dot(d1, r)
    if (e <= EPS) {
      t = 0
      s = Math.max(0, Math.min(1, -c / a))
    } else {
      const b = dot(d1, d2)
      const denom = a * e - b * b
      s = denom > EPS ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0
      t = (b * s + f) / e
      if (t < 0) {
        t = 0
        s = Math.max(0, Math.min(1, -c / a))
      } else if (t > 1) {
        t = 1
        s = Math.max(0, Math.min(1, (b - c) / a))
      }
    }
  }
  const cp: Vec3 = [p0[0] + d1[0] * s, p0[1] + d1[1] * s, p0[2] + d1[2] * s]
  const cq: Vec3 = [q0[0] + d2[0] * t, q0[1] + d2[1] * t, q0[2] + d2[2] * t]
  return Math.hypot(cp[0] - cq[0], cp[1] - cq[1], cp[2] - cq[2])
}

/** 一段胶囊（轴线两端点 + 半径）。 */
export interface Capsule {
  a: Vec3
  b: Vec3
  r: number
}

/**
 * 两组胶囊两两之间的最小间隙（轴线距离 − 两半径之和）。< 0 表示相交。
 * 返回最小值与对应的序号，便于测试报告是哪两根销最近。
 */
export function minCapsuleClearance(A: readonly Capsule[], B: readonly Capsule[]): { gap: number; i: number; j: number } {
  let best = { gap: Infinity, i: -1, j: -1 }
  for (let i = 0; i < A.length; i++)
    for (let j = 0; j < B.length; j++) {
      const g = segSegDist3(A[i].a, A[i].b, B[j].a, B[j].b) - A[i].r - B[j].r
      if (g < best.gap) best = { gap: g, i, j }
    }
  return best
}

// —— 恒定速比的销齿轮 ——

/** 节圆上的齿距（弧长）。 */
export function pitchArc(pitchR: number, z: number): number {
  return (TAU * pitchR) / z
}

/** 轮在平面图里的第 j 个齿位（节圆上）。 */
export function toothOnCircle(center: Vec2, r: number, z: number, angle: number, j: number): Vec2 {
  return v2.add(center, v2.polar(r, angle + (TAU * j) / z))
}

/** 只取离某方向最近的若干个齿序号（啮合区附近），用于间隙检查时减少计算量。 */
export function nearTeeth(z: number, angle: number, towards: number, count: number): number[] {
  const pitch = TAU / z
  const j0 = Math.round((towards - angle) / pitch)
  const out: number[] = []
  for (let d = -count; d <= count; d++) out.push((((j0 + d) % z) + z) % z)
  return out
}

// —— 「一拨一停」：拨齿推销 ——

export interface ArmPinDriveSpec {
  /** 主动轮拨齿数（如旋风轮 3） */
  arms: number
  /** 从动轮销数（如中平轮 100） */
  pins: number
  /** 两轴中心距（平面图） */
  center: number
  /** 从动销所在圆半径 */
  pinCircleR: number
  /** 从动销半径 */
  pinR: number
  /** 拨齿：平面里的胶囊，轴线从 rootR 到 tipR（离主动轴心），半宽 armR */
  armR: number
  rootR: number
  tipR: number
}

export interface ArmPinDrive {
  spec: ArmPinDriveSpec
  /** 标准坐标系里 0 号销的静止角（从动轮转角 0 时） */
  restAngle: number
  /** 一个拨齿周期内：开始接触、推到最远的主动轮转角（标准坐标系） */
  phiStart: number
  phiPeak: number
  /** 每拨一次从动轮前进的齿数（求解后恒为 1） */
  stroke: number
  /** 一个拨齿周期内「在推」所占的比例 */
  pushFraction: number
  /** 主动轮转角（标准坐标系，连续不取模）→ 从动轮累计前进的齿数（连续、单调不减） */
  advance(phi: number): number
  /** advance 的反函数：从动轮前进到 A 齿（A 不能是整数——整数齿处从动轮停着，时刻不唯一）时的主动轮转角 */
  phiAt(A: number): number
  /** 从动轮此刻是否正被推着走 */
  pushing(phi: number): boolean
  /** 标准坐标系下的几何：主动轮在原点、逆时针转；从动轮在 (center, 0)、顺时针转 */
  pinCenter(advanceTeeth: number, j: number): Vec2
  armAxis(phi: number, i: number): [Vec2, Vec2]
}

/**
 * 求解三齿拨百齿这类间歇拨动。标准坐标系：主动轮轴心在原点、逆时针转（φ 增大）；
 * 从动轮轴心在 (D, 0)，被推着顺时针转。实际朝向由调用方做一次旋转/镜像换算。
 *
 * 做法：给定 0 号销的静止位置，拨齿逆时针扫过来，先碰到销（phiStart），把它沿销圆推着走，
 * 推到最远（phiPeak）后拨齿从销上滑脱，从动轮停住。调 0 号销的静止角，使一次正好推进一个齿距，
 * 于是下一个拨齿碰到下一根销时，两者的相对位置与上一次完全相同——运动严格周期、无跳变。
 * 从动轮转角是「推到的最远位置」，为主动轮转角的纯函数。
 */
export function solveArmPinDrive(spec: ArmPinDriveSpec): ArmPinDrive {
  const { arms, pins, center: D, pinCircleR: R, pinR, armR, rootR, tipR } = spec
  const c = armR + pinR
  const tau = TAU / pins
  const period = TAU / arms
  const O2: Vec2 = [D, 0]

  const armAxis = (phi: number, i: number): [Vec2, Vec2] => {
    const a = phi + i * period
    return [v2.polar(rootR, a), v2.polar(tipR, a)]
  }
  const pinAt = (rest: number, A: number, j: number): Vec2 => v2.add(O2, v2.polar(R, rest - A * tau + j * tau))

  // 0 号销前进 A 齿时与 0 号拨齿（转角 φ）的间隙
  const gap = (rest: number, A: number, phi: number) => {
    const [a, b] = armAxis(phi, 0)
    return pointSegDist2(pinAt(rest, A, 0), a, b) - c
  }
  const A_HI = 1.6
  // 在转角 φ 时，拨齿逼迫 0 号销至少前进到的齿数：穿透区间的前沿；不碰则为 0
  const pushedTo = (rest: number, phi: number): number => {
    const n = 64
    let hi = A_HI
    if (gap(rest, hi, phi) <= 0) throw new Error('拨齿伸得太远：推进量超过 1.6 齿，几何不合理')
    for (let s = n - 1; s >= 0; s--) {
      const A = (A_HI * s) / n
      if (gap(rest, A, phi) <= 0) {
        let lo = A
        for (let it = 0; it < 50; it++) {
          const mid = (lo + hi) / 2
          if (gap(rest, mid, phi) <= 0) lo = mid
          else hi = mid
        }
        return lo
      }
      hi = A
    }
    return 0
  }
  // 拨齿开始碰到静止的 0 号销的转角：从 −π/2（拨齿背向从动轮的下方）往上找
  const startOf = (rest: number): number => {
    let prev = -Math.PI / 2
    if (gap(rest, 0, prev) <= 0) throw new Error('拨齿在 −90° 处已碰到销：几何不合理')
    for (let k = 1; k <= 720; k++) {
      const phi = -Math.PI / 2 + (k * Math.PI) / 720
      if (gap(rest, 0, phi) <= 0) {
        let lo = prev
        let hi = phi
        for (let it = 0; it < 60; it++) {
          const mid = (lo + hi) / 2
          if (gap(rest, 0, mid) <= 0) hi = mid
          else lo = mid
        }
        return hi
      }
      prev = phi
    }
    throw new Error('拨齿转过半圈仍碰不到销：拨齿太短')
  }
  const peakOf = (rest: number, phiS: number): { phi: number; A: number } => {
    const n = 360
    let best = { phi: phiS, A: 0 }
    for (let k = 0; k <= n; k++) {
      const phi = phiS + (period * k) / n
      const A = pushedTo(rest, phi)
      if (A > best.A) best = { phi, A }
    }
    // 黄金分割细化
    let lo = best.phi - period / n
    let hi = best.phi + period / n
    const g = (Math.sqrt(5) - 1) / 2
    for (let it = 0; it < 60; it++) {
      const m1 = hi - g * (hi - lo)
      const m2 = lo + g * (hi - lo)
      if (pushedTo(rest, m1) < pushedTo(rest, m2)) lo = m1
      else hi = m2
    }
    const phi = (lo + hi) / 2
    return { phi, A: pushedTo(rest, phi) }
  }

  // 解静止角：0 号销在 π+δ（从动轮左侧、略低于连心线），δ 越大推程越长
  // 静止销太低时拨齿够不着（推程 0）；在够得着的范围内推程随 δ 单调增
  const strokeOf = (delta: number) => {
    const rest = Math.PI + delta
    let s: number
    try {
      s = startOf(rest)
    } catch {
      return -1
    }
    return peakOf(rest, s).A
  }
  let lo = 0
  let hi = NaN
  if (strokeOf(0) >= 1) throw new Error('拨齿太长：静止销在连心线上时推程已超过一个齿距')
  for (let k = 1; k <= 60; k++) {
    const d = (k * tau) / 40
    const s = strokeOf(d)
    if (s < 0) break
    if (s >= 1) {
      hi = d
      break
    }
    lo = d
  }
  if (Number.isNaN(hi)) throw new Error('无法把一次推程调到正好一个齿距：拨齿太短，够不着')
  for (let it = 0; it < 60; it++) {
    const mid = (lo + hi) / 2
    if (strokeOf(mid) < 1) lo = mid
    else hi = mid
  }
  const restAngle = Math.PI + (lo + hi) / 2
  const phiStart = startOf(restAngle)
  const peak = peakOf(restAngle, phiStart)
  const phiPeak = peak.phi
  const stroke = peak.A
  if (phiPeak - phiStart >= period) throw new Error('推程超过一个拨齿周期：两个拨齿会同时推销')

  // 推程内必须单调（否则「推到的最远位置」不等于此刻的接触位置）
  {
    let prev = 0
    for (let k = 0; k <= 400; k++) {
      const A = pushedTo(restAngle, phiStart + ((phiPeak - phiStart) * k) / 400)
      if (A < prev - 1e-9) throw new Error('推程内从动轮位置不单调')
      prev = A
    }
  }

  const local = (phi: number) => {
    const u = phi - phiStart
    const k = Math.floor(u / period)
    return { k, phiL: phiStart + (u - k * period) }
  }
  // 推程末端把 stroke（≈1，误差 < 1e-12）归一到 1，保证周期衔接严格无跳变
  const inPush = (phiL: number) => (phiL >= phiPeak ? 1 : Math.min(1, pushedTo(restAngle, phiL) / stroke))
  return {
    spec,
    restAngle,
    phiStart,
    phiPeak,
    stroke,
    pushFraction: (phiPeak - phiStart) / period,
    advance(phi) {
      const { k, phiL } = local(phi)
      return k + inPush(phiL)
    },
    phiAt(A) {
      const k = Math.floor(A)
      const f = A - k
      if (f <= 0) throw new Error('phiAt：整数齿处从动轮停着，时刻不唯一')
      let a = phiStart
      let b = phiPeak
      for (let it = 0; it < 80; it++) {
        const m = (a + b) / 2
        if (inPush(m) < f) a = m
        else b = m
      }
      return (a + b) / 2 + k * period
    },
    pushing(phi) {
      const { phiL } = local(phi)
      return phiL > phiStart && phiL < phiPeak
    },
    pinCenter: (A, j) => pinAt(restAngle, A, j),
    armAxis,
  }
}

// —— 凸轮从动件：圆头搭在折线轮廓上 ——

/**
 * 半径 r 的圆头（圆心横坐标 x）搭在折线轮廓 profile 上时，圆心的最低高度。
 * profile 为 (横坐标, 高度) 的折线，横坐标须单调不减（竖直段用两个同横坐标的点表示）。
 * 算法：对每段求圆与之相切（切点落在段内）的高度，再对每个顶点求圆搭在顶点上的高度，取最大。
 */
export function restOnProfile(profile: readonly Vec2[], x: number, r: number): number {
  let y = -Infinity
  for (let i = 0; i < profile.length; i++) {
    const [px, py] = profile[i]
    const dx = px - x
    if (Math.abs(dx) <= r) y = Math.max(y, py + Math.sqrt(r * r - dx * dx))
    if (i + 1 < profile.length) {
      const [qx, qy] = profile[i + 1]
      if (qx - px > 1e-12) {
        const m = (qy - py) / (qx - px)
        const s = Math.sqrt(1 + m * m)
        // 切点横坐标 = 圆心横坐标 + r·m/s
        const tx = x + (r * m) / s
        if (tx >= px && tx <= qx) y = Math.max(y, py + m * (tx - px) + r / s)
      }
    }
  }
  return y
}
