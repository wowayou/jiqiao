// 擒纵的纯数学：齿与叉瓦的几何接触、直进式（Graham）锚形擒纵的几何构造、按叉角求擒纵轮转角的求解器。
//
// 规范坐标（本文件内一律如此，展品按需镜像）：
//   平面 (x, y)，擒纵轮中心在原点，轮子在驱动力矩下沿 +（逆时针）转；
//   擒纵叉支点在 pivot（在轮心正上方），叉角 φ 逆时针为正；
//   齿位约定同 gears.ts：轮转角为 0 时 0 号齿的齿尖在 0 角方向，第 j 号齿在 j·2π/N。
//   需要顺时针转的轮（例如直接带秒针的擒纵轮）：几何沿 x 镜像（mirrorOutlineX / mirrorPolygonX），世界转角取 −ψ、−φ。
//
// 求解思路（不是照剧本摆角度）：
//   每一时刻先由叉角 φ 摆好叉瓦，再问「轮子在驱动力矩下往前最多能转多少才碰到叉瓦」——
//   这是齿（多边形）绕轮心转动、叉瓦（线段 + 圆弧）不动时的首次接触问题，逐顶点、逐边精确求交。
//   贴着叉瓦时轮子跟随接触面（锁 / 冲击）；接触面一走完，轮子按等效角加速度自由转动（落），
//   直到被另一侧叉瓦接住。若叉瓦反过来压进齿里（回退式擒纵的回退），则把轮子往回推到刚好不穿模。
import { TAU, v2, wrapAngle, wrapPi, type Vec2 } from './vec'

// ———————————————————— 几何原语 ————————————————————

/** 边的用途：锁面 / 冲击面 / 其余（不应参与接触） */
export type EdgeTag = 'lock' | 'impulse' | 'body'

export type Edge =
  | { kind: 'seg'; a: Vec2; b: Vec2; tag: EdgeTag }
  /** 圆弧：圆心 c、半径 r，覆盖角度 [a0, a1]（a1 > a0）；ccw = false 表示轮廓沿它从 a1 走回 a0 */
  | { kind: 'arc'; c: Vec2; r: number; a0: number; a1: number; ccw: boolean; tag: EdgeTag }

type Arc = Extract<Edge, { kind: 'arc' }>

/** 由线段与圆弧首尾相接围成的闭合轮廓。 */
export interface Outline {
  edges: Edge[]
}

const rot = (p: Vec2, a: number): Vec2 => v2.rotate(p, a)
const arcPoint = (e: Arc, a: number): Vec2 => v2.add(e.c, v2.polar(e.r, a))

export function edgeStart(e: Edge): Vec2 {
  return e.kind === 'seg' ? e.a : arcPoint(e, e.ccw ? e.a0 : e.a1)
}

/** 刚体变换：先绕原点转 angle，再平移 offset。 */
export function transformEdge(e: Edge, angle: number, offset: Vec2 = [0, 0]): Edge {
  if (e.kind === 'seg') return { ...e, a: v2.add(rot(e.a, angle), offset), b: v2.add(rot(e.b, angle), offset) }
  return { ...e, c: v2.add(rot(e.c, angle), offset), a0: e.a0 + angle, a1: e.a1 + angle }
}

export function transformOutline(o: Outline, angle: number, offset: Vec2 = [0, 0]): Outline {
  return { edges: o.edges.map((e) => transformEdge(e, angle, offset)) }
}

/** 把轮廓离散成多边形（圆弧按 maxStep 弧度分段）。用于建实体与点内判断。 */
export function outlinePolygon(o: Outline, maxStep = 0.01): Vec2[] {
  const pts: Vec2[] = []
  for (const e of o.edges) {
    if (e.kind === 'seg') pts.push(e.a)
    else {
      const n = Math.max(1, Math.ceil((e.a1 - e.a0) / maxStep))
      for (let i = 0; i < n; i++) {
        const u = i / n
        pts.push(arcPoint(e, e.ccw ? e.a0 + (e.a1 - e.a0) * u : e.a1 - (e.a1 - e.a0) * u))
      }
    }
  }
  return pts
}

/** 镜像（x → −x）。边的顺序反过来，使轮廓仍首尾相接、走向不变。 */
export function mirrorOutlineX(o: Outline): Outline {
  const m = (p: Vec2): Vec2 => [-p[0], p[1]]
  const edges = o.edges
    .map((e): Edge => (e.kind === 'seg' ? { ...e, a: m(e.b), b: m(e.a) } : { ...e, c: m(e.c), a0: Math.PI - e.a1, a1: Math.PI - e.a0 }))
    .reverse()
  return { edges }
}

