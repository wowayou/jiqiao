// 展台状态（每个展品页一个 store）。时间 t 是唯一的运动来源；零件位姿每帧由 simulate(t) 求出。
import { createContext, useContext } from 'react'
import { createStore, useStore, type StoreApi } from 'zustand'
import type { AnyExhibit } from '../exhibit/types'
import type { Vec3 } from '../kinematics/vec'

export type SectionAxis = 'default' | 'x' | 'y' | 'z'

export interface SectionState {
  on: boolean
  axis: SectionAxis
  /** 反转保留的一侧 */
  flip: boolean
  /** 平面沿法线方向的偏移（mm，相对展品给定的默认平面） */
  offset: number
}

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
  nudgeView(kind: 'orbit' | 'zoom', amount: number): void
  /** 按当前时间轴步进（秒或进度） */
  step(dir: 1 | -1): void
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
    section: { on: false, axis: 'default', flip: false, offset: 0 },
    pinnedStep: null,
    controls: { ...(def.defaults as Record<string, unknown>) },
    snapshot: def.simulate(tl.kind === 'assembly' ? 1 : 0, def.defaults),
    activeSteps: [],
    ready: false,
    buildProgress: 0,
    error: null,
    viewNonce: 0,
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
    resetView: () => set({ viewNonce: get().viewNonce + 1 }),
    nudgeView: (kind, amount) => set({ viewCommand: { kind, amount, nonce: (get().viewCommand?.nonce ?? 0) + 1 } }),
    step: (dir) => {
      const span = timelineSpan(get().def)
      set({ playing: false })
      get().setT(get().t + dir * span * (tl.kind === 'cyclic' ? 1 / 72 : 1 / 40))
    },
  }))
}

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
  if (sec.axis === 'default' && def.section) {
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
