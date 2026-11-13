import { useEffect, useState } from 'react'
import { api } from './data.js'

// Admin settings: CTR prices by tier, polishing prices by watch family/size, bench capacity for the ETA.
export default function SettingsView({ actions }) {
  const [s, setS] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { api.loadSettings().then(setS).catch(e => setErr(e.message)) }, [])
  if (err) return <div className="panel"><p className="msg warn">{err}</p></div>
  if (!s) return <div className="panel"><p className="msg">Loading…</p></div>

  const save = async (key, value, label) => {
    try { await api.saveSetting(key, value); setS(x => ({ ...x, [key]: value })); actions.say(`${label} saved`) } catch (e) { setErr(e.message) }
  }
  const bench = s.bench || {}
  return (
    <>
      <PriceTable value={s.ctr_prices} title="Complete service (Rolex offers)" hint="Rolex's official offers, named exactly as on the Immediate Proceed form (CO - MODERN / CO - CLASSIC). Shown at intake for the watch's class. CAD, before tax."
        onSave={v => save('ctr_prices', v, 'CTR prices')} />
      <PriceTable value={s.polish_prices} title="Polishing prices" hint="Offered at intake by watch family / size."
        onSave={v => save('polish_prices', v, 'Polishing prices')} />
      <div className="panel">
        <h2>Bench capacity (for the ETA)</h2>
        <p className="msg">ETA = today + (watches ahead in the queue ÷ watches finished per week) + parts wait. Watchmakers can override the ETA on a job.</p>
        <form className="actions" onSubmit={e => { e.preventDefault(); const f = new FormData(e.target); save('bench', { watches_per_week: Number(f.get('wpw')) || 6, parts_wait_days: Number(f.get('wait')) || 0 }, 'Bench capacity') }}>
          <label className="tog">Watches finished per week <input name="wpw" type="number" min="0.5" step="0.5" defaultValue={bench.watches_per_week ?? 6} style={{ width: 80 }} /></label>
          <label className="tog">Extra days for parts <input name="wait" type="number" min="0" step="1" defaultValue={bench.parts_wait_days ?? 0} style={{ width: 80 }} /></label>
          <button className="btn solid">Save</button>
        </form>
      </div>
      <div className="panel">
        <h2>Immediate Proceed</h2>
        <p className="msg">Rolex's form allows extra necessary work up to 15% of the set service price without a new estimate. Some past forms showed the total with that 15% added.</p>
        <label className="tog"><input type="checkbox" checked={!!s.immediate_proceed?.include_allowance} onChange={e => save('immediate_proceed', { include_allowance: e.target.checked }, 'Immediate Proceed')} /> Show the total with the 15% allowance included</label>
      </div>
      <div className="panel">
        <h2>Vintage Analysis Fee</h2>
        <p className="msg">Signed at intake for Vintage watches (instead of the receipt). Printed on the J. Vair Vintage Analysis Fee form with GST 5%.</p>
        <form className="actions" onSubmit={e => { e.preventDefault(); const f = new FormData(e.target); save('vintage', { fee: Number(f.get('fee')) || 350, weeks: Number(f.get('weeks')) || 18 }, 'Vintage fee') }}>
          <label className="tog">Fee (CAD, before tax) <input name="fee" type="number" min="0" step="1" defaultValue={s.vintage?.fee ?? 350} style={{ width: 90 }} /></label>
          <label className="tog">Delivery on approval (weeks) <input name="weeks" type="number" min="1" step="1" defaultValue={s.vintage?.weeks ?? 18} style={{ width: 70 }} /></label>
          <button className="btn solid">Save</button>
        </form>
      </div>
    </>
  )
}

function PriceTable({ value, title, hint, onSave }) {
  const [rows, setRows] = useState(Object.entries(value || {}))
  const set = (i, f, v) => setRows(rows.map((r, j) => (j === i ? (f === 0 ? [v, r[1]] : [r[0], v === '' ? null : Number(v)]) : r)))
  return (
    <div className="panel">
      <h2>{title}</h2>
      <p className="msg">{hint}</p>
      {rows.map(([name, price], i) => (
        <div key={i} className="actions">
          <input value={name} onChange={e => set(i, 0, e.target.value)} style={{ flex: 1, minWidth: 200 }} aria-label="Name" />
          <span className="msg">$</span>
          <input type="number" min="0" step="1" value={price ?? ''} onChange={e => set(i, 1, e.target.value)} style={{ width: 110 }} aria-label="Price" placeholder="Price" />
          <button type="button" className="btn" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <div className="actions">
        <button type="button" className="btn" onClick={() => setRows([...rows, ['', null]])}>Add a line</button>
        <span className="grow" />
        <button type="button" className="btn solid" onClick={() => onSave(Object.fromEntries(rows.filter(r => r[0].trim()).map(r => [r[0].trim(), r[1]])))}>Save</button>
      </div>
    </div>
  )
}
