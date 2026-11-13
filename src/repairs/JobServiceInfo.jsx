import { useEffect, useRef, useState } from 'react'
import { api } from '../data.js'
import { fmtDate, money } from '../rules.js'
import { compressPhoto } from '../photos.js'

// Price quoted at intake, ETA (queue or watchmaker override) and photos of the watch.
export default function JobServiceInfo({ job, can, userId, actions, onChange }) {
  const [queue, setQueue] = useState(null)
  const [urls, setUrls] = useState({})
  const [msg, setMsg] = useState('')
  const camRef = useRef(null)
  const photos = job.job_photos || []

  useEffect(() => { api.queueEta(job.id).then(setQueue).catch(() => setQueue(null)) }, [job.id, job.status])
  useEffect(() => {
    let live = true
    Promise.all(photos.map(async p => [p.id, await api.photoUrl(p).catch(() => null)])).then(e => live && setUrls(Object.fromEntries(e)))
    return () => { live = false }
  }, [photos.length])

  const eta = job.eta_override || queue?.eta
  const saveEta = async (date, note) => {
    try { await api.updateJob(job.id, { eta_override: date || null, eta_note: note ?? job.eta_note ?? null }); actions.say(date ? `ETA set to ${fmtDate(date)}` : 'ETA back to automatic'); onChange() } catch (e) { setMsg(e.message) }
  }
  const addPhotos = async files => {
    for (const f of files) {
      try { await api.uploadJobPhoto(job.id, await compressPhoto(f), 'Bench', userId) } catch (e) { setMsg(e.message) }
    }
    onChange()
  }
  const total = job.classification === 'Vintage' ? Number(job.vintage_fee) || 0 : (Number(job.ctr_price) || 0) + (job.polish ? Number(job.polish_price) || 0 : 0)

  return (
    <section className="panel">
      <h3>Service, price and timing</h3>
      {job.classification === 'Vintage' && (
        <p className="flagline">Vintage: always serviced by Rolex Toronto (RCL). Watchmaker gathers the WSC information only (calibre, bracelet, serial, reference, condition); the Service Manager completes the WSC Declaration before shipping. Photos required.</p>
      )}
      <div className="facts">
        <div><dt>Class</dt><dd>{job.classification || '—'}</dd></div>
        <div><dt>Service</dt><dd>{job.service_type}{job.ctr_tier ? ` · ${job.ctr_tier}` : ''}{job.ctr_price != null ? ` · ${money(job.ctr_price)}` : ''}</dd></div>
        {job.classification === 'Vintage' && <div><dt>Analysis fee</dt><dd>{job.vintage_fee != null ? money(job.vintage_fee) : '—'} + GST · accepted at intake</dd></div>}
        <div><dt>Polishing</dt><dd>{job.polish ? `Yes · ${job.polish_family || ''}${job.polish_price != null ? ` · ${money(job.polish_price)}` : ''}` : 'No'}</dd></div>
        <div><dt>Quoted at intake</dt><dd>{total ? money(total) : '—'}{job.eta_quoted ? ` · ready ~${fmtDate(job.eta_quoted)}` : ''}</dd></div>
        {job.classification !== 'Vintage' && job.service_type !== 'Engraving' && <div><dt>ETA now</dt><dd><b>{eta ? fmtDate(eta) : '—'}</b> {job.eta_override ? '(set by watchmaker)' : queue ? `(queue: ${queue.ahead} ahead)` : ''}</dd></div>}
      </div>
      {can.bench && (
        <div className="actions">
          <label className="tog">Override ETA <input type="date" defaultValue={job.eta_override || ''} key={job.eta_override || 'auto'} onChange={e => saveEta(e.target.value)} /></label>
          {job.eta_override && <button type="button" className="btn" onClick={() => saveEta(null)}>Back to automatic</button>}
          <input defaultValue={job.eta_note || ''} placeholder="Reason (e.g. waiting on Rolex parts)" onBlur={e => e.target.value !== (job.eta_note || '') && saveEta(job.eta_override, e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        </div>
      )}
      <div className="photos">
        {photos.map(p => urls[p.id] && (
          <a key={p.id} className="thumb" href={urls[p.id]} target="_blank" rel="noreferrer" title={`${p.label || ''} ${fmtDate(String(p.at).slice(0, 10))}`}><img src={urls[p.id]} alt={p.label || 'Watch photo'} /></a>
        ))}
        {can.status && <button type="button" className="thumb add" onClick={() => camRef.current.click()}>+ Photo</button>}
        <input ref={camRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={e => { addPhotos([...e.target.files]); e.target.value = '' }} />
        {!photos.length && !can.status && <p className="msg">No photos.</p>}
      </div>
      {msg && <p className="msg warn">{msg}</p>}
    </section>
  )
}
