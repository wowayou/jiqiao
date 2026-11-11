// 摆钟的运动学审计（PLAN 第 7 节第 4 条）、啮合相位、擒纵与啮合的加密干涉审计、协同链与画面一致、计算陈述的验证。
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { getKernel, type Kernel } from '../../kernel'
import { THRESHOLD, auditInterference, buildParts, type BuiltParts } from '../../exhibit/audit'
import { formatReport } from '../../exhibit/testing'
import { evaluateScene } from '../../exhibit/scene'
import { escapementOverlaps } from '../../kinematics/escapement'
import { toothPhase } from '../../kinematics/gears'
import { meshCheck, involuteGeometry } from '../../kinematics/involute'
import { pendulumLength, pendulumPeriod, pendulumPeriodExact } from '../../kinematics/pendulum'
import { TAU, v2 } from '../../kinematics/vec'
import exhibit from './index'
import {
  AMPLITUDE,
  AXES,
  BARREL_R,
  CLOCK_OFFSET,
  CORD_R,
  ESCAPEMENT,
  ESC_SOLUTION,
  GEARS,
  PENDULUM_LENGTH,
  PENDULUM_PERIOD,
  PERIOD,
  WIND,
  simulate,
  trainAngles,
} from './model'

const s = (t: number) => simulate(t)
const unwrapDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b))

describe('摆钟 · 摆与擒纵', () => {
  test('摆长由周期按单摆公式算出：T = 2 s → L ≈ 993.6 mm', () => {
    expect(PENDULUM_LENGTH).toBeCloseTo(993.6, 1)
    expect(pendulumPeriod(PENDULUM_LENGTH)).toBeCloseTo(PENDULUM_PERIOD, 12)
    expect(pendulumLength(1) * 4).toBeCloseTo(PENDULUM_LENGTH, 9)
    // 4° 摆幅比小角度近似慢约 0.03%；2° 与 4° 之差 < 0.025%
    expect(pendulumPeriodExact(PENDULUM_LENGTH, AMPLITUDE) / PENDULUM_PERIOD - 1).toBeCloseTo(0.0003, 4)
    expect(pendulumPeriodExact(PENDULUM_LENGTH, AMPLITUDE) - pendulumPeriodExact(PENDULUM_LENGTH, AMPLITUDE / 2)).toBeLessThan(0.00025 * 2)
  })
  test('每个摆动周期擒纵轮恰好前进 1 齿（全 12 小时内逐周期检查）', () => {
    expect(Math.abs(ESC_SOLUTION.advance - ESCAPEMENT.pitch)).toBeLessThan(1e-9)
    // 在同一摆相位上逐周期比较（取 50 个分散的周期）
    for (let k = 0; k < 50; k++) {
      const t0 = (k * 431 * PENDULUM_PERIOD) % (PERIOD - 4) + 0.3
      const a = s(t0)
      const b = s(t0 + PENDULUM_PERIOD)
      if (b.clock < a.clock) continue // 跨越钟面 12 点
      expect(b.psi - a.psi).toBeCloseTo(ESCAPEMENT.pitch, 9)
    }
  })
  test('直进式：锁住时轮子不动、全程不回退；任何时刻齿与叉瓦不穿模（2D 精确几何）', () => {
    expect(ESC_SOLUTION.maxRecoil).toBe(0)
    for (const sm of ESC_SOLUTION.samples) expect(escapementOverlaps(ESCAPEMENT, sm.phi, sm.psi)).toBe(false)
  })
  test('一个摆动周期内锁、冲击、落依次出现，两侧各一次；落的时长约 30 ms', () => {
    const seq: string[] = []
    let dropSamples = 0
    for (const sm of ESC_SOLUTION.samples) {
      const k = `${sm.phase}:${sm.pallet}`
      if (seq[seq.length - 1] !== k) seq.push(k)
      if (sm.phase === 'drop') dropSamples++
    }
    expect(seq).toEqual(['lock:entry', 'impulse:entry', 'drop:entry', 'lock:exit', 'impulse:exit', 'drop:exit', 'lock:entry'])
    const dropTime = (dropSamples / 2) * (PENDULUM_PERIOD / (ESC_SOLUTION.samples.length - 1))
    expect(dropTime).toBeGreaterThan(0.02)
    expect(dropTime).toBeLessThan(0.045)
  })
})

