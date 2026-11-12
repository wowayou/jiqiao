import { describe, expect, test } from 'vitest'
import { exhibitLoaders } from '../exhibit/registry'
import type { AnyExhibit } from '../exhibit/types'
import {
  TRACE_SAMPLES,
  cachedTraces,
  formatTraceValue,
  placeOnSeries,
  sampleTraces,
  sampleTracesAsync,
  seriesAt,
  traceDomain,
  traceKey,
  traceRange,
  unwrapSeries,
} from './traces'

// 一个最小的假展品：x = t（锯齿 0..10 循环），angle = 90°/s 取模 360，step = floor(t)
const fake = (minor?: { period: number; offset?: number }) =>
  ({
    meta: { id: 'fake' },
    timeline: { kind: 'cyclic', period: 10, speeds: [1], minor: minor && { ...minor, unit: '格' } },
    defaults: { k: 1 },
    simulate: (t: number, c: { k: number }) => ({ t, k: c.k }),
    traces: [
      { id: 'x', label: 'x', value: (s: { t: number; k: number }) => s.t * s.k, provenance: 'calc' },
      { id: 'a', label: '角', value: (s: { t: number }) => (s.t * 90) % 360, provenance: 'calc', wrap: 360 },
      { id: 's', label: '台阶', value: (s: { t: number }) => Math.floor(s.t), provenance: 'calc' },
    ],
  }) as unknown as AnyExhibit

describe('迹线取样', () => {
  test('画的那一段：有小循环画当前小循环，否则整个周期；榫卯整个进度', () => {
    expect(traceDomain(fake({ period: 2 }), 5.3)).toEqual({ start: 4, length: 2 })
    expect(traceDomain(fake({ period: 5, offset: 1 }), 0.5)).toEqual({ start: -4, length: 5 })
    expect(traceDomain(fake(), 7)).toEqual({ start: 0, length: 10 })
    expect(traceDomain({ timeline: { kind: 'assembly', duration: 6, speeds: [1] } } as unknown as AnyExhibit, 0.3)).toEqual({ start: 0, length: 1 })
  })
  test('约 240 个点，数值出自 simulate；时间越过周期时按周期回绕后再求', () => {
    const r = sampleTraces(fake({ period: 5, offset: 1 }), { k: 1 }, { start: 6, length: 5 })
    expect(r.times.length).toBe(TRACE_SAMPLES + 1)
    expect(r.series[0][0]).toBeCloseTo(6)
    // t = 11 → 回绕成 1
    expect(r.series[0].at(-1)).toBeCloseTo(1)
  })
  test('转角按 wrap 展开成连续曲线，不出现竖直的跳变', () => {
    expect(unwrapSeries([350, 355, 2, 8], 360)).toEqual([350, 355, 362, 368])
    expect(unwrapSeries([10, 5, 355], 360)).toEqual([10, 5, -5])
    // 只取周期内的一段（假展品的转角周期 4 s 不整除时间轴周期 10 s，跨周期会跳）
    const r = sampleTraces(fake(), { k: 1 }, { start: 0, length: 8 })
    const a = r.series[1]
    for (let i = 1; i < a.length; i++) expect(Math.abs(a[i] - a[i - 1])).toBeLessThan(10)
    expect(a.at(-1)! - a[0]).toBeCloseTo(720, 6)
  })
  test('台阶形的线不被平滑：相邻样本要么相等、要么整级跳变', () => {
    const r = sampleTraces(fake(), { k: 1 }, { start: 0, length: 9 })
    const s = r.series[2]
    for (let i = 1; i < s.length; i++) expect([0, 1]).toContain(s[i] - s[i - 1])
  })
  test('纵轴范围按取样结果自动定：上下留 8%；平线给出非零的范围', () => {
    expect(traceRange([0, 10])).toEqual([-0.8, 10.8])
    const [lo, hi] = traceRange([5, 5, 5])
    expect(lo).toBeLessThan(5)
    expect(hi).toBeGreaterThan(5)
    expect(traceRange([NaN])).toEqual([0, 1])
  })
  test('当前值放到展开后的曲线上；曲线插值', () => {
    expect(placeOnSeries(10, 368, 360)).toBe(370)
    expect(placeOnSeries(10, 8, 360)).toBe(10)
    expect(seriesAt({ start: 0, length: 2 }, [0, 10, 20], 1.5)).toBeCloseTo(15)
  })
  test('数值格式', () => {
    expect(formatTraceValue(123.4, '°')).toBe('123°')
    expect(formatTraceValue(12.34, ' mm')).toBe('12.3 mm')
    expect(formatTraceValue(1.234)).toBe('1.23')
  })
})

describe('分片取样与缓存', () => {
  test('结果与一次取完相同；同一段、同一控件值命中缓存；控件值变了重算', async () => {
    const def = fake()
    const d = { start: 0, length: 10 }
    const r = await new Promise<ReturnType<typeof sampleTraces>>((res) => sampleTracesAsync(def, { k: 2 }, d, res, 0.01))
    expect(r.series).toEqual(sampleTraces(def, { k: 2 }, d).series)
    expect(cachedTraces(traceKey(def, d, { k: 2 }))).toBe(r)
    expect(cachedTraces(traceKey(def, d, { k: 3 }))).toBeUndefined()
    const r3 = await new Promise<ReturnType<typeof sampleTraces>>((res) => sampleTracesAsync(def, { k: 3 }, d, res))
    expect(r3.series[0].at(-1)).toBeCloseTo(0) // t = 10 回绕成 0
    expect(r3.series[0][120]).toBeCloseTo(15)
  })
  test('取消后不再回调', async () => {
    let called = false
    // 预算为负：每片只取一个点，第一片之后一定还没取完
    const cancel = sampleTracesAsync(fake(), { k: 9 }, { start: 0, length: 10 }, () => (called = true), -1)
    cancel()
    await new Promise((r) => setTimeout(r, 50))
    expect(called).toBe(false)
  })
})

const ids = Object.keys(exhibitLoaders).sort()
describe.each(ids)('展品 %s 的迹线', (id) => {
  test('有 1–3 条迹线；出处为计算所得；在默认画的那一段里取样都是有限数且不是一条平线', async () => {
    const def = await exhibitLoaders[id]()
    const traces = def.traces ?? []
    expect(traces.length).toBeGreaterThanOrEqual(1)
    expect(traces.length).toBeLessThanOrEqual(3)
    const r = sampleTraces(def, def.defaults, traceDomain(def, def.timeline.kind === 'assembly' ? 1 : 0))
    traces.forEach((tr, j) => {
      expect(tr.provenance).toBe('calc')
      expect(r.series[j].every(Number.isFinite)).toBe(true)
      expect(Math.max(...r.series[j]) - Math.min(...r.series[j]), `${tr.id} 是一条平线`).toBeGreaterThan(0)
    })
  })
})
