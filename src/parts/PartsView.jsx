import { useMemo, useState } from 'react'
import {
  CATS, CAT_ORDER, isCounted, isLow, locStr, minIsSet, minOf, modelsMatching, fitsModel, sortParts, num,
} from '../rules.js'
import PartMore from './PartMore.jsx'
import PartForm from './PartForm.jsx'

const loadShut = () => { try { return new Set(JSON.parse(localStorage.getItem('jva-parts-shut') || '[]')) } catch { return new Set() } }
const saveShut = s => { try { localStorage.setItem('jva-parts-shut', JSON.stringify([...s])) } catch { /* ignore */ } }
const tally = list => `${list.filter(isCounted).length} / ${list.length}`

export default function PartsView({ parts, models, can, actions, who, modelFilter, setModelFilter }) {
  const [q, setQ] = useState('')
  const [cal, setCal] = useState('')
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [onlyFlag, setOnlyFlag] = useState(false)
  const [sec, setSec] = useState({ cat: 'All', sub: null })
  const [open, setOpen] = useState(null)
  const [shut, setShut] = useState(loadShut)
  const [adding, setAdding] = useState(false)

  const modelList = useMemo(
    () => [...models.values()].sort((a, b) => String(a.ref).localeCompare(String(b.ref), undefined, { numeric: true })),
    [models]
  )
  const cals = useMemo(() => {
    const c = {}
    for (const p of parts) if (p.cal) c[p.cal] = (c[p.cal] || 0) + 1
    return Object.keys(c).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(k => [k, c[k]])
  }, [parts])

  const inSection = p => (sec.cat === 'All' || p.cat === sec.cat) && (!sec.sub || p.sub === sec.sub)
  const qModels = useMemo(() => modelsMatching(modelList, q), [modelList, q])
  const model = modelFilter ? models.get(modelFilter) : null
  const items = useMemo(() => {
    const s = q.trim().toLowerCase()
    return sortParts(parts.filter(p =>
      inSection(p) &&
      (!s || String(p.rmc).toLowerCase().includes(s) || String(p.name).toLowerCase().includes(s) ||
        String(p.edge_desc || '').toLowerCase().includes(s) || locStr(p).toLowerCase().includes(s) ||
        String(p.cal || '').toLowerCase() === s || String(p.fits || '').toLowerCase().includes(s) ||
        qModels.some(m => fitsModel(p, m))) &&
      (!cal || p.cal === cal) && (!model || fitsModel(p, model)) &&
      (!onlyOpen || !isCounted(p)) && (!onlyFlag || p.flag)
    ))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, q, cal, model, onlyOpen, onlyFlag, sec, qModels])

  const toggle = k => setShut(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); saveShut(n); return n })
  const setAll = close => {
    const n = new Set()
    if (close) for (const c of CAT_ORDER) { n.add('c:' + c); for (const s of CATS[c]) n.add('s:' + c + '|' + s) }
    saveShut(n); setShut(n)
  }
  const searching = !!q.trim()
  const isShut = k => !searching && shut.has(k)
  const hints = model ? [model] : qModels

  // Build rows with category / subcategory / calibre bands
  const rows = []
  let c0, s0, k0
  for (const p of items) {
    const ck = 'c:' + p.cat, sk = 's:' + p.cat + '|' + p.sub
    if (p.cat !== c0) {
      rows.push(
        <div key={ck} className="cat-band" role="button" tabIndex={0} aria-expanded={!isShut(ck)} onClick={() => toggle(ck)}>
          <span className="chev">{isShut(ck) ? '▸' : '▾'}</span>{p.cat}
          <span className="tally">{tally(parts.filter(x => x.cat === p.cat))} counted</span>
        </div>
      )
      c0 = p.cat; s0 = null
    }
    if (isShut(ck)) continue
    if (p.sub !== s0) {
      rows.push(
        <div key={sk} className="sub-band" role="button" tabIndex={0} aria-expanded={!isShut(sk)} onClick={() => toggle(sk)}>
          <b><span className="chev">{isShut(sk) ? '▸' : '▾'}</span><i>{p.cat} ›</i> {p.sub}</b>
          <span>{tally(parts.filter(x => x.cat === p.cat && x.sub === p.sub))} counted</span>
        </div>
      )
      s0 = p.sub; k0 = null
    }
    if (isShut(sk)) continue
    if (p.cal && p.cal !== k0) rows.push(<div key={'k:' + sk + p.cal} className="cal-band">Calibre {p.cal}</div>)
    k0 = p.cal
    rows.push(
      <Row key={p.id} p={p} open={open === p.id} onOpen={() => setOpen(open === p.id ? null : p.id)} can={can} actions={actions}>
        {open === p.id && <PartMore p={p} models={models} modelList={modelList} can={can} actions={actions} who={who} />}
      </Row>
    )
  }

  return (
    <div className="layout">
      <nav className="index" aria-label="Categories">
        <IxBtn cls="ix-all" cur={sec.cat === 'All'} onClick={() => setSec({ cat: 'All', sub: null })} label="All parts" n={tally(parts)} />
        {CAT_ORDER.map(c => {
          const inC = parts.filter(p => p.cat === c)
          return (
            <div key={c}>
              <IxBtn cls="ix-cat" cur={sec.cat === c && !sec.sub} onClick={() => setSec({ cat: c, sub: null })} label={c} n={tally(inC)} />
              {CATS[c].map(s => {
                const inS = inC.filter(p => p.sub === s)
                const done = inS.length > 0 && inS.every(isCounted)
                return <IxBtn key={s} cls={'ix-sub' + (done ? ' done' : '')} cur={sec.cat === c && sec.sub === s}
                  onClick={() => setSec({ cat: c, sub: s })} label={s} n={tally(inS)} />
              })}
            </div>
          )
        })}
      </nav>

      <div className="main">
        <div className="filters">
          <select className="ix-select" aria-label="Category" value={`${sec.cat}|${sec.sub || ''}`}
            onChange={e => { const [c, s] = e.target.value.split('|'); setSec({ cat: c, sub: s || null }) }}>
            <option value="All|">All parts ({tally(parts)})</option>
            {CAT_ORDER.map(c => [
              <option key={c} value={`${c}|`}>{c}</option>,
              ...CATS[c].map(s => <option key={c + s} value={`${c}|${s}`}>&nbsp;&nbsp;{c} › {s}</option>),
            ])}
          </select>
          <input type="search" className="q" placeholder="Search part #, name, calibre or model" aria-label="Search parts"
            value={q} onChange={e => setQ(e.target.value)} />
          <select aria-label="Calibre" value={cal} onChange={e => setCal(e.target.value)}>
            <option value="">All calibres</option>
            {cals.map(([k, n]) => <option key={k} value={k}>{k} ({n})</option>)}
          </select>
          <select aria-label="Model" value={modelFilter} onChange={e => setModelFilter(e.target.value)} className="modelF">
            <option value="">All models</option>
            {modelList.map(m => <option key={m.id} value={m.id}>{m.ref}{m.name ? ' · ' + m.name : ''}</option>)}
          </select>
          <label className="tog"><input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} /> Not counted</label>
          <label className="tog"><input type="checkbox" checked={onlyFlag} onChange={e => setOnlyFlag(e.target.checked)} /> To check</label>
          <span className="grow" />
          {can.edit && <button className="btn" onClick={actions.goInbox}>Import delivery</button>}
          {can.edit && <button className="btn" onClick={() => setAdding(a => !a)}>Add part</button>}
          <button className="btn" onClick={() => setAll(true)}>Collapse all</button>
          <button className="btn" onClick={() => setAll(false)}>Expand all</button>
        </div>

        {adding && (
          <div className="panel">
            <h2>Add part</h2>
            <PartForm isNew defaults={{ cat: sec.cat !== 'All' ? sec.cat : 'Movement', sub: sec.sub || '' }}
              onCancel={() => setAdding(false)} onSave={async row => { if (await actions.add(row)) setAdding(false) }} />
          </div>
        )}

        <div className="table">
          <div className="thead">
            <span>Rolex part #</span><span>Description</span><span>Calibre</span><span>Count</span>
            <span title="Minimum stock; italic = suggested">Min</span><span /><span>+ / −</span>
          </div>
          {hints.length > 0 && (
            <div className="mhint">
              {hints.slice(0, 4).map(m => (
                <div key={m.id}><b>{m.ref}</b> {m.name} · calibre {m.cal || 'not set'}{m.ok ? '' : <i> · unconfirmed</i>}</div>
              ))}
              <span className="msg">Showing parts tagged to the model plus parts for its calibre.</span>
            </div>
          )}
          {items.length ? rows : <div className="empty">No parts match. Clear the search or filters.</div>}
        </div>
      </div>
    </div>
  )
}

