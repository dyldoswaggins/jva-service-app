import { useMemo, useState } from 'react'
import { api } from '../data.js'
import { money } from '../rules.js'
import { documentLines, findings, isBacked } from '../docs/lines.js'

// Common Rolex service lines (wording as on the SAV documents); free text allowed
const SERVICES = ['Replace crystal', 'Replace bezel insert', 'Replace bezel', 'Replace crown', 'Replace dial', 'Replace hands',
  'Relume dial and hands', 'Repair case middle part', 'Repair bracelet', 'Replace bracelet links', 'Replace clasp', 'Refinish case', 'Refinish bracelet']

const findingLabel = (c, t) => `${c} ${String(t || '').toLowerCase()}`

// The watchmaker's assessment: what is Necessary and what is Optional.
// Optional work must be backed by a confirmed finding in the watch analysis (enforced in the database too, migration 016).
export default function JobAssessment({ job, allParts, can, actions, onChange }) {
  const [add, setAdd] = useState(null)   // { label, details, kind, finding: 'Component|Term' }
  const [moving, setMoving] = useState(null) // line key choosing a finding before moving to Optional
  const [msg, setMsg] = useState('')
  const { necessary, optional } = useMemo(() => documentLines(job, allParts), [job, allParts])
  const found = findings(job)
  const locked = !!job.estimate_decision
  const edit = can.bench && !locked
  const run = async (fn, done) => { setMsg(''); try { await fn(); if (done) actions.say(done); onChange() } catch (e) { setMsg(e.message) } }

  const extras = job.extra_lines || []
  const saveExtras = list => api.updateJob(job.id, { extra_lines: list })

  // Move a line between Necessary and Optional. Optional needs a finding: the line's own if confirmed, else ask.
  const toOptional = (l, finding) => {
    const [c, t] = finding ? finding.split('|') : [l.component, l.term]
    if (!isBacked(job, c, t)) return setMoving(l.key)
    setMoving(null)
    return run(() => l.source === 'part'
      ? api.setJobPartNeed(l.id, 'optional', c, t)
      : saveExtras(extras.map(x => (x.id === l.id ? { ...x, kind: 'optional', component: c, term: t } : x))), `${l.label}: optional`)
  }
  const toNecessary = l => run(() => l.source === 'part'
    ? api.setJobPartNeed(l.id, 'required')
    : saveExtras(extras.map(x => (x.id === l.id ? { ...x, kind: 'necessary' } : x))), `${l.label}: necessary`)
  const removeExtra = l => run(() => saveExtras(extras.filter(x => x.id !== l.id)), `${l.label} removed`)

  const addLine = () => {
    const label = add.label.trim()
    if (!label) return setMsg('Enter the service, e.g. Replace crystal')
    const [component, term] = add.finding ? add.finding.split('|') : [null, null]
    if (add.kind === 'optional' && !isBacked(job, component, term)) return setMsg('Choose the finding from the watch analysis that this optional work is for.')
    return run(async () => {
      await saveExtras([...extras, { id: crypto.randomUUID(), label, details: add.details.trim() || null, price: null, kind: add.kind, component, term }])
      setAdd(null)
    }, `${label} added (${add.kind})`)
  }

  const FindingChips = ({ value, onPick }) => found.length ? (
    <div className="chips small">
      <span className="msg">Backed by</span>
      {found.map(c => { const v = `${c.component}|${c.term}`; return (
        <button key={c.id} type="button" className="chip" aria-pressed={value === v} onClick={() => onPick(v)}>{findingLabel(c.component, c.term)}</button>
      ) })}
    </div>
  ) : <p className="msg warn">Nothing confirmed in the watch analysis yet. Confirm or add the finding first; optional work must be backed by it.</p>

  const Line = ({ l, opt }) => {
    const movable = edit && (l.source === 'part' || l.source === 'extra')
    const backed = isBacked(job, l.component, l.term)
    return (
      <div className="prompt">
        <div className="grow">
          <b>{l.label}</b>
          {(l.subs || []).concat(l.parts || []).map(s => <span key={s} className="msg"> · {s}</span>)}
          {l.component && l.term && <div className={`msg${opt && !backed && !l.decision ? ' warn' : ''}`}>
            {opt ? (backed || l.decision ? 'Backed by ' : 'Not backed: no confirmed ') : 'Finding: '}{findingLabel(l.component, l.term)}</div>}
          {opt && !l.component && !l.decision && <div className="msg warn">Not backed by the watch analysis</div>}
          {moving === l.key && <FindingChips value={null} onPick={v => toOptional(l, v)} />}
        </div>
        <span className="msg r">{l.price != null ? money(l.price) : 'price: office'}</span>
        {l.decision && <span className="msg">{l.decision}</span>}
        {movable && (opt
          ? <button type="button" className="btn" onClick={() => toNecessary(l)}>Make necessary</button>
          : <button type="button" className="btn" onClick={() => (moving === l.key ? setMoving(null) : toOptional(l))}>{moving === l.key ? 'Back' : 'Make optional'}</button>)}
        {edit && l.source === 'extra' && <button type="button" className="btn" onClick={() => removeExtra(l)}>Remove</button>}
      </div>
    )
  }

  return (
    <section className="panel">
      <div className="actions">
        <h3 className="grow">Necessary and optional work</h3>
        {edit && !add && <button type="button" className="btn solid" onClick={() => setAdd({ label: '', details: '', kind: 'necessary', finding: '' })}>+ Service</button>}
      </div>
      <p className="msg">Necessary: needed for the watch to work and for the service guarantee. Optional: proposed to the client, and must come from a finding in the watch analysis. Parts: + Add → Billable in Parts below.{locked ? ' The client has decided; changes go on a new estimate.' : ''}</p>
      {msg && <p className="msg warn">{msg}</p>}

      <h4>Necessary</h4>
      {necessary.length ? necessary.map(l => <Line key={l.key} l={l} />) : <p className="msg">Nothing yet.</p>}
      <h4>Optional</h4>
      {optional.length ? optional.map(l => <Line key={l.key} l={l} opt />) : <p className="msg">Nothing proposed.</p>}

      {add && (
        <div className="subpanel">
          <div className="actions">
            <input list="svc-list" autoFocus value={add.label} onChange={e => setAdd({ ...add, label: e.target.value })} placeholder="Service, e.g. Replace crystal" style={{ flex: 2, minWidth: 200 }} />
            <datalist id="svc-list">{SERVICES.map(s => <option key={s} value={s} />)}</datalist>
            <input value={add.details} onChange={e => setAdd({ ...add, details: e.target.value })} placeholder="Details (optional)" style={{ flex: 2, minWidth: 160 }} />
          </div>
          <div className="chips small">
            <button type="button" className="chip" aria-pressed={add.kind === 'necessary'} onClick={() => setAdd({ ...add, kind: 'necessary' })}>Necessary</button>
            <button type="button" className="chip" aria-pressed={add.kind === 'optional'} onClick={() => setAdd({ ...add, kind: 'optional' })}>Optional</button>
          </div>
          {add.kind === 'optional' && <FindingChips value={add.finding} onPick={v => setAdd({ ...add, finding: v })} />}
          <div className="actions">
            <button type="button" className="btn solid" disabled={add.kind === 'optional' && !add.finding} onClick={addLine}>Add</button>
            <button type="button" className="btn" onClick={() => setAdd(null)}>Cancel</button>
            <span className="msg">The office sets the price (Rolex Service Handbook).</span>
          </div>
        </div>
      )}
    </section>
  )
}
