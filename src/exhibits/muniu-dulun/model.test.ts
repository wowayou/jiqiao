// 独轮车说的模型测试：力矩平衡、车轮滚动无滑动、周期闭合、支脚/车轮与地面的关系、协同链与画面一致。
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { auditInterference, buildParts, cycleTimes, type BuiltParts } from '../../exhibit/audit'
import { evaluateScene } from '../../exhibit/scene'
import { getKernel, type Kernel } from '../../kernel'
import { poseApply } from '../../kinematics/pose'
import exhibit from './index'
import {
  AXLE_Y,
  BETA0,
  CARGO_KG,
  CIRC,
  D_MAX,
  D_MIN,
  GROUND_HALF,
  LEG_ARM,
  MARK_P,
  PERIOD,
  PHASE,
  SELF_ARM,
  SELF_KG,
  TOTAL_KG,
  WHEEL_R,
  framePose,
  loads,
  markShift,
  simulate,
  type DulunControls,
  type DulunState,
} from './model'

const c = exhibit.defaults as DulunControls
const times = cycleTimes(exhibit, 360)
const part = (id: string) => exhibit.parts.find((p) => p.id === id)!
const at = (t: number, d = c.cargoD) => simulate(t, { cargoD: d })
const sample = (stage: keyof typeof PHASE, f: number) => PHASE[stage][0] + (PHASE[stage][1] - PHASE[stage][0]) * f

describe('独轮车 · 力矩平衡（杠杆）', () => {
  test('用零件位姿量出的力臂满足：手力×手臂 + 脚力×脚臂 = 货重×货臂 + 自重×自重臂；竖向合力为零', () => {
    for (const d of [D_MIN, 150, 400, D_MAX]) {
      for (const t of times) {
        const s = at(t, d)
        // 力臂从零件的世界位姿量出：到轮轴（x = 0）的水平距离，轴后为正
        const cargoX = part('sack').pose!(s, 0).p[0]
        const cargoArm = -cargoX
        const selfArm = -poseApply(framePose(s), [-SELF_ARM, 0, 0])[0]
        const handArm = -s_grip(s)[0]
        expect(cargoArm).toBeCloseTo(s.armCargo, 6)
        expect(selfArm).toBeCloseTo(s.armSelf, 6)
        expect(handArm).toBeCloseTo(s.armHand, 6)
        const lhs = s.handKg * handArm + s.legKg * LEG_ARM
        const rhs = CARGO_KG * cargoArm + SELF_KG * selfArm
        expect(lhs).toBeCloseTo(rhs, 6)
        expect(s.handKg + s.legKg + s.wheelKg).toBeCloseTo(TOTAL_KG, 9)
        expect(s.wheelKg).toBeGreaterThan(0)
        expect(s.handKg).toBeGreaterThanOrEqual(0)
        expect(s.legKg).toBeGreaterThanOrEqual(0)
      }
    }
  })
  test('推行时（车架水平）人手力 = (货重×货臂 + 自重×自重臂) ÷ 手臂，货臂就是 d', () => {
    const s = at(sample('push', 0.5), 300)
    expect(s.beta).toBe(0)
    expect(s.armCargo).toBeCloseTo(300, 9)
    expect(s.handKg).toBeCloseTo((CARGO_KG * 300 + SELF_KG * SELF_ARM) / 1380, 9)
    expect(s.legKg).toBe(0)
  })
  test('停车时人手不出力，支脚与轮子分担', () => {
    const s = at(0)
    expect(s.handKg).toBe(0)
    expect(s.legKg).toBeGreaterThan(0)
    expect(s.wheelKg).toBeGreaterThan(0)
    expect(s.ratio).toBeNull()
  })
  test('货物位置变化时读数单调变化：越靠近轮轴，人手越省力、轮子越吃重、省力比越大', () => {
    for (const stage of ['load', 'raise', 'push', 'lower'] as const) {
      const t = sample(stage, 0.7)
      let prev: DulunState | null = null
      for (let d = D_MIN; d <= D_MAX; d += 25) {
        const s = at(t, d)
        if (prev) {
          expect(s.handKg).toBeGreaterThan(prev.handKg)
          expect(s.wheelKg).toBeLessThan(prev.wheelKg)
          expect(s.ratio!).toBeLessThan(prev.ratio!)
        }
        prev = s
      }
    }
    // 停车时支脚承担也随 d 增加（轮子承担减少）
    let prev = at(0, D_MIN)
    for (let d = 25; d <= D_MAX; d += 25) {
      const s = at(0, d)
      expect(s.legKg).toBeGreaterThan(prev.legKg)
      expect(s.wheelKg).toBeLessThan(prev.wheelKg)
      prev = s
    }
  })
  test('货放在轴正上方（d=0）时人手只需托车自重的一小部分', () => {
    const s = at(sample('push', 0.5), 0)
    expect(s.handKg).toBeLessThan(0.1 * TOTAL_KG)
    expect(at(sample('push', 0.5), D_MAX).handKg).toBeGreaterThan(0.3 * TOTAL_KG)
  })
})

