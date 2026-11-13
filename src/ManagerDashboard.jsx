import { useEffect, useMemo, useState } from 'react'
import { api } from './data.js'
import { fmtDate, inStoreService, isProvisional, needsValidation, timingPassed, watchLine } from './rules.js'
import TodoPanel, { dueFrom } from './repairs/TodoPanel.jsx'

// Service Manager dashboard (Admin home): what needs doing now, where the work is, and how fast it moves.
// Rolex / Workflow v2.1 targets: estimate within 24 h of intake (72 h over a weekend), confirmation within 24 h of the decision.
const HOUR = 3600e3, DAY = 24 * HOUR
const PIPELINE = ['Estimate', 'Waiting on parts', 'On deck', 'Polishing', 'Timekeeping', 'Sent to Toronto', 'Done', 'Ready for pickup']
const docAt = (j, k) => (j.job_docs || []).filter(d => d.kind === k).map(d => d.at).sort()[0] || null
const median = xs => { const s = xs.filter(x => x != null && !isNaN(x)).sort((a, b) => a - b); if (!s.length) return null; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const monday = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const dayStart = s => (s ? new Date(String(s).length === 10 ? s + 'T12:00:00' : s) : null)
const fmtH = h => (h == null ? '—' : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`)
const fmtD = d => (d == null ? '—' : `${Math.round(d * 10) / 10} day${Math.round(d * 10) / 10 === 1 ? '' : 's'}`)
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null)

export default function ManagerDashboard({ can, actions, onOpenJob, onFilter }) {
  const [jobs, setJobs] = useState(null)
  const [statuses, setStatuses] = useState([])
  const [settings, setSettings] = useState({})
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
    const now = new Date(), wk = monday(now), since90 = now - 90 * DAY
    const open = jobs.filter(j => ['open', 'away'].includes(kindOf(j.status)))
    const estDue = open.filter(j => j.status === 'Estimate' && inStoreService(j) && !docAt(j, 'estimate'))
    const overdue = estDue.filter(j => dueFrom(j.intake_at) < now)
    const waiting = open.filter(j => docAt(j, 'estimate') && !j.estimate_decision)
    const oldestWait = Math.max(0, ...waiting.map(j => (now - new Date(docAt(j, 'estimate'))) / DAY))
    const pickup = jobs.filter(j => j.status === 'Ready for pickup')
    const pickupOld = pickup.filter(j => (now - dayStart(j.cabinet_at || j.completed_at)) / DAY > 30)
    const validate = open.filter(needsValidation)
    // Turnaround, last 90 days
    const recent = jobs.filter(j => new Date(j.intake_at) >= since90)
    const est = recent.map(j => ({ j, at: docAt(j, 'estimate') })).filter(x => x.at)
    const estHours = est.map(x => (new Date(x.at) - new Date(x.j.intake_at)) / HOUR)
    const estOnTime = est.filter(x => new Date(x.at) <= dueFrom(x.j.intake_at)).length
    const conf = recent.filter(j => j.decision_at && docAt(j, 'confirmation'))
    const confOnTime = conf.filter(j => new Date(docAt(j, 'confirmation')) <= dueFrom(j.decision_at)).length
    const benchDays = recent.filter(j => j.decision_at && j.completed_at && j.estimate_decision === 'accepted').map(j => (dayStart(j.completed_at) - new Date(j.decision_at)) / DAY)
    const totalDays = jobs.filter(j => j.picked_up_at && new Date(j.picked_up_at) >= since90).map(j => (new Date(j.picked_up_at) - new Date(j.intake_at)) / DAY)
    const waitPickup = jobs.filter(j => j.picked_up_at && j.completed_at && new Date(j.picked_up_at) >= since90).map(j => (new Date(j.picked_up_at) - dayStart(j.completed_at)) / DAY)
    // Bench load
    const queue = open.filter(j => j.estimate_decision === 'accepted' && inStoreService(j) && !['Done', 'Ready for pickup'].includes(j.status))
    const wpw = Math.max(Number(settings.bench?.watches_per_week) || 6, 0.5)
    const qcWaiting = open.filter(j => inStoreService(j) && timingPassed(j) && !j.qc_at)
    // Weekly flow, last 8 weeks (Monday to Sunday)
    const weeks = [...Array(8)].map((_, i) => { const s = new Date(wk); s.setDate(s.getDate() - (7 - i) * 7); const e = new Date(s); e.setDate(e.getDate() + 7); return { s, e } })
    const inWeek = (d, w) => d && d >= w.s && d < w.e
    const flow = weeks.map(w => ({ label: w.s.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }), s: w.s,
      intake: jobs.filter(j => inWeek(new Date(j.intake_at), w)).length,
      done: jobs.filter(j => inWeek(dayStart(j.completed_at), w)).length }))
    const pipeline = PIPELINE.map(name => ({ name, n: jobs.filter(j => j.status === name).length }))
    return {
      open, estDue, overdue, waiting, oldestWait, pickup, pickupOld, validate, queue, wpw, qcWaiting, flow, pipeline,
      parts: open.filter(j => (j.job_parts || []).some(l => l.state === 'active' && l.short_qty > 0)).length,
      thisWeek: { intake: jobs.filter(j => new Date(j.intake_at) >= wk).length, done: jobs.filter(j => dayStart(j.completed_at) >= wk).length },
      t: { estH: median(estHours), estPct: pct(estOnTime, est.length), estN: est.length, confPct: pct(confOnTime, conf.length), confN: conf.length,
        bench: median(benchDays), total: median(totalDays), pickupWait: median(waitPickup) },
    }
  }, [jobs, statuses, settings])

  if (err) return <p className="msg warn">{err}</p>
  if (!m) return <p className="msg">Loading the dashboard…</p>
  const maxPipe = Math.max(1, ...m.pipeline.map(p => p.n))

  return (
    <div className="dash">
      <div className="actions">
        <h2 className="grow">Service Manager dashboard</h2>
        <span className="msg">{new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
      </div>

      {/* ---- headline numbers ---- */}
      <div className="kpis">
        <Kpi label="In the workshop" value={m.open.length} sub={`${m.queue.length} approved on the bench`} onClick={() => onFilter('open')} />
        <Kpi label="Estimates due" value={m.estDue.length} alert={m.overdue.length ? `${m.overdue.length} overdue` : null} sub={m.overdue.length ? null : 'none overdue'} onClick={() => onFilter('Estimate')} />
        <Kpi label="Waiting for the client" value={m.waiting.length} sub={m.waiting.length ? `oldest ${Math.floor(m.oldestWait)} day${Math.floor(m.oldestWait) === 1 ? '' : 's'}` : 'none'} alert={m.oldestWait >= 7 ? 'a week or more' : null} />
        <Kpi label="Ready for pickup" value={m.pickup.length} alert={m.pickupOld.length ? `${m.pickupOld.length} over 30 days` : null} sub={m.pickupOld.length ? null : 'in the cabinet'} onClick={() => onFilter('Ready for pickup')} />
        <Kpi label="This week" value={`${m.thisWeek.intake} in · ${m.thisWeek.done} done`} sub="since Monday" small />
      </div>

      {/* ---- what needs doing ---- */}
      <section className="panel">
        <h3>To do now</h3>
        <TodoPanel jobs={jobs} kindOf={kindOf} can={can} onOpen={onOpenJob} />
      </section>

      <div className="dash-cols">
        {/* ---- where the work is ---- */}
        <section className="panel">
          <h3>Where the watches are</h3>
          <div className="meters">
            {m.pipeline.map(p => (
              <button key={p.name} type="button" className="meter-row" onClick={() => onFilter(p.name)} title={`${p.n} job${p.n === 1 ? '' : 's'} · ${p.name}`}>
                <span className="meter-name">{p.name}</span>
                <span className="meter-track"><span className="meter-fill" style={{ width: `${(p.n / maxPipe) * 100}%` }} /></span>
                <b className="meter-n">{p.n}</b>
              </button>
            ))}
          </div>
          <p className="msg">Bench load: {m.queue.length} approved watch{m.queue.length === 1 ? '' : 'es'} ≈ {Math.round((m.queue.length / m.wpw) * 10) / 10} week{m.queue.length / m.wpw === 1 ? '' : 's'} of work at {m.wpw} a week (Settings). {m.qcWaiting.length ? `${m.qcWaiting.length} waiting for final QC. ` : ''}{m.parts ? `${m.parts} job${m.parts === 1 ? '' : 's'} with parts short. ` : ''}{m.validate.length ? `${m.validate.length} to validate (Edge / WSC #).` : ''}</p>
        </section>

        {/* ---- how fast it moves ---- */}
        <section className="panel">
          <h3>Turnaround <span className="msg">· last 90 days</span></h3>
          <div className="tstats">
            <TStat label="Intake → estimate" value={fmtH(m.t.estH)} meter={m.t.estPct} meterLabel={m.t.estN ? `${m.t.estPct}% within 24 h (${m.t.estN})` : 'no estimates yet'} />
            <TStat label="Decision → confirmation" meter={m.t.confPct} value={m.t.confN ? `${m.t.confPct}%` : '—'} meterLabel={m.t.confN ? `on time, within 24 h (${m.t.confN})` : 'none yet'} />
            <TStat label="Approved → service done" value={fmtD(m.t.bench)} meterLabel="median, bench time" />
            <TStat label="Done → picked up" value={fmtD(m.t.pickupWait)} meterLabel="median wait in the cabinet" />
            <TStat label="Intake → picked up" value={fmtD(m.t.total)} meterLabel="median, door to door" />
          </div>
        </section>
      </div>

      {/* ---- weekly flow ---- */}
      <section className="panel">
        <h3>Watches per week <span className="msg">· last 8 weeks</span></h3>
        <div className="dash-cols">
          <WeekBars title="Taken in" data={m.flow.map(f => ({ label: f.label, n: f.intake }))} />
          <WeekBars title="Service done" data={m.flow.map(f => ({ label: f.label, n: f.done }))} />
        </div>
        <details><summary className="msg">Table</summary>
          <table className="imp"><thead><tr><th>Week of</th><th className="r">Taken in</th><th className="r">Service done</th></tr></thead>
            <tbody>{m.flow.map(f => <tr key={f.label}><td>{f.label}</td><td className="r">{f.intake}</td><td className="r">{f.done}</td></tr>)}</tbody></table>
        </details>
      </section>

      {/* ---- oldest open jobs ---- */}
      <section className="panel">
        <h3>Longest in the workshop</h3>
        <table className="imp jobs">
          <thead><tr><th>Job #</th><th>Watch</th><th>Status</th><th className="r">Days in</th><th>ETA</th></tr></thead>
          <tbody>{[...m.open].sort((a, b) => (a.intake_at < b.intake_at ? -1 : 1)).slice(0, 8).map(j => (
            <tr key={j.id} className="click" onClick={() => onOpenJob(j.id)}>
              <td className="mono b">{j.edge_no}{isProvisional(j) ? <span className="msg"> (provisional)</span> : ''}</td><td>{watchLine(j)}</td><td>{j.status}</td>
              <td className="r">{Math.floor((Date.now() - new Date(j.intake_at)) / DAY)}</td><td>{j.eta_override || j.eta_quoted ? fmtDate(j.eta_override || j.eta_quoted) : '—'}</td>
            </tr>
          ))}</tbody>
        </table>
        {!m.open.length && <p className="msg">No open jobs.</p>}
      </section>
    </div>
  )
}

function Kpi({ label, value, sub, alert, onClick, small }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} className={`kpi${onClick ? ' click' : ''}`} onClick={onClick}>
      <span className="kpi-label">{label}</span>
      <span className={`kpi-value${small ? ' small' : ''}`}>{value}</span>
      {alert ? <span className="kpi-alert">⚠ {alert}</span> : sub ? <span className="msg">{sub}</span> : null}
    </Tag>
  )
}