export function mirrorPolygonX(poly: readonly Vec2[]): Vec2[] {
  return poly.map((p): Vec2 => [-p[0], p[1]]).reverse()
}

export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function segsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const abx = b[0] - a[0]
  const aby = b[1] - a[1]
  const cdx = d[0] - c[0]
  const cdy = d[1] - c[1]
  const d1 = abx * (c[1] - a[1]) - aby * (c[0] - a[0])
  const d2 = abx * (d[1] - a[1]) - aby * (d[0] - a[0])
  if (d1 * d2 >= 0) return false
  const d3 = cdx * (a[1] - c[1]) - cdy * (a[0] - c[0])
  const d4 = cdx * (b[1] - c[1]) - cdy * (b[0] - c[0])
  return d3 * d4 < 0
}

/** 两个简单多边形是否相交（含包含关系）。 */
export function polygonsOverlap(A: readonly Vec2[], B: readonly Vec2[]): boolean {
  for (let i = 0; i < A.length; i++) {
    const a = A[i]
    const b = A[(i + 1) % A.length]
    for (let j = 0; j < B.length; j++) if (segsCross(a, b, B[j], B[(j + 1) % B.length])) return true
  }
  return pointInPolygon(A[0], B) || pointInPolygon(B[0], A)
}

/** 圆（圆心原点、半径 rho）与线段的交点角度。 */
function circleSegAngles(rho: number, a: Vec2, b: Vec2, out: number[]) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const A = dx * dx + dy * dy
  const B = 2 * (a[0] * dx + a[1] * dy)
  const C = a[0] * a[0] + a[1] * a[1] - rho * rho
  const disc = B * B - 4 * A * C
  if (disc < 0 || A === 0) return
  const s = Math.sqrt(disc)
  for (const u of [(-B - s) / (2 * A), (-B + s) / (2 * A)]) {
    if (u < -1e-12 || u > 1 + 1e-12) continue
    out.push(Math.atan2(a[1] + dy * u, a[0] + dx * u))
  }
}

/** 圆（圆心原点、半径 rho）与圆弧的交点角度（从原点量）。 */
function circleArcAngles(rho: number, e: Arc, out: number[]) {
  const dc = Math.hypot(e.c[0], e.c[1])
  if (dc < 1e-12) {
    // 同心：只有半径相等时重合（不作为接触点处理）
    return
  }
  const x = (rho * rho - e.r * e.r + dc * dc) / (2 * dc)
  const h2 = rho * rho - x * x
  if (h2 < 0) return
  const h = Math.sqrt(h2)
  const ux = e.c[0] / dc
  const uy = e.c[1] / dc
  for (const sgn of [-1, 1]) {
    const px = ux * x - uy * h * sgn
    const py = uy * x + ux * h * sgn
    const ang = Math.atan2(py - e.c[1], px - e.c[0])
    const rel = wrapAngle(ang - e.a0)
    if (rel <= e.a1 - e.a0 + 1e-12) out.push(Math.atan2(py, px))
  }
}

interface Bound {
  c: Vec2
  r: number
}

function polyBound(poly: readonly Vec2[]): Bound {
  let cx = 0
  let cy = 0
  for (const p of poly) {
    cx += p[0]
    cy += p[1]
  }
  const c: Vec2 = [cx / poly.length, cy / poly.length]
  let r = 0
  for (const p of poly) r = Math.max(r, v2.dist(p, c))
  return { c, r }
}

function outlineBound(o: Outline): Bound {
  return polyBound(outlinePolygon(o, 0.05))
}

export interface ContactHit {
  /** 轮子还能往前转的角度（rad，≥ 0） */
  delta: number
  /** 碰到的是哪一组障碍（叉瓦序号） */
  obstacle: number
  /** 接触所在的叉瓦边的标签；叉瓦顶点碰到齿面时取相邻工作面的标签 */
  tag: EdgeTag
}

/**
 * 首次接触：多边形组 moving（齿，世界坐标）绕原点逆时针转 δ ∈ [0, maxDelta]，
 * 障碍轮廓 obstacles（叉瓦，世界坐标）不动。返回最小的 δ，没有接触返回 null。
 * 精确求交：齿的每个顶点走的圆 × 叉瓦的每条边（线段或圆弧）；
 * 叉瓦的每个顶点（及圆弧上的采样点）相对反向走的圆 × 齿的每条边。
 */
