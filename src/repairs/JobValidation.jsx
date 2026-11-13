import { useState } from 'react'
import { api } from '../data.js'
import { JOB_NO, isProvisional, needsValidation } from '../rules.js'

// Watch validation (Service Manager): the boutique numbers Sales doesn't have at the counter (Dylan, 2026-11-12) —
// Edge job #, Rolex / WSC #, MRWS #, bracelet reference. Until then the job carries a provisional number (P<yymmdd>-<nn>).
const FIELDS = [['edge_no', 'Edge job #', '124595-001'], ['rolex_service_no', 'Rolex / WSC #', ''], ['mrws_ref', 'MRWS #', ''], ['bracelet_ref', 'Bracelet reference', '20-93150-20']]

export default function JobValidation({ job, actions, onChange }) {
  const [f, setF] = useState(() => Object.fromEntries(FIELDS.map(([k]) => [k, k === 'edge_no' && isProvisional(job) ? '' : job[k] || ''])))
  const [open, setOpen] = useState(needsValidation(job))
  const [msg, setMsg] = useState('')
  const missing = [isProvisional(job) && 'Edge job #', !job.rolex_service_no && 'WSC #', !job.bracelet_ref && 'bracelet reference'].filter(Boolean)

  async function save() {
    setMsg('')
    const edge = f.edge_no.trim()
    if (edge && !JOB_NO.test(edge)) return setMsg('Edge job # looks like 124595-001.')
    const fields = {}
    if (edge && edge !== job.edge_no) fields.edge_no = edge
    for (const [k] of FIELDS.slice(1)) { const v = f[k].trim() || null; if (v !== (job[k] || null)) fields[k] = k === 'bracelet_ref' && v ? v.toUpperCase() : v }
    if (!Object.keys(fields).length) return setOpen(false)
    try {
      await api.updateJob(job.id, fields)
      actions.say(fields.edge_no ? `Job ${job.edge_no} is now ${fields.edge_no}. Reprint the bag label.` : 'Validation saved')
      onChange()
    } catch (e) { setMsg(/duplicate|unique/i.test(e.message) ? `Job ${edge} already exists.` : e.message) }
  }

  if (!open) return (
    <p className={`flagline${missing.length ? '' : ' good'}`}>
      {missing.length ? `Watch validation: still needed ${missing.join(', ')}.` : `Validated · Edge ${job.edge_no} · WSC ${job.rolex_service_no}${job.mrws_ref ? ` · MRWS ${job.mrws_ref}` : ''}`}
      <button type="button" className="btn" onClick={() => setOpen(true)}>{missing.length ? 'Enter' : 'Edit'}</button>
    </p>
  )
  return (
    <section className="panel">
      <h3>Watch validation</h3>
      <p className="msg">Service Manager: enter the boutique numbers. {isProvisional(job) ? `The job has the provisional number ${job.edge_no} until the Edge job # is entered; documents made after that show the Edge number.` : ''}</p>
      <div className="grid">
        {FIELDS.map(([k, l, ph]) => (
          <label key={k}>{l}<input value={f[k]} placeholder={ph} onChange={e => setF({ ...f, [k]: e.target.value })} inputMode={k === 'edge_no' || k === 'mrws_ref' ? 'numeric' : undefined} /></label>
        ))}
      </div>
      <div className="actions">
        <button type="button" className="btn solid" onClick={save}>Save</button>
        {!needsValidation(job) && <button type="button" className="btn" onClick={() => setOpen(false)}>Close</button>}
        {msg && <span className="msg warn">{msg}</span>}
      </div>
    </section>
  )
}
