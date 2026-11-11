// 石磨的运动学审计（PLAN 第 7 节第 4 条：连杆长度在全周期内不变，误差 < 1e-6）与协同链一致性。
import { describe, expect, test } from 'vitest'
import { cycleTimes, jointDistances } from '../../exhibit/audit'
import { v3 } from '../../kinematics/vec'
import exhibit from './index'
import { DIM, GRAIN_STAGES, PERIOD, Y, simulate } from './model'

const times = cycleTimes(exhibit, 720)
const c = exhibit.defaults

describe('石磨 · 运动学', () => {
  test('推杆套在磨拐木橛上：两者轴心距离全周期为 0', () => {
    const d = jointDistances(exhibit, times, { part: 'crank', local: [DIM.crankR, DIM.rodLocalY, 0] }, { part: 'push-rod', local: [0, 0, 0] })
    expect(Math.max(...d)).toBeLessThan(1e-6)
  })
  test('推杆长度不变：木橛到横把的距离恒为 1200 mm', () => {
    const d = jointDistances(exhibit, times, { part: 'crank', local: [DIM.crankR, DIM.rodLocalY, 0] }, { part: 'push-rod', local: [DIM.rodLen, 0, 0] })
    expect(Math.max(...d.map((x) => Math.abs(x - DIM.rodLen)))).toBeLessThan(1e-6)
  })
  test('横把只沿 X 往复（人站着不动，只推拉）', () => {
    const p = exhibit.parts.find((x) => x.id === 'push-rod')!
    for (const t of times) {
      const s = simulate(t, c)
      const pose = p.pose!(s, 0)
      const q = pose.q!
      // 横把 = 推杆局部 (L,0,0)
      const end = v3.add(pose.p, [
        DIM.rodLen * (1 - 2 * (q[1] ** 2 + q[2] ** 2)),
        DIM.rodLen * 2 * (q[0] * q[1] + q[3] * q[2]),
        DIM.rodLen * 2 * (q[0] * q[2] - q[3] * q[1]),
      ])
      expect(Math.abs(end[2])).toBeLessThan(1e-6)
      expect(Math.abs(end[1] - Y.rod)).toBeLessThan(1e-6)
    }
  })
  test('横把行程 = 2 × 曲柄半径；死点处力臂为 0', () => {
    const xs = times.map((t) => simulate(t, c).crank.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2 * DIM.crankR, 0)
    expect(simulate(0, c).crank.arm).toBeLessThan(1e-9)
    expect(simulate(PERIOD / 2, c).crank.arm).toBeLessThan(1e-6)
    expect(simulate(PERIOD / 4, c).crank.arm).toBeGreaterThan(DIM.crankR * 0.9)
  })
  test('推杆在转到远侧时从上扇上方越过，不碰磨面', () => {
    expect(Y.rod - DIM.rodR).toBeGreaterThan(Y.upperTop)
  })
  test('一圈里推、拉各半，死点两次', () => {
    const phases = times.map((t) => simulate(t, c).phase)
    const changes = phases.filter((p, i) => p !== phases[(i + phases.length - 1) % phases.length])
    expect(changes).toEqual(expect.arrayContaining(['push', 'dead', 'pull']))
    expect(changes.filter((p) => p === 'dead')).toHaveLength(2)
    const push = phases.filter((p) => p === 'push').length
    const pull = phases.filter((p) => p === 'pull').length
    expect(Math.abs(push - pull)).toBeLessThanOrEqual(2)
  })
})

describe('石磨 · 协同链与画面一致', () => {
  const step = (id: string) => exhibit.chain.find((s) => s.id === id)!
  test('任一时刻恰好一个动力环（推/拉/死点）与一个粮食环点亮', () => {
    for (const t of times) {
      const s = simulate(t, c)
      expect(['push', 'pull', 'dead'].filter((id) => step(id).active!(s))).toHaveLength(1)
      expect(['feed', 'grind', 'discharge'].filter((id) => step(id).active!(s))).toHaveLength(1)
    }
  })
  test('关闭粮粒时，粮食三环不点亮', () => {
    const s = simulate(1, { grain: false })
    expect(['feed', 'grind', 'discharge'].some((id) => step(id).active!(s))).toBe(false)
  })
  test('粮粒路线连续（除了落入磨盘后重新出现），且在两扇之间时高度处于缝隙中', () => {
    const n = 2000
    let jumps = 0
    let prev = simulate(0, c).grains[0]
    for (let i = 1; i <= n; i++) {
      const g = simulate((PERIOD * i) / n, c).grains[0]
      if (v3.dist(g.pos, prev.pos) > 20) jumps++
      if (g.stage === 'gap') expect(g.pos[1]).toBeCloseTo(Y.gapMid)
      prev = g
    }
    expect(jumps).toBe(1)
    expect(GRAIN_STAGES.wait).toBeLessThan(GRAIN_STAGES.eye)
  })
})