export function firstContact(moving: readonly Vec2[][], obstacles: readonly Outline[], maxDelta: number, arcSamples = 8): ContactHit | null {
  let best: ContactHit | null = null
  const consider = (delta: number, obstacle: number, tag: EdgeTag) => {
    if (delta < 0 || delta > maxDelta) return
    if (!best || delta < best.delta) best = { delta, obstacle, tag }
  }
  const angles: number[] = []
  const mb = moving.map(polyBound)
  obstacles.forEach((ob, oi) => {
    const obb = outlineBound(ob)
    const near = moving.filter((_, i) => {
      const travel = maxDelta * (v2.len(mb[i].c) + mb[i].r)
      return v2.dist(mb[i].c, obb.c) <= mb[i].r + obb.r + travel + 1e-6
    })
    if (near.length === 0) return
    // 齿顶点 → 叉瓦边
    for (const poly of near)
      for (const v of poly) {
        const rho = Math.hypot(v[0], v[1])
        const th = Math.atan2(v[1], v[0])
        for (const e of ob.edges) {
          angles.length = 0
          if (e.kind === 'seg') circleSegAngles(rho, e.a, e.b, angles)
          else circleArcAngles(rho, e, angles)
          for (const beta of angles) consider(wrapAngle(beta - th), oi, e.tag)
        }
      }
    // 叉瓦顶点 → 齿边（相对运动：叉瓦点绕原点反向转）
    const pts: { p: Vec2; tag: EdgeTag }[] = []
    ob.edges.forEach((e, i) => {
      const prev = ob.edges[(i + ob.edges.length - 1) % ob.edges.length]
      pts.push({ p: edgeStart(e), tag: e.tag !== 'body' ? e.tag : prev.tag })
      if (e.kind === 'arc')
        for (let s = 1; s < arcSamples; s++) pts.push({ p: arcPoint(e, e.a0 + ((e.a1 - e.a0) * s) / arcSamples), tag: e.tag })
    })
    for (const { p, tag } of pts) {
      const rho = Math.hypot(p[0], p[1])
      const th = Math.atan2(p[1], p[0])
      for (const poly of near)
        for (let i = 0; i < poly.length; i++) {
          angles.length = 0
          circleSegAngles(rho, poly[i], poly[(i + 1) % poly.length], angles)
          for (const beta of angles) consider(wrapAngle(th - beta), oi, tag)
        }
    }
  })
  return best
}

// ———————————————————— 直进式锚形擒纵（Graham）的几何 ————————————————————

export interface GrahamParams {
  /** 齿数 */
  teeth: number
  /** 齿尖半径（mm） */
  tipR: number
  /** 齿根半径（mm） */
  rootR: number
  /** 两叉瓦跨过的齿距数（须为半整数，如 7.5） */
  span: number
  /** 冲击期间叉转过的角度（rad），不含锁深 */
  lift: number
  /** 锁深（rad，叉角）：两侧放开角之间留出的余量，保证落下的齿落在锁面上 */
  lock: number
  /** 锁面的叉角长度（rad），须大于「振幅 − 放开角」 */
  lockFace: number
  /** 每次冲击轮子前进的角度（rad）；半个齿距里剩下的是「落」 */
  impulseWheel: number
  /** 叉瓦从锁面末端再往叉臂方向延伸的叉角长度（rad） */
  palletTail: number
  /** 齿形：齿尖平台宽（mm）、前齿面的前倾角（rad）、齿根宽（mm） */
  tooth: { land: number; rake: number; rootWidth: number }
}

export interface GrahamGeometry {
  params: GrahamParams
  teeth: number
  pitch: number
  tipR: number
  rootR: number
  /** 擒纵叉支点（相对轮心） */
  pivot: Vec2
  /** 支点到锁面的半径（两侧锁面同半径：入瓦为外弧、出瓦为内弧） */
  lockR: number
  /** 两叉瓦的径向宽度（mm）[入瓦, 出瓦] */
  palletWidth: [number, number]
  /** 0 号齿的轮廓（轮转角为 0，齿尖在 0 角方向）。顶点伸进齿根圆以内 0.6 mm，便于与轮辋合成一体 */
  tooth: Vec2[]
  /** 叉瓦轮廓（叉的局部坐标：相对支点，叉角为 0）。[入瓦, 出瓦] */
  pallets: [Outline, Outline]
  /** 入瓦放开（开始冲击）的叉角；出瓦放开的叉角 = −releaseEntry */
  releaseEntry: number
  /** 锁住时齿尖的方位角（从轮心量）：[入瓦, 出瓦] */
  lockedTipAngle: [number, number]
}