function s_grip(s: DulunState) {
  return poseApply(framePose(s), [-1380, 220, 0])
}

describe('独轮车 · 车轮滚动与周期闭合', () => {
  test('车轮转角 = 走过的距离 ÷ 轮半径；推行一圈恰好转一整圈', () => {
    for (const t of times) {
      const s = at(t)
      expect(s.theta).toBeCloseTo(s.s / WHEEL_R, 12)
    }
    expect(at(sample('push', 1) - 1e-9).theta).toBeCloseTo(2 * Math.PI, 6)
    expect(CIRC).toBeCloseTo(2 * Math.PI * WHEEL_R, 9)
  })
  test('无滑动：车轮最低点相对车的速度 = 地面标记相对车的速度', () => {
    const wheel = part('wheel')
    const mark = part('marks')
    const dt = 1e-4
    for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const t = sample('push', f)
      const s0 = at(t - dt)
      const s1 = at(t + dt)
      // 取 t 时刻转到最低点的那个轮上材质点
      const sm = at(t)
      const wp = wheel.pose!(sm, 0)
      const q = wp.q!
      // 局部点 = 逆旋转 (0, -R, 0)
      const inv: [number, number, number, number] = [-q[0], -q[1], -q[2], q[3]]
      const local = poseApply({ p: [0, 0, 0], q: inv }, [0, -WHEEL_R, 0])
      const w0 = poseApply(wheel.pose!(s0, 0), local)
      const w1 = poseApply(wheel.pose!(s1, 0), local)
      const vWheel = (w1[0] - w0[0]) / (2 * dt)
      const vyWheel = (w1[1] - w0[1]) / (2 * dt)
      // 一块可见的地面标记（第 5 号，位置靠近中心）
      const m0 = mark.pose!(s0, 6).p[0]
      let dm = mark.pose!(s1, 6).p[0] - m0
      // 标记在一个间距处循环：跨过接缝时补回一个间距（相邻两个标记外观一样）
      if (dm > MARK_P / 2) dm -= MARK_P
      if (dm < -MARK_P / 2) dm += MARK_P
      const vMark = dm / (2 * dt)
      expect(Math.abs(vWheel - vMark)).toBeLessThan(1e-3 * Math.max(1, Math.abs(vMark)))
      expect(Math.abs(vyWheel)).toBeLessThan(1e-3 * Math.max(1, Math.abs(vMark)))
      expect(vMark).toBeLessThan(0)
    }
  })
  test('周期闭合：t=0 与 t→PERIOD 时所有零件位姿一致，simulate(t+PERIOD)=simulate(t)', () => {
    for (const d of [D_MIN, 400, D_MAX]) {
      const a = evaluateScene(exhibit, simulate(0, { cargoD: d }))
      const b = evaluateScene(exhibit, simulate(PERIOD - 1e-9, { cargoD: d }))
      for (const [key, A] of a) {
        const B = b.get(key)!
        expect(B.visible).toBe(A.visible)
        A.pose.p.forEach((x, i) => expect(B.pose.p[i]).toBeCloseTo(x, 3))
        const qa = A.pose.q ?? [0, 0, 0, 1]
        const qb = B.pose.q ?? [0, 0, 0, 1]
        const sign = qa.reduce((acc, x, i) => acc + x * qb[i], 0) < 0 ? -1 : 1
        qa.forEach((x, i) => expect(sign * qb[i]).toBeCloseTo(x, 4))
      }
    }
    for (const t of [0.3, 7.7, 13.9]) expect(JSON.stringify(simulate(t + PERIOD, c))).toBe(JSON.stringify(simulate(t, c)))
  })
  test('连续性：相邻时刻的读数没有跳变', () => {
    const dt = PERIOD / 3600
    let prev = at(0)
    for (let i = 1; i <= 3600; i++) {
      const s = at(i * dt)
      expect(Math.abs(s.handKg - prev.handKg)).toBeLessThan(1)
      expect(Math.abs(s.legKg - prev.legKg)).toBeLessThan(1)
      expect(Math.abs(s.wheelKg - prev.wheelKg)).toBeLessThan(1)
      expect(Math.abs(s.beta - prev.beta)).toBeLessThan(0.01)
      prev = s
    }
  })
  test('地面标记间距 = 轮周长/6，推行一圈标记图案正好重合', () => {
    expect(MARK_P * 6).toBeCloseTo(CIRC, 9)
    expect(markShift(CIRC)).toBe(0)
    expect(markShift(0)).toBe(0)
    const a = evaluateScene(exhibit, at(1))
    const b = evaluateScene(exhibit, at(PERIOD - 1e-9))
    const vis = (m: typeof a) =>
      [...m].filter(([k, v]) => k.startsWith('marks:') && v.visible).map(([, v]) => Math.round(v.pose.p[0]))
    expect(vis(b)).toEqual(vis(a))
    expect(vis(a).every((x) => Math.abs(x) <= GROUND_HALF)).toBe(true)
  })
})

