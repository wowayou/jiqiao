// 场景求值（纯函数，不依赖 three）：由 (展品, 状态, 爆炸量) 求每个零件实例的世界位姿。
// 展台与审计共用这一份逻辑，保证「审计的就是看到的」。
import { explodeOffsets, type AssemblyItem } from '../kinematics/assembly'
import { quatRotate, type Pose } from '../kinematics/pose'
import { v3, type Vec3 } from '../kinematics/vec'
import type { AnyExhibit, PartDef } from './types'

export interface PartInstance {
  /** 实例键：无副本时为零件 id，有副本时为 'id:序号' */
  key: string
  part: PartDef<any>
  copy: number
}

export interface InstanceState {
  pose: Pose
  visible: boolean
}

export function instanceKey(id: string, copy: number, copies = 1): string {
  return copies > 1 ? `${id}:${copy}` : id
}

export function instancesOf(def: AnyExhibit): PartInstance[] {
  const out: PartInstance[] = []
  for (const part of def.parts) {
    const n = part.copies ?? 1
    for (let i = 0; i < n; i++) out.push({ key: instanceKey(part.id, i, n), part, copy: i })
  }
  return out
}

export function explodeItems(def: AnyExhibit): AssemblyItem[] {
  return def.parts.map((p) => ({ id: p.id, dir: p.explode.dir, distance: p.explode.distance, order: p.explode.order }))
}

/** 零件在状态 s 下、未爆炸时的位姿。 */
export function basePose(part: PartDef<any>, s: unknown, copy: number): Pose {
  return part.pose ? part.pose(s, copy) : part.rest
}

/** 求全部实例的世界位姿与可见性。explode ∈ [0,1]。 */
export function evaluateScene(def: AnyExhibit, s: unknown, explode = 0): Map<string, InstanceState> {
  const offsets = explode > 0 ? explodeOffsets(explodeItems(def), explode) : null
  const byId = new Map(def.parts.map((p) => [p.id, p]))
  const resolved = new Map<string, Vec3>()

  const ownOffset = (part: PartDef<any>, copy: number): Vec3 => {
    const o = offsets![part.id]
    if (part.explode.frame === 'local') {
      const q = basePose(part, s, copy).q
      return q ? quatRotate(q, o) : o
    }
    return o
  }
  const offsetOf = (id: string, copy: number, seen: Set<string>): Vec3 => {
    const cacheKey = `${id}:${copy}`
    const hit = resolved.get(cacheKey)
    if (hit) return hit
    if (seen.has(id)) throw new Error(`explode.with 循环引用：${[...seen, id].join(' → ')}`)
    seen.add(id)
    const part = byId.get(id)
    if (!part) throw new Error(`explode.with 指向不存在的零件 ${id}`)
    let o = ownOffset(part, copy)
    if (part.explode.with) o = v3.add(o, offsetOf(part.explode.with, 0, seen))
    resolved.set(cacheKey, o)
    return o
  }

  const out = new Map<string, InstanceState>()
  for (const inst of instancesOf(def)) {
    const { part, copy } = inst
    let pose = basePose(part, s, copy)
    let visible = part.visible ? part.visible(s, copy) : true
    if (offsets) {
      if (part.explode.hide && explode > 0.02) visible = false
      const o = offsetOf(part.id, copy, new Set())
      pose = { p: v3.add(pose.p, o), q: pose.q }
    }
    out.set(inst.key, { pose, visible })
  }
  return out
}

/** 'partId#featureId' → [partId, featureId?] */
export function splitRef(ref: string): [string, string | undefined] {
  const i = ref.indexOf('#')
  return i < 0 ? [ref, undefined] : [ref.slice(0, i), ref.slice(i + 1)]
}
