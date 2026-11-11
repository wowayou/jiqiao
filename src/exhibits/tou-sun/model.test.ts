// 透榫：用自由度探测验证协同链里「这一步之后锁住了哪个方向」，并如实记录刚体模型的局限。
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { buildParts, probeDof, type BuiltParts } from '../../exhibit/audit'
import { getKernel, type Kernel } from '../../kernel'
import type { Dof } from '../../exhibit/types'
import exhibit from './index'
import { STEP_LOCKS, simulate } from './model'

const ALL: Dof[] = ['+x', '-x', '+y', '-y', '+z', '-z', 'rx', 'ry', 'rz']
/** 平移 2 mm / 转 0.02 rad 后交集体积超过 1 mm³ 视为被挡住；低于 1e-6 视为自由 */
const BLOCKED = 1
const FREE = 1e-6

let k: Kernel
let built: BuiltParts
beforeAll(async () => {
  k = await getKernel()
  built = buildParts(k, exhibit)
})
afterAll(() => built.dispose())

describe('透榫 · 锁定方向', () => {
  test('第 1 步后（t = 0.5）：横料只剩 +X（往外拔）自由', () => {
    const r = probeDof(k, exhibit, 0.5, ['rail'], ALL, undefined, built)
    for (const x of r) {
      if (STEP_LOCKS[0].includes(x.dof)) expect(x.volume, `${x.dof} 应被挡住`).toBeGreaterThan(BLOCKED)
      else expect(x.volume, `${x.dof} 应自由`).toBeLessThan(FREE)
    }
    expect(r.find((x) => x.dof === '+x')!.volume).toBeLessThan(FREE)
  })
  test('第 1 步前（t = 0）：横料还没进卯眼，各方向都自由', () => {
    const r = probeDof(k, exhibit, 0, ['rail'], ALL, undefined, built)
    expect(r.every((x) => x.volume < FREE)).toBe(true)
  })
  test('第 2 步后：楔不能再往里走（被锯缝挡住）', () => {
    const [deeper] = probeDof(k, exhibit, 1, ['wedge'], ['+x'], undefined, built)
    expect(deeper.volume).toBeGreaterThan(BLOCKED)
  })
  test('刚体模型的局限（如实记录）：横料连同楔整体往外拔，几何上不会被挡住', () => {
    // 真实木料中楔撑开榫头才锁住 +X；刚体模型表现不了变形，所以这里是自由的。
    // 这正是协同链第 2 环 locksProvenance 标 reconstruction、第 3 环标 model 的原因。
    const [out] = probeDof(k, exhibit, 1, ['rail', 'wedge'], ['+x'], undefined, built)
    expect(out.volume).toBeLessThan(FREE)
  })
})

describe('透榫 · 模型读数', () => {
  test('装好时：榫头入卯 80 mm、露出 12 mm、楔入 50 mm、锁住 9 个自由度', () => {
    const s = simulate(1)
    expect(s.tenonDepth).toBeCloseTo(92)
    expect(s.protrusion).toBeCloseTo(12)
    expect(s.wedgeDepth).toBeCloseTo(50)
    expect(s.locked).toHaveLength(9)
  })
  test('协同链：前半程点亮第 1 环，后半程第 2 环，完成时第 3 环', () => {
    const act = (t: number) => exhibit.chain.filter((c) => c.active?.(simulate(t))).map((c) => c.id)
    expect(act(0.2)).toEqual(['tenon-in'])
    expect(act(0.7)).toEqual(['wedge-in'])
    expect(act(1)).toEqual(['why'])
  })
})
