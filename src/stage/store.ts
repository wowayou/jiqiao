// 展台状态（每个展品页一个 store）。时间 t 是唯一的运动来源；零件位姿每帧由 simulate(t) 求出。
import { createContext, useContext } from 'react'
import { createStore, useStore, type StoreApi } from 'zustand'
import type { AnyExhibit, SectionDef } from '../exhibit/types'
import type { Vec3 } from '../kinematics/vec'
import { splitRef } from '../exhibit/scene'
import { minorOf, stepSize } from './timeline'

export type SectionAxis = 'default' | 'x' | 'y' | 'z'

export interface SectionState {
  on: boolean
  axis: SectionAxis
  /** 反转保留的一侧 */
  flip: boolean
  /** 平面沿法线方向的偏移（mm，相对展品给定的默认平面） */
  offset: number
  /** 预设机位自带的剖切平面；非空时覆盖 axis/default */
  custom: SectionDef | null
}

/** 相机去哪：由界面发出，展台消费（相机动画属于界面，不属于 simulate）。 */
export type CameraGoal = { nonce: number } & (
  | { kind: 'fit' }
  /** 凑近一组零件，保持当前视线方向，绕它们旋转；auto 表示「只在看不清时才动」（点协同链） */
  | { kind: 'parts'; ids: string[]; features?: string[]; auto?: boolean }
  | { kind: 'preset'; id: string }
)

export interface StageState {
  def: AnyExhibit
  t: number
  playing: boolean
  speed: number
  /** 爆炸量 0–1 */
  explode: number
  /** 选中：零件 id 或 'partId#featureId' */
  selected: string | null
  hovered: string | null
  isolate: boolean
  section: SectionState
  /** 用户点住的协同链一环（覆盖实时点亮） */
  pinnedStep: string | null
  controls: Record<string, unknown>
  /** 最近一次模拟状态（约 10 Hz 更新，给面板用） */
  snapshot: unknown
  /** 此刻实时点亮的协同链环 */
  activeSteps: string[]
  ready: boolean
  buildProgress: number
  error: string | null
  /** 递增即重新取景 */
  viewNonce: number
  /** 当前相机目标；展台消费，nonce 递增即触发 */
  camGoal: CameraGoal | null
  /** 当前机位：'all' 或预设 id；用户自己动了相机就置空 */
  activeView: string | null
  /** 让开（半透明）的零件：预设机位、凑近看时挡住视线的东西 */
  fadeParts: string[]
  /** 界面浮层占去的画布边缘（px）：取景把这些区域算进去，模型不会钻到工具条底下 */
  inset: { top: number; bottom: number }
  /** 相机旋转/缩放的指令（键盘按钮用），由展台消费 */
  viewCommand: { kind: 'orbit' | 'zoom'; amount: number; nonce: number } | null
}

export interface StageActions {
  setT(t: number): void
  setPlaying(p: boolean): void
  togglePlay(): void
  setSpeed(s: number): void
  setExplode(e: number): void
  select(ref: string | null): void
  hover(id: string | null): void
  setIsolate(v: boolean): void
  setSection(p: Partial<SectionState>): void
  pinStep(id: string | null): void
  setControl(key: string, value: unknown): void
  resetView(): void
  /** 凑近看选中的零件（或给定零件）。 */
  focusPart(id?: string): void
  /** 套用预设机位（'all' = 全景）：相机、爆炸、剖切、让开的零件、选中一起到位。 */
  applyView(id: string): void
  /** 协同链一环：必要时（太小或被挡）把相机带过去；force 时一定去。 */
  lookAtStep(id: string, force?: boolean): void
  clearFade(): void
  setFade(ids: string[]): void
  setInset(p: Partial<{ top: number; bottom: number }>): void
  /** 用户自己动了相机 */
  userMovedCamera(): void
  nudgeView(kind: 'orbit' | 'zoom', amount: number): void
  /** 按当前时间轴步进（秒或进度） */
  step(dir: 1 | -1, big?: boolean): void
}

export type Stage = StageState & StageActions
export type StageStore = StoreApi<Stage>

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function timelineSpan(def: AnyExhibit): number {
  return def.timeline.kind === 'cyclic' ? def.timeline.period : 1
}

