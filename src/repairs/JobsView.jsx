import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../data.js'
import { fmtDate, maskSerial, openPrompts } from '../rules.js'
import IntakeView from './IntakeView.jsx'
import JobView from './JobView.jsx'
import TodoPanel from './TodoPanel.jsx'

const one = x => (Array.isArray(x) ? x[0] : x) || null

// All repair jobs. Sales start an intake here; anyone opens a job.
// Service Manager (Admin): laid out like JVA's "Rolex SAV" intake sheet (Richard, 2026-11-26) — job list on the left,
// the open job on the right with Intake / Estimate / Confirmation / Invoice tabs.
export default function JobsView({ models, allParts, can, actions, userId, who, jump }) {
  const sav = !!can.edit
  const [jobs, setJobs] = useState(null)
  const [statuses, setStatuses] = useState([])
  const [filter, setFilter] = useState('open')
  const [q, setQ] = useState('')
  const [mode, setMode] = useState({ view: 'list' }) // list | intake | job
  const [err, setErr] = useState('')

  // "Deleted" filter: the intakes hidden with Delete this intake (Service Manager), loaded on their own
  const deletedView = useRef(false)
  deletedView.current = filter === 'deleted'
  const load = () => api.loadJobs({ clients: sav, deleted: deletedView.current }).then(setJobs).catch(e => setErr(e.message))
  useEffect(() => { api.loadStatuses().then(setStatuses).catch(() => {}) }, [])
  useEffect(() => { setJobs(null); load() }, [filter === 'deleted'])
  useEffect(() => api.subscribe({ onJob: () => load() }), [])
  // From the dashboard: open a job, or show a status
  useEffect(() => { if (jump?.id) setMode({ view: 'job', id: jump.id }); else if (jump?.filter) { setFilter(jump.filter); setMode({ view: 'list' }) } }, [jump?.n])

  const kind = s => statuses.find(x => x.name === s)?.kind || 'open'
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (jobs || []).filter(j =>
      (filter === 'all' || filter === 'deleted' || (filter === 'open' && ['open', 'away'].includes(kind(j.status))) || (filter === 'finished' && kind(j.status) === 'done') || j.status === filter) &&
      (!s || j.edge_no.toLowerCase().includes(s) || String(j.serial || '').toLowerCase().endsWith(s) || String(j.watch_ref || '').toLowerCase().includes(s) ||
        String(j.watch_name || '').toLowerCase().includes(s) || String(j.rolex_service_no || '').toLowerCase().includes(s) || String(j.mrws_ref || '').includes(s) ||
        (sav && String(one(j.job_clients)?.name || '').toLowerCase().includes(s))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, filter, q, statuses])
  const count = s => (jobs || []).filter(j => j.status === s).length

  if (mode.view === 'intake' && !sav)
    return <IntakeView models={models} actions={actions} userId={userId} staffName={who?.(userId)}
      onDone={(id, receipt) => { load(); setMode(id ? { view: 'job', id, receipt } : { view: 'list' }) }} />
  if (mode.view === 'job' && !sav)
    return <JobView id={mode.id} receipt={mode.receipt} statuses={statuses} can={can} actions={actions} userId={userId} who={who}
      allParts={allParts} models={models}
      onBack={() => { load(); setMode({ view: 'list' }) }} />

  // ---- Service Manager: job list rail + working sheet ----
  if (sav) {
    const open = id => setMode({ view: 'job', id })
    return (
      <div className="sav">
        <div className="sav-top">
          <span className="sav-title">Rolex Service</span>
          <span className="grow" />
          {err && <span className="msg warn">{err}</span>}
          {can.intake && <button type="button" className="btn solid" onClick={() => setMode({ view: 'intake' })}>+ Take in a watch</button>}
        </div>
        <div className="sav-wrap">
          <aside className="sav-rail">
            <input type="search" placeholder="Search job #, client, serial, model" value={q} onChange={e => setQ(e.target.value)} aria-label="Search jobs" />
            <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter by status">
              <option value="open">In progress</option>
              {statuses.map(s => <option key={s.name} value={s.name}>{s.name} ({count(s.name)})</option>)}
              <option value="all">All statuses</option>
              <option value="deleted">Deleted</option>
            </select>
            <ul className="sav-jobs">
              {!jobs ? <li className="msg">Loading…</li> : shown.length ? shown.map(j => {
                const n = openPrompts(j)
                const client = one(j.job_clients)?.name
                const model = [j.watch_ref && `M${String(j.watch_ref).replace(/^M/i, '')}`, j.watch_name].filter(Boolean).join(' ')
                return (
                  <li key={j.id}>
                    <button type="button" aria-current={mode.view === 'job' && mode.id === j.id} onClick={() => open(j.id)}>
                      <span className="jref">{j.edge_no}</span>
                      <span className={`pill k-${j.status === 'Estimate' ? 'estimate' : kind(j.status)}`}>{j.status}</span>
                      <span className="nm">{[client, model || maskSerial(j.serial)].filter(Boolean).join(' · ') || j.service_type}</span>
                      {n > 0 && <span className="nm todo">{n} to confirm</span>}
                    </button>
                  </li>
                )
              }) : <li className="msg">No jobs here.</li>}
            </ul>
          </aside>
          <main className="sav-main">
            {mode.view === 'intake' ? (
              <IntakeView models={models} actions={actions} userId={userId} staffName={who?.(userId)}
                onDone={(id, receipt) => { load(); setMode(id ? { view: 'job', id, receipt } : { view: 'list' }) }} />
            ) : mode.view === 'job' ? (
              <JobView key={mode.id} id={mode.id} receipt={mode.receipt} statuses={statuses} can={can} actions={actions} userId={userId} who={who}
                allParts={allParts} models={models} tabs
                onBack={() => { load(); setMode({ view: 'list' }) }} />
            ) : (
              <>
                <p className="msg">Pick a job from the list, or start with what needs doing:</p>
                {jobs && statuses.length > 0 && <TodoPanel jobs={jobs} kindOf={kind} can={can} onOpen={open} />}
              </>
            )}
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="actions">
        <h2 className="grow">Repair jobs</h2>
        <input type="search" placeholder="Job #, serial (last 4), ref, Rolex #, MRWS #" value={q} onChange={e => setQ(e.target.value)} style={{ width: 300 }} aria-label="Find job" />
        {can.intake && <button type="button" className="btn solid" onClick={() => setMode({ view: 'intake' })}>Take in a watch</button>}
      </div>
      <div className="chips small">
        {[['open', 'In progress'], ['finished', 'Finished'], ['all', 'All']].map(([k, l]) => (
          <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {err && <p className="msg warn">{err}</p>}
      {!jobs ? <p className="msg">Loading…</p> : shown.length ? (() => {
        // Grouped by stage, in workshop order (Richard, 2026-11-27)
        const groups = STAGES.map(([key, label, hint]) => [label, hint, shown.filter(j => stageOf(j, kind) === key)]).filter(g => g[2].length)
        return groups.map(([label, hint, list]) => (
          <section key={label}>
            <div className="stage-h"><b>{label}</b> <span className="msg">{list.length} · {hint}</span></div>
            <div className="imp-wrap">
              <table className="imp jobs">
                <thead><tr><th>Job #</th><th>Watch</th><th>Serial</th><th>Service</th><th>Status</th><th>To confirm</th><th>In since</th><th>ETA</th></tr></thead>
                <tbody>
                  {list.map(j => {
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
          </section>
        ))
      })() : <p className="msg">No jobs here yet.</p>}
    </div>
  )
}

// Watchmaker list: stages in workshop order
const STAGES = [
  ['assess', 'To assess', 'WSR check, conditions, requests, necessary and optional work'],
  ['client', 'With the client', 'estimate sent or being prepared; waiting for the decision'],
  ['parts', 'Waiting on parts', 'approved, parts ordered'],
  ['ready', 'Ready for the bench', 'approved, next up'],
  ['bench', 'On the bench', 'polishing, timekeeping, final QC'],
  ['away', 'At Rolex Toronto', 'sent away'],
  ['finished', 'Finished', 'done, ready for pickup, picked up'],
  ['other', 'Other', 'cancelled'],
]
function stageOf(j, kind) {
  if (j.status === 'Estimate') return openPrompts(j) > 0 ? 'assess' : 'client'
  if (j.status === 'Waiting on parts') return 'parts'
  if (j.status === 'On deck') return 'ready'
  if (['Polishing', 'Timekeeping'].includes(j.status)) return 'bench'
  if (j.status === 'Sent to Toronto' || kind(j.status) === 'away') return 'away'
  if (['Done', 'Ready for pickup', 'Picked up'].includes(j.status)) return 'finished'
  if (kind(j.status) === 'done') return 'finished'
  if (kind(j.status) === 'cancelled') return 'other'
  return 'bench'
}
