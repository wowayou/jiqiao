// 讲解（一环一环看）的纯函数：每一环的时间窗、循环速度。展台、界面、结构校验共用，可单测。
//
// 时间窗只在一个「小循环」里推导：记里鼓车周期 6000 秒、摆钟 43 200 秒，不能对整个周期密集采样。
// 只在第 100 圈才发生的事（击鼓）推导不到，展品须在 ChainStep.window 里显式写出。
import type { AnyExhibit, ChainStep } from './types'

/** 讲解中一次循环想要的时长（秒，真实时间） */
export const TOUR_LOOP_SECONDS = 5
/** 「不长」的周期上限（模型秒）：不超过它的周期整个拿来推导；更长且没有小循环的，只看开头这么长 */
export const SHORT_PERIOD = 120
/** 推导时间窗时的采样点数 */
export const WINDOW_SAMPLES = 400

export interface TourDomain {
  /** 起点（模型时间或装配进度） */
  start: number
  length: number
  /** 这一段是否首尾相接地重复（小循环或整个周期）：是的话，首尾都为真的区间可以接起来 */
  repeats: boolean
}

/** 推导时间窗、常态说明循环的那一段：小循环 > 整个周期（不长时） > 周期开头 SHORT_PERIOD 秒；榫卯是整个装配进度。 */
export function tourDomain(def: AnyExhibit): TourDomain {
  const tl = def.timeline
  if (tl.kind === 'assembly') return { start: 0, length: 1, repeats: false }
  if (tl.minor) return { start: tl.minor.offset ?? 0, length: tl.minor.period, repeats: true }
  if (tl.period <= SHORT_PERIOD) return { start: 0, length: tl.period, repeats: true }
  return { start: 0, length: SHORT_PERIOD, repeats: false }
}

/** 在 domain 里采样 active，返回第一段连续为真的区间（未加余量）；一直为假返回 null。 */
export function firstActiveRun(
  active: (t: number) => boolean,
  domain: TourDomain,
  n = WINDOW_SAMPLES,
): [number, number] | null {
  const dt = domain.length / n
  // 重复的一段：最后一个采样点就是下一格的起点，不重复采
  const count = domain.repeats ? n : n + 1
  const on: boolean[] = []
  for (let i = 0; i < count; i++) on.push(Boolean(active(domain.start + i * dt)))
  const first = on.indexOf(true)
  if (first < 0) return null
  if (on.every(Boolean)) return [domain.start, domain.start + domain.length]
  let end = first
  while (end + 1 < count && on[end + 1]) end++
  let start = first
  // 首尾相接：开头就为真、结尾也为真的，是同一段跨过了格线
  if (first === 0 && domain.repeats && on[count - 1]) {
    let back = count - 1
    while (back - 1 > end && on[back - 1]) back--
    start = back - count
  }
  return [domain.start + start * dt, domain.start + end * dt]
}

/** 区间前后留余量：区间长的 1/4，至少是推导范围的 2%；榫卯夹在 [0, 1]。 */
export function padWindow(run: [number, number], domain: TourDomain, def: AnyExhibit): [number, number] {
  const len = run[1] - run[0]
  // 时间窗不超过推导范围本身的长度（几乎一直为真的环，窗就是整个范围）
  const m = Math.max(0, Math.min(Math.max(len * 0.25, domain.length * 0.02), (domain.length - len) / 2))
  let w: [number, number] = [run[0] - m, run[1] + m]
  if (def.timeline.kind === 'assembly') w = [Math.max(0, w[0]), Math.min(1, w[1])]
  return w
}

/**
 * 这一环的时间窗。写了 window 就用它；没有 active 的常态说明循环整个推导范围；
 * 有 active 的取第一段连续为真的区间加余量。推导不出来返回 null（结构校验会报错）。
 */
export function stepWindow<S, C>(def: AnyExhibit, step: ChainStep<S>, controls: C = def.defaults): [number, number] | null {
  if (step.window) return [step.window[0], step.window[1]]
  const domain = tourDomain(def)
  if (!step.active) return [domain.start, domain.start + domain.length]
  const run = firstActiveRun((t) => step.active!(def.simulate(t, controls) as S), domain)
  return run ? padWindow(run, domain, def) : null
}

/** 讲解循环的播放速度倍数（与 timeline.speeds 同义）：写了 speed 用它，否则让一次循环约 TOUR_LOOP_SECONDS 秒。 */
export function stepSpeed(def: AnyExhibit, step: ChainStep<unknown>, win: [number, number]): number {
  if (step.speed) return step.speed
  const len = win[1] - win[0]
  // 榫卯：1× 时整段装配历时 duration 秒
  const base = def.timeline.kind === 'assembly' ? len * def.timeline.duration : len
  return base / TOUR_LOOP_SECONDS
}

export interface StepPlan {
  id: string
  window: [number, number]
  /** 速度倍数 */
  speed: number
  /** 每真实秒走多少模型时间（机械为秒，榫卯为进度） */
  rate: number
  view?: string
}

/** 讲解每一环的计划。控件值使推导失败（如关掉了粮粒）时退回用控件初值推导。 */
export function tourPlan(def: AnyExhibit, controls: unknown = def.defaults): (StepPlan | null)[] {
  return def.chain.map((step) => {
    const win = stepWindow(def, step, controls) ?? stepWindow(def, step, def.defaults)
    if (!win) return null
    const speed = stepSpeed(def, step, win)
    const rate = def.timeline.kind === 'assembly' ? speed / def.timeline.duration : speed
    return { id: step.id, window: win, speed, rate, view: step.view }
  })
}

/**
 * 讲解循环里的下一刻：t 在窗内就往前走 rate·dt，走出窗尾回到窗头；t 不在窗内（观众拖过时间轴）也从窗头开始。
 * 返回未回绕的时间；机械的时间轴由调用方取模。
 */
export function tourTick(t: number, win: [number, number], rate: number, dt: number, span: number, cyclic: boolean): number {
  const len = win[1] - win[0]
  // 窗可以跨过 0（t0 < 0）：把 t 折到窗起点之后的一个周期里再判断
  let d = cyclic ? (((t - win[0]) % span) + span) % span : t - win[0]
  // 调用方回绕 t 时会有末位的浮点误差：t 可能比窗头小一点点，折算后落在周期的最末尾。那就是窗头，不是窗外。
  if (cyclic && span - d < span * 1e-9) d = 0
  if (d < -1e-9 || d > len + 1e-9) return win[0]
  const next = d + rate * dt
  return next > len ? win[0] : win[0] + next
}