describe('独轮车 · 与地面的关系（用实体包围盒）', () => {
  let k: Kernel
  let built: BuiltParts
  beforeAll(async () => {
    k = await getKernel()
    built = buildParts(k, exhibit)
  })
  afterAll(() => built?.dispose())
  const lowest = (id: string, s: DulunState, copy = 0) => {
    const key = id
    const sc = evaluateScene(exhibit, s)
    return k.bboxOf(built.solids[id], sc.get(key)!.pose).min[1]
  }
  test('车轮最低点全周期离地 0.2 mm（贴地不陷入），轮轴中心高度恒定', () => {
    for (const t of times.filter((_, i) => i % 6 === 0)) {
      const s = at(t)
      expect(lowest('wheel', s)).toBeGreaterThan(0.1)
      expect(lowest('wheel', s)).toBeLessThan(0.5)
      expect(part('wheel').pose!(s, 0).p[1]).toBe(AXLE_Y)
      expect(part('axle').pose ?? part('axle').rest).toBeTruthy()
    }
  })
  test('停车与加力/卸力时支脚离地 < 0.5 mm（落地）；抬平后离地 100 mm 以上', () => {
    for (const t of [0, sample('park', 0.5), sample('load', 0.5), sample('unload', 0.5), PERIOD - 0.01]) {
      const y = lowest('legs', at(t))
      expect(y).toBeGreaterThan(0)
      expect(y).toBeLessThan(0.5)
    }
    const up = lowest('legs', at(sample('push', 0.5)))
    console.info(`[muniu-dulun] 抬平后支脚底面离地 ${up.toFixed(1)} mm；车把末端离地 ${(AXLE_Y + 220).toFixed(0)} mm（水平）`)
    expect(up).toBeGreaterThan(110)
    expect(up).toBeLessThan(125)
  })
  test('支脚底面在落地时是平的（整个底面贴地，不是一条边）', () => {
    const y = lowest('legs', at(0))
    const bb = k.bboxOf(built.solids.legs, evaluateScene(exhibit, at(0)).get('legs')!.pose)
    expect(bb.min[1]).toBeCloseTo(y, 9)
    expect(bb.min[1]).toBeCloseTo(0.3, 2)
  })
  test('车把末端：停车时贴近轴高，抬平后比轴高 220 mm', () => {
    const y0 = poseApply(framePose(at(0)), [-1380, 220, 0])[1]
    const y1 = poseApply(framePose(at(sample('push', 0.5))), [-1380, 220, 0])[1]
    expect(y0).toBeCloseTo(AXLE_Y + (-1380 * Math.sin(BETA0) + 220 * Math.cos(BETA0)), 6)
    expect(y1).toBeCloseTo(AXLE_Y + 220, 6)
    expect(y1).toBeGreaterThan(y0 + 150)
  })
  test('货物在整个控件范围内都压在货板上（x 方向不超出货板），底面离货板 0.2 mm', () => {
    const sc = (d: number) => evaluateScene(exhibit, at(sample('push', 0.5), d))
    for (const d of [D_MIN, 300, D_MAX]) {
      const bb = k.bboxOf(built.solids.sack, sc(d).get('sack:0')!.pose)
      expect(bb.min[0]).toBeGreaterThan(-890)
      expect(bb.max[0]).toBeLessThan(330)
      expect(bb.min[1] - (AXLE_Y + 40)).toBeCloseTo(0.2, 2)
    }
  })
  test('干涉审计在货物位置的两端（d=0、d=600）同样通过；整个周期 240 相位', () => {
    for (const d of [D_MIN, D_MAX]) {
      const r = auditInterference(
        k,
        exhibit,
        {
          times: Array.from({ length: 240 }, (_, i) => (PERIOD * i) / 240),
          pairs: exhibit.audit!.contacts!,
          threshold: 0.005,
          controls: { cargoD: d },
        },
        built,
      )
      console.info(`[audit] muniu-dulun d=${d}：采样 ${r.samples}，布尔求交 ${r.booleanChecks} 次，最大交集占比 ${(r.maxRatio * 100).toExponential(2)}%`)
      expect(r.failures).toEqual([])
    }
  }, 120_000)
  test('爆炸态下零件互不重叠（两两，含全部零件）', () => {
    const ids = exhibit.parts.filter((p) => !p.explode.hide).map((p) => p.id)
    const pairs: [string, string][] = []
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i], ids[j]])
    const r = auditInterference(k, exhibit, { times: [0, sample('push', 0.5)], pairs, threshold: 0.001, explode: 1 }, built)
    console.info(`[audit] muniu-dulun 完全爆炸：两两检查 ${r.pairChecks} 对，最大交集占比 ${(r.maxRatio * 100).toExponential(2)}%`)
    expect(r.failures).toEqual([])
  })
  test('负对照：把车轮压低 40 mm，审计应当报告车轮 × 地面穿模', () => {
    const bad = {
      ...exhibit,
      parts: exhibit.parts.map((p) =>
        p.id === 'wheel' ? { ...p, pose: (s: DulunState, i: number) => ({ ...p.pose!(s, i), p: [0, AXLE_Y - 40, 0] as [number, number, number] }) } : p,
      ),
    }
    const r = auditInterference(k, bad, { times: [0, 5, 10], pairs: [['wheel', 'ground']], threshold: 0.005 }, built)
    expect(r.failures.length).toBeGreaterThan(0)
  })
})

