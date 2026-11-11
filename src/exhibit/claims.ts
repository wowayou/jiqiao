// 出处审计（只在 Node 测试中使用，因为要读 docs/sources/ 原文）。
// 规则：provenance = 'source' 的陈述必须 cite 一个带 file + quote 的来源，且 quote 逐字出现在该文件里。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AnyExhibit } from './types'
import { allClaims } from './validate'

export function auditClaims(def: AnyExhibit, repoRoot = process.cwd()): string[] {
  const errs: string[] = []
  const cache = new Map<string, string>()
  const read = (file: string) => {
    if (!cache.has(file)) cache.set(file, readFileSync(resolve(repoRoot, file), 'utf8'))
    return cache.get(file)!
  }
  for (const [key, src] of Object.entries(def.sources)) {
    if (src.quote && !src.file) errs.push(`sources.${key} 有 quote 却没有 file`)
    if (src.file) {
      if (!src.file.startsWith('docs/sources/')) errs.push(`sources.${key}.file 须位于 docs/sources/`)
      let text: string
      try {
        text = read(src.file)
      } catch {
        errs.push(`sources.${key}.file 不存在：${src.file}`)
        continue
      }
      if (src.quote && !text.includes(src.quote)) errs.push(`sources.${key}.quote 在 ${src.file} 中找不到原文：「${src.quote}」`)
    }
  }
  for (const { where, claim } of allClaims(def)) {
    if (claim.provenance !== 'source') continue
    const src = claim.cite ? def.sources[claim.cite] : undefined
    if (!src) errs.push(`${where} 标为史料，但 cite 无效`)
    else if (!src.file || !src.quote) errs.push(`${where} 标为史料，但来源 ${claim.cite} 缺少 file 或 quote`)
  }
  return errs
}
