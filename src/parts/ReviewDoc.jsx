import { useEffect, useMemo, useState } from 'react'
import { api } from '../data.js'
import { toImportLines } from '../invoice.js'
import { CATS, CAT_ORDER, STOCK_BASELINE_DATE, fmtDate, guessAbc, guessCat, invoiceCanAddStock, isCounted, money, num } from '../rules.js'

const tidy = s => String(s || '').replace(/\s+1$/, '').replace(/\s+/g, ' ').trim()
export const docLabel = t => (t === 'packing_list' ? 'Packing list' : 'Invoice')

// Check one delivery document (invoice or packing list) line by line, then Apply in one step.
// Whichever document arrives first adds the stock; the matching later one (same MRWS # + part) doesn't.
export default function ReviewDoc({ item, parsed, fileName, allParts, actions, onClose, onApplied }) {
  const [docType, setDocType] = useState(item?.doc_type || parsed.docType || 'invoice')
  const [docNo, setDocNo] = useState(parsed.invoiceNo || item?.doc_no || '')
  const [date, setDate] = useState(parsed.date || item?.doc_date || '')
  const [lines, setLines] = useState(() =>
    toImportLines(parsed, allParts).map(l => {
      if (l.match || l.skipped) return l
      const [cat, sub, cal] = guessCat(l.rmc, l.desc)
      return { ...l, newPart: { name: tidy(l.desc) || l.rmc, cat, sub, cal, abc: guessAbc(l.desc) } }
    }).map(l => ({ ...l, include: l.include || (!l.skipped && l.qty > 0 && (item?.doc_type === 'packing_list' || parsed.docType === 'packing_list')) }))
  )
  const [matches, setMatches] = useState({ lines: [], missing: [] })
  const [dup, setDup] = useState(false)
  const [addStock, setAddStock] = useState(true)
  const [setCost, setSetCost] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const isPL = docType === 'packing_list'
  const old = !!date && !invoiceCanAddStock(date)
  const key = useMemo(() => lines.map(l => `${l.id}|${l.custRef}|${l.include}`).join(','), [lines])

  // Packing lists carry no prices: include real part lines by default
  useEffect(() => { if (isPL) setLines(ls => ls.map(l => ({ ...l, include: !l.skipped && l.qty > 0 }))) }, [isPL])

  useEffect(() => {
    let live = true
    const inc = lines.filter(l => l.include)
    api.receiptMatches(docType, inc.map(l => ({ part_id: l.id, mrws_ref: l.custRef || '', units: l.units })))
      .then(m => {
        if (!live) return
        const byLine = {}
        inc.forEach((l, k) => { byLine[lines.indexOf(l)] = m.lines[k] })
        setMatches({ lines: byLine, missing: m.missing || [] })
      })
      .catch(() => live && setMatches({ lines: {}, missing: [] }))
    api.loadInvoices().then(inv => live && setDup(inv.some(x => (x.doc_type || 'invoice') === docType && x.invoice_no === docNo && !x.undone))).catch(() => {})
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docType, docNo, key])

  const setLine = (i, f) => setLines(x => x.map((l, j) => (j === i ? { ...l, ...f } : l)))
  const setNew = (i, f) => setLines(x => x.map((l, j) => (j === i ? { ...l, newPart: { ...l.newPart, ...f } } : l)))
  const inc = lines.filter(l => l.include)
  const diffs = Object.entries(matches.lines).filter(([i, m]) => m && m.units !== lines[i]?.units).length

  async function apply() {
    setBusy(true); setMsg('')
    try {
      const id = await api.applyInvoice(
        { doc_type: docType, invoice_no: docNo.trim(), date, file: fileName, add_stock: addStock, set_cost: !isPL && setCost },
        inc.map(l => ({
          ref: l.ref, rmc: l.rmc, part_id: l.id, qty: l.qty, pack: l.pack, units: l.units,
          unit_cost: isPL ? null : l.unitCost, pack_price: isPL ? null : l.packPrice, mrws_ref: l.custRef || null,
          add_stock: addStock, set_cost: !isPL && setCost, ...(l.match ? {} : { new_part: l.newPart }),
        }))
      )
      if (item) await api.updateInbox(item.id, { status: 'applied', applied_doc: id, doc_type: docType, doc_no: docNo.trim(), doc_date: date })
      await actions.reload()
      const added = inc.filter((l, k) => addStock && !old && !(matches.lines[lines.indexOf(l)]?.stocked)).reduce((s, l) => s + l.units, 0)
      actions.say(`${docLabel(docType)} ${docNo}: ${inc.length} lines${added ? `, +${num(added)} units` : isPL ? ', no stock change' : ', costs only'}`, async () => {
        const r = await api.undoInvoice(id)
        if (item) await api.updateInbox(item.id, { status: 'ready', applied_doc: null })
        await actions.reload()
        actions.say(r.handed_over ? `Undone. ${r.handed_over} lines kept their stock on the matching document.` : `${docLabel(docType)} ${docNo} undone`)
      })
      onApplied?.(id)
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="panel">
      <div className="actions">
        <h2 className="grow">Check {fileName}</h2>
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
      <div className="actions">
        <select value={docType} onChange={e => setDocType(e.target.value)} aria-label="Document type">
          <option value="invoice">Invoice</option>
          <option value="packing_list">Packing list</option>
        </select>
        <label className="tog">No. <input value={docNo} onChange={e => setDocNo(e.target.value)} style={{ width: 140 }} aria-label="Document number" /></label>
        <label className="tog">Date <input type="date" value={date || ''} onChange={e => setDate(e.target.value)} aria-label="Document date" /></label>
        <span className="msg">{lines.length} lines · {lines.filter(l => l.match).length} in the list · {lines.filter(l => !l.match && !l.skipped).length} new · {lines.filter(l => l.skipped).length} not parts{item?.read_by === 'claude' ? ' · read from a scan: check each line' : ''}</span>
      </div>
      {dup && <div className="flagline">{docLabel(docType)} {docNo} has already been imported. Undo it in History first to import it again.</div>}
      {old && <div className="flagline">Dated on or before {fmtDate(STOCK_BASELINE_DATE)}: already in the 11.5 stock count, so no stock is added{isPL ? '' : ' (costs only)'}.</div>}
      {diffs > 0 && <div className="flagline">{diffs} line{diffs === 1 ? '' : 's'} differ from the matching {isPL ? 'invoice' : 'packing list'}. Check the box before applying.</div>}
      {matches.missing.length > 0 && (
        <div className="flagline">
          Not on this {isPL ? 'packing list' : 'invoice'} but on {docLabel(matches.missing[0].doc_type).toLowerCase()} {[...new Set(matches.missing.map(m => m.doc_no))].join(', ')}:{' '}
          {matches.missing.map(m => `${m.rmc} ×${m.units} (MRWS ${m.mrws_ref})`).join(', ')}
        </div>
      )}
      <div className="imp-wrap">
        <table className="imp">
          <thead>
            <tr><th /><th>On {isPL ? 'packing list' : 'invoice'}</th><th>Part #</th><th>Description</th><th className="r">Qty</th><th className="r">Pack</th>
              <th className="r">Units</th>{!isPL && <th className="r">Unit cost</th>}<th>MRWS #</th><th>Match</th><th>In the list</th></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const p = allParts.get(l.id)
              const m = matches.lines[i]
              const already = m?.stocked
              return (
                <tr key={i} className={l.include ? '' : 'off'}>
                  <td><input type="checkbox" checked={l.include} disabled={l.skipped} onChange={e => setLine(i, { include: e.target.checked })} aria-label={`Include ${l.ref}`} /></td>
                  <td className="mono">{l.ref}</td>
                  <td className="mono b">{l.skipped ? '' : l.rmc}</td>
                  <td className="d" title={l.desc}>{l.desc}</td>
                  <td className="r">{num(l.qty)}</td>
                  <td className="r">×{l.pack}</td>
                  <td className="r">
                    <input type="number" min="0" step="1" value={l.units} style={{ width: 64 }} disabled={l.skipped}
                      onChange={e => setLine(i, { units: Math.max(0, Math.round(Number(e.target.value) || 0)) })} aria-label={`Units for ${l.ref}`} />
                  </td>
                  {!isPL && <td className="r">{l.unitCost != null ? money(l.unitCost) : 'No charge'}</td>}
                  <td>{l.custRef}</td>
                  <td>
                    {!l.include || l.skipped ? '' : m
                      ? <>{docLabel(m.doc_type)} {m.doc_no}{m.units !== l.units ? <b className="tag warn"> {num(m.units)} there</b> : ' ✓'}</>
                      : <span className="msg">First</span>}
                  </td>
                  <td>
                    {l.skipped ? <span className="msg">Not a part (watch, tool or promo)</span>
                      : p ? <>{p.cat} › {p.sub} · {already ? 'already received' : addStock && !old ? `${isCounted(p) ? num(p.qty) : '–'} → ${num((p.qty ?? 0) + (l.include ? l.units : 0))}` : isPL ? 'no change' : 'cost only'}</>
                      : l.newPart && (
                        <span className="actions">
                          <b className="tag warn">New</b>
                          <select value={l.newPart.cat} onChange={e => setNew(i, { cat: e.target.value, sub: CATS[e.target.value][0] })} aria-label="Category">
                            {CAT_ORDER.map(c => <option key={c}>{c}</option>)}
                          </select>
                          <select value={l.newPart.sub} onChange={e => setNew(i, { sub: e.target.value })} aria-label="Subcategory">
                            {CATS[l.newPart.cat].map(s => <option key={s}>{s}</option>)}
                          </select>
                        </span>
                      )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="actions">
        <label className="tog"><input type="checkbox" checked={addStock && !old} disabled={old} onChange={e => setAddStock(e.target.checked)} /> Add units to stock</label>
        {!isPL && <label className="tog"><input type="checkbox" checked={setCost} onChange={e => setSetCost(e.target.checked)} /> Update unit costs (latest invoice wins)</label>}
      </div>
      <p className="msg">“First” lines add stock. Lines already received on the matching {isPL ? 'invoice' : 'packing list'} don't add it again. New parts are added marked “Check”. Lines for a repair job will ask to be set aside once Repairs is built.</p>
      <div className="actions">
        <button type="button" className="btn solid" disabled={busy || !inc.length || dup || !docNo.trim() || !date} onClick={apply}>
          {busy ? 'Applying…' : `Apply ${inc.length} line${inc.length === 1 ? '' : 's'}`}
        </button>
        <span className="msg warn">{msg}</span>
      </div>
    </div>
  )
}
