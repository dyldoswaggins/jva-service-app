import { useState } from 'react'
import {
  PACKS, addFit, bigPack, fitsOf, fmtDate, fmtTime, isCounted, isLow, locStr, minIsSet, minOf, modelId, money, num,
  orderClassText, packOf, suggestedMin, USAGE_MONTHS,
} from '../rules.js'
import PartForm from './PartForm.jsx'

export default function PartMore({ p, models, modelList, can, actions, who }) {
  const [editing, setEditing] = useState(false)
  if (editing)
    return (
      <div className="more">
        <PartForm defaults={p} onCancel={() => setEditing(false)}
          onSave={async f => { await actions.update(p, f, 'details saved'); setEditing(false) }}
          onArchive={async () => { await actions.update(p, { archived: true }, 'archived'); setEditing(false) }} />
      </div>
    )

  const done = isCounted(p)
  const F = ({ k, children }) => <div><dt>{k}</dt><dd>{children}</dd></div>
  return (
    <div className="more">
      <dl className="facts">
        <F k="Category">{p.cat} › {p.sub}</F>
        <F k="Calibre">{p.cal || '—'}</F>
        <F k="Fits models">
          {fitsOf(p).length
            ? fitsOf(p).map(r => {
                const m = models.get(modelId(r))
                return (
                  <span key={r} className="chip">
                    {r}{m?.name ? ' ' + m.name : ''}
                    {can.edit && (
                      <button type="button" className="x" aria-label={`Remove ${r}`}
                        onClick={() => actions.update(p, { fits: fitsOf(p).filter(f => f !== r).join(', ') }, `${r} removed`)}>×</button>
                    )}
                  </span>
                )
              })
            : 'None yet'}
        </F>
        <F k="Order class">{p.abc || '—'}{p.abc ? ` (${orderClassText(p.abc)})` : ''}</F>
        {can.costs && <F k="Unit cost">
          {p.price != null ? money(p.price) : 'No price'}
          {packOf(p) > 1 ? ` · pack of ${packOf(p)}${p.pack_price != null ? ' ' + money(p.pack_price) : ''}` : ''}
        </F>}
        {!can.costs && packOf(p) > 1 && <F k="Pack">{packOf(p)} per pack</F>}
        {can.costs && p.price_src && <F k="Cost from">{p.price_src}</F>}
        <F k="Retail">{p.retail != null ? `${money(p.retail)} per unit${p.retail_src ? ' · ' + p.retail_src : ''}` : 'No retail price'}</F>
        {Number(p.over) > 0 && <F k="Overstock">{num(p.over)} of the count is overstock</F>}
        {can.costs && <F k="Stock value">{done && p.price ? money(p.qty * p.price) : '—'}</F>}
        <F k="Used since Jan 2025">{p.used ? `${num(p.used)}× on ${num(p.jobs)} jobs` : 'Not used'}</F>
        <F k="Last used">{fmtDate(p.last_used) || '—'}</F>
        <F k="Counted">{done ? `${num(p.qty)} by ${who(p.c_by, p.c_by_legacy)}, ${fmtTime(p.c_at)}` : 'Not counted'}</F>
        {p.edge_desc && <F k="EDGE description">{p.edge_desc}</F>}
        {p.edge_refs && <F k="Ordered as">{p.edge_refs}</F>}
        {can.costs && p.price_2022 != null && <F k="2022 list price">{money(p.price_2022)}</F>}
        <F k="Lista location">{locStr(p) || 'Not set'}</F>
        <F k="Min stock">
          {minOf(p) ? `${num(minOf(p))}${minIsSet(p) ? '' : ' (suggested)'}${isLow(p) ? ' · below' : ''}` : '—'}
        </F>
        {p.note && <F k="Note">{p.note}</F>}
      </dl>
      {p.flag && <div className="flagline">To check: {p.flag}</div>}
      {can.edit && <StockSettings p={p} actions={actions} />}
      <div className="actions">
        {can.count && <Blister p={p} actions={actions} />}
        <span className="grow" />
        {can.edit && <TagModel p={p} modelList={modelList} actions={actions} />}
        {can.edit && p.flag && <button type="button" className="btn" onClick={() => actions.update(p, { flag: '' }, 'marked checked')}>Mark checked</button>}
        {can.edit && <button type="button" className="btn" onClick={() => setEditing(true)}>Edit part</button>}
      </div>
    </div>
  )
}