describe('摆钟 · 轮系与指针', () => {
  test('秒、分、时针速比 1 : 1/60 : 1/720（用累计转角检查，跨 1 小时）', () => {
    const t0 = 1000.3
    const t1 = t0 + 3600
    const d = (f: (x: ReturnType<typeof trainAngles>) => number) => f(trainAngles(-s(t1).psi)) - f(trainAngles(-s(t0).psi))
    const esc = d((a) => a.escape)
    expect(esc).toBeCloseTo(-60 * TAU, 6) // 秒针 1 小时 60 圈（顺时针）
    expect(d((a) => a.center) / esc).toBeCloseTo(1 / 60, 12)
    expect(d((a) => a.hour) / esc).toBeCloseTo(1 / 720, 12)
    expect(d((a) => a.great) / esc).toBeCloseTo(-1 / 720, 12) // 大轮反向、12 小时一圈
  })
  test('钟面读数：t = 0 时 10:08:30；指针角度与钟面时间一致', () => {
    for (const t of [0, 1234.5, 20000, PERIOD - 1]) {
      const st = s(t)
      const clock = (t + CLOCK_OFFSET) % PERIOD
      expect(st.clock).toBeCloseTo(clock, 6)
      // 时针、分针与连续时间相差不超过半步（擒纵是一步一步走的）
      expect(Math.abs(unwrapDiff(st.hands.hour, (clock / 43200) * TAU))).toBeLessThan(TAU / 21600)
      expect(Math.abs(unwrapDiff(st.hands.minute, (clock / 3600) * TAU))).toBeLessThan(TAU / 1800)
      expect(Math.abs(unwrapDiff(st.hands.second, (clock / 60) * TAU))).toBeLessThan(TAU / 60)
    }
  })
  test('秒针每摆一次跳 6°（半个齿距）', () => {
    const a = s(0.1).hands.second
    const b = s(1.1).hands.second
    expect(unwrapDiff(b, a)).toBeCloseTo(TAU / 60, 9)
  })
  const MESHES: [string, { z: number; c: [number, number]; a: (x: ReturnType<typeof trainAngles>) => number }, { z: number; c: [number, number]; a: (x: ReturnType<typeof trainAngles>) => number }][] = [
    ['擒纵小齿轮 × 三轮', { z: 8, c: AXES.E, a: (x) => x.escape }, { z: 60, c: AXES.T, a: (x) => x.third }],
    ['三轮小齿轮 × 中心轮', { z: 8, c: AXES.T, a: (x) => x.third }, { z: 64, c: AXES.C, a: (x) => x.center }],
    ['中心小齿轮 × 大轮', { z: 8, c: AXES.C, a: (x) => x.center }, { z: 96, c: AXES.G, a: (x) => x.great }],
    ['跨轮 × 过轮', { z: 12, c: AXES.C, a: (x) => x.center }, { z: 36, c: AXES.M, a: (x) => x.minute }],
    ['过轮小齿轮 × 时轮', { z: 8, c: AXES.M, a: (x) => x.minute }, { z: 32, c: AXES.C, a: (x) => x.hour }],
  ]
  test('啮合相位：连心线上一侧是齿中心、另一侧恰是齿槽中心（任意时刻）', () => {
    for (const t of [0, 0.55, 0.646, 777.7, 20000.1, PERIOD - 0.3]) {
      const tr = s(t).angle
      const train = { ...tr }
      for (const [, A, B] of MESHES) {
        const phi = v2.angle(v2.sub(B.c, A.c))
        const pa = toothPhase(A.z, A.a(train as never), phi)
        const pb = toothPhase(B.z, B.a(train as never), phi + Math.PI)
        const sum = (pa + pb) % 1
        expect(Math.min(Math.abs(sum - 0.5), 1 - Math.abs(sum - 0.5))).toBeLessThan(1e-6)
      }
    }
  })
  test('各对渐开线啮合：无齿顶干涉、重合度 > 1、顶隙 > 0；中心距与布局一致', () => {
    const pairs: [keyof typeof GEARS, keyof typeof GEARS, [number, number], [number, number]][] = [
      ['escapePinion', 'third', AXES.E, AXES.T],
      ['thirdPinion', 'center', AXES.T, AXES.C],
      ['centerPinion', 'great', AXES.C, AXES.G],
      ['cannon', 'minute', AXES.C, AXES.M],
      ['minutePinion', 'hour', AXES.M, AXES.C],
    ]
    for (const [a, b, ca, cb] of pairs) {
      const r = meshCheck(GEARS[a], GEARS[b])
      expect(r.marginA).toBeGreaterThan(0)
      expect(r.marginB).toBeGreaterThan(0)
      expect(r.contactRatio).toBeGreaterThan(1)
      expect(Math.min(r.clearanceA, r.clearanceB)).toBeGreaterThan(0)
      expect(v2.dist(ca, cb)).toBeCloseTo(r.centerDistance, 9)
      expect(involuteGeometry(GEARS[a]).tipThickness).toBeGreaterThan(0.3 * GEARS[a].module)
    }
  })
})

