import { useMemo, useState } from 'react'
import { api } from '../data.js'
import { CONDITIONS, conditionText, money, termsFor } from '../rules.js'
import { autoNotes, documentLines, sumLines } from '../docs/lines.js'
import { CITIES, DELIVERY, DELIVERY_WEEKS, NOTES, PAYMENT_METHODS, PROVINCES, REQUESTS, ROLEX_DELIVERY, ROLEX_DUE, SERVICES } from '../savCatalog.js'
import { WeeksField } from './WeeksBox.jsx'

const one = x => (Array.isArray(x) ? x[0] : x) || null
const GST = 0.05
const svcByName = Object.fromEntries(SERVICES.map(s => [s.name, s]))
const num = v => (v === '' || v == null ? null : Number(v))
const tot = sub => ({ sub, gst: Math.round(sub * GST * 100) / 100, total: Math.round(sub * (1 + GST) * 100) / 100 })

// The Intake tab of JVA's "Rolex SAV" page, field for field (Richard, 2026-11-26): Job, Bill to / Deliver to, Watch, Customer
// requests, Watch analysis, Necessary works, Options, Notes, Client's decision, Rolex World Service, Customer invoice extras,
// Delete this intake. Everything saves as soon as you leave a field (as the SAV page does).
// Lines still come from the watchmaker's assessment and the parts; "+ Add service" adds lines from the SAV service list.
// Delete hides the job (never erased, CLAUDE.md §4) after a warning; it can be restored.
// ticks / setTicks: the Options' OK ticks, kept by the job page so they survive switching tabs until the decision is recorded
export default function SavSheet({ job, allParts, userId, who, actions, onChange, statusSelect, onDeleted, ticks = {}, setTicks = () => {} }) {
  const client0 = one(job.job_clients)
  const [msg, setMsg] = useState('')
  const [adding, setAdding] = useState(null) // { kind, service, detail, price, custom, backing }
  const [reqOther, setReqOther] = useState('')
  const [notes, setNotes] = useState(job.estimate_notes ?? autoNotes(job, allParts))
  const [delAsk, setDelAsk] = useState(false)
  const { necessary, optional } = useMemo(() => documentLines(job, allParts), [job, allParts])
  const ok = Object.fromEntries(optional.map(l => [l.key, job.estimate_decision ? l.decision === 'accepted' : !!ticks[l.key]]))
  const setOk = o => setTicks(o)
  const [asking, setAsking] = useState(null) // 'accept' | 'refuse': waiting for "Record decision"

  const run = async (fn, done) => { setMsg(''); try { await fn(); await onChange(); if (done) actions.say(done) } catch (e) { setMsg(e.message) } }
  const now = () => new Date().toISOString()
  const saveJob = (k, v) => { const val = v === '' ? null : v; if ((job[k] ?? null) === val) return; run(() => api.updateJob(job.id, { [k]: val })) }
  const saveClient = (k, v) => { if ((client0?.[k] ?? '') === (v ?? '')) return; run(() => api.saveJobClient(job.id, { [k]: v || null }, !!client0)) }
  // Inputs that save on blur; the key makes them show the saved value after a reload
  const J = (k, p = {}) => <input key={`${k}:${job[k] ?? ''}`} defaultValue={job[k] ?? ''} onBlur={e => saveJob(k, e.target.value.trim())} {...p} />
  const C = (k, p = {}) => <input key={`c-${k}:${client0?.[k] ?? ''}`} defaultValue={client0?.[k] ?? ''} onBlur={e => saveClient(k, e.target.value.trim())} {...p} />
  const sel = (value, list, onPick, first = '') => (
    <select value={value || ''} onChange={e => onPick(e.target.value)}>
      <option value="">{first}</option>
      {value && !list.includes(value) && <option>{value}</option>}
      {list.map(v => <option key={v}>{v}</option>)}
    </select>
  )

  // ---- lines ----
  const extras = job.extra_lines || []
  const rolexPrices = job.rolex_prices || {}
  const setPrice = (l, v) => {
    const n = num(v)
    if ((l.price ?? null) === n) return
    run(async () => {
      if (l.source === 'ctr') await api.updateJob(job.id, { ctr_price: n })
      else if (l.source === 'polish') await api.updateJob(job.id, { polish_price: n })
      else if (l.source === 'vintage') await api.updateJob(job.id, { vintage_fee: n })
      else if (l.source === 'part') await api.setJobPartPrice(l.id, n == null ? null : Math.round((n / (l.qty || 1)) * 100) / 100)
      else await api.updateJob(job.id, { extra_lines: extras.map(x => (x.id === l.id ? { ...x, price: n } : x)) })
    })
  }
  const setRolex = (l, v) => { const n = num(v); if ((rolexPrices[l.key] ?? null) === n) return; run(() => api.updateJob(job.id, { rolex_prices: { ...rolexPrices, [l.key]: n } })) }
  const setDetail = (l, v) => { const x = extras.find(y => y.id === l.id); if (!x || (x.details || '') === v) return; run(() => api.updateJob(job.id, { extra_lines: extras.map(y => (y.id === l.id ? { ...y, details: v || null } : y)) })) }
  const removeLine = l => run(() => api.updateJob(job.id, { extra_lines: extras.filter(x => x.id !== l.id) }), `${l.label} removed`)
  const findings = (job.job_conditions || []).filter(c => c.state === 'confirmed')
  const addLine = () => {
    const a = adding, label = a.service.trim()
    if (!label) return setMsg('Pick or type the service.')
    const [component, term] = a.kind === 'optional' ? (a.backing || '').split('|') : []
    if (a.kind === 'optional' && !term) return setMsg('Options must be backed by a finding in the watch analysis: pick one.')
    run(async () => {
      await api.updateJob(job.id, { extra_lines: [...extras, { id: crypto.randomUUID(), label, details: a.detail.trim() || null, price: num(a.price), kind: a.kind, component: component || null, term: term || null }] })
      setAdding(null)
    }, `${label} added`)
  }

  const renderLines = (kind, lines) => {
    const isOpt = kind === 'optional', t = tot(sumLines(lines))
    const add = adding?.kind === kind ? adding : null
    const svc = add && svcByName[add.service]
    return (
      <>
        <div className="sav-items">
          <div className={`li head${isOpt ? ' opt' : ''}`}>{isOpt && <span>OK</span>}<span>Service</span><span>Part / detail</span><span>Client price</span><span>Rolex price</span><span /></div>
          {lines.map(l => {
            const ex = l.source === 'extra' && !l.rolex
            return (
              <div key={l.key} className={`li${isOpt ? ' opt' : ''}`}>
                {isOpt && <span className="chk"><input type="checkbox" aria-label="Client accepted" checked={!!ok[l.key]} disabled={!!job.estimate_decision}
                  onChange={e => setOk({ ...ok, [l.key]: e.target.checked })} /></span>}
                <span className="svc">{l.label}</span>
                {ex ? <input key={`d:${l.key}:${l.subs?.join() || ''}`} defaultValue={(l.subs || []).join('. ')} placeholder="Optional detail" aria-label="Part or detail" onBlur={e => setDetail(l, e.target.value.trim())} />
                  : <span className="det">{[...(l.subs || []), ...(l.parts || [])].join('. ')}</span>}
                <input type="number" step="0.01" min="0" aria-label="Client price" key={`p:${l.key}:${l.price ?? ''}`} defaultValue={l.price ?? ''} onBlur={e => setPrice(l, e.target.value)} />
                <input type="number" step="0.01" min="0" aria-label="Rolex price" key={`r:${l.key}:${rolexPrices[l.key] ?? ''}`} defaultValue={rolexPrices[l.key] ?? ''} onBlur={e => setRolex(l, e.target.value)} />
                {ex ? <button type="button" className="x" aria-label={`Remove ${l.label}`} onClick={() => removeLine(l)}>×</button>
                  : <span className="msg" title={l.source === 'part' ? 'Part line: change it in Parts' : 'Set at intake'}>{l.source === 'part' ? 'part' : ''}</span>}
              </div>
            )
          })}
          {!lines.length && <p className="msg">{isOpt ? 'There are no optional services recommended at this time.' : 'No services yet.'}</p>}
        </div>
        {add ? (
          <div className={`li adding${isOpt ? ' opt' : ''}`}>
            {isOpt && <span />}
            {add.custom
              ? <input autoFocus value={add.service} placeholder="Type service name" onChange={e => setAdding({ ...add, service: e.target.value })} aria-label="Service" />
              : <select value={add.service} aria-label="Service" onChange={e => {
                  const v = e.target.value
                  if (v === '__custom') return setAdding({ ...add, service: '', custom: true })
                  const s = svcByName[v]
                  setAdding({ ...add, service: v, price: s ? String(s.price || '') : '', detail: s?.details.length === 1 ? s.details[0] : '' })
                }}>
                  <option value="" />
                  {SERVICES.map(s => <option key={s.name}>{s.name}</option>)}
                  <option value="__custom">Other (type)…</option>
                </select>}
            <input list={`dd-${kind}`} value={add.detail} placeholder={svc?.details.length ? 'Pick or type part…' : 'Optional detail'} onChange={e => setAdding({ ...add, detail: e.target.value })} aria-label="Part or detail" />
            <datalist id={`dd-${kind}`}>{(svc?.details || []).map(d => <option key={d} value={d} />)}</datalist>
            <input type="number" step="0.01" min="0" value={add.price} onChange={e => setAdding({ ...add, price: e.target.value })} aria-label="Client price" />
            <span />
            <span />
            {isOpt && (
              <label className="backing">Backed by finding
                <select value={add.backing} onChange={e => setAdding({ ...add, backing: e.target.value })}>
                  <option value="">{findings.length ? 'Pick a finding…' : 'No confirmed finding yet'}</option>
                  {findings.map(c => <option key={c.id} value={`${c.component}|${c.term}`}>{c.component}: {c.term}</option>)}
                </select>
              </label>
            )}
            <div className="actions"><button type="button" className="btn solid small" onClick={addLine}>Add</button><button type="button" className="btn small" onClick={() => setAdding(null)}>Cancel</button></div>
          </div>
        ) : (
          <div className="pick"><button type="button" className="btn small" onClick={() => setAdding({ kind, service: '', detail: '', price: '', custom: false, backing: '' })}>+ Add {isOpt ? 'option' : 'service'}</button></div>
        )}
        <div className="tot"><span>Services/Supplies Total</span><span>{money(t.sub)}</span><span>GST 5%</span><span>{money(t.gst)}</span><b>TOTAL CAD</b><span><b>{money(t.total)}</b></span></div>
      </>
    )
  }

  // ---- client's decision (recorded once, like "Record paper decision"; declined parts go back to stock) ----
  const estimateFiled = (job.job_docs || []).some(d => d.kind === 'estimate')
  const decide = refused => {
    if (job.estimate_decision) return
    if (!estimateFiled) return setMsg('Create the estimate first (Estimate tab → Create estimate), then record the decision.')
    setAsking(null)
    const acc = refused ? [] : optional.filter(l => ok[l.key])
    const decl = optional.filter(l => refused || !ok[l.key])
    run(() => api.recordDecision(job.id, {
      refused,
      accepted: [...necessary, ...acc].filter(l => l.source === 'part' && !refused).map(l => l.id),
      declined: [...decl, ...(refused ? necessary : [])].filter(l => l.source === 'part').map(l => l.id),
      extra: extras.map(x => ({ ...x, decision: x.kind === 'optional' ? (acc.some(l => l.id === x.id) ? 'accepted' : 'declined') : (refused ? 'declined' : 'accepted') })),
    }), refused ? 'Estimate refused' : 'Estimate accepted')
  }

  // ---- Rolex World Service + comparison ----
  const ws = job.rolex_ws || {}
  const saveWs = (k, v) => { const val = v === '' ? null : v; if ((ws[k] ?? null) === val) return; run(() => api.updateJob(job.id, { rolex_ws: { ...ws, [k]: val } })) }
  const W = (k, p = {}) => <input key={`w-${k}:${ws[k] ?? ''}`} defaultValue={ws[k] ?? ''} onBlur={e => saveWs(k, e.target.value.trim())} {...p} />
  const acceptedLines = job.estimate_decision === 'refused' ? [] : [...necessary, ...optional.filter(l => (job.estimate_decision ? l.decision === 'accepted' : ok[l.key]))]
  const clientTotal = sumLines(acceptedLines)
  const rolexCost = acceptedLines.reduce((s, l) => s + (Number(rolexPrices[l.key]) || 0), 0) + (Number(ws.shipping) || 0)

  // ---- requests and findings ----
  const reqs = job.job_requests || []
  const addReq = r => r && run(() => api.addRequest({ job_id: job.id, request: r, by_user: userId }), `Request added: ${r}`)
  const conds = findings
  const addCond = v => { if (!v) return; const [component, term] = v.split('|'); run(() => api.addCondition({ job_id: job.id, component, term, source: 'bench', state: 'confirmed', by_user: userId, confirmed_by: userId, confirmed_at: now() }), `${component} ${term.toLowerCase()} added`) }
  const dropCond = c => run(() => api.updateCondition(c.id, { state: 'not_present', confirmed_by: userId, confirmed_at: now() }), `${c.component} ${c.term.toLowerCase()} removed`)
  const waiting = (job.job_conditions || []).filter(c => c.state === 'to_confirm').length

  return (
    <div className="sav-sheet">
      {msg && <p className="msg warn" role="alert">{msg}</p>}

      <section className="panel">
        <h3>Job</h3>
        <div className="grid">
          <label>Our Ref #<span className="val mono">{job.edge_no}</span></label>
          <label>Estimate date{J('estimate_date', { type: 'date' })}</label>
          <label>Status{statusSelect}</label>
          <label>Taken in by<span className="val">{job.intake_staff_name || who(job.intake_by) || '—'}</span></label>
          <label>Confirmation date{J('confirmation_date', { type: 'date' })}</label>
          <label className="suggest-field">Service lead time (confirmation)<WeeksField key={job.lead_time || ''} initial={job.lead_time} onSave={x => saveJob('lead_time', x)} /></label>
          <label>Invoice date{J('invoice_date', { type: 'date' })}</label>
        </div>
      </section>

      <section className="panel">
        <h3>Bill to / Deliver to</h3>
        <div className="grid">
          <label className="wide">Client name{C('name')}</label>
          <label className="wide">Address{C('address1')}</label>
          <label>City{C('city', { list: 'dl-city', placeholder: client0?.address2 || '' })}</label>
          <label>Province{sel(client0?.province, PROVINCES, v => saveClient('province', v))}</label>
          <label>Postal code{C('postal_code', { className: 'mono' })}</label>
          <label>Phone{C('phone', { type: 'tel' })}</label>
          <label className="wide">Email{C('email', { type: 'email' })}</label>
          <label>Delivery{sel(client0?.delivery, DELIVERY, v => saveClient('delivery', v))}</label>
        </div>
        <datalist id="dl-city">{CITIES.map(v => <option key={v} value={v} />)}</datalist>
      </section>

      <section className="panel">
        <h3>Watch</h3>
        <div className="grid">
          <label>Model number{J('watch_ref', { className: 'mono', placeholder: '116333' })}</label>
          <label>Model name{J('watch_name', { placeholder: 'Datejust II' })}</label>
          <label>Serial #{J('serial', { className: 'mono' })}</label>
          <label>Bracelet{J('bracelet_ref', { className: 'mono', placeholder: '20-72213-21' })}</label>
          <label>Dial{J('dial_ref', { className: 'mono', placeholder: '13/116338-15' })}</label>
          <label>Era / CTR{sel(job.classification, ['Modern', 'Classic', 'Vintage'], v => saveJob('classification', v))}</label>
          <label className="wide">Accessories received{J('accessories', { placeholder: 'Box, papers, extra links, strap' })}</label>
        </div>
      </section>

      <section className="panel">
        <h3>Customer requests</h3>
        <div className="pick">
          <select value="" aria-label="Add a customer request" onChange={e => addReq(e.target.value)}>
            <option value="">+ Add a request…</option>
            {REQUESTS.filter(r => !reqs.some(x => x.request.toLowerCase() === r.toLowerCase())).map(r => <option key={r}>{r}</option>)}
          </select>
          <input value={reqOther} onChange={e => setReqOther(e.target.value)} placeholder="Other request" aria-label="Other request" />
          <button type="button" className="btn small" disabled={!reqOther.trim()} onClick={() => { addReq(reqOther.trim()); setReqOther('') }}>Add</button>
        </div>
        <div className="sav-text">{reqs.length ? reqs.map((r, i) => (
          <span key={r.id}>{i ? ', ' : ''}{i ? r.request.replace(/^./, c => c.toLowerCase()) : r.request}
            <span className="msg"> ({r.state === 'to_review' ? 'watchmaker to review' : r.state === 'included' ? 'included' : `not included${r.reason ? `: ${r.reason}` : ''}`})</span></span>
        )) : <span className="msg">No requests yet.</span>}</div>
        <p className="hint">New requests go to the watchmaker to include in the estimate or not.</p>
      </section>

      <section className="panel">
        <h3>Watch analysis</h3>
        <div className="pick">
          <select value="" aria-label="Add a condition" onChange={e => addCond(e.target.value)}>
            <option value="">+ Add a condition…</option>
            {CONDITIONS.map(({ c }) => (
              <optgroup key={c} label={c}>
                {termsFor(c).filter(t => !conds.some(x => x.component === c && x.term === t)).map(t => <option key={t} value={`${c}|${t}`}>{c} {t.toLowerCase()}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="sav-text">{conds.length ? conditionText(conds) + '.' : <span className="msg">Nothing confirmed yet.</span>}</div>
        {conds.length > 0 && <div className="chips small">{conds.map(c => <span key={c.id} className="chip">{c.component}: {c.term}<button type="button" className="x" aria-label={`Remove ${c.component} ${c.term}`} onClick={() => dropCond(c)}>×</button></span>)}</div>}
        {waiting > 0 && <p className="hint">{waiting} condition{waiting === 1 ? '' : 's'} noted at intake still to be confirmed by the watchmaker.</p>}
      </section>

      <section className="panel">
        <h3>Necessary works</h3>
        <p className="hint">Lines from the watchmaker's assessment, the parts and the service price, plus anything added here. Pick a service; the price fills from JVA's list and stays editable. "Rolex price" is what Rolex charges J. Vair (from their estimate or invoice).</p>
        {renderLines('necessary', necessary)}
      </section>

      <section className="panel">
        <h3>Options</h3>
        <p className="hint">Optional services the client can tick on the estimate. Tick OK when the client accepts one; it then moves onto the confirmation and invoice when the decision is recorded.</p>
        {renderLines('optional', optional)}
      </section>

      <section className="panel">
        <h3>Notes</h3>
        <div className="pick">
          <select value="" aria-label="Add a note" onChange={e => { const v = e.target.value; if (!v) return; const t = notes.trim() ? `${notes.trim()}\n${v}` : v; setNotes(t); saveJob('estimate_notes', t) }}>
            <option value="">+ Add a note…</option>
            {NOTES.map(n => <option key={n} value={n}>{n.length > 90 ? n.slice(0, 88) + '…' : n}</option>)}
          </select>
          <button type="button" className="btn small" onClick={() => { const t = autoNotes(job, allParts); setNotes(t); saveJob('estimate_notes', t) }}>Rewrite from findings</button>
        </div>
        <textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => saveJob('estimate_notes', notes)} aria-label="Notes" />
        <p className="hint">The exchange-basis notice always prints first on the estimate and confirmation.</p>
      </section>

      <section className="panel">
        <h3>Client's decision</h3>
        <div className="decision">
          <label><input type="radio" name={`dec-${job.id}`} checked={!job.estimate_decision && !asking} disabled={!!job.estimate_decision} onChange={() => setAsking(null)} /> Waiting</label>
          <label><input type="radio" name={`dec-${job.id}`} disabled={!!job.estimate_decision} checked={job.estimate_decision === 'accepted' || asking === 'accept'} onChange={() => setAsking('accept')} /> Accepts the estimate</label>
          <label><input type="radio" name={`dec-${job.id}`} disabled={!!job.estimate_decision} checked={job.estimate_decision === 'refused' || asking === 'refuse'} onChange={() => setAsking('refuse')} /> Refuses all work</label>
        </div>
        {asking && !job.estimate_decision && (
          <div className="confirmbar" role="alertdialog" aria-label="Record the client's decision?">
            <b>{asking === 'refuse' ? 'Record: the client refuses all work?' : `Record: the client accepts the estimate (${money(sumLines(necessary))})${optional.some(l => ok[l.key]) ? ` with ${optional.filter(l => ok[l.key]).map(l => l.label).join(', ')}` : ', no options'}?`}</b>
            <span>Recorded once: declined parts go back to stock and the confirmation follows this decision.</span>
            <div className="actions"><button type="button" className="btn solid" onClick={() => decide(asking === 'refuse')}>Record decision</button><button type="button" className="btn" onClick={() => setAsking(null)}>Cancel</button></div>
          </div>
        )}
        <p className="hint">{job.estimate_decision ? 'Decision recorded (declined parts went back to stock).' : 'Tick the accepted options above first. Online signing: Estimate tab.'}</p>
        <div className="grid">
          <label className="wide">Remarks{J('decision_remarks')}</label>
          <label>Delivery weeks (estimate){J('delivery_weeks', { list: 'dl-weeks', placeholder: '5 to 6' })}</label>
          <label>Signed by{J('signed_by')}</label>
          <label>Signed date{J('signed_date', { type: 'date' })}</label>
        </div>
        <datalist id="dl-weeks">{DELIVERY_WEEKS.map(v => <option key={v} value={v} />)}</datalist>
      </section>

      <section className="panel">
        <h3>Rolex World Service</h3>
        <p className="hint">Reference numbers and costs from Rolex Canada's confirmation and invoice.</p>
        <div className="grid">
          <label>Sent to Rolex{W('sent', { type: 'date' })}</label>
          <label>Confirmation n°{W('conf_no', { className: 'mono', placeholder: '0000345833_002' })}</label>
          <label>Confirmation date{W('conf_date', { type: 'date' })}</label>
          <label>Due date{sel(ws.due, ROLEX_DUE, v => saveWs('due', v))}</label>
          <label>Delivery mode{sel(ws.mode, ROLEX_DELIVERY, v => saveWs('mode', v))}</label>
          <label>Service / invoice n°{W('inv_no', { className: 'mono', placeholder: '0000346816 / 6400028744' })}</label>
          <label>Rolex invoice date{W('inv_date', { type: 'date' })}</label>
          <label>Rolex shipping costs{W('shipping', { type: 'number', step: '0.01', className: 'mono' })}</label>
          <label>Returned to store{W('returned', { type: 'date' })}</label>
        </div>
        <div className="compare">
          <div><small>Client total (pre-tax)</small><strong>{money(clientTotal)}</strong></div>
          <div><small>Rolex cost incl. shipping</small><strong>{money(rolexCost)}</strong></div>
          <div><small>Difference</small><strong>{money(clientTotal - rolexCost)}</strong></div>
        </div>
      </section>

      <section className="panel">
        <h3>Customer invoice extras</h3>
        <div className="grid">
          <label>Shipping charged to client{J('inv_shipping', { type: 'number', step: '0.01', className: 'mono' })}</label>
          <label>Payment method{sel(job.payment_method, PAYMENT_METHODS, v => saveJob('payment_method', v))}</label>
        </div>
      </section>

      {!job.deleted_at && (
        <div className="pick">
          {!delAsk ? <button type="button" className="btn danger" onClick={() => setDelAsk(true)}>Delete this intake</button> : (
            <div className="confirmbar" role="alertdialog" aria-label="Delete this intake?">
              <b>Delete intake {job.edge_no}?</b>
              <span>It disappears from the job list, dashboards and to-do lists. Nothing is erased: it can be restored from the "Deleted" filter.</span>
              <div className="actions">
                <button type="button" className="btn danger solid" onClick={() => run(async () => { await api.updateJob(job.id, { deleted_at: now(), deleted_by: userId }); setDelAsk(false); onDeleted?.() }, `Intake ${job.edge_no} deleted`)}>Delete</button>
                <button type="button" className="btn" onClick={() => setDelAsk(false)}>Keep</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
