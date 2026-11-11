// 装配序列：给定各构件的装配方向、距离、顺序和总进度 p ∈ [0,1]，求每个构件的偏移。
//
// 约定：
//   - dir 是「拆出来」的方向（从装配位置指向外面），distance 是拆开时离装配位置的距离。
//   - order 小的先装。相同 order 的构件同时运动。
//   - p = 0 全部拆开（各自在 dir·distance 处），p = 1 全部装好（偏移为 0）。
//   - 每个 order 占进度的一个等长区段；区段内用平滑缓动。
//   - 爆炸图就是倒放的装配：explode e 等价于装配进度 1 − e，所以后装的先拆出。
import { clamp, smoothstep, type Vec3 } from './vec'

export interface AssemblyItem {
  id: string
  dir: Vec3
  distance: number
  order: number
}

export interface AssemblyStepInfo {
  /** 当前所处区段（0 起），全部装好时为最后一段 */
  index: number
  /** 当前区段对应的 order 值 */
  order: number
  /** 区段内进度 [0,1] */
  local: number
  /** 区段总数 */
  count: number
}

/** 所有 order 值去重升序。 */
export function assemblyOrders(items: readonly AssemblyItem[]): number[] {
  return [...new Set(items.map((i) => i.order))].sort((a, b) => a - b)
}

/** 第 index 段在总进度中的范围 [start, end]。 */
export function stepRange(index: number, count: number): [number, number] {
  return [index / count, (index + 1) / count]
}

export function assemblyStep(items: readonly AssemblyItem[], p: number): AssemblyStepInfo {
  const orders = assemblyOrders(items)
  const n = orders.length
  if (n === 0) return { index: 0, order: 0, local: 1, count: 0 }
  const x = clamp(p, 0, 1) * n
  const index = Math.min(n - 1, Math.floor(x))
  return { index, order: orders[index], local: clamp(x - index, 0, 1), count: n }
}

/** 某个构件在进度 p 时的「剩余未装入」比例：1 = 完全拆开，0 = 已到位。 */
export function remaining(items: readonly AssemblyItem[], order: number, p: number, ease: (x: number) => number = smoothstep): number {
  const orders = assemblyOrders(items)
  const n = orders.length
  const k = orders.indexOf(order)
  if (k < 0) throw new Error(`未知装配顺序 ${order}`)
  const local = clamp(clamp(p, 0, 1) * n - k, 0, 1)
  return 1 - ease(local)
}

/** 每个构件在进度 p 时的偏移向量。 */
export function assemblyOffsets(
  items: readonly AssemblyItem[],
  p: number,
  ease: (x: number) => number = smoothstep,
): Record<string, Vec3> {
  const out: Record<string, Vec3> = {}
  for (const it of items) {
    const r = remaining(items, it.order, p, ease) * it.distance
    out[it.id] = [it.dir[0] * r, it.dir[1] * r, it.dir[2] * r]
  }
  return out
}

/** 爆炸偏移：e = 0 不爆炸，e = 1 完全拆开；等价于装配进度 1 − e。 */
export function explodeOffsets(
  items: readonly AssemblyItem[],
  e: number,
  ease: (x: number) => number = smoothstep,
): Record<string, Vec3> {
  return assemblyOffsets(items, 1 - clamp(e, 0, 1), ease)
}

/**
 * 审计用采样点：每个区段至少 perStep 个点（含区段两端），全程升序去重。
 * PLAN 第 7 节要求榫卯沿装配路径每步不少于 20 个点。
 */
export function assemblySamples(items: readonly AssemblyItem[], perStep = 20): number[] {
  const n = assemblyOrders(items).length || 1
  const set = new Set<number>()
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < perStep; i++) {
      set.add(Number(((k + i / (perStep - 1)) / n).toFixed(12)))
    }
  }
  return [...set].sort((a, b) => a - b)
}
