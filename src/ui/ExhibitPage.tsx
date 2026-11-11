import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Link } from 'wouter'
import { getMeta, loadExhibit } from '../exhibit/registry'
import type { AnyExhibit } from '../exhibit/types'
import { StageContext, createStageStore, useStage, useStageActions, type StageStore } from '../stage/store'
import { SiteHeader, useThemeCtx } from './App'
import { ChainPanel, IntroPanel, PartsPanel, Readouts, Timeline, Toolbar } from './panels'

export function ExhibitPage({ id }: { id: string }) {
  const meta = getMeta(id)
  const [def, setDef] = useState<AnyExhibit | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    loadExhibit(id)
      .then((d) => alive && setDef(d))
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [id])
  useEffect(() => {
    document.title = meta ? `${meta.title} · 机巧` : '机巧'
  }, [meta])

  if (!meta)
    return (
      <>
        <SiteHeader />
        <main className="home">
          <p>没有这个展品：{id}</p>
          <Link href="/">返回展厅</Link>
        </main>
      </>
    )
  return (
    <>
      <SiteHeader>
        <div className="header-title">
          <h1>{meta.title}</h1>
          <span className="sub">{meta.subtitle}</span>
        </div>
      </SiteHeader>
      {error ? (
        <main className="home">
          <p role="alert">展品加载失败：{error}</p>
        </main>
      ) : def ? (
        <ExhibitView def={def} />
      ) : (
        <main className="home">
          <p>正在载入展品…</p>
        </main>
      )}
    </>
  )
}

// 三维展台（three、R3F、manifold）单独分包：首页不需要下载它
const Stage = lazy(() => import('../stage/Stage').then((m) => ({ default: m.Stage })))

type Tab = 'chain' | 'parts' | 'intro'
const TABS: { id: Tab; label: string }[] = [
  { id: 'chain', label: '协同链' },
  { id: 'parts', label: '零件' },
  { id: 'intro', label: '说明与出处' },
]

function ExhibitView({ def }: { def: AnyExhibit }) {
  const store = useMemo(() => createStageStore(def), [def])
  return (
    <StageContext.Provider value={store}>
      <ExhibitLayout def={def} store={store} />
    </StageContext.Provider>
  )
}

function ExhibitLayout({ def, store }: { def: AnyExhibit; store: StageStore }) {
  const { resolved } = useThemeCtx()
  const [tab, setTab] = useState<Tab>('chain')
  const ready = useStage((s) => s.ready)
  const progress = useStage((s) => s.buildProgress)
  const error = useStage((s) => s.error)
  const selected = useStage((s) => s.selected)
  const actions = useStageActions()

  // 在画面里选中零件时切到「零件」页
  useEffect(() => {
    if (selected) setTab('parts')
  }, [selected])

  // 键盘：空格播放/暂停，←→ 逐步，E 爆炸，S 剖切，Esc 取消
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement
      const tag = tgt?.tagName
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
      if (e.key === 'Escape') {
        actions.select(null)
        actions.pinStep(null)
        return
      }
      if (typing || tag === 'BUTTON') return
      const st = store.getState()
      if (e.key === ' ') {
        e.preventDefault()
        actions.togglePlay()
      } else if (e.key === 'ArrowLeft') actions.step(-1, e.shiftKey)
      else if (e.key === 'ArrowRight') actions.step(1, e.shiftKey)
      else if (e.key === 'e' || e.key === 'E') actions.setExplode(st.explode > 0.5 ? 0 : 1)
      else if (e.key === 's' || e.key === 'S') actions.setSection({ on: !st.section.on })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions, store])

  return (
    <div className="exhibit" data-exhibit={def.meta.id}>
      {def.meta.hypothesis && (
        <div className="hypo-banner" role="note">
          复原假说：本展品是对史料的一种解释，不是定论。
        </div>
      )}
      <div className="stage-col">
        <div className="stage-wrap" data-testid="stage" data-ready={ready} data-selected={selected ?? ''}>
          <Suspense fallback={null}>
            <Stage def={def} theme={resolved} label={`${def.meta.title}的三维模型，可拖动旋转、滚轮缩放`} />
          </Suspense>
          {ready && <Toolbar def={def} />}
          {!ready && !error && <div className="stage-status">正在构建几何… {Math.round(progress * 100)}%</div>}
          {error && (
            <div className="stage-status error" role="alert">
              {error}
            </div>
          )}
          <div className="stage-hint">拖动旋转 · 滚轮缩放 · 右键平移 · 点选零件</div>
        </div>
        <Timeline def={def} />
        <Readouts def={def} />
      </div>
      <aside className="aside" aria-label="展品说明">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              className="tab"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => {
                const i = TABS.findIndex((x) => x.id === tab)
                if (e.key === 'ArrowRight') setTab(TABS[(i + 1) % TABS.length].id)
                if (e.key === 'ArrowLeft') setTab(TABS[(i + TABS.length - 1) % TABS.length].id)
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="tabpanel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'chain' && <ChainPanel def={def} />}
          {tab === 'parts' && <PartsPanel def={def} />}
          {tab === 'intro' && <IntroPanel def={def} />}
        </div>
      </aside>
    </div>
  )
}
