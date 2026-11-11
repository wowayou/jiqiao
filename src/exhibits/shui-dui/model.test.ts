// 水碓的运动学审计、协同链与画面一致性、计算陈述的验证。
import { describe, expect, test } from 'vitest'
import { jointDistances } from '../../exhibit/audit'
import { poseApply, poseInverse } from '../../kinematics/pose'
import { TAU, type Vec3 } from '../../kinematics/vec'
import exhibit from './index'
import {
  CYCLE,
  DIM,
  GRAIN_TOP_Y,
  LANES,
  N_LEVERS,
  N_PEGS,
  OMEGA,
  PEGS_PER_LEVER,
  PEG_BETA,
  PERIOD,
  PESTLE_DROP,
  STRIKE_FLASH,
  headLift,
  simulate,
  strikesPerMinute,
  type DuiState,
  type LeverStage,
} from './model'
import { PEG_ID, leverId, pestleId } from './parts'

const c = exhibit.defaults
const N = 4000
const times = Array.from({ length: N }, (_, i) => (PERIOD * i) / N)
const part = (id: string) => exhibit.parts.find((p) => p.id === id)!
const poseOf = (id: string, s: DuiState) => {
  const p = part(id)
  return p.pose ? p.pose(s, 0) : p.rest
}
const stages = (k: number) => times.map((t) => simulate(t, c).levers[k].stage)

describe('水碓 · 拨板与碓尾的接触', () => {
  test('压尾抬头的每一刻：拨板圆头圆心到碓尾上表面的距离 = 圆头半径（只留 0.1 mm 配合缝），接触点在碓尾范围内', () => {
    for (let k = 0; k < N_LEVERS; k++) {
      let pushes = 0
      for (const t of times) {
        const s = simulate(t, c)
        const L = s.levers[k]
        if (L.stage !== 'push') continue
        pushes++
        const nose = poseApply(poseOf(PEG_ID(k, L.peg), s), [DIM.pegOrbit, 0, 0])
        const local = poseApply(poseInverse(poseOf(leverId(k), s)), nose)
        // 碓杆局部坐标：y 为离碓杆中线的高度，上表面在 +beamHalfH
        expect(local[1] - DIM.beamHalfH - DIM.pegR).toBeGreaterThan(-1e-6)
        expect(local[1] - DIM.beamHalfH - DIM.pegR).toBeLessThan(0.2)
        expect(local[0]).toBeLessThanOrEqual(0)
        expect(local[0]).toBeGreaterThanOrEqual(-DIM.tail - 1e-6)
        expect(Math.abs(local[2])).toBeLessThan(1e-9) // 板与碓杆同在一条道上
      }
      expect(pushes).toBeGreaterThan(100)
    }
  })
  test('压着的一段里，碓杆转角随拨板转角连续、单调升高；碓头同时抬起', () => {
    for (let k = 0; k < N_LEVERS; k++) {
      let prev = -1
      for (const t of times) {
        const L = simulate(t, c).levers[k]
        if (L.stage === 'push') {
          if (prev >= 0) expect(L.phi).toBeGreaterThanOrEqual(prev - 1e-12)
          expect(L.lift).toBeGreaterThan(0)
          prev = L.phi
        } else prev = -1
      }
    }
  })
  test('支点：碓杆孔心与支点轴心全周期重合；碓杆长度不变', () => {
    for (let k = 0; k < N_LEVERS; k++) {
      const d = jointDistances(exhibit, times.slice(0, 400), { part: leverId(k), local: [0, 0, 0] }, { part: 'axle', local: [0, 0, LANES[k]] })
      expect(Math.max(...d)).toBeLessThan(1e-9)
      const len = jointDistances(exhibit, times.slice(0, 400), { part: leverId(k), local: [-DIM.tail, 0, 0] }, { part: leverId(k), local: [DIM.head, 0, 0] })
      expect(Math.max(...len.map((x) => Math.abs(x - DIM.tail - DIM.head)))).toBeLessThan(1e-9)
    }
  })
  test('碓头与碓杆固连；拨板与横轴固连（板头圆心到轴心恒为 pegOrbit）', () => {
    for (let k = 0; k < N_LEVERS; k++) {
      const d = jointDistances(exhibit, times.slice(0, 400), { part: pestleId(k), local: [0, 0, 0] }, { part: leverId(k), local: [DIM.pestleX, 0, 0] })
      expect(Math.max(...d)).toBeLessThan(1e-9)
      for (let j = 0; j < PEGS_PER_LEVER; j++) {
        const r = jointDistances(exhibit, times.slice(0, 400), { part: PEG_ID(k, j), local: [DIM.pegOrbit, 0, 0] }, { part: 'shaft', local: [0, 0, LANES[k]] })
        expect(Math.max(...r.map((x) => Math.abs(x - DIM.pegOrbit)))).toBeLessThan(1e-9)
        const rigid = jointDistances(
          exhibit,
          times.slice(0, 400),
          { part: PEG_ID(k, j), local: [DIM.pegOrbit, 0, 0] },
          { part: 'shaft', local: [DIM.pegOrbit * Math.cos(PEG_BETA[k][j]), DIM.pegOrbit * Math.sin(PEG_BETA[k][j]), LANES[k]] },
        )
        expect(Math.max(...rigid)).toBeLessThan(1e-9)
      }
    }
  })
})

