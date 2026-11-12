// 结构校验：不建几何，只查数据是否自洽。注册表测试对所有展品运行它。
import { assemblyOffsets } from '../kinematics/assembly'
import { evaluateScene, explodeItems, splitRef } from './scene'
import { stepWindow } from './tour'
import type { AnyExhibit, Claim, RealObjectRef } from './types'

/** 收集展品里所有带出处类别的陈述（用于出处审计与界面）。 */
export function allClaims(def: AnyExhibit): { where: string; claim: Claim }[] {
  const out: { where: string; claim: Claim }[] = []
  def.intro.forEach((c, i) => out.push({ where: `intro[${i}]`, claim: c }))
  for (const p of def.parts) {
    p.claims?.forEach((c, i) => out.push({ where: `parts.${p.id}.claims[${i}]`, claim: c }))
    for (const f of p.features ?? [])
      f.claims?.forEach((c, i) => out.push({ where: `parts.${p.id}#${f.id}.claims[${i}]`, claim: c }))
  }
  for (const st of def.chain) out.push({ where: `chain.${st.id}`, claim: { text: st.text, provenance: st.provenance, cite: st.cite } })
  def.readouts.forEach((r, i) =>
    out.push({ where: `readouts[${i}]`, claim: { text: r.label, provenance: r.provenance, cite: r.cite } }),
  )
  def.traces?.forEach((tr) => out.push({ where: `traces.${tr.id}`, claim: { text: tr.note ?? tr.label, provenance: tr.provenance, cite: tr.cite } }))
  return out
}

