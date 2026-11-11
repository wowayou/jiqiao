// 把展品的零件实体一次性转成 three 几何（含墨线）。只在进入展品页时执行一次。
import { BufferGeometry, EdgesGeometry } from 'three'
import { getKernel } from '../kernel'
import { toBufferGeometry } from '../kernel/geometry'
import type { AnyExhibit } from '../exhibit/types'

export interface PartGeometry {
  surface: BufferGeometry
  edges: BufferGeometry
}

/** 墨线：二面角大于此值的棱才描边（圆柱的小平面之间不描） */
const EDGE_ANGLE = 28

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
