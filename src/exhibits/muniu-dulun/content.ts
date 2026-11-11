// 木牛流马 · 独轮车说的全部文字。
// 史料只引 docs/sources/muniu-liuma.md 与 docs/sources/shiwu-jiyuan.md 里核实过的原文，且逐字照录。
// 木牛流马究竟是什么，史料没有定论：这里是一种复原假说。车的形制、尺寸、重量、节奏全是本站设定。
import type { Claim, FeatureDef, SourceRef } from '../../exhibit/types'
import {
  BETA0,
  CARGO_KG,
  CIRC,
  D_DEFAULT,
  D_MAX,
  D_MIN,
  GRIP,
  PERIOD,
  SELF_ARM,
  SELF_KG,
  TOTAL_KG,
  WHEEL_R,
} from './model'

const LIU = 'docs/sources/muniu-liuma.md'
const SHI = 'docs/sources/shiwu-jiyuan.md'

export const sources: Record<string, SourceRef> = {
  gaocheng: {
    title: '宋 高承《事物紀原》卷八「小車」条（原文无标点）',
    file: SHI,
    quote: '木牛即今小車之有前轅者流馬即今獨推者是而民間謂之江州車子',
  },
  yi: {
    title: '宋 高承《事物紀原》卷八「小車」条：高承自己的推测',
    file: SHI,
    quote: '疑亮之創始作之於江州縣當時云然故後人以為名也',
  },
  daozu: {
    title: '宋 高承《事物紀原》卷八「小車」条：为何造木牛流马',
    file: SHI,
    quote: '蓋巴蜀道阻便於登陟故耳',
  },
  yun: {
    title: '裴松之注引《亮集》「作木牛流馬法」：载量与行程',
    file: LIU,
    quote: '載一歲糧，日行二十里，而人不大勞',
  },
  yuan: {
    title: '裴松之注引《亮集》「作木牛流馬法」：双辕',
    file: LIU,
    quote: '牛仰雙轅，人行六尺，牛行四步',
  },
  jiao: {
    title: '裴松之注引《亮集》「作木牛流馬法」：一脚四足',
    file: LIU,
    quote: '一腳四足',
  },
  nan1: {
    title: '裴松之注引《亮集》：尺寸之数里难解的句子之一',
    file: LIU,
    quote: '後杠與等版方囊二枚',
  },
  nan2: {
    title: '裴松之注引《亮集》：尺寸之数里难解的句子之二',
    file: LIU,
    quote: '形制如象',
  },
  qiyi: {
    title: '陈寿《三国志·诸葛亮传》传末评语',
    file: LIU,
    quote: '木牛流馬，皆出其意',
  },
}

export const intro: Claim[] = [
  {
    text: '先说明白：木牛流马究竟是什么，史料没有定论。本展品演示的「独轮车说」只是其中一种复原假说，不是史实；另一种说法是「步行机构说」，见相关展品。下面先摆出这一说的依据和弱点。',
    provenance: 'hypothesis',
  },
  {
    text: '依据：宋代高承《事物纪原》「小车」条写道：「木牛即今小車之有前轅者流馬即今獨推者是而民間謂之江州車子」（原文无标点）。意思大致是：木牛就是如今带前辕的小车，流马就是如今一个人推的那种。',
    provenance: 'source',
    cite: 'gaocheng',
  },
  {
    text: '弱点之一：这句话里没有「輪」字。「獨推」字面只是一个人推，说成「独轮」是后人的解读；高承也没有给出尺寸或构造，「小車」只是类比，不是复原。',
    provenance: 'source',
    cite: 'gaocheng',
  },
  {
    text: '弱点之二：高承是宋代人，距诸葛亮约八百年，这是后世的解释，不是三国时的记载；对来历他自己也只用「疑」字：「疑亮之創始作之於江州縣當時云然故後人以為名也」。',
    provenance: 'source',
    cite: 'yi',
  },
  {
    text: '弱点之三：高承把「木牛」（带前辕的小车）和「流马」（独推者）分开说，本展品只做一辆车，把前辕和独推放在同一辆上，这是本站的取舍。',
    provenance: 'model',
  },
  {
    text: '史料里能直接引的只有这些：裴松之注引《亮集》说木牛「載一歲糧，日行二十里，而人不大勞」。这是原文的说法，本站无法验证，也不据此给任何载重、速度的数字。',
    provenance: 'source',
    cite: 'yun',
  },
  {
    text: '《亮集》里关于形制的话，如「牛仰雙轅，人行六尺，牛行四步」，其中的「雙轅」是否就是本展品这样的前辕，原文没有说明；「一腳四足」所指也不明，不能直接读成一个轮子。',
    provenance: 'source',
    cite: 'yuan',
  },
  {
    text: '《亮集》的尺寸之数里还有「後杠與等版方囊二枚」「形制如象」这样的句子，文字本身就不通顺，无法据此画出确定的结构图。所以本站的车不是按那些尺寸造的，车的全部尺寸都是本站设定。',
    provenance: 'source',
    cite: 'nan1',
  },
  {
    text: '本展品要讲的机械道理：独轮车是一根杠杆。轮轴是支点，货压在轮轴附近，人在车把末端只需抬起一小部分重量；路再窄，一个轮子也过得去。拖动「货物位置」，货越靠近轮轴，读数里的人手承担就越小。',
    provenance: 'calc',
  },
  {
    text: `传动链：人抬车把（杠杆）→ 轮轴作支点承重 → 推行时轮子滚动 → 停下时支脚落地。货重 ${CARGO_KG} kg、车自重 ${SELF_KG} kg、轮半径 ${WHEEL_R} mm、一圈 ${PERIOD} s 的节奏，以及车的各部形制，全是本站设定。`,
    provenance: 'model',
  },
]

