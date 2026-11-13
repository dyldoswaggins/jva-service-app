import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../data.js'
import { classifyWatch, offerFor } from '../serviceCatalog.js'
import { CLASSES, CONDITIONS, ENGRAVING_REQUEST, REQ, REQUEST_OPTIONS, SERVICE_TYPES, VINTAGE_REQUEST, braceletLine, conditionText, dialLine, modelId, money, timeframeAtIntake, watchLine, weeksUntil } from '../rules.js'
import { makeReceipt, makeVintageFee, mergePdfs, receiptFileName, vintageFeeFileName } from '../receipt.js'
import { ROLEX_CO_OFFERS, immediateProceedFileName, makeImmediateProceedRolex } from '../docs/immediateProceed.js'
import { ENGRAVING_CASES, ENGRAVING_FONTS, engravingFileName, makeEngravingForm } from '../docs/engravingForm.js'
import { compressPhoto } from '../photos.js'
import SignaturePad from './SignaturePad.jsx'

const INTAKE_CONDITIONS = CONDITIONS.filter(x => x.intake !== false)
const blank = { edge_no: '', rolex_service_no: '', mrws_ref: '', service_type: 'CTR', watch_ref: '', watch_name: '', calibre: '', serial: '', bracelet_ref: '', bracelet: '', dial: '' }
const longDate = d => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }) : '')
// Suggest the polishing line from the watch name ("Submariner Date" → "Submariner / GMT-Master / …")
const suggestFamily = (keys, name) => keys.find(k => k.split('/').some(t => t.trim() && String(name || '').toLowerCase().includes(t.trim().toLowerCase().split(' ')[0]))) || ''

