// 锚式擒纵摆钟（M5）
import { defineExhibit, type ChainStep } from '../../exhibit/types'
import type { PalletName, EscPhase } from '../../kinematics/escapement'
import { intro, sources } from './content'
import { meta } from './meta'
import { AMPLITUDE, PENDULUM_LENGTH, PENDULUM_PERIOD, PERIOD, WIND, simulate, type ClockControls, type ClockState } from './model'
import { parts } from './parts'

/** 机芯前面挡视线的零件：表盘、前夹板、指针与跨轮——预设机位里让开（半透明） */
const FRONT_OF_MOVEMENT = ['dial', 'dial-marks', 'front-plate', 'hour-hand', 'minute-hand', 'second-hand', 'cannon', 'minute-wheel', 'hour-wheel']

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0')
const clockText = (sec: number) => {
  const h = Math.floor(sec / 3600) % 12 || 12
  return `${h}:${pad((sec / 60) % 60)}:${pad(sec % 60)}`
}
const deg1 = (r: number) => `${((r * 180) / Math.PI).toFixed(2)}°`

const PALLET_PART: Record<PalletName, string> = { entry: 'pallet-entry', exit: 'pallet-exit' }
const PALLET_LABEL: Record<PalletName, string> = { entry: '入瓦（左）', exit: '出瓦（右）' }
const OTHER: Record<PalletName, PalletName> = { entry: 'exit', exit: 'entry' }
const PHASE_LABEL: Record<EscPhase, string> = { lock: '锁', impulse: '冲击', drop: '落' }

function escSteps(p: PalletName): ChainStep<ClockState>[] {
  const name = PALLET_LABEL[p]
  const part = PALLET_PART[p]
  const swing = p === 'entry' ? '摆锤向左' : '摆锤向右'
  return [
    {
      id: `lock-${p}`,
      title: `锁 · ${name}`,
      parts: [part],
      text: `擒纵轮被重锤的力推着要往前转，齿尖却抵在${name}的锁面上。锁面是以叉轴为圆心的圆弧，摆带着叉继续摆，叉瓦只是沿着齿尖滑过——轮子纹丝不动（直进式：不前进、也不倒退）。`,
      provenance: 'calc',
      active: (s) => s.phase === 'lock' && s.pallet === p,
      view: 'escapement',
    },
    {
      id: `impulse-${p}`,
      title: `冲击 · ${name}`,
      parts: [part, 'escape-wheel'],
      text: `${swing}摆过中点附近，锁面走完，齿尖滑上${name}下端的斜面（冲击面）。齿尖一边沿斜面往前走（轮子前进约 4.5°），一边把叉——也就是摆——顺着它正在走的方向推一把，补上摆每一摆损失的能量。`,
      provenance: 'calc',
      active: (s) => s.phase === 'impulse' && s.pallet === p,
      view: 'escapement',
    },
    {
      id: `drop-${p}`,
      title: `落 · ${name}放开`,
      parts: ['escape-wheel', PALLET_PART[OTHER[p]]],
      text: `齿尖滑出冲击面的末端，脱开了${name}。此刻没有东西挡着，擒纵轮在重锤的力下空转一小段（约 1.5°），直到另一颗齿撞上${PALLET_LABEL[OTHER[p]]}的锁面被接住。`,
      provenance: 'calc',
      active: (s) => s.phase === 'drop' && s.pallet === p,
      view: 'escapement',
    },
  ]
}

