// 水碓（M2，机械类）
import { defineExhibit, type ChainStep } from '../../exhibit/types'
import { intro, sources } from './content'
import { meta } from './meta'
import { LANES, N_PEGS, PEGS_PER_LEVER, PEG_BETA, PERIOD, STRIKE_FLASH, simulate, strikesPerMinute, type DuiControls, type DuiState, type LeverStage } from './model'
import { PEG_ID, grainId, leverId, mortarId, parts, pestleId } from './parts'

const ZH = ['一', '二', '三', '四']
const STAGE_LABEL: Record<LeverStage, string> = { push: '压尾抬头', fall: '脱开下落', strike: '砸进臼里', idle: '静候' }
const degText = (r: number) => `${Math.round((r * 180) / Math.PI)}°`

function leverSteps(k: number): ChainStep<DuiState>[] {
  const n = ZH[k]
  const pegs = PEG_BETA[k].map((_, j) => PEG_ID(k, j))
  const on = (st: LeverStage) => (s: DuiState) => s.levers[k].stage === st
  return [
    {
      id: `push-${k + 1}`,
      title: `碓${n} · 压尾抬头`,
      parts: [...pegs, leverId(k), `${pestleId(k)}#head`],
      text: `拨板转到碓${n}的碓尾上方，圆头压住碓尾上表面，把碓尾往下压；碓杆绕支点轴转动，另一端的碓头被抬起。压着的这一段里，碓杆的转角由「圆头与碓尾上表面相切」的几何关系算出，板与碓尾始终贴合。`,
      provenance: 'calc',
      active: on('push'),
      // 讲解：碓一有剖开的机位，其余两个碓自动凑近
      view: k === 0 ? 'peg' : undefined,
    },
    {
      id: `fall-${k + 1}`,
      title: `碓${n} · 脱开下落`,
      parts: [leverId(k), pestleId(k)],
      text: `拨板的圆头滑过碓尾末端，脱开；没有东西再压着碓尾，碓头靠自重下落，碓杆转回去。本模型取匀角加速度下落，加速度为本站设定。`,
      provenance: 'model',
      active: on('fall'),
      view: k === 0 ? 'peg' : undefined,
    },
    {
      id: `strike-${k + 1}`,
      title: `碓${n} · 砸进臼里`,
      parts: [pestleId(k), mortarId(k), grainId(k)],
      text: `碓头落到臼里的谷粒上，砸一下，停在那里等下一块拨板。下一块拨板要等轴再转过一个角度才到，所以碓头总能先落定。（落进臼里之后 ${STRIKE_FLASH} s 内在此点亮，时长为本站设定。）`,
      provenance: 'reconstruction',
      active: on('strike'),
      view: k === 0 ? 'strike' : undefined,
    },
  ]
}

