import { describe, expect, test } from 'vitest'
import {
  escapementAt,
  escapementOverlaps,
  firstContact,
  grahamEscapement,
  mirrorOutlineX,
  outlinePolygon,
  palletPolygons,
  solveEscapement,
  type Outline,
} from './escapement'
import { G_STD, pendulumAngle, pendulumLength, pendulumPeriod, pendulumPeriodExact } from './pendulum'
import { v2 } from './vec'

const deg = (d: number) => (d * Math.PI) / 180

describe('首次接触（齿绕轮心转、障碍不动）', () => {
  test('单点撞到竖直线段：δ 与解析解一致', () => {
    // 点 (10, 0) 逆时针转，撞到 x = 5 的竖线（y ∈ [0, 20]）：cos δ = 0.5
    const wall: Outline = { edges: [{ kind: 'seg', a: [5, 0], b: [5, 20], tag: 'lock' }] }
    const hit = firstContact([[[10, 0], [10, -0.001], [9.999, 0]]], [wall], Math.PI)
    // 最先碰到的是半径 9.999 的顶点：cos δ = 5 / 9.999
    expect(hit!.delta).toBeCloseTo(Math.acos(5 / 9.999), 9)
    expect(hit!.tag).toBe('lock')
  })
  test('撞到圆弧（圆心不在原点）', () => {
    const arc: Outline = { edges: [{ kind: 'arc', c: [0, 20], r: 10, a0: -Math.PI, a1: 0, ccw: true, tag: 'impulse' }] }
    // 半径 15 的点从 0 角出发，与圆 (0,20) r=10 的交点
    const hit = firstContact([[[15, 0], [15, -0.01], [14.99, 0]]], [arc], Math.PI)
    const y = (15 * 15 - 10 * 10 + 400) / 40
    expect(hit!.delta).toBeCloseTo(Math.atan2(y, Math.sqrt(225 - y * y)), 6)
  })
  test('超出最大转角则无接触；镜像轮廓仍闭合', () => {
    const wall: Outline = { edges: [{ kind: 'seg', a: [5, 0], b: [5, 20], tag: 'lock' }] }
    expect(firstContact([[[10, 0], [10, -0.001], [9.999, 0]]], [wall], 0.5)).toBeNull()
    const g = grahamEscapement(PARAMS)
    const m = mirrorOutlineX(g.pallets[0])
    const poly = outlinePolygon(m, 0.01)
    const orig = outlinePolygon(g.pallets[0], 0.01)
    const area = (p: number[][]) => p.reduce((s, q, i) => s + (q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1]) / 2, 0)
    expect(area(poly)).toBeCloseTo(area(orig), 6)
  })
})

const PARAMS = {
  teeth: 30,
  tipR: 45,
  rootR: 39,
  span: 7.5,
  lift: deg(2.4),
  lock: deg(0.8),
  lockFace: deg(4.5),
  impulseWheel: deg(4.5),
  palletTail: deg(12),
  tooth: { land: 0.3, rake: deg(14), rootWidth: 3.2 },
}
const A = deg(4)
const T = 2

