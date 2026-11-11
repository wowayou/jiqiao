// 木牛流马 · 独轮车说（机械类，复原假说）
import { defineExhibit } from '../../exhibit/types'
import { CHAIN_TEXT, STAGE_TEXT, intro, sources } from './content'
import { meta } from './meta'
import { CIRC, D_DEFAULT, D_MAX, D_MIN, PERIOD, TOTAL_KG, simulate, type DulunControls, type DulunState } from './model'
import { parts } from './parts'

const kg = (x: number) => `${x.toFixed(1)} kg`
const hasHand = (s: DulunState) => s.handKg > 0.05

export default defineExhibit<DulunState, DulunControls>({
  meta,
  intro,
  controls: [{ key: 'cargoD', label: '货物位置（离轮轴向后）', kind: 'range', min: D_MIN, max: D_MAX, step: 10, unit: 'mm' }],
  defaults: { cargoD: D_DEFAULT },
  timeline: { kind: 'cyclic', period: PERIOD, speeds: [0.25, 0.5, 1, 2], defaultSpeed: 1 },
  simulate,
  parts,
  chain: [
    {
      id: 'cargo',
      title: '货压在轴附近',
      parts: ['sack', 'sack#cg', 'axle#fulcrum'],
      text: CHAIN_TEXT.cargo,
      provenance: 'model',
    },
    {
      id: 'lift',
      title: '人抬车把（杠杆）',
      parts: ['handle', 'handle#grip', 'hand'],
      text: CHAIN_TEXT.lift,
      provenance: 'calc',
      active: hasHand,
    },
    {
      id: 'fulcrum',
      title: '轮轴作支点承重',
      parts: ['axle', 'axle#fulcrum', 'wheel'],
      text: CHAIN_TEXT.fulcrum,
      provenance: 'calc',
      active: hasHand,
    },
    {
      id: 'roll',
      title: '推行时轮子滚动',
      parts: ['wheel', 'marks'],
      text: CHAIN_TEXT.roll,
      provenance: 'calc',
      active: (s) => s.stage === 'push',
    },
    {
      id: 'legs',
      title: '停下时支脚落地',
      parts: ['legs', 'ground'],
      text: CHAIN_TEXT.legs,
      provenance: 'model',
      active: (s) => s.legKg > 0.05 || s.stage === 'lower',
    },
  ],
  readouts: [
    { label: '此刻', value: (s) => STAGE_TEXT[s.stage], provenance: 'model' },
    { label: '人手承担', value: (s) => kg(s.handKg), provenance: 'calc' },
    { label: '轮子承担', value: (s) => kg(s.wheelKg), provenance: 'calc' },
    { label: '支脚承担', value: (s) => kg(s.legKg), provenance: 'calc' },
    {
      label: '省力比（总重 ÷ 人手承担）',
      value: (s) => (s.ratio === null ? `—（总重 ${TOTAL_KG} kg，人手未出力）` : `${s.ratio.toFixed(1)} : 1`),
      provenance: 'calc',
    },
    {
      label: '力臂：货 / 手（水平距离）',
      value: (s) => `${Math.round(s.armCargo)} mm / ${Math.round(s.armHand)} mm`,
      provenance: 'calc',
    },
    {
      label: '车轮转角 / 已走距离',
      value: (s) => `${Math.round((s.theta * 180) / Math.PI)}° / ${Math.round(s.s)} mm（一圈 ${Math.round(CIRC)} mm）`,
      provenance: 'calc',
    },
  ],
  sources,
  view: { dir: [0.45, 0.4, 1], target: [0, 330, 0] },
  audit: {
    phases: 120,
    contacts: [
      ['wheel', 'axle'],
      ['wheel', 'frame'],
      ['wheel', 'ground'],
      ['wheel', 'marks'],
      ['wheel', 'legs'],
      ['wheel', 'sack'],
      ['wheel', 'handle'],
      ['wheel', 'front'],
      ['axle', 'frame'],
      ['axle', 'legs'],
      ['legs', 'ground'],
      ['legs', 'marks'],
      ['legs', 'frame'],
      ['sack', 'frame'],
      ['sack', 'legs'],
      ['sack', 'handle'],
      ['sack', 'ground'],
      ['sack', 'marks'],
      ['handle', 'frame'],
      ['handle', 'ground'],
      ['handle', 'legs'],
      ['front', 'frame'],
      ['front', 'ground'],
      ['frame', 'ground'],
      ['frame', 'marks'],
      ['ground', 'marks'],
    ],
  },
})
