// 木牛流马 · 独轮车说（机械类，复原假说）
import { defineExhibit } from '../../exhibit/types'
import { CHAIN_TEXT, STAGE_TEXT, intro, sources } from './content'
import { meta } from './meta'
import { CIRC, D_DEFAULT, D_MAX, D_MIN, GRIP, PERIOD, TOTAL_KG, simulate, type DulunControls, type DulunState } from './model'
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
      // 讲解：抬平车把这一段，货随车架绕轮轴转起来
      window: [3.6, 6.4],
    },
    {
      id: 'lift',
      title: '人抬车把（杠杆）',
      parts: ['handle', 'handle#grip', 'hand'],
      text: CHAIN_TEXT.lift,
      provenance: 'calc',
      active: hasHand,
      // 人手几乎全程在出力；讲解只看加力与抬平两段
      window: [1.6, 6.4],
    },
    {
      id: 'fulcrum',
      title: '轮轴作支点承重',
      parts: ['axle', 'axle#fulcrum', 'wheel'],
      text: CHAIN_TEXT.fulcrum,
      provenance: 'calc',
      active: hasHand,
      window: [3.6, 6.4],
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
      parts: ['legs'],
      text: CHAIN_TEXT.legs,
      provenance: 'model',
      active: (s) => s.legKg > 0.05 || s.stage === 'lower',
      view: 'legs',
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
  views: [
    {
      id: 'legs',
      label: '支脚',
      target: [-650, 280, 0],
      size: 1100,
      dir: [0.1, 0.12, 1],
      note: '从侧面平看：车把放下时支脚着地、抬起时离地',
    },
  ],
  // 实物对照：他人在 Sketchfab 上发布的真实器物三维模型（点了才加载，见 docs/AUTHORING.md「实物对照」）
  realObjects: [
    {
      uid: "bc84c709f8744a54b282d6df115106f0",
      title: "Day 236: Antique child wheelbarrow - 1scanaday",
      author: "Emm",
      authorSlug: "edemaistre",
      license: "CC BY 4.0",
      what: "一辆旧的木制儿童手推车（玩具），实物扫描。",
      differs: "这是欧式独轮车：轮在最前，货在轮与人手之间，人手要承担相当一部分重量。本展品讲的中式独轮车把货压在轮轴附近，人手省力得多——正好对照着看。它与木牛流马没有直接关系。",
    },
  ],
  traces: [
    {
      id: 'hand',
      label: '人手承担',
      unit: ' kg',
      value: (s) => s.handKg,
      provenance: 'calc',
      note: '加力时渐渐上升，抬平、推行时保持，放下后卸掉；把「货物位置」往轮轴挪，整条线变低。',
    },
    {
      id: 'legs',
      label: '支脚承担',
      unit: ' kg',
      value: (s) => s.legKg,
      provenance: 'calc',
      note: '与人手此消彼长：人手接过去多少，支脚就卸掉多少；推行时为零。',
    },
  ],
  // 车把只在抬平、放把时动，车轮只在推行时转。停着的时候去拖：跳到它开始顺着手动的那一刻（seek，模型秒）——
  // 停车时往上提车把 = 跳过「加力」直接抬；停车时推车轮 = 跳到推行。
  drive: [
    { part: 'handle', hint: '抬起 / 放下车把', anchor: [GRIP[0], GRIP[1], 0], seek: 5 },
    { part: 'wheel', hint: '推着车轮走', seek: 8 },
  ],
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
