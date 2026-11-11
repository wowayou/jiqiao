// 展品契约：一个展品 = 数据 + 纯函数，不含渲染代码。
// 字段含义、单位与坐标约定、常见坑见 docs/AUTHORING.md。与 docs/PLAN.md 4.1 的差异也记录在那里。
import type { Kernel, Solid } from '../kernel'
import type { Pose } from '../kinematics/pose'
import type { Vec3 } from '../kinematics/vec'

/** 出处类别：史料原文 / 通行复原 / 假说 / 本站设定 / 计算所得（必须有测试） */
export type Provenance = 'source' | 'reconstruction' | 'hypothesis' | 'model' | 'calc'

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  source: '史料',
  reconstruction: '通行复原',
  hypothesis: '假说',
  model: '本站设定',
  calc: '计算所得',
}

export interface Claim {
  text: string
  provenance: Provenance
  /** sources 的键。provenance 为 'source' 时必填，且该来源须带 file + quote 供审计核对原文。 */
  cite?: string
}

export interface SourceRef {
  title: string
  /** 仓库内的原文文件，如 'docs/sources/shi-mo.md' */
  file?: string
  /** 逐字引文：审计会检查它确实出现在 file 中 */
  quote?: string
  url?: string
}

export type MaterialKey =
  | 'wood-light'
  | 'wood-dark'
  | 'wood-end'
  | 'stone'
  | 'stone-dark'
  | 'iron'
  | 'brass'
  | 'rope'
  | 'grain'
  | 'flour'
  | 'water'
  | 'steel'
  | 'hide'
  | 'cloth'
  | 'earth'
  | 'lacquer'
  | 'dial'

export type PartGroup = 'base' | 'structure' | 'mechanism' | 'control' | 'subject'

export const GROUP_LABEL: Record<PartGroup, string> = {
  base: '基座',
  structure: '结构',
  mechanism: '传动',
  control: '操作',
  subject: '加工对象',
}

/** 零件上的一个具名特征（孔、槽、榫头……），不是独立实体。 */
export interface FeatureDef {
  id: string
  name: string
  role: string
  /** 标注点，零件局部坐标（mm） */
  anchor: Vec3
  claims?: Claim[]
}

export interface ExplodeDef {
  /** 拆出方向（单位向量）；同时是装配路径的反方向 */
  dir: Vec3
  /** 完全爆炸时离装配位置的距离（mm） */
  distance: number
  /** 装配顺序，小的先装；爆炸时后装的先拆 */
  order: number
  /** 'world'（默认）：dir 是世界方向；'local'：dir 随零件当前姿态旋转（适合转动零件上的附件） */
  frame?: 'world' | 'local'
  /** 跟随另一零件的爆炸偏移（附件跟着主体走），再叠加自己的偏移 */
  with?: string
  /** 爆炸时隐藏（流体、颗粒等示意物） */
  hide?: boolean
}

export interface PartDef<S> {
  id: string
  /** 中文名 */
  name: string
  group: PartGroup
  material: MaterialKey
  /** 局部坐标系下的实体，只建一次。在 kernel.scope 内调用，中间结果自动释放。 */
  solid: (k: Kernel) => Solid
  /** 装配完成、初始状态的位姿 */
  rest: Pose
  /** 运动零件：位姿是状态的纯函数。copy 为副本序号（无副本时恒为 0）。 */
  pose?: (s: S, copy: number) => Pose
  /** 同一几何的副本数（颗粒、齿销等），默认 1 */
  copies?: number
  /** 是否显示（纯函数），默认始终显示 */
  visible?: (s: S, copy: number) => boolean
  explode: ExplodeDef
  /** 一句话：它在本模型里做什么。只写功能，史实断言写进 claims。 */
  role: string
  claims?: Claim[]
  features?: FeatureDef[]
}

/** 平移与转动自由度，用于榫卯的「锁住了哪个方向」。 */
export type Dof = '+x' | '-x' | '+y' | '-y' | '+z' | '-z' | 'rx' | 'ry' | 'rz'

