import { useMemo, useState } from 'react'
import { fitsModel, modelId } from '../rules.js'

export default function ModelsView({ models, parts, can, actions }) {
  const [q, setQ] = useState('')
  const [nw, setNw] = useState({ ref: '', name: '', cal: '' })
  const [msg, setMsg] = useState('')
  const list = useMemo(
    () => [...models.values()].sort((a, b) => String(a.ref).localeCompare(String(b.ref), undefined, { numeric: true })),
    [models]
  )
  const s = q.trim().toLowerCase()
  const shown = list.filter(m => !s || String(m.ref).toLowerCase().includes(s) || String(m.name).toLowerCase().includes(s) || String(m.cal).toLowerCase().includes(s))

  const add = async () => {
    const ref = nw.ref.trim().toUpperCase()
    if (!ref) return setMsg('Enter a reference.')
    const id = modelId(ref)
    if (models.has(id)) return setMsg(`${ref} is already listed.`)
    if (await actions.saveModel(id, { ref, name: nw.name.trim(), cal: nw.cal.trim(), ok: true, src: 'Added by staff' }, true)) {
      setNw({ ref: '', name: '', cal: '' }); setMsg(`${ref} added.`)
    }
  }
  const save = (m, f) => actions.saveModel(m.id, f)

  return (
    <div className="panel">
      <div className="actions">
        <h2 className="grow">Models ({list.length})</h2>
        <input type="search" placeholder="Find reference, name or calibre" value={q} onChange={e => setQ(e.target.value)} aria-label="Find model" />
      </div>
      {can.models && (
        <div className="actions">
          <input value={nw.ref} onChange={e => setNw({ ...nw, ref: e.target.value })} placeholder="Reference, e.g. 126610LN" aria-label="New model reference" style={{ width: 170 }} />
          <input value={nw.name} onChange={e => setNw({ ...nw, name: e.target.value })} placeholder="Name" aria-label="New model name" style={{ width: 170 }} />
          <input value={nw.cal} onChange={e => setNw({ ...nw, cal: e.target.value })} placeholder="Calibre" aria-label="New model calibre" style={{ width: 90 }} />
          <button type="button" className="btn solid" onClick={add}>Add model</button>
          <span className="msg">{msg}</span>
        </div>
      )}
      <p className="msg">A model shows its own tagged parts plus every part for its calibre. Changes save when you leave a box.</p>
      <div className="imp-wrap">
        <table className="imp">
          <thead><tr><th>Reference</th><th>Name</th><th>Calibre(s)</th><th className="r">Parts</th><th>Status</th><th>Source</th></tr></thead>
          <tbody>
            {shown.map(m => (
              <tr key={m.id}>
                <td className="mono b">{m.ref}</td>
                <td><Cell value={m.name} disabled={!can.models} placeholder="e.g. Submariner Date" onSave={v => save(m, { name: v })} label="Model name" /></td>
                <td><Cell value={m.cal} disabled={!can.models} placeholder="e.g. 3135" onSave={v => save(m, { cal: v })} label="Calibre" width={110} /></td>
                <td className="r"><button type="button" className="link" onClick={() => actions.showModel(m.id)}>{parts.filter(p => fitsModel(p, m)).length} parts</button></td>
                <td><label className="tog"><input type="checkbox" checked={!!m.ok} disabled={!can.models} onChange={e => save(m, { ok: e.target.checked })} /> Confirmed</label></td>
                <td className="msg d" title={m.src || ''}>{m.src || ''}{m.years ? ` · ${m.years}` : ''}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={6} className="msg">No models match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Cell({ value, onSave, disabled, placeholder, label, width }) {
  return (
    <input key={value} type="text" defaultValue={value || ''} disabled={disabled} placeholder={placeholder} aria-label={label}
      style={width ? { width } : undefined}
      onBlur={e => { const v = e.target.value.trim(); if (v !== (value || '')) onSave(v) }}
      onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
  )
}