function TStat({ label, value, meter, meterLabel }) {
  return (
    <div className="tstat">
      <span className="kpi-label">{label}</span>
      <b className="tstat-value">{value}</b>
      {meter != null && <span className="meter-track" role="img" aria-label={meterLabel}><span className="meter-fill" style={{ width: `${meter}%` }} /></span>}
      <span className="msg">{meterLabel}</span>
    </div>
  )
}

// One series, one hue; hover shows the week and count
function WeekBars({ title, data }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...data.map(d => d.n)), W = 320, H = 120, bw = W / data.length
  return (
    <figure className="weekbars">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={`${title} per week: ${data.map(d => `${d.label} ${d.n}`).join(', ')}`}>
        <line x1="0" x2={W} y1={H} y2={H} className="axis" />
        {data.map((d, i) => {
          const h = d.n ? Math.max(3, (d.n / max) * (H - 16)) : 0, x = i * bw + 4, w = bw - 8
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * bw} y="0" width={bw} height={H + 18} fill="transparent" />
              {h > 0 && <path className={`bar${hover === i ? ' on' : ''}`} d={`M${x},${H} V${H - h + 4} Q${x},${H - h} ${x + 4},${H - h} H${x + w - 4} Q${x + w},${H - h} ${x + w},${H - h + 4} V${H} Z`} />}
              {(i === data.length - 1 || hover === i) && d.n > 0 && <text x={x + w / 2} y={H - h - 4} className="val">{d.n}</text>}
              {i % 2 === 1 && <text x={x + w / 2} y={H + 13} className="tick">{d.label}</text>}
            </g>
          )
        })}
      </svg>
      {hover != null && <div className="weektip">Week of {data[hover].label}: <b>{data[hover].n}</b></div>}
    </figure>
  )
}