export default defineExhibit<DuiState, DuiControls>({
  meta,
  intro,
  controls: [{ key: 'water', label: '显示水流示意', kind: 'toggle' }],
  defaults: { water: true },
  timeline: {
    kind: 'cyclic',
    period: PERIOD,
    speeds: [0.1, 0.25, 0.5, 1, 2],
    defaultSpeed: 0.5,
    // 碓一每块拨板压一次：每 PERIOD / PEGS_PER_LEVER 秒起落一次；offset 让「压 → 落 → 砸」落在同一格里
    minor: { period: PERIOD / PEGS_PER_LEVER, unit: '次起落', offset: 1, steps: 50 },
    moments: [
      { t: 1.2, label: '拨板刚压上碓尾（碓一）' },
      { t: 2.2, label: '碓头下落（碓一）' },
      { t: 2.5, label: '碓头砸进臼里（碓一）' },
    ],
  },
  simulate,
  parts,
  chain: [
    {
      id: 'water',
      title: '水流冲水轮',
      parts: ['flume', 'flow', 'wheel'],
      text: '水从水槽落到水轮的叶板上，水激得轮转。王祯：「水激輪轉，則軸間橫木」……',
      provenance: 'source',
      cite: 'drive',
    },
    {
      id: 'shaft',
      title: '水轮带横轴转',
      parts: ['wheel', 'shaft', 'bearing'],
      text: '水轮和横轴固连在一起同转，轴架在轴承座上。王祯说水轮的轴很长，上面「列貫橫木」。',
      provenance: 'source',
      cite: 'structure',
    },
    {
      id: 'stagger',
      title: '拨板错开，轮流起落',
      parts: LANES.flatMap((_, k) => PEG_BETA[k].map((_b, j) => PEG_ID(k, j))),
      text: `一根轴上有 ${N_PEGS} 块拨板，分属 ${LANES.length} 个碓；各碓的拨板在轴上相隔 180°，各碓之间错开 60°。所以横轴每转一圈，每隔 60° 就有一块拨板压下一个碓尾，几个碓此起彼落。个数与角度是本站设定。`,
      provenance: 'model',
    },
    ...LANES.flatMap((_, k) => leverSteps(k)),
  ],
  readouts: [
    { label: '水轮转角', value: (s) => degText(s.theta), provenance: 'calc' },
    { label: '水轮转速', value: () => `${(60 / PERIOD).toFixed(1)} 转/分`, provenance: 'model' },
    ...LANES.map((_, k) => ({
      label: `碓${ZH[k]}：此刻 / 碓头抬起`,
      value: (s: DuiState) => `${STAGE_LABEL[s.levers[k].stage]} / ${Math.round(s.levers[k].lift)} mm`,
      provenance: 'calc' as const,
    })),
    {
      label: '每分钟舂击次数',
      value: () => `共 ${strikesPerMinute()} 次/分（每碓 ${strikesPerMinute(N_PEGS / LANES.length)} 次/分）`,
      provenance: 'calc',
    },
  ],
  sources,
  view: { dir: [0.55, 0.7, 1] },
  views: [
    {
      id: 'peg',
      label: '拨板压碓尾',
      target: [150, 1000, 640],
      size: 1000,
      dir: [0.12, 0.2, 1],
      // 在碓一与碓二之间切开，揭去碓二、碓三一侧：正对着看碓一的拨板怎样压下碓尾
      section: { normal: [0, 0, -1], offset: -800, label: '在碓一与碓二之间剖开，揭去碓二、碓三一侧' },
      fade: ['wheel', 'bearing', 'flume', 'flow', 'stream'],
      note: '剖开，水轮水槽让开：看拨板压下碓一的碓尾',
    },
    {
      id: 'strike',
      label: '碓头砸臼',
      target: [1200, 520, 640],
      size: 800,
      dir: [0.4, 0.3, -1],
      fade: ['wheel', 'bearing', 'flume', 'flow', 'stream'],
      note: '水轮水槽让开：看碓头落进臼里砸谷粒',
    },
  ],
  section: { normal: [0, 0, -1], offset: -1200, label: '剖掉碓三一侧，露出碓二的拨板与碓尾' },
  audit: {
    phases: 120,
    contacts: [
      ...LANES.flatMap((_, k) => PEG_BETA[k].map((_b, j) => [PEG_ID(k, j), leverId(k)] as [string, string])),
      ...LANES.flatMap((_, k) => PEG_BETA[k].map((_b, j) => ['shaft', PEG_ID(k, j)] as [string, string])),
      ...LANES.flatMap((_, k): [string, string][] => [
        [pestleId(k), mortarId(k)],
        [pestleId(k), grainId(k)],
        [pestleId(k), leverId(k)],
        [leverId(k), 'frame'],
        [leverId(k), 'axle'],
        [leverId(k), 'shaft'],
        [mortarId(k), grainId(k)],
        [mortarId(k), 'bed'],
      ]),
      ['frame', 'axle'],
      ['frame', 'bed'],
      ['shaft', 'bearing'],
      ['shaft', 'wheel'],
      ['bearing', 'bed'],
      ['wheel', 'bearing'],
      ['wheel', 'flume'],
      ['wheel', 'flow'],
      ['wheel', 'stream'],
      ['flume', 'bed'],
      ['flow', 'flume'],
    ],
  },
})
