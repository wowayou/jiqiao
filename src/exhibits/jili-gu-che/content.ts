// 记里鼓车的全部文字。史料只引 docs/sources/jiligu-che.md 中的原文（逐字）；其余按实标注。
import type { Claim, FeatureDef, SourceRef } from '../../exhibit/types'
import { CHI_MM, PHASE, T_F } from './model'

const FILE = 'docs/sources/jiligu-che.md'
const T = '《宋史·輿服志一》记里鼓车条'

export const sources: Record<string, SourceRef> = {
  zhi: { title: `${T}：形制`, file: FILE, quote: '記裏鼓車，一名大章車。赤質，四面畫花鳥，重台，勾闌，鏤拱。' },
  first: { title: `${T}：开篇的报时说法`, file: FILE, quote: '行一里，則上層木人擊鼓；十里，則次層木人擊鐲。' },
  yuan: { title: `${T}：车辕`, file: FILE, quote: '一轅，鳳首，駕四馬。' },
  che: { title: `${T}：卢道隆上记里鼓车之制`, file: FILE, quote: '獨轅雙輪，箱上為兩重，各刻木為人，執木槌。' },
  zu: { title: `${T}：足轮`, file: FILE, quote: '足輪各徑六尺，圍一丈八尺。足輪一周，而行地三步。' },
  bu: { title: `${T}：步与里`, file: FILE, quote: '以古法六尺為步，三百步為裏，用較今法五尺為步，三百六十步為裏。' },
  li: { title: `${T}：立轮`, file: FILE, quote: '立輪一，附於左足，徑一尺三寸八分，圍四尺一寸四分，出齒十八，齒間相去二寸三分。' },
  xia: { title: `${T}：下平轮`, file: FILE, quote: '下平輪一，其徑四尺一寸四分，圍一丈二尺四寸二分，出齒五十四，齒間相去與附立輪同。' },
  xuan: { title: `${T}：立贯心轴与铜旋风轮`, file: FILE, quote: '立貫心軸一，其上設銅旋風輪一，出齒三，齒間相去一寸二分。' },
  zhong: { title: `${T}：中平轮`, file: FILE, quote: '中立平輪一，其徑四尺，圍一丈二尺，出齒百，齒間相去與旋風等。' },
  xiao: { title: `${T}：小平轮`, file: FILE, quote: '次安小平輪一，其徑三寸少半寸，圍一尺，出齒十，齒間相去一寸半。' },
  shang: { title: `${T}：上平轮`, file: FILE, quote: '上平輪一，其徑三尺少半尺，圍一丈，出齒百，齒間相去與小平輪同。' },
  ji: {
    title: `${T}：击鼓与击鐲`,
    file: FILE,
    quote: '其中平輪轉一周，車行一里，下一層木人擊鼓；上平輪轉一周，車行十里，上一層木人擊鐲。',
  },
  zong: { title: `${T}：总数`, file: FILE, quote: '凡用大小輪八，合二百八十五齒，遞相鉤鎖，犬牙相製，周而復始。' },
  bozi: { title: `${T}：大观之制的拨子（吴德仁车，非卢道隆车）`, file: FILE, quote: '外大平輪軸上有鐵撥子二。又木橫軸上關戾、撥子各一。' },
  tuiding: { title: '本站史料整理说明：同轴关系', file: FILE, quote: '轮与轮的同轴/啮合关系为按文意推定' },
  buyizhi: { title: '本站史料整理说明：原文内部不一致', file: FILE, quote: '原文内部有一处不自洽（只影响齿距，不影响速比，未改动任何数字）' },
}

