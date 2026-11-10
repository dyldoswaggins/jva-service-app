import { useEffect, useMemo, useState } from 'react'
import { api } from '../data.js'
import { ORDER_LIMIT, fitsModel, locStr, money, num, termsFor } from '../rules.js'

const KIND = { ctr_kit: 'CTR kit', in_ctr: 'In CTR', upgrade: 'Upgrade', billable: 'Billable' }
const STATUS_LABEL = { often_changed: 'Often changed', keep_stock: 'Keep stock', upgrade: 'Systematic upgrade' }
// Which analysis component a billable part belongs to (by its subcategory)
const COMPONENT_OF = {
  Crown: 'Crown', Crystals: 'Crystal', Bezels: 'Bezel', 'Case backs': 'Case back', Gaskets: 'Case', Pushers: 'Case',
  Links: 'Bracelet', Bracelets: 'Bracelet', Straps: 'Bracelet', Clasps: 'Clasp', 'Spring bars': 'Springbars', Hands: 'Hands', Dials: 'Dial',
}
const componentFor = p => (p.cat === 'Movement' ? 'Movement' : COMPONENT_OF[p.sub] || (p.cat === 'Bracelet' ? 'Bracelet' : 'Case'))
const termsForComponent = c => (c === 'Movement' ? ['Worn', 'Damaged'] : termsFor(c))
export const familyOf = cal => (/^\d{4}/.test(cal || '') ? cal.slice(0, 2) + 'xx' : null)

