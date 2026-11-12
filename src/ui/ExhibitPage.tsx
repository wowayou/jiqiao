import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Link } from 'wouter'
import { getMeta, loadExhibit, relatedMetas } from '../exhibit/registry'
import type { AnyExhibit } from '../exhibit/types'
import { StageContext, createStageStore, useStage, useStageActions, type StageStore } from '../stage/store'
import { SiteHeader, useThemeCtx } from './App'
import { ChainPanel, IntroPanel, PartsPanel, HoverTip, Readouts, Timeline, Toolbar, TourBar, Traces, ViewBar } from './panels'

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
  const tourStep = useStage((s) => (s.tour ? def.chain[s.tour.index].id : ''))
  const actions = useStageActions()
  // 相关展品：只列注册表里真有的（指向尚未制作的展品时不显示死链，也不报错）
  const related = relatedMetas(def.meta)

  // 在画面里选中零件时切到「零件」页；开始讲解时切回「协同链」
  useEffect(() => {
    if (selected) setTab('parts')
  }, [selected])
  useEffect(() => {
    if (tourStep) setTab('chain')
  }, [tourStep])

  // 键盘：空格播放/暂停，←→ 逐步，E 爆炸，S 剖切，Esc 取消
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement
      const tag = tgt?.tagName
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
      if (e.key === 'Escape') {
        // 讲解中 Esc 先退出讲解（恢复进讲解前的设置）
        if (store.getState().tour) {
          actions.exitTour()
          return
        }
        actions.select(null)
        actions.pinStep(null)
        actions.clearFade()
        return
      }
      if (typing) return
      // 点过按钮后焦点还在按钮上：空格/方向键留给按钮与标签页自己，其余快捷键照常
      if (tag === 'BUTTON' && (e.key === ' ' || e.key.startsWith('Arrow'))) return
      const st = store.getState()
      if (e.key === ' ') {
        e.preventDefault()
        actions.togglePlay()
      } else if (e.key === 'ArrowLeft') actions.step(-1, e.shiftKey)
      else if (e.key === 'ArrowRight') actions.step(1, e.shiftKey)
      else if (e.key === 'e' || e.key === 'E') actions.setExplode(st.explode > 0.5 ? 0 : 1)
      else if (e.key === 's' || e.key === 'S') actions.setSection({ on: !st.section.on })
      else if (e.key === 'f' || e.key === 'F') actions.focusPart()
      else if (e.key === 'r' || e.key === 'R') actions.applyView('all')
      else if (e.key === ']' || e.key === '[') {
        const dir = e.key === ']' ? 1 : -1
        if (st.tour) actions.tourNext(dir)
        else actions.startTour(0)
      }
      else if (/^[1-9]$/.test(e.key)) {
        const v = st.def.views?.[Number(e.key) - 1]
        if (v) actions.applyView(v.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions, store])

  return (
    <div className="exhibit" data-exhibit={def.meta.id}>
      {(def.meta.hypothesis || related.length > 0) && (
        <div className="hypo-banner" role={def.meta.hypothesis ? 'note' : undefined}>
          {def.meta.hypothesis && <span>复原假说：本展品是对史料的一种解释，不是定论。</span>}
          {related.length > 0 && (
            <nav className="related" aria-label="相关展品">
              <span>相关展品：</span>
              {related.map((m) => (
                <Link key={m.id} href={`/e/${m.id}`} className="related-link" data-related={m.id}>
                  {m.title}
                </Link>
              ))}
            </nav>
          )}
        </div>
      )}
      <div className="stage-col">
        <div className="stage-wrap" data-testid="stage" data-ready={ready} data-selected={selected ?? ''} data-tour={tourStep}>
          <Suspense fallback={null}>
            <Stage def={def} theme={resolved} label={`${def.meta.title}的三维模型，可拖动旋转、滚轮缩放`} />
          </Suspense>
          {ready && <Toolbar def={def} />}
          {ready && <ViewBar def={def} />}
          {ready && <HoverTip def={def} />}
          {!ready && !error && <div className="stage-status">正在构建几何… {Math.round(progress * 100)}%</div>}
          {error && (
            <div className="stage-status error" role="alert">
              {error}
            </div>
          )}
        </div>
        {ready && <TourBar def={def} />}
        <p className="stage-tip">
          <span className="tip-fine">拖动旋转 · 滚轮朝指针处缩放 · 双击零件凑近看 · 光标变手形的零件可直接拖 · 点「?」看全部操作</span>
          <span className="tip-touch">单指旋转 · 双指缩放平移 · 双击凑近 · 圈出的零件可按住拖 · 「?」更多</span>
        </p>
        <Traces def={def} />
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
