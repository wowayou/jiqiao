// 摆钟的全部文字。docs/sources/ 里没有钟表史料，所以本展品没有任何「史料」陈述：
// 原理性的说明标「通行复原」（钟表学的通行做法），尺寸、齿数、齿形标「本站设定」，由模型算出的标「计算所得」并有测试。
import type { Claim, FeatureDef, SourceRef } from '../../exhibit/types'

export const sources: Record<string, SourceRef> = {}

export const intro: Claim[] = [
  {
    text: '重锤往下坠的力是连续的；摆却只肯一下一下地「放行」。擒纵机构夹在两者之间：摆每摆过一次，擒纵轮被放过半个齿，走时轮系就跟着走一小步。指针的匀速，其实是很多等时的小步。',
    provenance: 'reconstruction',
  },
  {
    text: '本展品是一台秒摆（摆一次 1 秒）的锚式擒纵摆钟，擒纵取直进式（锁住时擒纵轮完全不动、不回退）。机芯布局、各轮齿数与尺寸都是本站设定，不对应某一台具体的历史钟。',
    provenance: 'model',
  },
  {
    text: '擒纵轮每一时刻的转角不是照剧本摆的：模型按擒纵叉此刻的角度，求出齿尖在驱动力矩下往前能走到哪里才被叉瓦挡住；锁、冲击、落三个阶段都是这个几何求解自然得出的。',
    provenance: 'calc',
  },
  {
    text: '时间轴的一个周期取 12 小时：时针恰好走一圈，所有轮子回到原相位。慢放（0.05×）看一个节拍，快放（数千倍）看指针怎么走。重锤的下降在周期末尾的 30 分钟里被提回原高（演示上弦），所以周期首尾完全一致。',
    provenance: 'model',
  },
]

export type PartId =
  | 'backboard'
  | 'wall-posts'
  | 'back-plate'
  | 'pillars'
  | 'front-plate'
  | 'pendulum'
  | 'bob'
  | 'weight'
  | 'cord'
  | 'great-wheel'
  | 'barrel'
  | 'center-wheel'
  | 'third-wheel'
  | 'escape-wheel'
  | 'anchor'
  | 'pallet-entry'
  | 'pallet-exit'
  | 'cannon'
  | 'minute-wheel'
  | 'hour-wheel'
  | 'dial'
  | 'dial-marks'
  | 'hour-hand'
  | 'minute-hand'
  | 'second-hand'

type PartText = { name: string; role: string; claims?: Claim[]; features?: FeatureDef[] }

const GEAR_FORM: Claim = {
  text: '齿形为渐开线、压力角 20°；8 齿小齿轮正变位 0.6、齿顶高系数 0.75（避免根切与齿顶变尖），配对大轮负变位 0.6，中心距仍为标准值。均为本站设定；真实钟表多用摆线齿形。',
  provenance: 'model',
}

