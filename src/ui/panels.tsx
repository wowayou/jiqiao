// 展品页的各个面板。全部只读 store；运动与读数都来自 simulate 的状态快照。
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { splitRef } from '../exhibit/scene'
import { DOF_LABEL, GROUP_LABEL, PROVENANCE_LABEL, type AnyExhibit, type Dof, type PartGroup, type RealObjectRef, type TimeMoment } from '../exhibit/types'
import { timelineSpan, useStage, useStageActions } from '../stage/store'
import { formatTime, mainStep, minorOf, minorPos } from '../stage/timeline'
import {
  cachedTraces,
  formatTraceValue,
  placeOnSeries,
  sampleTracesAsync,
  seriesAt,
  traceDomain,
  traceKey,
  type TraceSamples,
} from '../stage/traces'
import { ClaimItem, ClaimList, ProvMark, ProvTag } from './Provenance'

/** 窄屏上舞台在页面顶部、列表在下面：从列表里点零件/链环后把舞台滚回视野，免得选中了却看不到。 */
export function revealStage() {
  try {
    if (!window.matchMedia('(max-width: 960px)').matches) return
    const el = document.querySelector('.stage-wrap')
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.top >= 0 && r.bottom <= window.innerHeight) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
  } catch {
    /* 无关紧要 */
  }
}