export default defineExhibit<ClockState, ClockControls>({
  meta,
  intro,
  controls: [],
  defaults: {},
  timeline: {
    kind: 'cyclic',
    period: PERIOD,
    speeds: [0.05, 0.1, 0.25, 1, 10, 60, 600, 3600],
    defaultSpeed: 1,
    // 摆动一次 2 s（来回一趟）：锁 → 冲击 → 落，入瓦、出瓦各一次，正好是一格
    minor: { period: PENDULUM_PERIOD, unit: '摆', steps: 40 },
    moments: [
      { t: 0.2, label: '锁 · 入瓦' },
      { t: 0.52, label: '冲击 · 入瓦' },
      { t: 0.65, label: '落 · 入瓦放开' },
      { t: 1.0, label: '锁 · 出瓦' },
      { t: 1.52, label: '冲击 · 出瓦' },
    ],
  },
  simulate,
  parts,
  chain: [
    {
      id: 'drive',
      title: '重锤供能',
      parts: ['weight', 'cord', 'barrel'],
      text: '重锤拉着绳，绳轮带着大轮转：这是一股连续的力，一直顶在整条轮系上，最后顶到擒纵轮的齿尖。',
      provenance: 'reconstruction',
      // 讲解：重锤 12 小时只降约 21 cm，快进看完整个走时段（不含最后的上弦）
      window: [0, PERIOD - WIND],
    },
    {
      id: 'train-step',
      title: '轮系走一步',
      parts: ['great-wheel', 'center-wheel', 'third-wheel', 'escape-wheel'],
      text: '只有在冲击和落的时候擒纵轮才转，大轮、中心轮、三轮跟着同时走一小步，重锤也跟着下降一点；锁住时整条轮系连同重锤都停着。',
      provenance: 'calc',
      view: 'train',
    },
    ...escSteps('entry'),
    ...escSteps('exit'),
    {
      id: 'isochronism',
      title: '摆定节拍（等时）',
      parts: ['pendulum', 'bob'],
      text: `摆来回一次的时间只取决于摆长：摆长 ${PENDULUM_LENGTH.toFixed(1)} mm，周期 ${PENDULUM_PERIOD} s，每摆过一次 1 s。摆幅大一点小一点，周期几乎不变——所以每一步都等长。`,
      provenance: 'calc',
    },
    {
      id: 'hands',
      title: '一步变成秒、分、时',
      parts: ['second-hand', 'minute-hand', 'hour-hand', 'cannon', 'minute-wheel', 'hour-wheel'],
      text: '擒纵轮 30 齿、每 2 s 前进 1 齿，一分钟一圈，直接带秒针；经三轮、中心轮减速 60 倍到分针；再经跨轮管、过轮、时轮减速 12 倍到时针。速比 秒 : 分 : 时 = 1 : 1/60 : 1/720。',
      provenance: 'calc',
      // 讲解：5 分钟快进成约 5 秒——秒针转 5 圈、分针走 30°，看得出三根针的快慢
      window: [0, 300],
    },
    {
      id: 'wind',
      title: '上弦（演示）',
      parts: ['barrel', 'weight'],
      text: '时间轴的最后 30 分钟里，绳轮借棘轮单向倒转，把绳卷回、把重锤提回原高，于是 12 小时的周期首尾一致。本模型假定上弦时有保持力，走时不中断。',
      provenance: 'model',
      active: (s) => s.winding,
      // 只在周期最后 30 分钟发生，小循环里推导不到
      window: [PERIOD - WIND, PERIOD],
    },
  ],
  readouts: [
    { label: '钟面时间', value: (s) => clockText(s.clock), provenance: 'calc' },
    { label: '擒纵此刻', value: (s) => `${PHASE_LABEL[s.phase]} · ${PALLET_LABEL[s.pallet]}`, provenance: 'calc' },
    { label: '摆角', value: (s) => `${deg1(s.pendulum)}（摆幅 ±${deg1(AMPLITUDE)}）`, provenance: 'model' },
    {
      label: '擒纵轮',
      value: (s) => {
        const teeth = (s.psi * 30) / (2 * Math.PI)
        return `转过 ${teeth.toFixed(2)} 齿（一圈 30 齿，此刻第 ${(Math.floor(teeth) % 30) + 1} 齿）`
      },
      provenance: 'calc',
    },
    { label: '重锤已下降', value: (s) => `${s.weightDrop.toFixed(1)} mm${s.winding ? '（上弦中）' : ''}`, provenance: 'calc' },
    { label: '摆长 / 周期', value: () => `${PENDULUM_LENGTH.toFixed(1)} mm / ${PENDULUM_PERIOD} s`, provenance: 'calc' },
  ],
  sources,
  view: { dir: [0.45, 0.75, 1] },
  views: [
    {
      id: 'escapement',
      label: '擒纵',
      target: [0, 1100, 0],
      size: 150,
      dir: [0.18, 0.22, 1],
      fade: FRONT_OF_MOVEMENT,
      note: '表盘、前夹板、指针让开：看叉瓦锁住、放行擒纵轮',
    },
    {
      id: 'train',
      label: '走时轮系',
      target: [-25, 995, 0],
      size: 430,
      dir: [0.2, 0.25, 1],
      fade: FRONT_OF_MOVEMENT,
      note: '表盘等让开：大轮 → 中心轮 → 三轮 → 擒纵轮',
    },
  ],
  section: { normal: [0, 0, -1], offset: -20, label: '过擒纵轮的前后剖面（切掉表盘与前夹板一侧）' },
  audit: {
    phases: 127,
    contacts: [
      ['escape-wheel', 'pallet-entry'],
      ['escape-wheel', 'pallet-exit'],
      ['escape-wheel', 'anchor'],
      ['great-wheel', 'center-wheel'],
      ['center-wheel', 'third-wheel'],
      ['third-wheel', 'escape-wheel'],
      ['cannon', 'minute-wheel'],
      ['minute-wheel', 'hour-wheel'],
      ['cannon', 'center-wheel'],
      ['hour-wheel', 'cannon'],
      ['barrel', 'great-wheel'],
      ['barrel', 'center-wheel'],
      ['cord', 'barrel'],
      ['weight', 'cord'],
      ['anchor', 'third-wheel'],
      ['great-wheel', 'back-plate'],
      ['great-wheel', 'front-plate'],
      ['center-wheel', 'back-plate'],
      ['center-wheel', 'front-plate'],
      ['third-wheel', 'back-plate'],
      ['third-wheel', 'front-plate'],
      ['escape-wheel', 'back-plate'],
      ['escape-wheel', 'front-plate'],
      ['anchor', 'back-plate'],
      ['anchor', 'front-plate'],
      ['minute-wheel', 'front-plate'],
      ['cannon', 'front-plate'],
      ['pendulum', 'back-plate'],
      ['pendulum', 'wall-posts'],
      ['pendulum', 'backboard'],
      ['bob', 'backboard'],
      ['bob', 'weight'],
      ['pendulum', 'weight'],
      ['hour-hand', 'minute-hand'],
      ['second-hand', 'hour-hand'],
      ['second-hand', 'minute-hand'],
      ['hour-hand', 'dial'],
      ['minute-hand', 'dial'],
      ['second-hand', 'dial'],
      ['second-hand', 'dial-marks'],
      ['hour-hand', 'escape-wheel'],
      ['minute-hand', 'escape-wheel'],
      ['hour-hand', 'cannon'],
      ['hour-wheel', 'dial'],
    ],
  },
})
