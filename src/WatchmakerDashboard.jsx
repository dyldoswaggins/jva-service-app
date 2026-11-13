import { useEffect, useMemo, useState } from 'react'
import { api } from './data.js'
import { ROLEX_DIRECT, fmtDate, inStoreService, openPrompts, timingPassed, watchLine } from './rules.js'
import { dueFrom } from './repairs/TodoPanel.jsx'

// Watchmaker dashboard ("Bench", the watchmaker's home): what to assess, what's next on the bench and what each watch still needs.
// No client details and no costs (watchmakers see retail only).
const HOUR = 3600e3, DAY = 24 * HOUR
const monday = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const dayStart = s => (s ? new Date(String(s).length === 10 ? s + 'T12:00:00' : s) : null)
const short = j => (j.job_parts || []).filter(l => l.state === 'active' && l.short_qty > 0).length
const etaOf = j => j.eta_override || j.eta_quoted || null
const mins = s => (s == null ? '—' : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`)
// What the watch needs next, in workflow order
const nextStep = j => short(j) ? { t: `Parts short (${short(j)})`, warn: true } : !timingPassed(j)
  ? { t: j.status === 'Timekeeping' ? 'Timing analysis' : j.status === 'Polishing' ? 'Polishing' : 'Service' }
  : !j.qc_at ? { t: 'Final QC', warn: false } : { t: 'Ready to finish' }

export default function WatchmakerDashboard({ onOpenJob }) {
  const [jobs, setJobs] = useState(null)
  const [statuses, setStatuses] = useState([])
  const [settings, setSettings] = useState({})
  const [time, setTime] = useState({}) // job id → seconds on the job
  const [err, setErr] = useState('')
  const load = () => api.loadJobs().then(setJobs).catch(e => setErr(e.message))
  useEffect(() => {
    load()
    api.loadStatuses().then(setStatuses).catch(() => {})
    api.loadSettings().then(setSettings).catch(() => {})
    return api.subscribe({ onJob: () => load() })
  }, [])
  const kindOf = s => statuses.find(x => x.name === s)?.kind || 'open'

  const m = useMemo(() => {
    if (!jobs) return null
    const now = new Date(), wk = monday(now)
    const open = jobs.filter(j => ['open', 'away'].includes(kindOf(j.status)))
    const assess = open.filter(j => j.status === 'Estimate' && !ROLEX_DIRECT(j) && openPrompts(j))
      .map(j => ({ j, due: dueFrom(j.intake_at) })).sort((a, b) => a.due - b.due)
    const bench = open.filter(j => j.estimate_decision === 'accepted' && inStoreService(j) && !['Done', 'Ready for pickup'].includes(j.status))
      .sort((a, b) => ((etaOf(a) || '9999') < (etaOf(b) || '9999') ? -1 : (etaOf(a) || '9999') > (etaOf(b) || '9999') ? 1 : a.intake_at < b.intake_at ? -1 : 1))
    const qc = bench.filter(j => timingPassed(j) && !j.qc_at)
    const timing = bench.filter(j => !timingPassed(j) && j.status === 'Timekeeping')
    const parts = open.filter(j => short(j))
    const doneWeek = jobs.filter(j => dayStart(j.completed_at) >= wk && inStoreService(j)).length
    const wpw = Math.max(Number(settings.bench?.watches_per_week) || 6, 0.5)
    return { now, assess, overdue: assess.filter(x => x.due < now).length, bench, qc, timing, parts, doneWeek, wpw }
  }, [jobs, statuses, settings])

  // Time on each job on the bench (the same quiet counter as the job page)
  useEffect(() => {
    if (!m) return
    for (const j of [...m.bench, ...m.assess.map(x => x.j)].slice(0, 16))
      if (!(j.id in time)) api.jobTime(j.id).then(r => setTime(t => ({ ...t, [j.id]: r?.seconds ?? null }))).catch(() => {})
  }, [m])

  if (err) return <p className="msg warn">{err}</p>
  if (!m) return <p className="msg">Loading your bench…</p>
  const left = d => { const h = Math.round((d - m.now) / HOUR); return h < 0 ? { t: `${-h} h overdue`, late: true } : { t: h < 1 ? 'due now' : `due in ${h} h`, late: false } }
  const daysTo = e => Math.round((dayStart(e) - m.now) / DAY)

  return (
    <div className="dash">
      <div className="actions">
        <h2 className="grow">My bench</h2>
        <span className="msg">{m.now.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
      </div>

      <div className="kpis">
        <Tile label="To assess" value={m.assess.length} alert={m.overdue ? `${m.overdue} estimate${m.overdue === 1 ? '' : 's'} overdue` : null} sub="before the estimate (24 h)" />
        <Tile label="Approved on the bench" value={m.bench.length} sub={`≈ ${Math.round((m.bench.length / m.wpw) * 10) / 10} weeks at ${m.wpw} a week`} />
        <Tile label="Timing due" value={m.timing.length} sub="in Timekeeping, no pass yet" />
        <Tile label="Final QC" value={m.qc.length} sub="timing passed, second check needed" alert={m.qc.length ? 'sign-off needed' : null} />
        <Tile label="Done this week" value={`${m.doneWeek} / ${m.wpw}`} sub="services completed vs target" />
      </div>

      <section className="panel">
        <h3>To assess <span className="msg">· WSR check, conditions and client requests, then the estimate</span></h3>
        {m.assess.length ? (
          <table className="imp jobs">
            <thead><tr><th>Job #</th><th>Watch</th><th>Service</th><th className="r">Prompts</th><th>Estimate</th><th className="r">Time on job</th></tr></thead>
            <tbody>{m.assess.map(({ j, due }) => { const l = left(due); return (
              <tr key={j.id} className="click" onClick={() => onOpenJob(j.id)}>
                <td className="mono b">{j.edge_no}</td><td>{watchLine(j)}</td><td>{j.service_type}{j.classification ? <span className="msg"> · {j.classification}</span> : ''}</td>
                <td className="r">{openPrompts(j)}</td><td className={l.late ? 'warn-text' : ''}>{l.late ? '⚠ ' : ''}{l.t}</td><td className="r">{mins(time[j.id])}</td>
              </tr>
            ) })}</tbody>
          </table>
        ) : <p className="msg">Nothing to assess. ✓</p>}
      </section>

      <section className="panel">
        <h3>Next up on the bench <span className="msg">· approved work, by ETA</span></h3>
        {m.bench.length ? (
          <table className="imp jobs">
            <thead><tr><th>Job #</th><th>Watch</th><th>Status</th><th>Next step</th><th>ETA</th><th className="r">Time on job</th></tr></thead>
            <tbody>{m.bench.map(j => { const n = nextStep(j), e = etaOf(j), d = e ? daysTo(e) : null; return (
              <tr key={j.id} className="click" onClick={() => onOpenJob(j.id)}>
                <td className="mono b">{j.edge_no}</td><td>{watchLine(j)}</td><td>{j.status}</td>
                <td>{n.warn ? <span className="tag warn">⚠ {n.t}</span> : <b>{n.t}</b>}</td>
                <td className={d != null && d < 0 ? 'warn-text' : ''}>{e ? `${fmtDate(e)}${d < 0 ? ` · ${-d} day${d === -1 ? '' : 's'} late` : d <= 2 ? ` · in ${d} day${d === 1 ? '' : 's'}` : ''}` : '—'}</td>
                <td className="r">{mins(time[j.id])}</td>
              </tr>
            ) })}</tbody>
          </table>
        ) : <p className="msg">No approved work waiting. ✓</p>}
      </section>

      {m.parts.length > 0 && (
        <section className="panel">
          <h3>Parts short <span className="msg">· ordered in MRWS by the Service Manager</span></h3>
          <ul className="plain">{m.parts.map(j => (
            <li key={j.id}><button type="button" className="link" onClick={() => onOpenJob(j.id)}><b className="mono">{j.edge_no}</b> {watchLine(j)}</button>
              <span className="msg"> · {short(j)} part{short(j) === 1 ? '' : 's'} short · {j.status}</span></li>
          ))}</ul>
        </section>
      )}
    </div>
  )
}

function Tile({ label, value, sub, alert }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {alert ? <span className="kpi-alert">⚠ {alert}</span> : sub ? <span className="msg">{sub}</span> : null}
    </div>
  )
}