// Client-facing intake on the iPad (Sales associates): the client sees this screen and signs at the end.
export default function IntakeView({ models, actions, userId, onDone, standalone, staffName }) {
  const [job, setJob] = useState(blank)
  const [conds, setConds] = useState([])
  const [openComp, setOpenComp] = useState(null)
  const [reqs, setReqs] = useState([])
  const [otherReq, setOtherReq] = useState('')
  const [client, setClient] = useState({ name: '', address1: '', address2: '', address3: '', email: '' })
  const [sig, setSig] = useState(null)
  const [photos, setPhotos] = useState([])        // [{ blob, url }]
  const [settings, setSettings] = useState(null)
  const [tier, setTier] = useState('')
  const [polish, setPolish] = useState(false)
  const [family, setFamily] = useState('')
  const [eta, setEta] = useState(null)
  const [cls, setCls] = useState('')          // Modern | Classic | Vintage
  const [feeOk, setFeeOk] = useState(false)   // Vintage Analysis Fee accepted
  const [proceedNow, setProceedNow] = useState(false) // client wants to proceed immediately (Rolex Immediate Proceed form)
  const [engr, setEngr] = useState({ text: '', font: '', case: '', position: 'Centred on the case back', note: '' })
  const [allClasses, setAllClasses] = useState(false) // Sales overrides the class worked out from the model
  const [allTiers, setAllTiers] = useState(false)     // … or the suggested complete-service offer
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
  // Rolex's official complete-service offers (Settings can adjust the prices); shown for the chosen class
  const allOffers = Object.keys(settings?.ctr_prices || {}).some(k => k.startsWith('CO - ')) ? settings.ctr_prices : ROLEX_CO_OFFERS
  const ctrPrices = Object.fromEntries(Object.entries(allOffers).filter(([k]) => !cls || cls === 'Vintage' || k.toUpperCase().includes(cls.toUpperCase())))
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

  const vintage = cls === 'Vintage'
  const vfee = Number(settings?.vintage?.fee ?? 350), vweeks = settings?.vintage?.weeks ?? 18
  const chooseClass = (c, offer = null) => {
    setCls(c)
    if (c === 'Vintage') { setJob(j => ({ ...j, service_type: 'Vintage analysis' })); setPolish(false); setTier('') }
    else {
      setJob(j => ({ ...j, service_type: j.service_type === 'Vintage analysis' ? 'CTR' : j.service_type }))
      setTier(t => (offer && offer in allOffers ? offer : t && t.toUpperCase().includes(c.toUpperCase()) ? t : ''))
    }
  }
  // Class and offer from the model (calibre + collection, Rolex's 2025-2026 service price list). Sales can change both.
  const auto = useMemo(() => classifyWatch(job), [job.calibre, job.watch_name, job.watch_ref])
  const suggested = auto ? offerFor(auto.cls, auto.collection) : null
  useEffect(() => { if (auto && !allClasses) chooseClass(auto.cls, suggested) }, [auto?.cls, auto?.collection, settings])
  useEffect(() => { if (job.service_type === 'CTR' && !tier && suggested && suggested in allOffers && cls === auto?.cls) setTier(suggested) }, [job.service_type])
  const isCTR = job.service_type === 'CTR'
  const engraving = job.service_type === 'Engraving' // straight to Rolex Toronto with Rolex's Engraving Request Form
  const ctrPrice = isCTR && tier ? allOffers[tier] : null
  const polishPrice = polish && family ? polishPrices[family] : null
  const total = vintage ? vfee : (Number(ctrPrice) || 0) + (Number(polishPrice) || 0)
  // Customer requests in Rolex wording, following from the service choices (watchmaker prompts too)
  const allReqs = [
    ...(vintage ? [{ request: VINTAGE_REQUEST, note: '' }] : []),
    ...(isCTR ? [{ request: REQ.overhaul, note: tier || '' }] : []),
    ...(engraving ? [{ request: ENGRAVING_REQUEST, note: [engr.text.trim() && `"${engr.text.trim()}"`, engr.font, engr.case, engr.position].filter(Boolean).join(' · ') }] : []),
    ...(polish ? [{ request: REQ.refinish, note: family }] : isCTR ? [{ request: REQ.noCase, note: '' }, { request: REQ.noBracelet, note: '' }] : []),
    ...reqs,
  ]

  const showEta = !vintage && !engraving && timeframeAtIntake({ isCTR, polish, requests: reqs })
  const missing = [
    !cls && 'Modern, Classic or Vintage',
    vintage && !feeOk && 'acceptance of the analysis fee',
    !job.watch_ref.trim() && 'model number',
    !job.watch_name.trim() && 'model name',
    !job.serial.trim() && 'serial #',
    !job.bracelet.trim() && 'bracelet description',
    !job.dial.trim() && 'dial description',
    isCTR && !tier && 'complete service offer',
    job.service_type === 'Warranty' && !job.purchase_date && 'date of purchase (warranty card)',
    polish && !family && 'polishing line',
    engraving && !engr.text.trim() && 'engraving text',
    engraving && !engr.font && 'engraving font',
    engraving && !engr.case && 'engraving letter case',
    !allReqs.length && 'at least one request',
    !client.name.trim() && 'client name',
    client.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(client.email.trim()) && 'a valid email (or leave it blank)',
    !sig && 'client signature',
  ].filter(Boolean)

  async function save() {
    if (missing.length) return setMsg('Still needed: ' + missing.join(', ') + '.')
    setBusy(true); setMsg('')
    const clean = {
      ...job, edge_no: job.edge_no.trim(), watch_ref: job.watch_ref.trim().toUpperCase(),
      ctr_tier: isCTR ? tier : null, ctr_price: ctrPrice ?? null, polish, polish_family: polish ? family : null,
      polish_price: polishPrice ?? null, eta_quoted: showEta ? eta?.eta || null : null,
      classification: cls, vintage_fee: vintage ? vfee : null, purchase_date: job.service_type === 'Warranty' ? job.purchase_date || null : null,
      engraving: engraving ? { ...engr, text: engr.text.trim() } : null,
    }
    const quote = {
      items: [
        isCTR ? { label: `Complete overhaul (${tier.replace(/^CO - /, '').replace(/ \$.*/, '').toLowerCase().replace(/^./, c => c.toUpperCase())})`, price: ctrPrice ?? 'On estimate' } : { label: job.service_type, price: 'On estimate' },
        ...(polish ? [{ label: 'Refinish case and bracelet', price: polishPrice ?? 'On estimate' }] : []),
      ],
      total: total || null,
      weeks: showEta ? weeksUntil(eta?.eta) : null,
    }
    let id = null
    try {
      // The Edge job # is added later by the Service Manager (watch validation); the job gets a provisional number now (P<yymmdd>-<nn>)
      const cl = { ...client, email: client.email.trim() || null }
      id = await api.createJob(clean, conds, allReqs, cl)
      clean.edge_no = (await api.loadJob(id)).edge_no
      const args = { job: clean, client, requests: allReqs, conditions: conds, signaturePng: sig }
      // Rolex Immediate Proceed (Rolex's own form): Vintage (Workflow v2.1, 1.1), or a complete service the client wants done without waiting
      // for the estimate. Not used routinely in store: the receipt shows the estimated price and the estimate follows within 24 h (Dylan, 2026-11-12).
      const feePdf = vintage ? await makeVintageFee({ ...args, fee: vfee, weeks: vweeks }) : null
      const ipPdf = vintage || (isCTR && proceedNow) ? await makeImmediateProceedRolex({ ...args, staffName, offer: isCTR ? tier : null, offerPrice: ctrPrice,
        polish, polishPrice: polishPrice ?? 210, includeAllowance: !!settings?.immediate_proceed?.include_allowance, vintageFee: vintage ? vfee : null }) : null
      const mainPdf = vintage ? feePdf : await makeReceipt({ ...args, quote })
      const engrPdf = engraving ? await makeEngravingForm({ job: clean, client, engraving: clean.engraving, staffName }) : null
      const doc = await api.uploadJobDoc(id, vintage ? 'vintage_fee' : 'receipt', mainPdf, vintage ? vintageFeeFileName(clean) : receiptFileName(clean), userId)
      if (ipPdf) await api.uploadJobDoc(id, 'immediate_proceed', ipPdf, immediateProceedFileName(clean), userId)
      if (engrPdf) await api.uploadJobDoc(id, 'engraving_request', engrPdf, engravingFileName(clean), userId)
      const extra = [ipPdf, engrPdf].filter(Boolean)
      const pdf = extra.length ? await mergePdfs([mainPdf, ...extra]) : mainPdf // printed together, filed separately
      for (const p of photos) await api.uploadJobPhoto(id, p.blob, 'Intake', userId).catch(() => {})
      // The client's copy by email, when they gave an address (sent from the live site once email is connected)
      let emailed = null
      if (cl.email) emailed = await api.emailJobDoc(doc.id, 'client').then(r => `emailed to ${r.to}`, e => `not emailed: ${e.message}`)
      actions.say(`Job ${clean.edge_no} taken in. ${vintage ? 'Vintage Analysis Fee' : 'Receipt'}${ipPdf ? ' and Immediate Proceed' : ''}${engrPdf ? ' and Rolex Engraving Request' : ''} saved${emailed ? `, ${emailed}` : ''}.`)
      onDone(id, pdf, doc, { ...clean, intake_at: new Date().toISOString() }, client, !!ipPdf, emailed)
    } catch (e) { setMsg(id ? `The job was saved (${clean.edge_no || 'see Jobs'}) but a document failed: ${e.message}. Open the job to print it; don't take the watch in again.` : e.message) } finally { setBusy(false) }
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
        {auto && !allClasses ? (
          <div className="offer autoclass" data-on="true">
            <b>{auto.cls}{auto.collection && auto.collection !== auto.cls ? ` · ${auto.collection}` : ''}</b>
            <span className="msg"> · {CLASSES.find(c => c.name === auto.cls)?.hint} · from the {auto.why}</span>
            <button type="button" className="link" onClick={() => setAllClasses(true)}>Change</button>
          </div>
        ) : (
          <div className="cards">
            {CLASSES.map(c => (
              <button key={c.name} type="button" className="card small" aria-pressed={cls === c.name} onClick={() => { setAllClasses(true); chooseClass(c.name, c.name === auto?.cls ? suggested : null) }}>
                <span className="card-title">{c.name}</span><span className="msg">{c.hint}</span>
              </button>
            ))}
            {!auto && <p className="msg">{job.watch_ref ? "This model isn't in our list yet: choose the class." : 'Enter the model number above and the class is chosen for you.'}</p>}
          </div>
        )}
        {vintage && (
          <div className="offer" data-on="true">
            <b>Rolex Vintage Analysis Fee · {money(vfee)} + GST ({money(Math.round(vfee * 105) / 100)})</b>
            <p className="msg">An in-depth analysis is needed to prepare the estimate. Your watch is analysed and serviced by Rolex in Toronto. The fee remains payable if the estimate is refused or the watch is deemed counterfeit. Vintage estimates within 3 weeks; restoration estimates within 3 months of your approval.</p>
          </div>
        )}
        {!vintage && <div className="chips">
          {SERVICE_TYPES.map(t => <button key={t} type="button" className="chip" aria-pressed={job.service_type === t} onClick={() => { setJob({ ...job, service_type: t }); if (t === 'Engraving') setPolish(false) }}>{t === 'CTR' ? 'Complete service' : t}</button>)}
        </div>}
        {job.service_type === 'Warranty' && (
          <label className="field">Date of purchase (on the Rolex warranty card)<input type="date" value={job.purchase_date || ''} onChange={e => setJob({ ...job, purchase_date: e.target.value })} style={{ maxWidth: 220 }} /></label>
        )}
        {engraving && (
          <div className="offer" data-on="true">
            <b>Rolex engraving · sent to Rolex Toronto</b>
            <p className="msg">Engraved by Rolex: usually $100–150 and 5–7 business days at Rolex, plus shipping. Centred on the case back unless you tell us otherwise. Rolex intends this for new or stock watches.</p>
            <label className="field">Engraving text (as it should appear; new line for each line)
              <textarea rows={3} value={engr.text} onChange={e => setEngr({ ...engr, text: e.target.value })} placeholder="Happy 40th · J.A. · 2026" /></label>
            <div className="msg">Font</div>
            <div className="chips">{ENGRAVING_FONTS.map(f => <button key={f} type="button" className="chip" aria-pressed={engr.font === f} onClick={() => setEngr({ ...engr, font: f })}>{f}</button>)}</div>
            <div className="msg">Letters</div>
            <div className="chips">{ENGRAVING_CASES.map(c => <button key={c} type="button" className="chip" aria-pressed={engr.case === c} onClick={() => setEngr({ ...engr, case: c })}>{c}</button>)}</div>
            <div className="grid">
              <label>Position<input value={engr.position} onChange={e => setEngr({ ...engr, position: e.target.value })} /></label>
              <label>Note for Rolex<input value={engr.note} onChange={e => setEngr({ ...engr, note: e.target.value })} placeholder="Optional" /></label>
            </div>
          </div>
        )}
        {isCTR && (
          <div className="cards">
            {Object.entries(ctrPrices).filter(([t]) => allTiers || !suggested || tier !== suggested || t === tier).map(([t, p]) => (
              <button key={t} type="button" className="card" aria-pressed={tier === t} onClick={() => setTier(t)}>
                <span className="card-title">{t.replace(/^CO - /, '').replace(/ \$.*/, '').toLowerCase().replace(/^./, c => c.toUpperCase())} complete service</span><span className="card-price">{p != null ? money(p) : 'Price on estimate'}</span>
                {t === suggested && auto?.collection && <span className="msg">For the {auto.collection} collection</span>}
              </button>
            ))}
            {!allTiers && suggested && tier === suggested && <button type="button" className="link" onClick={() => setAllTiers(true)}>Other offers</button>}
            {!cls && <p className="msg">Choose Modern or Classic above to see the Rolex offers.</p>}
          </div>
        )}
        {!vintage && !engraving && <div className="offer" data-on={polish}>
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
        </div>}
        {isCTR && (
          <label className="tog big"><input type="checkbox" checked={proceedNow} onChange={e => setProceedNow(e.target.checked)} /> Proceed immediately, without waiting for the estimate (Rolex Immediate Proceed form)</label>
        )}
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
            <div className="msg">{vintage ? 'Rolex Vintage Analysis Fee. The estimate for the work follows the analysis.' : engraving ? 'Rolex engraving fee, usually $100–150 (confirmed by Rolex).' : <>{isCTR ? `${tier || 'Choose a tier'} complete service` : job.service_type}{polish ? ` + polishing` : ''}. Final estimate after our watchmakers' analysis.</>}</div></div>
          {engraving ? (
            <div><div className="msg">Timing</div><div className="big-num">About 2 weeks</div>
              <div className="msg">Rolex engraves in 5–7 business days, plus shipping to and from Toronto. We'll call you when it's back.</div></div>
          ) : vintage ? (
            <div><div className="msg">Timing</div><div className="big-num">Estimate in about 3 weeks</div>
              <div className="msg">Restoration estimates within 3 months. We'll contact you as soon as Rolex has analysed your watch.</div></div>
          ) : showEta ? (
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
          <label>Email (we'll send you a copy)<input type="email" value={client.email} onChange={e => setClient({ ...client, email: e.target.value })} autoComplete="off" inputMode="email" placeholder="Optional" /></label>
        </div>
        {vintage && (
          <label className="tog big"><input type="checkbox" checked={feeOk} onChange={e => setFeeOk(e.target.checked)} /> I accept the Rolex Vintage Analysis Fee of {money(vfee)} + GST ({money(Math.round(vfee * 105) / 100)})</label>
        )}
        <p className="msg">By signing, you confirm the details above and accept the {vintage ? 'analysis fee and the' : ''} terms (provided on the printed document). Your details are kept only on your signed {vintage ? 'form' : 'receipt'}.</p>
        <SignaturePad onChange={setSig} />
      </section>

      <div className="savebar">
        <span className="msg warn">{msg}</span>
        <span className="grow" />
        <button type="button" className="btn solid big" disabled={busy} onClick={save}>{busy ? 'Saving…' : vintage ? 'Confirm and print form' : 'Confirm and print receipt'}</button>
      </div>
    </div>
  )
}
