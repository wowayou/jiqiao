// 把展品的零件实体一次性转成 three 几何（含墨线）。只在进入展品页时执行一次。
import { BufferGeometry, EdgesGeometry } from 'three'
import { getKernel } from '../kernel'
import { toBufferGeometry } from '../kernel/geometry'
import type { AnyExhibit } from '../exhibit/types'

export interface PartGeometry {
  surface: BufferGeometry
  edges: BufferGeometry
}

/**
 * 墨线：二面角大于此值的棱才描边（圆柱等曲面的小平面之间不描）。
 * 数棱实测（六个展品逐零件）：阈值 28°→35° 棱数不变，35°→45° 时磨盘、石磨、推杆等圆柱件的棱数明显减少——
 * 它们的分面夹角约 36–40°，原阈值会在曲面上每个分面描一条线，贴近看就是一片条纹。取 40°，
 * 齿轮、方料等多数零件的棱数在 28°→45° 间几乎不变（榫卯件未逐一统计）。
 */
export const EDGE_ANGLE = 40

export async function buildGeometries(
  def: AnyExhibit,
  onProgress?: (done: number, total: number) => void,
  signal?: { cancelled: boolean },
): Promise<Map<string, PartGeometry>> {
  const k = await getKernel()
  const out = new Map<string, PartGeometry>()
  let i = 0
  for (const part of def.parts) {
    if (signal?.cancelled) break
    const surface = k.scope(() => toBufferGeometry(k, part.solid(k)))
    const edges = new EdgesGeometry(surface, EDGE_ANGLE)
    out.set(part.id, { surface, edges })
    onProgress?.(++i, def.parts.length)
    // 让出主线程，避免长时间卡住界面
    await new Promise((r) => setTimeout(r, 0))
  }
  if (signal?.cancelled) {
    disposeGeometries(out)
    return new Map()
  }
  return out
}

export function disposeGeometries(m: Map<string, PartGeometry>) {
  for (const g of m.values()) {
    g.surface.dispose()
    g.edges.dispose()
  }
}
