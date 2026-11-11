// 凸轮拨板与摇杆（杠杆）的接触求解：纯数学，平面 (x, y)，角度单位 rad，逆时针为正。
//
// 模型：转轴（凸轮轴）上的拨板，头部是半径 noseR 的圆头，圆头圆心绕轴心走半径 orbit 的圆；
// 摇杆（碓杆）绕支点 pivot 转动，它的「受压面」是摇杆局部坐标里 y = face 的一条直线（法线朝 +y），
// 只在局部 x ∈ [tailMin, tailMax] 内有效（碓尾的那一段，不含支点另一侧）。
// 摇杆局部坐标：原点在支点，+x 指向另一端（碓头），摇杆转角 φ 为局部坐标系相对世界逆时针转过的角度，
// 所以 φ 增大 = 受压面所在的一端（碓尾）下沉、另一端（碓头）抬起。
//
// 拨板压着摇杆时，圆头与受压面相切，摇杆转角由解析式给出（见 contactAngle）；
// 拨板滑过受压面末端而脱开后，摇杆在重力作用下做匀角加速度的下落，落到 restPhi 即停住（见 makeRockerCycle）。
// 摇杆角只是拨板转角 α 的函数，所以任何时刻的状态都是时间的纯函数。
import { TAU, wrapAngle, wrapPi, type Vec2 } from './vec'

export interface RockerGeom {
  /** 摇杆支点（平面坐标） */
  pivot: Vec2
  /** 凸轮轴心（平面坐标） */
  axis: Vec2
  /** 拨板圆头的圆心到轴心的距离 */
  orbit: number
  /** 拨板圆头半径 */
  noseR: number
  /** 受压面在摇杆局部坐标里的 y（面法线朝 +y） */
  face: number
  /** 受压面在摇杆局部坐标里的 x 范围（碓尾一侧，一般为负） */
  tailMin: number
  tailMax: number
  /** 只接受 |φ| ≤ maxPhi 的解（默认 1.2 rad），排除几何上有解但物理上不会发生的分支 */
  maxPhi?: number
}

/** 拨板圆头圆心的位置。alpha 为拨板方向角（世界，逆时针为正）。 */
export function nosePosition(g: RockerGeom, alpha: number): Vec2 {
  return [g.axis[0] + g.orbit * Math.cos(alpha), g.axis[1] + g.orbit * Math.sin(alpha)]
}

/** 摇杆局部坐标 → 世界坐标（摇杆转角 phi）。 */
export function rockerPoint(g: RockerGeom, phi: number, local: Vec2): Vec2 {
  const c = Math.cos(phi)
  const s = Math.sin(phi)
  return [g.pivot[0] + local[0] * c - local[1] * s, g.pivot[1] + local[0] * s + local[1] * c]
}

/** 世界点 → 摇杆局部坐标。 */
export function rockerLocal(g: RockerGeom, phi: number, world: Vec2): Vec2 {
  const dx = world[0] - g.pivot[0]
  const dy = world[1] - g.pivot[1]
  const c = Math.cos(phi)
  const s = Math.sin(phi)
  return [dx * c + dy * s, -dx * s + dy * c]
}

export interface RockerContact {
  /** 摇杆转角 φ */
  phi: number
  /** 接触点在受压面上的局部 x（离支点多远，负值 = 在碓尾一侧） */
  x: number
}

/**
 * 解析求解：拨板方向角为 alpha 时，圆头与受压面相切、圆头在面的上方，摇杆应转到的角度。
 *
 * 设圆头圆心相对支点为 (dx, dy)，摇杆转 φ 后它在摇杆局部坐标里的 y 为 dy·cosφ − dx·sinφ，
 * 令其等于 face + noseR，得 ρ·cos(φ + β) = face + noseR，其中 ρ = |(dx, dy)|，β = atan2(dx, dy)，
 * 故 φ = ±acos((face + noseR)/ρ) − β。两个根里取接触点落在受压面范围内、且 |φ| 较小的那个；
 * 没有这样的根（够不着，或者已经滑出受压面）返回 null。
 */