export const intro: Claim[] = [
  {
    text: '记里鼓车是一辆会「数路」的车：车轮每转一圈走的路是固定的，车里一串齿轮把车轮转了多少圈数出来，数满一里，木人就敲一下鼓。',
    provenance: 'reconstruction',
  },
  {
    text: '《宋史·舆服志》载仁宗天圣五年内侍卢道隆所上之制：「獨轅雙輪，箱上為兩重，各刻木為人，執木槌」，并逐一给出各轮的径、围、齿数与齿距。本展品的齿数、轮径照录这一条。',
    provenance: 'source',
    cite: 'che',
  },
  {
    text: '原文：「其中平輪轉一周，車行一里，下一層木人擊鼓；上平輪轉一周，車行十里，上一層木人擊鐲」。',
    provenance: 'source',
    cite: 'ji',
  },
  {
    text: '验算：足轮一周行地三步，三百步一里，故足轮 100 周 = 1 里；齿轮链 18/54 × 3/100 = 1/100，中平轮正好转 1 周；再经 10/100，上平轮 1000 周足轮转 1 周 = 10 里。',
    provenance: 'calc',
  },
  {
    text: `原文只给轮系，没有写齿的形状、轮怎样正交啮合、木人怎样被拨动去击鼓，也没有宋尺的毫米数。这些都是本站的设定：1 尺取 ${CHI_MM} mm；齿做成圆木销；击鼓由中平轮、上平轮上的斜坡「拨子」顶起提杆、越过后落下实现。`,
    provenance: 'model',
  },
  {
    text: '同卷开篇另有一句「行一里，則上層木人擊鼓；十里，則次層木人擊鐲」，与卢道隆条「下一層木人擊鼓」「上一層木人擊鐲」的上下层说法相反。',
    provenance: 'source',
    cite: 'first',
  },
  { text: '本展品按卢道隆条布置：下层木人击鼓、上层木人击鐲。', provenance: 'model' },
  {
    text: `时间轴：1× 时足轮每 ${T_F} 秒转一周。看单齿啮合用 0.1×–0.25×；想看击鼓用 50× 以上（一里 = 100 周）。整条时间轴是 3000 周（30 里），因为下平轮转速是足轮的 1/3，要 3000 周才和上平轮一起回到起点。`,
    provenance: 'model',
  },
]

type PartText = { name: string; role: string; claims?: Claim[]; features?: FeatureDef[] }

const ratioNote = (a: string, b: string, za: number, zb: number): Claim => ({
  text: `${a} ${za} 齿拨 ${b} ${zb} 齿：${b}的转速是${a}的 ${za}/${zb}。`,
  provenance: 'calc',
})

