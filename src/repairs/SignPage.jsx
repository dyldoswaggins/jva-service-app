import { useEffect, useMemo, useState } from 'react'
import { api } from '../data.js'
import { money } from '../rules.js'
import SignaturePad from './SignaturePad.jsx'

const toDataUrl = bytes => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(new Blob([bytes], { type: 'image/png' })) })
const sum = ls => Math.round(ls.reduce((s, l) => s + (Number(l.price) || 0), 0) * 100) / 100

// The client reviews and signs their estimate: from the private link in the estimate email (/sign/<token>),
// or on the boutique iPad ("Sign in store" on the job). No account needed. The choices are filled into the estimate
// itself (same template), filed on the job, and the decision is recorded.
export default function SignPage({ token, onClose }) {
  const [info, setInfo] = useState(null)
  const [err, setErr] = useState('')
  const [refused, setRefused] = useState(false)
  const [opt, setOpt] = useState({})
  const [name, setName] = useState('')
  const [remarks, setRemarks] = useState('')
  const [sig, setSig] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  useEffect(() => { api.signGet(token).then(i => { setInfo(i); if (i.client_name) setName(i.client_name) }).catch(e => setErr(e.message)) }, [token])
  const lines = info?.lines || { necessary: [], optional: [] }
  const chosen = useMemo(() => lines.optional.filter(l => opt[l.key]), [lines, opt])
  const sub = refused ? 0 : sum(lines.necessary) + sum(chosen)
  const tax = Math.round(sub * 5) / 100

  async function submit() {
    setErr('')
    if (name.trim().length < 2) return setErr('Please type your full name.')
    if (!sig) return setErr('Please sign in the box.')
    setBusy(true)
    try {
      const r = await api.signSubmit({ token, refused, optional: refused ? {} : opt, name: name.trim(), remarks: remarks.trim(), signature: await toDataUrl(sig) })
      setDone(r)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const shell = body => (
    <div className="intake client signpage">
      <header className="welcome">
        <img src="/jva-emblem.svg" alt="" className="emblem" />
        <div>
          <div className="brand">J. Vair Anderson</div>
          <h1 className="title">Your Rolex service estimate</h1>
          {info?.edge_no && <div className="msg">Job {info.edge_no}{info.watch ? ` · ${info.watch}` : ''}{info.serial_last4 ? ` · serial ending ${info.serial_last4}` : ''}</div>}
        </div>
        {onClose && <button type="button" className="btn" onClick={onClose}>Close</button>}
      </header>
      {body}
      <p className="msg center">J. Vair Anderson · 409 – 3rd Street SW, Calgary · (403) 266-1669</p>
    </div>
  )

  if (err && !info) return shell(<section className="step"><p className="msg warn">{err}</p></section>)
  if (!info) return shell(<section className="step"><p className="msg">Loading your estimate…</p></section>)
  if (info.status !== 'open') return shell(
    <section className="step">
      <h2>{info.status === 'signed' ? 'This estimate has already been signed' : 'This link is no longer active'}</h2>
      <p>{info.status === 'signed' ? 'Thank you, we have your decision.' : 'Please call us at (403) 266-1669 and we will send you a new link.'}</p>
    </section>)
  if (done) return shell(
    <section className="step">
      <h2>Thank you{name ? `, ${name.split(' ')[0]}` : ''}</h2>
      <p>{done.refused ? 'We have recorded that you refuse the estimate. We will contact you to arrange the return of your watch.'
        : 'Your decision is recorded. We will confirm the work and timing shortly.'}</p>
      {done.copied && <p className="msg">A copy of your signed estimate has been emailed to you.</p>}
      {onClose && <div className="actions"><button type="button" className="btn solid big" onClick={onClose}>Done</button></div>}
    </section>)

  return shell(<>
    <section className="step">
      <h2><span>1</span>Review your estimate</h2>
      <p>{info.client_name ? `Dear ${info.client_name}, o` : 'O'}ur watchmakers have completed their analysis. Please review the estimate, including the legal notices, before you decide.</p>
      {info.pdf_url && <div className="actions"><a className="btn solid big" href={info.pdf_url} target="_blank" rel="noreferrer">Open the estimate (PDF)</a></div>}
    </section>

    <section className="step">
      <h2><span>2</span>Your decision</h2>
      <label className="tog big"><input type="radio" name="d" checked={!refused} onChange={() => setRefused(false)} /> I accept the necessary work ({money(sum(lines.necessary))})</label>
      <ul className="msg signlist">{lines.necessary.map(l => <li key={l.key}>{l.label}{l.price != null ? ` · ${money(l.price)}` : ''}</li>)}</ul>
      {!refused && lines.optional.length > 0 && (
        <div className="subpanel">
          <b>Optional work: tick what you would like</b>
          {lines.optional.map(l => (
            <label key={l.key} className="tog big"><input type="checkbox" checked={!!opt[l.key]} onChange={e => setOpt({ ...opt, [l.key]: e.target.checked })} />
              {l.label}{l.parts?.length ? <span className="msg"> ({l.parts[0]})</span> : ''} · {l.price != null ? money(l.price) : 'price to confirm'}</label>
          ))}
        </div>
      )}
      <label className="tog big"><input type="radio" name="d" checked={refused} onChange={() => setRefused(true)} /> I refuse the estimate</label>
      {!refused && (
        <div className="totals-box">
          <div><span>Accepted work (tax excl.)</span><b>{money(sub)}</b></div>
          <div><span>GST 5%</span><b>{money(tax)}</b></div>
          <div className="grand"><span>Total CAD</span><b>{money(sub + tax)}</b></div>
        </div>
      )}
      <label className="stackfield">Remarks (optional)<input value={remarks} maxLength={110} onChange={e => setRemarks(e.target.value)} /></label>
    </section>

    <section className="step">
      <h2><span>3</span>Sign</h2>
      <label className="stackfield">Your full name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label>
      <p className="msg">I, the undersigned, certify that I have read and understood the estimate as well as the legal notices attached and confirm my decision for the above mentioned watch.</p>
      <SignaturePad onChange={setSig} />
    </section>

    <div className="savebar">
      <span className="msg warn">{err}</span>
      <span className="grow" />
      <button type="button" className="btn solid big" disabled={busy} onClick={submit}>{busy ? 'Saving…' : refused ? 'Sign: refuse the estimate' : 'Sign and accept'}</button>
    </div>
  </>)
}
