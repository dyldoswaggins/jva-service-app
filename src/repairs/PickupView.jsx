import { useEffect, useState } from 'react'
import { api } from '../data.js'
import { fmtDate, watchLine } from '../rules.js'

// Workflow v2.1 step 12 (Sales associate): find a finished watch, check photo ID, prepare and present it, hand it over.
export const HANDOVER = [
  ['id_checked', "Government photo ID checked: matches the client's name"],
  ['wound_set', 'Watch wound, time and date set'],
  ['cleaned', 'Protective stickers removed, cleaned with a microfiber cloth'],
  ['pouch', 'Rolex leather pouch present'],
  ['presented', 'Presented with Rolex gloves on the Rolex tray'],
  ['explained', 'Service, parts replaced and the Rolex guarantee explained'],
  ['bag_hidden', 'Internal job bag and paperwork kept out of view'],
]

export function Handover({ job, actions, onDone, onCancel }) {
  const [c, setC] = useState({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const client = (Array.isArray(job.job_clients) ? job.job_clients[0] : job.job_clients)?.name
  const all = HANDOVER.every(([k]) => c[k])
  const save = async () => {
    setBusy(true); setMsg('')
    try { await api.markPickedUp(job.id, { ...c, at: new Date().toISOString() }); actions.say(`${job.edge_no} handed over`); onDone() } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="stack">
      <div className="watchdesc">
        <div><span>Job</span><b>{job.edge_no}</b></div>
        <div><span>Client</span><b>{client || '—'}</b></div>
        <div><span>Watch</span>{watchLine(job)}</div>
        <div><span>Serial #</span>{job.serial || '—'}</div>
      </div>
      {HANDOVER.map(([k, l]) => <label key={k} className="tog big"><input type="checkbox" checked={!!c[k]} onChange={e => setC({ ...c, [k]: e.target.checked })} /> {l}</label>)}
      {msg && <p className="msg warn">{msg}</p>}
      <div className="actions">
        <button type="button" className="btn solid big" disabled={!all || busy} onClick={save}>{busy ? 'Saving…' : 'Handed over'}</button>
        <button type="button" className="btn big" onClick={onCancel}>Back</button>
        {!all && <span className="msg">Tick every step first.</span>}
      </div>
    </div>
  )
}

export default function PickupView({ actions }) {
  const [jobs, setJobs] = useState(null)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [err, setErr] = useState('')
  const load = () => api.loadPickupJobs().then(setJobs).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])
  const name = j => (Array.isArray(j.job_clients) ? j.job_clients[0] : j.job_clients)?.name || ''
  const s = q.trim().toLowerCase()
  const shown = (jobs || []).filter(j => !s || j.edge_no.includes(s) || name(j).toLowerCase().includes(s) || String(j.serial || '').toLowerCase().endsWith(s))

  return (
    <div className="intake client">
      <header className="welcome">
        <img src="/jva-emblem.svg" alt="" className="emblem" />
        <div><div className="brand">J. Vair Anderson</div><h1 className="title">Pickup</h1><div className="msg">Watches ready for collection</div></div>
      </header>
      <section className="step">
        {sel ? <Handover job={sel} actions={actions} onCancel={() => setSel(null)} onDone={() => { setSel(null); load() }} /> : (
          <>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Job #, client name or serial (last 4)" aria-label="Find a watch" />
            {err && <p className="msg warn">{err}</p>}
            {!jobs ? <p className="msg">Loading…</p> : shown.length ? (
              <table className="imp">
                <thead><tr><th>Job #</th><th>Client</th><th>Watch</th><th>Ready since</th></tr></thead>
                <tbody>{shown.map(j => (
                  <tr key={j.id} className="click" onClick={() => setSel(j)}><td className="mono b">{j.edge_no}</td><td>{name(j)}</td><td>{watchLine(j)}</td><td>{fmtDate(j.completed_at)}</td></tr>
                ))}</tbody>
              </table>
            ) : <p className="msg">{jobs.length ? 'No match.' : 'Nothing is waiting for pickup.'}</p>}
          </>
        )}
      </section>
    </div>
  )
}
