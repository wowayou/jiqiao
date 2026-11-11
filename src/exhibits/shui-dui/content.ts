// 水碓的全部文字。史料只引 docs/sources/shui-dui.md 中核实过的原文；其余按实标注。
// 原文没有给出碓的个数、尺寸、转速和任何效率数字，这些一律是本站设定，不写成史实。
import type { Claim, FeatureDef, SourceRef } from '../../exhibit/types'
import { DIM, N_LEVERS, N_PEGS, PEGS_PER_LEVER, PERIOD } from './model'

const FILE = 'docs/sources/shui-dui.md'

export const sources: Record<string, SourceRef> = {
  def: {
    title: '王祯《农书》卷十九「机碓」条：定义',
    file: FILE,
    quote: '水搗器也',
  },
  structure: {
    title: '王祯《农书》卷十九「机碓」条：水轮与横木',
    file: FILE,
    quote: '今人造作水輪，輪軸長可數尺，列貫橫木，相交如滾槍之製',
  },
  drive: {
    title: '王祯《农书》卷十九「机碓」条：水激轮转',
    file: FILE,
    quote: '水激輪轉，則軸間橫木',
  },
  strike: {
    title: '王祯《农书》卷十九「机碓」条：横木打碓梢',
    file: FILE,
    quote: '打所排碓梢，一起一落舂之，即連機碓也',
  },
  site: {
    title: '王祯《农书》卷十九「机碓」条：设置地点',
    file: FILE,
    quote: '凡在流水岸旁，俱可設置。須度水勢高下為之',
  },
  dou: {
    title: '王祯《农书》卷十九「机碓」条：斗碓（鼓碓）',
    file: FILE,
    quote: '上用木槽引水，直下射轉',
  },
  liao: {
    title: '王祯《农书》卷十九「机碓」条：撩车碓',
    file: FILE,
    quote: '貼岸置輪，高可丈餘，自下衝轉',
  },
  fanche: {
    title: '王祯《农书》卷十九「机碓」条引《通俗文》',
    file: FILE,
    quote: '水碓曰翻車碓',
  },
  dayu: {
    title: '王祯《农书》卷十九「机碓」条：杜预作连机碓',
    file: FILE,
    quote: '杜預作連機碓',
  },
  tail: {
    title: '王祯《农书》卷十六「碓」条引《方言》：碓梢',
    file: FILE,
    quote: '碓梢謂之碓機',
  },
  chong: {
    title: '王祯《农书》卷十六「碓」条：碓是杵臼的一变',
    file: FILE,
    quote: '舂器，用石，杵臼之一變也',
  },
  huantan: {
    title: '《太平御览》卷七百六十二引桓谭《新论》',
    file: FILE,
    quote: '復設機關，用驢羸牛馬，及役水而舂，其利百倍',
  },
}

export const intro: Claim[] = [
  {
    text: '水碓是用水力舂米的机器。元代王祯《农书》说机碓是「水搗器也」。',
    provenance: 'source',
    cite: 'def',
  },
  {
    text: '王祯描述连机碓：水轮的轴上穿着一排横木，水冲得轮转，轴上的横木依次拨打排好的碓梢，碓杵一起一落地舂。',
    provenance: 'source',
    cite: 'structure',
  },
  {
    text: '本展品演示的就是这一件事：水轮连续的旋转，怎样变成碓头一下一下的敲击。传动链是：水冲水轮 → 水轮带横轴转 → 轴上的拨板转到碓尾，把碓尾压下去 → 碓杆绕支点转，碓头被抬起 → 拨板转过去、脱开碓尾 → 碓头靠自重落下，砸进臼里。',
    provenance: 'reconstruction',
  },
  {
    text: `一根轴带 ${N_LEVERS} 个碓，每个碓有 ${PEGS_PER_LEVER} 块拨板，共 ${N_PEGS} 块，拨板在轴上错开角度，所以几个碓轮流起落。碓的个数、拨板数、各部尺寸与转速（水轮约 ${Math.round(60 / PERIOD)} 转/分）都是本站设定；王祯没有给出碓的个数，也没有统一的尺寸。`,
    provenance: 'model',
  },
  {
    text: '王祯说「杜預作連機碓」，这是他转述的传说，不能当作连机碓起源的定论。',
    provenance: 'source',
    cite: 'dayu',
  },
  {
    text: '《太平御览》引桓谭《新论》说，用驴、骡、牛、马以及「役水而舂」，其利百倍。这是汉代人对机械舂米的泛称，原文没有给出具体效率，本展品也不给任何效率数字。',
    provenance: 'source',
    cite: 'huantan',
  },
]

