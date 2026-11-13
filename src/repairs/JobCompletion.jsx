import { useState } from 'react'
import { api } from '../data.js'
import { fmtDate, fmtTime } from '../rules.js'
import { Handover } from './PickupView.jsx'

// Workflow v2.1 steps 9–11 + the Overview's "SERVICE CHECKLIST (Service Advisor)" and "… OUT (AFTER SERVICE)" lines.
// Most checklist items tick themselves from what is already in the app; the rest are one tap. When it's complete: Ready for pickup.
export default function JobCompletion({ job, can, userId, who, actions, onChange }) {
  const [msg, setMsg] = useState('')
  const [handing, setHanding] = useState(false)
  const edit = can.edit || can.bench
  const toronto = job.classification === 'Vintage' || job.status === 'Sent to Toronto' || job.estimate_source === 'rolex'
  const warranty = job.service_type === 'Warranty'
  const docs = job.job_docs || []
  const has = k => docs.some(d => d.kind === k)
  const upload = l => docs.some(d => d.label === l)
  const lastTiming = (job.timing || []).slice(-1)[0]
  const run = async (fields, done) => { setMsg(''); try { await api.updateJob(job.id, fields); if (done) actions.say(done); onChange() } catch (e) { setMsg(e.message) } }
  const tick = (k, label) => run({ [k]: job[k] ? null : new Date().toISOString() }, job[k] ? null : label)
  const notify = async (k, method) => {
    if (job[k]) return run({ [k]: null })
    setMsg('')
    try {
      if (can.edit) await api.addContact(job.id, method, 'out', `Watch ready for collection (${method === 'call' ? 'called' : 'emailed'} the client)`)
      await run({ [k]: new Date().toISOString() }, method === 'call' ? 'Client called · logged' : 'Client emailed · logged')
    } catch (e) { setMsg(e.message) }
  }

  // Service Advisor checklist (auto from the job; WSC by hand)
  const auto = [
    ['Receipt', has('receipt') || has('vintage_fee')],
    ...(has('immediate_proceed') ? [['Immediate Proceed', true]] : []),
    ['Rolex WSC declaration started', !!job.wsc_declared_at, 'wsc_declared_at'],
    ['Estimate', has('estimate') || warranty, warranty ? 'not needed (warranty)' : null],
    ['Estimate signed', !!job.estimate_decision || has('signed_estimate') || upload('Signed estimate (scan)') || warranty, job.estimate_decision ? `(${job.estimate_decision})` : null],
    ['Confirmation', has('confirmation') || warranty],
    ['Invoice', has('invoice') || warranty],
    ...(!toronto ? [['Timing analysis', lastTiming?.result === 'pass', lastTiming ? (lastTiming.result === 'pass' ? '' : '(not passed)') : null],
      ['Chronoscope service analysis', upload('Chronoscope printout') || docs.some(d => /chronoscope|witschi/i.test(d.note || d.file_name))]] : []),
    ['Complete paperwork, digital copy', true, 'automatic: every document is filed on the job'],
  ]
  const done = {
    end: !!job.completed_at, invoice: has('invoice') || warranty, notified: !!(job.client_called_at || job.client_emailed_at), cabinet: !!job.cabinet_at,
    wsc: toronto || !!job.wsc_completed_at, card: toronto || !!job.warranty_card_at,
  }
  const ready = Object.values(done).every(Boolean)
  const missing = [!done.end && 'service end date', !done.invoice && 'invoice', !done.wsc && 'WSC completed', !done.card && 'warranty card',
    !done.notified && 'client called or emailed', !done.cabinet && 'pickup cabinet'].filter(Boolean)
  const T = ({ k, label, on, onClick }) => (
    <label className="tog big"><input type="checkbox" checked={!!on} disabled={!edit} onChange={onClick || (() => tick(k, label))} /> {label}
      {job[k] && typeof job[k] === 'string' && job[k].includes('T') ? <span className="msg"> · {fmtTime(job[k])}</span> : null}</label>
  )

  if (job.status === 'Picked up') return (
    <section className="panel">
      <h3>Completion</h3>
      <p className="flagline good">Picked up {fmtTime(job.picked_up_at)} · handed over by {who(job.picked_up_by)}{job.pickup_checklist?.id_checked ? ' · photo ID checked' : ''}</p>
    </section>
  )

  return (
    <section className="panel">
      <h3>Completion</h3>
      <div className="cols2">
        <div>
          <b>Service Advisor checklist</b>
          <ul className="checklist">
            {auto.map(([label, ok, extra]) => (
              <li key={label} className={ok ? 'ok' : ''}>
                {extra === 'wsc_declared_at'
                  ? <label className="tog"><input type="checkbox" checked={!!job.wsc_declared_at} disabled={!edit} onChange={() => tick('wsc_declared_at', 'WSC declaration started')} /> {label}</label>
                  : <>{ok ? '✓' : '○'} {label}{extra ? <span className="msg"> {extra}</span> : null}</>}
              </li>
            ))}
          </ul>
        </div>
        <div className="stack">
          <b>After service</b>
          <div className="grid">
            <label>Service end date<input type="date" defaultValue={job.completed_at || ''} key={job.completed_at || 'x'} disabled={!edit} onChange={e => run({ completed_at: e.target.value || null })} /></label>
            {[['serial_out', 'Case serial out'], ['dial_serial_out', 'Dial serial out'], ['movement_serial_out', 'Movement serial out'], ['bracelet_code_out', 'Bracelet code out']].map(([k, l]) => (
              <label key={k}>{l}<input defaultValue={job[k] || ''} key={job[k] || k} disabled={!edit} onBlur={e => e.target.value.trim() !== (job[k] || '') && run({ [k]: e.target.value.trim() || null })} /></label>
            ))}
          </div>
          {!toronto && <T k="wsc_completed_at" label="WSC completed" on={job.wsc_completed_at} />}
          {!toronto && <T k="warranty_card_at" label="Warranty card activated" on={job.warranty_card_at} />}
          <T k="pouch_at" label="Packaged in the Rolex leather pouch" on={job.pouch_at} />
          <T k="client_called_at" label="Client called" on={job.client_called_at} onClick={() => notify('client_called_at', 'call')} />
          <T k="client_emailed_at" label="Client emailed" on={job.client_emailed_at} onClick={() => notify('client_emailed_at', 'email')} />
          <T k="cabinet_at" label="In the pickup cabinet (watch, invoice in envelope, warranty papers)" on={job.cabinet_at} />
        </div>
      </div>
      {job.status === 'Ready for pickup'
        ? (handing ? <Handover job={job} actions={actions} onCancel={() => setHanding(false)} onDone={() => { setHanding(false); onChange() }} />
          : <p className="flagline good">Ready for pickup since {fmtDate(job.completed_at)}. Sales hands it over from the Pickup screen (photo ID).
            {can.intake && <button type="button" className="btn" onClick={() => setHanding(true)}>Hand over now</button>}</p>)
        : edit && (
          <div className="actions">
            <button type="button" className="btn solid" disabled={!ready} onClick={() => run({ status: 'Ready for pickup' }, `${job.edge_no}: ready for pickup`)}>Mark ready for pickup</button>
            {!ready && <span className="msg">Still needed: {missing.join(', ')}.</span>}
          </div>
        )}
      {msg && <p className="msg warn">{msg}</p>}
    </section>
  )
}
