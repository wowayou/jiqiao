// 展品注册表：用 import.meta.glob 自动发现 src/exhibits/<id>/。新增展品不需要改这里。
//   - meta.ts 立即加载（首页列表只需要元信息，很小）
//   - index.ts 懒加载（进入展品页才下载该展品的模型与几何代码）
import type { AnyExhibit, ExhibitMeta } from './types'

const metaModules = import.meta.glob<{ meta: ExhibitMeta }>('../exhibits/*/meta.ts', { eager: true })
const loaders = import.meta.glob<{ default: AnyExhibit }>('../exhibits/*/index.ts')

const dirOf = (path: string) => path.split('/').at(-2)!

const CATEGORY_ORDER: ExhibitMeta['category'][] = ['mechanism', 'clock', 'joinery']

export const exhibitMetas: ExhibitMeta[] = Object.entries(metaModules)
  .filter(([path]) => loaders[path.replace(/meta\.ts$/, 'index.ts')])
  .map(([, m]) => m.meta)
  .sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      (a.order ?? 100) - (b.order ?? 100) ||
      a.id.localeCompare(b.id),
  )

/** 目录名 → 加载函数 */
export const exhibitLoaders: Record<string, () => Promise<AnyExhibit>> = Object.fromEntries(
  Object.entries(loaders).map(([path, load]) => [dirOf(path), async () => (await load()).default]),
)

export function getMeta(id: string): ExhibitMeta | undefined {
  return exhibitMetas.find((m) => m.id === id)
}

export async function loadExhibit(id: string): Promise<AnyExhibit> {
  const load = exhibitLoaders[id]
  if (!load) throw new Error(`没有这个展品：${id}`)
  return load()
}