describe('直进式锚形擒纵：几何求解', () => {
  const g = grahamEscapement(PARAMS)
  const sol = solveEscapement(g, {
    anchor: (t) => pendulumAngle(t, A, T),
    period: T,
    steps: 2000,
    freeAccel: 60,
    backoff: 2e-4,
    psiGuess: g.lockedTipAngle[0] - deg(0.5),
  })

  test('锁面与齿尖圆正交：支点在两锁定齿尖的切线交点上', () => {
    for (const a of g.lockedTipAngle) {
      const tip = v2.polar(g.tipR, a)
      const tangent = v2.polar(1, a + Math.PI / 2)
      const toPivot = v2.sub(g.pivot, tip)
      expect(Math.abs(v2.cross(tangent, toPivot))).toBeLessThan(1e-9)
      expect(v2.len(toPivot)).toBeCloseTo(g.lockR, 9)
    }
  })
  test('每个摆动周期擒纵轮恰好前进 1 齿', () => {
    expect(Math.abs(sol.advance - g.pitch)).toBeLessThan(1e-9)
  })
  test('直进式：锁住期间轮子不动、全程不回退', () => {
    expect(sol.maxRecoil).toBe(0)
    for (let i = 1; i < sol.samples.length; i++) {
      const a = sol.samples[i - 1]
      const b = sol.samples[i]
      expect(b.psi - a.psi).toBeGreaterThanOrEqual(-1e-12)
      if (a.phase === 'lock' && b.phase === 'lock') expect(b.psi - a.psi).toBeLessThan(1e-6)
    }
  })
  test('一周期依次经过：入瓦锁 → 入瓦冲击 → 落 → 出瓦锁 → 出瓦冲击 → 落 → 入瓦锁', () => {
    const seq: string[] = []
    for (const s of sol.samples) {
      const k = `${s.phase}:${s.pallet}`
      if (seq[seq.length - 1] !== k) seq.push(k)
    }
    expect(seq).toEqual(['lock:entry', 'impulse:entry', 'drop:entry', 'lock:exit', 'impulse:exit', 'drop:exit', 'lock:entry'])
  })
  test('冲击时轮子前进 impulseWheel，落下前进其余的半个齿距；冲击起点即设计放开角', () => {
    const at = (k: string) => sol.samples.findIndex((s, i) => i > 0 && `${s.phase}:${s.pallet}` === k && `${sol.samples[i - 1].phase}:${sol.samples[i - 1].pallet}` !== k)
    const i0 = at('impulse:entry')
    const i1 = at('drop:entry')
    const i2 = at('lock:exit')
    expect(sol.samples[i1].psi - sol.samples[i0 - 1].psi).toBeCloseTo(PARAMS.impulseWheel, 2)
    expect(sol.samples[i2].psi - sol.samples[i0 - 1].psi).toBeCloseTo(g.pitch / 2, 6)
    expect(sol.samples[i0].phi).toBeGreaterThan(g.releaseEntry - 1e-9)
    expect(sol.samples[i0 - 1].phi).toBeLessThan(g.releaseEntry + deg(0.05))
  })
  test('任何时刻齿与叉瓦不穿模；叉瓦不碰轮缘（齿根圆）', () => {
    for (const s of sol.samples) {
      expect(escapementOverlaps(g, s.phi, s.psi)).toBe(false)
      for (const P of palletPolygons(g, s.phi)) for (const p of P) expect(v2.len(p)).toBeGreaterThan(g.rootR + 0.5)
    }
  })
  test('跨周期连续：t = T 前后转角相差恰为一个齿距的连续延拓', () => {
    const a = escapementAt(sol, 7 * T - 1e-9)
    const b = escapementAt(sol, 7 * T)
    expect(Math.abs(b.psi - a.psi)).toBeLessThan(1e-6)
    expect(escapementAt(sol, 7 * T).psi - escapementAt(sol, 0).psi).toBeCloseTo(7 * g.pitch, 9)
  })
})

describe('摆（calc）', () => {
  test('周期 2 s 的摆长约 993.6 mm；摆长与周期互逆', () => {
    expect(pendulumLength(2)).toBeCloseTo(993.6, 1)
    expect(pendulumPeriod(pendulumLength(2))).toBeCloseTo(2, 12)
    // 摆长变为 4 倍，周期变为 2 倍
    expect(pendulumPeriod(4 * 500) / pendulumPeriod(500)).toBeCloseTo(2, 12)
  })
  test('等时性：小振幅下周期几乎与振幅无关（数值积分验证精确公式）', () => {
    const L = pendulumLength(2)
    const rk4Period = (amp: number) => {
      // 从最高点 θ = amp 释放，积分到 θ 第一次过 0：四分之一周期
      let th = amp
      let w = 0
      let t = 0
      const h = 1e-5
      const f = (x: number) => -(G_STD / L) * Math.sin(x)
      while (th > 0) {
        const k1t = w, k1w = f(th)
        const k2t = w + (h / 2) * k1w, k2w = f(th + (h / 2) * k1t)
        const k3t = w + (h / 2) * k2w, k3w = f(th + (h / 2) * k2t)
        const k4t = w + h * k3w, k4w = f(th + h * k3t)
        const nth = th + (h / 6) * (k1t + 2 * k2t + 2 * k3t + k4t)
        const nw = w + (h / 6) * (k1w + 2 * k2w + 2 * k3w + k4w)
        if (nth <= 0) {
          t += h * (th / (th - nth))
          th = nth
          break
        }
        th = nth
        w = nw
        t += h
      }
      return 4 * t
    }
    for (const amp of [deg(2), deg(4), deg(10)]) expect(rk4Period(amp)).toBeCloseTo(pendulumPeriodExact(L, amp), 4)
    // 4° 振幅相对小角度近似只慢约 0.03%；2° 与 4° 之差约 0.023%
    expect(pendulumPeriodExact(L, deg(4)) / 2 - 1).toBeCloseTo(0.000305, 5)
    expect((pendulumPeriodExact(L, deg(4)) - pendulumPeriodExact(L, deg(2))) / 2).toBeLessThan(0.00025)
  })
})
