// 展品页的各个面板。全部只读 store；运动与读数都来自 simulate 的状态快照。
import { useMemo } from 'react'
import { splitRef } from '../exhibit/scene'
import { DOF_LABEL, GROUP_LABEL, PROVENANCE_LABEL, type AnyExhibit, type Dof, type PartGroup } from '../exhibit/types'
import { timelineSpan, useStage, useStageActions } from '../stage/store'
import { ClaimItem, ClaimList, ProvTag } from './Provenance'

// —— 时间轴 ——
export function Timeline({ def }: { def: AnyExhibit }) {
  const t = useStage((s) => s.t)
  const playing = useStage((s) => s.playing)
  const speed = useStage((s) => s.speed)
  const { togglePlay, setT, setSpeed, setPlaying, step } = useStageActions()
  const tl = def.timeline
  const span = timelineSpan(def)
  const isAsm = tl.kind === 'assembly'
  const label = isAsm ? `装配 ${Math.round(t * 100)}%` : `${t.toFixed(2)} / ${span} 秒`
  return (
    <div className="timeline" role="group" aria-label={isAsm ? '装配进度' : '时间轴'}>
      <button type="button" className="btn btn-primary" onClick={togglePlay} aria-pressed={playing} data-testid="play">
        {playing ? '暂停' : isAsm && t >= 1 ? '重新装配' : '播放'}
      </button>
      <button type="button" className="btn btn-icon" onClick={() => step(-1)} aria-label="后退一步" title="后退一步（←）">
        ‹
      </button>
      <button type="button" className="btn btn-icon" onClick={() => step(1)} aria-label="前进一步" title="前进一步（→）">
        ›
      </button>
      <input
        type="range"
        min={0}
        max={span}
        step={span / 1000}
        value={t}
        aria-label={isAsm ? '装配进度' : '时间'}
        aria-valuetext={label}
        data-testid="scrub"
        onChange={(e) => {
          setPlaying(false)
          setT(Number(e.target.value))
        }}
      />
      <span className="tval" aria-live="off">
        {label}
      </span>
      <label className="field">
        <span>速度</span>
        <select className="select" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} data-testid="speed">
          {tl.speeds.map((v) => (
            <option key={v} value={v}>
              {v}×
            </option>
          ))}
        </select>
      </label>
    </div>
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
  return (
    <div className="stage-overlay">
      <div className="toolgroup">
        <label className="field">
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
      </div>
      {section.on && (
        <div className="toolgroup" role="group" aria-label="剖切设置">
          <select
            className="select"
            value={section.axis}
            onChange={(e) => a.setSection({ axis: e.target.value as typeof section.axis, offset: 0 })}
            aria-label="剖切平面"
          >
            <option value="default">{def.section ? '推荐剖面' : 'Z 向剖面'}</option>
            <option value="x">沿 X 切</option>
            <option value="y">沿 Y 切（水平）</option>
            <option value="z">沿 Z 切</option>
          </select>
          <label className="field">
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
          <button type="button" className="btn" aria-pressed={section.flip} onClick={() => a.setSection({ flip: !section.flip })}>
            反向
          </button>
        </div>
      )}
      {def.controls.length > 0 && (
        <div className="toolgroup">
          {def.controls.map((c) =>
            c.kind === 'toggle' ? (
              <label key={c.key} className="field">
                <input type="checkbox" checked={Boolean(controls[c.key])} onChange={(e) => a.setControl(c.key, e.target.checked)} />
                <span>{c.label}</span>
              </label>
            ) : c.kind === 'range' ? (
              <label key={c.key} className="field">
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
              <label key={c.key} className="field">
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
      <div className="toolgroup" role="group" aria-label="视角">
        <button type="button" className="btn btn-icon" onClick={() => a.nudgeView('orbit', -0.3)} aria-label="向左转">
          ⟲
        </button>
        <button type="button" className="btn btn-icon" onClick={() => a.nudgeView('orbit', 0.3)} aria-label="向右转">
          ⟳
        </button>
        <button type="button" className="btn btn-icon" onClick={() => a.nudgeView('zoom', 0.8)} aria-label="放大">
          ＋
        </button>
        <button type="button" className="btn btn-icon" onClick={() => a.nudgeView('zoom', 1.25)} aria-label="缩小">
          －
        </button>
        <button type="button" className="btn" onClick={a.resetView} data-testid="reset-view">
          取景
        </button>
      </div>
    </div>
  )
}

// —— 读数 ——
export function Readouts({ def }: { def: AnyExhibit }) {
  const snap = useStage((s) => s.snapshot)
  return (
    <dl className="readouts" aria-label="读数" data-testid="readouts">
      {def.readouts.map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd>
            {r.value(snap)} <ProvTag p={r.provenance} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

// —— 协同链 ——
export function ChainPanel({ def }: { def: AnyExhibit }) {
  const active = useStage((s) => s.activeSteps)
  const pinned = useStage((s) => s.pinnedStep)
  const { pinStep, select } = useStageActions()
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
      <p className="panel-note">
        {pinned ? '已固定一环（再点一次恢复实时点亮）。' : '运行时，正在起作用的一环会实时点亮。点一环可固定并在画面中高亮它的零件。'}
      </p>
      <ol className="chain" data-testid="chain">
        {def.chain.map((st, i) => {
          const isActive = active.includes(st.id)
          return (
            <li key={st.id} className={`chain-step${isActive ? ' is-active' : ''}`} data-step={st.id} data-active={isActive}>
              <button
                type="button"
                className="chain-head"
                aria-pressed={pinned === st.id}
                onClick={() => {
                  select(null)
                  pinStep(pinned === st.id ? null : st.id)
                }}
              >
                <span className="chain-title">
                  {st.title}
                  {isActive && <span className="chain-live">● 此刻</span>}
                </span>
                <p className="chain-text">
                  <ProvTag p={st.provenance} />
                  {st.text}
                </p>
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
  const { select, pinStep } = useStageActions()
  const [pid, fid] = selected ? splitRef(selected) : [null, undefined]
  const part = def.parts.find((p) => p.id === pid)
  const feature = part?.features?.find((f) => f.id === fid)
  const choose = (ref: string | null) => {
    pinStep(null)
    select(ref)
  }
  return (
    <>
      {part ? (
        <section className="part-detail" aria-live="polite" data-testid="part-detail">
          <h3>{feature ? `${part.name} · ${feature.name}` : part.name}</h3>
          <span className="badge">{GROUP_LABEL[part.group]}</span>
          <p className="role">{feature ? feature.role : part.role}</p>
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
        <p className="panel-note">在画面里点一个零件，或从下面选择。</p>
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
                    <button type="button" className="btn" aria-pressed={pid === p.id} onClick={() => choose(pid === p.id && !fid ? null : p.id)} data-part={p.id}>
                      {p.name}
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
      <ul className="claims">
        {(Object.keys(PROVENANCE_LABEL) as (keyof typeof PROVENANCE_LABEL)[]).map((p) => (
          <li key={p}>
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
      <p className="shortcuts">
        快捷键：<kbd>空格</kbd> 播放/暂停　<kbd>←</kbd>
        <kbd>→</kbd> 逐步　<kbd>E</kbd> 爆炸/复原　<kbd>S</kbd> 剖切　<kbd>Esc</kbd> 取消选中
      </p>
    </>
  )
}