export const PART_TEXT: Record<PartId, PartText> = {
  backboard: {
    name: '背板',
    role: '挂在墙上的木板，机芯通过挂柱固定在它前面，摆在它和机芯之间摆动。',
    claims: [{ text: '拱顶木背板的形制与尺寸为本站设定，省略了钟壳。', provenance: 'model' }],
  },
  'wall-posts': {
    name: '挂柱',
    role: '把后夹板撑离背板，给摆留出空间。',
    claims: [{ text: '四根铁柱、长 52 mm 为本站设定。', provenance: 'model' }],
  },
  'back-plate': {
    name: '后夹板',
    role: '与前夹板一起夹住各轮的轴，轴的两端在夹板的孔里转动。',
    claims: [
      { text: '夹板做成镂空框架，是为了让观众看见轮系；真实钟表多用整块夹板。', provenance: 'model' },
      { text: '轴与孔的半径间隙 0.3 mm 为本站设定。', provenance: 'model' },
    ],
  },
  pillars: {
    name: '夹板柱',
    role: '撑在前后夹板之间，定住两块夹板的距离（70 mm）。',
    claims: [{ text: '尺寸为本站设定。', provenance: 'model' }],
  },
  'front-plate': {
    name: '前夹板',
    role: '支撑各轮轴的前端；前面装着过轮的轴钉和表盘脚。',
    claims: [{ text: '镂空框架形制为本站设定。', provenance: 'model' }],
  },
  pendulum: {
    name: '摆杆',
    role: '把摆锤挂在擒纵叉的轴上：摆与擒纵叉同角度摆动。',
    claims: [
      { text: '本模型把摆直接固定在擒纵叉轴上，省去了常见的悬簧与叉杆（拨叉）；两者只是连接方式不同，摆与叉同步摆动这一点不变。', provenance: 'model' },
      { text: '摆幅取 ±4°（本站设定）。', provenance: 'model' },
    ],
  },
  bob: {
    name: '摆锤',
    role: '摆的质量主要集中在这里；它到悬点的距离决定摆的周期。',
    claims: [
      { text: '按单摆近似，周期 T = 2π√(L/g)：要每摆一次 1 秒（T = 2 s），摆长 L ≈ 993.6 mm（g 取 9806.65 mm/s²）。', provenance: 'calc' },
      { text: '摆长变为 4 倍，周期变为 2 倍：周期只由摆长决定，与摆锤轻重无关。', provenance: 'calc' },
      { text: '等时性只在小摆幅下近似成立：4° 摆幅比无穷小摆幅慢约 0.03%，2° 与 4° 摆幅之间的差约 0.02%（一天约十几秒）。模型里的摆按简谐运动处理。', provenance: 'calc' },
      { text: '透镜形黄铜摆锤、直径 124 mm 为本站设定。', provenance: 'model' },
    ],
  },
  weight: {
    name: '重锤',
    role: '整台钟唯一的能量来源：它往下坠，绳子拉着绳轮转，力矩沿轮系一路传到擒纵轮。',
    claims: [
      { text: '绳轮半径约 35 mm，大轮 12 小时转一圈，所以重锤 12 小时下降约 222 mm。', provenance: 'calc' },
      { text: '重锤只在冲击和落的时候往下走一点，锁住的时候一动不动——能量是被一份一份放出去的。', provenance: 'calc' },
      { text: '绳长的变化用「绳子插进锤体中心孔」来示意；锤重与尺寸为本站设定。', provenance: 'model' },
    ],
  },
  cord: {
    name: '绳',
    role: '一端缠在绳轮上，一端吊着重锤。',
    claims: [{ text: '示意物：长度固定，下端藏在锤体的孔里。', provenance: 'model' }],
  },
  'great-wheel': {
    name: '大轮（96 齿）',
    role: '轮系的第一级：与绳轮同轴，被重锤拉着转，带动中心轴的 8 齿小齿轮。',
    claims: [
      { text: '96 ÷ 8 = 12：大轮转 1 圈，中心轴（分针）转 12 圈，即大轮 12 小时一圈。', provenance: 'calc' },
      { ...GEAR_FORM },
    ],
  },
  barrel: {
    name: '绳轮与棘轮',
    role: '缠绳的鼓轮。走时时与大轮一起转；上弦时借棘轮单向倒转，把绳卷回去、把重锤提起。',
    claims: [
      { text: '棘爪与上弦的保持力机构（上弦时仍给轮系供力）在本模型中省略未画；上弦期间走时不受影响是模型的理想化。', provenance: 'model' },
      { text: '木鼓轮与 24 齿棘轮的形制为本站设定。', provenance: 'model' },
    ],
  },
  'center-wheel': {
    name: '中心轮组（8 齿轴 + 64 齿轮）',
    role: '中心轴每小时转一圈：前端带分针，后端的 8 齿小齿轮被大轮带动，中间的 64 齿轮去带三轮。',
    claims: [{ text: '中心轴 1 小时 1 圈 = 擒纵轮转速的 1/60：(8/64)·(8/60) = 1/60。', provenance: 'calc' }, { ...GEAR_FORM }],
  },
  'third-wheel': {
    name: '三轮（8 齿轴 + 60 齿轮）',
    role: '中间一级：把中心轮的慢转加速，传给擒纵轮。',
    claims: [{ text: '64/8 × 60/8 = 8 × 7.5 = 60：中心轴转 1 圈，擒纵轮转 60 圈。', provenance: 'calc' }, { ...GEAR_FORM }],
  },
  'escape-wheel': {
    name: '擒纵轮（30 齿，带秒针）',
    role: '被重锤的力推着往前转，却被叉瓦一下一下挡住；每个摆动周期恰好放过 1 个齿。它的轴穿出表盘带秒针。',
    claims: [
      { text: '30 齿、摆周期 2 s：每 2 s 前进 1 齿，60 s 恰好转一圈——所以秒针可以直接装在擒纵轮轴上。', provenance: 'calc' },
      { text: '齿形（尖齿、前齿面前倾 14°、齿尖半径 45 mm）为本站设定。', provenance: 'model' },
    ],
    features: [
      {
        id: 'teeth',
        name: '尖齿',
        role: '只有齿尖与叉瓦接触：齿尖抵在锁面上被锁住，滑过冲击面时推叉。前齿面向前倾，避免整面贴上锁面。',
        anchor: [0, 45, -26.5],
        claims: [{ text: '前倾角与齿根宽为本站设定。', provenance: 'model' }],
      },
    ],
  },
  anchor: {
    name: '擒纵叉',
    role: '形如船锚，跨在擒纵轮上方，与摆一起摆动；两臂末端各装一块叉瓦。',
    claims: [
      { text: '两叉瓦跨 7.5 个齿；叉轴放在两侧锁住的齿尖处轮缘切线的交点上，所以锁住时齿尖正对叉轴推、锁面与齿尖圆正交——这是直进式「锁住不回退」的几何条件。', provenance: 'calc' },
      { text: '直进式：锁面是以叉轴为圆心的圆弧，叉在锁面上滑动时轮子既不前进也不后退；回退式擒纵的锁面不是这样的圆弧，锁住期间轮子会被推得倒退一点。', provenance: 'reconstruction' },
    ],
  },
  'pallet-entry': {
    name: '入瓦',
    role: '左侧叉瓦（从表盘一侧看）。擒纵轮顺时针转，齿从左边进入两叉瓦之间时先碰它。外侧圆弧是锁面，下端斜面是冲击面。',
    claims: [
      { text: '冲击面让叉多转 2.4°、让擒纵轮前进 4.5°；放开角 −0.8°、锁深 0.8°、锁面长 4.5°（叉角），均为本站设定。', provenance: 'model' },
    ],
    features: [
      { id: 'lock', name: '入瓦锁面', role: '以叉轴为圆心的外侧圆弧：齿尖抵在这里，轮子被锁住。', anchor: [-31, -31, -26.5] },
      { id: 'impulse', name: '入瓦冲击面', role: '下端的斜面：齿尖滑过它时把叉往前推一把。', anchor: [-33, -34, -26.5] },
    ],
  },
  'pallet-exit': {
    name: '出瓦',
    role: '右侧叉瓦（从表盘一侧看），齿从右边离开两叉瓦之间时由它挡住。内侧圆弧是锁面，下端斜面是冲击面。',
    claims: [{ text: '尺寸与入瓦对称设计，冲击与锁深相同（本站设定）。', provenance: 'model' }],
    features: [
      { id: 'lock', name: '出瓦锁面', role: '以叉轴为圆心的内侧圆弧：齿尖从里往外顶在这里，轮子被锁住。', anchor: [31, -31, -26.5] },
      { id: 'impulse', name: '出瓦冲击面', role: '下端的斜面：齿尖滑过它时把叉往回推一把。', anchor: [33, -34, -26.5] },
    ],
  },
  cannon: {
    name: '跨轮管（12 齿）',
    role: '套在中心轴上随它转，前端装分针；它的 12 齿带动过轮。',
    claims: [{ text: '12 齿、模数 1、变位 +0.4（本站设定）。', provenance: 'model' }],
  },
  'minute-wheel': {
    name: '过轮（36 齿 + 8 齿）',
    role: '套在前夹板的轴钉上，把分针的转动减速 12 倍交给时轮。',
    claims: [{ text: '(12/36)·(8/32) = 1/12：分针转 12 圈，时针转 1 圈。', provenance: 'calc' }],
  },
  'hour-wheel': {
    name: '时轮（32 齿）',
    role: '套在跨轮管外面，12 小时转一圈，前端装时针。',
    claims: [{ text: '32 齿、模数 1.2（本站设定）。', provenance: 'model' }],
  },
  dial: {
    name: '表盘',
    role: '时圈与秒圈。中间镂空，好看见后面的轮系。',
    claims: [{ text: '镂空的时圈（外径 300 mm）为本站设定；真实摆钟多为整块表盘。', provenance: 'model' }],
  },
  'dial-marks': {
    name: '刻度',
    role: '时圈上的 12 个时标与 60 个分刻度，秒圈上的 12 个刻度。',
  },
  'hour-hand': {
    name: '时针',
    role: '12 小时转一圈。',
    claims: [{ text: '时针转速 = 秒针的 1/720。', provenance: 'calc' }],
  },
  'minute-hand': {
    name: '分针',
    role: '1 小时转一圈。',
    claims: [{ text: '分针转速 = 秒针的 1/60。', provenance: 'calc' }],
  },
  'second-hand': {
    name: '秒针',
    role: '装在擒纵轮轴上，60 秒一圈；每秒跳一下，跳的那一下就是一次冲击加一次落。',
    claims: [{ text: '秒针每次跳 6°：半个齿距（12° ÷ 2）。', provenance: 'calc' }],
  },
}