describe('独轮车 · 协同链与画面一致', () => {
  const step = (id: string) => exhibit.chain.find((s) => s.id === id)!
  test('停车：只有支脚环点亮', () => {
    const s = at(sample('park', 0.5))
    expect(step('legs').active!(s)).toBe(true)
    for (const id of ['lift', 'fulcrum', 'roll']) expect(step(id).active!(s)).toBe(false)
  })
  test('推行：人抬把、轴承重、轮滚动三环点亮，支脚环熄灭', () => {
    const s = at(sample('push', 0.5))
    for (const id of ['lift', 'fulcrum', 'roll']) expect(step(id).active!(s)).toBe(true)
    expect(step('legs').active!(s)).toBe(false)
  })
  test('点亮与画面一致：人手箭头可见 ⇔ 「人抬车把」亮；支脚着地 ⇔ 「支脚」亮；滚动环 ⇔ 车轮在转', () => {
    const hand = part('hand')
    for (const t of times) {
      const s = at(t)
      const handShown = hand.visible!(s, 0)
      expect(step('lift').active!(s)).toBe(s.handKg > 0.05)
      if (s.handKg > 0.5) expect(handShown).toBe(true)
      if (s.handKg <= 0.05) expect(handShown).toBe(false)
      expect(step('roll').active!(s)).toBe(s.stage === 'push')
      if (s.stage !== 'push') expect(s.theta % (2 * Math.PI) < 1e-9 || Math.abs((s.theta % (2 * Math.PI)) - 2 * Math.PI) < 1e-9).toBe(true)
      // 支脚环亮时，车架确实处在能让脚着地的姿态
      if (s.legKg > 0.05) expect(s.beta).toBeCloseTo(BETA0, 12)
      if (s.beta < BETA0 - 1e-9) expect(s.legKg).toBe(0)
    }
  })
  test('一圈里每个阶段都出现，且顺序为：停车 → 加力 → 抬平 → 推行 → 放把 → 卸力', () => {
    const seq: string[] = []
    for (const t of times) {
      const st = at(t).stage
      if (seq[seq.length - 1] !== st) seq.push(st)
    }
    expect(seq).toEqual(['park', 'load', 'raise', 'push', 'lower', 'unload'])
  })
  test('读数：三项承担之和 = 总重；省力比 = 总重 ÷ 人手承担', () => {
    const r = (label: string, s: DulunState) => exhibit.readouts.find((x) => x.label.startsWith(label))!.value(s)
    const s = at(sample('push', 0.5), 200)
    const f = parseFloat(r('人手', s))
    const w = parseFloat(r('轮子', s))
    const l = parseFloat(r('支脚', s))
    expect(f + w + l).toBeCloseTo(TOTAL_KG, 0)
    expect(parseFloat(r('省力比', s))).toBeCloseTo(TOTAL_KG / s.handKg, 0)
    expect(loads(0, 200, 1).handKg).toBeCloseTo(s.handKg, 9)
  })
})
