import { useEffect, useMemo, useState } from 'react'
import { api } from '../data.js'
import { money, openPrompts, weeksUntil } from '../rules.js'
import { autoNotes, decidedLines, documentLines, sumLines, unpriced } from '../docs/lines.js'
import { buildConfirmation, buildEstimate, buildInvoice, docFileName } from '../docs/serviceDocs.js'

const one = x => (Array.isArray(x) ? x[0] : x) || null

// Admin: Estimate → client's decision → Confirmation → Invoice (Rolex SAV documents), filed on the job.
export default function JobDocuments({ job, allParts, userId, actions, onChange, printPdf }) {
  const client0 = one(job.job_clients)
  const [client, setClient] = useState({ name: client0?.name || '', address1: client0?.address1 || '', address2: client0?.address2 || '', address3: client0?.address3 || '' })
  const [notes, setNotes] = useState(job.estimate_notes ?? autoNotes(job, allParts))
  // Until someone edits the notes, keep them in step with the findings
  useEffect(() => { if (job.estimate_notes == null) setNotes(autoNotes(job, allParts)) }, [job, allParts])
  const [nx, setNx] = useState({ label: '', details: '', price: '', kind: 'necessary' })
  const [dec, setDec] = useState(null) // { refused, optional: { key: true/false } }
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  const { necessary, optional } = useMemo(() => documentLines(job, allParts), [job, allParts])
  const missingPrice = unpriced([...necessary, ...optional])
  const prompts = openPrompts(job)
  const weeks = weeksUntil(job.eta_override || job.eta_quoted)
  const run = async (label, fn) => { setBusy(label); setMsg(''); try { await fn() } catch (e) { setMsg(e.message) } finally { setBusy('') } }

  const saveClient = () => run('Saving…', async () => { await api.saveJobClient(job.id, client, !!client0); actions.say('Client details saved'); onChange() })
  const saveNotes = () => notes !== (job.estimate_notes ?? '') && run('', () => api.updateJob(job.id, { estimate_notes: notes }))
  const setPrice = async (l, v) => {
    const n = v === '' ? null : Number(v)
    await run('', async () => {
      if (l.source === 'ctr') await api.updateJob(job.id, { ctr_price: n })
      else if (l.source === 'polish') await api.updateJob(job.id, { polish_price: n })
      else if (l.source === 'part') await api.setJobPartPrice(l.id, n == null ? null : Math.round((n / (l.qty || 1)) * 100) / 100)
      else await api.updateJob(job.id, { extra_lines: (job.extra_lines || []).map(x => (x.id === l.id ? { ...x, price: n } : x)) })
      onChange()
    })
  }
  const addExtra = () => run('', async () => {
    if (!nx.label.trim()) throw new Error('Enter the service, e.g. "Repair case middle part"')
    const line = { id: crypto.randomUUID(), label: nx.label.trim(), details: nx.details.trim() || null, price: nx.price === '' ? null : Number(nx.price), kind: nx.kind }
    await api.updateJob(job.id, { extra_lines: [...(job.extra_lines || []), line] })
    setNx({ label: '', details: '', price: '', kind: nx.kind }); onChange()
  })
  const removeExtra = l => run('', async () => { await api.updateJob(job.id, { extra_lines: (job.extra_lines || []).filter(x => x.id !== l.id) }); onChange() })

  async function makeDoc(kind) {
    if (!client.name.trim()) return setMsg('Enter the client name first (needed on every Rolex document).')
    await run(`Creating ${kind}…`, async () => {
      const args = { job, client, allParts, notes, weeks, date: new Date() }
      const pdf = kind === 'estimate' ? await buildEstimate(args) : kind === 'confirmation' ? await buildConfirmation(args) : await buildInvoice(args)
      await api.uploadJobDoc(job.id, kind, pdf, docFileName(job, kind), userId)
      actions.say(`${kind[0].toUpperCase() + kind.slice(1)} created and filed`)
      printPdf(pdf)
      onChange()
    })
  }

  const startDecision = () => setDec({ refused: false, optional: Object.fromEntries(optional.map(l => [l.key, l.decision === 'accepted'])) })
  const saveDecision = () => run('Saving decision…', async () => {
    const acc = optional.filter(l => !dec.refused && dec.optional[l.key])
    const decl = optional.filter(l => dec.refused || !dec.optional[l.key])
    await api.recordDecision(job.id, {
      refused: dec.refused,
      accepted: [...necessary, ...acc].filter(l => l.source === 'part' && !dec.refused).map(l => l.id),
      declined: [...decl, ...(dec.refused ? necessary : [])].filter(l => l.source === 'part').map(l => l.id),
      extra: (job.extra_lines || []).map(x => ({ ...x, decision: x.kind === 'optional' ? (acc.some(l => l.id === x.id) ? 'accepted' : 'declined') : (dec.refused ? 'declined' : 'accepted') })),
    })
    setDec(null); actions.say(dec.refused ? 'Estimate refused' : 'Decision saved'); onChange()
  })

  const LineRows = ({ lines }) => lines.map(l => (
    <tr key={l.key}>
      <td>{l.label}{(l.subs || []).concat(l.parts || []).map(s => <div key={s} className="msg"><i>– {s}</i></div>)}</td>
      <td className="r">
        <input type="number" min="0" step="0.01" defaultValue={l.price ?? ''} key={`${l.key}:${l.price}`} placeholder="Price" style={{ width: 100 }}
          onBlur={e => String(l.price ?? '') !== e.target.value && setPrice(l, e.target.value)} aria-label={`Price for ${l.label}`} />
      </td>
      <td>{l.decision ? <span className="msg">{l.decision}</span> : ''}</td>
      <td>{l.source === 'extra' && <button type="button" className="btn" onClick={() => removeExtra(l)}>Remove</button>}</td>
    </tr>
  ))
  const docsOf = k => (job.job_docs || []).filter(d => d.kind === k)
  const decided = decidedLines(job, allParts)

  return (
    <section className="panel">
      <h3>Estimate, confirmation and invoice</h3>
      {prompts > 0 && <p className="flagline">The watchmaker still has {prompts} prompt{prompts === 1 ? '' : 's'} to answer (WSR, condition, requests). The estimate should follow the full analysis.</p>}

      <div className="grid">
        <label>Client name<input value={client.name} onChange={e => setClient({ ...client, name: e.target.value })} /></label>
        <label>Address<input value={client.address1} onChange={e => setClient({ ...client, address1: e.target.value })} /></label>
        <label>City, province<input value={client.address2} onChange={e => setClient({ ...client, address2: e.target.value })} /></label>
        <label>Postal code / phone<input value={client.address3} onChange={e => setClient({ ...client, address3: e.target.value })} /></label>
      </div>
      <div className="actions"><button type="button" className="btn" onClick={saveClient}>Save client details</button><span className="msg">Visible to Admin only.</span></div>

      <table className="imp">
        <thead><tr><th>Necessary work</th><th className="r">MSRP CAD (tax excl.)</th><th /><th /></tr></thead>
        <tbody><LineRows lines={necessary} /><tr><td className="b">Total necessary</td><td className="r b">{money(sumLines(necessary))}</td><td /><td /></tr></tbody>
      </table>
      {optional.length > 0 && (
        <table className="imp">
          <thead><tr><th>Optional work</th><th className="r">MSRP CAD (tax excl.)</th><th /><th /></tr></thead>
          <tbody><LineRows lines={optional} /></tbody>
        </table>
      )}
      <div className="actions">
        <input value={nx.label} onChange={e => setNx({ ...nx, label: e.target.value })} placeholder="Add a service, e.g. Repair case middle part" style={{ flex: 2, minWidth: 220 }} />
        <input value={nx.details} onChange={e => setNx({ ...nx, details: e.target.value })} placeholder="Details / part # (optional)" style={{ flex: 2, minWidth: 180 }} />
        <input type="number" min="0" step="0.01" value={nx.price} onChange={e => setNx({ ...nx, price: e.target.value })} placeholder="Price" style={{ width: 100 }} />
        <select value={nx.kind} onChange={e => setNx({ ...nx, kind: e.target.value })}><option value="necessary">Necessary</option><option value="optional">Optional</option></select>
        <button type="button" className="btn" onClick={addExtra}>Add</button>
      </div>
      <p className="msg">Parts come from the job's billable parts (Required → Necessary, Optional → Optional). Prices are MSRP: services from the Rolex Service Handbook, parts from MyRolexWorldService.</p>
      {missingPrice.length > 0 && <p className="msg warn">Price needed for: {missingPrice.map(l => l.label).join(', ')}.</p>}

      <label className="stackfield">Notes on the estimate (one finding per line)
        <textarea rows={5} value={notes} onChange={e => setNotes(e.target.value)} onBlur={saveNotes} />
      </label>
      <div className="actions">
        <button type="button" className="btn" onClick={() => setNotes(autoNotes(job, allParts))}>Rewrite notes from findings</button>
        <span className="msg">Delivery shown: {weeks ? `approximately ${weeks} week${weeks === 1 ? '' : 's'}` : 'to be confirmed'} (from the ETA).</span>
      </div>

      <div className="docsteps">
        <div className="docstep">
          <b>1. Estimate</b>
          <span className="msg">{docsOf('estimate').length ? `Created ${docsOf('estimate').length}×` : 'Within 24 h of intake (Rolex)'}</span>
          <button type="button" className="btn solid" disabled={!!busy || missingPrice.length > 0} onClick={() => makeDoc('estimate')}>Create estimate</button>
        </div>
        <div className="docstep">
          <b>2. Client's decision</b>
          <span className="msg">{job.estimate_decision ? `${job.estimate_decision === 'refused' ? 'Refused' : 'Accepted'} · ${decided.accepted.length} lines, ${decided.declined.length} declined` : 'Not recorded'}</span>
          <button type="button" className="btn" disabled={!!busy || !docsOf('estimate').length} onClick={startDecision}>Record decision</button>
        </div>
        <div className="docstep">
          <b>3. Confirmation</b>
          <span className="msg">{docsOf('confirmation').length ? `Created ${docsOf('confirmation').length}×` : 'After the decision'}</span>
          <button type="button" className="btn solid" disabled={!!busy || !job.estimate_decision} onClick={() => makeDoc('confirmation')}>Create confirmation</button>
        </div>
        <div className="docstep">
          <b>4. Invoice</b>
          <span className="msg">{docsOf('invoice').length ? `Created ${docsOf('invoice').length}×` : 'When the watch is ready'}</span>
          <button type="button" className="btn solid" disabled={!!busy || job.estimate_decision !== 'accepted'} onClick={() => makeDoc('invoice')}>Create invoice</button>
        </div>
      </div>

      {dec && (
        <div className="subpanel">
          <b>Client's decision (from the signed estimate)</b>
          <label className="tog big"><input type="radio" checked={!dec.refused} onChange={() => setDec({ ...dec, refused: false })} /> I accept the necessary work ({money(sumLines(necessary))})</label>
          {!dec.refused && optional.map(l => (
            <label key={l.key} className="tog" style={{ marginLeft: 28 }}><input type="checkbox" checked={!!dec.optional[l.key]} onChange={e => setDec({ ...dec, optional: { ...dec.optional, [l.key]: e.target.checked } })} /> {l.label} ({l.price != null ? money(l.price) : '—'})</label>
          ))}
          <label className="tog big"><input type="radio" checked={dec.refused} onChange={() => setDec({ ...dec, refused: true })} /> I refuse the estimate</label>
          <p className="msg">Declined parts are taken off the job and back into stock.</p>
          <div className="actions"><button type="button" className="btn solid" onClick={saveDecision}>Save decision</button><button type="button" className="btn" onClick={() => setDec(null)}>Cancel</button></div>
        </div>
      )}
      {busy && <p className="msg">{busy}</p>}
      {msg && <p className="msg warn">{msg}</p>}
    </section>
  )
}
