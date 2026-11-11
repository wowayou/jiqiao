// 透榫的真值模型：t = 装配进度 ∈ [0,1]。两步：榫入卯（t 0→0.5）、楔入缝（t 0.5→1）。
// 装配路径就是各零件的 explode 定义（爆炸 = 倒放装配），由 ASSEMBLY 一处给出。
import { assemblyOffsets, assemblyStep, type AssemblyItem } from '../../kinematics/assembly'
import type { Pose } from '../../kinematics/pose'
import { clamp, type Vec3 } from '../../kinematics/vec'
import type { Dof } from '../../exhibit/types'

/** 全部尺寸为本站设定（mm）。 */
export const DIM = {
  /** 立料 [X 厚, Y 高, Z 宽]，中心在原点；卯眼从 +X 面进、−X 面出 */
  post: [80, 520, 80] as Vec3,
  rail: { length: 360, height: 90, thickness: 50 },
  tenon: { length: 92, thickness: 16, height: 70 },
  /** 锯缝：模型中预先画成与楔同形的 V 形缝 */
  kerf: { depth: 50, open: 14, tip: 0.8 },
  /** 卯眼出口放大段：最后 30 mm 上下各放大 7 mm（= 楔头厚的一半，即榫头每半边被撑开的量） */
  flare: { depth: 30, amount: 7 },
  wedgeProtrude: 8,
}

/** 横料肩所在的世界 x（= 立料入口面） */
export const SHOULDER_X = DIM.post[0] / 2

export const ASSEMBLY: AssemblyItem[] = [
  { id: 'post', dir: [0, 1, 0], distance: 0, order: 0 },
  { id: 'rail', dir: [1, 0, 0], distance: 320, order: 0 },
  { id: 'wedge', dir: [-1, 0, 0], distance: 160, order: 1 },
]

export const STEP_LOCKS: Dof[][] = [['-x', '+y', '-y', '+z', '-z', 'rx', 'ry', 'rz'], ['+x']]

export interface JointState {
  p: number
  step: number
  stepLocal: number
  offsets: Record<string, Vec3>
  /** 榫头进入卯眼的深度（从入口面算） */
  tenonDepth: number
  /** 榫头露出出口面的长度 */
  protrusion: number
  /** 楔进入锯缝的深度 */
  wedgeDepth: number
  locked: Dof[]
}

export function simulate(t: number): JointState {
  const p = clamp(t, 0, 1)
  const offsets = assemblyOffsets(ASSEMBLY, p)
  const st = assemblyStep(ASSEMBLY, p)
  const tenonDepth = clamp(DIM.tenon.length - offsets.rail[0], 0, DIM.tenon.length)
  const protrusion = Math.max(0, tenonDepth - DIM.post[0])
  const wedgeDepth = clamp(DIM.kerf.depth + offsets.wedge[0], 0, DIM.kerf.depth)
  const locked: Dof[] = []
  if (offsets.rail[0] < 1e-9) locked.push(...STEP_LOCKS[0])
  if (Math.abs(offsets.wedge[0]) < 1e-9) locked.push(...STEP_LOCKS[1])
  return { p, step: st.index, stepLocal: st.local, offsets, tenonDepth, protrusion, wedgeDepth, locked }
}

const at = (id: string) => (s: JointState): Pose => {
  const o = s.offsets[id]
  return { p: [SHOULDER_X + o[0], o[1], o[2]] }
}

export const railPose = at('rail')
export const wedgePose = at('wedge')

export function explodeOf(id: string) {
  const a = ASSEMBLY.find((x) => x.id === id)!
  return { dir: a.dir, distance: a.distance, order: a.order }
}
