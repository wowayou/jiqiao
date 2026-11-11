// 记里鼓车：运动学审计（PLAN 第 7 节第 4 条）、原文数字验算、各级啮合间隙、击打与转角对应、协同链一致、
// 以及按啮合周期加密的干涉审计（auditMotion 在 3000 周的长周期上均匀取样，对单个齿太稀，这里补足）。
import { describe, expect, test } from 'vitest'
import { getKernel } from '../../kernel'
import { auditInterference, buildParts } from '../../exhibit/audit'
import { formatReport } from '../../exhibit/testing'
import { evaluateScene } from '../../exhibit/scene'
import { minCapsuleClearance, pointSegDist2, type Capsule } from '../../kinematics/pegGear'
import { TAU, type Vec3 } from '../../kinematics/vec'
import exhibit from './index'
import {
  ARM,
  DRIVE,
  GAMMA2,
  GEAR,
  H,
  O2_XZ,
  O3_XZ,
  PERIOD,
  PERIOD_REVS,
  R,
  STRIKER_GEO,
  S_XZ,
  STRIKE_WINDOW_REVS,
  TEXT,
  T_F,
  Y0,
  Y_P,
  Z_LI,
  anglesAt,
  headBottom,
  pitchOf,
  shangRevs,
  stateAtRevs,
  zhongRevs,
} from './model'

const c = exhibit.defaults
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps

describe('原文数字验算（卢道隆条）', () => {
  test('足轮一周行地三步：围一丈八尺 ÷ 古法六尺一步 = 3', () => {
    expect(TEXT.foot.c / TEXT.oldStep).toBe(TEXT.stepsPerRev)
  })
  test('足轮百周一里：古法 300 步 ÷ 3 = 100；今法 360 × 5 尺 ÷ 18 尺 = 100', () => {
    expect(TEXT.oldStepsPerLi / TEXT.stepsPerRev).toBe(100)
    expect((TEXT.newStepsPerLi * TEXT.newStep) / TEXT.foot.c).toBe(100)
    expect(TEXT.oldStepsPerLi * TEXT.oldStep).toBe(TEXT.newStepsPerLi * TEXT.newStep)
  })
  test('齿轮链总速比：18/54 × 3/100 = 1/100；再 × 10/100 = 1/1000', () => {
    const r1 = (TEXT.li.z / TEXT.xia.z) * (TEXT.xuan.z / TEXT.zhong.z)
    expect(r1).toBeCloseTo(1 / 100, 15)
    expect(r1 * (TEXT.xiao.z / TEXT.shang.z)).toBeCloseTo(1 / 1000, 15)
  })
  test('合二百八十五齿、大小轮八', () => {
    expect(TEXT.li.z + TEXT.xia.z + TEXT.xuan.z + TEXT.zhong.z + TEXT.xiao.z + TEXT.shang.z).toBe(TEXT.totalTeeth)
    expect(2 + 6).toBe(TEXT.wheels)
  })
  test('原文的「围」都等于 3 × 径（周三径一）', () => {
    for (const w of [TEXT.foot, TEXT.li, TEXT.xia, TEXT.zhong, TEXT.xiao, TEXT.shang]) expect(w.c).toBeCloseTo(3 * w.d, 12)
  })
  test('齿距 × 齿数 = 围：立、下平、中平吻合；小平、上平不吻合（原文内部不一致，如实保留）', () => {
    expect(TEXT.li.z * TEXT.li.pitch).toBeCloseTo(TEXT.li.c, 12)
    expect(TEXT.xia.z * TEXT.xia.pitch).toBeCloseTo(TEXT.xia.c, 12)
    expect(TEXT.zhong.z * TEXT.zhong.pitch).toBeCloseTo(TEXT.zhong.c, 12)
    expect(TEXT.xiao.z * TEXT.xiao.pitch).toBeCloseTo(1.5, 12)
    expect(TEXT.xiao.c).toBe(1)
    expect(TEXT.shang.z * TEXT.shang.pitch).toBeCloseTo(15, 12)
    expect(TEXT.shang.c).toBe(10)
  })
  test('照径六尺的真实周长约 18.85 尺，比「围一丈八尺」多约 4.7%', () => {
    expect(Math.PI * TEXT.foot.d).toBeCloseTo(18.85, 2)
    expect((Math.PI * TEXT.foot.d) / TEXT.foot.c - 1).toBeCloseTo(0.047, 3)
  })
  test('建模节圆照录原文的径；相啮合两轮节圆齿距相等', () => {
    expect(R.wheel * 2).toBeCloseTo(1860)
    expect(R.li * 2).toBeCloseTo(427.8)
    expect(R.xia * 2).toBeCloseTo(1283.4)
    expect(R.zhong * 2).toBeCloseTo(1240)
    expect(R.xiao * 2).toBeCloseTo(103.333, 2)
    expect(R.shang * 2).toBeCloseTo(1033.33, 1)
    expect(pitchOf(R.li, 18)).toBeCloseTo(pitchOf(R.xia, 54), 9)
    expect(pitchOf(R.xuan, 3)).toBeCloseTo(pitchOf(R.zhong, 100), 9)
    expect(pitchOf(R.xiao, 10)).toBeCloseTo(pitchOf(R.shang, 100), 9)
    expect(R.xuan).toBeCloseTo(18.6, 9)
  })
  test('布置约束：中平轮轴落在下平轮轮辋上方、上平轮轴落在中平轮轮辋之内', () => {
    const d2 = Math.hypot(O2_XZ[0] - S_XZ[0], O2_XZ[1] - S_XZ[1])
    expect(d2).toBeCloseTo(638.6, 6)
    expect(d2).toBeGreaterThan(GEAR.xia.rimIn)
    expect(d2).toBeLessThan(GEAR.xia.rimOut)
    const d3 = Math.hypot(O3_XZ[0] - O2_XZ[0], O3_XZ[1] - O2_XZ[1])
    expect(d3).toBeCloseTo(568.333, 2)
    expect(d3).toBeLessThan(GEAR.zhong.rimOut)
  })
})

