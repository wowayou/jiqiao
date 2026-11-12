// 首页缩略图（scripts/thumbnails.mjs 产出，提交在 public/thumbs/）：每个展品深浅各一张，单张 ≤ 60 KB，合计 ≤ 400 KB。
import { existsSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const exhibits = resolve(process.cwd(), 'src/exhibits')
const ids = readdirSync(exhibits, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(resolve(exhibits, d.name, 'meta.ts')) && existsSync(resolve(exhibits, d.name, 'index.ts')))
  .map((d) => d.name)
const dir = resolve(process.cwd(), 'public/thumbs')

describe('首页缩略图', () => {
  test('每个展品深浅主题各有一张', () => {
    for (const id of ids) for (const theme of ['light', 'dark']) expect(existsSync(resolve(dir, `${id}-${theme}.jpg`)), `${id}-${theme}.jpg`).toBe(true)
  })
  test('单张不超过 60 KB，合计不超过 400 KB', () => {
    const files = readdirSync(dir)
    let total = 0
    for (const f of files) {
      const size = statSync(resolve(dir, f)).size
      expect(size, f).toBeLessThanOrEqual(60 * 1024)
      total += size
    }
    expect(total).toBeLessThanOrEqual(400 * 1024)
  })
})