type PartText = { role: string; claims?: Claim[]; features?: FeatureDef[] }
const ge = (m: number) => Math.round((m * 180) / Math.PI)

export const PART_TEXT = {
  ground: {
    role: '托住车和轮子的地面。',
    claims: [{ text: '地面的范围与厚度为本站设定，只用来表示车走在地上；它也是支脚落地、车轮滚动的参照。', provenance: 'model' }],
  } as PartText,
  marks: {
    role: '地面上的石条。车原地不动，石条往后移，表示车在往前走。',
    claims: [
      {
        text: `为了让车不开出画面，推行时车留在原地，石条往后退。石条间距是轮周长的 1/6，推行一圈（${Math.round(CIRC)} mm）石条正好退回原样，周期闭合。`,
        provenance: 'model',
      },
    ],
  } as PartText,
  frame: {
    role: '两根纵梁夹着车轮，横档把它们连成一体，两侧的货板托住粮袋；纵梁在轮轴处开盲孔插轴。',
    claims: [
      {
        text: '纵梁、横档、货板的形制与尺寸为本站设定。纵梁在轮轴处只开盲孔，离外侧面还留约 9 mm，轴不穿出来，货板才能整块铺平。',
        provenance: 'model',
      },
      { text: '《事物纪原》只说「小車」，没有说车架怎样做。车轮夹在两根纵梁之间，是本展品的假说性画法。', provenance: 'hypothesis' },
    ],
  } as PartText,
  axle: {
    role: '穿过轮毂、两端插在纵梁里的铁轴。它不转，是车架绕着它转的支点，也是车轮转动的轴。',
    claims: [
      { text: '轮轴的粗细、材质（铁）与固定方式为本站设定；轮毂孔比轴大 2.5 mm，作为转动配合的间隙。', provenance: 'model' },
      { text: '独轮车是一根杠杆：轮轴就是支点。人手抬车把时，车架绕着它转。', provenance: 'calc' },
    ],
    features: [
      {
        id: 'fulcrum',
        name: '支点',
        role: '杠杆的支点：人手、货物对它的力矩相互平衡。',
        anchor: [0, 0, 150],
        claims: [{ text: '力矩平衡以轮轴中心为转轴，货物与人手到它的水平距离就是力臂。', provenance: 'calc' }],
      },
    ],
  } as PartText,
  wheel: {
    role: '套在轮轴上的独轮：推行时滚动，一个轮子承担大部分重量。',
    claims: [
      {
        text: `轮半径 ${WHEEL_R} mm、八根辐条（四根过心的木条）、轮辋与轮毂的尺寸都是本站设定。`,
        provenance: 'model',
      },
      {
        text: `车轮不打滑：轮子转过的角度 = 走过的距离 ÷ 轮半径，推行一圈（${Math.round(CIRC)} mm）轮子恰好转一整圈。`,
        provenance: 'calc',
      },
      { text: '「獨推」并没有写明是几个轮；独轮是后人的解读，也是本展品假说的核心。', provenance: 'hypothesis' },
    ],
  } as PartText,
  legs: {
    role: '车架后部下方的两根短脚。停车时落地撑住车尾，推行时随车架抬起、离开地面。',
    claims: [
      {
        text: `支脚的位置与长度为本站设定：停车时车架后倾 ${ge(BETA0)}°，两只脚正好平放在地上；抬平后脚离地约 120 mm。`,
        provenance: 'model',
      },
      { text: '史料没有提到支脚；这是为了让车能自己立住而加的设定。', provenance: 'hypothesis' },
    ],
  } as PartText,
  handle: {
    role: '车把：人握在末端向上抬，车架就绕轮轴转。',
    claims: [
      {
        text: `车把是从纵梁后端起翘的两根圆杆，握持处在轴后约 ${Math.abs(GRIP[0])} mm、比轴高 ${GRIP[1]} mm 处。尺寸与榫接方式为本站设定。`,
        provenance: 'model',
      },
      { text: '人手到轮轴的水平距离越长，同样的力矩只需要越小的力。', provenance: 'calc' },
    ],
    features: [
      {
        id: 'grip',
        name: '握持处',
        role: '人手向上抬的施力点。',
        anchor: [GRIP[0], GRIP[1], 0],
        claims: [{ text: '读数里的「人手承担」就是这一点所需的向上力。', provenance: 'calc' }],
      },
    ],
  } as PartText,
  front: {
    role: '前辕：从纵梁前端向前伸出的两根杆，前端连一根横木。',
    claims: [
      {
        text: '《事物纪原》说木牛是「小車之有前轅者」，所以本展品画了前辕。前辕的长度、粗细与接法是本站设定；高承并没有说前辕的样子。',
        provenance: 'hypothesis',
      },
    ],
  } as PartText,
  sack: {
    role: '两个粮袋，压在车轮两侧的货板上。拖动控件可改变它们离轮轴的距离。',
    claims: [
      {
        text: `两袋合计 ${CARGO_KG} kg（本站设定，折合质量）。袋的形状是椭球削平底面的示意。货物中心可在轴后 ${D_MIN}–${D_MAX} mm 之间调，默认 ${D_DEFAULT} mm。`,
        provenance: 'model',
      },
      { text: '货越靠近轮轴，货物重力对轮轴的力臂越短，人手需要抬的力越小；读数由力矩平衡算出。', provenance: 'calc' },
    ],
    features: [
      {
        id: 'cg',
        name: '重心',
        role: '计算力矩时取的货物重心（椭球中心）。',
        anchor: [0, 0, 0],
      },
    ],
  } as PartText,
  hand: {
    role: '示意人手向上抬车把的位置：人手出力时才出现。不画人物。',
    claims: [{ text: '只是一个示意箭头，位置在车把末端握持处下方；箭头大小不代表力的大小。', provenance: 'model' }],
  } as PartText,
}

