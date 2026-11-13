import { useEffect, useState } from 'react'
import { api } from '../data.js'
import { CONDITIONS, braceletLine, conditionText, dialLine, fmtTime, openPrompts, termsFor, watchLine } from '../rules.js'
import JobParts from './JobParts.jsx'
import JobServiceInfo from './JobServiceInfo.jsx'
import JobDocuments from './JobDocuments.jsx'
import JobTimer from './JobTimer.jsx'
import JobAssessment from './JobAssessment.jsx'
import { makeBagLabel } from '../docs/label.js'
import JobUploads from './JobUploads.jsx'
import { partReasons } from '../docs/lines.js'
import JobOverview from './JobOverview.jsx'
import JobTiming from './JobTiming.jsx'

// Print a PDF straight from the page (hidden frame); iPad/Safari falls back to opening it to print or share
function printPdf(blob) {
  const url = URL.createObjectURL(blob)
  if (/iPad|iPhone|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document) return window.open(url, '_blank')
  const f = document.createElement('iframe')
  f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'
  f.src = url
  f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print() } catch { window.open(url, '_blank') } setTimeout(() => f.remove(), 60000) }
  document.body.appendChild(f)
}

// One job. The watchmaker answers every intake prompt (condition + client request) before the estimate.
export default function JobView({ id, receipt, statuses, can, actions, userId, who, onBack, allParts, models }) {
  const [job, setJob] = useState(null)
  const [msg, setMsg] = useState('')
  const [changing, setChanging] = useState(null)   // condition id being changed
  const [declining, setDeclining] = useState(null) // request id being declined
  const [reason, setReason] = useState('')
  const [addComp, setAddComp] = useState(null)

  const load = () => api.loadJob(id).then(setJob).catch(e => setMsg(e.message))
  useEffect(() => { load() }, [id])
  useEffect(() => api.subscribe({ onJob: r => (!r?.id || r.id === id) && load() }), [id])
  const run = async (fn, done) => { setMsg(''); try { await fn(); await load(); if (done) actions.say(done) } catch (e) { setMsg(e.message) } }
  const now = () => new Date().toISOString()

  if (!job) return <div className="panel"><button className="btn" onClick={onBack}>← Jobs</button><p className="msg">{msg || 'Loading…'}</p></div>

  const conds = job.job_conditions || []
  const reqs = job.job_requests || []
  const pending = openPrompts(job)
  const toConfirm = conds.filter(c => c.state === 'to_confirm')
  const toReview = reqs.filter(r => r.state === 'to_review')
  const current = conds.filter(c => c.state === 'confirmed')
  const canBench = can.bench

  const confirm = c => run(() => api.updateCondition(c.id, { state: 'confirmed', confirmed_by: userId, confirmed_at: now() }), `${c.component} ${c.term.toLowerCase()} confirmed`)
  const notPresent = c => run(() => api.updateCondition(c.id, { state: 'not_present', confirmed_by: userId, confirmed_at: now() }), `${c.component}: not present`)
  const changeTo = (c, term) => run(async () => {
    await api.addCondition({ job_id: id, component: c.component, term, note: c.note, source: 'bench', state: 'confirmed', replaces: c.id, by_user: userId, confirmed_by: userId, confirmed_at: now() })
    await api.updateCondition(c.id, { state: 'not_present', confirmed_by: userId, confirmed_at: now() })
    setChanging(null)
  }, `${c.component} changed to ${term.toLowerCase()}`)
  const include = r => run(() => api.updateRequest(r.id, { state: 'included', reviewed_by: userId, reviewed_at: now() }), `"${r.request}" included`)
  const decline = r => run(async () => {
    await api.updateRequest(r.id, { state: 'declined', reason: reason.trim() || null, reviewed_by: userId, reviewed_at: now() })
    setDeclining(null); setReason('')
  }, `"${r.request}" not included`)
  const addFound = (component, term) => run(() =>
    api.addCondition({ job_id: id, component, term, source: 'bench', state: 'confirmed', by_user: userId, confirmed_by: userId, confirmed_at: now() }),
  `${component} ${term.toLowerCase()} added`)

  const setStatus = async s => {
    if (job.status === 'Estimate' && s !== 'Estimate' && s !== 'Cancelled' && pending)
      return setMsg(`Answer the ${pending} prompt${pending === 1 ? '' : 's'} first (WSR check, condition and client requests).`)
    const prev = job.status
    await run(() => api.updateJob(id, { status: s }))
    await actions.reload() // stock may have come off (leaving Estimate)
    actions.say(`${job.edge_no}: ${s}`, () => run(() => api.updateJob(id, { status: prev }), `${job.edge_no}: back to ${prev}`))
  }
  const saveField = (k, v) => v !== (job[k] ?? '') && run(() => api.updateJob(id, { [k]: v || null }))
  const openDoc = async d => { try { window.open(URL.createObjectURL(await api.jobDocFile(d)), '_blank') } catch (e) { setMsg(e.message) } }
  const printDoc = async blobOrDoc => {
    try { printPdf(blobOrDoc instanceof Blob ? blobOrDoc : await api.jobDocFile(blobOrDoc)) } catch (e) { setMsg(e.message) }
  }
  const emailDoc = d => run(async () => { const r = await api.emailJobDoc(d.id); actions.say(`${d.file_name} emailed to ${r.to}`) })

  return (
    <div className="job">
      <div className="actions">
        <button type="button" className="btn" onClick={onBack}>← Jobs</button>
        <h2 className="grow">Job {job.edge_no} · {watchLine(job)}</h2>
        <JobTimer jobId={id} who={who} isAdmin={can.edit}
          live={canBench && statuses.find(s => s.name === job.status)?.kind === 'open'} />
        <select value={job.status} onChange={e => setStatus(e.target.value)} disabled={!can.status} aria-label="Status">
          {statuses.map(s => <option key={s.name}>{s.name}</option>)}
        </select>
      </div>
      {receipt && (
        <div className="flagline good">{job.classification === 'Vintage' ? 'Vintage Analysis Fee form' : 'Receipt'} signed and filed.
          <button type="button" className="btn solid" onClick={() => printDoc(receipt)}>Print receipt</button>
          <button type="button" className="btn" onClick={() => window.open(URL.createObjectURL(receipt), '_blank')}>Open</button>
        </div>
      )}
      {msg && <p className="msg warn">{msg}</p>}
      {(() => { // documents made before the serial / model / bracelet / dial were changed
        const latest = Object.values((job.job_docs || []).filter(d => d.kind !== 'signed_estimate').reduce((m, d) => (!m[d.kind] || m[d.kind].at < d.at ? { ...m, [d.kind]: d } : m), {}))
        const stale = job.ident_changed_at ? latest.filter(d => d.at < job.ident_changed_at) : []
        return stale.length > 0 && <p className="flagline">Watch details changed on {fmtTime(job.ident_changed_at)}, after {stale.map(d => d.file_name).join(', ')}. Create {stale.length === 1 ? 'that document' : 'those documents'} again so the client's copy shows the corrected details.</p>
      })()}

      <JobServiceInfo job={job} can={can} userId={userId} actions={actions} onChange={load} />

      {/* ---- prompts for the watchmaker ---- */}
      {pending > 0 && (
        <section className="panel prompts">
          <h3>To confirm before the estimate ({pending})</h3>
          {!canBench && <p className="msg">The watchmaker confirms these.</p>}
          {!job.wsr_checked_at && (
            <div className="prompt">
              <div className="grow"><b>WSR serial number check</b> <span className="msg">· Rolex: before any intervention or estimate (serial {job.serial || 'not entered'})</span></div>
              {canBench && <button type="button" className="btn solid" onClick={() => run(() => api.updateJob(id, { wsr_checked_at: now(), wsr_checked_by: userId }), 'WSR check recorded')}>✓ Checked on WSR</button>}
            </div>
          )}
          {toConfirm.map(c => (
            <div key={c.id} className="prompt">
              <div className="grow"><span className="msg">Sales noted</span> <b>{c.component}: {c.term}</b>{c.note ? <span className="msg"> · {c.note}</span> : ''}</div>
              {canBench && (changing === c.id ? (
                <div className="chips">
                  {termsFor(c.component).filter(t => t !== c.term).map(t => <button key={t} type="button" className="chip" onClick={() => changeTo(c, t)}>{t}</button>)}
                  <button type="button" className="btn" onClick={() => setChanging(null)}>Back</button>
                </div>
              ) : (
                <div className="actions">
                  <button type="button" className="btn solid" onClick={() => confirm(c)}>✓ Confirm</button>
                  <button type="button" className="btn" onClick={() => setChanging(c.id)}>Change</button>
                  <button type="button" className="btn" onClick={() => notPresent(c)}>Not present</button>
                </div>
              ))}
            </div>
          ))}
          {toReview.map(r => (
            <div key={r.id} className="prompt">
              <div className="grow"><span className="msg">Client asked</span> <b>{r.request}</b>{r.note ? <span className="msg"> · {r.note}</span> : ''}</div>
              {canBench && (declining === r.id ? (
                <div className="actions">
                  <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why not (shown to Sales)" autoFocus />
                  <button type="button" className="btn solid" onClick={() => decline(r)}>Not included</button>
                  <button type="button" className="btn" onClick={() => setDeclining(null)}>Back</button>
                </div>
              ) : (
                <div className="actions">
                  <button type="button" className="btn solid" onClick={() => include(r)}>✓ Include in estimate</button>
                  <button type="button" className="btn" onClick={() => { setDeclining(r.id); setReason('') }}>Not included</button>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {/* ---- watch analysis ---- */}
      <section className="panel">
        <h3>Watch analysis</h3>
        <p>{current.length ? conditionText(current) : <span className="msg">Nothing confirmed yet.</span>}</p>
        {partReasons(job, conditionText(current)).length > 0 && <p className="msg">Printed with it (reasons for added parts): {partReasons(job, conditionText(current)).join('. ')}.</p>}
        {canBench && (
          <>
            <div className="chips small">
              {CONDITIONS.map(({ c }) => <button key={c} type="button" className="chip" aria-pressed={addComp === c} onClick={() => setAddComp(addComp === c ? null : c)}>{c}</button>)}
            </div>
            {addComp && (
              <div className="chips">
                <span className="msg">Add for {addComp}:</span>
                {termsFor(addComp).map(t => (
                  <button key={t} type="button" className="chip" disabled={current.some(x => x.component === addComp && x.term === t)} onClick={() => addFound(addComp, t)}>{t}</button>
                ))}
              </div>
            )}
          </>
        )}
        <details>
          <summary className="msg">Condition history</summary>
          <ul className="msg">
            {conds.map(c => (
              <li key={c.id}>{c.component}: {c.term} · {c.source === 'intake' ? 'noted at intake' : 'found at bench'} by {who(c.by_user)}
                {c.state === 'confirmed' && c.source === 'intake' ? ` · confirmed by ${who(c.confirmed_by)}` : ''}
                {c.state === 'not_present' ? ` · ${conds.some(x => x.replaces === c.id) ? 'changed' : 'not present'} (${who(c.confirmed_by)})` : ''}</li>
            ))}
          </ul>
        </details>
      </section>

      {/* ---- requests (answered) ---- */}
      {reqs.some(r => r.state !== 'to_review') && (
        <section className="panel">
          <h3>Client requests</h3>
          <ul>
            {reqs.filter(r => r.state !== 'to_review').map(r => (
              <li key={r.id}>{r.request}: <b>{r.state === 'included' ? 'included' : 'not included'}</b>{r.reason ? ` (${r.reason})` : ''}</li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Service Overview: client requests in front of the watchmaker, handling, exclusions, pre-cleaning, remarks ---- */}
      <JobOverview job={job} can={can} userId={userId} who={who} actions={actions} onChange={load} />

      {/* ---- the watchmaker's assessment: necessary vs optional ---- */}
      {/* Vintage: Rolex Toronto assesses, estimates and supplies parts; the office enters RCL's lines for the invoice */}
      {(job.classification !== 'Vintage' || can.edit) &&
        <JobAssessment job={job} allParts={allParts} can={can} actions={actions} onChange={load} />}

      {/* ---- parts: CTR kit + added ---- */}
      {job.classification !== 'Vintage' && (
        <JobParts job={job} allParts={allParts} models={models} can={can} userId={userId} actions={actions}
          onChange={async () => { await load(); await actions.reload() }} />
      )}

      {/* ---- Rolex Timing Analysis (in-house services) ---- */}
      {job.classification !== 'Vintage' && <JobTiming job={job} can={can} userId={userId} who={who} actions={actions} onChange={load} />}

      {can.edit && (
        <JobDocuments job={job} allParts={allParts} userId={userId} actions={actions}
          onChange={async () => { await load(); await actions.reload() }} printPdf={printPdf} />
      )}

      {/* ---- watch details (declaration) ---- */}
      <section className="panel">
        <h3>Watch details</h3>
        <div className="grid">
          {[['watch_ref', 'Model number'], ['watch_name', 'Model name'], ['serial', 'Serial #'], ['calibre', 'Calibre'], ['movement_no', 'Movement #'],
            ['dial_ref', 'Dial ref #'], ['dial_serial', 'Dial serial #'], ['dial', 'Dial description'], ['bracelet_ref', 'Bracelet reference'], ['bracelet', 'Bracelet description'],
            ['movement_serial', 'Movement serial'], ['bracelet_links', 'Bracelet links'], ['clasp_code', 'Clasp / bracelet code'],
            ['rolex_service_no', 'WSC #'], ['mrws_ref', 'MRWS #'], ['rolex_service_ref', 'Rolex service # (Toronto)']].map(([k, label]) => (
            <label key={k}>{label}
              <input key={job[k] ?? ''} defaultValue={job[k] ?? ''} disabled={!can.status} onBlur={e => saveField(k, e.target.value.trim())} />
            </label>
          ))}
        </div>
        <div className="watchdesc">
          <div><span>Watch</span>{watchLine(job) || '—'}</div>
          <div><span>Serial #</span>{job.serial || '—'}</div>
          <div><span>Bracelet</span>{braceletLine(job) || '—'}</div>
          <div><span>Dial</span>{dialLine(job) || '—'}</div>
        </div>
        <p className="msg">Service: {job.service_type} · taken in {fmtTime(job.intake_at)} by {who(job.intake_by)}
          {job.wsr_checked_at ? ` · WSR checked ${fmtTime(job.wsr_checked_at)} by ${who(job.wsr_checked_by)}` : ' · WSR not checked yet'}</p>
      </section>

      {/* ---- documents + history ---- */}
      <section className="panel">
        <div className="actions"><h3 className="grow">Documents</h3>
          {can.intake && <button type="button" className="btn" onClick={async () => printDoc(await makeBagLabel({ job, clientName: (Array.isArray(job.job_clients) ? job.job_clients[0] : job.job_clients)?.name }))}>Print bag label</button>}
        </div>
        {(job.job_docs || []).length ? (job.job_docs || []).map(d => (
          <div key={d.id} className="actions">
            <span className="grow">{d.label ? <b>{d.label}: </b> : ''}{d.file_name} · {fmtTime(d.at)}{d.note ? <span className="msg"> · {d.note}</span> : ''}{d.emailed_at ? <span className="msg"> · emailed {fmtTime(d.emailed_at)}</span> : ''}</span>
            {can.edit && d.label === 'Rolex estimate' && /pdf/i.test(d.content_type || d.file_name) && <button type="button" className="btn" onClick={() => JobUploads.convert?.(d)}>Convert to JVA estimate</button>}
            <button type="button" className="btn" onClick={() => printDoc(d)}>Print</button>
            <button type="button" className="btn" onClick={() => openDoc(d)}>Open</button>
            <button type="button" className="btn" onClick={() => emailDoc(d)}>Email to service manager</button>
          </div>
        )) : <p className="msg">{can.intake ? 'No documents yet.' : 'Signed documents are visible to the office only.'}</p>}
        {can.edit && <JobUploads job={job} userId={userId} actions={actions} onChange={load} />}
        <details>
          <summary className="msg">Status history</summary>
          <ul className="msg">{(job.job_status_log || []).sort((a, b) => (a.at < b.at ? -1 : 1)).map(s => <li key={s.id}>{fmtTime(s.at)} · {s.status} · {who(s.by_user)}</li>)}</ul>
        </details>
      </section>
    </div>
  )
}
