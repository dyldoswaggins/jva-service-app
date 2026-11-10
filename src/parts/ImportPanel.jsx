import { useState } from 'react'
import { api } from '../data.js'
import { readInvoiceFile, toImportLines } from '../invoice.js'
import { CATS, CAT_ORDER, STOCK_BASELINE_DATE, fmtDate, guessAbc, guessCat, invoiceCanAddStock, isCounted, money, num } from '../rules.js'

const tidy = s => String(s || '').replace(/\s+1$/, '').replace(/\s+/g, ' ').trim()

// Import a Rolex parts invoice (PDF): adds units to stock and updates costs, in one step, with Undo.
export default function ImportPanel({ allParts, actions, onClose }) {
  const [imp, setImp] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [addStock, setAddStock] = useState(true)
  const [setCost, setSetCost] = useState(true)

  async function read(file) {
    if (!file) return
    setBusy(true); setImp(null); setMsg('Reading the invoice…')
    try {
      const parsed = await readInvoiceFile(file)
      if (!parsed.lines.length) throw new Error('No invoice lines were found in that file.')
      const lines = toImportLines(parsed, allParts).map(l => {
        if (l.match || l.skipped) return l
        const [cat, sub, cal] = guessCat(l.rmc, l.desc)
        return { ...l, newPart: { name: tidy(l.desc) || l.rmc, cat, sub, cal, abc: guessAbc(l.desc) } }
      })
      const invoices = await api.loadInvoices().catch(() => [])
      const dup = invoices.some(x => x.invoice_no === parsed.invoiceNo && !x.undone)
      setImp({ ...parsed, file: file.name, lines, dup })
      setAddStock(invoiceCanAddStock(parsed.date))
      setMsg(parsed.invoiceNo ? 'Check the lines, then press Apply.' : 'No invoice number found in that file.')
    } catch (e) {
      setMsg(e.message || 'That file could not be read. Use the PDF from Rolex.')
    } finally { setBusy(false) }
  }

  const setLine = (i, f) => setImp(x => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...f } : l)) }))
  const setNew = (i, f) => setImp(x => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, newPart: { ...l.newPart, ...f } } : l)) }))

  async function apply() {
    const todo = imp.lines.filter(l => l.include)
    setBusy(true)
    try {
      const id = await api.applyInvoice(
        { invoice_no: imp.invoiceNo, date: imp.date, file: imp.file, add_stock: addStock, set_cost: setCost },
        todo.map(l => ({
          ref: l.ref, rmc: l.rmc, part_id: l.id, qty: l.qty, pack: l.pack, units: l.units, unit_cost: l.unitCost,
          pack_price: l.packPrice, mrws_ref: l.custRef || null, add_stock: addStock, set_cost: setCost,
          ...(l.match ? {} : { new_part: l.newPart }),
        }))
      )
      const units = addStock ? todo.reduce((s, l) => s + l.units, 0) : 0
      await actions.reload()
      actions.say(`Invoice ${imp.invoiceNo}: ${todo.length} lines${units ? `, +${num(units)} units` : ', costs only'}`, async () => {
        const r = await api.undoInvoice(id)
        await actions.reload()
        actions.say(r.short?.length ? `Undone. ${r.short.length} parts had already been used, so less came off.` : `Invoice ${imp.invoiceNo} undone`)
      })
      setImp(null); setMsg(''); onClose()
    } catch (e) {
      setMsg(e.message)
    } finally { setBusy(false) }
  }

  const L = imp?.lines || []
  const inc = L.filter(l => l.include)
  const old = imp && !invoiceCanAddStock(imp.date)

  return (
    <div className="panel">
      <div className="actions">
        <h2 className="grow">Import a Rolex parts invoice</h2>
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
      <p className="msg">Upload the invoice PDF from Rolex. Blister packs turn into units (B3135-5110-Y5 × 2 = 10 units). Watches, tools and promo items are left out. Nothing changes until you press Apply.</p>
      <div className="actions">
        <input type="file" accept=".pdf,application/pdf" disabled={busy} onChange={e => read(e.target.files[0])} aria-label="Invoice PDF" />
        <span className="msg">{msg}</span>
      </div>

      {imp && (
        <>
          <div>
            Invoice <b>{imp.invoiceNo || '—'}</b> · {fmtDate(imp.date) || 'no date'} · {L.length} lines,{' '}
            {L.filter(l => l.match).length} in the list, {L.filter(l => !l.match && !l.skipped).length} new, {L.filter(l => l.skipped).length} not parts
          </div>
          {imp.dup && <div className="flagline">Invoice {imp.invoiceNo} has already been imported. Undo it in History first if you need to import it again.</div>}
          {old && <div className="flagline">Dated on or before {fmtDate(STOCK_BASELINE_DATE)}: the 11.5 stock count already includes these parts, so this invoice updates costs only.</div>}
          <div className="imp-wrap">
            <table className="imp">
              <thead>
                <tr><th /><th>On invoice</th><th>Part #</th><th>Description</th><th className="r">Qty</th><th className="r">Pack</th>
                  <th className="r">Units</th><th className="r">Unit cost</th><th>MRWS #</th><th>In the list</th></tr>
              </thead>
              <tbody>
                {L.map((l, i) => {
                  const p = allParts.get(l.id)
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
                      <td className="r">{l.unitCost != null ? money(l.unitCost) : 'No charge'}</td>
                      <td>{l.custRef}</td>
                      <td>
                        {l.skipped ? <span className="msg">Not a part (watch, tool or promo)</span>
                          : p ? <>{p.cat} › {p.sub} · {addStock && !old ? `${isCounted(p) ? num(p.qty) : '–'} → ${num((p.qty ?? 0) + (l.include ? l.units : 0))}` : 'cost only'}</>
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
            <label className="tog"><input type="checkbox" checked={setCost} onChange={e => setSetCost(e.target.checked)} /> Update unit costs (latest invoice wins)</label>
          </div>
          <p className="msg">New parts are added to the list marked “Check”. Lines for a repair job will ask to be set aside once Repairs is built.</p>
          <div className="actions">
            <button type="button" className="btn solid" disabled={busy || !inc.length || imp.dup || !imp.invoiceNo || !imp.date} onClick={apply}>
              {busy ? 'Applying…' : `Apply ${inc.length} line${inc.length === 1 ? '' : 's'}`}
            </button>
            <button type="button" className="btn" onClick={() => { setImp(null); setMsg('') }}>Discard</button>
          </div>
        </>
      )}
    </div>
  )
}
