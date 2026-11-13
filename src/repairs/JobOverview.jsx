import { useState } from 'react'
import { api } from '../data.js'
import { fmtTime } from '../rules.js'

// From JVA's "Rolex Service Overview" (Service Advisor / watchmaker sheet): special handling, guarantee exclusions,
// pre-cleaning and remarks. The client's requests are shown alongside so the watchmaker always has them in front of them.
export const HANDLING = ['Return old parts to client', 'Return old crown to client', 'Keep original parts', 'Keep original crown', 'Do not refinish case',
  'Do not refinish bracelet', 'Do not refinish case back', 'Do not open dial side', 'Change gaskets only']
export const EXCLUSIONS = ['Water resistance', 'Bracelet', 'Movement', 'Dial and hands', 'Case']

export default function JobOverview({ job, can, userId, who, actions, onChange }) {
  const [msg, setMsg] = useState('')
  const edit = can.bench
  const run = async (fields, done) => { setMsg(''); try { await api.updateJob(job.id, fields); if (done) actions.say(done); onChange() } catch (e) { setMsg(e.message) } }
  const toggle = (k, v) => run({ [k]: (job[k] || []).includes(v) ? (job[k] || []).filter(x => x !== v) : [...(job[k] || []), v] })
  const reqs = job.job_requests || []

  return (
    <section className="panel">
      <h3>Service overview</h3>
      <div>
        <span className="msg">Client requests: </span>
        {reqs.length ? reqs.map(r => <span key={r.id} className={`tag${r.state === 'declined' ? ' warn' : ''}`}>{r.request}{r.note ? ` (${r.note})` : ''}{r.state === 'declined' ? ' · not included' : ''}</span>) : <span className="msg">none recorded</span>}
      </div>
      <div className="chips small"><span className="msg">Special handling</span>
        {HANDLING.map(h => <button key={h} type="button" className="chip" aria-pressed={(job.handling || []).includes(h)} disabled={!edit} onClick={() => toggle('handling', h)}>{h}</button>)}
      </div>
      <div className="chips small"><span className="msg">Guarantee exclusions</span>
        {EXCLUSIONS.map(x => <button key={x} type="button" className="chip" aria-pressed={(job.exclusions || []).includes(x)} disabled={!edit} onClick={() => toggle('exclusions', x)}>{x}</button>)}
      </div>
      <div className="actions">
        {job.precleaned_at ? <span className="msg">Pre-cleaning done by {who(job.precleaned_by)} · {fmtTime(job.precleaned_at)}</span>
          : <span className="msg">Pre-cleaning not done yet</span>}
        {edit && (job.precleaned_at
          ? <button type="button" className="btn" onClick={() => run({ precleaned_at: null, precleaned_by: null })}>Undo</button>
          : <button type="button" className="btn" onClick={() => run({ precleaned_at: new Date().toISOString(), precleaned_by: userId }, 'Pre-cleaning recorded')}>Pre-cleaning done</button>)}
      </div>
      <label className="stackfield">Remarks & observations
        <textarea rows={3} defaultValue={job.remarks || ''} key={job.remarks || ''} disabled={!edit}
          onBlur={e => e.target.value.trim() !== (job.remarks || '') && run({ remarks: e.target.value.trim() || null })} placeholder="e.g. Broken axle; movement pre-cleaned and clasp fixed" />
      </label>
      {msg && <p className="msg warn">{msg}</p>}
    </section>
  )
}
