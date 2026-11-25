import { useState } from 'react'
import { api } from '../data.js'
import IntakeView from './IntakeView.jsx'
import { ChangePassword } from '../SignIn.jsx'
import { makeBagLabel } from '../docs/label.js'
import PickupView from './PickupView.jsx'
import SignPage from './SignPage.jsx'

// What a Sales associate sees: the client-facing intake, then the receipt — nothing else in the app.
const listWords = l => (l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}` : l[0] || '')

export default function SalesHome({ models, actions, userId, me, onSignOut }) {
  const [done, setDone] = useState(null) // { pdf, doc, job }
  const [key, setKey] = useState(0)
  const [msg, setMsg] = useState('')
  const [view, setView] = useState('intake') // intake | pickup
  const [signing, setSigning] = useState(null) // token: the client signs the emailed forms on this iPad instead
  // After an intake, three steps are required (Richard, 2026-11-25): print the documents, print the bag label, email the service
  // manager. Leaving with "Next client" or "Sign out" before all three shows a warning first.
  const [steps, setSteps] = useState({ print: false, label: false, email: false })
  const [leaving, setLeaving] = useState(null) // 'next' | 'signout': waiting on the warning
  const mark = k => setSteps(s => ({ ...s, [k]: true }))
  const STEP_NAMES = { print: 'Print documents', label: 'Print bag label', email: 'Email to service manager' }
  const notDone = done ? Object.keys(STEP_NAMES).filter(k => !steps[k]) : []
  const nextClient = () => { setDone(null); setKey(k => k + 1); setMsg(''); setSteps({ print: false, label: false, email: false }); setLeaving(null) }
  const leave = kind => {
    if (notDone.length && !leaving) { setView('intake'); setSigning(null); return setLeaving(kind) }
    setLeaving(null)
    if (kind === 'next') nextClient(); else { nextClient(); onSignOut() }
  }

  const openPdf = blob => window.open(URL.createObjectURL(blob), '_blank')
  const print = () => {
    mark('print')
    const url = URL.createObjectURL(done.pdf)
    if ('ontouchend' in document) return window.open(url, '_blank') // iPad: print / share from the PDF
    const f = document.createElement('iframe')
    f.style.cssText = 'position:fixed;width:0;height:0;border:0'
    f.src = url
    f.onload = () => { try { f.contentWindow.print() } catch { window.open(url, '_blank') } }
    document.body.appendChild(f)
  }
  const email = async () => {
    setMsg(''); mark('email')
    try { const r = await api.emailJobDoc(done.doc.id); actions.say(`${done.doc.file_name || 'Document'} emailed to ${r.to}`) } catch (e) { setMsg(e.message) }
  }

  return (
    <div className="sales-home">
      <div className="sales-bar">
        <span className="msg">{me.id ? `${me.name || me.email} · Sales` : me.name}</span>
        <span className="views">
          <button type="button" aria-pressed={view === 'intake'} onClick={() => setView('intake')}>Take in a watch</button>
          <button type="button" aria-pressed={view === 'pickup'} onClick={() => setView('pickup')}>Pickup</button>
        </span>
        {api.mode !== 'demo' && me.id && <ChangePassword actions={actions} />}
        <button type="button" className="btn" onClick={() => (done ? leave('signout') : onSignOut())}>{me.id ? 'Sign out' : 'Switch role'}</button>
      </div>
      {signing ? <SignPage token={signing} onClose={() => setSigning(null)} /> : view === 'pickup' ? <PickupView actions={actions} /> : done ? (
        <div className="intake client">
          <header className="welcome">
            <img src="/jva-emblem.svg" alt="" className="emblem" />
            <div>
              <div className="brand">J. Vair Anderson</div>
              <h1 className="title">Thank you</h1>
              <div className="msg">Your watch is in our care. Job {done.job.edge_no}.</div>
            </div>
          </header>
          <section className="step">
            <p>{done.signLink ? `Your ${listWords(done.forms)} ${done.forms.length > 1 ? 'are' : 'is'} ready to sign: we've sent a private link to ${done.signLink.email}.`
              : `Your signed ${listWords(done.forms)} ${done.forms.length > 1 ? 'are' : 'is'} ready.`} Please keep your receipt and bring it with photo ID when you collect your watch.{' '}
              {done.job.classification === 'Vintage' ? "Your watch will be analysed by Rolex; we'll contact you with the estimate."
                : done.job.service_type === 'Engraving' ? "Your watch goes to Rolex in Toronto for engraving; we'll call you when it's back."
                : "We'll contact you with the full estimate after our watchmakers' analysis."}</p>
            {done.emailed && <p className={`msg${/not emailed/.test(done.emailed) ? ' warn' : ''}`}>{done.emailed.replace(/^./, c => c.toUpperCase())}.</p>}
            {done.signLink && (
              <div className="actions">
                <button type="button" className="btn big" onClick={() => setSigning(done.signLink.token)}>Client signs here instead</button>
                <button type="button" className="btn big" onClick={async () => { setMsg(''); try { const r = await api.emailSignRequest(done.signLink.id); actions.say(`Signing link emailed to ${r.to}`) } catch (e) { setMsg(e.message) } }}>Email the link again</button>
              </div>
            )}
            <h3 className="required-steps">Required before the next client *</h3>
            <div className="actions">
              <button type="button" className="btn big" data-done={steps.print} onClick={print}>{steps.print ? '✓ ' : ''}Print documents</button>
              <button type="button" className="btn big" data-done={steps.label} onClick={async () => { mark('label'); openPdf(await makeBagLabel({ job: done.job, clientName: done.client?.name })) }}>{steps.label ? '✓ ' : ''}Print bag label</button>
              <button type="button" className="btn big" data-done={steps.email} onClick={email}>{steps.email ? '✓ ' : ''}Email to service manager</button>
              <span className="grow" />
              <button type="button" className={`btn big${notDone.length ? '' : ' solid'}`} onClick={() => leave('next')}>Next client</button>
            </div>
            {msg && <p className="msg warn">{msg}</p>}
            {leaving && notDone.length > 0 && (
              <div className="leave-warning" role="alert">
                <b>Not done yet: {listWords(notDone.map(k => STEP_NAMES[k]))}.</b>
                <span className="msg">Every intake needs the documents printed, the bag label printed and the service manager emailed.</span>
                <div className="actions">
                  <button type="button" className="btn solid big" onClick={() => setLeaving(null)}>Go back and finish</button>
                  <button type="button" className="btn big" onClick={() => leave(leaving)}>{leaving === 'next' ? 'Next client anyway' : 'Sign out anyway'}</button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : (
        <IntakeView key={key} standalone models={models} actions={actions} userId={userId} staffName={me.id ? me.name || me.email : ''} staffEmail={me.id ? me.email || '' : ''}
          onDone={(id, pdf, doc, job, client, ip, emailed, extra) => id && setDone({ pdf, doc, job, client, ip, emailed, forms: extra?.forms || ['Receipt'], signLink: extra?.signLink || null })} />
      )}
    </div>
  )
}
