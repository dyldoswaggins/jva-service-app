import { useRef, useState } from 'react'
import { api } from '../data.js'
import { money } from '../rules.js'
import { tc } from '../docs/lines.js'

export const UPLOAD_LABELS = ['Rolex estimate', 'Rolex confirmation', 'Rolex invoice', 'Rolex delivery note / shipping label', 'Email / correspondence',
  'Signed estimate (scan)', 'Chronoscope printout', 'Warranty card', 'Photo', 'Other']
const digits = s => String(s || '').replace(/\D/g, '')

// Office: upload any document to the job. A Rolex estimate (PDF from Rolex Toronto) is read and, after a check, becomes the
// lines of JVA's estimate (same JVA template; client price = Rolex's max. public price; Rolex's invoiced price kept for the record).
export default function JobUploads({ job, userId, actions, onChange }) {
  const [label, setLabel] = useState(job.status === 'Sent to Toronto' || job.classification === 'Vintage' ? 'Rolex estimate' : 'Other')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [review, setReview] = useState(null) // { doc, data }
  const [ship, setShip] = useState(false)
  const fileRef = useRef(null)

  const readRolex = async (blob, doc) => {
    const { readRolexPdf } = await import('../docs/rolexImport.js')
    const data = await readRolexPdf(blob)
    if (data.kind !== 'estimate') throw new Error(data.kind ? `This is a Rolex ${data.kind}, not an estimate. It's filed on the job.` : 'This PDF could not be read as a Rolex estimate. It is filed on the job.')
    setShip(false); setReview({ doc, data })
  }
  async function upload(e) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setBusy('Uploading…'); setMsg('')
    try {
      const doc = await api.uploadJobFile(job.id, file, label, note.trim(), userId)
      actions.say(`${file.name} added to the job`); setNote(''); onChange()
      if (label === 'Rolex estimate' && /pdf/i.test(file.type || file.name)) { setBusy('Reading Rolex estimate…'); await readRolex(file, doc) }
    } catch (err) { setMsg(err.message) } finally { setBusy('') }
  }
  // Re-read a Rolex estimate already on the job (e.g. a revised _002)
  JobUploads.convert = async doc => { setBusy('Reading Rolex estimate…'); setMsg(''); try { await readRolex(await api.jobDocFile(doc), doc) } catch (err) { setMsg(err.message) } finally { setBusy('') } }

  async function apply() {
    const d = review.data
    setBusy('Converting…'); setMsg('')
    try {
      const mk = (l, kind) => ({ id: crypto.randomUUID(), source: 'rolex', kind, label: tc(l.label), price: l.price, invoiced: l.invoiced, parts: l.parts, subs: l.subs,
        footnote: l.footnote, included: l.price == null })
      const lines = [...d.necessary.map(l => mk(l, 'necessary')), ...d.optional.map(l => mk(l, 'optional'))]
      if (ship && d.shipping) lines.push({ id: crypto.randomUUID(), source: 'rolex', kind: 'necessary', label: 'Shipping', price: d.shipping, invoiced: d.shipping, parts: [], subs: [] })
      await api.updateJob(job.id, {
        estimate_source: 'rolex', estimate_notes: null, rolex_service_ref: d.service_no,
        extra_lines: [...(job.extra_lines || []).filter(x => x.source !== 'rolex'), ...lines],
        rolex_estimate: { number: d.number, service_no: d.service_no, version: d.version, date: d.date, requests: d.requests, analysis: d.analysis, notes: d.notes,
          weeks: d.weeks, delivery_mode: d.delivery_mode, shipping: d.shipping, totals: d.totals, doc_id: review.doc?.id || null, watch: d.watch, serial: d.serial },
      })
      actions.say(`Rolex estimate ${d.number} converted. Create the estimate below.`); setReview(null); onChange()
    } catch (err) { setMsg(err.message) } finally { setBusy('') }
  }
  const backToJva = async () => { await api.updateJob(job.id, { estimate_source: 'jva', estimate_notes: null }); actions.say('Back to JVA estimate lines'); onChange() }

  const d = review?.data
  const checks = d ? [
    d.job_ref && !digits(job.edge_no).startsWith(digits(d.job_ref).slice(0, 6)) && `Rolex's reference ${d.job_ref} doesn't match job ${job.edge_no}`,
    d.serial && job.serial && d.serial.toUpperCase() !== String(job.serial).toUpperCase() && `Serial on Rolex's estimate (${d.serial}) differs from the job (${job.serial})`,
    job.watch_ref && d.watch && !d.watch.toUpperCase().includes(String(job.watch_ref).toUpperCase().replace(/^M/, '')) && `Model on Rolex's estimate (${d.watch}) differs from the job (${job.watch_ref})`,
    job.estimate_decision && 'The client has already decided on the current estimate',
    ...d.warnings,
  ].filter(Boolean) : []
  const Lines = ({ list }) => list.map((l, i) => (
    <tr key={i}><td>{tc(l.label)}{l.footnote ? ' (1)' : ''}{[...l.subs, ...l.parts].map(s => <div key={s} className="msg"><i>– {s}</i></div>)}</td>
      <td className="r">{l.price != null ? money(l.price) : <span className="msg">included</span>}</td><td className="r msg">{l.invoiced != null ? money(l.invoiced) : ''}</td></tr>
  ))

  return (
    <div className="subpanel">
      <b>Add a document</b>
      <div className="actions">
        <select value={label} onChange={e => setLabel(e.target.value)} aria-label="Document type">{UPLOAD_LABELS.map(l => <option key={l}>{l}</option>)}</select>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" style={{ flex: 1, minWidth: 160 }} />
        <button type="button" className="btn solid" disabled={!!busy} onClick={() => fileRef.current.click()}>Upload…</button>
        <input ref={fileRef} type="file" hidden accept="application/pdf,image/*,.eml,.msg,.txt,.doc,.docx" onChange={upload} />
      </div>
      {job.estimate_source === 'rolex' && (
        <p className="msg">Estimate lines come from Rolex estimate {job.rolex_estimate?.number}. <button type="button" className="link" onClick={backToJva}>Use JVA lines instead</button></p>
      )}
      {busy && <p className="msg">{busy}</p>}
      {msg && <p className="msg warn">{msg}</p>}

      {d && (
        <div className="stack rolexreview">
          <b>Rolex estimate {d.number}{d.date ? ` · ${d.date}` : ''} → JVA estimate</b>
          <p className="msg">{d.watch} · serial {d.serial} · bracelet {d.bracelet} · dial {d.dial}{d.weeks ? ` · delivery about ${d.weeks} weeks` : ''}</p>
          {checks.map(c => <p key={c} className="msg warn">{c}</p>)}
          <p><span className="msg">Customer requests:</span> {d.requests || '—'}</p>
          <p><span className="msg">Watch analysis:</span> {d.analysis || '—'}</p>
          <table className="imp">
            <thead><tr><th>Necessary works</th><th className="r">Client price (MSRP)</th><th className="r">Rolex invoices JVA</th></tr></thead>
            <tbody><Lines list={d.necessary} /></tbody>
          </table>
          {d.optional.length > 0 && (
            <table className="imp">
              <thead><tr><th>Option(s)</th><th className="r">Client price (MSRP)</th><th className="r">Rolex invoices JVA</th></tr></thead>
              <tbody><Lines list={d.optional} /></tbody>
            </table>
          )}
          {d.notes.length > 0 && <details><summary className="msg">Rolex notes ({d.notes.length}), used as the estimate notes</summary><ul className="msg">{d.notes.map(n => <li key={n}>{n}</li>)}</ul></details>}
          {d.shipping ? <label className="tog"><input type="checkbox" checked={ship} onChange={e => setShip(e.target.checked)} /> Charge Rolex's shipping ({money(d.shipping)}) to the client</label> : null}
          <div className="actions">
            <button type="button" className="btn solid" disabled={!!busy} onClick={apply}>Use for the JVA estimate</button>
            <button type="button" className="btn" onClick={() => setReview(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
