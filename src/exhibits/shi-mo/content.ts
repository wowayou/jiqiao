// 石磨的全部文字。史料只引 docs/sources/shi-mo.md 中核实过的原文；其余按实标注。
import type { Claim, FeatureDef, SourceRef } from '../../exhibit/types'

const FILE = 'docs/sources/shi-mo.md'

export const sources: Record<string, SourceRef> = {
  names: {
    title: '王祯《农书》卷十六「磨」：部位名',
    file: FILE,
    quote: '今又謂主磨曰臍，注磨曰眼，轉磨曰榦，承磨曰槃，載磨曰床',
  },
  feed: {
    title: '王祯《农书》卷十六「磨」：进料与磨齿',
    file: FILE,
    quote: '上皆用漏斗盛麥，下之眼中，則利齒旋轉',
  },
  product: {
    title: '王祯《农书》卷十六「磨」：出料',
    file: FILE,
    quote: '破麥作麩，然後收之篩羅，乃得成麵',
  },
  power: {
    title: '王祯《农书》卷十六「磨」：动力',
    file: FILE,
    quote: '多用畜力挽行；或借水輪',
  },
  shiben: {
    title: '王祯《农书》卷十六「磨」引《世本》',
    file: FILE,
    quote: '《世本》曰：“公輸班作磑。”',
  },
}

export const intro: Claim[] = [
  {
    text: '石磨把粮食磨碎：上扇在下扇上转动，两扇磨面上的沟槽（磨齿）把粮粒剪碎、碾细，再把碎料赶到边缘落下。',
    provenance: 'reconstruction',
  },
  {
    text: '元代王祯《农书》说磨「多用畜力挽行；或借水輪」——多用牲口拉，也有借水轮转动的。',
    provenance: 'source',
    cite: 'power',
  },
  {
    text: '本展品演示人力推磨：人往复推拉一根推杆，推杆挂在上扇侧面的磨拐上。这种形制是民间通行做法的示意，各部尺寸都是本站设定。',
    provenance: 'model',
  },
  {
    text: '王祯引《世本》「公輸班作磑」，这是传说，不能当作石磨起源的史实。',
    provenance: 'source',
    cite: 'shiben',
  },
]

type PartText = { name: string; role: string; claims?: Claim[]; features?: FeatureDef[] }

export const PART_TEXT: Record<'stand' | 'tray' | 'flour' | 'lower-stone' | 'spindle' | 'upper-stone' | 'crank' | 'push-rod' | 'grain', PartText> = {
  stand: {
    name: '磨架（床）',
    role: '托起磨盘和两扇磨，让磨面停在便于推磨的高度。',
    claims: [
      { text: '王祯：「載磨曰床」——承载整盘磨的架子叫床。', provenance: 'source', cite: 'names' },
      { text: '四腿木架的形制与尺寸为本站设定。', provenance: 'model' },
    ],
  },
  tray: {
    name: '磨盘（槃）',
    role: '承托下扇，并接住从两扇缝隙里挤出来的碎料。',
    claims: [
      { text: '王祯：「承磨曰槃」——承托磨的叫槃。', provenance: 'source', cite: 'names' },
      { text: '本模型把槃做成带一圈边沿的石盘，兼作承粉槽；这一形制为本站设定。', provenance: 'model' },
    ],
  },
  flour: {
    name: '磨下的碎料（麸）',
    role: '示意磨出来、落在磨盘里的碎料。',
    claims: [
      { text: '王祯：磨把麦「破麥作麩，然後收之篩羅，乃得成麵」——磨出来的是麸，要再过筛罗才成面。', provenance: 'source', cite: 'product' },
    ],
  },
  'lower-stone': {
    name: '下扇',
    role: '固定不动的下层磨石；顶面刻有磨齿，中心装磨脐。',
    features: [
      {
        id: 'teeth',
        name: '下扇磨齿',
        role: '顶面的八区斜沟；与上扇的磨齿交错，像剪刀一样剪碎粮粒。',
        anchor: [180, 130, 0],
        claims: [
          { text: '王祯只说「利齒旋轉」，没有记载磨齿的纹样。', provenance: 'source', cite: 'feed' },
          { text: '八区、每区平行斜沟、齿距 26 mm、沟深 6 mm、斜度 30°，均为本站设定。', provenance: 'model' },
        ],
      },
    ],
  },
  spindle: {
    name: '磨脐',
    role: '立在下扇中心的铁轴，上扇套在它上面转动，保持两扇同心。',
    claims: [
      { text: '王祯：「主磨曰臍」——磨的中轴叫脐。', provenance: 'source', cite: 'names' },
      { text: '铁制、直径 30 mm 为本站设定。', provenance: 'model' },
    ],
  },
  'upper-stone': {
    name: '上扇',
    role: '转动的上层磨石；底面刻磨齿，开有磨眼，自身的重量与惯性让转动连续。',
    features: [
      {
        id: 'eye',
        name: '磨眼',
        role: '贯穿上扇的进料孔，粮食由此落到两扇之间。',
        anchor: [-110, 150, 0],
        claims: [
          { text: '王祯：「注磨曰眼」——往磨里注料的孔叫眼。', provenance: 'source', cite: 'names' },
          { text: '磨眼偏离中心（中心被磨脐占着）、只开一个，为本站设定。', provenance: 'model' },
        ],
      },
      {
        id: 'teeth',
        name: '上扇磨齿',
        role: '底面的斜沟；上扇翻过来扣在下扇上，两扇的斜沟方向相反、交叉成剪刀口。',
        anchor: [-150, 0, -170],
        claims: [{ text: '纹样同下扇，为本站设定。', provenance: 'model' }],
      },
      {
        id: 'dish',
        name: '顶面浅盘',
        role: '盛放待磨的粮食。',
        anchor: [120, 140, 120],
        claims: [
          { text: '王祯说磨「上皆用漏斗盛麥，下之眼中」——上面用漏斗盛麦，往下落进磨眼。', provenance: 'source', cite: 'feed' },
          { text: '本模型省略了漏斗，以顶面浅盘代替。', provenance: 'model' },
        ],
      },
      {
        id: 'hollow',
        name: '磨膛',
        role: '底面中心的浅锥形空腔，粮粒先落到这里再被带进磨齿。',
        anchor: [0, 6, 0],
        claims: [{ text: '磨膛的形状与尺寸为本站设定。', provenance: 'model' }],
      },
    ],
  },
  crank: {
    name: '磨拐',
    role: '插在上扇侧面的横木，外端立一根木橛；推杆套在木橛上，推拉的力从这里变成转动上扇的力矩。',
    claims: [
      { text: '在曲柄滑块机构里它相当于「曲柄」，木橛相当于曲柄销；木橛到磨心 360 mm 即曲柄半径（本站设定）。', provenance: 'model' },
    ],
  },
  'push-rod': {
    name: '推杆',
    role: '人握住末端的横把往复推拉；推杆把直线往复变成磨拐的圆周运动。',
    claims: [
      { text: '王祯：「轉磨曰榦」——使磨转动的杆叫榦。', provenance: 'source', cite: 'names' },
      { text: '推杆长 1200 mm、末端横把、高度保持水平，均为本站设定；民间推磨常把推杆用绳吊在梁上，本模型未画梁和绳。', provenance: 'model' },
    ],
  },
  grain: {
    name: '粮粒（示意）',
    role: '演示粮食从顶面落进磨眼、在两扇之间被赶向边缘、最后落进磨盘的路线。',
    claims: [{ text: '粒径放大约四倍以便看清；路线与速度为本站设定的示意，不是颗粒力学仿真。', provenance: 'model' }],
  },
}
