import { useEffect } from 'react'
import { Link } from 'wouter'
import { exhibitMetas } from '../exhibit/registry'
import { CATEGORY_LABEL, type ExhibitMeta } from '../exhibit/types'
import { SiteHeader } from './App'

const CATEGORY_NOTE: Record<ExhibitMeta['category'], string> = {
  mechanism: '力和运动怎样一环一环传下去',
  clock: '怎样把连续的力切成等时的步',
  joinery: '不用钉子，木头怎样互相锁住',
}

export function Home() {
  useEffect(() => {
    document.title = '机巧 · 可拆解的机械与榫卯图解'
  }, [])
  const cats = (Object.keys(CATEGORY_LABEL) as ExhibitMeta['category'][]).filter((c) => exhibitMetas.some((m) => m.category === c))
  return (
    <>
      <SiteHeader />
      <main className="home">
        <section className="home-hero">
          <h1>机巧</h1>
          <p>可以转动、拆开、慢放的三维图解：每个零件是什么、做什么，零件之间怎样协同——运行时，此刻是哪一环在起作用。</p>
        </section>
        {cats.map((c) => (
          <section className="home-section" key={c} aria-labelledby={`cat-${c}`}>
            <h2 id={`cat-${c}`}>
              {CATEGORY_LABEL[c]}
              <small>{CATEGORY_NOTE[c]}</small>
            </h2>
            <ul className="card-grid">
              {exhibitMetas
                .filter((m) => m.category === c)
                .map((m) => (
                  <li key={m.id}>
                    <Link href={`/e/${m.id}`} className="card" data-exhibit={m.id}>
                      {/* 缩略图是装饰（标题已说明内容）：从真实渲染截取（scripts/thumbnails.mjs），深浅主题各一张 */}
                      <span className="card-thumb" aria-hidden>
                        <img className="thumb thumb-light" src={`${import.meta.env.BASE_URL}thumbs/${m.id}-light.jpg`} alt="" width={600} height={400} loading="lazy" decoding="async" />
                        <img className="thumb thumb-dark" src={`${import.meta.env.BASE_URL}thumbs/${m.id}-dark.jpg`} alt="" width={600} height={400} loading="lazy" decoding="async" />
                      </span>
                      <span className="card-body">
                        <span className="era">
                          {m.era}
                          {m.hypothesis && (
                            <>
                              {' '}
                              <span className="badge">复原假说</span>
                            </>
                          )}
                        </span>
                        <h3>{m.title}</h3>
                        <p className="subtitle">{m.subtitle}</p>
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        ))}
        <p className="home-foot">每条陈述都标有出处类别：史料（原文见 docs/sources）、通行复原、假说、本站设定、计算所得。</p>
      </main>
    </>
  )
}
