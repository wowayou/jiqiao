// 透榫（J1，榫卯类样板展品）
import { DOF_LABEL, defineExhibit } from '../../exhibit/types'
import { intro } from './content'
import { meta } from './meta'
import { DIM, STEP_LOCKS, simulate, type JointState } from './model'
import { parts } from './parts'

const STEP_TITLE = ['榫入卯', '楔入缝']

export default defineExhibit<JointState, Record<string, never>>({
  meta,
  intro,
  controls: [],
  defaults: {},
  timeline: { kind: 'assembly', duration: 6, speeds: [0.25, 0.5, 1, 2], defaultSpeed: 1 },
  simulate: (t) => simulate(t),
  parts,
  chain: [
    {
      id: 'tenon-in',
      title: '榫入卯',
      parts: ['rail#tenon', 'post#mortise', 'rail#shoulder'],
      text: '横料的榫头穿过立料的卯眼，直到榫肩抵住立料。之后：上下、前后被卯眼四壁挡住，三个方向的转动也被挡住；往里推被榫肩挡住。只剩沿原路往外拔这一个方向还是自由的。',
      provenance: 'calc',
      locks: STEP_LOCKS[0],
      locksProvenance: 'calc',
      active: (s) => s.p < 0.5,
    },
    {
      id: 'wedge-in',
      title: '楔入缝',
      parts: ['wedge', 'rail#kerf', 'post#flare'],
      text: '从露头的一面把楔打进榫头端部的锯缝。在真实木料中，楔把榫头末端上下撑开，填满外大里小的卯眼出口段，榫头成了里小外大的形状，往外拔就被卯眼卡住——最后一个方向也锁住了。',
      provenance: 'reconstruction',
      locks: STEP_LOCKS[1],
      locksProvenance: 'reconstruction',
      active: (s) => s.p >= 0.5 && s.p < 1,
    },
    {
      id: 'why',
      title: '模型说明：撑开的榫头在哪里',
      parts: ['post#flare', 'wedge'],
      text: '刚体模型画不出木头的变形。打开剖切可以看到：卯眼出口上下各有一道三角空隙——真实木料里，被楔撑开的榫头正好填满这里。也因此，在本模型里把横料连同楔一起往外拉，几何上并不会被挡住（测试如实记录了这一点）。',
      provenance: 'model',
      active: (s) => s.p >= 1,
    },
  ],
  readouts: [
    { label: '装配进度', value: (s) => `${Math.round(s.p * 100)}%`, provenance: 'calc' },
    { label: '当前步骤', value: (s) => (s.p >= 1 ? '完成' : `第 ${s.step + 1} 步：${STEP_TITLE[s.step]}`), provenance: 'calc' },
    { label: '榫头入卯深度', value: (s) => `${s.tenonDepth.toFixed(0)} / ${DIM.post[0]} mm`, provenance: 'calc' },
    { label: '榫头露出', value: (s) => `${s.protrusion.toFixed(0)} mm`, provenance: 'calc' },
    { label: '楔入深度', value: (s) => `${s.wedgeDepth.toFixed(0)} / ${DIM.kerf.depth} mm`, provenance: 'calc' },
    {
      label: '已锁住（相对立料）',
      value: (s) => (s.locked.length === 0 ? '无' : `${s.locked.length}/9：${s.locked.map((d) => DOF_LABEL[d]).join('、')}`),
      provenance: 'calc',
    },
  ],
  sources: {},
  view: { dir: [-0.45, 0.35, 1], target: [40, 0, 0] },
  section: { normal: [0, 0, -1], offset: 0, label: '过榫头中线的竖直剖面（看楔与出口放大段）' },
})
