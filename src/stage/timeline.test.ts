import { describe, expect, test } from 'vitest'
import { formatTime, mainStep, minorPos, stepSize } from './timeline'

const clock = { timeline: { kind: 'cyclic', period: 43200, speeds: [1], minor: { period: 2, unit: '摆' } } } as never
const dui = { timeline: { kind: 'cyclic', period: 10, speeds: [1], minor: { period: 5, unit: '次起落', offset: 1 } } } as never
const plain = { timeline: { kind: 'cyclic', period: 20, speeds: [1] } } as never

describe('时间轴辅助', () => {
  test('长周期显示时:分:秒，不显示「x / 43200 秒」', () => {
    expect(formatTime(21.4, 43200)).toBe('0:00:21')
    expect(formatTime(43199, 43200)).toBe('11:59:59')
    expect(formatTime(43200, 43200)).toBe('12:00:00')
    expect(formatTime(199.9, 6000)).toBe('0:03:19')
    expect(formatTime(6000, 6000)).toBe('1:40:00')
    expect(formatTime(65.43, 150)).toBe('1:05.4')
    expect(formatTime(3.256, 10)).toBe('3.26 秒')
  })
  test('小循环定位：第几个、从哪一刻起', () => {
    const m = { period: 2, unit: '摆' }
    expect(minorPos(m, 43200, 0)).toEqual({ start: 0, index: 1, count: 21600 })
    expect(minorPos(m, 43200, 3.99)).toMatchObject({ start: 2, index: 2 })
    expect(minorPos(m, 43200, 43199.5)).toMatchObject({ index: 21600 })
    const d = { period: 5, unit: '次起落', offset: 1 }
    expect(minorPos(d, 10, 0.5)).toEqual({ start: -4, index: 2, count: 2 })
    expect(minorPos(d, 10, 1)).toMatchObject({ start: 1, index: 1 })
    expect(minorPos(d, 10, 5.99)).toMatchObject({ start: 1, index: 1 })
    expect(minorPos(d, 10, 6)).toMatchObject({ start: 6, index: 2 })
  })
  test('单步与主条步长：长周期按小循环取整，短周期仍是周期的 1/1000', () => {
    expect(mainStep(clock)).toBe(2)
    expect(mainStep(dui)).toBe(0.01)
    expect(mainStep(plain)).toBe(0.02)
    expect(stepSize(clock)).toBeCloseTo(0.05)
    expect(stepSize(dui)).toBeCloseTo(0.125)
    expect(stepSize(plain)).toBeCloseTo(20 / 72)
  })
})
