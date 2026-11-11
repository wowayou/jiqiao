// 几何审计（PLAN 第 7 节第 2、3 条）：实体审计、干涉审计、自由度探测、铰点漂移。
// 在 Node（Vitest）与浏览器都能跑；展品作者一般通过 ./testing 的 describeExhibitAudits 调用。
import type { Kernel, Solid } from '../kernel'
import { assemblySamples } from '../kinematics/assembly'
import { poseApply, poseCompose, quatAxisAngle, type Pose } from '../kinematics/pose'
import { v3, type Vec3 } from '../kinematics/vec'
import { evaluateScene, explodeItems, instancesOf } from './scene'
import type { AnyExhibit, Dof } from './types'

/** PLAN 第 7 节的阈值：交集体积 / 较小者体积。不得为了通过而放宽。 */
export const THRESHOLD = { joinery: 0.001, mechanism: 0.005 } as const
/** PLAN 第 7 节的采样下限 */
export const MIN_SAMPLES = { assemblyPerStep: 20, phasesPerCycle: 60 } as const

export interface SolidReport {
  id: string
  ok: boolean
  volume: number
  genus: number
  triangles: number
  status: string
  error?: string
}

/** 每个零件单独建模并检查：无错误状态、非空、体积 > 0。manifold 的 NoError 即保证封闭（水密）。 */
export function auditSolids(k: Kernel, def: AnyExhibit): SolidReport[] {
  return def.parts.map((p) => {
    try {
      return k.scope(() => {
        const s = p.solid(k)
        const volume = s.volume()
        const status = s.status()
        const ok = status === 'NoError' && !s.isEmpty() && volume > 0
        return { id: p.id, ok, volume, genus: s.genus(), triangles: s.numTri(), status }
      })
    } catch (err) {
      return { id: p.id, ok: false, volume: 0, genus: 0, triangles: 0, status: 'Error', error: (err as Error).message }
    }
  })
}

export interface BuiltParts {
  solids: Record<string, Solid>
  volumes: Record<string, number>
  dispose(): void
}

/** 一次性建出全部零件实体（审计用）。用完调用 dispose()。 */
export function buildParts(k: Kernel, def: AnyExhibit): BuiltParts {
  const solids = k.scope(() => {
    const o: Record<string, Solid> = {}
    for (const p of def.parts) o[p.id] = p.solid(k)
    return o
  })
  const volumes: Record<string, number> = {}
  for (const [id, s] of Object.entries(solids)) volumes[id] = s.volume()
  return { solids, volumes, dispose: () => Object.values(solids).forEach((s) => s.delete()) }
}

interface Aabb {
  min: Vec3
  max: Vec3
}

function worldAabb(local: Aabb, pose: Pose): Aabb {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < 8; i++) {
    const c: Vec3 = [i & 1 ? local.max[0] : local.min[0], i & 2 ? local.max[1] : local.min[1], i & 4 ? local.max[2] : local.min[2]]
    const w = poseApply(pose, c)
    for (let j = 0; j < 3; j++) {
      min[j] = Math.min(min[j], w[j])
      max[j] = Math.max(max[j], w[j])
    }
  }
  return { min, max }
}

const overlaps = (a: Aabb, b: Aabb) =>
  a.min[0] < b.max[0] && b.min[0] < a.max[0] && a.min[1] < b.max[1] && b.min[1] < a.max[1] && a.min[2] < b.max[2] && b.min[2] < a.max[2]

export interface InterferenceHit {
  a: string
  b: string
  t: number
  volume: number
  ratio: number
}

export interface InterferenceReport {
  threshold: number
  samples: number
  /** 实际做了布尔求交的次数（包围盒不重叠的直接跳过） */
  booleanChecks: number
  pairChecks: number
  maxRatio: number
  worst?: InterferenceHit
  /** 超过阈值的全部记录 */
  failures: InterferenceHit[]
}

export interface InterferenceOpts {
  times: number[]
  /** 零件 id 对；副本会展开成所有实例对 */
  pairs: [string, string][]
  threshold: number
  controls?: unknown
  explode?: number
}

