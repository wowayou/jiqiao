// 审计工具自身的测试：确认它真能抓到穿模，阈值按 PLAN 计算。
import { beforeAll, describe, expect, test } from 'vitest'
import { getKernel, type Kernel } from '../kernel'
import { auditInterference, auditMotion, auditSolids, cycleTimes, probeDof, THRESHOLD } from './audit'
import { evaluateScene } from './scene'
import { defineExhibit } from './types'
import { validateExhibit } from './validate'

let k: Kernel
beforeAll(async () => {
  k = await getKernel()
})

// 一个滑块沿 X 往复：t=0 时贴着固定方块，t = period/2 时插进去 5 mm
const fake = defineExhibit<{ x: number }, Record<string, never>>({
  meta: { id: 'fake', title: '测试', subtitle: '', category: 'mechanism', era: '', summary: '' },
  intro: [],
  controls: [],
  defaults: {},
  timeline: { kind: 'cyclic', period: 1, speeds: [1] },
  simulate: (t) => ({ x: -2.5 * (1 - Math.cos(2 * Math.PI * t)) }),
  parts: [
    { id: 'block', name: '方块', group: 'base', material: 'stone', solid: (k) => k.box([100, 100, 100]), rest: { p: [0, 0, 0] }, explode: { dir: [0, 1, 0], distance: 0, order: 0 }, role: '' },
    {
      id: 'slider',
      name: '滑块',
      group: 'mechanism',
      material: 'iron',
      solid: (k) => k.box([10, 10, 10]),
      rest: { p: [55, 0, 0] },
      pose: (s) => ({ p: [55 + s.x, 0, 0] }),
      explode: { dir: [1, 0, 0], distance: 50, order: 1 },
      role: '',
    },
  ],
  chain: [{ id: 'a', title: 'a', parts: ['slider'], text: '', provenance: 'model' }],
  readouts: [],
  sources: {},
  audit: { contacts: [['block', 'slider']] },
})

describe('审计工具', () => {
  test('结构校验通过；实体审计给出体积', () => {
    expect(validateExhibit(fake)).toEqual([])
    const r = auditSolids(k, fake)
    expect(r.map((x) => x.volume)).toEqual([1e6, 1000])
  })
  test('能抓到穿模：最深处插进 5 mm = 滑块体积的一半', () => {
    const r = auditMotion(k, fake)
    expect(r.samples).toBe(60)
    expect(r.maxRatio).toBeCloseTo(0.5, 3)
    expect(r.worst!.t).toBeCloseTo(0.5)
    expect(r.failures.length).toBeGreaterThan(0)
  })
  test('阈值是 PLAN 的 0.5% / 0.1%', () => {
    expect(THRESHOLD).toEqual({ joinery: 0.001, mechanism: 0.005 })
    const r = auditInterference(k, fake, { times: [0], pairs: [['block', 'slider']], threshold: THRESHOLD.mechanism })
    expect(r.failures).toEqual([])
  })
  test('自由度探测：t=0 时滑块贴着方块，往 −X 被挡、往 +X 自由', () => {
    const [minus, plus] = probeDof(k, fake, 0, ['slider'], ['-x', '+x'])
    expect(minus.volume).toBeCloseTo(200, 3)
    expect(plus.volume).toBeLessThan(1e-9)
  })
  test('爆炸偏移沿 dir；cycleTimes 均匀', () => {
    const sc = evaluateScene(fake, fake.simulate(0, {}), 1)
    expect(sc.get('slider')!.pose.p[0]).toBeCloseTo(55 + 50)
    expect(cycleTimes(fake, 4)).toEqual([0, 0.25, 0.5, 0.75])
  })
  test('结构校验能抓到错误引用', () => {
    const bad = { ...fake, chain: [{ id: 'a', title: 'a', parts: ['nope#x'], text: '', provenance: 'source' as const }] }
    const errs = validateExhibit(bad)
    expect(errs.some((e) => e.includes('nope'))).toBe(true)
    expect(errs.some((e) => e.includes('cite'))).toBe(true)
  })
})
