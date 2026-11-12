// 亲手驱动的求解（纯函数，不依赖 three）：抓住零件上的一点拖动，求时间该走多少，让这一点跟着指针沿自己的轨迹走。
//
// 运动仍只来自 simulate：拖动只改时间 t。记抓取点在 t 与 t±h 的屏幕位置，得屏幕速度 v（px / 单位时间），
// 取 dt = (指针位移 · v) / |v|²。前后两侧分别求速度：在往返运动的折返点（摆锤摆到最高处），
// 往回拉用的是「往后的那一侧」，往外推两侧都不顺着手，就不动。
// |v| 太小（此刻这零件不动，或正对视线运动）时先放大差分步长再试，仍太小就不响应；单次 dt 有上限，防止奇异位置跳变。
import type { Vec2 } from '../kinematics/vec'

export interface DragProblem {
  /** 抓取点在时刻 t 的屏幕坐标（px）；点在相机后面等无法投影时返回 null */
  project: (t: number) => Vec2 | null
  /** 此刻的时间（不必回绕；周期性时间轴由调用方回绕） */
  t: number
  /** 指针此刻的位置（px，已扣掉按下时指针与抓取点的偏差） */
  target: Vec2
  /** 差分步长（时间单位） */
  h: number
  /** 屏幕速度下限（px / 单位时间）：低于它视为「此刻不动」 */
  minSpeed: number
  /** 一次求解的 |dt| 上限 */
  maxDt: number
  /** 时间的取值范围（榫卯装配进度 [0, 1]）；省略 = 周期性，不夹 */
  bounds?: [number, number]
  /** 迭代次数（默认 5）：指针一次移动较多、轨迹是弧线时，逐步贴近 */
  iterations?: number
  /**
   * 此刻零件不动（停着等别的动作做完）时，最多往前、往后各找这么长的时间：找到它开始动、而且是顺着手的方向动的那一刻，
   * 直接跳过去再接着拖。省略 = 不找，此刻不动就拖不动。
   */
  seek?: number
}

export interface DragResult {
  /** 时间该走的量 */
  dt: number
  /** ok：跟上了；still：此刻零件不动或正对视线运动，不响应；blocked：两侧都不顺着手（折返点往外推、到了装配的头） */
  status: 'ok' | 'still' | 'blocked'
}

/**
 * 速度太小时依次放大差分步长再试：装配段首尾是缓动、摆到最高处速度为零，但都并非「不动」。
 * 放大后的步长不超过 maxDt 的一半，免得跨过一整段静止去找别处的运动。
 */
const H_SCALES = [1, 4, 16, 64]

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1]

/** 往前、往后找的格数 */
const SEEK_STEPS = 60

/**
 * 此刻不动：在 [t - seek, t + seek] 里找零件开始顺着手（位移 d）动的时刻。
 * 每一侧只看最先遇到的那一段运动：它若逆着手，这一侧就不再往远处找（不跳过一段相反的运动）。
 * 两侧都找得到时取往前的一侧：时间往前走是机器本来的顺序（抬车把 = 进入「抬平」，而不是把「放把」倒着放）。
 */
function seekMotion(p: DragProblem, t: number, d: Vec2, lo: number, hi: number): number | null {
  const seek = p.seek!
  const speedAt = (a: number, b: number): Vec2 | null => {
    const pa = p.project(a)
    const pb = p.project(b)
    return pa && pb ? [(pb[0] - pa[0]) / (b - a), (pb[1] - pa[1]) / (b - a)] : null
  }
  let fwd: number | null = null
  let back: number | null = null
  let fDone = false
  let bDone = false
  for (let i = 1; i <= SEEK_STEPS && !(fDone && bDone); i++) {
    const off = (seek * i) / SEEK_STEPS
    if (!fDone) {
      const a = t + off
      if (a + p.h > hi) fDone = true
      else {
        const v = speedAt(a, a + p.h)
        if (v && Math.hypot(v[0], v[1]) >= p.minSpeed) {
          if (dot(d, v) > 0) fwd = a
          fDone = true
        }
      }
    }
    if (!bDone) {
      const a = t - off
      if (a - p.h < lo) bDone = true
      else {
        // 时间往回走，零件沿 -v 动
        const v = speedAt(a - p.h, a)
        if (v && Math.hypot(v[0], v[1]) >= p.minSpeed) {
          if (dot(d, v) < 0) back = a
          bDone = true
        }
      }
    }
  }
  return fwd ?? back
}