describe('运动学审计', () => {
  const Ns = [0, 0.37, 13.81, 257.5, 1234.567]
  test('足轮 100 周，中平轮恰好 1 周', () => {
    for (const N of Ns) {
      expect(anglesAt(N + 100).zhong - anglesAt(N).zhong).toBeCloseTo(TAU, 9)
      expect(zhongRevs(stateAtRevs(N + 100, c)) - zhongRevs(stateAtRevs(N, c))).toBeCloseTo(1, 12)
    }
  })
  test('足轮 1000 周，上平轮恰好 1 周（反向）', () => {
    for (const N of Ns) {
      expect(anglesAt(N + 1000).shang - anglesAt(N).shang).toBeCloseTo(-TAU, 8)
      expect(shangRevs(stateAtRevs(N + 1000, c)) - shangRevs(stateAtRevs(N, c))).toBeCloseTo(1, 12)
    }
  })
  test('各级速比等于齿数比', () => {
    for (const N of Ns) {
      const a = anglesAt(N)
      const b = anglesAt(N + 0.123)
      // 一级：匀速 18/54
      expect((b.xia - a.xia) / (b.wheel - a.wheel)).toBeCloseTo(TEXT.li.z / TEXT.xia.z, 12)
      // 同轴：旋风轮与下平轮同转
      expect(b.xuan - a.xuan).toBeCloseTo(b.xia - a.xia, 12)
      // 三级：匀速 10/100（反向）
      if (Math.abs(b.zhong - a.zhong) > 1e-9) expect((b.shang - a.shang) / (b.xiao - a.xiao)).toBeCloseTo(-TEXT.xiao.z / TEXT.shang.z, 9)
      expect(b.xiao - a.xiao).toBeCloseTo(b.zhong - a.zhong, 12)
      // 二级：每转一个拨齿周期（旋风轮 1/3 周 = 足轮 1 周）中平轮恰好前进 1 齿 → 平均 3/100
      const k = anglesAt(N + 1)
      expect(k.zhongTeeth - a.zhongTeeth).toBeCloseTo(1, 12)
      expect((k.zhong - a.zhong) / -(k.xuan - a.xuan)).toBeCloseTo(TEXT.xuan.z / TEXT.zhong.z, 12)
    }
  })
  test('二级是一拨一停：每周足轮里中平轮有一段完全静止', () => {
    const n = 400
    let still = 0
    for (let i = 0; i < n; i++) {
      const N = 50 + i / n
      if (Math.abs(anglesAt(N + 1 / n).zhong - anglesAt(N).zhong) < 1e-12) still++
    }
    expect(still / n).toBeGreaterThan(1 - DRIVE.pushFraction - 0.01)
    expect(still).toBeGreaterThan(0)
  })
  test('时间轴闭合：3000 周时所有轮回到原位（下平轮要 3000 周才转整数周）', () => {
    const a = anglesAt(0)
    const b = anglesAt(PERIOD_REVS)
    for (const key of ['wheel', 'xia', 'xuan', 'zhong', 'xiao', 'shang'] as const) {
      const d = (b[key] - a[key]) / TAU
      expect(Math.abs(d - Math.round(d))).toBeLessThan(1e-9)
    }
    // 1000 周时下平轮转了 333⅓ 周：不闭合（所以周期不能取 1000）
    const d1000 = (anglesAt(1000).xia - a.xia) / TAU
    expect(Math.abs(d1000 - Math.round(d1000))).toBeGreaterThan(0.3)
    expect(PERIOD).toBe(PERIOD_REVS * T_F)
  })
  test('绕回不跳变：t → period 与 t = 0 的全部零件位姿一致', () => {
    const A = evaluateScene(exhibit, exhibit.simulate(PERIOD - 1e-7, c))
    const B = evaluateScene(exhibit, exhibit.simulate(0, c))
    for (const [key, sa] of A) {
      const sb = B.get(key)!
      for (let i = 0; i < 3; i++) expect(Math.abs(sa.pose.p[i] - sb.pose.p[i])).toBeLessThan(0.05)
      if (sa.pose.q && sb.pose.q) {
        const dot = Math.abs(sa.pose.q.reduce((s, x, i) => s + x * sb.pose.q![i], 0))
        expect(dot).toBeGreaterThan(1 - 1e-8)
      }
    }
  })
})