// —— 时间轴 ——
// 主进度条管整个周期；有小循环的展品多一条细调条，只覆盖「当前这个小循环」，单步按钮也按小循环的几分之一走。
export function Timeline({ def }: { def: AnyExhibit }) {
  const t = useStage((s) => s.t)
  const playing = useStage((s) => s.playing)
  const speed = useStage((s) => s.speed)
  const { togglePlay, setT, setSpeed, setPlaying, step } = useStageActions()
  const tl = def.timeline
  const span = timelineSpan(def)
  const isAsm = tl.kind === 'assembly'
  const minor = minorOf(def)
  const pos = minor && tl.kind === 'cyclic' ? minorPos(minor, tl.period, t) : null
  const mStep = mainStep(def)
  const quantized = Boolean(minor && pos && mStep === minor.period)
  const label = isAsm ? `装配 ${Math.round(t * 100)}%` : `${formatTime(t, span)} / ${formatTime(span, span)}`
  const moments = tl.kind === 'cyclic' ? (tl.moments ?? []) : []
  return (
    <div className="timeline" role="group" aria-label={isAsm ? '装配进度' : '时间轴'}>
      <div className="timeline-row">
        <button type="button" className="btn btn-primary" onClick={togglePlay} aria-pressed={playing} data-testid="play">
          {playing ? '暂停' : isAsm && t >= 1 ? '重新装配' : '播放'}
        </button>
        <button type="button" className="btn btn-icon" onClick={() => step(-1)} aria-label="后退一步" title="后退一步（←）" data-testid="step-back">
          ‹
        </button>
        <button type="button" className="btn btn-icon" onClick={() => step(1)} aria-label="前进一步" title="前进一步（→）" data-testid="step-fwd">
          ›
        </button>
        <input
          type="range"
          min={0}
          max={span}
          step={mStep}
          value={quantized ? Math.max(0, pos!.start - (minor!.offset ?? 0)) : t}
          aria-label={isAsm ? '装配进度' : minor ? '整个周期（粗调）' : '时间'}
          aria-valuetext={label}
          data-testid="scrub"
          onChange={(e) => {
            setPlaying(false)
            const v = Number(e.target.value)
            // 按小循环取整的粗调条：跳到别的小循环时保留在小循环内的位置，细调不丢
            setT(quantized ? v + (minor!.offset ?? 0) + (t - pos!.start) : v)
          }}
        />
        <span className="tval" aria-live="off" data-testid="tval">
          {label}
        </span>
        <label className="field">
          <span>速度</span>
          <select className="select" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} data-testid="speed">
            {tl.speeds.map((v) => (
              <option key={v} value={v}>
                {v}×{v < 1 ? ' 慢放' : v > 1 ? ' 快进' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {minor && pos && (
        <div className="timeline-row timeline-fine" role="group" aria-label="细调">
          <span className="fine-name" data-testid="fine-name">
            第 {pos.index} {minor.unit}
            <small> / 共 {pos.count}</small>
          </span>
          <input
            type="range"
            min={pos.start}
            max={pos.start + minor.period}
            step={minor.period / 1000}
            value={t}
            aria-label={`细调：当前这一${minor.unit}内的位置`}
            aria-valuetext={`第 ${pos.index} ${minor.unit}内 ${(t - pos.start).toFixed(2)} 秒`}
            data-testid="fine"
            onChange={(e) => {
              setPlaying(false)
              setT(Number(e.target.value))
            }}
          />
          <span className="tval" data-testid="fine-val">
            {(t - pos.start).toFixed(2)} / {minor.period} 秒
          </span>
          <MomentsSelect moments={moments} />
        </div>
      )}
      {!minor && moments.length > 0 && (
        <div className="timeline-row">
          <MomentsSelect moments={moments} />
        </div>
      )}
    </div>
  )
}

function MomentsSelect({ moments }: { moments: TimeMoment[] }) {
  const { setT, setPlaying } = useStageActions()
  if (moments.length === 0) return null
  return (
    <select
      className="select"
      value=""
      aria-label="跳到关键瞬间"
      data-testid="moments"
      onChange={(e) => {
        const m = moments[Number(e.target.value)]
        if (m) {
          setPlaying(false)
          setT(m.t)
        }
      }}
    >
      <option value="" disabled>
        跳到关键瞬间…
      </option>
      {moments.map((m, i) => (
        <option key={m.label} value={i}>
          {m.label}
        </option>
      ))}
    </select>
  )
}

/** 工具条图标：16 px、1.5 px 线宽、圆头，与文字按钮同高同色（继承 currentColor） */
function Icon({ name }: { name: 'ccw' | 'cw' | 'plus' | 'minus' }) {
  return (
    <svg className="icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {name === 'ccw' && (
        <>
          <path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5" />
          <path d="M3 2.2v3h3" />
        </>
      )}
      {name === 'cw' && (
        <>
          <path d="M12.8 8a4.8 4.8 0 1 1-1.5-3.5" />
          <path d="M13 2.2v3h-3" />
        </>
      )}
      {name === 'plus' && <path d="M8 3v10M3 8h10" />}
      {name === 'minus' && <path d="M3 8h10" />}
    </svg>
  )
}

// —— 展台上的工具条：爆炸、剖切、孤立、视角、展品控件 ——
export function Toolbar({ def }: { def: AnyExhibit }) {
  const explode = useStage((s) => s.explode)
  const section = useStage((s) => s.section)
  const isolate = useStage((s) => s.isolate)
  const selected = useStage((s) => s.selected)
  const controls = useStage((s) => s.controls)
  const a = useStageActions()
  const ref = useInsetRef('top')
  const [more, setMore] = useState(false)
  const touring = useStage((s) => s.tour !== null)
  return (
    <div className="stage-overlay" ref={ref} data-more={more}>
      <div className="toolgroup">
        <button
          type="button"
          className="btn btn-primary"
          aria-pressed={touring}
          onClick={() => (touring ? a.exitTour() : a.startTour(0))}
          data-testid="tour-start"
          title={touring ? '退出讲解（Esc）' : '一环一环讲解这台机器（] 键）'}
        >
          {touring ? '退出讲解' : '讲解'}
        </button>
        <label className="field" title="拖动拆开：零件沿装配方向分离（E 键一键拆开 / 复原）">
          <span>爆炸</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={explode}
            onChange={(e) => a.setExplode(Number(e.target.value))}
            aria-label="爆炸（拆开程度）"
            data-testid="explode"
          />
        </label>
        <button
          type="button"
          className="btn"
          aria-pressed={section.on}
          onClick={() => a.setSection({ on: !section.on })}
          data-testid="section"
          title={def.section?.label ?? '剖切'}
        >
          剖切
        </button>
        <button
          type="button"
          className="btn"
          aria-pressed={isolate}
          disabled={!selected}
          onClick={() => a.setIsolate(!isolate)}
          title="只显示选中零件，其余半透明"
        >
          孤立
        </button>
        <button type="button" className="btn more-btn" aria-expanded={more} onClick={() => setMore(!more)} data-testid="more-tools" title={more ? '收起展品控件与视角按钮' : '展开展品控件与视角按钮'}>
          {more ? '收起' : '更多'}
        </button>
      </div>
      {section.on && (
        <div className="toolgroup" role="group" aria-label="剖切设置">
          <select
            className="select"
            value={section.axis}
            onChange={(e) => a.setSection({ axis: e.target.value as typeof section.axis, offset: 0, custom: null })}
            aria-label="剖切平面"
            title="选择剖切平面"
          >
            <option value="default">{section.custom || def.section ? '推荐剖面' : 'Z 向剖面'}</option>
            <option value="x">沿 X 切</option>
            <option value="y">沿 Y 切（水平）</option>
            <option value="z">沿 Z 切</option>
          </select>
          <label className="field" title="剖切平面的位置（毫米）">
            <span>位置</span>
            <input
              type="range"
              min={-300}
              max={300}
              step={1}
              value={section.offset}
              onChange={(e) => a.setSection({ offset: Number(e.target.value) })}
              aria-label="剖切位置（mm）"
            />
          </label>
          <button type="button" className="btn" aria-pressed={section.flip} onClick={() => a.setSection({ flip: !section.flip })} title="切掉平面的另一侧">
            反向
          </button>
        </div>
      )}
      {def.controls.length > 0 && (
        <div className="toolgroup tool-more">
          {def.controls.map((c) =>
            c.kind === 'toggle' ? (
              <label key={c.key} className="field" title={c.label}>
                <input type="checkbox" checked={Boolean(controls[c.key])} onChange={(e) => a.setControl(c.key, e.target.checked)} />
                <span>{c.label}</span>
              </label>
            ) : c.kind === 'range' ? (
              <label key={c.key} className="field" title={c.label}>
                <span>{c.label}</span>
                <input
                  type="range"
                  min={c.min}
                  max={c.max}
                  step={c.step}
                  value={Number(controls[c.key])}
                  onChange={(e) => a.setControl(c.key, Number(e.target.value))}
                />
                <span>
                  {String(controls[c.key])}
                  {c.unit ?? ''}
                </span>
              </label>
            ) : (
              <label key={c.key} className="field" title={c.label}>
                <span>{c.label}</span>
                <select className="select" value={String(controls[c.key])} onChange={(e) => a.setControl(c.key, e.target.value)}>
                  {c.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ),
          )}
        </div>
      )}
      <div className="toolgroup tool-more" role="group" aria-label="视角">
        <button type="button" className="btn btn-icon" onClick={() => a.nudgeView('orbit', -0.3)} aria-label="向左转" title="视角向左转一点">
          <Icon name="ccw" />
        </button>
        <button type="button" className="btn btn-icon" onClick={() => a.nudgeView('orbit', 0.3)} aria-label="向右转" title="视角向右转一点">
          <Icon name="cw" />
        </button>
        <button type="button" className="btn btn-icon" onClick={() => a.nudgeView('zoom', 0.8)} aria-label="放大" title="拉近">
          <Icon name="plus" />
        </button>
        <button type="button" className="btn btn-icon" onClick={() => a.nudgeView('zoom', 1.25)} aria-label="缩小" title="拉远">
          <Icon name="minus" />
        </button>
      </div>
    </div>
  )
}

/** 量出浮层占掉画布的高度，告诉展台：取景时把它算进去，模型不会钻到浮层底下。 */
function useInsetRef(edge: 'top' | 'bottom') {
  const ref = useRef<HTMLDivElement>(null)
  const { setInset } = useStageActions()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const parent = el.closest('.stage-wrap') as HTMLElement | null
      if (!parent) return
      const r = el.getBoundingClientRect()
      const pr = parent.getBoundingClientRect()
      // 浮层被隐藏（display: none）时矩形全是 0：它不占地方，不能算成「整个画布都被挡住」
      const px = r.width === 0 && r.height === 0 ? -6 : edge === 'top' ? r.bottom - pr.top : pr.bottom - r.top
      setInset({ [edge]: Math.max(0, Math.ceil(px) + 6) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    ro.observe(el.closest('.stage-wrap') as Element)
    return () => {
      ro.disconnect()
      setInset({ [edge]: 0 })
    }
  }, [edge, setInset])
  return ref
}

// —— 机位条：全景 / 预设机位 / 凑近看，展台左下 ——
export function ViewBar({ def }: { def: AnyExhibit }) {
  const active = useStage((s) => s.activeView)
  const selected = useStage((s) => s.selected)
  const fade = useStage((s) => s.fadeParts)
  const hidden = useStage((s) => s.hidden)
  const a = useStageActions()
  const ref = useInsetRef('bottom')
  const views = def.views ?? []
  const note = views.find((v) => v.id === active)?.note
  return (
    <div className="stage-views" role="group" aria-label="机位">
      {note && <p className="view-note">{note}</p>}
      <div className="toolgroup" ref={ref}>
        <button type="button" className="btn" aria-pressed={active === 'all'} onClick={() => a.applyView('all')} data-testid="reset-view" title="回到全景（R）">
          全景
        </button>
        {views.map((v, i) => (
          <button key={v.id} type="button" className="btn" aria-pressed={active === v.id} onClick={() => a.applyView(v.id)} data-view={v.id} title={`${v.note ?? v.label}（${i + 1}）`}>
            {v.label}
          </button>
        ))}
        <button
          type="button"
          className="btn"
          disabled={!selected}
          onClick={() => a.focusPart()}
          data-testid="focus-part"
          title={selected ? '镜头凑近选中的零件，并绕它旋转（F，或双击零件）' : '先选中一个零件（点零件，或双击零件直接凑近）'}
        >
          凑近看
        </button>
        <button
          type="button"
          className="btn"
          disabled={!selected}
          onClick={() => a.hidePart()}
          data-testid="hide-part"
          title={selected ? '隐藏选中的零件，露出它挡住的东西（H）' : '先选中一个零件，再隐藏它'}
        >
          隐藏
        </button>
        <HelpButton />
        {hidden.length > 0 && (
          <button type="button" className="btn" onClick={a.showAll} data-testid="show-all" title="把隐藏的零件全部显示出来">
            全部显示 ({hidden.length})
          </button>
        )}
        {fade.length > 0 && (
          <button type="button" className="btn" onClick={a.clearFade} data-testid="clear-fade" title="把为了看清而变透明的零件恢复">
            恢复遮挡 ({fade.length})
          </button>
        )}
      </div>
    </div>
  )
}

/** 操作说明：鼠标、触屏、键盘一处列全，免得快捷键「有但没人知道」。 */
function HelpButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="btn btn-icon" aria-expanded={open} aria-controls="help-pop" onClick={() => setOpen(!open)} aria-label="操作说明" title="操作说明（鼠标、触屏、键盘）" data-testid="help">
        ?
      </button>
      {open && (
        <div className="help-pop" id="help-pop" role="dialog" aria-label="操作说明">
          <dl>
            <dt>讲解</dt>
            <dd>点工具条上的「讲解」：一环一环看，舞台下方是这一环的说明，时间只在这一环发生的那一小段里慢速循环</dd>
            <dt>鼠标</dt>
            <dd>左键拖动旋转 · 右键拖动平移 · 滚轮朝指针处缩放 · 点零件选中 · 双击零件凑近看 · 点空白取消选中</dd>
            <dt>亲手驱动</dt>
            <dd>光标变成手形的零件可以直接抓住拖动，机器跟着手走（拖动只改时间；拆开时不可拖）。手指落在这些零件上是拖零件，落在别处是转视角</dd>
            <dt>触屏</dt>
            <dd>单指拖动旋转 · 双指张合缩放、双指同向拖动平移 · 双击零件凑近看</dd>
            <dt>键盘</dt>
            <dd>
              <kbd>空格</kbd> 播放/暂停　<kbd>←</kbd>
              <kbd>→</kbd> 逐步，<kbd>Shift</kbd>+<kbd>←</kbd>
              <kbd>→</kbd> 整格　<kbd>E</kbd> 爆炸　<kbd>S</kbd> 剖切　<kbd>F</kbd> 凑近看选中的零件　<kbd>H</kbd> 隐藏选中的零件　<kbd>R</kbd> 全景　<kbd>1</kbd>–<kbd>9</kbd> 切机位　<kbd>[</kbd>
              <kbd>]</kbd> 讲解上一环 / 下一环　<kbd>Esc</kbd> 取消选中（讲解中为退出讲解）
            </dd>
          </dl>
        </div>
      )}
    </>
  )
}

