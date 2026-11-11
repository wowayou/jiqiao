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
  /** 圆头圆心在摇杆局部坐标里的 x（负值 = 在碓尾一侧）；face 时即接触点离支点的距离 */
  x: number
  /** face：圆头压在受压面上；corner：圆头滑过末端后，顶着受压面末端的棱角（棱角在受压面末端 (tailMin, face)） */
  kind: 'face' | 'corner'
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
    if (!best || Math.abs(phi) < Math.abs(best.phi)) best = { phi, x, kind: 'face' }
  }
  return best ?? cornerContact(g, dx, dy)
}

/**
 * 圆头滑过受压面末端之后，还会顶着末端的棱角 K = (tailMin, face) 走一小段，直到彻底脱开。
 * 棱角随摇杆绕支点转，轨迹是以 |K| 为半径的圆；圆头与棱角相切 = 棱角轨迹圆与圆头圆（半径 noseR）相交。
 * 两个交点里取棱角位置较低的（棱角在圆头下方）；圆头圆心须已越过末端（局部 x < tailMin），否则由受压面负责。
 */
function cornerContact(g: RockerGeom, dx: number, dy: number): RockerContact | null {
  const kx = g.tailMin
  const ky = g.face
  const rc = Math.hypot(kx, ky)
  const d = Math.hypot(dx, dy)
  if (d < 1e-9 || d > rc + g.noseR || d < Math.abs(rc - g.noseR)) return null
  // 以支点为原点：棱角圆 (0, rc)，圆头圆 (C, noseR)
  const a = (rc * rc - g.noseR * g.noseR + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, rc * rc - a * a))
  const ex = dx / d
  const ey = dy / d
  let best: Vec2 | null = null
  for (const sg of [1, -1]) {
    const w: Vec2 = [a * ex - sg * h * ey, a * ey + sg * h * ex]
    if (!best || w[1] < best[1]) best = w
  }
  const phi = wrapPi(Math.atan2(best![1], best![0]) - Math.atan2(ky, kx))
  if (Math.abs(phi) > (g.maxPhi ?? 1.2)) return null
  const x = dx * Math.cos(phi) + dy * Math.sin(phi)
  if (x >= g.tailMin) return null
  return { phi, x, kind: 'corner' }
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
  /** push：拨板正把碓尾往下压（碓头在抬起）；fall：拨板已转过最低处、碓头回落（可能还被拨板的背面托着）；rest：静止 */
  stage: RockerStage
  /** 摇杆转角 φ */
  phi: number
  /** 摇杆角速度 dφ/dt（rad/s） */
  dphi: number
  /** 圆头还顶着摇杆时：接触点局部 x（顶着棱角时为 tailMin）；否则 null */
  contactX: number | null
  /** 静止阶段：落到位之后过了多少秒；其余阶段为 null */
  sinceLanding: number | null
}

export interface RockerCycle {
  readonly geom: RockerGeom
  readonly opts: Required<RockerCycleOpts>
  /** 开始压下时的拨板方向角（圆头刚好碰到静止的受压面） */
  alphaIn: number
  /** 摇杆被压到最低（碓头抬到最高）时的拨板方向角 */
  alphaPeak: number
  /** 圆头与摇杆彻底脱开时的拨板方向角 */
  alphaEnd: number
  /** alphaIn → alphaPeak、alphaIn → alphaEnd 轴转过的角度（rad，沿转向） */
  pushAngle: number
  contactSpan: number
  /** 摇杆被抬到的最高角度 */
  phiPeak: number
  /** 从最高点到落回静止的时间（s） */
  fallTime: number
  /** 从开始压下到完全落定，轴转过的角度（rad）。下一块拨板须在此之后才到。 */
  settleAngle: number
  /** 拨板方向角 → 摇杆状态 */
  at(alpha: number): RockerState
}

/**
 * 建立一个摇杆的完整周期：数值定位「开始压下」「最高点」「脱开」三个转角，其余全是解析式。
 *  1. 压下（push）：摇杆角 = contactAngle（拨板与碓尾贴合），到摇杆被压到最低为止；
 *  2. 回落（fall）：从最高点起按匀角加速度下落 φ(τ) = φpeak − ½·accel·τ²，落到 restPhi 即停；
 *     只要圆头还顶着摇杆（接触解仍存在），摇杆就不能落到圆头下面：φ = max(自由下落, 接触解)。
 * 返回的 at(alpha) 只依赖 alpha，所以同一根摇杆上的多块拨板各取各的 alpha 即可。
 */