/** 协同链各环的文字，供 index.ts 使用 */
export const CHAIN_TEXT = {
  cargo: `两个粮袋压在车轮两侧的货板上，货物重力作用点在轮轴后 d 处。d 是控件「货物位置」，范围 ${D_MIN}–${D_MAX} mm；车自重（${SELF_KG} kg）重心取在轴后 ${SELF_ARM} mm（本站设定）。`,
  lift: '人握住车把末端向上抬。车架是一根杠杆：货物与车自重对轮轴的力矩，由人手向上的力对轮轴的力矩来平衡，人手力 × 手到轴的距离 = 货重 × 货到轴的距离（再加车自重）。',
  fulcrum: `轮轴是支点，承担其余的重量：轮子承担 = 总重（${TOTAL_KG} kg）− 人手承担 −（停车时）支脚承担。货越靠近轴，人手承担越少，轮子承担越多。`,
  roll: `推行时车轮在地上滚动，不打滑：车轮转角 = 走过的距离 ÷ 轮半径。车原地不动，地面石条往后退来表示前进；推行一圈（${Math.round(CIRC)} mm）轮子恰好转一整圈。`,
  legs: '停车时车把放下，支脚落地，撑住车尾，人手可以松开，重量一部分由支脚、一部分由轮子承担；推行时车把抬起，支脚离地。',
}

export const STAGE_TEXT = {
  park: '停车：支脚着地',
  load: '加力：人手渐渐抬起',
  raise: '抬平：车把抬起、支脚离地',
  push: '推行：车轮滚动',
  lower: '放把：车把放下',
  unload: '卸力：支脚重新承重',
} as const