// —— 悬停提示：鼠标停在零件上时就近显示名称 ——
export function HoverTip({ def }: { def: AnyExhibit }) {
  const hovered = useStage((s) => s.hovered)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const wrap = ref.current?.parentElement
    if (!wrap) return
    const on = (e: PointerEvent) => {
      const tip = ref.current
      if (!tip || e.pointerType === 'touch') return
      const r = wrap.getBoundingClientRect()
      const w = tip.offsetWidth
      const x = e.clientX - r.left + 14
      tip.style.transform = `translate(${x + w > r.width - 8 ? e.clientX - r.left - w - 14 : x}px, ${e.clientY - r.top + 18}px)`
    }
    wrap.addEventListener('pointermove', on)
    return () => wrap.removeEventListener('pointermove', on)
  }, [])
  const explode = useStage((s) => s.explode)
  const base = hovered ? splitRef(hovered)[0] : null
  const part = def.parts.find((p) => p.id === base)
  // 可拖零件：名字后面跟提示语（爆炸时不可拖，不提示）
  const drive = explode < 0.001 ? def.drive?.find((d) => d.part === base) : undefined
  return (
    <div ref={ref} className="hover-tip" hidden={!part} role="tooltip" data-testid="hover-tip">
      {part?.name}
      {drive && <span className="hover-hint"> · {drive.hint}</span>}
    </div>
  )
}