export function validateExhibit(def: AnyExhibit, dirName?: string): string[] {
  const errs: string[] = []
  const e = (m: string) => errs.push(m)
  const { meta } = def
  if (dirName && meta.id !== dirName) e(`meta.id「${meta.id}」与目录名「${dirName}」不一致`)
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.id)) e(`meta.id「${meta.id}」须为小写短横线格式`)

  const ids = new Set<string>()
  const features = new Map<string, Set<string>>()
  for (const p of def.parts) {
    if (ids.has(p.id)) e(`零件 id 重复：${p.id}`)
    if (p.id.includes('#') || p.id.includes(':')) e(`零件 id 不得含 # 或 :：${p.id}`)
    ids.add(p.id)
    const fs = new Set<string>()
    for (const f of p.features ?? []) {
      if (fs.has(f.id)) e(`零件 ${p.id} 的特征 id 重复：${f.id}`)
      fs.add(f.id)
    }
    features.set(p.id, fs)
    const len = Math.hypot(...p.explode.dir)
    if (p.explode.distance > 0 && Math.abs(len - 1) > 1e-6) e(`零件 ${p.id} 的 explode.dir 须为单位向量（当前长度 ${len}）`)
    if (p.explode.distance < 0) e(`零件 ${p.id} 的 explode.distance 不得为负`)
    if ((p.copies ?? 1) < 1 || !Number.isInteger(p.copies ?? 1)) e(`零件 ${p.id} 的 copies 须为正整数`)
    if ((p.copies ?? 1) > 1 && !p.pose) e(`零件 ${p.id} 有多个副本却没有 pose(s, copy)，副本会重叠`)
  }
  for (const p of def.parts) if (p.explode.with && !ids.has(p.explode.with)) e(`零件 ${p.id} 的 explode.with 指向不存在的 ${p.explode.with}`)

  const checkRef = (ref: string, where: string) => {
    const [pid, fid] = splitRef(ref)
    if (!ids.has(pid)) e(`${where} 引用了不存在的零件 ${pid}`)
    else if (fid && !features.get(pid)!.has(fid)) e(`${where} 引用了不存在的特征 ${ref}`)
  }
  const stepIds = new Set<string>()
  for (const st of def.chain) {
    if (stepIds.has(st.id)) e(`协同链 id 重复：${st.id}`)
    stepIds.add(st.id)
    if (st.parts.length === 0) e(`协同链 ${st.id} 没有零件`)
    st.parts.forEach((r) => checkRef(r, `协同链 ${st.id}`))
    if (st.locks && !st.locksProvenance) e(`协同链 ${st.id} 写了 locks 却没有 locksProvenance`)
  }
  if (def.chain.length === 0) e('协同链为空')

  // 讲解：时间窗、机位、速度
  const viewIdsForTour = new Set((def.views ?? []).map((v) => v.id))
  for (const st of def.chain) {
    if (st.view !== undefined && !viewIdsForTour.has(st.view)) e(`协同链 ${st.id} 的 view 引用了不存在的机位 ${st.view}`)
    if (st.speed !== undefined && !(st.speed > 0)) e(`协同链 ${st.id} 的 speed 须为正`)
    if (st.window) {
      const [a, b] = st.window
      if (!Number.isFinite(a) || !Number.isFinite(b) || !(b > a)) e(`协同链 ${st.id} 的 window 须为有限值且 t0 < t1`)
      else if (def.timeline.kind === 'assembly' && (a < 0 || b > 1)) e(`协同链 ${st.id} 的 window 须在装配进度 [0,1] 内`)
      else if (def.timeline.kind === 'cyclic' && (b - a > def.timeline.period || a < -def.timeline.period || b > 2 * def.timeline.period))
        e(`协同链 ${st.id} 的 window 超出了一个周期`)
    }
    try {
      if (!stepWindow(def, st)) e(`协同链 ${st.id} 推导不出讲解时间窗（在小循环里 active 一直为假）：请写 window`)
    } catch (err) {
      e(`协同链 ${st.id} 推导讲解时间窗时出错：${(err as Error).message}`)
    }
  }

  const viewIds = new Set<string>(['all'])
  for (const v of def.views ?? []) {
    if (viewIds.has(v.id)) e(`机位 id 重复或占用了保留字：${v.id}`)
    viewIds.add(v.id)
    if (!(v.size > 0)) e(`机位 ${v.id} 的 size 须为正`)
    if (v.target.some((x) => !Number.isFinite(x))) e(`机位 ${v.id} 的 target 含非有限值`)
    if (v.explode !== undefined && !(v.explode >= 0 && v.explode <= 1)) e(`机位 ${v.id} 的 explode 须在 [0,1]`)
    for (const id of v.fade ?? []) if (!ids.has(id)) e(`机位 ${v.id} 的 fade 引用了不存在的零件 ${id}`)
    if (v.select) checkRef(v.select, `机位 ${v.id} 的 select`)
    if (v.section === true && !def.section) e(`机位 ${v.id} 写了 section: true，但展品没有 section`)
  }

  const traceIds = new Set<string>()
  if ((def.traces?.length ?? 0) > 3) e('traces 最多 3 条（时间轴上方放不下更多）')
  for (const tr of def.traces ?? []) {
    if (traceIds.has(tr.id)) e(`迹线 id 重复：${tr.id}`)
    traceIds.add(tr.id)
    if (!tr.label) e(`迹线 ${tr.id} 没有 label`)
    if (tr.wrap !== undefined && !(tr.wrap > 0)) e(`迹线 ${tr.id} 的 wrap 须为正`)
  }
  const driveIds = new Set<string>()
  for (const d of def.drive ?? []) {
    if (!ids.has(d.part)) e(`drive 引用了不存在的零件 ${d.part}`)
    if (driveIds.has(d.part)) e(`drive 重复列出零件 ${d.part}`)
    driveIds.add(d.part)
    if (!d.hint) e(`drive ${d.part} 没有提示语`)
    if (d.anchor && d.anchor.some((x) => !Number.isFinite(x))) e(`drive ${d.part} 的 anchor 含非有限值`)
    if (d.scale !== undefined && !(d.scale > 0)) e(`drive ${d.part} 的 scale 须为正`)
    if (d.seek !== undefined && !(d.seek > 0)) e(`drive ${d.part} 的 seek 须为正`)
  }

  errs.push(...validateRealObjects(def.realObjects))

  for (const c of def.controls) if (!(c.key in (def.defaults as object))) e(`控件 ${c.key} 没有初值（defaults）`)
  const tl = def.timeline
  if (tl.speeds.length === 0) e('timeline.speeds 为空')
  if (tl.kind === 'cyclic' && !(tl.period > 0)) e('cyclic 时间轴须有正的 period')
  if (tl.kind === 'assembly' && !(tl.duration > 0)) e('assembly 时间轴须有正的 duration')
  if (tl.kind === 'cyclic' && tl.minor) {
    const n = tl.period / tl.minor.period
    if (!(tl.minor.period > 0) || Math.abs(n - Math.round(n)) > 1e-9) e(`timeline.minor.period 须是 period 的约数（周期 ${tl.period} / 小循环 ${tl.minor.period}）`)
    const off = tl.minor.offset ?? 0
    if (off < 0 || off >= tl.minor.period) e('timeline.minor.offset 须在 [0, minor.period) 内')
    if (!tl.minor.unit) e('timeline.minor.unit 不能为空')
  }
  if (tl.kind === 'cyclic') {
    for (const m of tl.moments ?? []) if (!(m.t >= 0 && m.t < tl.period)) e(`关键瞬间「${m.label}」的 t 须在 [0, period) 内`)
  }
  if (meta.category === 'joinery' && !def.section) e('榫卯展品必须提供 section（带截面的剖切）')
  if (meta.category === 'joinery' && tl.kind !== 'assembly') e('榫卯展品的时间轴应为 assembly')

  for (const [a, b] of def.audit?.contacts ?? []) {
    if (!ids.has(a)) e(`audit.contacts 引用了不存在的零件 ${a}`)
    if (!ids.has(b)) e(`audit.contacts 引用了不存在的零件 ${b}`)
  }

  for (const { where, claim } of allClaims(def)) {
    if (claim.provenance === 'source' && !claim.cite) e(`${where} 标为史料却没有 cite`)
    if (claim.cite && !def.sources[claim.cite]) e(`${where} 的 cite「${claim.cite}」不在 sources 中`)
  }

  // 纯函数性与数值健全：同一时刻求两次必须一致，位姿必须有限
  const span = tl.kind === 'cyclic' ? tl.period : 1
  for (const t of [0, span * 0.37, span * 0.81]) {
    try {
      const a = JSON.stringify(def.simulate(t, def.defaults))
      const b = JSON.stringify(def.simulate(t, def.defaults))
      if (a !== b) e(`simulate(${t}) 两次结果不同：不是纯函数`)
      for (const ex of [0, 1]) {
        const scene = evaluateScene(def, def.simulate(t, def.defaults), ex)
        for (const [key, st] of scene) {
          const nums = [...st.pose.p, ...(st.pose.q ?? [])]
          if (nums.some((x) => !Number.isFinite(x))) e(`零件 ${key} 在 t=${t}、爆炸=${ex} 时位姿非有限值`)
        }
      }
      for (const st of def.chain) st.active?.(def.simulate(t, def.defaults))
      for (const tr of def.traces ?? []) {
        const v = tr.value(def.simulate(t, def.defaults))
        if (typeof v !== 'number' || !Number.isFinite(v)) e(`迹线「${tr.label}」在 t=${t} 时不是有限数`)
      }
      for (const r of def.readouts) {
        const v = r.value(def.simulate(t, def.defaults))
        if (typeof v !== 'string' || v.length === 0) e(`读数「${r.label}」返回空值`)
      }
    } catch (err) {
      e(`求值 t=${t} 时出错：${(err as Error).message}`)
    }
  }
  // 榫卯：装配路径必须就是爆炸路径（pose(s) = rest + 装配偏移）
  if (tl.kind === 'assembly') {
    const items = explodeItems(def)
    for (const p of [0, 0.13, 0.5, 0.77, 1]) {
      const offs = assemblyOffsets(items, p)
      const s = def.simulate(p, def.defaults)
      for (const part of def.parts) {
        const ps = part.pose ? part.pose(s, 0) : part.rest
        const want = part.rest.p.map((x, i) => x + offs[part.id][i])
        if (ps.p.some((x, i) => Math.abs(x - want[i]) > 1e-6))
          e(`零件 ${part.id} 在装配进度 ${p} 的位置不等于 rest + 装配偏移：装配路径须与 explode 一致`)
      }
    }
  }
  return errs
}

const LICENSES = ['CC0', 'CC BY 4.0']

/** 实物对照的结构校验：uid 格式、文字字段非空、许可取值、同一展品 uid 不重复 */
export function validateRealObjects(list: RealObjectRef[] | undefined): string[] {
  const errs: string[] = []
  const seen = new Set<string>()
  ;(list ?? []).forEach((o, i) => {
    const w = `realObjects[${i}]`
    if (!/^[0-9a-f]{32}$/.test(o.uid ?? '')) errs.push(`${w} 的 uid 须为 32 位小写十六进制：${o.uid}`)
    else if (seen.has(o.uid)) errs.push(`${w} 的 uid 重复：${o.uid}`)
    seen.add(o.uid)
    for (const k of ['title', 'author', 'authorSlug', 'what', 'differs'] as const) if (typeof o[k] !== 'string' || o[k].trim() === '') errs.push(`${w} 的 ${k} 不能为空`)
    if (!LICENSES.includes(o.license)) errs.push(`${w} 的 license 只能是 ${LICENSES.join(' 或 ')}：${String(o.license)}`)
  })
  return errs
}
