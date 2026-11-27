import { useState } from 'react'
import { api } from '../data.js'
import { wmClass } from '../watchmakers.js'

// A watchmaker's name in their colour; "Unassigned" in grey
export function WmTag({ name, names, small }) {
  return <span className={`wmtag ${wmClass(name, names)}${small ? ' small' : ''}`}>{name || 'Unassigned'}</span>
}

// "Show: All · Emmanuel · Jared · Unassigned" switch for the watchmaker screens
export function WmScope({ names, scope, setScope }) {
  return (
    <div className="chips small wmscope" role="group" aria-label="Show jobs for">
      <span className="msg">Show</span>
      {['all', ...names, 'none'].map(n => (
        <button key={n} type="button" className={`chip ${n === 'all' ? '' : wmClass(n === 'none' ? null : n, names)}`} aria-pressed={scope === n} onClick={() => setScope(n)}>
          {n === 'all' ? 'All watchmakers' : n === 'none' ? 'Unassigned' : n}
        </button>
      ))}
    </div>
  )
}

// Service Manager: assign the job to a watchmaker (Richard, 2026-11-27). Saves at once, with Undo.
export function AssignSelect({ job, names, userId, actions, onChange }) {
  const [busy, setBusy] = useState(false)
  const save = async v => {
    const prev = job.assigned_to || null
    setBusy(true)
    try {
      await api.updateJob(job.id, { assigned_to: v || null, assigned_by: v ? userId || null : null, assigned_at: v ? new Date().toISOString() : null })
      await onChange?.()
      actions.say(v ? `${job.edge_no} assigned to ${v}` : `${job.edge_no}: unassigned`, async () => {
        await api.updateJob(job.id, { assigned_to: prev, assigned_at: prev ? new Date().toISOString() : null }); await onChange?.()
      })
    } catch (e) { actions.say(e.message) } finally { setBusy(false) }
  }
  return (
    <select className={`assign ${wmClass(job.assigned_to, names)}`} value={job.assigned_to || ''} disabled={busy} onChange={e => save(e.target.value)} aria-label="Assign to watchmaker">
      <option value="">Unassigned</option>
      {job.assigned_to && !names.includes(job.assigned_to) && <option>{job.assigned_to}</option>}
      {names.map(n => <option key={n}>{n}</option>)}
    </select>
  )
}