export function auditInterference(k: Kernel, def: AnyExhibit, opts: InterferenceOpts, built?: BuiltParts): InterferenceReport {
  const own = built ?? buildParts(k, def)
  const insts = instancesOf(def)
  const keysOf = (id: string) => insts.filter((i) => i.part.id === id).map((i) => i.key)
  const partOf = new Map(insts.map((i) => [i.key, i.part.id]))
  const localBox = new Map(Object.entries(own.solids).map(([id, s]) => [id, s.bbox()]))
  const keyPairs: [string, string][] = []
  for (const [a, b] of opts.pairs) for (const ka of keysOf(a)) for (const kb of keysOf(b)) if (ka !== kb) keyPairs.push([ka, kb])

  const report: InterferenceReport = {
    threshold: opts.threshold,
    samples: opts.times.length,
    booleanChecks: 0,
    pairChecks: 0,
    maxRatio: 0,
    failures: [],
  }
  try {
    for (const t of opts.times) {
      const s = def.simulate(t, opts.controls ?? def.defaults)
      const scene = evaluateScene(def, s, opts.explode ?? 0)
      for (const [ka, kb] of keyPairs) {
        const A = scene.get(ka)!
        const B = scene.get(kb)!
        if (!A.visible || !B.visible) continue
        report.pairChecks++
        const ia = partOf.get(ka)!
        const ib = partOf.get(kb)!
        if (!overlaps(worldAabb(localBox.get(ia)!, A.pose), worldAabb(localBox.get(ib)!, B.pose))) continue
        report.booleanChecks++
        const volume = k.intersectionVolume(own.solids[ia], own.solids[ib], A.pose, B.pose)
        const ratio = volume / Math.min(own.volumes[ia], own.volumes[ib])
        const hit = { a: ka, b: kb, t, volume, ratio }
        if (ratio > report.maxRatio) {
          report.maxRatio = ratio
          report.worst = hit
        }
        if (ratio >= opts.threshold) report.failures.push(hit)
      }
    }
  } finally {
    if (!built) own.dispose()
  }
  return report
}

function allPairs(ids: string[]): [string, string][] {
  const out: [string, string][] = []
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push([ids[i], ids[j]])
  return out
}

/** 榫卯：装配完成态 + 沿装配路径（每步 ≥ perStep 点）两两不穿模（< 0.1%）。 */
export function auditAssembly(k: Kernel, def: AnyExhibit, perStep: number = MIN_SAMPLES.assemblyPerStep, built?: BuiltParts) {
  if (def.timeline.kind !== 'assembly') throw new Error('auditAssembly 只适用于 assembly 时间轴')
  const moving = explodeItems(def).filter((i) => i.distance > 0)
  const times = assemblySamples(moving, perStep)
  const ignore = new Set(def.audit?.ignore ?? [])
  const ids = def.parts.map((p) => p.id).filter((id) => !ignore.has(id))
  return auditInterference(k, def, { times, pairs: allPairs(ids), threshold: THRESHOLD.joinery }, built)
}

/** 机械：每周期 ≥ 60 个相位，audit.contacts 中的零件对交集 < 0.5%。 */
export function auditMotion(k: Kernel, def: AnyExhibit, phases?: number, built?: BuiltParts) {
  if (def.timeline.kind !== 'cyclic') throw new Error('auditMotion 只适用于 cyclic 时间轴')
  const n = Math.max(phases ?? def.audit?.phases ?? MIN_SAMPLES.phasesPerCycle, MIN_SAMPLES.phasesPerCycle)
  const period = def.timeline.period
  const times = Array.from({ length: n }, (_, i) => (period * i) / n)
  const pairs = def.audit?.contacts ?? []
  if (pairs.length === 0) throw new Error(`${def.meta.id}：机械展品须在 audit.contacts 中列出接触零件对`)
  return auditInterference(k, def, { times, pairs, threshold: THRESHOLD.mechanism }, built)
}

