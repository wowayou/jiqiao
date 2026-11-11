// 记里鼓车（M3）
import { defineExhibit } from '../../exhibit/types'
import { intro, sources } from './content'
import { meta } from './meta'
import { PERIOD, T_F, TEXT, frac, shangRevs, simulate, xiaRevs, zhongRevs, R, type CarControls, type CarState } from './model'
import { parts } from './parts'

const deg = (revs: number) => `${Math.round(frac(revs) * 360) % 360}°`
const fmt = (x: number, d = 1) => x.toFixed(d)

/** 原文：一周三步，三百步一里 */
const steps = (s: CarState) => s.revs * TEXT.stepsPerRev
const liBu = (s: CarState) => {
  const total = steps(s)
  const li = Math.floor(total / TEXT.oldStepsPerLi + 1e-9)
  return `${li} 里 ${fmt(total - li * TEXT.oldStepsPerLi)} 步`
}

/** 此刻在啮合推进的级：一级（立轮→下平轮）只要车在走就一直在推；二、三级只在旋风轮拨齿时推 */
export const stageActive = {
  roll: (_s: CarState) => true,
  mesh1: (_s: CarState) => true,
  mesh2: (s: CarState) => s.ang.pushing,
  mesh3: (s: CarState) => s.ang.pushing,
}