export function solveDrag(p: DragProblem): DragResult {
  const iters = p.iterations ?? 5
  const [lo, hi] = p.bounds ?? [-Infinity, Infinity]
  let t = Math.min(hi, Math.max(lo, p.t))
  // 单次求解的总量上限从这里算起；跳过一段静止之后从跳到的那一刻算起
  let origin = t
  let sought = false
  let status: DragResult['status'] = 'still'
  for (let it = 0; it < iters; it++) {
    const cur = p.project(t)
    if (!cur) break
    const d = sub(p.target, cur)
    if (Math.hypot(d[0], d[1]) < 0.25) {
      if (it > 0) status = 'ok'
      break
    }
    let step: number | null = null
    let anyMoving = false
    for (const k of H_SCALES) {
      if (k > 1 && p.h * k > p.maxDt / 2) break
      const h = p.h * k
      const tf = Math.min(hi, t + h)
      const tb = Math.max(lo, t - h)
      const pf = tf > t ? p.project(tf) : null
      const pb = tb < t ? p.project(tb) : null
      const vf = pf ? ([(pf[0] - cur[0]) / (tf - t), (pf[1] - cur[1]) / (tf - t)] as Vec2) : null
      const vb = pb ? ([(cur[0] - pb[0]) / (t - tb), (cur[1] - pb[1]) / (t - tb)] as Vec2) : null
      const fOk = vf && Math.hypot(vf[0], vf[1]) >= p.minSpeed
      const bOk = vb && Math.hypot(vb[0], vb[1]) >= p.minSpeed
      if (!fOk && !bOk) continue
      anyMoving = true
      // 往前一侧顺着手（dt > 0）优先；不然看往后一侧（dt < 0）
      const sf = fOk ? dot(d, vf!) / dot(vf!, vf!) : 0
      const sb = bOk ? dot(d, vb!) / dot(vb!, vb!) : 0
      if (sf > 0) step = sf
      else if (sb < 0) step = sb
      break
    }
    if (step === null) {
      if (!anyMoving && p.seek && !sought) {
        sought = true
        const found = seekMotion(p, t, d, lo, hi)
        if (found !== null) {
          t = found
          origin = found
          status = 'ok'
          continue
        }
      }
      if (it === 0) status = anyMoving ? 'blocked' : 'still'
      break
    }
    // 线性外推在弧线、折返点附近会冲过头：走完这一步若没有离指针更近，就把步长减半再试（回溯）
    const dist0 = Math.hypot(d[0], d[1])
    const clampT = (x: number) => Math.min(origin + p.maxDt, Math.max(origin - p.maxDt, Math.min(hi, Math.max(lo, x))))
    let accepted: number | null = null
    for (let s = step, k = 0; k < 12; k++, s /= 2) {
      const tn = clampT(t + s)
      const pn = p.project(tn)
      if (pn && Math.hypot(p.target[0] - pn[0], p.target[1] - pn[1]) < dist0) {
        accepted = tn
        break
      }
    }
    if (accepted === null || accepted === t) {
      if (it === 0 && !sought) status = 'blocked'
      break
    }
    status = 'ok'
    t = accepted
    // 总量不超过上限
    if (Math.abs(t - origin) >= p.maxDt - 1e-12) break
  }
  return { dt: t - Math.min(hi, Math.max(lo, p.t)), status }
}

/**
 * 这一段时间里抓取点在屏幕上的最大速度（px / 单位时间）。驱动的「不动」阈值取它的一小部分：
 * 与零件大小、相机远近、时间单位都无关。
 */
export function peakSpeed(project: (t: number) => Vec2 | null, start: number, length: number, h: number, n = 24): number {
  let peak = 0
  for (let i = 0; i < n; i++) {
    const t = start + (length * i) / n
    const a = project(t)
    const b = project(t + h)
    if (a && b) peak = Math.max(peak, Math.hypot(b[0] - a[0], b[1] - a[1]) / h)
  }
  return peak
}

/** 「不动」阈值占峰值速度的比例 */
export const STILL_FRACTION = 0.04
