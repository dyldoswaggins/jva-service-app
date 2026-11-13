import { useState } from 'react'
import { api } from '../data.js'
import { fmtTime } from '../rules.js'

// Contact log (Workflow v2.1 step 8): calls, emails, texts with the client about delays, approvals, ready for pickup. Office only.
export default function JobContacts({ job, who, actions, onChange }) {
  const [f, setF] = useState({ method: 'call', direction: 'out', summary: '' })
  const [msg, setMsg] = useState('')
  const list = [...(job.job_contacts || [])].sort((a, b) => (a.at < b.at ? 1 : -1))
  const add = async () => {
    if (f.summary.trim().length < 3) return setMsg('Write what was said or agreed.')
    setMsg('')
    try { await api.addContact(job.id, f.method, f.direction, f.summary.trim()); setF({ ...f, summary: '' }); actions.say('Contact logged'); onChange() } catch (e) { setMsg(e.message) }
  }
  return (
    <section className="panel">
      <h3>Contact log</h3>
      <div className="actions">
        <select value={f.method} onChange={e => setF({ ...f, method: e.target.value })} aria-label="How">{['call', 'email', 'text', 'voicemail', 'in person'].map(m => <option key={m}>{m}</option>)}</select>
        <select value={f.direction} onChange={e => setF({ ...f, direction: e.target.value })} aria-label="Direction"><option value="out">to client</option><option value="in">from client</option></select>
        <input value={f.summary} onChange={e => setF({ ...f, summary: e.target.value })} onKeyDown={e => e.key === 'Enter' && add()} placeholder="e.g. Parts on backorder, new ETA mid-December; client OK" style={{ flex: 1, minWidth: 220 }} />
        <button type="button" className="btn solid" onClick={add}>Log</button>
      </div>
      {msg && <p className="msg warn">{msg}</p>}
      {list.length ? (
        <ul className="contactlog">{list.map(c => (
          <li key={c.id}><span className="msg">{fmtTime(c.at)} · {c.method} {c.direction === 'in' ? 'from' : 'to'} client · {who(c.by_user)}</span><div>{c.summary}</div></li>
        ))}</ul>
      ) : <p className="msg">Nothing logged yet.</p>}
    </section>
  )
}