const DOF_VEC: Record<Dof, Vec3> = {
  '+x': [1, 0, 0],
  '-x': [-1, 0, 0],
  '+y': [0, 1, 0],
  '-y': [0, -1, 0],
  '+z': [0, 0, 1],
  '-z': [0, 0, -1],
  rx: [1, 0, 0],
  ry: [0, 1, 0],
  rz: [0, 0, 1],
}

export interface ProbeResult {
  dof: Dof
  /** 移动后与其余零件的最大交集体积（mm³） */
  volume: number
  against?: string
}

/**
 * 自由度探测：把 moving 这组零件整体沿 dof 平移 amount（mm）或绕组的包围盒中心转 amount（rad），
 * 测量与其余零件的交集体积。体积明显 > 0 即该方向被锁住；≈ 0 即可自由移动。
 * 用来验证榫卯「这一步之后锁住了哪个方向」。
 */
export function probeDof(
  k: Kernel,
  def: AnyExhibit,
  t: number,
  moving: string[],
  dofs: Dof[],
  amount: { translate: number; rotate: number } = { translate: 2, rotate: 0.02 },
  built?: BuiltParts,
): ProbeResult[] {
  const own = built ?? buildParts(k, def)
  try {
    const scene = evaluateScene(def, def.simulate(t, def.defaults), 0)
    const movingSet = new Set(moving)
    // 组中心：各零件世界包围盒并集的中心
    const lo: Vec3 = [Infinity, Infinity, Infinity]
    const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
    for (const id of moving) {
      const b = worldAabb(own.solids[id].bbox(), scene.get(id)!.pose)
      for (let j = 0; j < 3; j++) {
        lo[j] = Math.min(lo[j], b.min[j])
        hi[j] = Math.max(hi[j], b.max[j])
      }
    }
    const center = v3.scale(v3.add(lo, hi), 0.5)
    return dofs.map((dof) => {
      const isRot = dof.startsWith('r')
      const delta: Pose = isRot
        ? (() => {
            const q = quatAxisAngle(DOF_VEC[dof], amount.rotate)
            // 绕 center 旋转：T(c)·R·T(−c)
            return poseCompose({ p: center }, poseCompose({ p: [0, 0, 0], q }, { p: v3.scale(center, -1) }))
          })()
        : { p: v3.scale(DOF_VEC[dof], amount.translate) }
      let worst: ProbeResult = { dof, volume: 0 }
      for (const id of moving) {
        const pa = poseCompose(delta, scene.get(id)!.pose)
        for (const other of def.parts) {
          if (movingSet.has(other.id)) continue
          const st = scene.get(other.id)
          if (!st?.visible) continue
          const v = k.intersectionVolume(own.solids[id], own.solids[other.id], pa, st.pose)
          if (v > worst.volume) worst = { dof, volume: v, against: other.id }
        }
      }
      return worst
    })
  } finally {
    if (!built) own.dispose()
  }
}

/**
 * 铰点漂移：两个零件上各取一个局部点，在一组时刻下求世界距离。
 * 连杆审计用：例如曲柄销与连杆孔心的距离应恒为 0，连杆两端距离应恒为杆长。
 */
export function jointDistances(
  def: AnyExhibit,
  times: number[],
  a: { part: string; local: Vec3; copy?: number },
  b: { part: string; local: Vec3; copy?: number },
): number[] {
  const byId = new Map(def.parts.map((p) => [p.id, p]))
  return times.map((t) => {
    const s = def.simulate(t, def.defaults)
    const pa = byId.get(a.part)!
    const pb = byId.get(b.part)!
    const wa = poseApply(pa.pose ? pa.pose(s, a.copy ?? 0) : pa.rest, a.local)
    const wb = poseApply(pb.pose ? pb.pose(s, b.copy ?? 0) : pb.rest, b.local)
    return v3.dist(wa, wb)
  })
}

/** 一个周期内均匀的 n 个时刻（机械展品的运动学审计用）。 */
export function cycleTimes(def: AnyExhibit, n: number = MIN_SAMPLES.phasesPerCycle): number[] {
  const span = def.timeline.kind === 'cyclic' ? def.timeline.period : 1
  return Array.from({ length: n }, (_, i) => (span * i) / n)
}
