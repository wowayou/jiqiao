import { describe, expect, test } from 'vitest'
import { contactAngle, makeRockerCycle, nosePosition, rockerLocal, rockerPoint, rockerWithPegs, type RockerGeom } from './cam'
import { TAU, deg } from './vec'

// 一组有代表性的尺寸（与水碓展品同量级，但测试不依赖展品文件）
const G: RockerGeom = {
  pivot: [430, 840],
  axis: [0, 1150],
  orbit: 320,
  noseR: 30,
  face: 70,
  tailMin: -360,
  tailMax: 0,
}
const OPTS = { dir: -1 as const, omega: TAU / 10, accel: 14 }

describe('摇杆坐标变换', () => {
  test('局部 ↔ 世界互逆；φ=0 时局部轴与世界轴平行', () => {
    const w = rockerPoint(G, 0.3, [120, -40])
    const l = rockerLocal(G, 0.3, w)
    expect(l[0]).toBeCloseTo(120, 9)
    expect(l[1]).toBeCloseTo(-40, 9)
    expect(rockerPoint(G, 0, [100, 5])).toEqual([530, 845])
  })
  test('拨板圆头圆心在以轴心为中心、orbit 为半径的圆上', () => {
    for (const a of [0, 1, 2.5, -2]) {
      const p = nosePosition(G, a)
      expect(Math.hypot(p[0] - G.axis[0], p[1] - G.axis[1])).toBeCloseTo(G.orbit, 9)
    }
  })
})

describe('contactAngle：圆头与受压面相切（解析解）', () => {
  test('简单情形：圆头恰好落在静止的受压面上 → φ = 0', () => {
    const g: RockerGeom = { pivot: [0, 0], axis: [-100, 90], orbit: 100, noseR: 10, face: 20, tailMin: -400, tailMax: 0 }
    // 圆头圆心取在 (−100, 30+...)：令 alpha 使圆心 y = face + noseR = 30
    const alpha = Math.asin((30 - 90) / 100)
    const c = contactAngle(g, alpha)!
    expect(c.phi).toBeCloseTo(0, 9)
    expect(nosePosition(g, alpha)[1]).toBeCloseTo(30, 9)
  })
  test('对一整段拨板转角：圆心到受压面的距离恒等于圆头半径，接触点在碓尾范围内', () => {
    let n = 0
    for (let i = 0; i < 3600; i++) {
      const a = (i / 3600) * TAU
      const c = contactAngle(G, a)
      if (!c || c.kind !== 'face') continue
      n++
      const l = rockerLocal(G, c.phi, nosePosition(G, a))
      expect(l[1] - G.face).toBeCloseTo(G.noseR, 9)
      expect(l[0]).toBeCloseTo(c.x, 9)
      expect(c.x).toBeGreaterThanOrEqual(G.tailMin)
      expect(c.x).toBeLessThanOrEqual(G.tailMax)
    }
    expect(n).toBeGreaterThan(100)
  })
  test('越过受压面末端后顶着棱角：圆心到棱角的距离恒等于圆头半径，且 φ 与面接触解连续', () => {
    let n = 0
    for (let i = 0; i < 7200; i++) {
      const a = -(i / 7200) * TAU
      const c = contactAngle(G, a)
      if (!c || c.kind !== 'corner') continue
      n++
      const corner = rockerPoint(G, c.phi, [G.tailMin, G.face])
      const nose = nosePosition(G, a)
      expect(Math.hypot(corner[0] - nose[0], corner[1] - nose[1])).toBeCloseTo(G.noseR, 9)
      expect(c.x).toBeLessThan(G.tailMin)
    }
    expect(n).toBeGreaterThan(5)
  })
  test('够不着时返回 null', () => {
    expect(contactAngle({ ...G, orbit: 10 }, 0)).toBeNull()
  })
})