export const DOF_LABEL: Record<Dof, string> = {
  '+x': '+X 平移',
  '-x': '−X 平移',
  '+y': '+Y 平移（上）',
  '-y': '−Y 平移（下）',
  '+z': '+Z 平移',
  '-z': '−Z 平移',
  rx: '绕 X 转',
  ry: '绕 Y 转',
  rz: '绕 Z 转',
}

export interface ChainStep<S> {
  id: string
  title: string
  /** 涉及的零件 id；也可写 'partId#featureId' 指向零件上的特征 */
  parts: string[]
  text: string
  provenance: Provenance
  cite?: string
  /** 此刻是否正在起作用（实时点亮）。省略 = 常态说明，不随运行点亮。 */
  active?: (s: S) => boolean
  /** 榫卯：这一步之后新锁住的自由度（相对于 lockedPart） */
  locks?: Dof[]
  locksProvenance?: Provenance
}

export type ControlDef<C> =
  | { key: keyof C & string; label: string; kind: 'toggle' }
  | { key: keyof C & string; label: string; kind: 'range'; min: number; max: number; step: number; unit?: string }
  | { key: keyof C & string; label: string; kind: 'select'; options: { value: string; label: string }[] }

export type TimelineDef =
  | {
      kind: 'cyclic'
      /** 一个周期的模型时间（秒）。时间轴范围 [0, period)，循环播放。 */
      period: number
      speeds: number[]
      defaultSpeed?: number
    }
  | {
      kind: 'assembly'
      /** 装配进度 t ∈ [0,1]；1× 速度下从 0 到 1 需要的秒数 */
      duration: number
      speeds: number[]
      defaultSpeed?: number
    }

export interface ExhibitMeta {
  id: string
  title: string
  subtitle: string
  category: 'mechanism' | 'clock' | 'joinery'
  /** 年代或出处提要，显示用 */
  era: string
  summary: string
  /** 复原假说：页面顶部明示 */
  hypothesis?: boolean
  /** 同类内排序，小的在前 */
  order?: number
  /** 相关展品 id（如木牛流马两说互链） */
  related?: string[]
}

export const CATEGORY_LABEL: Record<ExhibitMeta['category'], string> = {
  mechanism: '机械传动',
  clock: '计时',
  joinery: '榫卯',
}

export interface Readout<S> {
  label: string
  value: (s: S) => string
  provenance: Provenance
  cite?: string
}

export interface SectionDef {
  /** 保留 normal·x ≥ offset 的一侧；相机应位于被切掉的一侧才能看到截面 */
  normal: Vec3
  offset: number
  label?: string
}

export interface AuditDef {
  /** 机械：啮合或接触的零件对，按相位采样检查干涉（0.5%） */
  contacts?: [string, string][]
  /** 每周期采样相位数，默认 60（PLAN 下限） */
  phases?: number
  /** 榫卯：不参与两两干涉的零件 */
  ignore?: string[]
}

export interface ExhibitDef<S = any, C = any> {
  meta: ExhibitMeta
  /** 展品页的导言陈述 */
  intro: Claim[]
  controls: ControlDef<C>[]
  /** 控件初值 */
  defaults: C
  timeline: TimelineDef
  /** 真值模型，纯函数：同样的 (t, c) 永远得到同样的状态 */
  simulate: (t: number, c: C) => S
  parts: PartDef<S>[]
  chain: ChainStep<S>[]
  readouts: Readout<S>[]
  sources: Record<string, SourceRef>
  /** 初始视角：dir 为相机相对目标的方向（默认 [1, 0.8, 1.4]）；target 为取景中心（默认自动，偏向装配态中心） */
  view?: { dir?: Vec3; target?: Vec3 }
  /** 剖切默认平面。榫卯展品必填。 */
  section?: SectionDef
  /** 审计配置 */
  audit?: AuditDef
}

/** 类型推断辅助：export default defineExhibit({...}) */
export function defineExhibit<S, C>(def: ExhibitDef<S, C>): ExhibitDef<S, C> {
  return def
}

export type AnyExhibit = ExhibitDef<any, any>
