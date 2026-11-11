// 石磨（M1，机械类样板展品）
import { defineExhibit } from '../../exhibit/types'
import { intro, sources } from './content'
import { meta } from './meta'
import { DEAD_ARM_RATIO, DIM, PERIOD, simulate, type MillControls, type MillState } from './model'
import { parts } from './parts'

const deg = (r: number) => `${Math.round((r * 180) / Math.PI)}°`
const STAGE_LABEL = { wait: '在顶面浅盘里', eye: '正落进磨眼', gap: '在两扇之间被磨', drop: '从边缘落进磨盘' } as const
const PHASE_LABEL = { push: '推半程', pull: '拉半程', dead: '越过死点' } as const

export default defineExhibit<MillState, MillControls>({
  meta,
  intro,
  controls: [{ key: 'grain', label: '显示粮粒与碎料', kind: 'toggle' }],
  defaults: { grain: true },
  timeline: { kind: 'cyclic', period: PERIOD, speeds: [0.1, 0.25, 0.5, 1, 2], defaultSpeed: 0.5 },
  simulate,
  parts,
  chain: [
    {
      id: 'push',
      title: '推半程',
      parts: ['push-rod', 'crank'],
      text: '人把推杆往磨的方向推。推杆顶着磨拐上的木橛，推力偏离磨心，形成力矩，上扇被推着转。',
      provenance: 'reconstruction',
      active: (s) => s.phase === 'push',
    },
    {
      id: 'pull',
      title: '拉半程',
      parts: ['push-rod', 'crank'],
      text: '磨拐转到远侧之后，人改为往回拉。拉力同样偏离磨心，上扇继续朝同一方向转——推和拉都在给它加力。',
      provenance: 'reconstruction',
      active: (s) => s.phase === 'pull',
    },
    {
      id: 'dead',
      title: '越过死点',
      parts: ['upper-stone', 'push-rod', 'crank'],
      text: `推杆和磨拐转到一条直线上时，推拉的力正对着磨心，力臂为零，推不动也拉不动（死点，一圈两次）。此刻靠上扇自身的惯性转过去。（力臂小于曲柄半径的 ${Math.round(DEAD_ARM_RATIO * 100)}% 时在此点亮，阈值为本站设定。）`,
      provenance: 'calc',
      active: (s) => s.phase === 'dead',
    },
    {
      id: 'turn',
      title: '上扇绕磨脐转动',
      parts: ['upper-stone', 'spindle', 'lower-stone'],
      text: '上扇套在下扇中心的磨脐上，始终同心地贴着下扇转动；下扇固定在磨盘上不动。',
      provenance: 'reconstruction',
    },
    {
      id: 'feed',
      title: '粮食落入磨眼',
      parts: ['grain', 'upper-stone#eye'],
      text: '粮食从上方落进上扇的磨眼，掉到两扇之间的磨膛里。',
      provenance: 'source',
      cite: 'feed',
      active: (s) => s.showGrain && (s.tracer === 'wait' || s.tracer === 'eye'),
    },
    {
      id: 'grind',
      title: '磨齿剪碎并外赶',
      parts: ['grain', 'upper-stone#teeth', 'lower-stone#teeth'],
      text: '上下扇的斜齿方向相反、交叉成剪刀口。上扇一转，交叉点沿着沟槽不断向外移动：粮粒在交叉处被剪碎，同时被一路赶向边缘。',
      provenance: 'calc',
      active: (s) => s.showGrain && s.tracer === 'gap',
    },
    {
      id: 'discharge',
      title: '碎料落进磨盘',
      parts: ['grain', 'flour', 'tray'],
      text: '碎料从两扇缝隙的边缘挤出，落进下面的磨盘。',
      provenance: 'reconstruction',
      active: (s) => s.showGrain && s.tracer === 'drop',
    },
  ],
  readouts: [
    { label: '上扇转角', value: (s) => deg(s.theta), provenance: 'calc' },
    { label: '转速', value: () => `${Math.round(60 / PERIOD)} 转/分`, provenance: 'model' },
    { label: '此刻', value: (s) => PHASE_LABEL[s.phase], provenance: 'calc' },
    {
      label: '横把位置（离磨心）',
      value: (s) => `${Math.round(s.crank.x)} mm`,
      provenance: 'calc',
    },
    { label: '横把速度', value: (s) => `${s.handVel < 0 ? '向磨 ' : '离磨 '}${Math.abs(Math.round(s.handVel))} mm/s`, provenance: 'calc' },
    {
      label: '力臂（磨心到推杆的距离）',
      value: (s) => `${Math.round(s.crank.arm)} mm / 曲柄半径 ${DIM.crankR} mm`,
      provenance: 'calc',
    },
    { label: '示踪粮粒', value: (s) => (s.showGrain ? STAGE_LABEL[s.tracer] : '已隐藏'), provenance: 'model' },
  ],
  sources,
  view: { dir: [0.55, 0.62, 1] },
  section: { normal: [0, 0, -1], offset: 0, label: '过磨心的竖直剖面' },
  audit: {
    phases: 120,
    contacts: [
      ['upper-stone', 'lower-stone'],
      ['upper-stone', 'spindle'],
      ['lower-stone', 'spindle'],
      ['crank', 'upper-stone'],
      ['push-rod', 'crank'],
      ['push-rod', 'upper-stone'],
      ['lower-stone', 'tray'],
      ['tray', 'stand'],
      ['flour', 'tray'],
      ['flour', 'lower-stone'],
    ],
  },
})