describe('makeRockerCycle：压下 → 最高点 → 回落 → 静止', () => {
  const c = makeRockerCycle(G, OPTS)
  test('开始压下时摇杆角为 0（圆头刚好碰到静止的受压面）；最高点比任何压着时刻都高不了', () => {
    expect(contactAngle(G, c.alphaIn)!.phi).toBeCloseTo(0, 6)
    expect(c.pushAngle).toBeGreaterThan(deg(10))
    expect(c.phiPeak).toBeGreaterThan(0.15)
    expect(c.phiPeak).toBeLessThan(0.6)
    for (let i = 0; i <= 2000; i++) {
      const k = contactAngle(G, c.alphaIn + (OPTS.dir * c.contactSpan * i) / 2000)
      if (k) expect(k.phi).toBeLessThanOrEqual(c.phiPeak + 1e-9)
    }
  })
  test('压下阶段摇杆角 = 接触解（拨板与碓尾始终相切），且在上升', () => {
    for (let i = 1; i < 200; i++) {
      const a = c.alphaIn + (OPTS.dir * c.pushAngle * i) / 200
      const s = c.at(a)
      expect(s.stage).toBe('push')
      expect(s.phi).toBeCloseTo(contactAngle(G, a)!.phi, 12)
      const l = rockerLocal(G, s.phi, nosePosition(G, a))
      expect(Math.abs(l[1] - G.face - G.noseR)).toBeLessThan(1e-9)
      expect(s.dphi).toBeGreaterThan(-1e-6)
    }
  })
  test('最高点处位置连续、速度从上升转为下降', () => {
    const e = 1e-7
    const before = c.at(c.alphaPeak - OPTS.dir * e)
    const after = c.at(c.alphaPeak + OPTS.dir * e)
    expect(before.stage).toBe('push')
    expect(after.stage).toBe('fall')
    expect(Math.abs(after.phi - before.phi)).toBeLessThan(1e-5)
    expect(after.dphi).toBeLessThanOrEqual(1e-3)
  })
  test('脱开圆头之后按匀角加速度下落：二阶差分 = −accel·h²；落到静止角即停', () => {
    const h = 0.003 // s
    const at = (tp: number) => c.at(c.alphaIn + OPTS.dir * (c.contactSpan + OPTS.omega * tp)).phi
    let checked = 0
    for (let tp = 0.01; tp < 0.3; tp += 0.01) {
      if (at(tp + h) <= 0) break
      expect(at(tp + h) - 2 * at(tp) + at(tp - h)).toBeCloseTo(-OPTS.accel * h * h, 9)
      checked++
    }
    expect(checked).toBeGreaterThan(2)
    expect(c.fallTime).toBeCloseTo(Math.sqrt((2 * c.phiPeak) / OPTS.accel), 12)
    const landed = c.at(c.alphaIn + OPTS.dir * (c.settleAngle + 0.01))
    expect(landed.stage).toBe('rest')
    expect(landed.phi).toBe(0)
    expect(landed.sinceLanding).toBeGreaterThan(0)
    const before = c.at(c.alphaIn + OPTS.dir * (c.settleAngle - 0.01))
    expect(before.stage).toBe('fall')
  })
  test('摇杆角全程不低于静止角；只要圆头还顶着摇杆，摇杆就不落到圆头下面', () => {
    for (let i = 0; i < 7200; i++) {
      const a = (i / 7200) * TAU
      const s = c.at(a)
      expect(s.phi).toBeGreaterThanOrEqual(0)
      const k = contactAngle(G, a)
      if (s.stage === 'fall' && k) expect(s.phi).toBeGreaterThanOrEqual(k.phi - 1e-9)
    }
  })
  test('周期闭合：at(α) = at(α + 2π)', () => {
    for (const a of [0.2, 1.7, -2.4, c.alphaIn, c.alphaEnd]) {
      expect(c.at(a).phi).toBeCloseTo(c.at(a + TAU).phi, 9)
      expect(c.at(a).stage).toBe(c.at(a + TAU).stage)
    }
  })
  test('下一块拨板到来之前已落定：settleAngle 小于相邻拨板的间隔（180° 与 120° 都满足）', () => {
    expect(c.settleAngle).toBeLessThan(Math.PI)
    expect(c.settleAngle).toBeLessThan((2 * Math.PI) / 3)
  })
  test('一圈里，每块拨板恰好使摇杆起落一次', () => {
    for (const phases of [[0], [0, Math.PI], [0, TAU / 3, (2 * TAU) / 3]]) {
      let rises = 0
      let prevRest = rockerWithPegs(c, 0, phases).stage === 'rest'
      const N = 20000
      for (let i = 1; i <= N; i++) {
        const s = rockerWithPegs(c, (-i / N) * TAU, phases) // 顺时针：alpha 递减
        const isRest = s.stage === 'rest'
        if (prevRest && !isRest) rises++
        prevRest = isRest
      }
      expect(rises).toBe(phases.length)
    }
  })
  test('参数检查：转轴够不着时抛错', () => {
    expect(() => makeRockerCycle({ ...G, orbit: 20 }, OPTS)).toThrow()
    expect(() => makeRockerCycle(G, { ...OPTS, accel: 0 })).toThrow()
  })
})
