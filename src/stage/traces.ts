// 迹线（纯函数，不依赖 three / React）：机器最关键的一两个量随时间的曲线。取样、展开、纵轴范围、缓存与分片计算。
// 数值一律出自 simulate；台阶形的线照样本画折线，不做任何平滑。
import type { AnyExhibit, TraceDef } from '../exhibit/types'
import { minorPos } from './timeline'

/** 每条迹线的取样点数（含两端，共 TRACE_SAMPLES + 1 个点） */
export const TRACE_SAMPLES = 240

export interface TraceDomain {
  start: number
  length: number
}

/** 迹线画的那一段：有小循环画当前小循环（与细调条对齐），否则整个周期 / 装配进度（与主进度条对齐）。 */
export function traceDomain(def: AnyExhibit, t: number): TraceDomain {
  const tl = def.timeline
  if (tl.kind === 'assembly') return { start: 0, length: 1 }
  if (tl.minor) return { start: minorPos(tl.minor, tl.period, t).start, length: tl.minor.period }
  return { start: 0, length: tl.period }
}

const wrapTime = (def: AnyExhibit, t: number) => {
  const tl = def.timeline
  if (tl.kind === 'assembly') return Math.min(1, Math.max(0, t))
  return ((t % tl.period) + tl.period) % tl.period
}

export function sampleTimes(d: TraceDomain, n = TRACE_SAMPLES): number[] {
  return Array.from({ length: n + 1 }, (_, i) => d.start + (d.length * i) / n)
}

/** 有周期的量（转角 0–360°）按 wrap 展开成连续的线：相邻两点跳变超过半个 wrap 视为绕回。 */
export function unwrapSeries(values: number[], wrap?: number): number[] {
  if (!wrap || values.length === 0) return values.slice()
  const out = [values[0]]
  let k = 0
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    if (d > wrap / 2) k -= wrap
    else if (d < -wrap / 2) k += wrap
    out.push(values[i] + k)
  }
  return out
}

/** 纵轴范围：取样的最小、最大值上下各留 8%；整条是平的，就以它为中心给 ±1（或 ±5%）。 */
export function traceRange(values: number[]): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (!Number.isFinite(v)) continue
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (!Number.isFinite(lo)) return [0, 1]
  if (hi - lo < 1e-9) {
    const pad = Math.max(1, Math.abs(lo) * 0.05)
    return [lo - pad, hi + pad]
  }
  const pad = (hi - lo) * 0.08
  return [lo - pad, hi + pad]
}

/** 当前值（未展开）放到展开后的曲线上：加减整数个 wrap，取离 t 处样本最近的那一个。 */
export function placeOnSeries(value: number, near: number, wrap?: number): number {
  if (!wrap) return value
  return value + Math.round((near - value) / wrap) * wrap
}

/** 已展开曲线在 t 处的线性插值 */
export function seriesAt(d: TraceDomain, series: number[], t: number): number {
  const n = series.length - 1
  const u = Math.min(n, Math.max(0, ((t - d.start) / d.length) * n))
  const i = Math.min(n - 1, Math.floor(u))
  const f = u - i
  return series[i] * (1 - f) + series[i + 1] * f
}

export interface TraceSamples {
  domain: TraceDomain
  times: number[]
  /** 每条迹线一列，已按 wrap 展开 */
  series: number[][]
  ranges: [number, number][]
}

export function finishSamples(def: AnyExhibit, domain: TraceDomain, times: number[], raw: number[][]): TraceSamples {
  const traces = def.traces ?? []
  const series = traces.map((tr, j) => unwrapSeries(raw[j], tr.wrap))
  return { domain, times, series, ranges: series.map(traceRange) }
}

/** 一次取完（单元测试与便宜的展品用） */
export function sampleTraces(def: AnyExhibit, controls: unknown, domain: TraceDomain, n = TRACE_SAMPLES): TraceSamples {
  const traces = (def.traces ?? []) as TraceDef<unknown>[]
  const times = sampleTimes(domain, n)
  const raw = traces.map(() => [] as number[])
  for (const t of times) {
    const s = def.simulate(wrapTime(def, t), controls)
    traces.forEach((tr, j) => raw[j].push(tr.value(s)))
  }
  return finishSamples(def, domain, times, raw)
}

/** 缓存键：展品 + 这一段的起点 + 控件值（控件变了要重算） */
export const traceKey = (def: AnyExhibit, domain: TraceDomain, controls: unknown) =>
  `${def.meta.id}|${domain.start.toFixed(6)}|${domain.length}|${JSON.stringify(controls)}`

/**
 * 分片取样：每片最多用 budgetMs 毫秒，片与片之间让出主线程（setTimeout 0），simulate 慢的展品也不卡住画面。
 * 结果按 traceKey 缓存（最近 16 段）。返回取消函数。
 */
const cache = new Map<string, TraceSamples>()
const CACHE_MAX = 16

export function cachedTraces(key: string): TraceSamples | undefined {
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
  }
  return hit
}

export function sampleTracesAsync(
  def: AnyExhibit,
  controls: unknown,
  domain: TraceDomain,
  done: (r: TraceSamples) => void,
  budgetMs = 6,
  n = TRACE_SAMPLES,
): () => void {
  const key = traceKey(def, domain, controls)
  const hit = cachedTraces(key)
  if (hit) {
    done(hit)
    return () => {}
  }
  const traces = (def.traces ?? []) as TraceDef<unknown>[]
  const times = sampleTimes(domain, n)
  const raw = traces.map(() => [] as number[])
  let i = 0
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const chunk = () => {
    if (cancelled) return
    const t0 = performance.now()
    while (i < times.length) {
      const s = def.simulate(wrapTime(def, times[i]), controls)
      traces.forEach((tr, j) => raw[j].push(tr.value(s)))
      i++
      if (performance.now() - t0 > budgetMs) break
    }
    if (i < times.length) {
      timer = setTimeout(chunk, 0)
      return
    }
    const r = finishSamples(def, domain, times, raw)
    cache.set(key, r)
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
    done(r)
  }
  chunk()
  return () => {
    cancelled = true
    if (timer) clearTimeout(timer)
  }
}

/** 数值显示：大数不带小数，小数按量级给 1–2 位 */
export function formatTraceValue(v: number, unit = ''): string {
  const a = Math.abs(v)
  const s = a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2)
  return `${s}${unit}`
}