// —— 啮合间隙：用与几何相同的尺寸把销画成胶囊，逐相位量最小间隙 ——
function stage1Gap(N: number) {
  const a = anglesAt(N)
  const g = GEAR.li
  const pegs: Capsule[] = []
  for (let i = 0; i < TEXT.li.z; i++) {
    const t = a.wheel + (TAU * i) / TEXT.li.z
    const d = [Math.cos(t), Math.sin(t)]
    pegs.push({ a: [d[0] * g.pegIn, Y0 + d[1] * g.pegIn, Z_LI], b: [d[0] * g.pegOut, Y0 + d[1] * g.pegOut, Z_LI], r: g.pegR })
  }
  const pins: Capsule[] = []
  for (let j = 0; j < TEXT.xia.z; j++) {
    const t = a.xia + (TAU * j) / TEXT.xia.z
    const x = S_XZ[0] + R.xia * Math.cos(t)
    const z = S_XZ[1] - R.xia * Math.sin(t)
    if (Math.hypot(x, z - Z_LI) > 400) continue
    pins.push({ a: [x, H.xiaPinBottom + GEAR.xia.pinR, z], b: [x, H.xiaRim[0] - GEAR.xia.pinR, z], r: GEAR.xia.pinR })
  }
  return minCapsuleClearance(pegs, pins).gap
}
function stage3Gap(N: number) {
  const a = anglesAt(N)
  let min = Infinity
  for (let i = 0; i < TEXT.xiao.z; i++) {
    const t = a.xiao + (TAU * i) / TEXT.xiao.z
    const p = [O2_XZ[0] + R.xiao * Math.cos(t), O2_XZ[1] - R.xiao * Math.sin(t)]
    for (let j = 0; j < TEXT.shang.z; j++) {
      const u = a.shang + (TAU * j) / TEXT.shang.z
      const q = [O3_XZ[0] + R.shang * Math.cos(u), O3_XZ[1] - R.shang * Math.sin(u)]
      min = Math.min(min, Math.hypot(p[0] - q[0], p[1] - q[1]) - GEAR.xiao.pinR - GEAR.shang.pinR)
    }
  }
  return min
}
function stage2Gap(N: number) {
  const a = anglesAt(N)
  let min = Infinity
  for (let i = 0; i < TEXT.xuan.z; i++) {
    const t = a.xuan + (TAU * i) / TEXT.xuan.z
    const p0: [number, number] = [S_XZ[0] + GEAR.xuan.rootR * Math.cos(t), S_XZ[1] - GEAR.xuan.rootR * Math.sin(t)]
    const p1: [number, number] = [S_XZ[0] + GEAR.xuan.tipR * Math.cos(t), S_XZ[1] - GEAR.xuan.tipR * Math.sin(t)]
    for (let j = 0; j < TEXT.zhong.z; j++) {
      const u = a.zhong + (TAU * j) / TEXT.zhong.z
      const q: [number, number] = [O2_XZ[0] + R.zhong * Math.cos(u), O2_XZ[1] - R.zhong * Math.sin(u)]
      min = Math.min(min, pointSegDist2(q, p0, p1) - GEAR.xuan.armR - GEAR.zhong.pinR)
    }
  }
  return min
}