export const PALLET_NAMES = ['entry', 'exit'] as const
export type PalletName = (typeof PALLET_NAMES)[number]

/**
 * 构造直进式锚形擒纵。设计条件（全部可由测试复核）：
 * - 支点放在两侧锁定齿尖处轮缘切线的交点上：D = R / cos α，α = 跨度角的一半。于是锁住时齿尖的运动方向正对支点，
 *   以支点为圆心的锁面与齿尖圆正交——叉在锁面上滑动时轮子既不前进也不后退（直进式 / deadbeat）。
 * - 两侧锁面同半径 L = R·tan α：入瓦是外弧（齿尖朝支点推），出瓦是内弧（齿尖背离支点推）。
 * - 冲击面是一段直线：叉角从放开角转过 lift 的同时，齿尖从锁面末端滑到冲击面末端、轮子前进 impulseWheel。
 */
export function grahamEscapement(p: GrahamParams): GrahamGeometry {
  if (Math.abs(p.span * 2 - Math.round(p.span * 2)) > 1e-9 || Number.isInteger(p.span)) throw new Error('span 须为半整数齿距')
  const N = p.teeth
  const pitch = TAU / N
  const R = p.tipR
  const alpha = (p.span * pitch) / 2
  const D = R / Math.cos(alpha)
  const L = R * Math.tan(alpha)
  const pivot: Vec2 = [0, D]
  const aE = Math.PI / 2 - alpha
  const aX = Math.PI / 2 + alpha
  const tip = (a: number): Vec2 => v2.polar(R, a)
  const toAnchor = (w: Vec2, phi: number): Vec2 => rot(v2.sub(w, pivot), -phi)
  const polar = (q: Vec2) => ({ r: v2.len(q), a: Math.atan2(q[1], q[0]) })

  // 放开角：入瓦在 φ = −(lift − lock)/2 放开，出瓦在 +(lift − lock)/2 放开（对称于摆的中点）
  const relE = -(p.lift - p.lock) / 2
  const relX = -relE

  // —— 入瓦：外弧锁面（半径 L），冲击面从 A 斜向内到 B ——
  const A = polar(toAnchor(tip(aE), relE))
  const B = polar(toAnchor(tip(aE + p.impulseWheel), relE + p.lift))
  const eHi = A.a + p.lockFace + p.palletTail
  const wE = L - B.r
  const entry: Outline = {
    edges: [
      { kind: 'arc', c: [0, 0], r: L, a0: A.a, a1: eHi, ccw: true, tag: 'lock' },
      { kind: 'seg', a: v2.polar(L, eHi), b: v2.polar(B.r, eHi), tag: 'body' },
      { kind: 'arc', c: [0, 0], r: B.r, a0: B.a, a1: eHi, ccw: false, tag: 'body' },
      { kind: 'seg', a: v2.polar(B.r, B.a), b: v2.polar(L, A.a), tag: 'impulse' },
    ],
  }

  // —— 出瓦：内弧锁面（半径 L），冲击面从 C 斜向外到 D ——
  const C = polar(toAnchor(tip(aX), relX))
  const Dq = polar(toAnchor(tip(aX + p.impulseWheel), relX - p.lift))
  const xLo = C.a - p.lockFace - p.palletTail
  const wX = Dq.r - L
  const exit: Outline = {
    edges: [
      { kind: 'seg', a: v2.polar(L, C.a), b: v2.polar(Dq.r, Dq.a), tag: 'impulse' },
      { kind: 'arc', c: [0, 0], r: Dq.r, a0: xLo, a1: Dq.a, ccw: false, tag: 'body' },
      { kind: 'seg', a: v2.polar(Dq.r, xLo), b: v2.polar(L, xLo), tag: 'body' },
      { kind: 'arc', c: [0, 0], r: L, a0: xLo, a1: C.a, ccw: true, tag: 'lock' },
    ],
  }

  // —— 齿：齿尖平台、前倾的前齿面、略弯的齿背 ——
  const { land, rake, rootWidth } = p.tooth
  const depth = R - p.rootR
  const rr = p.rootR - 0.6
  const fRoot = (depth * Math.tan(rake)) / p.rootR // 前齿面根部落后于齿尖的角度
  const bRoot = fRoot + rootWidth / p.rootR
  const landA = land / R
  const tooth: Vec2[] = [
    v2.polar(rr, -fRoot - (0.6 * Math.tan(rake)) / rr),
    v2.polar(R, 0),
    v2.polar(R, -landA),
    v2.polar(R - depth * 0.5, -landA - (bRoot - landA) * 0.6),
    v2.polar(rr, -bRoot),
  ]

  return {
    params: p,
    teeth: N,
    pitch,
    tipR: R,
    rootR: p.rootR,
    pivot,
    lockR: L,
    palletWidth: [wE, wX],
    tooth,
    pallets: [entry, exit],
    releaseEntry: relE,
    lockedTipAngle: [aE, aX],
  }
}

