import { PROVENANCE_LABEL, type AnyExhibit, type Claim, type Provenance } from '../exhibit/types'

export function ProvTag({ p }: { p: Provenance }) {
  return (
    <span className={`prov prov-${p}`} title={`出处类别：${PROVENANCE_LABEL[p]}`}>
      {PROVENANCE_LABEL[p]}
    </span>
  )
}

/** 出处类别的一字标记（读数栅格等窄处用）；全称在 aria-label 与 title，图例在「说明与出处」页 */
export const PROVENANCE_MARK: Record<Provenance, string> = {
  source: '史',
  reconstruction: '复',
  hypothesis: '假',
  model: '设',
  calc: '算',
}

export function ProvMark({ p }: { p: Provenance }) {
  return (
    <span className={`prov prov-mark prov-${p}`} role="img" aria-label={`出处类别：${PROVENANCE_LABEL[p]}`} title={`出处类别：${PROVENANCE_LABEL[p]}`} data-prov={p}>
      {PROVENANCE_MARK[p]}
    </span>
  )
}

export function ClaimItem({ claim, def }: { claim: Claim; def: AnyExhibit }) {
  const src = claim.cite ? def.sources[claim.cite] : undefined
  return (
    <li>
      <ProvTag p={claim.provenance} />
      {claim.text}
      {src && (
        <span className="cite">
          出处：{src.title}
          {src.quote ? `：「${src.quote}」` : ''}
        </span>
      )}
    </li>
  )
}

export function ClaimList({ claims, def }: { claims?: Claim[]; def: AnyExhibit }) {
  if (!claims?.length) return null
  return (
    <ul className="claims">
      {claims.map((c, i) => (
        <ClaimItem key={i} claim={c} def={def} />
      ))}
    </ul>
  )
}