export function createStageStore(def: AnyExhibit): StageStore {
  const tl = def.timeline
  const speed = tl.defaultSpeed ?? (tl.speeds.includes(1) ? 1 : tl.speeds[0])
  return createStore<Stage>((set, get) => ({
    def,
    // 榫卯默认停在「装好」的状态，播放即从拆开开始装
    t: tl.kind === 'assembly' ? 1 : 0,
    playing: tl.kind === 'cyclic' && !prefersReducedMotion(),
    speed,
    explode: 0,
    selected: null,
    hovered: null,
    isolate: false,
    section: { on: false, axis: 'default', flip: false, offset: 0, custom: null },
    pinnedStep: null,
    controls: { ...(def.defaults as Record<string, unknown>) },
    snapshot: def.simulate(tl.kind === 'assembly' ? 1 : 0, def.defaults),
    activeSteps: [],
    ready: false,
    buildProgress: 0,
    error: null,
    viewNonce: 0,
    camGoal: null,
    activeView: 'all',
    fadeParts: [],
    inset: { top: 0, bottom: 0 },
    viewCommand: null,

    setT: (t) => {
      const span = timelineSpan(get().def)
      const v = tl.kind === 'cyclic' ? ((t % span) + span) % span : Math.min(1, Math.max(0, t))
      set({ t: v })
    },
    setPlaying: (p) => {
      // 装配到头再播放：从头开始
      if (p && tl.kind === 'assembly' && get().t >= 1) set({ t: 0 })
      set({ playing: p })
    },
    togglePlay: () => get().setPlaying(!get().playing),
    setSpeed: (s) => set({ speed: s }),
    setExplode: (e) => set({ explode: Math.min(1, Math.max(0, e)) }),
    select: (ref) => set({ selected: ref }),
    hover: (id) => set({ hovered: id }),
    setIsolate: (v) => set({ isolate: v }),
    setSection: (p) => set({ section: { ...get().section, ...p } }),
    pinStep: (id) => set({ pinnedStep: id }),
    setControl: (key, value) => set({ controls: { ...get().controls, [key]: value } }),
    resetView: () => get().applyView('all'),
    focusPart: (id) => {
      const target = id ?? get().selected
      if (!target) return
      const pid = splitRef(target)[0]
      set({ camGoal: goal(get(), { kind: 'parts', ids: [pid] }), activeView: null })
    },
    applyView: (id) => {
      const st = get()
      if (id === 'all') {
        set({ viewNonce: st.viewNonce + 1, camGoal: goal(st, { kind: 'fit' }), activeView: 'all', fadeParts: [] })
        return
      }
      const v = st.def.views?.find((x) => x.id === id)
      if (!v) return
      const custom = v.section === true ? (st.def.section ?? null) : (v.section ?? null)
      set({
        camGoal: goal(st, { kind: 'preset', id }),
        activeView: id,
        explode: v.explode ?? 0,
        fadeParts: v.fade ?? [],
        selected: v.select ?? null,
        pinnedStep: null,
        section: { on: Boolean(custom), axis: 'default', flip: false, offset: 0, custom },
      })
    },
    lookAtStep: (id, force) => {
      const st = get()
      const step = st.def.chain.find((c) => c.id === id)
      if (!step) return
      const ids = step.parts.map((r) => splitRef(r)[0])
      const features = step.parts.filter((r) => splitRef(r)[1])
      set({ camGoal: goal(st, { kind: 'parts', ids: [...new Set(ids)], features, auto: !force }) })
    },
    clearFade: () => set({ fadeParts: [] }),
    setFade: (ids) => set({ fadeParts: ids }),
    setInset: (p) => {
      const i = get().inset
      const next = { top: p.top ?? i.top, bottom: p.bottom ?? i.bottom }
      if (Math.abs(i.top - next.top) > 0.5 || Math.abs(i.bottom - next.bottom) > 0.5) set({ inset: next })
    },
    userMovedCamera: () => {
      if (get().activeView !== null) set({ activeView: null })
    },
    nudgeView: (kind, amount) => set({ viewCommand: { kind, amount, nonce: (get().viewCommand?.nonce ?? 0) + 1 } }),
    step: (dir, big) => {
      const d = get().def
      const minor = minorOf(d)
      // Shift+方向键：整格走（有小循环按一个小循环，否则 10 倍单步）
      const size = big ? (minor ? minor.period : stepSize(d) * 10) : stepSize(d)
      set({ playing: false })
      get().setT(get().t + dir * size)
    },
  }))
}

function goal(st: Stage, g: DistributiveOmit<CameraGoal, 'nonce'>): CameraGoal {
  return { ...g, nonce: (st.camGoal?.nonce ?? 0) + 1 } as CameraGoal
}
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never

export const StageContext = createContext<StageStore | null>(null)

export function useStageStore(): StageStore {
  const s = useContext(StageContext)
  if (!s) throw new Error('useStage 须在 StageContext 内使用')
  return s
}

export function useStage<U>(selector: (s: Stage) => U): U {
  return useStore(useStageStore(), selector)
}

/** 剖切平面：保留 n·x ≥ d 的一侧。 */
export function sectionPlane(def: AnyExhibit, sec: SectionState, center: Vec3): { normal: Vec3; d: number } {
  let normal: Vec3
  let d: number
  if (sec.custom) {
    normal = sec.custom.normal
    d = sec.custom.offset
  } else if (sec.axis === 'default' && def.section) {
    normal = def.section.normal
    d = def.section.offset
  } else {
    const axis = sec.axis === 'default' ? 'z' : sec.axis
    normal = axis === 'x' ? [-1, 0, 0] : axis === 'y' ? [0, -1, 0] : [0, 0, -1]
    d = normal[0] * center[0] + normal[1] * center[1] + normal[2] * center[2]
  }
  if (sec.flip) {
    normal = [-normal[0], -normal[1], -normal[2]]
    d = -d
  }
  return { normal, d: d + sec.offset * (sec.flip ? -1 : 1) }
}

/** 动作函数是稳定的，取用它们不会引起重渲染。 */
export function useStageActions(): StageActions {
  return useStageStore().getState()
}
