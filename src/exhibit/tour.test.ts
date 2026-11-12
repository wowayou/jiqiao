// 讲解时间窗：纯函数的单元测试，以及对注册表里每个展品都跑的检查——
// 每一环都能解析出时间窗；有 active 的环，窗内确实有采样点为真；窗内零件在动（不是一段静止画面）。
import { describe, expect, test } from 'vitest'
import { exhibitLoaders } from './registry'
import { evaluateScene } from './scene'
import { firstActiveRun, padWindow, stepWindow, tourDomain, tourPlan, tourTick, type TourDomain } from './tour'
import type { AnyExhibit } from './types'

const cyc = (period: number, minor?: { period: number; offset?: number }) =>
  ({ timeline: { kind: 'cyclic', period, speeds: [1], minor: minor && { ...minor, unit: '格' } }, defaults: {} }) as unknown as AnyExhibit

describe('推导范围', () => {
  test('有小循环用小循环；周期不长用整个周期；很长又没有小循环只看开头；榫卯是整个进度', () => {
    expect(tourDomain(cyc(43200, { period: 2 }))).toEqual({ start: 0, length: 2, repeats: true })
    expect(tourDomain(cyc(10, { period: 5, offset: 1 }))).toEqual({ start: 1, length: 5, repeats: true })
    expect(tourDomain(cyc(4))).toEqual({ start: 0, length: 4, repeats: true })
    expect(tourDomain(cyc(6000)).length).toBeLessThanOrEqual(120)
    expect(tourDomain({ timeline: { kind: 'assembly', duration: 6, speeds: [1] } } as unknown as AnyExhibit)).toEqual({ start: 0, length: 1, repeats: false })
  })
})

describe('第一段连续为真的区间', () => {
  const d: TourDomain = { start: 0, length: 10, repeats: true }
  test('普通区间', () => {
    const r = firstActiveRun((t) => t >= 3 && t < 5, d, 100)!
    expect(r[0]).toBeCloseTo(3, 6)
    expect(r[1]).toBeCloseTo(4.9, 6)
  })
  test('有两段时取第一段', () => {
    const r = firstActiveRun((t) => (t >= 2 && t < 3) || (t >= 6 && t < 8), d, 100)!
    expect(r[0]).toBeCloseTo(2, 6)
    expect(r[1]).toBeLessThan(3)
  })
  test('跨过格线的一段接起来（重复的范围）', () => {
    const r = firstActiveRun((t) => t < 1 || t >= 9, d, 100)!
    expect(r[0]).toBeCloseTo(-1, 6)
    expect(r[1]).toBeCloseTo(0.9, 6)
  })
  test('不重复的范围不接', () => {
    const r = firstActiveRun((t) => t < 1 || t >= 9, { ...d, repeats: false }, 100)!
    expect(r[0]).toBe(0)
    expect(r[1]).toBeCloseTo(0.9, 6)
  })
  test('一直为假返回 null，一直为真返回整个范围', () => {
    expect(firstActiveRun(() => false, d, 50)).toBeNull()
    expect(firstActiveRun(() => true, d, 50)).toEqual([0, 10])
  })
  test('余量：前后各留区间长 1/4、至少范围的 2%；榫卯夹在 [0,1]', () => {
    expect(padWindow([2, 6], d, cyc(10))).toEqual([1, 7])
    expect(padWindow([2, 2.1], d, cyc(10))[0]).toBeCloseTo(1.8, 9)
    const asm = { timeline: { kind: 'assembly', duration: 6, speeds: [1] } } as unknown as AnyExhibit
    expect(padWindow([0, 0.5], { start: 0, length: 1, repeats: false }, asm)).toEqual([0, 0.625])
  })
})

describe('讲解循环的下一刻', () => {
  test('窗内前进，走出窗尾回到窗头', () => {
    expect(tourTick(2, [1, 3], 1, 0.5, 10, true)).toBeCloseTo(2.5)
    expect(tourTick(2.8, [1, 3], 1, 0.5, 10, true)).toBe(1)
  })
  test('窗跨过 0：t 在周期末尾也算在窗内', () => {
    expect(tourTick(9.8, [-0.5, 0.5], 1, 0.1, 10, true)).toBeCloseTo(-0.1 + 0.0, 6)
    expect(tourTick(0.2, [-0.5, 0.5], 1, 0.1, 10, true)).toBeCloseTo(0.3, 6)
  })
  test('观众拖到窗外后再播放：从窗头开始', () => {
    expect(tourTick(7, [1, 3], 1, 0.1, 10, true)).toBe(1)
    expect(tourTick(0.9, [0.2, 0.6], 0.1, 0.1, 1, false)).toBe(0.2)
  })
})

const ids = Object.keys(exhibitLoaders).sort()

describe.each(ids)('展品 %s 的讲解计划', (id) => {
  test('每一环都有时间窗；有 active 的环窗内确有采样点为真；窗内这一环的零件在动', async () => {
    const def = await exhibitLoaders[id]()
    const plan = tourPlan(def)
    const span = def.timeline.kind === 'cyclic' ? def.timeline.period : 1
    def.chain.forEach((step, i) => {
      const p = plan[i]
      expect(p, `${step.id} 没有时间窗`).not.toBeNull()
      expect(stepWindow(def, step)).toEqual(p!.window)
      const [a, b] = p!.window
      expect(b).toBeGreaterThan(a)
      expect(p!.speed).toBeGreaterThan(0)
      // 一次循环的真实时长在 1–15 秒之间（自动推导取约 5 秒）
      expect((b - a) / p!.rate).toBeGreaterThan(1)
      expect((b - a) / p!.rate).toBeLessThan(15)
      const times = Array.from({ length: 201 }, (_, k) => a + ((b - a) * k) / 200)
      const at = (t: number) => def.simulate(def.timeline.kind === 'cyclic' ? ((t % span) + span) % span : t, def.defaults)
      if (step.active) expect(times.some((t) => step.active!(at(t))), `${step.id} 窗内 active 从未为真`).toBe(true)
      // 这一环引用的零件（整件或特征所在的零件）里，至少有一个在窗内位置或可见性有变化
      const ids = [...new Set(step.parts.map((r) => r.split('#')[0]))]
      const keyOf = (pid: string) => [...evaluateScene(def, at(a)).keys()].filter((k) => k === pid || k.startsWith(`${pid}:`))
      const sig = (t: number) => {
        const sc = evaluateScene(def, at(t))
        return ids.flatMap((pid) => keyOf(pid).map((k) => sc.get(k)!)).map((s) => [...s.pose.p, ...(s.pose.q ?? []), s.visible ? 1 : 0])
      }
      const s0 = sig(a)
      const moving = times.some((t) => sig(t).some((v, j) => v.some((x, k) => Math.abs(x - s0[j][k]) > 1e-6)))
      expect(moving, `${step.id} 的零件在窗内一动不动`).toBe(true)
    })
  })
})
