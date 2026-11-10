import { useState } from 'react'
import { api } from './data.js'

export const STAFF_DOMAIN = 'jvairanderson.com'
const USE_MICROSOFT = import.meta.env.VITE_SIGNIN === 'microsoft'

// Sign in with a 6-digit code emailed to a J. Vair Anderson address.
export default function SignIn() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  if (USE_MICROSOFT)
    return (
      <div className="panel signin">
        <h2>Sign in</h2>
        <p className="msg">Use your J. Vair Anderson Microsoft account.</p>
        <div><button className="btn solid" onClick={api.signIn}>Sign in with Microsoft</button></div>
      </div>
    )

  async function send(e) {
    e?.preventDefault()
    const addr = email.trim().toLowerCase()
    if (!addr.endsWith('@' + STAFF_DOMAIN)) return setMsg(`Use your @${STAFF_DOMAIN} email address.`)
    setBusy(true); setMsg('')
    try { await api.sendCode(addr); setEmail(addr); setSent(true); setCode('') } catch (err) { setMsg(err.message) } finally { setBusy(false) }
  }
  async function verify(e) {
    e.preventDefault()
    setBusy(true); setMsg('')
    try { await api.verifyCode(email, code.trim()) } catch (err) { setMsg(err.message); setBusy(false) }
  }

  return (
    <div className="panel signin">
      <h2>Sign in</h2>
      {!sent ? (
        <form className="stack" onSubmit={send}>
          <label className="field">Work email
            <input type="email" autoComplete="email" autoFocus value={email} onChange={e => setEmail(e.target.value)}
              placeholder={`name@${STAFF_DOMAIN}`} />
          </label>
          <div><button className="btn solid" disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Send code'}</button></div>
        </form>
      ) : (
        <form className="stack" onSubmit={verify}>
          <p className="msg">We emailed a code to <b>{email}</b>. It can take a minute; check junk mail too.</p>
          <label className="field">Code
            <input inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} maxLength={8}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" className="code" />
          </label>
          <div className="actions">
            <button className="btn solid" disabled={busy || code.length < 6}>{busy ? 'Signing in…' : 'Sign in'}</button>
            <button type="button" className="btn" disabled={busy} onClick={send}>Send a new code</button>
            <button type="button" className="link" onClick={() => { setSent(false); setMsg('') }}>Different email</button>
          </div>
        </form>
      )}
      {msg && <p className="msg warn">{msg}</p>}
    </div>
  )
}