export function contactAngle(g: RockerGeom, alpha: number): RockerContact | null {
  const [cx, cy] = nosePosition(g, alpha)
  const dx = cx - g.pivot[0]
  const dy = cy - g.pivot[1]
  const rho = Math.hypot(dx, dy)
  const D = g.face + g.noseR
  if (rho < 1e-9 || Math.abs(D) > rho) return null
  const base = Math.acos(D / rho)
  const beta = Math.atan2(dx, dy)
  const maxPhi = g.maxPhi ?? 1.2
  let best: RockerContact | null = null
  for (const sign of [1, -1]) {
    const phi = wrapPi(sign * base - beta)
    if (Math.abs(phi) > maxPhi) continue
    const x = dx * Math.cos(phi) + dy * Math.sin(phi)
    if (x < g.tailMin || x > g.tailMax) continue
    if (!best || Math.abs(phi) < Math.abs(best.phi)) best = { phi, x }
  }
  return best
}

export interface RockerCycleOpts {
  /** 拨板转向：+1 逆时针，−1 顺时针 */
  dir: 1 | -1
  /** 轴的角速度大小（rad/s，正数） */
  omega: number
  /** 脱开后摇杆下落的角加速度（rad/s²，正数）。模型设定 */
  accel: number
  /** 摇杆静止时的转角（碓头落到位的角度），默认 0 */
  restPhi?: number
}

export type RockerStage = 'rest' | 'push' | 'fall'

export interface RockerState {
  stage: RockerStage
  /** 摇杆转角 φ */
  phi: number
  /** 摇杆角速度 dφ/dt（rad/s） */
  dphi: number
  /** 压着时的接触点局部 x；其余阶段为 null */
  contactX: number | null
  /** 静止阶段：落到位之后过了多少秒；其余阶段为 null */
  sinceLanding: number | null
}

export interface RockerCycle {
  readonly geom: RockerGeom
  readonly opts: Required<RockerCycleOpts>
  /** 开始压下时的拨板方向角（圆头刚好碰到静止的受压面） */
  alphaIn: number
  /** 脱开时的拨板方向角（圆头滑过受压面末端） */
  alphaOut: number
  /** 从 alphaIn 到 alphaOut 轴转过的角度（rad，沿转向） */
  pushAngle: number
  /** 脱开瞬间的摇杆角与角速度 */
  phiOut: number
  dphiOut: number
  /** 摇杆被抬到的最高角度 */
  phiPeak: number
  /** 脱开后到落回静止位置的时间（s） */
  fallTime: number
  /** 从开始压下到完全落回静止，轴转过的角度（rad）。下一块拨板须在此之后才到。 */
  settleAngle: number
  /** 拨板方向角 → 摇杆状态 */
  at(alpha: number): RockerState
}

/**
 * 建立一个摇杆的完整周期：数值定位「开始压下」与「脱开」两个转角，其余全是解析式。
 * 压着的阶段摇杆角等于 contactAngle（拨板与碓尾贴合）；脱开后按匀角加速度下落并在 restPhi 停住。
 * 返回的 at(alpha) 只依赖 alpha，所以对同一根摇杆上的多块拨板各取各的 alpha 即可。
 */
