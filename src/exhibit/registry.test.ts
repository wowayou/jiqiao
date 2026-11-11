// 对注册表里的每个展品自动运行：目录结构、元信息一致、结构校验、出处审计，
// 并检查每个展品都有调用 describeExhibitAudits 的测试文件（几何审计在那里跑）。
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { auditClaims } from './claims'
import { exhibitLoaders, exhibitMetas, relatedMetas } from './registry'
import type { ExhibitMeta } from './types'
import { validateExhibit } from './validate'

const root = resolve(process.cwd(), 'src/exhibits')
const dirs = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

test('至少有一个展品', () => {
  expect(dirs.length).toBeGreaterThan(0)
})

describe.each(dirs)('展品目录 %s', (dir) => {
  test('有 meta.ts 与 index.ts，且被注册表发现', () => {
    expect(existsSync(resolve(root, dir, 'meta.ts'))).toBe(true)
    expect(existsSync(resolve(root, dir, 'index.ts'))).toBe(true)
    expect(exhibitMetas.map((m) => m.id)).toContain(dir)
    expect(exhibitLoaders[dir]).toBeTypeOf('function')
  })

  test('index 的 meta 与 meta.ts 是同一个对象；结构校验与出处审计通过', async () => {
    const def = await exhibitLoaders[dir]()
    expect(def.meta).toBe(exhibitMetas.find((m) => m.id === dir))
    expect(validateExhibit(def, dir)).toEqual([])
    expect(auditClaims(def)).toEqual([])
  })

  test('有调用 describeExhibitAudits 的测试文件', () => {
    const tests = readdirSync(resolve(root, dir)).filter((f) => f.endsWith('.test.ts'))
    const calls = tests.some((f) => readFileSync(resolve(root, dir, f), 'utf8').includes('describeExhibitAudits('))
    expect(calls).toBe(true)
  })
})

describe('相关展品链接', () => {
  const mk = (id: string, related?: string[]) => ({ id, title: id, subtitle: '', category: 'mechanism', era: '', summary: '', related }) as ExhibitMeta
  test('只返回已存在的展品；指向尚未制作的展品时不产生死链，也不报错', () => {
    const a = mk('a', ['b', 'not-made-yet'])
    expect(relatedMetas(a, [a, mk('b')]).map((m) => m.id)).toEqual(['b'])
    expect(relatedMetas(mk('c'), [])).toEqual([])
    expect(relatedMetas(mk('d', ['d']), [mk('d', ['d'])])).toEqual([])
  })
  test('真实注册表里每个 related 要么存在、要么被略过', () => {
    for (const m of exhibitMetas) for (const r of relatedMetas(m)) expect(exhibitMetas.map((x) => x.id)).toContain(r.id)
  })
})