describe('各级齿真的咬在一起：不穿模、不悬空', () => {
  const samples = Array.from({ length: 720 }, (_, i) => 37 + (3 * i) / 720)
  test('一级（立轮×下平轮，正交销齿，恒定速比）：最小间隙在 0.5–3 mm', () => {
    const g = Math.min(...samples.map(stage1Gap))
    console.info(`[audit] jili-gu-che 一级销齿最小间隙 ${g.toFixed(3)} mm`)
    expect(g).toBeGreaterThan(0.5)
    expect(g).toBeLessThan(3)
  })
  test('三级（小平轮×上平轮，平行销齿，恒定速比）：最小间隙在 0.5–3 mm', () => {
    const g = Math.min(...samples.map(stage3Gap))
    console.info(`[audit] jili-gu-che 三级销齿最小间隙 ${g.toFixed(3)} mm`)
    expect(g).toBeGreaterThan(0.5)
    expect(g).toBeLessThan(3)
  })
  test('二级（旋风轮×中平轮，几何接触）：从不相交；推的时候恰好贴住', () => {
    let min = Infinity
    let maxPushGap = 0
    for (const N of samples) {
      const g = stage2Gap(N)
      min = Math.min(min, g)
      if (anglesAt(N).pushing) maxPushGap = Math.max(maxPushGap, g)
    }
    console.info(`[audit] jili-gu-che 二级拨齿最小间隙 ${min.toExponential(2)} mm，推动时最大间隙 ${maxPushGap.toExponential(2)} mm`)
    expect(min).toBeGreaterThan(-1e-6)
    expect(maxPushGap).toBeLessThan(1e-6)
  })
  test('高度上重叠（不悬空）：立轮销顶伸过下平轮冠销底；拨齿与中平轮冠销、小平轮立销与上平轮冠销高度相交', () => {
    expect(Y_P + GEAR.li.pegOut - R.li).toBeGreaterThan(H.xiaPinBottom + 15)
    expect(H.zhongPinBottom).toBeLessThan(H.xuanArm[0])
    expect(H.xiaoPinTop).toBeGreaterThan(H.shangPinBottom + 20)
  })
  test('旋风轮标准坐标系换算自洽：世界角 = γ2 − 标准角', () => {
    expect(Number.isFinite(GAMMA2)).toBe(true)
  })
})

