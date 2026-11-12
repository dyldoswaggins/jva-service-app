import { useState } from 'react'
import { api } from './data.js'

export const STAFF_DOMAIN = 'jvairanderson.com'
const USE_MICROSOFT = import.meta.env.VITE_SIGNIN === 'microsoft'

// Sign in with username + password (Admin creates <username>@jvairanderson.com in Supabase). Backup: a code emailed to that address.
export default function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [mode, setMode] = useState('password') // password | code-send | code-verify
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

  // Username "richard" → richard@jvairanderson.com (the account behind it); a full work email also works
  const addr = () => { const u = email.trim().toLowerCase(); return u.includes('@') ? u : `${u}@${STAFF_DOMAIN}` }
  const checkDomain = () => (addr().endsWith('@' + STAFF_DOMAIN) ? true : (setMsg('Use your username, e.g. richard.'), false))
  const run = async fn => { setBusy(true); setMsg(''); try { await fn() } catch (err) { setMsg(err.message) } finally { setBusy(false) } }

  const signIn = e => { e.preventDefault(); if (checkDomain()) run(() => api.signInPassword(addr(), password)) }
  const send = e => { e?.preventDefault(); if (checkDomain()) run(async () => { await api.sendCode(addr()); setMode('code-verify'); setCode('') }) }
  const verify = e => { e.preventDefault(); run(() => api.verifyCode(addr(), code.trim())) }

  return (
    <div className="panel signin">
      <h2>Sign in</h2>
      {mode === 'password' && (
        <form className="stack" onSubmit={signIn}>
          <label className="field">Username
            <input type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus value={email}
              onChange={e => setEmail(e.target.value)} placeholder="e.g. richard" />
          </label>
          <label className="field">Password
            <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          <div className="actions">
            <button className="btn solid" disabled={busy || !email.trim() || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
            <button type="button" className="link" onClick={() => { setMode('code-send'); setMsg('') }}>Forgot password?</button>
          </div>
        </form>
      )}
      {mode === 'code-send' && (
        <form className="stack" onSubmit={send}>
          <p className="msg">Ask Dylan or Richard to reset your password, or get a code at your work email.</p>
          <label className="field">Username
            <input type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. richard" />
          </label>
          <div className="actions">
            <button className="btn solid" disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Email me a code'}</button>
            <button type="button" className="link" onClick={() => { setMode('password'); setMsg('') }}>Back to password</button>
          </div>
        </form>
      )}
      {mode === 'code-verify' && (
        <form className="stack" onSubmit={verify}>
          <p className="msg">We emailed a code to <b>{addr()}</b>. It can take a minute; check junk mail too. After signing in, set a new password (top right).</p>
          <label className="field">Code
            <input inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} maxLength={8}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" className="code" />
          </label>
          <div className="actions">
            <button className="btn solid" disabled={busy || code.length < 6}>{busy ? 'Signing in…' : 'Sign in'}</button>
            <button type="button" className="btn" disabled={busy} onClick={send}>Send a new code</button>
            <button type="button" className="link" onClick={() => { setMode('password'); setMsg('') }}>Back to password</button>
          </div>
        </form>
      )}
      {msg && <p className="msg warn">{msg}</p>}
    </div>
  )
}

// "Change password" (header): everyone sets their own after the first sign-in
export function ChangePassword({ actions }) {
  const [open, setOpen] = useState(false)
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  if (!open) return <button type="button" className="btn" onClick={() => setOpen(true)}>Change password</button>
  const save = async e => {
    e.preventDefault()
    if (a.length < 8) return setMsg('At least 8 characters.')
    if (a !== b) return setMsg('The two passwords are different.')
    setBusy(true); setMsg('')
    try { await api.changePassword(a); actions?.say?.('Password changed'); setOpen(false); setA(''); setB('') } catch (err) { setMsg(err.message) } finally { setBusy(false) }
  }
  return (
    <form className="actions pwform" onSubmit={save}>
      <input type="password" autoComplete="new-password" autoFocus value={a} onChange={e => setA(e.target.value)} placeholder="New password" aria-label="New password" />
      <input type="password" autoComplete="new-password" value={b} onChange={e => setB(e.target.value)} placeholder="Again" aria-label="New password again" />
      <button className="btn solid" disabled={busy}>Save</button>
      <button type="button" className="btn" onClick={() => { setOpen(false); setMsg('') }}>Cancel</button>
      {msg && <span className="msg warn">{msg}</span>}
    </form>
  )
}
