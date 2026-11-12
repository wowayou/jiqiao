import { describe, expect, test } from 'vitest'
import type { Vec2 } from '../kinematics/vec'
import { STILL_FRACTION, peakSpeed, solveDrag } from './drive'
import { wrapT } from './store'

// 匀速转动：屏幕上半径 100 px 的圆，ω = 2π / 4（4 秒一圈）
const W = (2 * Math.PI) / 4
const circle = (t: number): Vec2 => [200 + 100 * Math.cos(W * t), 200 + 100 * Math.sin(W * t)]
const base = { h: 0.001, minSpeed: 1, maxDt: 1 }

describe('拖动求解', () => {
  test('匀速转动：指针沿圆走到 t+0.1 处，dt ≈ 0.1；反方向 dt ≈ −0.1', () => {
    const r = solveDrag({ ...base, project: circle, t: 0.5, target: circle(0.6) })
    expect(r.status).toBe('ok')
    expect(r.dt).toBeCloseTo(0.1, 3)
    const back = solveDrag({ ...base, project: circle, t: 0.5, target: circle(0.4) })
    expect(back.dt).toBeCloseTo(-0.1, 3)
  })
  test('指针偏离轨迹：只取沿轨迹的分量（停在离指针最近的点）', () => {
    const p = circle(1)
    const out: Vec2 = [p[0] + (p[0] - 200) * 0.5, p[1] + (p[1] - 200) * 0.5] // 径向往外拉
    const r = solveDrag({ ...base, project: circle, t: 1, target: out })
    expect(Math.abs(r.dt)).toBeLessThan(1e-3)
  })
  test('此刻不动（|v| ≈ 0）：不响应', () => {
    const r = solveDrag({ ...base, project: () => [10, 10], t: 3, target: [60, 10] })
    expect(r.status).toBe('still')
    expect(r.dt).toBe(0)
  })
  test('运动方向正对视线（屏幕速度很小）：不响应', () => {
    const r = solveDrag({ ...base, minSpeed: 5, project: (t) => [100 + 0.01 * t, 100], t: 0, target: [140, 100] })
    expect(r.status).toBe('still')
  })
  test('奇异位置：速度刚过阈值、指针却拉得很远，单次 dt 被限幅', () => {
    const r = solveDrag({ ...base, maxDt: 0.25, project: (t) => [100 + 2 * t, 100], t: 0, target: [400, 100] })
    expect(r.dt).toBeCloseTo(0.25, 9)
  })
  test('折返点（摆到最高处）：往回拉跟着走，往外推不动', () => {
    const swing = (t: number): Vec2 => [200 + 100 * Math.sin(t), 100]
    const top = Math.PI / 2
    const pullBack = solveDrag({ ...base, project: swing, t: top, target: [290, 100] })
    expect(pullBack.status).toBe('ok')
    expect(swing(top + pullBack.dt)[0]).toBeCloseTo(290, 0)
    const pushOut = solveDrag({ ...base, project: swing, t: top, target: [330, 100] })
    expect(pushOut.status).toBe('blocked')
    expect(pushOut.dt).toBe(0)
  })
  test('装配进度夹在 [0, 1]：拖过头停在 1；在 1 处继续往外推不动，往回拉能退', () => {
    const slide = (t: number): Vec2 => [100 + 300 * t, 50]
    const over = solveDrag({ ...base, maxDt: 2, project: slide, t: 0.9, target: [600, 50], bounds: [0, 1] })
    expect(0.9 + over.dt).toBeCloseTo(1, 9)
    const atEnd = solveDrag({ ...base, project: slide, t: 1, target: [450, 50], bounds: [0, 1] })
    expect(atEnd.status).toBe('blocked')
    const back = solveDrag({ ...base, project: slide, t: 1, target: [340, 50], bounds: [0, 1] })
    expect(1 + back.dt).toBeCloseTo(0.8, 6)
  })
  test('缓动起步很慢的段首：放大差分步长后仍能拖动', () => {
    const ease = (t: number): Vec2 => {
      const u = Math.min(1, Math.max(0, t))
      return [100 + 300 * u * u * (3 - 2 * u), 50]
    }
    const r = solveDrag({ ...base, h: 0.003, minSpeed: 0.04 * 450, project: ease, t: 0, target: [110, 50], bounds: [0, 1] })
    expect(r.status).toBe('ok')
    expect(r.dt).toBeGreaterThan(0)
  })
  test('峰值速度与阈值：匀速圆周的峰值 = ωR', () => {
    const v = peakSpeed(circle, 0, 4, 1e-4)
    expect(v).toBeCloseTo(W * 100, 1)
    expect(STILL_FRACTION).toBeGreaterThan(0)
    expect(STILL_FRACTION).toBeLessThan(0.2)
  })
})

describe('时间回绕', () => {
  const cyc = { timeline: { kind: 'cyclic', period: 10, speeds: [1] } } as never
  const asm = { timeline: { kind: 'assembly', duration: 6, speeds: [1] } } as never
  test('周期性时间轴：越过周期末尾回到开头，越过开头回到末尾', () => {
    expect(wrapT(cyc, 9.9 + 0.3)).toBeCloseTo(0.2, 9)
    expect(wrapT(cyc, 0.1 - 0.3)).toBeCloseTo(9.8, 9)
  })
  test('装配进度：夹在 [0, 1]', () => {
    expect(wrapT(asm, 1.2)).toBe(1)
    expect(wrapT(asm, -0.1)).toBe(0)
  })
})
