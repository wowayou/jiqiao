// 展台状态（每个展品页一个 store）。时间 t 是唯一的运动来源；零件位姿每帧由 simulate(t) 求出。
import { createContext, useContext } from 'react'
import { createStore, useStore, type StoreApi } from 'zustand'
import type { AnyExhibit, SectionDef } from '../exhibit/types'
import type { Vec3 } from '../kinematics/vec'
import { splitRef } from '../exhibit/scene'
import { tourPlan, type StepPlan } from '../exhibit/tour'
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
  | { kind: 'parts'; ids: string[]; features?: string[]; auto?: boolean; times?: number[]; fromDefault?: boolean }
  | { kind: 'preset'; id: string }
)

/** 进讲解之前观众自己的设置：退出讲解时原样恢复（相机除外） */
export interface TourSaved {
  explode: number
  section: SectionState
  fadeParts: string[]
  selected: string | null
  pinnedStep: string | null
  isolate: boolean
  playing: boolean
  activeView: string | null
}

export interface TourState {
  /** 当前讲到第几环（def.chain 的下标） */
  index: number
  saved: TourSaved
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
  /** 讲解：非空即在讲解中。讲解中 playing 表示「在这一环的时间窗里循环」 */
  tour: TourState | null
  /** 正在被拖动的零件（亲手驱动） */
  dragging: string | null
  /** 观众已经亲手拖过一次：抓取处的提示标记不再显示 */
  driveSeen: boolean
  /** 观众自己隐藏的零件（预设机位、讲解切换都不清掉，只有「全部显示」清掉） */
  hidden: string[]
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
  lookAtStep(id: string, force?: boolean, times?: number[], fromDefault?: boolean): void
  clearFade(): void
  setFade(ids: string[]): void
  setInset(p: Partial<{ top: number; bottom: number }>): void
  /** 用户自己动了相机 */
  userMovedCamera(): void
  nudgeView(kind: 'orbit' | 'zoom', amount: number): void
  /** 按当前时间轴步进（秒或进度） */
  step(dir: 1 | -1, big?: boolean): void
  /** 讲解：从第 index 环开始（默认第一环） */
  startTour(index?: number): void
  /** 讲解：转到第 index 环（越界则夹住） */
  tourGo(index: number): void
  tourNext(dir: 1 | -1): void
  /** 退出讲解：恢复进讲解前的爆炸、剖切、让开、选中、孤立、播放状态；相机留在原处 */
  exitTour(): void
  /** 当前控件值下每一环的讲解计划（时间窗、速度） */
  plan(): (StepPlan | null)[]
  /** 观众拖过一次零件：记住，提示标记从此不再出现 */
  markDriveSeen(): void
  /** 隐藏零件（缺省为选中的零件）；隐藏选中的零件同时取消选中 */
  hidePart(id?: string): void
  showPart(id: string): void
  showAll(): void
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

const SEEN_KEY = 'jiqiao-drive-seen'
/** 本机是否已在这个展品上拖过零件（存储不可用时当作没拖过：提示标记多出现一次无妨） */
function readDriveSeen(id: string): boolean {
  try {
    return (localStorage.getItem(SEEN_KEY) ?? '').split(',').includes(id)
  } catch {
    return false
  }
}
function writeDriveSeen(id: string) {
  try {
    const list = (localStorage.getItem(SEEN_KEY) ?? '').split(',').filter(Boolean)
    if (!list.includes(id)) localStorage.setItem(SEEN_KEY, [...list, id].join(','))
  } catch {
    /* 只在本次会话生效 */
  }
}

/** 时间回绕到时间轴范围内：机械取模到 [0, period)，榫卯夹在 [0, 1]。 */
export function wrapT(def: AnyExhibit, t: number): number {
  const span = timelineSpan(def)
  return def.timeline.kind === 'cyclic' ? ((t % span) + span) % span : Math.min(1, Math.max(0, t))
}

export function createStageStore(def: AnyExhibit): StageStore {
  const tl = def.timeline
  const planCache: { key: string; value: (StepPlan | null)[] } = { key: '', value: [] }
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
    tour: null,
    dragging: null,
    driveSeen: readDriveSeen(def.meta.id),
    hidden: [],

    setT: (t) => set({ t: wrapT(get().def, t) }),
    setPlaying: (p) => {
      // 装配到头再播放：从头开始（讲解中由时间窗循环负责，不在这里跳）
      if (p && tl.kind === 'assembly' && get().t >= 1 && !get().tour) set({ t: 0 })
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
        // 讲解中换机位：这一环仍然点着（强调色不丢）
        pinnedStep: st.tour ? st.pinnedStep : null,
        section: { on: Boolean(custom), axis: 'default', flip: false, offset: 0, custom },
      })
    },
    lookAtStep: (id, force, times, fromDefault) => {
      const st = get()
      const step = st.def.chain.find((c) => c.id === id)
      if (!step) return
      const ids = step.parts.map((r) => splitRef(r)[0])
      const features = step.parts.filter((r) => splitRef(r)[1])
      set({ camGoal: goal(st, { kind: 'parts', ids: [...new Set(ids)], features, auto: !force, times, fromDefault }) })
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

    hidePart: (id) => {
      const st = get()
      const ref = id ?? st.selected
      if (!ref) return
      const pid = splitRef(ref)[0]
      if (!st.def.parts.some((p) => p.id === pid)) return
      const sel = st.selected && splitRef(st.selected)[0] === pid ? null : st.selected
      set({ hidden: st.hidden.includes(pid) ? st.hidden : [...st.hidden, pid], selected: sel, hovered: st.hovered === pid ? null : st.hovered })
    },
    showPart: (id) => set({ hidden: get().hidden.filter((x) => x !== id) }),
    showAll: () => set({ hidden: [] }),
    markDriveSeen: () => {
      if (!get().driveSeen) set({ driveSeen: true })
      writeDriveSeen(get().def.meta.id)
    },
    plan: () => {
      const st = get()
      const key = JSON.stringify(st.controls)
      if (planCache.key !== key) {
        planCache.key = key
        planCache.value = tourPlan(st.def, st.controls)
      }
      return planCache.value
    },
    startTour: (index = 0) => {
      const st = get()
      if (!st.tour) {
        const saved: TourSaved = {
          explode: st.explode,
          section: st.section,
          fadeParts: st.fadeParts,
          selected: st.selected,
          pinnedStep: st.pinnedStep,
          isolate: st.isolate,
          playing: st.playing,
          activeView: st.activeView,
        }
        set({ tour: { index, saved } })
      }
      get().tourGo(index)
    },
    tourGo: (index) => {
      const st = get()
      if (!st.tour) return
      const i = Math.max(0, Math.min(st.def.chain.length - 1, index))
      const step = st.def.chain[i]
      const p = st.plan()[i]
      if (!p) return
      // 每一环都是一整套状态：时间到窗头、这一环点着、不选零件、不孤立；机位由数据决定
      set({
        tour: { ...st.tour, index: i },
        t: wrapT(st.def, p.window[0]),
        // 减少动效：不自动循环，等观众按播放
        playing: !prefersReducedMotion(),
        selected: null,
        isolate: false,
        pinnedStep: step.id,
      })
      if (p.view) {
        get().applyView(p.view)
        set({ pinnedStep: step.id, selected: null })
      } else {
        // 没有预设机位：复原爆炸、关剖切，镜头凑近这一环在整个时间窗里扫过的范围，挡在前面的让开
        set({
          explode: 0,
          section: { on: false, axis: 'default', flip: false, offset: 0, custom: null },
          fadeParts: [],
          activeView: null,
        })
        const n = 8
        const times = Array.from({ length: n + 1 }, (_, k) => wrapT(st.def, p.window[0] + ((p.window[1] - p.window[0]) * k) / n))
        // 从展品的默认方向看（不沿用上一环机位的方向，免得隔着别的零件看）
        get().lookAtStep(step.id, true, times, true)
      }
    },
    tourNext: (dir) => {
      const st = get()
      if (st.tour) st.tourGo(st.tour.index + dir)
    },
    exitTour: () => {
      const st = get()
      if (!st.tour) return
      const s = st.tour.saved
      set({
        tour: null,
        explode: s.explode,
        section: s.section,
        fadeParts: s.fadeParts,
        selected: s.selected,
        pinnedStep: s.pinnedStep,
        isolate: s.isolate,
        playing: s.playing,
        // 相机留在讲解最后的位置，机位按钮不再显示为按下
        activeView: null,
      })
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
