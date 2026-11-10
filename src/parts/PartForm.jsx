import { useState } from 'react'
import { CATS, CAT_ORDER, partId } from '../rules.js'

// Add or edit a part's details (Admin). Stock counts are never changed here.
export default function PartForm({ isNew, defaults = {}, onSave, onCancel, onArchive }) {
  const [f, setF] = useState({
    rmc: '', name: defaults.name || '', cat: defaults.cat || 'Movement', sub: defaults.sub || '',
    cal: defaults.cal || '', fits: defaults.fits || '', abc: defaults.abc || 'B',
    price: defaults.price ?? '', retail: defaults.retail ?? '', note: defaults.note || '',
  })
  const [msg, setMsg] = useState('')
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const subs = CATS[f.cat] || []

  const save = () => {
    const n = s => (String(s).trim() === '' ? null : Number(s))
    const row = {
      name: f.name.trim(), cat: f.cat, sub: subs.includes(f.sub) ? f.sub : subs[0], cal: f.cal.trim(),
      fits: f.fits.trim().toUpperCase() || null, abc: f.abc, price: n(f.price), retail: n(f.retail), note: f.note.trim(),
    }
    if (isNew) {
      const rmc = f.rmc.trim().toUpperCase()
      if (!rmc) return setMsg('Enter the Rolex part number.')
      Object.assign(row, { id: partId(rmc), rmc, src: 'Added by staff' })
    }
    if (!row.name) return setMsg('Enter a description.')
    onSave(row)
  }

  return (
    <>
      <div className="grid">
        {isNew && <label>Rolex part # (RMC)<input value={f.rmc} onChange={set('rmc')} placeholder="e.g. 3135-5100" /></label>}
        <label>Description<input value={f.name} onChange={set('name')} /></label>
        <label>Category
          <select value={f.cat} onChange={e => setF({ ...f, cat: e.target.value, sub: CATS[e.target.value][0] })}>
            {CAT_ORDER.map(c => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>Subcategory
          <select value={subs.includes(f.sub) ? f.sub : subs[0]} onChange={set('sub')}>
            {subs.map(s => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>Calibre<input value={f.cal} onChange={set('cal')} placeholder="Blank if interchangeable" /></label>
        <label>Fits models<input value={f.fits} onChange={set('fits')} placeholder="e.g. 126610LN, 116610" /></label>
        <label>Order class<select value={f.abc} onChange={set('abc')}>{['A', 'B', 'C'].map(c => <option key={c}>{c}</option>)}</select></label>
        <label>Unit cost ($)<input type="number" step="0.01" min="0" value={f.price} onChange={set('price')} /></label>
        <label>Retail ($ per unit)<input type="number" step="0.01" min="0" value={f.retail} onChange={set('retail')} /></label>
        <label>Note<input value={f.note} onChange={set('note')} placeholder="Condition, supplier…" /></label>
      </div>
      <div className="actions">
        <button type="button" className="btn solid" onClick={save}>{isNew ? 'Add part' : 'Save changes'}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        {onArchive && <button type="button" className="btn" onClick={onArchive}>Archive part</button>}
        <span className="msg warn">{msg}</span>
      </div>
    </>
  )
}
