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
  mesh1: (_s: CarState) => true,
  mesh2: (s: CarState) => s.ang.pushing,
  mesh3: (s: CarState) => s.ang.pushing,
}

export default defineExhibit<CarState, CarControls>({
  meta,
  intro,
  controls: [{ key: 'marks', label: '显示地面刻线', kind: 'toggle' }],
  defaults: { marks: true },
  timeline: {
    kind: 'cyclic',
    period: PERIOD,
    speeds: [0.1, 0.25, 1, 10, 50, 200],
    defaultSpeed: 1,
    // 足轮转一圈 T_F 秒：旋风轮拨一次中平轮（一拨一停）正好是一格
    minor: { period: T_F, unit: '圈', steps: 40 },
    moments: [
      { t: 0.4, label: '旋风轮拨中平轮' },
      { t: 100 * T_F - 0.1, label: '击鼓前一刻（一里）' },
      { t: 100 * T_F + 0.3, label: '击鼓（一里）' },
      { t: 1000 * T_F - 0.1, label: '击鐲前一刻（十里）' },
      { t: 1000 * T_F + 0.3, label: '击鐲（十里）' },
    ],
  },
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
    },
    {
      id: 'li',
      title: '立轮随左足轮同转',
      parts: ['li-lun', 'wheel-left'],
      text: '立轮固定在左足轮内侧（「附於左足」），足轮转一周，立轮也转一周。',
      provenance: 'source',
      cite: 'li',

      view: 'train',
    },
    {
      id: 'mesh1',
      title: '立轮 18 齿 → 下平轮 54 齿',
      parts: ['li-lun', 'xia-ping#pins'],
      text: '立轮顶上的木销从下面拨动下平轮垂下的木销。18 : 54，足轮转 3 周，下平轮转 1 周。两轴互相垂直，齿是交叉相拨的圆木销（本站设定）。',
      provenance: 'calc',
      active: stageActive.mesh1,

      view: 'train',
    },
    {
      id: 'shaft1',
      title: '下平轮与旋风轮同轴',
      parts: ['guan-xin-zhou', 'xia-ping', 'xuan-feng'],
      text: '立贯心轴穿过下平轮中心，顶端是铜旋风轮：两者一起转（同轴关系按文意推定）。',
      provenance: 'reconstruction',
      cite: 'tuiding',

      view: 'train',
    },
    {
      id: 'mesh2',
      title: '旋风轮 3 齿拨中平轮 100 齿：一拨一停',
      parts: ['xuan-feng', 'zhong-ping#pins'],
      text: '旋风轮每转 1/3 周（足轮 1 周），一根拨齿扫过来，把中平轮推过一个齿距后滑脱，中平轮停住等下一根。3/100 × 1/3 = 1/100：足轮 100 周，中平轮 1 周。此环只在拨齿推着木销时点亮。',
      provenance: 'calc',
      active: stageActive.mesh2,
      view: 'xuanfeng',
    },
    {
      id: 'drum-lift',
      title: '拨子顶起下层提杆',
      parts: ['bozi-zhong', 'ti-gan-xia', 'arm-lower'],
      text: '中平轮转到最后十个齿时，轮缘上的斜坡拨子从下面一点点顶高提杆，木人的槌随之举起（机构为本站设定）。',
      provenance: 'model',
      active: (s) => s.lower.lifting,
      // 足轮第 90–100 圈才发生，小循环里推导不到：快进看提杆被一点点顶高（停在落下之前）
      window: [90 * T_F, 100 * T_F - 0.2],
      view: 'lift',
    },
    {
      id: 'drum',
      title: '一里：下层木人击鼓',
      parts: ['arm-lower', 'drum-head'],
      text: '中平轮转满一周，提杆越过拨子的坡顶落下，槌砸在鼓面上——车正好行了一里。',
      provenance: 'source',
      cite: 'ji',
      active: (s) => s.lower.striking,
      // 第 100 圈：提杆越过坡顶、槌落下只有约 0.1 秒，慢放
      window: [100 * T_F - 0.4, 100 * T_F + 0.4],
      view: 'drum',
    },
    {
      id: 'shaft2',
      title: '中平轮与小平轮同轴',
      parts: ['zhong-zhou', 'xiao-ping'],
      text: '小平轮装在中平轮轴上，与中平轮同转（同轴关系按文意推定）。',
      provenance: 'reconstruction',
      cite: 'tuiding',

      view: 'train',
    },
    {
      id: 'mesh3',
      title: '小平轮 10 齿 → 上平轮 100 齿',
      parts: ['xiao-ping', 'shang-ping#pins'],
      text: '10 : 100，中平轮转 10 周（十里），上平轮转 1 周。中平轮停着时它们也停着，所以此环与「一拨一停」同时点亮。',
      provenance: 'calc',
      active: stageActive.mesh3,

      view: 'train',
    },
    {
      id: 'zhuo-lift',
      title: '拨子顶起上层提杆',
      parts: ['bozi-shang', 'ti-gan-shang', 'arm-upper'],
      text: '上平轮转到最后一里时，它的拨子把上层提杆慢慢顶高（机构为本站设定）。',
      provenance: 'model',
      active: (s) => s.upper.lifting,
      // 足轮第 900–1000 圈（最后一里）才发生：快进
      window: [900 * T_F, 1000 * T_F - 0.2],
      view: 'zhuo',
    },
    {
      id: 'zhuo',
      title: '十里：上层木人击鐲',
      parts: ['arm-upper', 'zhuo'],
      text: '上平轮转满一周，上层提杆落下，木人击鐲——车行十里。这一刻下层也正好击鼓。',
      provenance: 'source',
      cite: 'ji',
      active: (s) => s.upper.striking,
      window: [1000 * T_F - 0.4, 1000 * T_F + 0.4],
      view: 'zhuo',
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
  view: { dir: [0.8, 0.42, -1], target: [-150, 1250, 0] },
  traces: [
    {
      id: 'xuan',
      label: '旋风轮转角',
      unit: '°',
      value: (s) => frac(xiaRevs(s)) * 360,
      wrap: 360,
      provenance: 'calc',
      note: '斜直线：旋风轮与下平轮同轴，跟着足轮匀速转（足轮一圈它转 1/3 圈）。',
    },
    {
      id: 'zhong',
      label: '中平轮前进',
      unit: ' 齿',
      value: (s) => ((s.ang.zhongTeeth % 100) + 100) % 100,
      wrap: 100,
      provenance: 'calc',
      note: '一段一段地走：拨齿推着木销时斜着升一个齿（约占这一圈的六成），脱开后是平的、停着等下一根拨齿——与上面匀速的直线对照着看。',
    },
  ],
  // 抓取提示点在轮辋上（足轮局部坐标：轮面在 xz 平面，t = 0 时这一点在车头一侧）
  drive: [
    { part: 'wheel-left', hint: '推动足轮（车往前走）', anchor: [0, 0, 890] },
    { part: 'wheel-right', hint: '推动足轮（车往前走）', anchor: [0, 0, 890] },
  ],
  section: { normal: [0, -1, 0], offset: -1440, label: '水平剖开、揭去台板，从上方看轮系' },
  views: [
    {
      id: 'train',
      label: '传动链',
      target: [-300, 1250, -100],
      size: 2700,
      dir: [0.35, 1, -0.55],
      section: true,
      fade: ['wheel-left', 'wheel-right'],
      note: '剖开、揭去台板，足轮让开：从上看整串齿轮',
    },
    {
      id: 'xuanfeng',
      label: '旋风轮拨齿',
      target: [-12, 1250, -204],
      size: 150,
      // 从中平轮轮缘外侧、略高于轮缘处斜着看进去：木销垂在轮缘底下，俯视会被轮缘盖住
      dir: [0.97, 0.3, 0.15],
      // 只留到 y=1302（中平轮轮毂顶面之上一点）：揭去小平轮、上平轮，露出铜旋风轮的三根拨齿怎样拨中平轮的木销
      section: { normal: [0, -1, 0], offset: -1302, label: '水平剖开，揭去上面各层，只留旋风轮与中平轮所在的一层' },
      fade: ['wheel-left', 'wheel-right', 'frame-lower'],
      note: '揭去上层，足轮车架让开：看旋风轮拨中平轮',
    },
    {
      id: 'drum',
      label: '击鼓',
      target: [150, 1640, 540],
      size: 650,
      dir: [0.45, 0.6, -0.8],
      fade: ['frame-upper'],
      note: '上层车架让开：看下层木人的槌落在鼓面上',
    },
    {
      id: 'zhuo',
      label: '击鐲',
      target: [-300, 1880, -795],
      size: 1150,
      dir: [0.5, 0.3, -1],
      fade: ['frame-upper', 'deck-1'],
      note: '上层车架、台板让开：看上平轮的拨子顶起上层提杆、木人击鐲',
    },
    {
      id: 'lift',
      label: '提杆',
      target: [60, 1540, 575],
      size: 800,
      dir: [0.55, 0.35, 1],
      fade: ['frame-upper', 'deck-1', 'wheel-right'],
      note: '台板、右足轮让开：看中平轮缘上的拨子顶起下层提杆',
    },
  ],
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
