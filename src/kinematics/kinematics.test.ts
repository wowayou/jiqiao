import { describe, expect, test } from 'vitest'
import {
  assemblyOffsets,
  assemblySamples,
  assemblyStep,
  centerDistance,
  circleIntersections,
  crankSlider,
  dyad,
  explodeOffsets,
  fourBar,
  grashof,
  meshAngle,
  meshPlanar,
  placeThirdGear,
  poseApply,
  poseCompose,
  poseInverse,
  poseToMat4,
  quatAxisAngle,
  quatRotate,
  rotY,
  speedRatio,
  TAU,
  toothPhase,
  trainRatio,
  v2,
  v3,
  type AssemblyItem,
  type Vec2,
  type Vec3,
} from './index'

const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps)
const closeV = (a: readonly number[], b: readonly number[], eps = 1e-9) => a.forEach((x, i) => close(x, b[i], eps))

describe('位姿', () => {
  test('绕 Y 转 90° 把 +X 转到 −Z（右手定则）', () => {
    closeV(quatRotate(rotY(Math.PI / 2), [1, 0, 0]), [0, 0, -1])
  })
  test('复合与求逆互为逆运算', () => {
    const a = { p: [1, 2, 3] as Vec3, q: quatAxisAngle([1, 1, 0], 0.7) }
    const b = { p: [-4, 0.5, 2] as Vec3, q: quatAxisAngle([0, 0, 1], -1.2) }
    const v: Vec3 = [0.3, -0.2, 5]
    closeV(poseApply(poseCompose(a, b), v), poseApply(a, poseApply(b, v)))
    closeV(poseApply(poseInverse(a), poseApply(a, v)), v)
  })
  test('poseToMat4 与 poseApply 一致（列主序）', () => {
    const ps = { p: [10, -3, 7] as Vec3, q: quatAxisAngle([0.2, 1, -0.4], 2.1) }
    const m = poseToMat4(ps)
    const v: Vec3 = [1.5, 2, -3]
    const r: Vec3 = [
      m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
      m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
      m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
    ]
    closeV(r, poseApply(ps, v))
  })
})

describe('齿轮系', () => {
  test('速比与轮系', () => {
    expect(speedRatio(18, 54)).toBeCloseTo(1 / 3)
    expect(trainRatio([[18, 54], [10, 100]])).toBeCloseTo(1 / 30)
  })
  test('中心距', () => {
    expect(centerDistance(2, 20, 40)).toBe(60)
    expect(centerDistance(2, 20, 60, 'internal')).toBe(40)
  })
  test('两圆求交定位第三轮', () => {
    const cA: Vec2 = [0, 0]
    const cB: Vec2 = [100, 0]
    const c = placeThirdGear(cA, 60, cB, 80, 1)
    close(v2.dist(c, cA), 60)
    close(v2.dist(c, cB), 80)
    expect(c[1]).toBeGreaterThan(0)
    expect(placeThirdGear(cA, 60, cB, 80, -1)[1]).toBeLessThan(0)
    expect(() => placeThirdGear(cA, 10, cB, 20)).toThrow()
  })
  test('外啮合：任意转角下主动轮齿对从动轮槽，且转速比为 zA/zB、反向', () => {
    const A = { z: 12, center: [0, 0] as Vec2 }
    const B = { z: 30, center: [70, 40] as Vec2 }
    const phi = v2.angle(v2.sub(B.center, A.center))
    for (let i = 0; i < 100; i++) {
      const angleA = (i / 100) * TAU * 3 - 1
      const angleB = meshPlanar({ ...A, angle: angleA }, B)
      // 接触点上两轮反向滚动：A 的齿相位为 x 时 B 的齿相位为 0.5 − x，二者之和 ≡ 0.5（一齿对一槽）
      const pa = toothPhase(A.z, angleA, phi)
      const pb = toothPhase(B.z, angleB, phi + Math.PI)
      close((pa + pb) % 1, 0.5, 1e-9)
      const d = meshPlanar({ ...A, angle: angleA + 1e-6 }, B) - angleB
      close(d / 1e-6, -A.z / B.z, 1e-6)
    }
    // 主动轮齿正对接触方向时，从动轮正对齿槽中心
    const b0 = meshPlanar({ ...A, angle: phi }, B)
    close(toothPhase(B.z, b0, phi + Math.PI), 0.5)
  })
  test('内啮合：同向转动、齿对槽', () => {
    const pinion = { z: 10, center: [15, 5] as Vec2 }
    const ring = { z: 40, center: [0, 0] as Vec2 }
    const phi = v2.angle(v2.sub(pinion.center, ring.center))
    const a0 = phi + 0.3
    const b0 = meshPlanar({ ...pinion, angle: a0 }, ring, 'internal')
    const b1 = meshPlanar({ ...pinion, angle: a0 + 1e-6 }, ring, 'internal')
    close((b1 - b0) / 1e-6, 10 / 40, 1e-6)
    const bAt = meshPlanar({ ...pinion, angle: phi }, ring, 'internal')
    close(toothPhase(ring.z, bAt, phi), 0.5)
  })
  test('meshAngle 适用于不同平面（如冠齿轮）的一般形式', () => {
    const b = meshAngle({ zA: 20, angleA: 0.5, contactA: 0.5, zB: 40, contactB: 1.0 })
    close(toothPhase(40, b, 1.0), 0.5)
  })
})