describe('摆钟 · 时间轴闭合与重锤', () => {
  test('周期首尾：所有零件位姿在 t → period 时连续（绕回不跳变）', () => {
    const a = evaluateScene(exhibit, s(PERIOD - 1e-6), 0)
    const b = evaluateScene(exhibit, s(0), 0)
    for (const [key, st] of a) {
      const o = b.get(key)!
      for (let i = 0; i < 3; i++) expect(Math.abs(st.pose.p[i] - o.pose.p[i])).toBeLessThan(1e-3)
      const qa = st.pose.q ?? [0, 0, 0, 1]
      const qb = o.pose.q ?? [0, 0, 0, 1]
      const dot = Math.abs(qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3])
      expect(1 - dot).toBeLessThan(1e-9)
    }
  })
  test('钟面 12 点处（τ 绕回）各轮位姿连续', () => {
    const tWrap = PERIOD - CLOCK_OFFSET
    const a = evaluateScene(exhibit, s(tWrap - 1e-6), 0)
    const b = evaluateScene(exhibit, s(tWrap + 1e-6), 0)
    for (const [key, st] of a) {
      const qa = st.pose.q ?? [0, 0, 0, 1]
      const qb = b.get(key)!.pose.q ?? [0, 0, 0, 1]
      expect(1 - Math.abs(qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3])).toBeLessThan(1e-6)
    }
  })
  test('重锤 12 小时下降约 222 mm（= 2π × 35.3），上弦后回到原高；锁住时重锤不动', () => {
    const drop = TAU * (BARREL_R + CORD_R)
    expect(drop).toBeCloseTo(221.8, 1)
    expect(s(PERIOD - WIND).weightDrop).toBeCloseTo(drop * ((PERIOD - WIND) / PERIOD), 0)
    expect(s(PERIOD - 1e-6).weightDrop).toBeCloseTo(0, 3)
    expect(s(0.1).weightDrop).toBe(0)
    // 锁住的 0.3 s 里重锤高度不变
    expect(s(5000.1).weightY).toBe(s(5000.35).weightY)
    expect(s(5000.1).phase).toBe('lock')
  })
})

describe('摆钟 · 协同链与画面一致', () => {
  const ESC = ['lock-entry', 'impulse-entry', 'drop-entry', 'lock-exit', 'impulse-exit', 'drop-exit']
  const step = (id: string) => exhibit.chain.find((c) => c.id === id)!
  test('任一时刻恰好一个擒纵环点亮，且与模型阶段、接触的叉瓦一致', () => {
    for (let i = 0; i < 2000; i++) {
      const st = s(3 + (i / 2000) * PENDULUM_PERIOD)
      const lit = ESC.filter((id) => step(id).active!(st))
      expect(lit).toEqual([`${st.phase}-${st.pallet}`])
    }
  })
  test('点亮「锁」时擒纵轮不动；点亮「冲击」「落」时擒纵轮在转', () => {
    const dt = 1e-3
    for (let i = 0; i < 1000; i++) {
      const t = 11 + (i / 1000) * PENDULUM_PERIOD
      const a = s(t)
      const b = s(t + dt)
      if (a.phase !== b.phase) continue
      if (a.phase === 'lock') expect(b.psi - a.psi).toBeLessThan(1e-6)
      else expect(b.psi - a.psi).toBeGreaterThan(1e-5)
    }
  })
  test('「上弦」只在周期最后 30 分钟点亮', () => {
    expect(step('wind').active!(s(PERIOD - WIND - 1))).toBe(false)
    expect(step('wind').active!(s(PERIOD - 10))).toBe(true)
  })
})

describe('摆钟 · 加密干涉审计（擒纵一个摆周期 400 相位；各啮合各转过 ≥ 1 齿）', () => {
  let k: Kernel
  let built: BuiltParts
  beforeAll(async () => {
    k = await getKernel()
    built = buildParts(k, exhibit)
  }, 120_000)
  afterAll(() => built?.dispose())

  test(
    '擒纵轮 × 叉瓦 / 叉身：一个摆周期 400 相位（含每一次落）',
    () => {
      const times = Array.from({ length: 400 }, (_, i) => 7 + (i / 400) * PENDULUM_PERIOD)
      // 加上落的阶段内的加密采样
      for (const sm of ESC_SOLUTION.samples) if (sm.phase === 'drop') times.push(7 + sm.t + 0.0002)
      const r = auditInterference(k, exhibit, {
        times,
        pairs: [
          ['escape-wheel', 'pallet-entry'],
          ['escape-wheel', 'pallet-exit'],
          ['escape-wheel', 'anchor'],
        ],
        threshold: THRESHOLD.mechanism,
      }, built)
      console.info(formatReport('bai-zhong（擒纵加密）', r))
      expect(r.failures).toEqual([])
      expect(r.booleanChecks).toBeGreaterThan(400)
    },
    300_000,
  )
  test(
    '各对啮合：时间跨度覆盖慢轮转过 1 个齿以上，每对 ≥ 60 相位',
    () => {
      // 时轮 32 齿、12 h 一圈 → 1 齿 1350 s；取 1500 s 内 90 个时刻
      const times = Array.from({ length: 90 }, (_, i) => 100.37 + (i / 90) * 1500)
      const r = auditInterference(k, exhibit, {
        times,
        pairs: [
          ['great-wheel', 'center-wheel'],
          ['center-wheel', 'third-wheel'],
          ['third-wheel', 'escape-wheel'],
          ['cannon', 'minute-wheel'],
          ['minute-wheel', 'hour-wheel'],
        ],
        threshold: THRESHOLD.mechanism,
      }, built)
      console.info(formatReport('bai-zhong（啮合加密）', r))
      expect(r.failures).toEqual([])
    },
    300_000,
  )
})