function StockSettings({ p, actions }) {
  const [v, setV] = useState({ lcab: p.lcab || '', ldrw: p.ldrw || '', ltab: p.ltab || '', min: minIsSet(p) ? String(p.min) : '', over: Number(p.over) > 0 ? String(p.over) : '' })
  const sm = suggestedMin(p)
  const set = k => e => setV({ ...v, [k]: e.target.value })
  const save = () => {
    const n = s => (s.trim() === '' ? null : Math.max(0, Math.round(Number(s))))
    actions.update(p, { lcab: v.lcab.trim() || null, ldrw: v.ldrw.trim() || null, ltab: v.ltab.trim() || null, min: n(v.min), over: n(v.over) || null }, 'stock settings saved')
  }
  return (
    <div className="actions stock">
      <span className="msg">Lista cabinet</span><input className="sm" value={v.lcab} onChange={set('lcab')} placeholder="Cabinet" aria-label="Cabinet" />
      <span className="msg">drawer</span><input className="sm" value={v.ldrw} onChange={set('ldrw')} placeholder="Drawer" aria-label="Drawer" />
      <span className="msg">tab</span><input className="sm" value={v.ltab} onChange={set('ltab')} placeholder="Tab #" aria-label="Tab number" />
      <span className="msg">Min stock</span><input className="sm" type="number" min="0" value={v.min} onChange={set('min')} placeholder={String(sm)} aria-label="Minimum stock" />
      <span className="msg">Overstock</span><input className="sm" type="number" min="0" value={v.over} onChange={set('over')} placeholder="0" aria-label="Overstock included in count" />
      <button type="button" className="btn" onClick={save}>Save</button>
      <span className="msg">
        {sm ? `Suggested ${sm} (${num(p.used)} used in ${USAGE_MONTHS} months, about 2 months' cover)` : 'No use since Jan 2025, so no suggested minimum'}
        {bigPack(p) ? ` · min rounds up to whole packs of ${bigPack(p)}` : ''}. Overstock is part of the count, not extra.
      </span>
    </div>
  )
}

function Blister({ p, actions }) {
  const [size, setSize] = useState(packOf(p))
  const [n, setN] = useState(1)
  const units = size * (Number(n) || 0)
  return (
    <>
      <span className="msg">Blister packs:</span>
      <select value={size} onChange={e => setSize(Number(e.target.value))} aria-label="Blister size">
        {[...new Set([...PACKS, packOf(p)])].sort((a, b) => a - b).map(k => <option key={k} value={k}>{k} per pack</option>)}
      </select>
      <span className="msg">×</span>
      <input type="number" min="1" step="1" value={n} onChange={e => setN(e.target.value)} style={{ width: 56 }} aria-label="Number of packs" />
      <button type="button" className="btn" disabled={!units} onClick={() => actions.count(p, (p.qty ?? 0) + units, `Count (+${n} × ${size})`)}>Add to count</button>
      <button type="button" className="btn" disabled={!units} onClick={() => actions.count(p, units, `Count (${n} × ${size})`)}>Set count</button>
    </>
  )
}

function TagModel({ p, modelList, actions }) {
  const [ref, setRef] = useState('')
  const listId = 'models-' + p.id
  const tag = () => {
    const fits = addFit(p, ref)
    if (fits) actions.update(p, { fits }, `${ref.trim().toUpperCase()} tagged`)
    setRef('')
  }
  return (
    <>
      <input type="text" value={ref} onChange={e => setRef(e.target.value)} placeholder="Model ref, e.g. 126610LN"
        style={{ width: 170 }} aria-label="Tag a model" list={listId} onKeyDown={e => e.key === 'Enter' && tag()} />
      <datalist id={listId}>{modelList.map(m => <option key={m.id} value={m.ref}>{m.name}</option>)}</datalist>
      <button type="button" className="btn" onClick={tag} disabled={!ref.trim()}>Tag model</button>
    </>
  )
}
