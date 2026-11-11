// kinematics/pegGear.ts 与 kit/pegGear.ts 的单元测试（放在本展品目录里，因为波次 2 不改公共测试文件）。
import { describe, expect, test } from 'vitest'
import { getKernel } from '../../kernel'
import { pointSegDist2, restOnProfile, segSegDist3, solveArmPinDrive } from '../../kinematics/pegGear'
import { armStar, crownPinWheel, radialPegWheel, rimCam, rimCamProfile } from '../../kit/pegGear'

describe('pegGear · 距离', () => {
  test('点到线段', () => {
    expect(pointSegDist2([0, 1], [-1, 0], [1, 0])).toBeCloseTo(1)
    expect(pointSegDist2([3, 4], [0, 0], [0, 0])).toBeCloseTo(5)
    expect(pointSegDist2([2, 0], [-1, 0], [1, 0])).toBeCloseTo(1)
  })
  test('空间线段：交叉、平行、端点', () => {
    expect(segSegDist3([-1, 0, 0], [1, 0, 0], [0, -1, 2], [0, 1, 2])).toBeCloseTo(2)
    expect(segSegDist3([0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0])).toBeCloseTo(1)
    expect(segSegDist3([0, 0, 0], [1, 0, 0], [3, 0, 0], [4, 0, 0])).toBeCloseTo(2)
  })
  test('圆头搭在折线上：平地、斜坡、顶点', () => {
    const prof: [number, number][] = [[-100, 0], [0, 0], [100, 10], [100, 0], [200, 0]]
    expect(restOnProfile(prof, -50, 5)).toBeCloseTo(5)
    // 斜率 0.1 的坡上：高度 = 坡高 + r·√(1+m²)，切点偏移 r·m/√(1+m²)
    const m = 0.1
    const s = Math.sqrt(1 + m * m)
    expect(restOnProfile(prof, 50, 5)).toBeCloseTo(m * (50 + (5 * m) / s) + 5 / s, 9)
    // 越过高端顶点 3 mm：搭在顶点上
    expect(restOnProfile(prof, 103, 5)).toBeCloseTo(10 + 4, 9)
    // 越过 > r：落回平地
    expect(restOnProfile(prof, 106, 5)).toBeCloseTo(5)
  })
})

describe('pegGear · 拨齿间歇拨动', () => {
  const R = 620
  const Z = 100
  const pitch = (2 * Math.PI * R) / Z
  const spec = { arms: 3, pins: Z, center: R + (3 * pitch) / (2 * Math.PI), pinCircleR: R, pinR: 5, armR: 4, rootR: 8, tipR: 24 }
  const d = solveArmPinDrive(spec)
  const period = (2 * Math.PI) / 3
  test('一次推程正好一个齿距；推程短于拨齿周期（有停顿）', () => {
    expect(Math.abs(d.stroke - 1)).toBeLessThan(1e-9)
    expect(d.pushFraction).toBeGreaterThan(0.5)
    expect(d.pushFraction).toBeLessThan(1)
  })
  test('连续、单调；每转一个拨齿周期前进恰好 1 齿；周期衔接处无跳变', () => {
    let prev = d.advance(d.phiStart - 1e-6)
    for (let i = 1; i <= 6000; i++) {
      const a = d.advance(d.phiStart + (3 * period * i) / 6000)
      expect(a).toBeGreaterThanOrEqual(prev - 1e-12)
      expect(a - prev).toBeLessThan(0.02)
      prev = a
    }
    for (const phi of [0.1, 1, 2.5]) expect(d.advance(phi + period) - d.advance(phi)).toBeCloseTo(1, 12)
  })
  test('反函数 phiAt', () => {
    for (const A of [0.3, 0.77, 5.5, 12.01]) expect(d.advance(d.phiAt(A))).toBeCloseTo(A, 9)
  })
  test('任何拨齿与任何销都不相交（被推的那一对恰好相切）', () => {
    let min = Infinity
    for (let i = 0; i < 4000; i++) {
      const phi = d.phiStart + (2 * period * i) / 4000
      const A = d.advance(phi)
      for (let a = 0; a < 3; a++)
        for (let j = -5; j <= 5; j++) {
          const [p, q] = d.armAxis(phi, a)
          min = Math.min(min, pointSegDist2(d.pinCenter(A, j), p, q) - spec.armR - spec.pinR)
        }
    }
    expect(min).toBeGreaterThan(-1e-6)
  })
})

describe('kit/pegGear · 实体', async () => {
  const k = await getKernel()
  const body = { rimIn: 150, rimOut: 190, rimY0: -10, rimY1: 10, spokes: 6, spokeW: 20, hubR: 40, hubY0: -15, hubY1: 15, holeR: 20 }
  const cases = {
    radialPegWheel: () => radialPegWheel(k, { ...body, z: 18, pegR: 8, pegIn: 185, pegOut: 230, pegY: 0 }),
    crownPinWheel: () => crownPinWheel(k, { ...body, z: 54, pitchR: 180, pinR: 5, pinY0: -40, pinY1: -9 }),
    armStar: () => armStar(k, { arms: 3, rootR: 8, tipR: 24, armR: 4, armY0: 2, armY1: 14, hubR: 10, hubY0: 0, hubY1: 16 }),
    rimCam: () => rimCam(k, { r0: 580, r1: 610, aLow: 0.6, aHigh: 0, y0: 0, height: 25 }),
  }
  for (const [name, make] of Object.entries(cases))
    test(`${name} 是封闭实体`, () => {
      const r = k.scope(() => {
        const s = make()
        return { status: s.status(), v: s.volume() }
      })
      expect(r.status).toBe('NoError')
      expect(r.v).toBeGreaterThan(0)
    })
  test('凸轮轮廓长度 = 角宽 × 半径', () => {
    const p = rimCamProfile({ r0: 580, r1: 610, aLow: 0.6, aHigh: 0, y0: 0, height: 25 }, 600)
    expect(p[3][0]).toBeCloseTo(360)
    expect(p[3][1]).toBe(25)
  })
})