/** 世界（规范坐标）中的叉瓦轮廓。 */
export function palletsAt(g: GrahamGeometry, phi: number): [Outline, Outline] {
  return [transformOutline(g.pallets[0], phi, g.pivot), transformOutline(g.pallets[1], phi, g.pivot)]
}

/** 世界（规范坐标）中的第 j 号齿。 */
export function toothAt(g: GrahamGeometry, psi: number, j: number): Vec2[] {
  const a = psi + j * g.pitch
  return g.tooth.map((q) => rot(q, a))
}

/** 叉瓦附近的齿（齿尖方位在两侧锁定方位 ±2.2 个齿距内）。 */
export function teethNearPallets(g: GrahamGeometry, psi: number): number[] {
  const out: number[] = []
  for (let j = 0; j < g.teeth; j++) {
    const a = psi + j * g.pitch
    if (g.lockedTipAngle.some((lt) => Math.abs(wrapPi(a - lt)) < 2.2 * g.pitch)) out.push(j)
  }
  return out
}

/** 给定叉角与轮子转角，轮子往前最多还能转多少（未扣退让角）。 */
export function forwardContact(g: GrahamGeometry, phi: number, psi: number, maxDelta: number): ContactHit | null {
  const polys = teethNearPallets(g, psi).map((j) => toothAt(g, psi, j))
  return firstContact(polys, palletsAt(g, phi), maxDelta)
}

/** 齿与叉瓦是否穿模（叉瓦按 0.01 rad 离散；内接折线误差 < 1e-3 mm）。 */
export function escapementOverlaps(g: GrahamGeometry, phi: number, psi: number, palletPolys?: [Vec2[], Vec2[]]): boolean {
  const pp = palletPolys ?? palletPolygons(g, phi)
  const polys = teethNearPallets(g, psi).map((j) => toothAt(g, psi, j))
  for (const P of pp) {
    const pb = polyBound(P)
    for (const tp of polys) {
      const tb = polyBound(tp)
      if (v2.dist(tb.c, pb.c) > tb.r + pb.r) continue
      if (polygonsOverlap(tp, P)) return true
    }
  }
  return false
}

const palletLocalPolys = new WeakMap<GrahamGeometry, [Vec2[], Vec2[]]>()

/** 叉角 φ 时两叉瓦的世界多边形。 */
export function palletPolygons(g: GrahamGeometry, phi: number): [Vec2[], Vec2[]] {
  let local = palletLocalPolys.get(g)
  if (!local) {
    local = [outlinePolygon(g.pallets[0], 0.01), outlinePolygon(g.pallets[1], 0.01)]
    palletLocalPolys.set(g, local)
  }
  const tf = (q: Vec2) => v2.add(rot(q, phi), g.pivot)
  return [local[0].map(tf), local[1].map(tf)]
}

// ———————————————————— 求解器 ————————————————————

export type EscPhase = 'lock' | 'impulse' | 'drop'

export interface EscapementSample {
  t: number
  phi: number
  psi: number
  phase: EscPhase
  /** 接触中的叉瓦；落的阶段为刚放开的那一侧 */
  pallet: PalletName
}

export interface SolveOpts {
  /** 叉角随时间的函数（rad），须以 period 为周期 */
  anchor: (t: number) => number
  period: number
  /** 一周期的步数 */
  steps: number
  /** 自由转动（落）时的等效角加速度（rad/s²）= 驱动力矩 / 轮系等效转动惯量 */
  freeAccel: number
  /** 轮子停在接触前的退让角（rad），避免面面重合 */
  backoff: number
  /** t = 0 时轮子的大致转角（从这里往前找首次接触）。先空跑一周期进入稳态再记录。 */
  psiGuess: number
}

export interface EscapementSolution {
  geometry: GrahamGeometry
  period: number
  samples: EscapementSample[]
  /** 一周期内轮子的净前进角（直进式应恰为一个齿距） */
  advance: number
  /** 记录周期内的最大回退角（叉瓦压进齿、把轮子往回推的角度） */
  maxRecoil: number
}

