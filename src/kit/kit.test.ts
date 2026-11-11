import { beforeAll, describe, expect, test } from 'vitest'
import { getKernel, type Kernel } from '../kernel'
import { TAU, v2 } from '../kinematics/vec'
import {
  disc,
  eyeRing,
  fourLegStand,
  grooveLines,
  handle,
  kerfCutter,
  lineCross,
  linkBar,
  millstone,
  mortiseCutter,
  postWithMortise,
  railWithTenon,
  rope,
  shaft,
  trough,
  wedgeFor,
  type GroovePattern,
} from './index'

let k: Kernel
beforeAll(async () => {
  k = await getKernel()
})

const solidOk = (s: { status(): string; volume(): number; isEmpty(): boolean }) => {
  expect(s.status()).toBe('NoError')
  expect(s.isEmpty()).toBe(false)
  expect(s.volume()).toBeGreaterThan(0)
}

describe('通用零件', () => {
  test('圆盘、轴、手柄、连杆、绳、杆端圆环均为非空封闭实体', () =>
    k.scope(() => {
      const d = disc(k, { r: 50, h: 10, hole: 5, chamfer: 1 })
      solidOk(d)
      expect(d.genus()).toBe(1)
      const sx = shaft(k, { r: 5, length: 100, axis: 'x' })
      expect(sx.bbox().max[0]).toBeCloseTo(50)
      solidOk(handle(k, { r: 10, length: 80, knob: 14 }))
      const l = linkBar(k, { length: 100, width: 20, thickness: 6, holeR: 4 })
      solidOk(l)
      expect(l.genus()).toBe(2)
      expect(l.bbox().max[0]).toBeCloseTo(110, 0)
      solidOk(rope(k, [[0, 0, 0], [0, 100, 0], [50, 120, 0]], 2))
      expect(eyeRing(k, { holeR: 10, outerR: 16, thickness: 8 }).genus()).toBe(1)
    }))
})

describe('木作', () => {
  const t = { length: 92, thickness: 16, height: 70 }
  const kerf = { depth: 50, open: 10, tip: 0.8 }
  test('带榫横料：体积 = 料身 + 榫头 − 锯缝', () =>
    k.scope(() => {
      const rail = railWithTenon(k, { length: 300, height: 90, thickness: 50, tenon: t, kerf })
      solidOk(rail)
      const kerfVol = ((kerf.open + kerf.tip) / 2) * kerf.depth * t.thickness
      const expected = 300 * 90 * 50 + 92 * 16 * 70 - kerfVol
      expect(Math.abs(rail.volume() - expected) / expected).toBeLessThan(1e-6)
    }))
  test('榫头穿过卯眼不干涉；楔坐在锯缝里不干涉', () =>
    k.scope(() => {
      const post = postWithMortise(k, { size: [80, 500, 80], mortise: { height: 70, thickness: 16, flare: { depth: 30, amount: 6 } } })
      solidOk(post)
      const rail = railWithTenon(k, { length: 300, height: 90, thickness: 50, tenon: t, kerf }).translate([40, 0, 0])
      expect(k.intersectionVolume(post, rail)).toBeLessThan(1e-6)
      const w = wedgeFor(k, t, kerf).translate([40, 0, 0])
      solidOk(w)
      expect(k.intersectionVolume(w, rail)).toBeLessThan(1e-6)
      expect(k.intersectionVolume(w, post)).toBeLessThan(1e-6)
      // 去掉间隙的卯眼会与榫头相交（证明审计确实敏感）
      const tight = k.box([80, 500, 80]).subtract(mortiseCutter(k, { depth: 80, height: 69, thickness: 16 }).translate([40, 0, 0]))
      expect(k.intersectionVolume(tight, rail)).toBeGreaterThan(80 * 16 * 0.5)
      expect(kerfCutter(k, t, kerf).volume()).toBeGreaterThan(0)
    }))
  test('四腿木架', () =>
    k.scope(() => {
      const s = fourLegStand(k, { width: 800, depth: 800, height: 500, leg: 60, apron: 80, stretcherAt: 120 })
      solidOk(s)
      expect(s.bbox().max[1]).toBeCloseTo(500)
    }))
})

describe('石件', () => {
  const p: GroovePattern = { zones: 8, rIn: 70, rOut: 300, pitch: 26, width: 8, depth: 6, slant: (30 * Math.PI) / 180 }
  test('磨扇：磨齿、磨眼、中心孔、磨膛都切出来了', () =>
    k.scope(() => {
      const plain = millstone(k, { radius: 300, thickness: 130, face: 'top' })
      const grooved = millstone(k, { radius: 300, thickness: 130, face: 'top', pattern: p })
      solidOk(grooved)
      const removed = plain.volume() - grooved.volume()
      expect(removed).toBeGreaterThan(50_000)
      const upper = millstone(k, {
        radius: 300,
        thickness: 150,
        face: 'bottom',
        pattern: p,
        centerHole: { r: 16, depth: 55 },
        eye: { r: 28, at: [-110, 0] },
        hollow: { r: 130, depth: 12 },
        dish: { r: 250, depth: 20 },
      })
      solidOk(upper)
      expect(upper.genus()).toBe(1) // 磨眼是唯一的贯穿孔
      solidOk(trough(k, { r: 490, rim: 50, floor: 60, height: 120 }))
    }))
  test('磨齿线：每区一组平行线，全部落在扇环内', () => {
    const lines = grooveLines(p)
    expect(new Set(lines.map((l) => l.zone)).size).toBe(8)
    for (const l of lines) expect(v2.len(l.point)).toBeLessThan(p.rOut)
  })
  test('上下扇磨齿交叉点随上扇转动而外移（磨齿外赶粮食的几何原因）', () => {
    const lower = grooveLines(p)
    const upperLocal = grooveLines(p, true)
    let checked = 0
    for (const theta of [0, 0.3, 1.1, 2.0, 4.4]) {
      const rot = (l: (typeof upperLocal)[number]) => ({ ...l, point: v2.rotate(l.point, theta), dir: v2.rotate(l.dir, theta) })
      for (const L of lower) {
        for (const U0 of upperLocal) {
          const X = lineCross(L, rot(U0))
          if (!X) continue
          const r = v2.len(X)
          if (r < p.rIn + 20 || r > p.rOut - 20) continue
          // 交叉点须同时位于两条沟各自所在的区内
          const inZone = (zone: number, ang: number) => {
            const a = ((zone + 0.5) * TAU) / p.zones
            const d = Math.atan2(Math.sin(ang - a), Math.cos(ang - a))
            return Math.abs(d) < Math.PI / p.zones
          }
          if (!inZone(L.zone, v2.angle(X))) continue
          if (!inZone(U0.zone, -(v2.angle(X) - theta))) continue
          const X2 = lineCross(L, rot({ ...U0, point: v2.rotate(U0.point, 1e-4), dir: v2.rotate(U0.dir, 1e-4) }))!
          expect(v2.len(X2)).toBeGreaterThan(r)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(100)
  })
})