// —— 讲解条：舞台下缘，一环一句话 + 上一环 / 播放 / 下一环 / 退出 ——
/** 时间窗的长度（模型时间） */
const durationText = (len: number) =>
  len < 100 ? `${Number(len.toPrecision(2))} 秒` : len < 7200 ? `${Number((len / 60).toPrecision(2))} 分钟` : `${Number((len / 3600).toPrecision(3))} 小时`

const speedLabel = (v: number) => {
  const x = Number(v.toPrecision(v >= 10 ? 3 : 2))
  return x < 1 ? `慢放 ${x}×` : x > 1 ? `快进 ${x}×` : '1×'
}

export function TourBar({ def }: { def: AnyExhibit }) {
  const tour = useStage((s) => s.tour)
  const playing = useStage((s) => s.playing)
  useStage((s) => s.controls) // 控件变了时间窗会重算
  const a = useStageActions()
  if (!tour) return null
  const i = tour.index
  const step = def.chain[i]
  const plan = a.plan()[i]
  const n = def.chain.length
  const isAsm = def.timeline.kind === 'assembly'
  const where = plan ? (isAsm ? `装配 ${Math.round(plan.window[0] * 100)}%–${Math.round(plan.window[1] * 100)}%` : durationText(plan.window[1] - plan.window[0])) : ''
  return (
    <section className="tour-bar" aria-label="讲解" aria-live="polite" data-testid="tour-bar" data-step={step.id}>
      <div className="tour-head">
        <span className="tour-count" data-testid="tour-count">
          {i + 1} / {n}
        </span>
        <h2 className="tour-title" data-testid="tour-title">
          {step.title}
        </h2>
        {plan && (
          <span className="tour-meta" title="这一环在时间轴上发生的一小段，循环播放">
            {speedLabel(plan.speed)} · 循环{isAsm ? ' ' : '一段 '}
            {where}
          </span>
        )}
      </div>
      <p className="tour-text">
        <ProvTag p={step.provenance} />
        {step.text}
      </p>
      <div className="tour-actions">
        <button type="button" className="btn" onClick={() => a.tourNext(-1)} disabled={i === 0} data-testid="tour-prev" title="上一环（[）">
          ‹ 上一环
        </button>
        <button type="button" className="btn btn-primary" onClick={() => a.setPlaying(!playing)} aria-pressed={playing} data-testid="tour-play" title="播放 / 暂停这一环的循环（空格）">
          {playing ? '暂停' : '播放'}
        </button>
        <button type="button" className="btn" onClick={() => a.tourNext(1)} disabled={i === n - 1} data-testid="tour-next" title="下一环（]）">
          下一环 ›
        </button>
        <button type="button" className="btn" onClick={a.exitTour} data-testid="tour-exit" title="退出讲解（Esc）">
          退出
        </button>
      </div>
    </section>
  )
}

// —— 迹线：时间轴上方，每条一行、各自纵轴，横轴与细调条（或主进度条）对齐 ——
const TRACE_ROW = 32

