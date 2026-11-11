// 时间轴的纯函数：时间显示、小循环定位、单步大小。界面与 store 共用，可单测。
import type { AnyExhibit, MinorCycle } from '../exhibit/types'

/** 周期很长时：h:mm:ss；一两分钟以上：m:ss.d；否则 x.xx 秒。 */
export function formatTime(t: number, span: number): string {
  if (span >= 3600) {
    const s = Math.floor(t + 1e-9)
    const h = Math.floor(s / 3600)
    return `${h}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }
  if (span >= 100) {
    const tenths = Math.floor(t * 10 + 1e-6)
    const m = Math.floor(tenths / 600)
    const sec = (tenths % 600) / 10
    return `${m}:${sec.toFixed(1).padStart(4, '0')}`
  }
  return `${t.toFixed(2)} 秒`
}

export function minorOf(def: AnyExhibit): MinorCycle | undefined {
  return def.timeline.kind === 'cyclic' ? def.timeline.minor : undefined
}

export interface MinorPos {
  /** 当前小循环从哪一刻起（可能为负，如 offset 把格线放在周期开头之前） */
  start: number
  /** 第几个小循环，从 1 起 */
  index: number
  /** 一共几个 */
  count: number
}

export function minorPos(minor: MinorCycle, period: number, t: number): MinorPos {
  const off = minor.offset ?? 0
  const k = Math.floor((t - off) / minor.period + 1e-9)
  const count = Math.round(period / minor.period)
  return { start: off + k * minor.period, index: ((k % count) + count) % count + 1, count }
}

/** 主进度条是否按小循环取整：小循环很多（> 50）时才有意义，否则仍按周期 1/1000。 */
export function mainStep(def: AnyExhibit): number {
  const span = def.timeline.kind === 'cyclic' ? def.timeline.period : 1
  const m = minorOf(def)
  return m && span / m.period > 50 ? m.period : span / 1000
}

/** 单步（←→）：有小循环按 1/steps，否则周期的 1/72（榫卯 1/40）。 */
export function stepSize(def: AnyExhibit): number {
  const tl = def.timeline
  if (tl.kind === 'assembly') return 1 / 40
  return tl.minor ? tl.minor.period / (tl.minor.steps ?? 40) : tl.period / 72
}
