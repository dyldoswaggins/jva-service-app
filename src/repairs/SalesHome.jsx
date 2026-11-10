import { useState } from 'react'
import { api } from '../data.js'
import IntakeView from './IntakeView.jsx'
import { ChangePassword } from '../SignIn.jsx'

// What a Sales associate sees: the client-facing intake, then the receipt — nothing else in the app.
export default function SalesHome({ models, actions, userId, me, onSignOut }) {
  const [done, setDone] = useState(null) // { pdf, doc, job }
  const [key, setKey] = useState(0)
  const [msg, setMsg] = useState('')

  const print = () => {
    const url = URL.createObjectURL(done.pdf)
    if ('ontouchend' in document) return window.open(url, '_blank') // iPad: print / share from the PDF
    const f = document.createElement('iframe')
    f.style.cssText = 'position:fixed;width:0;height:0;border:0'
    f.src = url
    f.onload = () => { try { f.contentWindow.print() } catch { window.open(url, '_blank') } }
    document.body.appendChild(f)
  }
  const email = async () => {
    setMsg('')
    try { const r = await api.emailJobDoc(done.doc.id); actions.say(`${done.doc.file_name || 'Document'} emailed to ${r.to}`) } catch (e) { setMsg(e.message) }
  }

  return (
    <div className="sales-home">
      <div className="sales-bar">
        <span className="msg">{me.name || me.email} · Sales</span>
        {api.mode !== 'demo' && <ChangePassword actions={actions} />}
        <button type="button" className="btn" onClick={onSignOut}>Sign out</button>
      </div>
      {done ? (
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
            {done.job.classification === 'Vintage'
              ? <p>Your signed Vintage Analysis Fee and Immediate Proceed forms are ready. Please keep it and bring it with photo ID when you collect your watch. Your watch will be analysed by Rolex; we'll contact you with the estimate.</p>
              : <p>Your signed receipt is ready. Please keep it and bring it with photo ID when you collect your watch. We'll contact you with the full estimate after our watchmakers' analysis.</p>}
            <div className="actions">
              <button type="button" className="btn solid big" onClick={print}>{done.job.classification === 'Vintage' ? 'Print forms' : 'Print receipt'}</button>
              <button type="button" className="btn big" onClick={email}>Email to service manager</button>
              <span className="grow" />
              <button type="button" className="btn big" onClick={() => { setDone(null); setKey(k => k + 1); setMsg('') }}>Next client</button>
            </div>
            {msg && <p className="msg warn">{msg}</p>}
          </section>
        </div>
      ) : (
        <IntakeView key={key} standalone models={models} actions={actions} userId={userId} staffName={me.name || me.email}
          onDone={(id, pdf, doc, job) => id && setDone({ pdf, doc, job })} />
      )}
    </div>
  )
}