export function Traces({ def }: { def: AnyExhibit }) {
  const traces = def.traces ?? []
  const t = useStage((s) => s.t)
  const controls = useStage((s) => s.controls)
  const { setT, setPlaying } = useStageActions()
  const minor = minorOf(def)
  const domain = traceDomain(def, t)
  const key = traceKey(def, domain, controls)
  const [fetched, setFetched] = useState<TraceSamples | null>(null)
  // 取过的段直接从缓存拿（不经过状态）；没取过的先画上一段（标为「取样中」）
  const samples = cachedTraces(key) ?? fetched
  // 换了一段（下一个小循环）或控件值变了：分片重取。取样放到下一个任务里，不在副作用里同步 setState——
  // 快进时（摆钟讲解「重锤供能」每帧跨过许多个小循环）每帧都换段，同步更新会一帧套一帧，React 报「更新深度超限」。
  useEffect(() => {
    if (traces.length === 0) return
    let alive = true
    let cancel = () => {}
    const timer = setTimeout(() => {
      cancel = sampleTracesAsync(def, controls, domain, (r) => alive && setFetched(r))
    }, 0)
    return () => {
      alive = false
      clearTimeout(timer)
      cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // 横轴对齐时间轴的滑块：量出滑块在本块里的左右位置（滑块圆钮半宽约 8 px）
  const boxRef = useRef<HTMLDivElement>(null)
  const [geo, setGeo] = useState<{ w: number; x0: number; x1: number } | null>(null)
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    const refSel = minor ? '[data-testid="fine"]' : '[data-testid="scrub"]'
    const measure = () => {
      const b = box.getBoundingClientRect()
      const ref = document.querySelector<HTMLElement>(refSel)
      const r = ref?.getBoundingClientRect()
      const next = r && r.width > 40 ? { w: b.width, x0: r.left - b.left + 8, x1: r.right - b.left - 8 } : { w: b.width, x0: 12, x1: b.width - 12 }
      setGeo((g) => (g && Math.abs(g.w - next.w) < 0.5 && Math.abs(g.x0 - next.x0) < 0.5 && Math.abs(g.x1 - next.x1) < 0.5 ? g : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    const ref = document.querySelector(refSel)
    if (ref) ro.observe(ref)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [minor])

  const state = useMemo(() => def.simulate(t, controls), [def, t, controls])
  const ready = samples && samples.domain.start === domain.start && samples.domain.length === domain.length
  const paths = useMemo(() => {
    if (!samples || !geo) return []
    const { x0, x1 } = geo
    return samples.series.map((ser, j) => {
      const [lo, hi] = samples.ranges[j]
      const top = j * TRACE_ROW
      const y = (v: number) => top + TRACE_ROW - 5 - ((v - lo) / (hi - lo)) * (TRACE_ROW - 12)
      // 照样本画折线，不平滑：台阶形就是台阶形
      return ser.map((v, i) => `${i ? 'L' : 'M'}${(x0 + ((x1 - x0) * i) / (ser.length - 1)).toFixed(1)},${y(v).toFixed(1)}`).join('')
    })
  }, [samples, geo])

  if (traces.length === 0) return null
  const H = traces.length * TRACE_ROW
  const u = (t - domain.start) / domain.length
  const inDomain = u >= -1e-9 && u <= 1 + 1e-9
  const cx = geo ? geo.x0 + (geo.x1 - geo.x0) * Math.min(1, Math.max(0, u)) : 0
  // 宽屏：名称与当前值放在滑块左边的空处；窄屏滑块占满整行，放在曲线左上角
  const gutter = geo ? geo.x0 >= 150 : false

  const seek = (clientX: number) => {
    if (!geo || !boxRef.current) return
    const b = boxRef.current.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (clientX - b.left - geo.x0) / (geo.x1 - geo.x0)))
    setPlaying(false)
    setT(domain.start + f * domain.length * (def.timeline.kind === 'cyclic' && !minor ? 0.99999 : 1))
  }

  return (
    <div className="traces" data-testid="traces" data-ready={Boolean(ready)} ref={boxRef}>
      <div className="trace-plot" style={{ height: H }}>
        {geo && (
          <svg
            width={geo.w}
            height={H}
            className="trace-svg"
            role="img"
            aria-label={`迹线：${traces.map((tr) => tr.label).join('、')}。在图上点或拖动等同于拖时间轴`}
            onPointerDown={(e) => {
              ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
              seek(e.clientX)
            }}
            onPointerMove={(e) => {
              if ((e.currentTarget as Element).hasPointerCapture(e.pointerId)) seek(e.clientX)
            }}
          >
            {traces.map((tr, j) => (
              <g key={tr.id} data-trace={tr.id}>
                <rect className="trace-band" x={geo.x0} y={j * TRACE_ROW + 3} width={Math.max(0, geo.x1 - geo.x0)} height={TRACE_ROW - 6} />
                {paths[j] && <path className={`trace-line${ready ? '' : ' is-stale'}`} d={paths[j]} />}
              </g>
            ))}
            {inDomain && <line className="trace-cursor" x1={cx} x2={cx} y1={0} y2={H} />}
            {inDomain &&
              ready &&
              traces.map((tr, j) => {
                const ser = samples!.series[j]
                const [lo, hi] = samples!.ranges[j]
                const v = placeOnSeries(tr.value(state), seriesAt(domain, ser, t), tr.wrap)
                const y = j * TRACE_ROW + TRACE_ROW - 5 - ((v - lo) / (hi - lo)) * (TRACE_ROW - 12)
                return <circle key={tr.id} className="trace-dot" cx={cx} cy={Math.min(j * TRACE_ROW + TRACE_ROW - 2, Math.max(j * TRACE_ROW + 2, y))} r={3.5} />
              })}
          </svg>
        )}
        {traces.map((tr, j) => (
          <span
            key={tr.id}
            className={`trace-label${gutter ? ' in-gutter' : ''}`}
            style={gutter && geo ? { top: j * TRACE_ROW, right: geo.w - geo.x0 + 12 } : { top: j * TRACE_ROW + 2, left: (geo?.x0 ?? 12) + 2 }}
            data-trace-label={tr.id}
          >
            {tr.label} <b className="trace-val">{formatTraceValue(tr.value(state), tr.unit)}</b>
          </span>
        ))}
      </div>
      <details className="trace-notes">
        <summary>怎么读这{traces.length > 1 ? '几' : ''}条线</summary>
        <ul>
          {traces.map((tr) => (
            <li key={tr.id}>
              <ProvTag p={tr.provenance} />
              <b>{tr.label}</b>：{tr.note ?? '随时间的变化，数值出自模型。'}
            </li>
          ))}
          <li>横轴{minor ? `是当前这一${minor.unit}（与下方细调条对齐）` : def.timeline.kind === 'assembly' ? '是装配进度（与下方进度条对齐）' : '是整个周期（与下方进度条对齐）'}；朱红竖线是此刻。在图上点或拖动，等同于拖时间轴。</li>
        </ul>
      </details>
    </div>
  )
}

/** 订阅一条媒体查询（窗口尺寸变化时跟着变） */
function useMediaQuery(q: string): boolean {
  const [on, setOn] = useState(() => {
    try {
      return window.matchMedia(q).matches
    } catch {
      return false
    }
  })
  useEffect(() => {
    let mq: MediaQueryList
    try {
      mq = window.matchMedia(q)
    } catch {
      return
    }
    const f = () => setOn(mq.matches)
    f()
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [q])
  return on
}

// —— 读数 ——
// 栅格：标签在上、数值在下。讲解中默认折成一行（舞台要大），点「展开」看全部；不讲解时默认展开。
export function Readouts({ def }: { def: AnyExhibit }) {
  const snap = useStage((s) => s.snapshot)
  const touring = useStage((s) => s.tour !== null)
  const short = useMediaQuery('(min-width: 961px) and (max-height: 800px)')
  // null = 跟随默认（讲解中、或桌面上屏幕不高时折叠，其余展开）；观众点过之后按观众的来，进出讲解时重新回到默认
  const [pref, setPref] = useState<boolean | null>(null)
  useEffect(() => setPref(null), [touring])
  const open = pref ?? !(touring || short)
  return (
    <div className="readouts" data-testid="readouts" data-open={open}>
      {open ? (
        <dl className="readout-grid" id="readout-grid" aria-label="读数">
          {def.readouts.map((r) => {
            const v = r.value(snap)
            // 长读数（如榫卯「已锁住」的方向清单）独占一行，不把一格撑成六行高
            return (
              <div key={r.label} className={v.length > 26 ? 'wide' : undefined}>
                <dt>{r.label}</dt>
                <dd>
                  {v}
                  <ProvMark p={r.provenance} />
                </dd>
              </div>
            )
          })}
        </dl>
      ) : (
        <div className="readout-brief" id="readout-grid">
          {def.readouts.map((r) => (
            <span key={r.label}>
              <b>{r.label}</b>
              {r.value(snap)}
              <ProvMark p={r.provenance} />
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        className="btn readout-toggle"
        aria-expanded={open}
        aria-controls="readout-grid"
        onClick={() => setPref(!open)}
        data-testid="readouts-toggle"
        title={open ? '把读数折成一行' : '展开全部读数'}
      >
        {open ? '收起读数' : `展开读数（${def.readouts.length}）`}
      </button>
    </div>
  )
}

// —— 协同链 ——
export function ChainPanel({ def }: { def: AnyExhibit }) {
  const active = useStage((s) => s.activeSteps)
  const pinned = useStage((s) => s.pinnedStep)
  const tour = useStage((s) => s.tour)
  const { pinStep, select, lookAtStep, startTour, tourGo } = useStageActions()
  // 讲解换环时，宽屏上把侧栏滚到这一环（窄屏不滚：那会把整页从舞台上滚走）
  const listRef = useRef<HTMLOListElement>(null)
  const tourIndex = tour?.index ?? -1
  useEffect(() => {
    if (tourIndex < 0) return
    try {
      if (!window.matchMedia('(min-width: 961px)').matches) return
      listRef.current?.children[tourIndex]?.scrollIntoView({ block: 'nearest' })
    } catch {
      /* 无关紧要 */
    }
  }, [tourIndex])
  // 折叠：「此刻」的一环、点住的一环、讲解到的一环展开，其余只留标题行；观众点右侧的箭头可单独展开 / 收起某一环
  const [manual, setManual] = useState<Record<string, boolean>>({})
  // 点住一环、讲解切到一环时，这一环以「应当展开」为准，不被之前手动收起的状态拦住
  useEffect(() => {
    const id = pinned ?? (tourIndex >= 0 ? def.chain[tourIndex].id : null)
    if (id) setManual((m) => (id in m ? Object.fromEntries(Object.entries(m).filter(([k]) => k !== id)) : m))
  }, [pinned, tourIndex, def])
  const isJoinery = def.meta.category === 'joinery'
  // 榫卯：逐环累计「已锁住」
  const cumulative = useMemo(() => {
    const acc: Dof[] = []
    return def.chain.map((st) => {
      acc.push(...(st.locks ?? []))
      return [...acc]
    })
  }, [def])
  return (
    <>
      {!tour && (
        <button
          type="button"
          className="btn btn-primary tour-entry"
          onClick={() => {
            startTour(0)
            revealStage()
          }}
          data-testid="tour-start-panel"
        >
          从第一环开始讲解
        </button>
      )}
      <p className="panel-note">
        {tour
          ? '讲解中：点任一环直接讲到那一环。'
          : pinned
            ? '已固定一环（再点一次恢复实时点亮）。'
            : '运行时，正在起作用的一环会实时点亮。点一环可固定并在画面中高亮它的零件。'}
      </p>
      <ol className="chain" data-testid="chain" ref={listRef}>
        {def.chain.map((st, i) => {
          const isActive = active.includes(st.id)
          const open = manual[st.id] ?? (isActive || pinned === st.id || tourIndex === i)
          return (
            <li key={st.id} className={`chain-step${isActive ? ' is-active' : ''}${open ? ' is-open' : ''}`} data-step={st.id} data-active={isActive} data-open={open}>
              <button
                type="button"
                className="chain-head"
                aria-pressed={pinned === st.id}
                onClick={() => {
                  if (tour) {
                    tourGo(i)
                    revealStage()
                    return
                  }
                  select(null)
                  const pin = pinned !== st.id
                  pinStep(pin ? st.id : null)
                  if (pin) {
                    lookAtStep(st.id)
                    revealStage()
                  }
                }}
              >
                <span className="chain-title">
                  {st.title}
                  {isActive && <span className="chain-live">● 此刻</span>}
                </span>
                <span className="chain-body" id={`chain-body-${st.id}`}>
                  <span className="chain-body-in">
                    <span className="chain-text">
                      <ProvTag p={st.provenance} />
                      {st.text}
                    </span>
                    {st.cite && def.sources[st.cite] && (
                      <span className="cite">
                        出处：{def.sources[st.cite].title}：「{def.sources[st.cite].quote}」
                      </span>
                    )}
                    {isJoinery && st.locks && (
                      <span className="locks" aria-label="这一步之后已锁住的方向">
                        {cumulative[i].map((d) => (
                          <span key={d} className="lock" style={st.locks!.includes(d) ? { borderColor: 'var(--ink)', fontWeight: 600 } : undefined}>
                            {DOF_LABEL[d]}
                          </span>
                        ))}
                        {st.locksProvenance && <ProvTag p={st.locksProvenance} />}
                      </span>
                    )}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="btn chain-toggle"
                aria-expanded={open}
                aria-controls={`chain-body-${st.id}`}
                aria-label={`${open ? '收起' : '展开'}：${st.title}`}
                title={open ? '收起这一环的说明' : '展开这一环的说明'}
                onClick={() => setManual((m) => ({ ...m, [st.id]: !open }))}
                data-toggle={st.id}
              >
                <span aria-hidden className="chain-chevron" />
              </button>
              <button
                type="button"
                className="btn chain-look"
                onClick={() => {
                  if (tour) tourGo(i)
                  else {
                    select(null)
                    pinStep(st.id)
                    lookAtStep(st.id, true)
                  }
                  revealStage()
                }}
                aria-label={`看这里：${st.title}`}
                title="镜头凑近这一环的零件"
                data-look={st.id}
              >
                看这里
              </button>
            </li>
          )
        })}
      </ol>
    </>
  )
}

// —— 零件 ——
const GROUP_ORDER: PartGroup[] = ['base', 'structure', 'mechanism', 'control', 'subject']

export function PartsPanel({ def }: { def: AnyExhibit }) {
  const selected = useStage((s) => s.selected)
  const { select, pinStep, focusPart, hidePart, showPart, showAll } = useStageActions()
  const hidden = useStage((s) => s.hidden)
  const [pid, fid] = selected ? splitRef(selected) : [null, undefined]
  const part = def.parts.find((p) => p.id === pid)
  const feature = part?.features?.find((f) => f.id === fid)
  const choose = (ref: string | null) => {
    pinStep(null)
    select(ref)
    if (ref) revealStage()
  }
  return (
    <>
      {part ? (
        <section className="part-detail" aria-live="polite" data-testid="part-detail">
          <h3>{feature ? `${part.name} · ${feature.name}` : part.name}</h3>
          <span className="badge">{GROUP_LABEL[part.group]}</span>
          <p className="role">{feature ? feature.role : part.role}</p>
          <div className="part-actions">
            <button type="button" className="btn" onClick={() => (focusPart(part.id), revealStage())} title="镜头凑近这个零件并绕它旋转（F）" data-testid="focus-part-detail">
              凑近看
            </button>
            {hidden.includes(part.id) ? (
              <button type="button" className="btn" onClick={() => showPart(part.id)} data-testid="show-part-detail" title="重新显示这个零件">
                显示
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => hidePart(part.id)} data-testid="hide-part-detail" title="隐藏这个零件（H）">
                隐藏
              </button>
            )}
          </div>
          <ClaimList claims={feature ? feature.claims : part.claims} def={def} />
          {!feature && part.features?.length ? (
            <ul className="feature-list" aria-label="零件上的特征">
              {part.features.map((f) => (
                <li key={f.id}>
                  <button type="button" className="btn" onClick={() => choose(`${part.id}#${f.id}`)}>
                    {f.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {feature && (
            <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => choose(part.id)}>
              ← 回到{part.name}
            </button>
          )}
        </section>
      ) : (
        <p className="panel-note">在画面里点一个零件，或从下面选择。选中后可以隐藏它，露出后面的东西。</p>
      )}
      {hidden.length > 0 && (
        <p className="panel-note hidden-note">
          已隐藏 {hidden.length} 个零件（列表里标着「已隐藏」，点开可单独显示）。
          <button type="button" className="btn" onClick={showAll} data-testid="show-all-panel">
            全部显示
          </button>
        </p>
      )}
      <div className="part-groups">
        {GROUP_ORDER.filter((g) => def.parts.some((p) => p.group === g)).map((g) => (
          <section key={g}>
            <h3>{GROUP_LABEL[g]}</h3>
            <ul className="part-list">
              {def.parts
                .filter((p) => p.group === g)
                .map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`btn${hidden.includes(p.id) ? ' is-hidden' : ''}`}
                      aria-pressed={pid === p.id}
                      onClick={() => choose(pid === p.id && !fid ? null : p.id)}
                      data-part={p.id}
                      data-hidden={hidden.includes(p.id) || undefined}
                      title={hidden.includes(p.id) ? `${p.name}（已隐藏，点开后可重新显示）` : undefined}
                    >
                      {p.name}
                      {hidden.includes(p.id) && <span className="hidden-mark">已隐藏</span>}
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}

// —— 说明与出处 ——
export function IntroPanel({ def }: { def: AnyExhibit }) {
  const srcs = Object.entries(def.sources)
  return (
    <>
      <ul className="claims">
        {def.intro.map((c, i) => (
          <ClaimItem key={i} claim={c} def={def} />
        ))}
      </ul>
      <h3 style={{ fontSize: 'var(--fs-1)', marginTop: 24 }}>史料原文</h3>
      {srcs.length === 0 ? (
        <p className="panel-note">本展品没有引用史料；文字均为通行复原、本站设定或计算所得。</p>
      ) : (
        <ol className="sources">
          {srcs.map(([k, s]) => (
            <li key={k}>
              {s.title}
              {s.quote && <blockquote>{s.quote}</blockquote>}
              {s.file && <span className="cite">核实原文：{s.file}</span>}
            </li>
          ))}
        </ol>
      )}
      <h3 style={{ fontSize: 'var(--fs-1)', marginTop: 24 }}>出处类别</h3>
      <p className="panel-note" style={{ marginTop: 4 }}>
        读数栏里的出处只用一个字标记（鼠标停上去显示全称）：
      </p>
      <ul className="claims" data-testid="prov-legend">
        {(Object.keys(PROVENANCE_LABEL) as (keyof typeof PROVENANCE_LABEL)[]).map((p) => (
          <li key={p}>
            <ProvMark p={p} />
            <ProvTag p={p} />
            {
              {
                source: '史料原文，引文见 docs/sources/',
                reconstruction: '学界或民间通行的复原、通行做法',
                hypothesis: '复原假说，尚无定论',
                model: '本站为演示所做的设定（尺寸、形制、简化）',
                calc: '由模型计算得到，并有自动测试',
              }[p]
            }
          </li>
        ))}
      </ul>
      <RealObjects list={def.realObjects ?? []} />
      <p className="shortcuts">
        快捷键：<kbd>空格</kbd> 播放/暂停　<kbd>←</kbd>
        <kbd>→</kbd> 逐步　<kbd>E</kbd> 爆炸/复原　<kbd>S</kbd> 剖切　<kbd>Esc</kbd> 取消选中
      </p>
    </>
  )
}

// —— 实物对照 ——
// 他人在 Sketchfab 上以 CC0 / CC BY 发布的真实器物三维模型。默认不向任何第三方发请求：点了按钮才嵌入 iframe；
// 署名行（CC BY 要求）不依赖 iframe，任何时候都显示。
const LICENSE_URL: Record<RealObjectRef['license'], string> = {
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
}

function RealObjects({ list }: { list: RealObjectRef[] }) {
  if (list.length === 0) return null
  return (
    <section className="real-objects" aria-labelledby="real-objects-h" data-testid="real-objects">
      <h3 id="real-objects-h" style={{ fontSize: 'var(--fs-1)', marginTop: 24 }}>
        实物对照
      </h3>
      <p className="panel-note">下面是别人做的真实器物（或复制品）的三维模型，用来和本站的示意模型对着看。它们不是史料，也不是本站所依据的那一件。</p>
      <ul className="real-list">
        {list.map((o) => (
          <RealObjectCard key={o.uid} o={o} />
        ))}
      </ul>
    </section>
  )
}

function RealObjectCard({ o }: { o: RealObjectRef }) {
  const [loaded, setLoaded] = useState(false)
  const ext = { target: '_blank', rel: 'noopener noreferrer' } as const
  const frameId = `real-frame-${o.uid}`
  return (
    <li className="real-card" data-real={o.uid}>
      <p className="real-what">{o.what}</p>
      <p className="real-differs">
        <b>与本展品：</b>
        {o.differs}
      </p>
      <p className="real-credit" data-testid="real-credit">
        《
        <a href={`https://sketchfab.com/3d-models/${o.uid}`} {...ext}>
          {o.title}
        </a>
        》，作者{' '}
        <a href={`https://sketchfab.com/${o.authorSlug}`} {...ext}>
          {o.author}
        </a>
        ，
        <a href={LICENSE_URL[o.license]} {...ext}>
          {o.license}
        </a>
        ，来自 Sketchfab
      </p>
      <div className="real-actions">
        <button type="button" className="btn" aria-expanded={loaded} aria-controls={frameId} onClick={() => setLoaded(!loaded)} data-testid="real-toggle">
          {loaded ? '收起' : '加载三维实物（来自 Sketchfab）'}
        </button>
        {!loaded && <small className="real-note">点击后会从 sketchfab.com 加载内容</small>}
      </div>
      {loaded && (
        <iframe
          id={frameId}
          className="real-frame"
          title={o.title}
          src={`https://sketchfab.com/models/${o.uid}/embed?dnt=1&autostart=1&ui_theme=dark&ui_infos=0&ui_watermark_link=0`}
          allow="autoplay; fullscreen; xr-spatial-tracking"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )}
    </li>
  )
}