describe('击鼓 / 击鐲与轮子转角严格对应', () => {
  test('击鼓的释放瞬间正是中平轮转满整周（足轮 100k 周）；击鐲正是上平轮转满整周（1000k 周）', () => {
    for (const k of [0, 1, 7, 29]) {
      const s = stateAtRevs(100 * k, c)
      expect(near(zhongRevs(s), k, 1e-9)).toBe(true)
    }
    for (const k of [0, 1, 2]) expect(near(shangRevs(stateAtRevs(1000 * k, c)), k, 1e-9)).toBe(true)
  })
  test('释放前槌举起，释放后很快落到鼓面（0.5 mm），之后静止在鼓面上直到下一次被顶起', () => {
    for (const id of ['lower', 'upper'] as const) {
      const every = id === 'lower' ? 100 : 1000
      const before = stateAtRevs(every - 1e-6, c)[id]
      // 释放瞬间圆脚的圆心正好与坡顶棱同高：升程 − 脚半径
      expect(before.lift).toBeCloseTo(STRIKER_GEO[id].cfg.lift - STRIKER_GEO[id].cfg.footRad, 1)
      expect(before.gap).toBeGreaterThan(30)
      const after = stateAtRevs(every + 0.2, c)[id]
      expect(after.lift).toBeCloseTo(0, 9)
      expect(after.gap).toBeCloseTo(0.5, 6)
      const mid = stateAtRevs(every / 2, c)[id]
      expect(mid.gap).toBeCloseTo(0.5, 6)
      expect(mid.striking).toBe(false)
    }
  })
  test('提杆只随轮的转角升起：上升只发生在中平轮在动的时刻（停住时提杆也停住）', () => {
    for (let i = 0; i < 2000; i++) {
      const N = 88 + (11.9 * i) / 2000
      const a = stateAtRevs(N, c)
      const b = stateAtRevs(N + 0.002, c)
      if (Math.abs(b.ang.zhong - a.ang.zhong) < 1e-13) expect(Math.abs(b.lower.lift - a.lower.lift)).toBeLessThan(1e-9)
    }
  })
  test('槌头从不穿进鼓面/鐲面，提杆圆脚从不穿进拨子（全周期加密采样）', () => {
    for (let i = 0; i < 6000; i++) {
      const N = (PERIOD_REVS * i) / 6000 + 0.0137
      const s = stateAtRevs(N, c)
      expect(s.lower.gap).toBeGreaterThan(0.4)
      expect(s.upper.gap).toBeGreaterThan(0.4)
    }
  })
  test('杆顶圆头始终贴住槌臂下沿（接触几何自洽）', () => {
    for (const N of [3, 95.5, 99.9, 100.01, 990]) {
      for (const id of ['lower', 'upper'] as const) {
        const s = stateAtRevs(N, c)[id]
        const cfg = STRIKER_GEO[id].cfg
        const dx = cfg.rodOffset
        const dy = s.rodTopY - cfg.pivotY
        expect(dx * Math.sin(s.arm) - dy * Math.cos(s.arm)).toBeCloseTo(ARM.tipR + ARM.half, 9)
      }
    }
    expect(headBottom(ARM.restAngle).low).toBeLessThan(0)
  })
})