export const PART_TEXT: Record<string, PartText> = {
  ground: {
    name: '地面',
    role: '车原地不动，地面相对车往后移，表示车在前进。',
    claims: [{ text: '「车不动、地后移」是为了让车始终留在画面里，为本站的演示方式。', provenance: 'model' }],
  },
  marks: {
    name: '地面刻线（每半步一道）',
    role: '随车轮滚动后移；相邻两道之间是足轮转 1/6 周走过的路。',
    claims: [
      {
        text: '刻线间距按真实滚动（2π × 轮半径 ÷ 6 ≈ 974 mm）。原文「徑六尺，圍一丈八尺」用的是「周三径一」：照径六尺算，真实周长约 18.85 尺，比原文的围多约 4.7%。读数里的步数、里数按原文「一周三步」计。',
        provenance: 'calc',
      },
    ],
  },
  axle: {
    name: '车轴',
    role: '横贯两轮，托住车箱；两只足轮各自套在轴上转。',
    claims: [{ text: '轴固定、轮在轴上转，立轮固定在左轮上随之转动——这种做法为本站设定，原文只说立轮「附於左足」。', provenance: 'model' }],
  },
  'wheel-left': {
    name: '左足轮',
    role: '着地滚动；内侧固定着立轮，是整串齿轮的动力来源。',
    claims: [
      { text: '原文：「足輪各徑六尺，圍一丈八尺。足輪一周，而行地三步」。', provenance: 'source', cite: 'zu' },
      { text: `径照录六尺（× ${CHI_MM} mm = 1860 mm）；十八根辐条、轮辋宽 80 mm 为本站设定。`, provenance: 'model' },
    ],
  },
  'wheel-right': {
    name: '右足轮',
    role: '另一只足轮，只承重，不带齿轮。',
    claims: [{ text: '原文「獨轅雙輪」。', provenance: 'source', cite: 'che' }],
  },
  'li-lun': {
    name: '立轮（18 齿）',
    role: '竖直的销齿轮，固定在左足轮内侧，和足轮一起转；轮顶的木销拨动上方下平轮垂下的木销。',
    claims: [
      { text: '原文：「立輪一，附於左足，徑一尺三寸八分，圍四尺一寸四分，出齒十八，齒間相去二寸三分」。', provenance: 'source', cite: 'li' },
      { text: '齿做成沿半径插出的圆木销（销径 18 mm），与下平轮垂下的冠销交叉相拨；这种正交销齿形制为本站设定。', provenance: 'model' },
      { text: '节圆半径照录径：213.9 mm；按真实圆周率，节圆上齿距 74.7 mm（原文二寸三分合 71.3 mm，原文用「周三径一」）。', provenance: 'calc' },
    ],
  },
  'xia-ping': {
    name: '下平轮（54 齿）',
    role: '水平大轮，被立轮拨着慢慢转，足轮转 3 周它转 1 周。',
    claims: [
      { text: '原文：「下平輪一，其徑四尺一寸四分，圍一丈二尺四寸二分，出齒五十四，齒間相去與附立輪同」。', provenance: 'source', cite: 'xia' },
      ratioNote('立轮', '下平轮', 18, 54),
      { text: '齿做成从轮辋向下垂的圆木销（冠销）。冠销与立轮径向销的组合为本站设定。', provenance: 'model' },
    ],
  },
  'guan-xin-zhou': {
    name: '立贯心轴',
    role: '竖直穿过下平轮中心的轴，顶端装铜旋风轮：下平轮转多少，旋风轮就转多少。',
    claims: [
      { text: '原文：「立貫心軸一，其上設銅旋風輪一」。', provenance: 'source', cite: 'xuan' },
      { text: '下平轮与旋风轮同在此轴上（同轴），是按文意推定。', provenance: 'reconstruction', cite: 'tuiding' },
      { text: '下端立在车箱底板的轴座里、中部有横梁扶住，为本站设定。', provenance: 'model' },
    ],
  },
  'xuan-feng': {
    name: '铜旋风轮（3 齿）',
    role: '只有三根拨齿的小铜轮：每转 1/3 周，拨着中平轮走过一个齿，然后脱开；中平轮停住，等下一根拨齿。',
    claims: [
      { text: '原文：「其上設銅旋風輪一，出齒三，齒間相去一寸二分」。', provenance: 'source', cite: 'xuan' },
      { text: '三根拨齿做成两端圆头的铜条，从中平轮的冠销之间扫过；形状、长度（拨齿尖距轴心 24 mm）为本站设定。原文未载旋风轮的径。', provenance: 'model' },
      {
        text: '三齿拨百齿时，若按恒定速比转，拨齿必然穿进木销。本模型改由几何接触求中平轮的转角：拨齿碰到木销就推着走，推满一个齿距后滑脱，中平轮停住——所以中平轮是一拨一停地走。',
        provenance: 'calc',
      },
      { text: '节圆半径取 3 × 中平轮齿距 ÷ 2π = 18.6 mm，使两者「齒間相去」相等；这是按原文齿距推出的设定。', provenance: 'model' },
    ],
  },
  'zhong-ping': {
    name: '中平轮（100 齿）',
    role: '被旋风轮一齿一齿拨着走：足轮转 100 周它转 1 周，正好一里；轮缘上的拨子每转一周顶一次下层木人的提杆。',
    claims: [
      { text: '原文：「中立平輪一，其徑四尺，圍一丈二尺，出齒百，齒間相去與旋風等」。', provenance: 'source', cite: 'zhong' },
      { text: '原文：「其中平輪轉一周，車行一里，下一層木人擊鼓」。', provenance: 'source', cite: 'ji' },
      { text: '足轮 100 周 → 下平轮 100/3 周 → 旋风轮拨 100 次 → 中平轮 1 周。', provenance: 'calc' },
    ],
  },
  'zhong-zhou': {
    name: '中平轮轴',
    role: '中平轮与小平轮共用的竖轴。',
    claims: [
      { text: '中平轮与小平轮同轴，是按文意推定（这样上平轮才是中平轮的十分之一速）。', provenance: 'reconstruction', cite: 'tuiding' },
      {
        text: '中平轮轴恰好落在下平轮轮辋的正上方（中心距 638.6 mm ≈ 下平轮半径 641.7 mm），所以轴下端只能到下平轮之上，用横梁托住、上端吊在台板下的轴座里——这是原文尺寸推出的布置约束，具体支承方式为本站设定。',
        provenance: 'calc',
      },
    ],
  },
  'xiao-ping': {
    name: '小平轮（10 齿）',
    role: '装在中平轮轴上、与中平轮同转的小轮，立着十根木销拨上平轮。',
    claims: [
      { text: '原文：「次安小平輪一，其徑三寸少半寸，圍一尺，出齒十，齒間相去一寸半」。', provenance: 'source', cite: 'xiao' },
      {
        text: '原文内部不一致：十齿 × 一寸半 = 一尺五寸，而原文「圍一尺」。本模型采用径与围（二者按「周三径一」相合：三寸少半寸 × 3 = 一尺），节圆齿距 32.5 mm（约一寸），不采用「一寸半」。',
        provenance: 'model',
        cite: 'buyizhi',
      },
    ],
  },
  'shang-ping': {
    name: '上平轮（100 齿）',
    role: '被小平轮拨着转，中平轮转 10 周它转 1 周（车行十里）；轮缘上的拨子每转一周顶一次上层木人的提杆。',
    claims: [
      { text: '原文：「上平輪一，其徑三尺少半尺，圍一丈，出齒百，齒間相去與小平輪同」。', provenance: 'source', cite: 'shang' },
      {
        text: '原文内部不一致：百齿 × 一寸半 = 一丈五尺，而原文「圍一丈」。本模型同小平轮，采用径与围，不采用「一寸半」。速比只由齿数决定，不受影响。',
        provenance: 'model',
        cite: 'buyizhi',
      },
      ratioNote('小平轮', '上平轮', 10, 100),
    ],
  },
  'shang-zhou': {
    name: '上平轮轴',
    role: '上平轮的竖轴，吊在一层台板下的轴座里。',
    claims: [
      {
        text: '上平轮轴心离中平轮轴 568.3 mm，落在中平轮轮辋之内，所以轴不能往下伸，只能从上方吊住——由原文尺寸推出；支承方式为本站设定。',
        provenance: 'calc',
      },
    ],
  },
  'bozi-zhong': {
    name: '中平轮拨子（斜坡凸轮）',
    role: '中平轮缘上的一段铁斜坡：最后十个齿里把提杆一点点顶高，转满一周时提杆越过坡顶落下。',
    claims: [
      { text: '卢道隆条没有写拨动木人的机构。拨子的形状、跨 36°、升程 28 mm 均为本站设定。', provenance: 'model' },
      { text: '同卷吴德仁大观之制提到「外大平輪軸上有鐵撥子二。又木橫軸上關戾、撥子各一」，本站借「拨子」之名与思路，但那是另一辆车的记载。', provenance: 'source', cite: 'bozi' },
    ],
  },
  'bozi-shang': {
    name: '上平轮拨子（斜坡凸轮）',
    role: '上平轮缘上的一段铁斜坡：最后一里里把上层提杆顶高，满十里时落下。',
    claims: [{ text: '形状、跨 36°、升程 22 mm 为本站设定。', provenance: 'model' }],
  },
  'ti-gan-xia': {
    name: '下层提杆',
    role: '竖直滑杆：下端圆脚搭在中平轮缘上，上端顶着下层木人的槌臂。拨子顶高它，槌就举起；它落下，槌就砸到鼓上。',
    claims: [{ text: '提杆与槌臂的联动为本站设定（原文未载）。杆下段收细，免得落下时碰到拨子。', provenance: 'model' }],
  },
  'ti-gan-shang': {
    name: '上层提杆',
    role: '同下层提杆，搭在上平轮缘上，穿过一层台板，顶着上层木人的槌臂。',
    claims: [{ text: '为本站设定。', provenance: 'model' }],
  },
  'frame-lower': {
    name: '车箱下层（底板、立柱、轴架）',
    role: '底板坐在车轴上，立柱撑起一层台板；两道横梁扶住立贯心轴和中平轮轴。四面敞开，好看见齿轮。',
    claims: [
      { text: '原文「赤質，四面畫花鳥，重台，勾闌，鏤拱」。', provenance: 'source', cite: 'zhi' },
      { text: '本模型的车箱只做骨架、四面不封板（以便看见轮系），尺寸与结构为本站设定；未画彩绘，赤色也没有对应材质。', provenance: 'model' },
    ],
  },
  'deck-1': {
    name: '一层台板与勾阑',
    role: '下层木人与鼓站在这里；台板下吊着中平轮轴、上平轮轴的轴座。',
    claims: [
      { text: '原文「箱上為兩重」——车箱上有两层。', provenance: 'source', cite: 'che' },
      { text: '台板、勾阑、轴座的做法为本站设定。', provenance: 'model' },
    ],
  },
  'frame-upper': {
    name: '二层立柱、台板与勾阑',
    role: '上层木人与鐲站在这里。',
    claims: [{ text: '尺寸与做法为本站设定。', provenance: 'model' }],
  },
  'figure-lower': {
    name: '下层木人',
    role: '站在一层台上；肩上的轴挂着槌臂。',
    claims: [{ text: '原文「各刻木為人，執木槌」。', provenance: 'source', cite: 'che' }],
  },
  'arm-lower': {
    name: '下层木人的槌臂',
    role: '绕肩轴转：被提杆顶起时槌举高，提杆落下时槌砸在鼓面上。',
    claims: [{ text: '臂长 260 mm、静止时槌头离鼓面 0.5 mm（示意落在鼓上）为本站设定。', provenance: 'model' }],
  },
  drum: {
    name: '鼓（鼓身）',
    role: '立在一层台上的鼓。',
    claims: [
      { text: '原文「下一層木人擊鼓」。', provenance: 'source', cite: 'ji' },
      { text: '鼓的形制、尺寸为本站设定。', provenance: 'model' },
    ],
  },
  'drum-head': {
    name: '鼓面',
    role: '槌头落下击打的地方。',
  },
  'figure-upper': {
    name: '上层木人',
    role: '站在二层台上；肩上的轴挂着槌臂。',
    claims: [{ text: '原文「各刻木為人，執木槌」。', provenance: 'source', cite: 'che' }],
  },
  'arm-upper': {
    name: '上层木人的槌臂',
    role: '被上层提杆顶起、落下时击鐲。',
    claims: [{ text: '为本站设定。', provenance: 'model' }],
  },
  zhuo: {
    name: '鐲（连座）',
    role: '上层木人击打的铜器。',
    claims: [
      { text: '原文「上一層木人擊鐲」。', provenance: 'source', cite: 'ji' },
      { text: '原文未载鐲的形状；这里做成倒扣的铜钟形，立在木座上，为本站设定。', provenance: 'model' },
    ],
  },
  yuan: {
    name: '车辕（凤首）',
    role: '单根车辕，前端作凤首，套马拉车。',
    claims: [
      { text: '原文：「一轅，鳳首，駕四馬」。', provenance: 'source', cite: 'yuan' },
      { text: '辕的弯度与凤首的造型为本站简化示意；未画马。', provenance: 'model' },
    ],
  },
}

export const PHASE_NOTE = `一级、三级的装配相位取齿距的 ${PHASE.li}、${PHASE.xiao}，使驱动侧最小间隙约 1.5 mm（本站设定，由测试校核）。`