describe('水碓 · 一周内的起落', () => {
  const rises = (k: number) => {
    const st = stages(k)
    const out: number[] = []
    for (let i = 0; i < N; i++) if (st[i] === 'push' && st[(i + N - 1) % N] !== 'push') out.push(i)
    return out
  }
  test('一周里每个碓恰好起落的次数 = 它的拨板数', () => {
    for (let k = 0; k < N_LEVERS; k++) {
      expect(rises(k)).toHaveLength(PEG_BETA[k].length)
      const st = stages(k)
      const lands = st.filter((x, i) => x === 'strike' && st[(i + N - 1) % N] !== 'strike' && st[(i + N - 1) % N] !== 'idle')
      expect(lands).toHaveLength(PEG_BETA[k].length)
    }
  })
  test('起落按 碓一 → 二 → 三 → 一…… 轮流，每隔 1/6 周期一下', () => {
    const all = LANES.flatMap((_, k) => rises(k).map((i) => ({ k, i }))).sort((a, b) => a.i - b.i)
    expect(all).toHaveLength(N_PEGS)
    all.forEach((e, n) => expect(e.k).toBe(n % N_LEVERS))
    for (let n = 0; n < all.length; n++) {
      const gap = (all[(n + 1) % all.length].i - all[n].i + N) % N
      expect(Math.abs(gap - N / N_PEGS)).toBeLessThanOrEqual(2)
    }
  })
  test('碓头落到位之后，下一块拨板才到：两次压下之间一定经过静止（φ = 0）', () => {
    expect(CYCLE.settleAngle).toBeLessThan(TAU / PEGS_PER_LEVER)
    for (let k = 0; k < N_LEVERS; k++) {
      const st = stages(k)
      const r = rises(k)
      for (let n = 0; n < r.length; n++) {
        const a = r[n]
        const b = r[(n + 1) % r.length]
        let sawRest = false
        for (let i = a; i !== b; i = (i + 1) % N) {
          if (st[i] === 'strike' || st[i] === 'idle') sawRest = true
        }
        expect(sawRest).toBe(true)
        // 紧挨着下一次压下之前是静止的
        expect(['idle', 'strike']).toContain(st[(b + N - 1) % N])
      }
    }
  })
  test('每分钟舂击次数：数值数一周内落进臼里的次数，与 strikesPerMinute 一致', () => {
    let landings = 0
    for (let k = 0; k < N_LEVERS; k++) {
      const phis = times.map((t) => simulate(t, c).levers[k].phi)
      for (let i = 0; i < N; i++) if (phis[i] === 0 && phis[(i + N - 1) % N] > 0) landings++
    }
    expect(landings).toBe(N_PEGS)
    expect(strikesPerMinute()).toBeCloseTo((landings * 60) / PERIOD, 9)
    expect(strikesPerMinute(N_PEGS / N_LEVERS)).toBeCloseTo(strikesPerMinute() / N_LEVERS, 9)
  })
  test('周期闭合：t = 0 与 t = period 的状态与全部零件位姿一致', () => {
    const a = simulate(0, c)
    const b = simulate(PERIOD, c)
    for (let k = 0; k < N_LEVERS; k++) {
      expect(b.levers[k].stage).toBe(a.levers[k].stage)
      expect(b.levers[k].phi).toBeCloseTo(a.levers[k].phi, 9)
    }
    for (const p of exhibit.parts) {
      for (let i = 0; i < (p.copies ?? 1); i++) {
        const pa = p.pose ? p.pose(a, i) : p.rest
        const pb = p.pose ? p.pose(b, i) : p.rest
        pa.p.forEach((x, j) => expect(pb.p[j]).toBeCloseTo(x, 6))
        const qa = pa.q ?? [0, 0, 0, 1]
        const qb = pb.q ?? [0, 0, 0, 1]
        // 四元数 q 与 −q 表示同一姿态
        const dot = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3]
        expect(Math.abs(dot)).toBeCloseTo(1, 9)
      }
    }
  })
})