export default defineExhibit<CarState, CarControls>({
  meta,
  intro,
  controls: [{ key: 'marks', label: '显示地面刻线', kind: 'toggle' }],
  defaults: { marks: true },
  timeline: { kind: 'cyclic', period: PERIOD, speeds: [0.1, 0.25, 1, 10, 50, 200], defaultSpeed: 1 },
  simulate,
  parts,
  chain: [
    {
      id: 'roll',
      title: '足轮着地滚动',
      parts: ['wheel-left', 'wheel-right', 'marks'],
      text: '车往前走，足轮贴着地面滚。原文：足轮一周行地三步，三百步为一里——所以足轮转 100 周就是一里。',
      provenance: 'source',
      cite: 'zu',
      active: stageActive.roll,
    },
    {
      id: 'li',
      title: '立轮随左足轮同转',
      parts: ['li-lun', 'wheel-left'],
      text: '立轮固定在左足轮内侧（「附於左足」），足轮转一周，立轮也转一周。',
      provenance: 'source',
      cite: 'li',
    },
    {
      id: 'mesh1',
      title: '立轮 18 齿 → 下平轮 54 齿',
      parts: ['li-lun', 'xia-ping'],
      text: '立轮顶上的木销从下面拨动下平轮垂下的木销。18 : 54，足轮转 3 周，下平轮转 1 周。两轴互相垂直，齿是交叉相拨的圆木销（本站设定）。',
      provenance: 'calc',
      active: stageActive.mesh1,
    },
    {
      id: 'shaft1',
      title: '下平轮与旋风轮同轴',
      parts: ['guan-xin-zhou', 'xia-ping', 'xuan-feng'],
      text: '立贯心轴穿过下平轮中心，顶端是铜旋风轮：两者一起转（同轴关系按文意推定）。',
      provenance: 'reconstruction',
      cite: 'tuiding',
    },
    {
      id: 'mesh2',
      title: '旋风轮 3 齿拨中平轮 100 齿：一拨一停',
      parts: ['xuan-feng', 'zhong-ping#pins'],
      text: '旋风轮每转 1/3 周（足轮 1 周），一根拨齿扫过来，把中平轮推过一个齿距后滑脱，中平轮停住等下一根。3/100 × 1/3 = 1/100：足轮 100 周，中平轮 1 周。此环只在拨齿推着木销时点亮。',
      provenance: 'calc',
      active: stageActive.mesh2,
    },
    {
      id: 'drum-lift',
      title: '拨子顶起下层提杆',
      parts: ['bozi-zhong', 'ti-gan-xia', 'arm-lower'],
      text: '中平轮转到最后十个齿时，轮缘上的斜坡拨子从下面一点点顶高提杆，木人的槌随之举起（机构为本站设定）。',
      provenance: 'model',
      active: (s) => s.lower.lifting,
    },
    {
      id: 'drum',
      title: '一里：下层木人击鼓',
      parts: ['arm-lower', 'drum-head'],
      text: '中平轮转满一周，提杆越过拨子的坡顶落下，槌砸在鼓面上——车正好行了一里。',
      provenance: 'source',
      cite: 'ji',
      active: (s) => s.lower.striking,
    },
    {
      id: 'shaft2',
      title: '中平轮与小平轮同轴',
      parts: ['zhong-zhou', 'xiao-ping'],
      text: '小平轮装在中平轮轴上，与中平轮同转（同轴关系按文意推定）。',
      provenance: 'reconstruction',
      cite: 'tuiding',
    },
    {
      id: 'mesh3',
      title: '小平轮 10 齿 → 上平轮 100 齿',
      parts: ['xiao-ping', 'shang-ping'],
      text: '10 : 100，中平轮转 10 周（十里），上平轮转 1 周。中平轮停着时它们也停着，所以此环与「一拨一停」同时点亮。',
      provenance: 'calc',
      active: stageActive.mesh3,
    },
    {
      id: 'zhuo-lift',
      title: '拨子顶起上层提杆',
      parts: ['bozi-shang', 'ti-gan-shang', 'arm-upper'],
      text: '上平轮转到最后一里时，它的拨子把上层提杆慢慢顶高（机构为本站设定）。',
      provenance: 'model',
      active: (s) => s.upper.lifting,
    },
    {
      id: 'zhuo',
      title: '十里：上层木人击鐲',
      parts: ['arm-upper', 'zhuo'],
      text: '上平轮转满一周，上层提杆落下，木人击鐲——车行十里。这一刻下层也正好击鼓。',
      provenance: 'source',
      cite: 'ji',
      active: (s) => s.upper.striking,
    },
  ],
  readouts: [
    { label: '足轮已转', value: (s) => `${fmt(s.revs, 2)} 周`, provenance: 'calc' },
    { label: '车行（按原文：一周三步，三百步一里）', value: liBu, provenance: 'source', cite: 'zu' },
    {
      label: '离下一次击鼓',
      value: (s) => {
        const r = 100 - (s.revs % 100)
        return `足轮还差 ${fmt(r)} 周（${fmt(r * TEXT.stepsPerRev, 0)} 步）`
      },
      provenance: 'calc',
    },
    { label: '离下一次击鐲', value: (s) => `足轮还差 ${fmt(1000 - (s.revs % 1000))} 周`, provenance: 'calc' },
    { label: '足轮 / 立轮转角', value: (s) => deg(s.revs), provenance: 'calc' },
    { label: '下平轮 / 旋风轮转角', value: (s) => deg(xiaRevs(s)), provenance: 'calc' },
    {
      label: '中平轮 / 小平轮转角',
      value: (s) => `${deg(zhongRevs(s))}（第 ${Math.floor(frac(zhongRevs(s)) * 100 + 1e-9)} 齿）`,
      provenance: 'calc',
    },
    { label: '上平轮转角', value: (s) => deg(shangRevs(s)), provenance: 'calc' },
    {
      label: '此刻',
      value: (s) =>
        s.upper.striking
          ? '击鐲（并击鼓）'
          : s.lower.striking
            ? '击鼓'
            : s.ang.pushing
              ? '旋风轮正在拨中平轮'
              : '旋风轮空转，中平轮停着',
      provenance: 'calc',
    },
    {
      label: '车速（1×）',
      value: () => `${((2 * Math.PI * R.wheel) / 1000 / T_F).toFixed(2)} m/s（足轮 ${T_F} 秒一周，本站设定）`,
      provenance: 'model',
    },
  ],
  sources,
  view: { dir: [0.75, 0.45, 1] },
  section: { normal: [0, 0, -1], offset: -120, label: '沿车身纵向剖开，看下层轮系' },
  audit: {
    phases: 61,
    contacts: [
      ['wheel-left', 'axle'],
      ['wheel-right', 'axle'],
      ['li-lun', 'axle'],
      ['li-lun', 'wheel-left'],
      ['wheel-left', 'ground'],
      ['wheel-right', 'ground'],
      ['wheel-left', 'marks'],
      ['wheel-right', 'marks'],
      ['wheel-left', 'frame-lower'],
      ['wheel-right', 'frame-lower'],
      ['axle', 'frame-lower'],
      ['li-lun', 'frame-lower'],
      ['li-lun', 'xia-ping'],
      ['xia-ping', 'guan-xin-zhou'],
      ['xia-ping', 'frame-lower'],
      ['guan-xin-zhou', 'frame-lower'],
      ['xuan-feng', 'guan-xin-zhou'],
      ['xuan-feng', 'zhong-ping'],
      ['xuan-feng', 'frame-lower'],
      ['xia-ping', 'zhong-ping'],
      ['xia-ping', 'zhong-zhou'],
      ['guan-xin-zhou', 'zhong-ping'],
      ['zhong-ping', 'frame-lower'],
      ['zhong-zhou', 'frame-lower'],
      ['zhong-zhou', 'deck-1'],
      ['zhong-ping', 'zhong-zhou'],
      ['xiao-ping', 'zhong-zhou'],
      ['xiao-ping', 'shang-ping'],
      ['xiao-ping', 'zhong-ping'],
      ['shang-ping', 'zhong-ping'],
      ['shang-ping', 'zhong-zhou'],
      ['shang-ping', 'shang-zhou'],
      ['shang-zhou', 'zhong-ping'],
      ['shang-zhou', 'deck-1'],
      ['shang-ping', 'deck-1'],
      ['bozi-zhong', 'shang-ping'],
      ['bozi-zhong', 'shang-zhou'],
      ['bozi-zhong', 'ti-gan-xia'],
      ['bozi-zhong', 'frame-lower'],
      ['ti-gan-xia', 'zhong-ping'],
      ['ti-gan-xia', 'deck-1'],
      ['ti-gan-xia', 'arm-lower'],
      ['ti-gan-xia', 'drum'],
      ['ti-gan-xia', 'figure-lower'],
      ['bozi-shang', 'ti-gan-shang'],
      ['bozi-shang', 'deck-1'],
      ['ti-gan-shang', 'shang-ping'],
      ['ti-gan-shang', 'deck-1'],
      ['ti-gan-shang', 'frame-upper'],
      ['ti-gan-shang', 'arm-upper'],
      ['ti-gan-shang', 'figure-upper'],
      ['arm-lower', 'figure-lower'],
      ['arm-lower', 'drum-head'],
      ['arm-lower', 'drum'],
      ['arm-lower', 'frame-upper'],
      ['arm-upper', 'figure-upper'],
      ['arm-upper', 'zhuo'],
      ['drum', 'deck-1'],
      ['figure-lower', 'deck-1'],
      ['zhuo', 'frame-upper'],
      ['figure-upper', 'frame-upper'],
      ['frame-upper', 'deck-1'],
      ['deck-1', 'frame-lower'],
      ['yuan', 'frame-lower'],
    ],
  },
})