// Parts on a job: the CTR kit (automatic) + anything added. Stock comes off when the job leaves Estimate.
export default function JobParts({ job, allParts, models, can, userId, actions, onChange }) {
  const [kit, setKit] = useState([])
  const [tab, setTab] = useState(null)        // null | in_ctr | upgrade | billable | search
  const [q, setQ] = useState('')
  const [pick, setPick] = useState(null)      // { part, kind, source, qty, component, condition, required }
  const [showKit, setShowKit] = useState(false)
  const [msg, setMsg] = useState('')
  const fam = familyOf(job.calibre)
  const lines = (job.job_parts || []).filter(l => l.state === 'active')
  const kitLines = lines.filter(l => l.kind === 'ctr_kit')
  const extra = lines.filter(l => l.kind !== 'ctr_kit')
  const taken = !!job.stock_taken_at

  useEffect(() => { if (fam) api.loadKit(fam).then(setKit).catch(() => setKit([])); else setKit([]) }, [fam])

  // CTR kit loads by itself for the watchmaker: nothing to enter
  useEffect(() => {
    if (can.bench && job.service_type === 'CTR' && fam && kit.some(k => k.auto) && !kitLines.length && job.status === 'Estimate')
      api.buildKit(job.id).then(n => { if (n) { actions.say(`CTR kit loaded: ${n} parts (${fam})`); onChange() } }).catch(e => setMsg(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, fam, kit.length, kitLines.length, job.service_type])

  const fitsCal = k => !k.only_for?.length || k.only_for.includes(job.calibre)
  const model = useMemo(() => ({ ref: job.watch_ref || '', cal: job.calibre || '' }), [job.watch_ref, job.calibre])
  const confirmed = (job.job_conditions || []).filter(c => c.state === 'confirmed')
  const options = useMemo(() => {
    const P = id => allParts.get(id)
    if (tab === 'in_ctr') return kit.filter(k => !k.auto && ['often_changed', 'keep_stock'].includes(k.status) && fitsCal(k) && P(k.part_id))
      .map(k => ({ part: P(k.part_id), qty: k.qty, hint: STATUS_LABEL[k.status] + (k.note ? ` · ${k.note}` : '') }))
    if (tab === 'upgrade') return kit.filter(k => k.status === 'upgrade' && fitsCal(k) && P(k.part_id))
      .map(k => ({ part: P(k.part_id), qty: k.qty, hint: k.note || 'Systematic upgrade' }))
    if (tab === 'billable') {
      // Parts tagged to this watch first (★), then the most-used case / bracelet / dial parts.
      // Tags grow by themselves: every part used on a job is tagged to that watch ref.
      const s = q.trim().toLowerCase()
      const pool = [...allParts.values()].filter(p => !p.archived && ['Case', 'Bracelet', 'Display'].includes(p.cat) &&
        (!s || String(p.rmc).toLowerCase().includes(s) || String(p.name).toLowerCase().includes(s) || String(p.sub).toLowerCase().includes(s)))
      const tagged = model.ref ? pool.filter(p => fitsModel(p, model)) : []
      const rest = pool.filter(p => !tagged.includes(p)).sort((a, b) => (b.used || 0) - (a.used || 0))
      return [...tagged.map(p => ({ part: p, qty: 1, hint: `★ fits ${model.ref} · ${p.sub}` })),
        ...rest.slice(0, 60).map(p => ({ part: p, qty: 1, hint: `${p.cat} › ${p.sub}${p.used ? ` · used ${p.used}×` : ''}` }))]
    }
    if (tab === 'search') {
      const s = q.trim().toLowerCase()
      if (s.length < 2) return []
      return [...allParts.values()].filter(p => !p.archived && (String(p.rmc).toLowerCase().includes(s) || String(p.name).toLowerCase().includes(s)))
        .slice(0, 60).map(p => ({ part: p, qty: 1, hint: `${p.cat} › ${p.sub}` }))
    }
    return []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, q, kit, allParts, model.ref, model.cal])

  const choose = o => {
    const kind = tab === 'search' ? (['Case', 'Bracelet', 'Display'].includes(o.part.cat) ? 'billable' : 'in_ctr') : tab
    const component = componentFor(o.part)
    const condition = confirmed.find(c => c.component === component)?.term || ''
    setPick({ part: o.part, kind, source: tab === 'search' ? 'search' : 'dropdown', qty: o.qty || 1, component, condition, required: 'required' })
  }
  const onJob = pid => lines.filter(l => l.part_id === pid).reduce((s, l) => s + l.qty, 0)
  const over = pick && ORDER_LIMIT[pick.part.abc] && onJob(pick.part.id) + Number(pick.qty) > ORDER_LIMIT[pick.part.abc]

  async function add() {
    setMsg('')
    try {
      await api.addJobPart({ jobId: job.id, partId: pick.part.id, qty: Number(pick.qty), kind: pick.kind, source: pick.source,
        component: pick.kind === 'billable' ? pick.component : null, condition: pick.kind === 'billable' ? pick.condition : null,
        required: pick.kind === 'billable' ? pick.required : null })
      actions.say(`${pick.part.rmc} added`)
      setPick(null); onChange()
    } catch (e) { setMsg(e.message) }
  }
  async function remove(l) {
    try {
      const back = await api.removeJobPart(l.id)
      actions.say(`${l.rmc} removed${back ? `, ${back} back in stock` : ''}`)
      onChange()
    } catch (e) { setMsg(e.message) }
  }

  const stockCell = p => p ? <>{p.qty ?? '–'}{locStr(p) ? <span className="loc">{locStr(p)}</span> : null}</> : ''
  const lineState = l => !taken ? <span className="msg">comes off when estimate leaves</span>
    : l.short_qty ? <b className="tag warn">{l.short_qty} short · order</b> : <span className="msg">✓ taken</span>
  const alwaysOrder = taken ? kitLines.filter(l => kit.find(k => k.part_id === l.part_id)?.status === 'always_order') : []

  return (
    <section className="panel">
      <div className="actions">
        <h3 className="grow">Parts</h3>
        {can.bench && <button type="button" className="btn solid" onClick={() => setTab(tab ? null : (job.service_type === 'CTR' && kit.length ? 'in_ctr' : 'search'))}>{tab ? 'Close' : '+ Add'}</button>}
      </div>
      {msg && <p className="msg warn">{msg}</p>}

      {job.service_type === 'CTR' && (
        !fam ? <p className="msg">Enter the calibre in Watch details to load the CTR kit.</p>
          : !kit.some(k => k.auto) ? <p className="msg">No CTR list for {fam} yet (Jared). Add parts with + Add.</p>
            : (
              <div className="kitline">
                <button type="button" className="link" onClick={() => setShowKit(!showKit)}>CTR kit ({fam}): {kitLines.length} parts, {num(kitLines.reduce((s, l) => s + l.qty, 0))} units</button>
                <span className="msg"> · automatic · not printed · {taken ? `taken${kitLines.some(l => l.short_qty) ? `, ${kitLines.filter(l => l.short_qty).length} short` : ''}` : 'comes off when the estimate leaves'}</span>
                {showKit && (
                  <table className="imp">
                    <thead><tr><th>Part #</th><th>Name</th><th className="r">Qty</th><th className="r">Stock</th><th>Status</th></tr></thead>
                    <tbody>{kitLines.map(l => { const p = allParts.get(l.part_id); return (
                      <tr key={l.id}><td className="mono b">{l.rmc}</td><td className="d">{p?.name}</td><td className="r">{l.qty}</td><td className="r">{stockCell(p)}</td><td>{lineState(l)}</td></tr>
                    ) })}</tbody>
                  </table>
                )}
              </div>
            )
      )}

      {extra.length > 0 && (
        <table className="imp">
          <thead><tr><th>Part #</th><th>Name</th><th>Type</th><th>Condition</th><th className="r">Qty</th><th className="r">Retail</th><th className="r">Stock</th><th>Status</th><th /></tr></thead>
          <tbody>
            {extra.map(l => { const p = allParts.get(l.part_id); return (
              <tr key={l.id}>
                <td className="mono b">{l.rmc}</td><td className="d" title={p?.name}>{p?.name}</td><td>{KIND[l.kind]}</td>
                <td>{l.kind === 'billable' ? `${l.component} · ${l.condition_term} · ${l.required === 'optional' ? 'Optional' : 'Required'}` : ''}</td>
                <td className="r">{l.qty}</td><td className="r">{l.retail != null ? money(l.retail * l.qty) : '–'}</td>
                <td className="r">{stockCell(p)}</td><td>{lineState(l)}</td>
                <td>{can.bench && <button type="button" className="btn" onClick={() => remove(l)}>Remove</button>}</td>
              </tr>
            ) })}
          </tbody>
        </table>
      )}
      {!extra.length && !kitLines.length && <p className="msg">No parts on this job yet.</p>}

      {alwaysOrder.length > 0 && can.bench && (
        <div className="subpanel">
          <b>Reorder? These kit parts are always ordered after a CTR:</b>
          {alwaysOrder.map(l => { const p = allParts.get(l.part_id); return (
            <label key={l.id} className="tog"><input type="checkbox" checked={!!p?.reorder_req}
              onChange={async e => { await api.requestReorder(l.part_id, e.target.checked); onChange() }} /> {l.rmc} {p?.name} (stock {p?.qty ?? 0})</label>
          ) })}
        </div>
      )}

      {tab && (
        <div className="subpanel">
          <div className="chips small">
            {job.service_type === 'CTR' && kit.length > 0 && <button type="button" className="chip" aria-pressed={tab === 'in_ctr'} onClick={() => setTab('in_ctr')}>In CTR</button>}
            {kit.some(k => k.status === 'upgrade') && <button type="button" className="chip" aria-pressed={tab === 'upgrade'} onClick={() => setTab('upgrade')}>Upgrades</button>}
            <button type="button" className="chip" aria-pressed={tab === 'billable'} onClick={() => setTab('billable')}>Billable ({job.watch_ref || 'set ref'})</button>
            <button type="button" className="chip" aria-pressed={tab === 'search'} onClick={() => setTab('search')}>Search all</button>
          </div>
          {(tab === 'search' || tab === 'billable') && <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={tab === 'billable' ? 'Filter: crystal, crown, 25-…' : 'Part # or name'} />}
          {pick ? (
            <div className="stack">
              <div><b className="mono">{pick.part.rmc}</b> {pick.part.name} · stock {pick.part.qty ?? 0}{(pick.part.qty ?? 0) < Number(pick.qty) ? <b className="tag warn"> order (special order, MRWS)</b> : ''}</div>
              <div className="actions">
                <label className="tog">Qty <input type="number" min="1" value={pick.qty} onChange={e => setPick({ ...pick, qty: e.target.value })} style={{ width: 64 }} /></label>
                <span className="msg">{KIND[pick.kind]}</span>
              </div>
              {pick.kind === 'billable' && (
                <>
                  <div className="chips small"><span className="msg">Component</span>
                    {[...new Set([pick.component, 'Case', 'Bezel', 'Crystal', 'Crown', 'Crown tube', 'Case back', 'Dial', 'Hands', 'Bracelet', 'Clasp', 'Springbars', 'Movement'])].map(c =>
                      <button key={c} type="button" className="chip" aria-pressed={pick.component === c} onClick={() => setPick({ ...pick, component: c, condition: confirmed.find(x => x.component === c)?.term || '' })}>{c}</button>)}
                  </div>
                  <div className="chips small"><span className="msg">Condition</span>
                    {termsForComponent(pick.component).map(t => <button key={t} type="button" className="chip" aria-pressed={pick.condition === t} onClick={() => setPick({ ...pick, condition: t })}>{t}</button>)}
                  </div>
                  <div className="chips small">
                    <button type="button" className="chip" aria-pressed={pick.required === 'required'} onClick={() => setPick({ ...pick, required: 'required' })}>Required</button>
                    <button type="button" className="chip" aria-pressed={pick.required === 'optional'} onClick={() => setPick({ ...pick, required: 'optional' })}>Optional</button>
                  </div>
                </>
              )}
              {over && <p className="msg warn">Over the Rolex limit for class {pick.part.abc} ({ORDER_LIMIT[pick.part.abc]} per job).</p>}
              <div className="actions">
                <button type="button" className="btn solid" disabled={pick.kind === 'billable' && !pick.condition} onClick={add}>Add to job</button>
                <button type="button" className="btn" onClick={() => setPick(null)}>Back</button>
              </div>
            </div>
          ) : (
            <table className="imp">
              <tbody>
                {options.map(o => (
                  <tr key={o.part.id} className="click" onClick={() => choose(o)}>
                    <td className="mono b">{o.part.rmc}</td><td className="d" title={o.part.name}>{o.part.name}</td><td className="msg">{o.hint}</td>
                    <td className="r">{o.part.qty ?? 0}{locStr(o.part) ? <span className="loc">{locStr(o.part)}</span> : ''}</td>
                    <td>{(o.part.qty ?? 0) < 1 ? <b className="tag warn">Order</b> : ''}</td>
                  </tr>
                ))}
                {!options.length && <tr><td className="msg">{tab === 'search' ? 'Type at least 2 characters.' : tab === 'billable' && !job.watch_ref ? 'Set the watch reference first.' : 'Nothing here.'}</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  )
}