export function makeRockerCycle(geom: RockerGeom, o: RockerCycleOpts): RockerCycle {
  const opts: Required<RockerCycleOpts> = { restPhi: 0, ...o }
  const { dir, omega, accel, restPhi } = opts
  if (!(omega > 0) || !(accel > 0)) throw new Error('omega 与 accel 须为正数')

  const engaged = (a: number) => {
    const c = contactAngle(geom, a)
    return c !== null && c.phi >= restPhi
  }
  // 沿转向扫一整圈，找「未压 → 压着 → 脱开」的边界
  const N = 7200
  const alphaAt = (i: number) => (dir * (i * TAU)) / N
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
  const alphaEnd = bisect(alphaAt(end), alphaAt(end + 1), false)
  const span = wrapAngle(dir * (alphaEnd - alphaIn))
  const phiC = (u: number) => contactAngle(geom, alphaIn + dir * u)?.phi ?? -Infinity

  // 压下最低点（摇杆角最大处）：先粗扫再黄金分割
  const M = 4000
  let iBest = 0
  for (let i = 0; i <= M; i++) if (phiC((span * i) / M) > phiC((span * iBest) / M)) iBest = i
  let lo = (span * Math.max(0, iBest - 1)) / M
  let hi = (span * Math.min(M, iBest + 1)) / M
  const gr = (Math.sqrt(5) - 1) / 2
  for (let k = 0; k < 60; k++) {
    const m1 = hi - gr * (hi - lo)
    const m2 = lo + gr * (hi - lo)
    if (phiC(m1) > phiC(m2)) hi = m2
    else lo = m1
  }
  const pushAngle = (lo + hi) / 2
  const alphaPeak = alphaIn + dir * pushAngle
  const phiPeak = phiC(pushAngle)
  const fallTime = Math.sqrt((2 * (phiPeak - restPhi)) / accel)

  // 圆头与摇杆彻底脱开（接触解消失）那一刻的状态：位置取「自由下落」与「被圆头托着」两者中较高的，
  // 角速度取同一时刻自由下落的速度（圆头擦着棱角滑走时接触解的变化率趋于无穷，不能直接拿来当速度）。
  const freeFall = (tau: number) => phiPeak - 0.5 * accel * tau * tau
  const tauEnd = (span - pushAngle) / omega
  const phiEnd = Math.max(freeFall(tauEnd), phiC(span - 1e-7), restPhi)
  const v0 = accel * tauEnd
  const tauLand = (-v0 + Math.sqrt(v0 * v0 + 2 * accel * (phiEnd - restPhi))) / accel
  const settleAngle = Math.max(pushAngle + fallTime * omega, span + tauLand * omega)

  const eps = 1e-6
  const at = (alpha: number): RockerState => {
    const u = wrapAngle(dir * (alpha - alphaIn))
    const contact = u < span ? contactAngle(geom, alpha) : null
    const dContact = (): number => {
      const c1 = contactAngle(geom, alpha - dir * eps)
      return contact && c1 ? ((contact.phi - c1.phi) / (dir * eps)) * dir * omega : 0
    }
    const cx = contact ? (contact.kind === 'face' ? contact.x : geom.tailMin) : null
    if (u < pushAngle && contact) {
      return { stage: 'push', phi: Math.max(contact.phi, restPhi), dphi: dContact(), contactX: cx, sinceLanding: null }
    }
    if (u < span) {
      const tau = (u - pushAngle) / omega
      const free = freeFall(tau)
      const held = contact !== null && contact.phi > free
      return {
        stage: 'fall',
        phi: Math.max(free, held ? contact!.phi : -Infinity, restPhi),
        dphi: held ? dContact() : -accel * tau,
        contactX: held ? cx : null,
        sinceLanding: null,
      }
    }
    const tp = (u - span) / omega
    if (tp < tauLand) {
      return { stage: 'fall', phi: Math.max(phiEnd - v0 * tp - 0.5 * accel * tp * tp, restPhi), dphi: -v0 - accel * tp, contactX: null, sinceLanding: null }
    }
    return { stage: 'rest', phi: restPhi, dphi: 0, contactX: null, sinceLanding: tp - tauLand }
  }

  // 全周期摇杆角必须连续（脱开处不能跳；也排除接触解在两个根之间跳来跳去）
  let prev = at(alphaIn - dir * 1e-3).phi
  for (let i = 0; i <= 20000; i++) {
    const phi = at(alphaIn + (dir * i * TAU) / 20000).phi
    if (Math.abs(phi - prev) > 0.02) throw new Error(`摇杆角不连续（相邻 0.018° 跳变 ${(phi - prev).toFixed(3)} rad）：检查尺寸`)
    prev = phi
  }
  return { geom, opts, alphaIn, alphaPeak, alphaEnd, pushAngle, contactSpan: span, phiPeak, fallTime, settleAngle, at }
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
