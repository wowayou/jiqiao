// 「此刻该看哪里」：选中零件 > 点住的协同链环 > 实时点亮的环。强调色只给这里。
import { splitRef } from '../exhibit/scene'
import type { AnyExhibit } from '../exhibit/types'

export interface Focus {
  /** 着强调色的零件 id */
  parts: Set<string>
  /** 要显示标注的特征 'partId#featureId' */
  features: Set<string>
  source: 'selected' | 'pinned' | 'active' | 'none'
}

export function activeStepIds(def: AnyExhibit, s: unknown): string[] {
  return def.chain.filter((st) => st.active?.(s)).map((st) => st.id)
}

export function computeFocus(def: AnyExhibit, selected: string | null, pinnedStep: string | null, active: string[]): Focus {
  const parts = new Set<string>()
  const features = new Set<string>()
  // 协同链引用特征（'part#feature'）时只显示标注、不给整件着色，免得强调色铺满大零件
  const add = (ref: string) => {
    const [pid, fid] = splitRef(ref)
    if (fid) features.add(ref)
    else parts.add(pid)
  }
  if (selected) {
    const [pid, fid] = splitRef(selected)
    parts.add(pid)
    if (fid) features.add(selected)
    return { parts, features, source: 'selected' }
  }
  const step = pinnedStep ? def.chain.find((c) => c.id === pinnedStep) : undefined
  if (step) {
    step.parts.forEach(add)
    return { parts, features, source: 'pinned' }
  }
  for (const id of active) def.chain.find((c) => c.id === id)?.parts.forEach(add)
  return { parts, features, source: parts.size ? 'active' : 'none' }
}
