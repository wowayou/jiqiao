import { describe, expect, test } from 'vitest'
import { inv, involuteGeometry, involuteOutline, meshCheck } from './involute'
import { v2 } from './vec'

const deg = (d: number) => (d * Math.PI) / 180

describe('渐开线齿形', () => {
  test('标准齿轮：分度圆齿厚 = πm/2，基圆 = r·cos α', () => {
    const g = involuteGeometry({ module: 2, teeth: 30 })
    expect(g.r).toBe(30)
    expect(g.rb).toBeCloseTo(30 * Math.cos(deg(20)), 12)
    expect(g.thickness).toBeCloseTo(Math.PI, 12)
    expect(g.halfAngleAt(g.r) * 2 * g.r).toBeCloseTo(Math.PI, 9)
  })
  test('渐开线函数与齿面：任一点到基圆的切线长 = 基圆上展开的弧长', () => {
    const g = involuteGeometry({ module: 1.5, teeth: 40 })
    // 齿面点 ρ 处：极角 = −半角；渐开线起点在基圆上角度 −半角(rb)。展开角 = tan(acos(rb/ρ))
    for (const rho of [g.rb * 1.01, g.r, g.ra]) {
      const a = Math.acos(g.rb / rho)
      expect(g.halfAngleAt(g.rb) - g.halfAngleAt(rho)).toBeCloseTo(inv(a), 12)
    }
  })
  test('轮廓是闭合的简单多边形，齿数正确，半径落在 [rf, ra]', () => {
    const spec = { module: 1.5, teeth: 8, shift: 0.6, addendum: 0.75 }
    const g = involuteGeometry(spec)
    const pts = involuteOutline(spec)
    const rs = pts.map((p) => v2.len(p))
    expect(Math.min(...rs)).toBeCloseTo(g.rf, 9)
    expect(Math.max(...rs)).toBeCloseTo(g.ra, 9)
    // 有向面积为正（逆时针）
    let area = 0
    for (let i = 0; i < pts.length; i++) area += v2.cross(pts[i], pts[(i + 1) % pts.length]) / 2
    expect(area).toBeGreaterThan(0)
    expect(area).toBeLessThan(Math.PI * g.ra * g.ra)
  })
  test('8 齿小齿轮不变位会齿顶干涉；正变位 0.6 + 齿顶高 0.75 后无干涉且重合度 > 1', () => {
    const bad = meshCheck({ module: 1, teeth: 8 }, { module: 1, teeth: 64 })
    expect(bad.marginA).toBeLessThan(0)
    const ok = meshCheck({ module: 1, teeth: 8, shift: 0.6, addendum: 0.75 }, { module: 1, teeth: 64, shift: -0.6 })
    expect(ok.marginA).toBeGreaterThan(0)
    expect(ok.marginB).toBeGreaterThan(0)
    expect(ok.contactRatio).toBeGreaterThan(1)
    expect(ok.clearanceA).toBeGreaterThan(0)
    expect(ok.clearanceB).toBeGreaterThan(0)
    expect(involuteGeometry({ module: 1, teeth: 8, shift: 0.6, addendum: 0.75 }).tipThickness).toBeGreaterThan(0.4)
  })
  test('齿顶变尖时拒绝出图', () => {
    expect(() => involuteOutline({ module: 1, teeth: 8, shift: 0.6 })).toThrow(/变尖/)
  })
})
