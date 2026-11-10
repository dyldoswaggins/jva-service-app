import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../data.js'
import { CONDITIONS, JOB_NO, REQ, REQUEST_OPTIONS, SERVICE_TYPES, braceletLine, conditionText, dialLine, modelId, money, timeframeAtIntake, watchLine, weeksUntil } from '../rules.js'
import { makeReceipt, receiptFileName } from '../receipt.js'
import { compressPhoto } from '../photos.js'
import SignaturePad from './SignaturePad.jsx'

const INTAKE_CONDITIONS = CONDITIONS.filter(x => x.intake !== false)
const blank = { edge_no: '', rolex_service_no: '', mrws_ref: '', service_type: 'CTR', watch_ref: '', watch_name: '', calibre: '', serial: '', bracelet_ref: '', bracelet: '', dial: '' }
const longDate = d => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }) : '')
// Suggest the polishing line from the watch name ("Submariner Date" → "Submariner / GMT-Master / …")
const suggestFamily = (keys, name) => keys.find(k => k.split('/').some(t => t.trim() && String(name || '').toLowerCase().includes(t.trim().toLowerCase().split(' ')[0]))) || ''

// Client-facing intake on the iPad (Sales associates): the client sees this screen and signs at the end.
export default function IntakeView({ models, actions, userId, onDone, standalone }) {
  const [job, setJob] = useState(blank)
  const [conds, setConds] = useState([])
  const [openComp, setOpenComp] = useState(null)
  const [reqs, setReqs] = useState([])
  const [otherReq, setOtherReq] = useState('')
  const [client, setClient] = useState({ name: '', address1: '', address2: '', address3: '' })
  const [sig, setSig] = useState(null)
  const [photos, setPhotos] = useState([])        // [{ blob, url }]
  const [settings, setSettings] = useState(null)
  const [tier, setTier] = useState('')
  const [polish, setPolish] = useState(false)
  const [family, setFamily] = useState('')
  const [eta, setEta] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const camRef = useRef(null)

  useEffect(() => {
    api.loadSettings().then(setSettings).catch(() => setSettings({}))
    api.queueEta(null).then(setEta).catch(() => setEta(null))
  }, [])

  const set = k => e => setJob({ ...job, [k]: e.target.value })
  const model = useMemo(() => models?.get?.(modelId(job.watch_ref || '-')), [models, job.watch_ref])
  useEffect(() => {
    if (model) setJob(j => ({ ...j, watch_name: j.watch_name || model.name, calibre: j.calibre || String(model.cal || '').split(/[,\s]+/)[0] }))
  }, [model])
  const ctrPrices = settings?.ctr_prices || {}
  const polishPrices = settings?.polish_prices || {}
  useEffect(() => { if (!family && job.watch_name) setFamily(suggestFamily(Object.keys(polishPrices), job.watch_name)) }, [job.watch_name, settings])

  const hasCond = (c, t) => conds.some(x => x.component === c && x.term === t)
  const toggleCond = (c, t) => setConds(cs => (hasCond(c, t) ? cs.filter(x => !(x.component === c && x.term === t)) : [...cs, { component: c, term: t, note: '' }]))
  const noteFor = c => conds.find(x => x.component === c)?.note || ''
  const setNote = (c, note) => setConds(cs => cs.map(x => (x.component === c ? { ...x, note } : x)))
  const hasReq = r => reqs.some(x => x.request === r)
  const toggleReq = r => setReqs(rs => (hasReq(r) ? rs.filter(x => x.request !== r) : [...rs, { request: r, note: '' }]))
  const addOther = () => { const r = otherReq.trim(); if (r && !hasReq(r)) setReqs(rs => [...rs, { request: r, note: '' }]); setOtherReq('') }

  async function addPhotos(files) {
    for (const f of files) {
      try { const blob = await compressPhoto(f); setPhotos(p => [...p, { blob, url: URL.createObjectURL(blob) }]) } catch { setMsg('That photo could not be read.') }
    }
  }

  const isCTR = job.service_type === 'CTR'
  const ctrPrice = isCTR && tier ? ctrPrices[tier] : null
  const polishPrice = polish && family ? polishPrices[family] : null
  const total = (Number(ctrPrice) || 0) + (Number(polishPrice) || 0)
  // Customer requests in Rolex wording, following from the service choices (watchmaker prompts too)
  const allReqs = [
    ...(isCTR ? [{ request: REQ.overhaul, note: tier ? `${tier} CTR` : '' }] : []),
    ...(polish ? [{ request: REQ.refinish, note: family }] : isCTR ? [{ request: REQ.noCase, note: '' }, { request: REQ.noBracelet, note: '' }] : []),
    ...reqs,
  ]

  const showEta = timeframeAtIntake({ isCTR, polish, requests: reqs })
  const missing = [
    !JOB_NO.test(job.edge_no.trim()) && 'Edge job # (like 124595-001)',
    !job.watch_ref.trim() && 'model number',
    !job.watch_name.trim() && 'model name',
    !job.serial.trim() && 'serial #',
    !job.bracelet_ref.trim() && 'bracelet reference',
    !job.bracelet.trim() && 'bracelet description',
    !job.dial.trim() && 'dial description',
    isCTR && !tier && 'CTR tier',
    polish && !family && 'polishing line',
    !allReqs.length && 'at least one request',
    !client.name.trim() && 'client name',
    !sig && 'client signature',
  ].filter(Boolean)

  async function save() {
    if (missing.length) return setMsg('Still needed: ' + missing.join(', ') + '.')
    setBusy(true); setMsg('')
    const clean = {
      ...job, edge_no: job.edge_no.trim(), watch_ref: job.watch_ref.trim().toUpperCase(),
      ctr_tier: isCTR ? tier : null, ctr_price: ctrPrice ?? null, polish, polish_family: polish ? family : null,
      polish_price: polishPrice ?? null, eta_quoted: showEta ? eta?.eta || null : null,
    }
    const quote = {
      items: [
        isCTR ? { label: `Complete overhaul (${tier})`, price: ctrPrice ?? 'On estimate' } : { label: job.service_type, price: 'On estimate' },
        ...(polish ? [{ label: 'Refinish case and bracelet', price: polishPrice ?? 'On estimate' }] : []),
      ],
      total: total || null,
      weeks: showEta ? weeksUntil(eta?.eta) : null,
    }
    try {
      const pdf = await makeReceipt({ job: clean, client, requests: allReqs, conditions: conds, signaturePng: sig, quote })
      const id = await api.createJob(clean, conds, allReqs, client)
      const doc = await api.uploadJobDoc(id, 'receipt', pdf, receiptFileName(clean), userId)
      for (const p of photos) await api.uploadJobPhoto(id, p.blob, 'Intake', userId).catch(() => {})
      actions.say(`Job ${clean.edge_no} taken in. Receipt saved.`)
      onDone(id, pdf, doc, clean)
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }

  return (
    <div className={'intake client' + (standalone ? ' standalone' : '')}>
      <header className="welcome">
        <img src="/jva-emblem.svg" alt="" className="emblem" />
        <div>
          <div className="brand">J. Vair Anderson</div>
          <h1 className="title">Rolex Service Reception</h1>
          <div className="msg">Official Rolex Retailer · Calgary · {new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
        {!standalone && <button type="button" className="btn" onClick={() => onDone(null)}>Cancel</button>}
      </header>

      <section className="step">
        <h2><span>1</span>Your timepiece</h2>
        <div className="grid big">
          <label>Model number<input value={job.watch_ref} onChange={set('watch_ref')} placeholder="126710BLNR" autoCapitalize="characters" /></label>
          <label>Model name<input value={job.watch_name} onChange={set('watch_name')} placeholder="GMT-Master II / Oyster Perpetual" /></label>
          <label>Serial number<input value={job.serial} onChange={set('serial')} autoCapitalize="characters" /></label>
          <label>Bracelet reference<input value={job.bracelet_ref} onChange={set('bracelet_ref')} placeholder="20-93150-20" autoCapitalize="characters" /></label>
          <label>Bracelet description<input value={job.bracelet} onChange={set('bracelet')} placeholder="Rolex Oyster Fliplock Steel" /></label>
          <label>Dial description<input value={job.dial} onChange={set('dial')} placeholder="126610 black markers w lgn" /></label>
        </div>
        <div className="watchdesc" aria-label="Watch description as printed">
          <div><span>Watch</span>{watchLine(job) || '—'}</div>
          <div><span>Serial #</span>{job.serial || '—'}</div>
          <div><span>Bracelet</span>{braceletLine(job) || '—'}</div>
          <div><span>Dial</span>{dialLine(job) || '—'}</div>
        </div>
        {model && <p className="msg">{model.cal ? `Calibre ${model.cal}` : ''}{model.ok ? '' : ' (model details unconfirmed)'}</p>}
      </section>

      <section className="step">
        <h2><span>2</span>Photos</h2>
        <p className="msg">A record of your watch as it arrived: dial, case back, clasp and any marks.</p>
        <div className="photos">
          {photos.map((p, i) => (
            <div key={i} className="thumb"><img src={p.url} alt={`Photo ${i + 1}`} />
              <button type="button" className="x" aria-label="Remove photo" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>×</button></div>
          ))}
          <button type="button" className="thumb add" onClick={() => camRef.current.click()}>+ Take photo</button>
          <input ref={camRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={e => { addPhotos([...e.target.files]); e.target.value = '' }} />
        </div>
      </section>

      <section className="step">
        <h2><span>3</span>Condition on arrival</h2>
        <p className="msg">Tap a part, then what you see. Our watchmakers confirm every note during the analysis.</p>
        <div className="chips">
          {INTAKE_CONDITIONS.map(({ c }) => {
            const n = conds.filter(x => x.component === c).length
            return <button key={c} type="button" className="chip" aria-pressed={openComp === c} data-marked={n > 0}
              onClick={() => setOpenComp(openComp === c ? null : c)}>{c}{n ? ` · ${n}` : ''}</button>
          })}
        </div>
        {openComp && (
          <div className="subpanel">
            <b>{openComp}</b>
            <div className="chips">
              {INTAKE_CONDITIONS.find(x => x.c === openComp).t.map(t => (
                <button key={t} type="button" className="chip" aria-pressed={hasCond(openComp, t)} onClick={() => toggleCond(openComp, t)}>{t}</button>
              ))}
            </div>
            {conds.some(x => x.component === openComp) && (
              <input value={noteFor(openComp)} onChange={e => setNote(openComp, e.target.value)} placeholder="Note, e.g. at 2 o'clock" />
            )}
          </div>
        )}
        <p className="summary">{conds.length ? conditionText(conds) : 'No visible marks noted.'}</p>
      </section>

      <section className="step">
        <h2><span>4</span>Your service</h2>
        <div className="chips">
          {SERVICE_TYPES.map(t => <button key={t} type="button" className="chip" aria-pressed={job.service_type === t} onClick={() => setJob({ ...job, service_type: t })}>{t === 'CTR' ? 'Complete service' : t}</button>)}
        </div>
        {isCTR && (
          <div className="cards">
            {Object.entries(ctrPrices).map(([t, p]) => (
              <button key={t} type="button" className="card" aria-pressed={tier === t} onClick={() => setTier(t)}>
                <span className="card-title">{t}</span><span className="card-price">{p != null ? money(p) : 'Price on estimate'}</span>
              </button>
            ))}
            {!Object.keys(ctrPrices).length && <p className="msg">CTR prices aren't set yet (Admin → Settings).</p>}
          </div>
        )}
        <div className="offer" data-on={polish}>
          <label className="tog big"><input type="checkbox" checked={polish} onChange={e => setPolish(e.target.checked)} /> Refinish (polish and satin-finish) case and bracelet</label>
          {!polish && isCTR && <span className="msg">Not chosen: the receipt will say "Do not refinish case" and "Do not refinish bracelet".</span>}
          {polish && (
            <div className="cards">
              {Object.entries(polishPrices).map(([f, p]) => (
                <button key={f} type="button" className="card small" aria-pressed={family === f} onClick={() => setFamily(f)}>
                  <span className="card-title">{f}</span><span className="card-price">{p != null ? money(p) : 'On estimate'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <h3>Anything else you'd like?</h3>
        <div className="chips">
          {[...REQUEST_OPTIONS, ...reqs.map(r => r.request).filter(r => !REQUEST_OPTIONS.includes(r))].map(r => (
            <button key={r} type="button" className="chip" aria-pressed={hasReq(r)} onClick={() => toggleReq(r)}>{r}</button>
          ))}
        </div>
        <div className="actions">
          <input value={otherReq} onChange={e => setOtherReq(e.target.value)} placeholder="Something else" onKeyDown={e => e.key === 'Enter' && addOther()} />
          <button type="button" className="btn" onClick={addOther} disabled={!otherReq.trim()}>Add</button>
        </div>
      </section>

      <section className="step quote">
        <h2><span>5</span>Estimate and timing</h2>
        <div className="quote-grid">
          <div><div className="msg">Estimate before tax</div><div className="big-num">{total ? money(total) : '—'}</div>
            <div className="msg">{isCTR ? `${tier || 'Choose a tier'} complete service` : job.service_type}{polish ? ` + polishing` : ''}. Final estimate after our watchmakers' analysis.</div></div>
          {showEta ? (
            <div><div className="msg">Estimated ready</div><div className="big-num">{eta?.eta ? longDate(eta.eta) : '—'}</div>
              <div className="msg">{eta ? `${eta.ahead} watch${eta.ahead === 1 ? '' : 'es'} ahead in our workshop. ` : ''}We'll confirm after the analysis.</div></div>
          ) : (
            <div><div className="msg">Timing</div><div className="big-num">With your estimate</div>
              <div className="msg">{isCTR ? 'Your request includes work beyond the complete service, so ' : ''}our watchmakers will assess it first; we'll confirm the timing with your estimate.</div></div>
          )}
        </div>
      </section>

      <section className="step">
        <h2><span>6</span>Your details and signature</h2>
        <div className="grid big">
          <label>Name<input value={client.name} onChange={e => setClient({ ...client, name: e.target.value })} autoComplete="off" /></label>
          <label>Address<input value={client.address1} onChange={e => setClient({ ...client, address1: e.target.value })} autoComplete="off" /></label>
          <label>City, province<input value={client.address2} onChange={e => setClient({ ...client, address2: e.target.value })} autoComplete="off" /></label>
          <label>Phone or postal code<input value={client.address3} onChange={e => setClient({ ...client, address3: e.target.value })} autoComplete="off" /></label>
        </div>
        <p className="msg">By signing, you confirm the details above and accept the receipt terms (provided on the printed receipt). Your details are kept only on your signed receipt.</p>
        <SignaturePad onChange={setSig} />
      </section>

      <section className="step boutique">
        <h2><span>·</span>For the boutique</h2>
        <div className="grid">
          <label>Edge job #<input value={job.edge_no} onChange={set('edge_no')} inputMode="numeric" placeholder="124595-001" /></label>
          <label>Rolex / WSC #<input value={job.rolex_service_no} onChange={set('rolex_service_no')} /></label>
          <label>MRWS #<input value={job.mrws_ref} onChange={set('mrws_ref')} inputMode="numeric" /></label>
        </div>
      </section>

      <div className="savebar">
        <span className="msg warn">{msg}</span>
        <span className="grow" />
        <button type="button" className="btn solid big" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Confirm and print receipt'}</button>
      </div>
    </div>
  )
}