function IxBtn({ cls, cur, onClick, label, n }) {
  return <button type="button" className={cls} aria-current={cur} onClick={onClick}>{label}<span>{n}</span></button>
}

function Row({ p, open, onOpen, can, actions, children }) {
  const done = isCounted(p)
  const min = minOf(p)
  const commit = e => {
    const v = e.target.value.trim()
    if (v === '') { e.target.value = p.qty ?? ''; return }
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) { e.target.value = p.qty ?? ''; return }
    actions.count(p, n)
  }
  return (
    <div className={'row' + (done ? ' done' : '') + (open ? ' open' : '')}>
      <span className="ref" title={p.rmc}>{p.rmc}</span>
      <span className="desc" title={p.name}>
        {p.name}
        {isLow(p) && <span className="lowdot" title={`At or below minimum of ${min}`}>Order</span>}
        {p.flag && <span className="flagdot" title={p.flag}>Check</span>}
        {Number(p.over) > 0 && <span className="osdot" title={`Count includes ${num(p.over)} overstock`}>+{num(p.over)} OS</span>}
        {locStr(p) && <span className="loc">{locStr(p)}</span>}
      </span>
      <span className="cal">{p.cal || (p.sub === 'Interchangeable' ? 'Int.' : '')}</span>
      <span className="count">
        <input key={String(p.qty)} type="number" inputMode="numeric" min="0" step="1" defaultValue={done ? p.qty : ''}
          placeholder="–" aria-label={`Count for ${p.rmc}`} disabled={!can.count}
          onBlur={commit} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
      </span>
      <span className={'minc' + (minIsSet(p) ? '' : ' sug')}
        title={min ? (minIsSet(p) ? 'Minimum stock' : 'Suggested minimum (from 2025–26 use)') : 'No minimum'}>
        {min ? num(min) : '–'}
      </span>
      <button type="button" className="info" aria-expanded={open} aria-label={`More info for ${p.rmc}`} onClick={onOpen}>i</button>
      <span className="pm">
        <button type="button" className="sq" aria-label="Add one" disabled={!can.count}
          onClick={() => actions.count(p, (p.qty ?? 0) + 1)}>+</button>
        <span className="slash" aria-hidden="true">/</span>
        <button type="button" className="sq" aria-label="Remove one" disabled={!can.count || !p.qty}
          onClick={() => actions.count(p, p.qty - 1)}>−</button>
      </span>
      {children}
    </div>
  )
}
