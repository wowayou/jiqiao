import { beforeAll, describe, expect, test } from 'vitest'
import { rotY } from '../kinematics/pose'
import { getKernel, scopeDepth, Solid, type Kernel } from './index'
import { toBufferGeometry } from './geometry'

let k: Kernel
beforeAll(async () => {
  k = await getKernel()
})

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

describe('作用域与内存', () => {
  test('作用域外创建几何会报错', () => {
    expect(() => k.box([1, 1, 1])).toThrow(/scope/)
  })
  test('中间结果被释放，返回值保留', () => {
    let tmp: Solid | undefined
    const kept = k.scope(() => {
      tmp = k.box([10, 10, 10])
      return tmp.subtract(k.cylinder({ r: 2, h: 20 }))
    })
    expect(tmp!.deleted).toBe(true)
    expect(kept.deleted).toBe(false)
    expect(() => tmp!.volume()).toThrow(/释放/)
    expect(kept.volume()).toBeGreaterThan(0)
    kept.delete()
    expect(scopeDepth()).toBe(0)
  })
  test('返回数组或对象时其中的实体都保留；抛错时全部释放', () => {
    const { a, list } = k.scope(() => ({ a: k.box([1, 1, 1]), list: [k.sphere(1), k.sphere(2)] }))
    expect(a.deleted || list.some((s) => s.deleted)).toBe(false)
    ;[a, ...list].forEach((s) => s.delete())
    let leaked: Solid | undefined
    expect(() =>
      k.scope(() => {
        leaked = k.box([1, 1, 1])
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(leaked!.deleted).toBe(true)
  })
  test('嵌套作用域：内层返回值归外层管理', () => {
    let inner: Solid | undefined
    k.scope(() => {
      inner = k.scope(() => k.box([1, 1, 1]))
      expect(inner.deleted).toBe(false)
      return 1
    })
    expect(inner!.deleted).toBe(true)
  })
})

describe('基本体、轴向约定与体积', () => {
  test('圆柱默认沿 Y 轴、居中', () =>
    k.scope(() => {
      const c = k.cylinder({ r: 5, h: 20, segments: 128 })
      const b = c.bbox()
      expect(b.min[1]).toBeCloseTo(-10)
      expect(b.max[1]).toBeCloseTo(10)
      expect(rel(c.volume(), Math.PI * 25 * 20)).toBeLessThan(0.005)
    }))
  test('拉伸 axis=y 时截面坐标为 (z, x)', () =>
    k.scope(() => {
      const s = k.extrude([[0, 0], [4, 0], [4, 2], [0, 2]], 10, 'y')
      const b = s.bbox()
      expect(b.max).toEqual([2, 10, 4])
      expect(s.volume()).toBeCloseTo(80)
    }))
  test('旋转成型绕 Y 轴：截面 (半径, 高度)', () =>
    k.scope(() => {
      const s = k.revolve([[1, 0], [3, 0], [3, 4], [1, 4]], 256)
      expect(s.bbox().max[1]).toBeCloseTo(4)
      expect(rel(s.volume(), Math.PI * (9 - 1) * 4)).toBeLessThan(0.005)
      expect(s.genus()).toBe(1)
    }))
  test('rod 连接两点', () =>
    k.scope(() => {
      const r = k.rod([0, 0, 0], [30, 40, 0], 1, 64)
      expect(rel(r.volume(), Math.PI * 50)).toBeLessThan(0.01)
      const b = r.bbox()
      expect(b.max[0]).toBeGreaterThan(29)
      expect(b.max[1]).toBeGreaterThan(39)
    }))
  test('交集体积：重叠半块、相贴为 0、位姿生效', () =>
    k.scope(() => {
      const a = k.box([10, 10, 10])
      const b = k.box([10, 10, 10])
      expect(k.intersectionVolume(a, b, undefined, { p: [5, 0, 0] })).toBeCloseTo(500)
      expect(k.intersectionVolume(a, b, undefined, { p: [10, 0, 0] })).toBeCloseTo(0)
      const slab = k.box([100, 1, 1])
      // 绕 Y 转 90° 后长条沿 Z，与沿 X 的长条只在中心 1×1×1 相交
      expect(k.intersectionVolume(slab, slab, undefined, { p: [0, 0, 0], q: rotY(Math.PI / 2) })).toBeCloseTo(1)
    }))
  test('平面裁切保留法线一侧', () =>
    k.scope(() => {
      const c = k.box([2, 2, 2]).trim([1, 0, 0], 0.5)
      expect(c.volume()).toBeCloseTo(2)
      expect(c.bbox().min[0]).toBeCloseTo(0.5)
    }))
})

describe('转 BufferGeometry', () => {
  test('立方体棱锐利：24 个顶点（每面 4 个），法线为面法线', () => {
    const geo = k.scope(() => toBufferGeometry(k, k.box([2, 2, 2])))
    const n = geo.getAttribute('normal')
    expect(geo.getAttribute('position').count).toBe(24)
    for (let i = 0; i < n.count; i++) {
      const len = Math.hypot(n.getX(i), n.getY(i), n.getZ(i))
      expect(len).toBeCloseTo(1)
      expect([n.getX(i), n.getY(i), n.getZ(i)].filter((x) => Math.abs(Math.abs(x) - 1) < 1e-5)).toHaveLength(1)
    }
  })
  test('圆柱侧面平滑：侧面顶点法线是径向的', () => {
    const geo = k.scope(() => toBufferGeometry(k, k.cylinder({ r: 1, h: 2, segments: 48 })))
    const p = geo.getAttribute('position')
    const n = geo.getAttribute('normal')
    let radial = 0
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(n.getY(i)) < 1e-6) {
        const dot = (p.getX(i) * n.getX(i) + p.getZ(i) * n.getZ(i)) / Math.hypot(p.getX(i), p.getZ(i))
        expect(dot).toBeGreaterThan(0.999)
        radial++
      }
    }
    expect(radial).toBeGreaterThanOrEqual(48 * 2)
  })
})
