// 对注册表里的每个展品自动运行：目录结构、元信息一致、结构校验、出处审计，
// 并检查每个展品都有调用 describeExhibitAudits 的测试文件（几何审计在那里跑）。
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { auditClaims } from './claims'
import { exhibitLoaders, exhibitMetas } from './registry'
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
