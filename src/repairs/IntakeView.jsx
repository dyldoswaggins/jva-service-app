import { useMemo, useState } from 'react'
import { api } from '../data.js'
import { CONDITIONS, JOB_NO, REQUEST_OPTIONS, SERVICE_TYPES, conditionText, modelId } from '../rules.js'
import { makeReceipt, receiptFileName } from '../receipt.js'
import SignaturePad from './SignaturePad.jsx'

const INTAKE_CONDITIONS = CONDITIONS.filter(x => x.intake !== false)
const blank = { edge_no: '', rolex_service_no: '', mrws_ref: '', service_type: 'CTR', watch_ref: '', watch_name: '', calibre: '', serial: '', bracelet: '', dial: '' }

// Sales take in a watch on the iPad: job, watch, visible condition, client requests, signed receipt.
export default function IntakeView({ models, actions, userId, onDone }) {
  const [job, setJob] = useState(blank)
  const [conds, setConds] = useState([])          // [{component, term, note}]
  const [openComp, setOpenComp] = useState(null)
  const [reqs, setReqs] = useState([])            // [{request, note}]
  const [otherReq, setOtherReq] = useState('')
  const [client, setClient] = useState({ name: '', address1: '', address2: '', address3: '' })
  const [sig, setSig] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const set = k => e => setJob({ ...job, [k]: e.target.value })
  const model = useMemo(() => models.get(modelId(job.watch_ref || '-')), [models, job.watch_ref])
  const lookupRef = () => {
    if (model) setJob(j => ({ ...j, watch_ref: model.ref, watch_name: j.watch_name || model.name, calibre: j.calibre || model.cal.split(/[,\s]+/)[0] }))
  }

  const hasCond = (c, t) => conds.some(x => x.component === c && x.term === t)
  const toggleCond = (c, t) => setConds(cs => (hasCond(c, t) ? cs.filter(x => !(x.component === c && x.term === t)) : [...cs, { component: c, term: t, note: '' }]))
  const noteFor = c => conds.find(x => x.component === c)?.note || ''
  const setNote = (c, note) => setConds(cs => cs.map(x => (x.component === c ? { ...x, note } : x)))
  const hasReq = r => reqs.some(x => x.request === r)
  const toggleReq = r => setReqs(rs => (hasReq(r) ? rs.filter(x => x.request !== r) : [...rs, { request: r, note: '' }]))
  const addOther = () => { const r = otherReq.trim(); if (r && !hasReq(r)) setReqs(rs => [...rs, { request: r, note: '' }]); setOtherReq('') }

  const missing = [
    !JOB_NO.test(job.edge_no.trim()) && 'Edge job # (like 124595-001)',
    !job.watch_ref.trim() && 'watch reference',
    !job.serial.trim() && 'serial #',
    !reqs.length && 'at least one client request',
    !client.name.trim() && 'client name',
    !sig && 'client signature',
  ].filter(Boolean)

  async function save() {
    if (missing.length) return setMsg('Still needed: ' + missing.join(', ') + '.')
    setBusy(true); setMsg('')
    const clean = { ...job, edge_no: job.edge_no.trim(), watch_ref: job.watch_ref.trim().toUpperCase() }
    try {
      const pdf = await makeReceipt({ job: clean, client, requests: reqs, conditions: conds, signaturePng: sig })
      const id = await api.createJob(clean, conds, reqs)
      await api.uploadJobDoc(id, 'receipt', pdf, receiptFileName(clean), userId)
      actions.say(`Job ${clean.edge_no} taken in. Receipt saved.`)
      onDone(id, pdf) // the job page offers "Open receipt" to print or share
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="intake">
      <div className="actions"><h2 className="grow">Take in a watch</h2><button type="button" className="btn" onClick={() => onDone(null)}>Cancel</button></div>

      <section className="panel">
        <h3>Job</h3>
        <div className="grid big">
          <label>Edge job #<input value={job.edge_no} onChange={set('edge_no')} inputMode="numeric" placeholder="124595-001" /></label>
          <label>Rolex / WSC #<input value={job.rolex_service_no} onChange={set('rolex_service_no')} /></label>
          <label>MRWS #<input value={job.mrws_ref} onChange={set('mrws_ref')} inputMode="numeric" /></label>
        </div>
        <div className="chips">
          {SERVICE_TYPES.map(t => <button key={t} type="button" className="chip" aria-pressed={job.service_type === t} onClick={() => setJob({ ...job, service_type: t })}>{t}</button>)}
        </div>
      </section>

      <section className="panel">
        <h3>Watch</h3>
        <div className="grid big">
          <label>Reference<input value={job.watch_ref} onChange={set('watch_ref')} onBlur={lookupRef} placeholder="126610LN" autoCapitalize="characters" /></label>
          <label>Model<input value={job.watch_name} onChange={set('watch_name')} placeholder="Submariner Date" /></label>
          <label>Serial #<input value={job.serial} onChange={set('serial')} autoCapitalize="characters" /></label>
          <label>Bracelet<input value={job.bracelet} onChange={set('bracelet')} placeholder="Oyster, steel" /></label>
          <label>Dial<input value={job.dial} onChange={set('dial')} placeholder="Black" /></label>
        </div>
        {model && <p className="msg">{model.ref} · {model.name || 'model'} · calibre {model.cal || 'not set'}{model.ok ? '' : ' (unconfirmed)'}</p>}
      </section>

      <section className="panel">
        <h3>Visible condition</h3>
        <p className="msg">Tap each part, then what you see. The watchmaker confirms every mark during the estimate.</p>
        <div className="chips">
          {INTAKE_CONDITIONS.map(({ c }) => {
            const n = conds.filter(x => x.component === c).length
            return <button key={c} type="button" className="chip" aria-pressed={openComp === c} data-marked={n > 0}
              onClick={() => setOpenComp(openComp === c ? null : c)}>{c}{n ? ` · ${n}` : ''}</button>
          })}
        </div>
        {openComp && (
          <div className="subpanel">
            <b>{openComp}</b>
            <div className="chips">
              {INTAKE_CONDITIONS.find(x => x.c === openComp).t.map(t => (
                <button key={t} type="button" className="chip" aria-pressed={hasCond(openComp, t)} onClick={() => toggleCond(openComp, t)}>{t}</button>
              ))}
            </div>
            {conds.some(x => x.component === openComp) && (
              <input value={noteFor(openComp)} onChange={e => setNote(openComp, e.target.value)} placeholder="Note, e.g. at 2 o'clock" />
            )}
          </div>
        )}
        <p className="msg">{conds.length ? conditionText(conds) : 'No marks noted yet.'}</p>
      </section>

      <section className="panel">
        <h3>Client requests</h3>
        <div className="chips">
          {[...REQUEST_OPTIONS, ...reqs.map(r => r.request).filter(r => !REQUEST_OPTIONS.includes(r))].map(r => (
            <button key={r} type="button" className="chip" aria-pressed={hasReq(r)} onClick={() => toggleReq(r)}>{r}</button>
          ))}
        </div>
        <div className="actions">
          <input value={otherReq} onChange={e => setOtherReq(e.target.value)} placeholder="Other request" onKeyDown={e => e.key === 'Enter' && addOther()} />
          <button type="button" className="btn" onClick={addOther} disabled={!otherReq.trim()}>Add</button>
        </div>
      </section>

      <section className="panel">
        <h3>Client (printed on the receipt only)</h3>
        <div className="grid big">
          <label>Name<input value={client.name} onChange={e => setClient({ ...client, name: e.target.value })} autoComplete="off" /></label>
          <label>Address<input value={client.address1} onChange={e => setClient({ ...client, address1: e.target.value })} autoComplete="off" /></label>
          <label>City, province<input value={client.address2} onChange={e => setClient({ ...client, address2: e.target.value })} autoComplete="off" /></label>
          <label>Phone or postal code<input value={client.address3} onChange={e => setClient({ ...client, address3: e.target.value })} autoComplete="off" /></label>
        </div>
        <p className="msg">The client reads the receipt terms, then signs. Their details are kept only in the signed receipt filed with this job.</p>
        <SignaturePad onChange={setSig} />
      </section>

      <div className="savebar">
        <span className="msg warn">{msg}</span>
        <span className="grow" />
        <button type="button" className="btn solid big" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save and print receipt'}</button>
      </div>
    </div>
  )
}
