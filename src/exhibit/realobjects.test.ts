// 实物对照（realObjects）：结构校验，以及注册表里每个展品都至少配了一件、字段齐全。
import { describe, expect, test } from 'vitest'
import { exhibitLoaders } from './registry'
import type { RealObjectRef } from './types'
import { validateRealObjects } from './validate'

const ok: RealObjectRef = {
  uid: '0123456789abcdef0123456789abcdef',
  title: 'Some model',
  author: 'Someone',
  authorSlug: 'someone',
  license: 'CC BY 4.0',
  what: '一件器物。',
  differs: '与本展品有同有异。',
}

describe('validateRealObjects', () => {
  test('合格的、没写的都通过', () => {
    expect(validateRealObjects([ok])).toEqual([])
    expect(validateRealObjects([ok, { ...ok, uid: 'fedcba9876543210fedcba9876543210', license: 'CC0' }])).toEqual([])
    expect(validateRealObjects(undefined)).toEqual([])
  })
  test('uid 必须是 32 位小写十六进制', () => {
    for (const uid of ['', 'abc', 'ED0BD32C425143E6A3E623A499FB8EA4', '0123456789abcdef0123456789abcdeg', '0123456789abcdef0123456789abcdef0']) {
      expect(validateRealObjects([{ ...ok, uid }]).join(), uid).toContain('uid')
    }
  })
  test('文字字段不能为空（含只有空白）', () => {
    for (const k of ['title', 'author', 'authorSlug', 'what', 'differs'] as const) {
      expect(validateRealObjects([{ ...ok, [k]: '' }]).join(), k).toContain(k)
      expect(validateRealObjects([{ ...ok, [k]: '  ' }]).join(), k).toContain(k)
    }
  })
  test('许可只能是 CC0 或 CC BY 4.0', () => {
    expect(validateRealObjects([{ ...ok, license: 'CC BY-NC 4.0' as never }]).join()).toContain('license')
    expect(validateRealObjects([{ ...ok, license: 'CC BY-SA 4.0' as never }]).join()).toContain('license')
    expect(validateRealObjects([{ ...ok, license: 'CC0' }])).toEqual([])
  })
  test('同一展品 uid 不得重复', () => {
    expect(validateRealObjects([ok, { ...ok, title: 'other' }]).join()).toContain('重复')
  })
})

describe('注册表里的展品', () => {
  for (const id of Object.keys(exhibitLoaders)) {
    test(`${id}：至少一件实物对照，字段齐全，differs 如实写出不同`, async () => {
      const def = await exhibitLoaders[id]()
      expect(def.realObjects?.length ?? 0).toBeGreaterThanOrEqual(1)
      expect(validateRealObjects(def.realObjects)).toEqual([])
      for (const o of def.realObjects!) {
        expect(o.differs.length).toBeGreaterThan(10)
        expect(o.what.length).toBeGreaterThan(5)
      }
    })
  }
})