export function makeRockerCycle(geom: RockerGeom, o: RockerCycleOpts): RockerCycle {
  const opts: Required<RockerCycleOpts> = { restPhi: 0, ...o }
  const { dir, omega, accel, restPhi } = opts
  if (!(omega > 0) || !(accel > 0)) throw new Error('omega 与 accel 须为正数')

  const engaged = (a: number) => {
    const c = contactAngle(geom, a)
    return c !== null && c.phi >= restPhi
  }
  // 沿转向扫一整圈，找「未压 → 压着」的边界
  const N = 7200
  const alphaAt = (i: number) => dir * (i * TAU) / N
  let start = -1
  for (let i = 0; i < N; i++) {
    if (!engaged(alphaAt(i)) && engaged(alphaAt(i + 1))) {
      start = i
      break
    }
  }
  if (start < 0) throw new Error('拨板转一圈也没有压到摇杆：检查几何')
  let end = -1
  for (let i = start + 1; i <= start + N; i++) {
    if (engaged(alphaAt(i)) && !engaged(alphaAt(i + 1))) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('拨板压上摇杆后一直不脱开：检查几何')
  const bisect = (lo: number, hi: number, wantEngagedAtHi: boolean) => {
    // lo、hi 为角度；在 [lo, hi] 内找 engaged 状态翻转的位置
    let a = lo
    let b = hi
    for (let k = 0; k < 60; k++) {
      const m = (a + b) / 2
      if (engaged(m) === wantEngagedAtHi) b = m
      else a = m
    }
    return (a + b) / 2
  }
  const alphaIn = bisect(alphaAt(start), alphaAt(start + 1), true)
  const alphaOut = bisect(alphaAt(end), alphaAt(end + 1), false)
  const pushAngle = wrapAngle(dir * (alphaOut - alphaIn))

  // 脱开瞬间的摇杆角速度：对 φ(α) 取向后差分
  const eps = 1e-6
  const phiAt = (a: number) => contactAngle(geom, a)!.phi
  const aOut = alphaOut - dir * eps * 0.5
  const phiOut = phiAt(aOut)
  const dphiDalpha = (phiAt(aOut) - phiAt(aOut - dir * eps)) / (dir * eps)
  const dphiOut = dphiDalpha * dir * omega

  // 脱开后：φ(τ) = φOut + dφOut·τ − ½·accel·τ²，落到 restPhi 即停
  const disc = dphiOut * dphiOut + 2 * accel * (phiOut - restPhi)
  const fallTime = (dphiOut + Math.sqrt(Math.max(0, disc))) / accel
  const tPeak = Math.max(0, dphiOut / accel)
  let phiPeak = phiOut + dphiOut * tPeak - 0.5 * accel * tPeak * tPeak
  for (let i = 0; i <= 400; i++) {
    const c = contactAngle(geom, alphaIn + (dir * pushAngle * i) / 400)
    if (c && c.phi > phiPeak) phiPeak = c.phi
  }
  const settleAngle = pushAngle + fallTime * omega

  // 压着的整段里接触解必须连续（不能在两个根之间跳来跳去）
  for (let i = 1; i <= 400; i++) {
    const c0 = contactAngle(geom, alphaIn + (dir * pushAngle * (i - 1)) / 400)
    const c1 = contactAngle(geom, alphaIn + (dir * pushAngle * i) / 400)
    if (c0 && c1 && Math.abs(c1.phi - c0.phi) > 0.05) throw new Error('接触解不连续：摇杆几何有多个分支，检查尺寸')
  }

  const at = (alpha: number): RockerState => {
    const u = wrapAngle(dir * (alpha - alphaIn))
    if (u < pushAngle) {
      const c = contactAngle(geom, alpha)
      if (c) {
        const a1 = alpha - dir * eps
        const c1 = contactAngle(geom, a1)
        const d = c1 ? ((c.phi - c1.phi) / (dir * eps)) * dir * omega : 0
        return { stage: 'push', phi: Math.max(c.phi, restPhi), dphi: d, contactX: c.x, sinceLanding: null }
      }
    }
    const tau = (u - pushAngle) / omega
    if (u >= pushAngle && tau < fallTime) {
      const phi = phiOut + dphiOut * tau - 0.5 * accel * tau * tau
      return { stage: 'fall', phi: Math.max(phi, restPhi), dphi: dphiOut - accel * tau, contactX: null, sinceLanding: null }
    }
    return { stage: 'rest', phi: restPhi, dphi: 0, contactX: null, sinceLanding: Math.max(0, tau - fallTime) }
  }
  return { geom, opts, alphaIn, alphaOut, pushAngle, phiOut, dphiOut, phiPeak, fallTime, settleAngle, at }
}

/**
 * 同一根摇杆上有多块拨板时某一时刻的摇杆状态。alpha 是拨板「基准方向」的世界转角，
 * phases[i] 是第 i 块拨板相对基准方向的相位（rad，同一坐标系下逆时针为正）。
 * 各块拨板各自按 at(alpha + phase) 求状态：取摇杆角最大的那块（互相错得够开时，同一时刻至多一块不在静止）；
 * 都在静止时取落下去最近的那块。
 */
export function rockerWithPegs(cycle: RockerCycle, alpha: number, phases: readonly number[]): RockerState & { peg: number } {
  let best: (RockerState & { peg: number }) | null = null
  phases.forEach((ph, i) => {
    const s = cycle.at(alpha + ph)
    const better =
      !best ||
      s.phi > best.phi ||
      (s.phi === best.phi && s.sinceLanding !== null && (best.sinceLanding === null || s.sinceLanding < best.sinceLanding))
    if (better) best = { ...s, peg: i }
  })
  return best!
}