describe('水碓 · 计算所得的量', () => {
  test('碓头抬起高度 = 碓头最低点的世界高度变化（由零件位姿独立算出）', () => {
    const tipLocal: Vec3 = [0, -PESTLE_DROP, 0]
    const rest = poseApply(poseOf(pestleId(0), simulate(0, c)), tipLocal)
    let maxLift = 0
    for (const t of times) {
      const s = simulate(t, c)
      for (let k = 0; k < N_LEVERS; k++) {
        const tip = poseApply(poseOf(pestleId(k), s), tipLocal)
        expect(tip[1] - rest[1]).toBeCloseTo(s.levers[k].lift, 6)
        maxLift = Math.max(maxLift, s.levers[k].lift)
      }
    }
    expect(maxLift).toBeCloseTo(headLift(CYCLE.phiPeak), 3)
    expect(maxLift).toBeGreaterThan(150)
    // 静止时碓头最低点停在臼里谷粒面上方 2 mm，也就是落到位了
    expect(rest[1]).toBeCloseTo(GRAIN_TOP_Y + 2, 6)
  })
  test('水轮转速与转角读数', () => {
    expect(OMEGA * PERIOD).toBeCloseTo(TAU, 12)
    const s = simulate(PERIOD / 4, c)
    expect(s.theta).toBeCloseTo(TAU / 4, 9)
    const rd = (label: string) => exhibit.readouts.find((r) => r.label === label)!.value(s)
    expect(rd('水轮转角')).toBe('90°')
    expect(rd('水轮转速')).toBe(`${(60 / PERIOD).toFixed(1)} 转/分`)
    expect(rd('每分钟舂击次数')).toContain(`${strikesPerMinute()}`)
  })
  test('拨板方向：压下开始时圆头正好碰到静止的碓尾（碓杆转角 0），开始角与模型一致', () => {
    // 第 k 个碓的第 j 块拨板，在 theta = β − alphaIn 时开始压下（α = β − θ）
    for (let k = 0; k < N_LEVERS; k++)
      for (const beta of PEG_BETA[k]) {
        const th = (((beta - CYCLE.alphaIn) % TAU) + TAU) % TAU
        const before = simulate(((th - 0.01 + TAU) % TAU) / OMEGA, c).levers[k]
        const after = simulate((th + 0.01) / OMEGA, c).levers[k]
        expect(before.stage === 'push').toBe(false)
        expect(after.stage).toBe('push')
        expect(after.phi).toBeLessThan(0.02)
      }
  })
})

describe('水碓 · 协同链与画面一致', () => {
  const stepsOf = (k: number) => exhibit.chain.filter((s) => s.id.endsWith(`-${k + 1}`) && /^(push|fall|strike)-/.test(s.id))
  const STEP_OF: Record<LeverStage, string | null> = { push: 'push', fall: 'fall', strike: 'strike', idle: null }
  test('每个碓在任一时刻至多点亮一环，且就是它当前阶段对应的那一环', () => {
    for (const t of times.filter((_, i) => i % 7 === 0)) {
      const s = simulate(t, c)
      for (let k = 0; k < N_LEVERS; k++) {
        const lit = stepsOf(k).filter((st) => st.active!(s)).map((st) => st.id.split('-')[0])
        const want = STEP_OF[s.levers[k].stage]
        expect(lit).toEqual(want ? [want] : [])
      }
    }
  })
  test('阶段与画面（位姿）一致：push 时碓头在升；fall 时 φ > 0 或刚好落到位；strike/idle 时 φ = 0', () => {
    for (const t of times) {
      const s = simulate(t, c)
      for (const L of s.levers) {
        if (L.stage === 'push') expect(L.phi).toBeGreaterThan(0)
        if (L.stage === 'strike' || L.stage === 'idle') expect(L.phi).toBe(0)
      }
    }
  })
  test('「砸到臼里」点亮的时长为 STRIKE_FLASH，随后回到静候', () => {
    const st = stages(0)
    const run = (from: number) => {
      let n = 0
      while (st[(from + n) % N] === 'strike' && n < N) n++
      return n
    }
    const starts = st.map((x, i) => (x === 'strike' && st[(i + N - 1) % N] !== 'strike' ? i : -1)).filter((i) => i >= 0)
    expect(starts).toHaveLength(PEGS_PER_LEVER)
    for (const i of starts) expect(Math.abs((run(i) * PERIOD) / N - STRIKE_FLASH)).toBeLessThan(0.05)
    expect(st).toContain('idle')
  })
  test('链上引用的零件都存在；爆炸时水流示意隐藏', () => {
    const ids = new Set(exhibit.parts.map((p) => p.id))
    for (const st of exhibit.chain) for (const r of st.parts) expect(ids.has(r.split('#')[0])).toBe(true)
    expect(part('flow').explode.hide).toBe(true)
    expect(part('stream').explode.hide).toBe(true)
  })
  test('水流开关只影响显示：关闭后水流与尾水不可见，运动不变', () => {
    const on = simulate(1.234, { water: true })
    const off = simulate(1.234, { water: false })
    expect(part('flow').visible!(on, 0)).toBe(true)
    expect(part('flow').visible!(off, 0)).toBe(false)
    expect(off.levers).toEqual(on.levers)
  })
})
