import { createContext, useContext } from 'react'
import { Link, Route, Router, Switch } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'
import { ExhibitPage } from './ExhibitPage'
import { Home } from './Home'
import { useTheme, type ThemePref } from './theme'

const ThemeCtx = createContext<ReturnType<typeof useTheme> | null>(null)
export const useThemeCtx = () => useContext(ThemeCtx)!

const NEXT: Record<ThemePref, ThemePref> = { auto: 'light', light: 'dark', dark: 'auto' }
const LABEL: Record<ThemePref, string> = { auto: '跟随系统', light: '浅色', dark: '深色' }

export function ThemeButton() {
  const { pref, setPref } = useThemeCtx()
  return (
    <button type="button" className="btn theme-btn" onClick={() => setPref(NEXT[pref])} title="切换主题（跟随系统 / 浅色 / 深色）" aria-label={`主题：${LABEL[pref]}，点击切换`}>
      <span className="theme-prefix">主题：</span>
      {LABEL[pref]}
    </button>
  )
}

export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="机巧 · 返回展厅">
        <span className="brand-seal" aria-hidden />
        机巧
      </Link>
      {children ?? <span className="header-spacer" />}
      <ThemeButton />
    </header>
  )
}

export default function App() {
  const theme = useTheme()
  return (
    <ThemeCtx.Provider value={theme}>
      <Router hook={useHashLocation}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/e/:id">{(p) => <ExhibitPage id={p.id} key={p.id} />}</Route>
          <Route>
            <SiteHeader />
            <main className="home">
              <p>没有这个页面。</p>
              <Link href="/">返回展厅</Link>
            </main>
          </Route>
        </Switch>
      </Router>
    </ThemeCtx.Provider>
  )
}