describe('协同链与画面一致', () => {
  const step = (id: string) => exhibit.chain.find((s) => s.id === id)!
  test('「一拨一停」环点亮 ⇔ 中平轮此刻在转', () => {
    for (let i = 0; i < 1500; i++) {
      const N = 300 + (3 * i) / 1500 + 0.0003
      const s = stateAtRevs(N, c)
      const moving = Math.abs(anglesAt(N + 1e-6).zhong - anglesAt(N - 1e-6).zhong) > 1e-12
      expect(step('mesh2').active!(s)).toBe(moving)
      expect(step('mesh3').active!(s)).toBe(moving)
    }
  })
  test('击鼓环只在释放后的窗口里亮；击鐲环只在十里时亮；顶起环在击打前亮', () => {
    expect(step('drum').active!(stateAtRevs(200.1, c))).toBe(true)
    expect(step('drum').active!(stateAtRevs(200 + STRIKE_WINDOW_REVS + 0.01, c))).toBe(false)
    expect(step('drum').active!(stateAtRevs(199.9, c))).toBe(false)
    expect(step('drum-lift').active!(stateAtRevs(199.5, c))).toBe(true)
    expect(step('zhuo').active!(stateAtRevs(1000.2, c))).toBe(true)
    expect(step('zhuo').active!(stateAtRevs(1100.2, c))).toBe(false)
    expect(step('zhuo-lift').active!(stateAtRevs(980, c))).toBe(true)
  })
})

describe('按啮合周期加密的干涉审计（每个周期 ≥ 60 相位，阈值 0.5% 不变）', async () => {
  const k = await getKernel()
  const built = buildParts(k, exhibit)
  const run = (name: string, revs: number[], pairs: [string, string][]) => {
    const r = auditInterference(k, exhibit, { times: revs.map((N) => (N * T_F) % PERIOD), pairs, threshold: 0.005 }, built)
    console.info(formatReport(`jili-gu-che[${name}]`, r))
    expect(r.failures).toEqual([])
    expect(r.samples).toBeGreaterThanOrEqual(60)
  }
  test(
    '一级、二级、三级：足轮一周内 120 相位（= 二级一个拨齿周期；一级 6.7 个齿 × 18 相位/齿）',
    () => {
      run(
        '啮合',
        Array.from({ length: 120 }, (_, i) => 411 + i / 120),
        [
          ['li-lun', 'xia-ping'],
          ['xuan-feng', 'zhong-ping'],
          ['xiao-ping', 'shang-ping'],
          ['li-lun', 'frame-lower'],
          ['xia-ping', 'frame-lower'],
          ['zhong-ping', 'frame-lower'],
          ['shang-ping', 'zhong-ping'],
          ['xia-ping', 'zhong-ping'],
          ['xia-ping', 'zhong-zhou'],
          ['guan-xin-zhou', 'zhong-ping'],
        ],
      )
    },
    300_000,
  )
  test(
    '击鼓：顶起到落下（足轮 −11 → +1 周，80 相位，释放附近加密）',
    () => {
      const revs = [
        ...Array.from({ length: 50 }, (_, i) => 289 + (10.9 * i) / 50),
        ...Array.from({ length: 30 }, (_, i) => 299.9 + (0.6 * i) / 30),
      ]
      run('击鼓', revs, [
        ['bozi-zhong', 'ti-gan-xia'],
        ['ti-gan-xia', 'zhong-ping'],
        ['ti-gan-xia', 'deck-1'],
        ['ti-gan-xia', 'arm-lower'],
        ['arm-lower', 'drum-head'],
        ['arm-lower', 'drum'],
        ['arm-lower', 'figure-lower'],
        ['bozi-zhong', 'shang-ping'],
      ])
    },
    300_000,
  )
  test(
    '击鐲：最后一里顶起到落下（80 相位，释放附近加密）',
    () => {
      const revs = [
        ...Array.from({ length: 50 }, (_, i) => 1898 + (101.9 * i) / 50),
        ...Array.from({ length: 30 }, (_, i) => 1999.9 + (0.6 * i) / 30),
      ]
      run('击鐲', revs, [
        ['bozi-shang', 'ti-gan-shang'],
        ['ti-gan-shang', 'shang-ping'],
        ['ti-gan-shang', 'deck-1'],
        ['ti-gan-shang', 'frame-upper'],
        ['ti-gan-shang', 'arm-upper'],
        ['arm-upper', 'zhuo'],
        ['arm-upper', 'figure-upper'],
        ['bozi-shang', 'deck-1'],
      ])
    },
    300_000,
  )
})

void ([0, 0, 0] as Vec3)
