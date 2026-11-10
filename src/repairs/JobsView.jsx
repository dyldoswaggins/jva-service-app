import { useEffect, useMemo, useState } from 'react'
import { api } from '../data.js'
import { fmtDate, maskSerial, openPrompts } from '../rules.js'
import IntakeView from './IntakeView.jsx'
import JobView from './JobView.jsx'

// All repair jobs. Sales start an intake here; anyone opens a job.
export default function JobsView({ models, allParts, can, actions, userId, who }) {
  const [jobs, setJobs] = useState(null)
  const [statuses, setStatuses] = useState([])
  const [filter, setFilter] = useState('open')
  const [q, setQ] = useState('')
  const [mode, setMode] = useState({ view: 'list' }) // list | intake | job
  const [err, setErr] = useState('')

  const load = () => api.loadJobs().then(setJobs).catch(e => setErr(e.message))
  useEffect(() => { load(); api.loadStatuses().then(setStatuses).catch(() => {}) }, [])
  useEffect(() => api.subscribe({ onJob: () => load() }), [])

  const kind = s => statuses.find(x => x.name === s)?.kind || 'open'
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (jobs || []).filter(j =>
      (filter === 'all' || (filter === 'open' && ['open', 'away'].includes(kind(j.status))) || j.status === filter) &&
      (!s || j.edge_no.includes(s) || String(j.serial || '').toLowerCase().endsWith(s) || String(j.watch_ref || '').toLowerCase().includes(s) ||
        String(j.rolex_service_no || '').toLowerCase().includes(s) || String(j.mrws_ref || '').includes(s)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, filter, q, statuses])

  if (mode.view === 'intake')
    return <IntakeView models={models} actions={actions} userId={userId} staffName={who?.(userId)}
      onDone={(id, receipt) => { load(); setMode(id ? { view: 'job', id, receipt } : { view: 'list' }) }} />
  if (mode.view === 'job')
    return <JobView id={mode.id} receipt={mode.receipt} statuses={statuses} can={can} actions={actions} userId={userId} who={who}
      allParts={allParts} models={models}
      onBack={() => { load(); setMode({ view: 'list' }) }} />

  const count = s => (jobs || []).filter(j => j.status === s).length
  return (
    <div className="panel">
      <div className="actions">
        <h2 className="grow">Repair jobs</h2>
        <input type="search" placeholder="Job #, serial (last 4), ref, Rolex #, MRWS #" value={q} onChange={e => setQ(e.target.value)} style={{ width: 300 }} aria-label="Find job" />
        {can.intake && <button type="button" className="btn solid" onClick={() => setMode({ view: 'intake' })}>Take in a watch</button>}
      </div>
      <div className="chips small">
        <button type="button" className="chip" aria-pressed={filter === 'open'} onClick={() => setFilter('open')}>In progress</button>
        {statuses.map(s => (
          <button key={s.name} type="button" className="chip" aria-pressed={filter === s.name} onClick={() => setFilter(s.name)}>{s.name} ({count(s.name)})</button>
        ))}
        <button type="button" className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
      </div>
      {err && <p className="msg warn">{err}</p>}
      {!jobs ? <p className="msg">Loading…</p> : shown.length ? (
        <div className="imp-wrap">
          <table className="imp jobs">
            <thead><tr><th>Job #</th><th>Watch</th><th>Serial</th><th>Service</th><th>Status</th><th>To confirm</th><th>In since</th><th>ETA</th></tr></thead>
            <tbody>
              {shown.map(j => {
                const n = openPrompts(j)
                return (
                  <tr key={j.id} className="click" onClick={() => setMode({ view: 'job', id: j.id })}>
                    <td className="mono b">{j.edge_no}</td>
                    <td>{[j.watch_ref, j.watch_name].filter(Boolean).join(' · ')}</td>
                    <td className="mono">{maskSerial(j.serial)}</td>
                    <td>{j.service_type}{j.classification ? <span className="msg"> · {j.classification}</span> : ''}</td>
                    <td>{j.status}</td>
                    <td>{n ? <b className="tag warn">{n} to confirm</b> : <span className="msg">✓</span>}</td>
                    <td>{fmtDate(String(j.intake_at).slice(0, 10))}</td>
                    <td>{j.eta_override ? <b>{fmtDate(j.eta_override)}</b> : j.eta_quoted ? fmtDate(j.eta_quoted) : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="msg">No jobs here yet.</p>}
    </div>
  )
}