type PartText = { name: string; role: string; claims?: Claim[]; features?: FeatureDef[] }
const K = (k: number) => ['一', '二', '三', '四'][k]

export const PART_TEXT = {
  bed: {
    name: '台基',
    role: '托住整台机器的平台。',
    claims: [{ text: '台基的范围与高度为本站设定，只用来表示机器立在地上。', provenance: 'model' }],
  } as PartText,
  stream: {
    name: '尾水（示意）',
    role: '水轮下面流走的水，示意水从上游来、向下游去。',
    claims: [{ text: '尾水只是示意，没有水位与流速模型。', provenance: 'model' }],
  } as PartText,
  bearing: {
    name: '轴承座',
    role: '托住横轴、让它能在孔里转动的木墩（共三个：水轮外侧、水轮与碓之间、碓之外）。',
    claims: [
      { text: '轴承座的形制、个数与位置为本站设定；孔比轴大 3 mm，作为转动配合的间隙。', provenance: 'model' },
    ],
  } as PartText,
  frame: {
    name: '碓杆支架',
    role: '两根立柱加底栿与顶梁，立柱上开孔，托住支点轴，让各根碓杆有稳固的转轴。',
    claims: [{ text: '支架的形制与尺寸为本站设定；王祯没有描述碓杆的支架结构。', provenance: 'model' }],
  } as PartText,
  axle: {
    name: '支点轴',
    role: '穿过各根碓杆的短轴，两端插在支架立柱的孔里；碓杆绕它转动，它就是杠杆的支点。',
    claims: [
      { text: `用一根贯穿各杆的轴作支点、直径 ${2 * DIM.axleR} mm、铁制，均为本站设定。`, provenance: 'model' },
    ],
  } as PartText,
  wheel: {
    name: '水轮',
    role: '立式水轮：叶板受水冲击，带着横轴一起转。',
    claims: [
      { text: '王祯：水轮的轴上「列貫橫木」，水冲得轮转，横木就依次打碓梢。', provenance: 'source', cite: 'drive' },
      {
        text: '王祯分两种布置：水浅岸低的撩车碓，轮「貼岸置輪，高可丈餘，自下衝轉」；水高岸深的斗碓，用木槽引水「直下射轉」轮板。',
        provenance: 'source',
        cite: 'dou',
      },
      {
        text: '本模型取水槽从上方引水冲下的布置，形制近于斗碓的写法；轮径约 2 m、14 块叶板、8 根辐条，均为本站设定。',
        provenance: 'model',
      },
    ],
  } as PartText,
  shaft: {
    name: '横轴',
    role: '连着水轮的长轴，轴上按错开的角度开卯眼，插着各块拨板。',
    claims: [
      { text: '王祯：「輪軸長可數尺，列貫橫木」——轮轴很长，上面成排地穿着横木。', provenance: 'source', cite: 'structure' },
      {
        text: `轴径 ${2 * DIM.shaftR} mm、轴长约 ${DIM.shaftZ1 - DIM.shaftZ0} mm、卯眼的位置与角度为本站设定。`,
        provenance: 'model',
      },
    ],
  } as PartText,
  peg: (k: number, j: number): PartText => ({
    name: `拨板 ${k + 1}${'ab'[j]}（碓 ${K(k)} 用）`,
    role: `插在横轴上的圆头木板，转到碓 ${K(k)} 的碓尾上方时，把碓尾压下去；转过后脱开。每个碓有 ${PEGS_PER_LEVER} 块，在轴上相隔 180°。`,
    claims: [
      {
        text: '王祯说的「軸間橫木」相当于本站的拨板：它们依次打下碓梢。',
        provenance: 'source',
        cite: 'strike',
      },
      {
        text: `板厚 ${2 * DIM.pegR} mm、板头做成圆头、圆头圆心离轴心 ${DIM.pegOrbit} mm、板宽 ${DIM.pegW} mm，以及各块拨板在轴上的角度，均为本站设定。`,
        provenance: 'model',
      },
      {
        text: '拨板压着碓尾时，碓杆的转角由「圆头与碓尾上表面相切」算出（解析式，见 kinematics/cam.ts），所以板与碓尾既不穿模也不悬空。',
        provenance: 'calc',
      },
    ],
    features: [
      {
        id: 'nose',
        name: '圆头',
        role: '板头的圆弧面，压在碓尾上表面，一边压一边向碓尾末端滑去，滑出末端就脱开。',
        anchor: [DIM.pegOrbit, 0, 0],
        claims: [{ text: '圆头半径为本站设定。', provenance: 'model' }],
      },
    ],
  }),
  lever: (k: number): PartText => ({
    name: `碓杆 ${K(k)}`,
    role: '绕支点轴转的杠杆：靠近横轴的一端是碓尾，被拨板压下；另一端装着碓头，随之抬起。',
    claims: [
      { text: '王祯引《方言》：「碓梢謂之碓機」——碓杆尾端叫碓梢。', provenance: 'source', cite: 'tail' },
      {
        text: '碓杆是杠杆：碓尾被压下时，碓杆绕支点转动，另一端的碓头被抬起。',
        provenance: 'reconstruction',
      },
      {
        text: `杆长 ${DIM.tail + DIM.head} mm（碓尾 ${DIM.tail} mm、碓头一端 ${DIM.head} mm）、截面 ${2 * DIM.beamHalfZ}×${2 * DIM.beamHalfH} mm、支点位置，均为本站设定。`,
        provenance: 'model',
      },
      {
        text: '脱开之后碓杆在碓头的自重下转回去：本模型取匀角加速度下落，落到碓头触到臼里的谷粒即停；加速度取值为本站设定，不是实测。',
        provenance: 'model',
      },
    ],
    features: [
      {
        id: 'tail',
        name: '碓尾（受压面）',
        role: '碓杆靠近横轴的一端，上表面承受拨板的圆头。',
        anchor: [-DIM.tail * 0.6, DIM.beamHalfH, 0],
        claims: [{ text: '王祯引《方言》：「碓梢謂之碓機」。', provenance: 'source', cite: 'tail' }],
      },
      {
        id: 'pivot',
        name: '支点孔',
        role: '套在支点轴上的孔，碓杆绕它转动。',
        anchor: [0, 0, DIM.beamHalfZ],
        claims: [{ text: '孔比支点轴大 1.5 mm，作为转动配合的间隙，为本站设定。', provenance: 'model' }],
      },
    ],
  }),
  pestle: (k: number): PartText => ({
    name: `碓头 ${K(k)}`,
    role: '装在碓杆头端、竖直向下的木杵；被抬起后落下，砸在臼里的谷粒上。',
    claims: [
      { text: '王祯：碓是「舂器，用石，杵臼之一變也」——是杵臼的一种变化。', provenance: 'source', cite: 'chong' },
      {
        text: '王祯：连机碓「一起一落舂之」；碓头每被抬起一次、落下一次，就是舂一下。',
        provenance: 'source',
        cite: 'strike',
      },
      {
        text: '碓头与碓杆固连，随碓杆绕支点转，所以抬起时是斜着上来、落下时斜着回来的一段弧；杆身直径、舂头尺寸与木制，均为本站设定。',
        provenance: 'model',
      },
    ],
    features: [
      {
        id: 'head',
        name: '舂头',
        role: '碓头下端较粗的一段，落到臼里砸谷粒。',
        anchor: [0, -(DIM.pivotY - 330) + 70, 0],
        claims: [{ text: '舂头的粗细与长度为本站设定。', provenance: 'model' }],
      },
    ],
  }),
  mortar: (k: number): PartText => ({
    name: `臼 ${K(k)}`,
    role: '承住碓头、装着谷粒的石臼。',
    claims: [
      { text: '王祯：碓是「杵臼之一變也」，仍是杵与臼一对。', provenance: 'source', cite: 'chong' },
      { text: '臼的尺寸、碗形与深度为本站设定。', provenance: 'model' },
    ],
  }),
  grain: (k: number): PartText => ({
    name: `谷粒 ${K(k)}（示意）`,
    role: '臼里待舂的谷粒，示意碓头砸的是什么。',
    claims: [{ text: '谷粒只画成一小堆，不随舂击变化，也没有舂米效率模型。', provenance: 'model' }],
  }),
  flume: {
    name: '水槽',
    role: '架在水轮上方的木槽，把水引到水轮的叶板上。',
    claims: [
      { text: '王祯：水高岸深时「上用木槽引水，直下射轉」轮板，叫斗碓（又叫鼓碓）。', provenance: 'source', cite: 'dou' },
      { text: '槽的长度、高度和支架为本站设定；水从槽口直接落到叶板上也只是示意。', provenance: 'model' },
    ],
  } as PartText,
  flow: {
    name: '水流（示意）',
    role: '槽里的水和槽口落下的水柱。',
    claims: [
      { text: '王祯：「凡在流水岸旁，俱可設置。須度水勢高下為之。」', provenance: 'source', cite: 'site' },
      { text: '水流是静态示意，没有流量、落差与水轮功率的计算；爆炸时隐藏。', provenance: 'model' },
    ],
  } as PartText,
}
