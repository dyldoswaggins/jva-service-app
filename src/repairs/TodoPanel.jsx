import { fmtDate, openPrompts, watchLine } from '../rules.js'

// Rolex / Workflow v2.1 targets: estimate within 24 h of intake, confirmation within 24 h of the signed estimate —
// 3 days when it falls on a weekend (store closures / holidays: judge by eye).
const HOUR = 3600e3
export const dueFrom = at => {
  if (!at) return null
  const d = new Date(at), day = d.getDay()           // 0 Sun … 6 Sat
  return new Date(d.getTime() + (day === 0 || day === 6 || day === 5 ? 72 : 24) * HOUR)
}
const left = (due, now) => {
  const h = Math.round((due - now) / HOUR)
  return h < 0 ? { text: `${-h} h overdue`, late: true } : { text: h < 1 ? 'due now' : `due in ${h} h`, late: false }
}
const daysSince = (at, now) => Math.max(0, Math.floor((now - new Date(at)) / (24 * HOUR)))
const docs = (j, k) => (j.job_docs || []).some(d => d.kind === k)

// What needs doing, by role. Admin (service manager) gets the office queue; watchmakers get their bench queue.
export function todoBuckets(jobs, kindOf, can, now = new Date()) {
  const open = jobs.filter(j => kindOf(j.status) === 'open')
  const vintage = j => j.classification === 'Vintage'
  const b = []
  if (can.edit) {
    b.push({ key: 'estimate', title: 'Estimates to send', hint: 'Within 24 h of intake (3 days on weekends)',
      rows: open.filter(j => j.status === 'Estimate' && !vintage(j) && !docs(j, 'estimate'))
        .map(j => { const l = left(dueFrom(j.intake_at), now); const p = openPrompts(j); return { j, note: l.text + (p ? ` · watchmaker: ${p} to confirm` : ''), late: l.late } })
        .sort((a, b) => dueFrom(a.j.intake_at) - dueFrom(b.j.intake_at)) })
    b.push({ key: 'decision', title: 'Waiting for the client', hint: 'Estimate sent, no decision yet',
      rows: open.filter(j => docs(j, 'estimate') && !j.estimate_decision)
        .map(j => { const d = (j.job_docs || []).filter(x => x.kind === 'estimate').map(x => x.at).sort().pop(); const n = daysSince(d, now); return { j, note: `estimate ${n} day${n === 1 ? '' : 's'} ago`, late: n >= 7 } }) })
    b.push({ key: 'confirm', title: 'Confirmations to send', hint: 'Within 24 h of the signed estimate',
      rows: open.filter(j => j.estimate_decision && !docs(j, 'confirmation'))
        .map(j => { const l = left(dueFrom(j.decision_at), now); return { j, note: j.estimate_decision === 'refused' ? 'refused: acknowledge and arrange return' : l.text, late: l.late } }) })
    b.push({ key: 'ship', title: 'Vintage to send to Rolex Toronto', hint: 'WSC Declaration and photos before shipping',
      rows: open.filter(j => vintage(j) && j.status !== 'Sent to Toronto').map(j => ({ j, note: (n => `in ${n} day${n === 1 ? "" : "s"}`)(daysSince(j.intake_at, now)) })) })
    b.push({ key: 'notify', title: 'Call the client: ready', hint: 'Service complete, client not yet called or emailed',
      rows: jobs.filter(j => j.completed_at && !j.client_called_at && !j.client_emailed_at && !['Picked up', 'Cancelled'].includes(j.status)).map(j => ({ j, note: `completed ${fmtDate(j.completed_at)}` })) })
    b.push({ key: 'pickup', title: 'Waiting for pickup', hint: 'In the pickup cabinet',
      rows: jobs.filter(j => j.status === 'Ready for pickup').map(j => { const n = daysSince(j.cabinet_at || j.completed_at, now); return { j, note: `${n} day${n === 1 ? '' : 's'}`, late: n > 30 } }) })
    b.push({ key: 'invoice', title: 'Ready to invoice', hint: 'Done, no invoice yet',
      rows: jobs.filter(j => j.status === 'Done' && j.estimate_decision === 'accepted' && !docs(j, 'invoice')).map(j => ({ j, note: 'service complete' })) })
  }
  b.push({ key: 'parts', title: 'Parts short', hint: 'Order in MRWS (Service Manager approves)',
    rows: open.filter(j => (j.job_parts || []).some(l => l.state === 'active' && l.short_qty > 0))
      .map(j => { const n = (j.job_parts || []).filter(l => l.state === 'active' && l.short_qty > 0).length; return { j, note: `${n} part${n === 1 ? '' : 's'} short` } }) })
  if (can.bench) {
    b.push({ key: 'prompts', title: 'To assess', hint: 'WSR check, conditions and client requests before the estimate',
      rows: open.filter(j => j.status === 'Estimate' && openPrompts(j)).map(j => { const l = left(dueFrom(j.intake_at), now); return { j, note: `${openPrompts(j)} to confirm · estimate ${l.text}`, late: l.late } })
        .sort((a, b) => dueFrom(a.j.intake_at) - dueFrom(b.j.intake_at)) })
    const eta = j => j.eta_override || j.eta_quoted || '9999'
    b.push({ key: 'bench', title: 'Bench queue', hint: 'Approved work, by ETA',
      rows: open.filter(j => j.estimate_decision === 'accepted' && !vintage(j)).sort((a, b) => (eta(a) < eta(b) ? -1 : eta(a) > eta(b) ? 1 : a.intake_at < b.intake_at ? -1 : 1))
        .map(j => ({ j, note: `${j.status}${j.eta_override || j.eta_quoted ? ` · ETA ${fmtDate(j.eta_override || j.eta_quoted)}` : ''}` })) })
  }
  return b
}

export default function TodoPanel({ jobs, kindOf, can, onOpen }) {
  const buckets = todoBuckets(jobs, kindOf, can).filter(x => x.rows.length)
  if (!buckets.length) return <div className="todo empty"><span className="msg">Nothing waiting. ✓</span></div>
  return (
    <div className="todo">
      {buckets.map(x => (
        <section key={x.key} className={`todo-card${x.rows.some(r => r.late) ? ' late' : ''}`}>
          <h3>{x.title} <span className="count">{x.rows.length}</span></h3>
          <p className="msg">{x.hint}</p>
          <ul>
            {x.rows.slice(0, 6).map(({ j, note, late }) => (
              <li key={j.id}>
                <button type="button" className="link" onClick={() => onOpen(j.id)}><b className="mono">{j.edge_no}</b> {watchLine(j)}</button>
                <span className={`msg${late ? ' warn' : ''}`}>{note}</span>
              </li>
            ))}
            {x.rows.length > 6 && <li className="msg">+ {x.rows.length - 6} more</li>}
          </ul>
        </section>
      ))}
    </div>
  )
}