describe('连杆', () => {
  test('两圆交点：两解、相切、无解', () => {
    expect(circleIntersections([0, 0], 5, [8, 0], 5)).toHaveLength(2)
    expect(circleIntersections([0, 0], 5, [10, 0], 5)).toHaveLength(1)
    expect(circleIntersections([0, 0], 1, [10, 0], 1)).toHaveLength(0)
    expect(circleIntersections([0, 0], 1, [0.5, 0], 5)).toHaveLength(0)
  })
  test('二杆组两分支分居两侧，杆长准确', () => {
    const A: Vec2 = [0, 0]
    const B: Vec2 = [6, 1]
    for (const br of [1, -1] as const) {
      const P = dyad(A, 4, B, 5, br)
      close(v2.dist(P, A), 4)
      close(v2.dist(P, B), 5)
      expect(Math.sign(v2.cross(v2.sub(B, A), v2.sub(P, A)))).toBe(br)
    }
    expect(() => dyad(A, 1, [10, 0], 1)).toThrow()
  })
  test('曲柄滑块：连杆长全周期不变、导数与数值差分一致、死点力臂为 0', () => {
    const m = { r: 300, l: 1500, e: 40 }
    let maxErr = 0
    for (let i = 0; i < 360; i++) {
      const th = (i / 360) * TAU
      const s = crankSlider(m, th)
      maxErr = Math.max(maxErr, Math.abs(v2.dist(s.pin, s.slider) - m.l))
      close(s.slider[1], m.e)
      const h = 1e-6
      const num = (crankSlider(m, th + h).x - crankSlider(m, th - h).x) / (2 * h)
      close(s.dxdTheta, num, 1e-4)
    }
    expect(maxErr).toBeLessThan(1e-6)
    // 无偏距时，θ=0 与 θ=π 连杆与曲柄共线 → 力臂 0
    close(crankSlider({ r: 300, l: 1500 }, 0).arm, 0)
    close(crankSlider({ r: 300, l: 1500 }, Math.PI).arm, 0, 1e-6)
    expect(crankSlider({ r: 300, l: 1500 }, Math.PI / 2).arm).toBeGreaterThan(290)
  })
  test('四杆机构：曲柄摇杆整周可解、各杆长不变', () => {
    const m = { ground: 100, crank: 30, coupler: 90, rocker: 70 }
    expect(grashof(m)).toBe('crank-rocker')
    let maxErr = 0
    for (let i = 0; i < 720; i++) {
      const s = fourBar(m, (i / 720) * TAU)
      maxErr = Math.max(
        maxErr,
        Math.abs(v2.len(s.A) - m.crank),
        Math.abs(v2.dist(s.A, s.B) - m.coupler),
        Math.abs(v2.dist(s.B, [m.ground, 0]) - m.rocker),
      )
    }
    expect(maxErr).toBeLessThan(1e-6)
    expect(grashof({ ground: 30, crank: 100, coupler: 90, rocker: 70 })).toBe('double-crank')
    expect(grashof({ ground: 100, crank: 40, coupler: 50, rocker: 120 })).toBe('non-grashof')
  })
})

describe('装配序列', () => {
  const items: AssemblyItem[] = [
    { id: 'post', dir: [0, 0, 0], distance: 0, order: 0 },
    { id: 'rail', dir: [1, 0, 0], distance: 100, order: 0 },
    { id: 'wedge', dir: [-1, 0, 0], distance: 50, order: 1 },
  ]
  test('两端：p=0 全拆开，p=1 全到位', () => {
    const o0 = assemblyOffsets(items, 0)
    closeV(o0.rail, [100, 0, 0])
    closeV(o0.wedge, [-50, 0, 0])
    const o1 = assemblyOffsets(items, 1)
    closeV(o1.rail, [0, 0, 0])
    closeV(o1.wedge, [0, 0, 0])
  })
  test('按 order 错开：第一段只动 rail，第二段只动 wedge', () => {
    const mid1 = assemblyOffsets(items, 0.25)
    expect(mid1.rail[0]).toBeGreaterThan(0)
    expect(mid1.rail[0]).toBeLessThan(100)
    closeV(mid1.wedge, [-50, 0, 0])
    const mid2 = assemblyOffsets(items, 0.75)
    closeV(mid2.rail, [0, 0, 0])
    expect(mid2.wedge[0]).toBeGreaterThan(-50)
    expect(assemblyStep(items, 0.75)).toMatchObject({ index: 1, order: 1, count: 2 })
  })
  test('偏移单调：随进度只会靠近装配位置', () => {
    let prev = Infinity
    for (let i = 0; i <= 100; i++) {
      const d = v3.len(assemblyOffsets(items, i / 100).rail)
      expect(d).toBeLessThanOrEqual(prev + 1e-12)
      prev = d
    }
  })
  test('爆炸 = 倒放装配：后装的先拆出', () => {
    const e = explodeOffsets(items, 0.25)
    closeV(e.rail, [0, 0, 0])
    expect(e.wedge[0]).toBeLessThan(0)
  })
  test('审计采样：每段至少 20 点', () => {
    const s = assemblySamples(items, 20)
    expect(s.filter((x) => x <= 0.5).length).toBeGreaterThanOrEqual(20)
    expect(s.filter((x) => x >= 0.5).length).toBeGreaterThanOrEqual(20)
    expect(s[0]).toBe(0)
    expect(s[s.length - 1]).toBe(1)
  })
})
