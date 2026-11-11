import { PROVENANCE_LABEL, type AnyExhibit, type Claim, type Provenance } from '../exhibit/types'

export function ProvTag({ p }: { p: Provenance }) {
  return (
    <span className={`prov prov-${p}`} title={`出处类别：${PROVENANCE_LABEL[p]}`}>
      {PROVENANCE_LABEL[p]}
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