interface SolverState {
  psi: number
  vel: number
  inContact: boolean
  lastPallet: PalletName
}

function stepSolver(g: GrahamGeometry, o: SolveOpts, st: SolverState, phi: number, dt: number): number {
  let recoil = 0
  // 1. 叉瓦先到位：若压进了齿，把轮子往回推（回退）到刚好不穿模
  const pp = palletPolygons(g, phi)
  if (escapementOverlaps(g, phi, st.psi, pp)) {
    let lo = 0
    let hi = 0.002
    while (escapementOverlaps(g, phi, st.psi - hi, pp)) {
      hi *= 2
      if (hi > g.pitch) throw new Error('擒纵求解：叉瓦压进齿里且无法退出（几何有误）')
    }
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2
      if (escapementOverlaps(g, phi, st.psi - mid, pp)) lo = mid
      else hi = mid
    }
    recoil = hi + o.backoff
    st.psi -= recoil
    st.vel = 0
    st.inContact = true
  }
  // 2. 轮子在驱动力矩下往前
  const followTol = Math.max(4 * o.backoff, 0.004)
  const freeStep = Math.max(0, st.vel) * dt + 0.5 * o.freeAccel * dt * dt
  const hit = forwardContact(g, phi, st.psi, Math.max(freeStep, followTol) + o.backoff)
  const allowed = hit ? hit.delta - o.backoff : Infinity
  let adv: number
  if (st.inContact && allowed <= followTol) {
    adv = Math.max(0, allowed) // 贴着接触面：锁住时不动，冲击时被斜面放行
  } else {
    adv = Math.min(freeStep, Math.max(0, allowed)) // 接触面走完：自由转动，直到碰上
    st.inContact = allowed <= freeStep
  }
  st.vel = adv / dt
  st.psi += adv
  if (hit && st.inContact) st.lastPallet = PALLET_NAMES[hit.obstacle]
  return recoil
}

/**
 * 预先求解一周期的「时刻 → 叉角、轮转角、阶段」表；运行时对 t 取模插值，仍是 t 的纯函数。
 * 先空跑一周期消去初值的影响，再记录第二个周期。
 */
export function solveEscapement(g: GrahamGeometry, o: SolveOpts): EscapementSolution {
  const dt = o.period / o.steps
  const init = forwardContact(g, o.anchor(0), o.psiGuess, g.pitch)
  if (!init) throw new Error('擒纵求解：初始位置找不到接触')
  const st: SolverState = { psi: o.psiGuess + init.delta - o.backoff, vel: 0, inContact: true, lastPallet: PALLET_NAMES[init.obstacle] }
  for (let i = 1; i <= o.steps; i++) stepSolver(g, o, st, o.anchor(i * dt), dt)
  const samples: EscapementSample[] = []
  let maxRecoil = 0
  for (let i = 0; i <= o.steps; i++) {
    const t = i * dt
    const phi = o.anchor(t)
    if (i > 0) maxRecoil = Math.max(maxRecoil, stepSolver(g, o, st, phi, dt))
    const probe = forwardContact(g, phi, st.psi, o.backoff * 1.001 + 1e-9)
    let phase: EscPhase = 'drop'
    let pallet = st.lastPallet
    if (probe) {
      phase = probe.tag === 'lock' ? 'lock' : 'impulse'
      pallet = PALLET_NAMES[probe.obstacle]
    }
    samples.push({ t, phi, psi: st.psi, phase, pallet })
  }
  return { geometry: g, period: o.period, samples, advance: samples[o.steps].psi - samples[0].psi, maxRecoil }
}

/** 由一周期的解得到任意实数时刻的轮子累计转角与阶段：每过一周期整体前进 advance。 */
export function escapementAt(sol: EscapementSolution, t: number): EscapementSample & { cycle: number } {
  const T = sol.period
  const cycle = Math.floor(t / T)
  const tau = t - cycle * T
  const n = sol.samples.length - 1
  const x = (tau / T) * n
  const i = Math.min(n - 1, Math.max(0, Math.floor(x)))
  const f = x - i
  const a = sol.samples[i]
  const b = sol.samples[i + 1]
  const near = f < 0.5 ? a : b
  return {
    t,
    cycle,
    phi: a.phi + (b.phi - a.phi) * f,
    psi: a.psi + (b.psi - a.psi) * f + cycle * sol.advance,
    phase: near.phase,
    pallet: near.pallet,
  }
}
