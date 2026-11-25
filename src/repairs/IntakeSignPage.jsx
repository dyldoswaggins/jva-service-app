import { useState } from 'react'
import { api } from '../data.js'
import { money } from '../rules.js'
import SignaturePad from './SignaturePad.jsx'

const toDataUrl = bytes => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(new Blob([bytes], { type: 'image/png' })) })
const SIGN_TEXT = {
  receipt: 'I, the undersigned, declare that I have read and accepted the legal notices applicable to the establishment of the estimate (appendix page). I confirm that the data transmitted on the watch is correct.',
  immediate_proceed: 'It is accepted that after analysis by a certified watchmaker, any intervention not included in the set service price but necessary for the proper functioning of the watch will be charged within the limit of an additional 15% of the set service price; should the amount be exceeded, a detailed estimate will be submitted. The interventions requested are invoiced. The data in this document will be transmitted to and processed by Rolex Canada.',
  vintage_fee: 'I, the undersigned, certify that I have read and understood the estimate as well as the legal notices attached and confirm my decision for the above-mentioned watch.',
}

// The client signs their intake forms (Receipt, Rolex Immediate Proceed, Vintage Analysis Fee) from the private link emailed at
// intake, or later on the boutique iPad. One signature box per form; each is filled into that form (Richard, 2026-11-25).
export default function IntakeSignPage({ token, info, onClose }) {
  const [name, setName] = useState(info.client_name || '')
  const [sigs, setSigs] = useState({})
  const [fee, setFee] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null)
  const hasFee = info.forms.some(f => f.kind === 'vintage_fee')
  const vfee = Number(info.vintage_fee ?? 350)

  async function submit() {
    setErr('')
    if (name.trim().length < 2) return setErr('Please type your full name.')
    const missing = info.forms.filter(f => !sigs[f.id])
    if (missing.length) return setErr(`Please sign: ${missing.map(f => f.title).join(', ')}.`)
    if (hasFee && !fee) return setErr('Please tick whether you accept the analysis fee.')
    setBusy(true)
    try {
      const signatures = {}
      for (const f of info.forms) signatures[f.id] = await toDataUrl(sigs[f.id])
      setDone(await api.signSubmit({ token, name: name.trim(), signatures, fee_decision: fee }))
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const shell = body => (
    <div className="intake client signpage">
      <header className="welcome">
        <img src="/jva-emblem.svg" alt="" className="emblem" />
        <div>
          <div className="brand">J. Vair Anderson</div>
          <h1 className="title">Your Rolex service documents</h1>
          <div className="msg">Job {info.edge_no}{info.watch ? ` · ${info.watch}` : ''}{info.serial_last4 ? ` · serial ending ${info.serial_last4}` : ''}</div>
        </div>
        {onClose && <button type="button" className="btn" onClick={onClose}>Close</button>}
      </header>
      {body}
      <p className="msg center">J. Vair Anderson · 409 – 3rd Street SW, Calgary · (403) 266-1669</p>
    </div>
  )

  if (done) return shell(
    <section className="step">
      <h2>Thank you{name ? `, ${name.split(' ')[0]}` : ''}</h2>
      <p>Your documents are signed. Please keep your receipt and bring it with photo ID when you collect your watch.</p>
      {done.fee_decision === 'decline' && <p>You declined the analysis fee: we will contact you to arrange the return of your watch.</p>}
      {done.copied && <p className="msg">A copy of your signed documents has been emailed to you.</p>}
      {onClose && <div className="actions"><button type="button" className="btn solid big" onClick={onClose}>Done</button></div>}
    </section>)

  return shell(<>
    <section className="step">
      <h2><span>1</span>Your name</h2>
      <p>{info.client_name ? `Dear ${info.client_name}, p` : 'P'}lease review each document, including the legal notices, and sign it below.</p>
      <label className="stackfield">Your full name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label>
    </section>
    {info.forms.map((f, i) => (
      <section key={f.id} className="step">
        <h2><span>{i + 2}</span>{f.title}</h2>
        {f.url && <div className="actions"><a className="btn big" href={f.url} target="_blank" rel="noreferrer">Open the {f.title} (PDF)</a></div>}
        {f.kind === 'vintage_fee' && (<>
          <p><b>Rolex Vintage Analysis Fee · {money(vfee)} + GST 5% ({money(Math.round(vfee * 105) / 100)})</b></p>
          <p className="msg">An in-depth analysis of the watch will be necessary in order to prepare an estimate. This fee remains payable in the event of refusal of the estimate, or if the watch is deemed to be counterfeit.</p>
          <label className="tog big"><input type="radio" name="fee" checked={fee === 'accept'} onChange={() => setFee('accept')} /> I accept the analysis fee</label>
          <label className="tog big"><input type="radio" name="fee" checked={fee === 'decline'} onChange={() => setFee('decline')} /> I decline the analysis fee</label>
        </>)}
        <p className="msg">{SIGN_TEXT[f.kind]}</p>
        <SignaturePad onChange={png => setSigs(s => ({ ...s, [f.id]: png }))} label={`Sign the ${f.title} here`} />
      </section>
    ))}
    <div className="savebar">
      <span className="msg warn">{err}</span>
      <span className="grow" />
      <button type="button" className="btn solid big" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Sign documents'}</button>
    </div>
  </>)
}
