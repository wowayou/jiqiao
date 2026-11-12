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
  /**
   * 讲解：这一环在时间轴上发生的那一小段 [t0, t1]（机械为模型时间秒，可以跨过 0 写成负的 t0；榫卯为装配进度）。
   * 省略时自动推导：在一个小循环（或不长的整个周期）里采样 active，取第一段连续为真的区间并留出余量；
   * 没有 active 的常态说明循环一个小循环。推导不出来（如只在第 100 圈才发生的事）就必须写。
   */
  window?: [number, number]
  /** 讲解：这一环用哪个预设机位（views 的 id）。省略时自动凑近这一环的零件并让开挡在前面的东西。 */
  view?: string
  /** 讲解：循环播放的速度倍数（与 timeline.speeds 同义）。省略时按时间窗长度自动取，让一次循环约 5 秒。 */
  speed?: number
}

export type ControlDef<C> =
  | { key: keyof C & string; label: string; kind: 'toggle' }
  | { key: keyof C & string; label: string; kind: 'range'; min: number; max: number; step: number; unit?: string }
  | { key: keyof C & string; label: string; kind: 'select'; options: { value: string; label: string }[] }

/** 小循环：周期很长的展品里，值得一眼看清的最小重复单元（摆钟一次摆动、足轮一圈、一个碓的一次起落）。 */
export interface MinorCycle {
  /** 小循环的时长（秒）。period 须是它的整数倍。 */
  period: number
  /** 计数单位，界面显示「第 n {unit}」，如 '摆'、'圈'、'次起落' */
  unit: string
  /** 小循环从模型时间 offset 起算（默认 0，须 < period）。让一次完整的动作落在同一格里，而不是被格线切开。 */
  offset?: number
  /** 单步按钮把一个小循环分成几步（默认 40） */
  steps?: number
}

/** 时间轴上的一个关键瞬间，界面里一点即到。 */
export interface TimeMoment {
  /** 模型时间（秒），0 ≤ t < period */
  t: number
  label: string
}

export type TimelineDef =
  | {
      kind: 'cyclic'
      /** 一个周期的模型时间（秒）。时间轴范围 [0, period)，循环播放。 */
      period: number
      speeds: number[]
      defaultSpeed?: number
      /** 可选：小循环。给了就多一条只覆盖当前小循环的细调条，单步按钮按小循环的 1/steps 走。 */
      minor?: MinorCycle
      /** 可选：关键瞬间，界面里「跳到…」直接到达 */
      moments?: TimeMoment[]
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

/** 预设机位：界面上一点即到的「看哪里、怎么看」。不属于几何，只改相机与显示状态。 */
export interface ViewPreset {
  /** 展品内唯一；'all' 保留给界面自带的「全景」 */
  id: string
  /** 按钮上的字，2–6 个字 */
  label: string
  /** 注视点（世界坐标，mm） */
  target: Vec3
  /** 想看清的范围的直径（mm）：相机据此取距离，窄屏会自动拉远，保证这个范围整个入画 */
  size: number
  /** 相机相对注视点的方向；缺省沿用 view.dir */
  dir?: Vec3
  /** 爆炸量 0–1，缺省 0（机位应当是完整的一套状态，不继承用户之前拉的爆炸） */
  explode?: number
  /** 让开：这些零件半透明，露出后面的东西 */
  fade?: string[]
  /** 剖切：true 用展品的 section；也可自带平面（保留 normal·x ≥ offset 一侧）。缺省关闭剖切 */
  section?: true | SectionDef
  /** 选中（强调色）的零件或 'part#feature' */
  select?: string
  /** 一句话：这个机位让你看什么（显示在机位条旁） */
  note?: string
}

/** 迹线：机器最关键的一个量随时间的曲线，画在时间轴上方。数值只能出自 simulate 的状态。 */
export interface TraceDef<S> {
  /** 展品内唯一 */
  id: string
  /** 名称，直接标在线旁（不用图例），如「摆角」 */
  label: string
  /** 单位，如 '°'、'mm'、'kg' */
  unit?: string
  value: (s: S) => number
  provenance: Provenance
  cite?: string
  /** 一句话：怎么读这条线（如「台阶：锁住时平、冲击时上一级」） */
  note?: string
  /** 值的周期（如转角 360）：取样时展开成连续曲线，从 359° 走到 0° 不画成竖线；当前值仍按原值显示 */
  wrap?: number
}

/** 亲手驱动：观众可以抓住拖动的零件。拖动只改时间 t——零件沿 simulate 给出的轨迹跟着手走。 */
export interface DriveDef {
  /** 零件 id（有副本时任一副本都可抓） */
  part: string
  /** 提示语，悬停与首次进入时显示，如「推拉横把」 */
  hint: string
  /** 提示标记的位置（零件局部坐标，mm），应落在零件实体上、运动明显的地方。省略时取运动幅度最大处 */
  anchor?: Vec3
  /**
   * 求速度的时间尺度（模型时间）。省略 = 按单步的几分之一。零件「一步一停」地走（分针随擒纵一跳一跳）时，
   * 用一个小循环的长度求平均速度，否则停着的那几刻拖不动。
   */
  scale?: number
  /**
   * 零件此刻停着（等别的动作做完）时，最多往前、往后各找这么长的模型时间，跳到它开始顺着手动的那一刻再接着拖。
   * 省略 = 此刻不动就拖不动——停着本身就是要讲的事时别写（透榫：楔还打着，横料拔不动）。
   */
  seek?: number
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
  /** 预设机位（可选）：界面上一排一点即达的按钮，「全景」由界面自带 */
  views?: ViewPreset[]
  /** 亲手驱动（可选）：可拖动的零件与提示语 */
  drive?: DriveDef[]
  /** 迹线（可选，1–3 条）：时间轴上方的曲线 */
  traces?: TraceDef<S>[]
  /** 审计配置 */
  audit?: AuditDef
}

/** 类型推断辅助：export default defineExhibit({...}) */
export function defineExhibit<S, C>(def: ExhibitDef<S, C>): ExhibitDef<S, C> {
  return def
}

export type AnyExhibit = ExhibitDef<any, any>
