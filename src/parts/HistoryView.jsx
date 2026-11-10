import { useEffect, useState } from 'react'
import { api } from '../data.js'
import { fmtTime, money, num, toCsv, download } from '../rules.js'

export default function HistoryView({ who, can, actions }) {
  const [openInv, setOpenInv] = useState(null)
  const [log, setLog] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')

  const load = () => {
    setErr('')
    Promise.all([api.loadLog(1000), api.loadInvoices()])
      .then(([l, i]) => { setLog(l); setInvoices(i) })
      .catch(e => setErr(e.message || String(e)))
  }
  useEffect(load, [])
  useEffect(() => api.subscribe({ onLog: r => r?.id && setLog(l => (l ? [r, ...l.filter(x => x.id !== r.id)] : l)) }), [])

  if (err) return <div className="panel"><p className="msg warn">History couldn't be loaded: {err}</p></div>
  if (!log) return <div className="panel"><p className="msg">Loading history…</p></div>

  const s = q.trim().toLowerCase()
  const rows = log.filter(x => !s || String(x.rmc || '').toLowerCase().includes(s) || String(x.src || '').toLowerCase().includes(s) || String(x.type).toLowerCase() === s)
  const exportCsv = () =>
    download(`Rolex parts stock log ${new Date().toLocaleDateString('en-CA')}.csv`,
      toCsv(rows.map(x => ({ When: x.at, 'Part #': x.rmc, From: x.prev ?? '', To: x.qty ?? '', Change: x.change ?? '', Type: x.type, By: who(x.by_user, x.by_legacy), Source: x.src || '', Ref: x.ref || '' }))))

  return (
    <>
      <div className="panel">
        <div className="actions"><h2 className="grow">Imported invoices and packing lists</h2><button type="button" className="btn" onClick={load}>Refresh</button></div>
        {invoices.length ? (
          <div className="imp-wrap">
            <table className="imp">
              <thead><tr><th>Imported</th><th>Document</th><th>Date</th><th className="r">Lines</th><th className="r">Units added</th><th>By</th><th /></tr></thead>
              <tbody>
                {invoices.flatMap(x => {
                  const lines = x.lines || []
                  const units = lines.reduce((s, l) => s + (l.stocked ? l.units : 0), 0)
                  const open = openInv === x.id
                  return [
                    <tr key={x.id} className={x.undone ? 'off' : ''}>
                      <td>{fmtTime(x.at)}</td><td className="b">{x.doc_type === 'packing_list' ? 'Packing list ' : 'Invoice '}{x.invoice_no || x.file || '—'}</td><td>{x.date || ''}</td>
                      <td className="r">{lines.length}</td><td className="r">{units ? num(units) : 'Costs only'}</td><td>{who(x.by_user)}</td>
                      <td className="actions">
                        <button type="button" className="btn" onClick={() => setOpenInv(open ? null : x.id)}>{open ? 'Hide' : 'Lines'}</button>
                        {x.undone ? <span className="msg">Undone {fmtTime(x.undone_at)}</span>
                          : can.edit && (
                            <button type="button" className="btn" onClick={async () => {
                              try {
                                const r = await api.undoInvoice(x.id)
                                await actions.reload(); load()
                                actions.say(r.short?.length ? `Undone. ${r.short.length} parts had already been used, so less came off.` : `Invoice ${x.invoice_no} undone`)
                              } catch (e) { actions.say(e.message) }
                            }}>Undo</button>
                          )}
                      </td>
                    </tr>,
                    open && (
                      <tr key={x.id + '-l'}>
                        <td colSpan={7}>
                          <table className="imp">
                            <thead><tr><th>On invoice</th><th>Part #</th><th className="r">Qty</th><th className="r">Pack</th><th className="r">Units</th><th className="r">Unit cost</th><th>MRWS #</th><th>Done</th></tr></thead>
                            <tbody>
                              {lines.map((l, i) => (
                                <tr key={i}>
                                  <td className="mono">{l.ref}</td><td className="mono b">{l.rmc}</td><td className="r">{num(l.qty)}</td>
                                  <td className="r">×{l.pack}</td><td className="r">{num(l.units)}</td>
                                  <td className="r">{l.unit_cost != null ? money(l.unit_cost) : '–'}</td><td>{l.mrws_ref || ''}</td>
                                  <td>{[l.stocked && 'Stock', l.costed && 'Cost', l.added && 'New part'].filter(Boolean).join(' · ')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ),
                  ]
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="msg">No invoices imported yet.</p>}
      </div>
      <div className="panel">
        <div className="actions">
          <h2 className="grow">Stock changes</h2>
          <input type="search" placeholder="Filter by part #, source or type" value={q} onChange={e => setQ(e.target.value)} aria-label="Filter stock changes" />
          <button type="button" className="btn" onClick={exportCsv}>Excel</button>
        </div>
        {rows.length ? (
          <div className="imp-wrap">
            <table className="imp">
              <thead><tr><th>When</th><th>Part #</th><th className="r">From</th><th className="r">To</th><th className="r">Change</th><th>Type</th><th>By</th><th>Source</th></tr></thead>
              <tbody>
                {rows.slice(0, 300).map(x => (
                  <tr key={x.id}>
                    <td>{fmtTime(x.at)}</td><td className="mono b">{x.rmc}</td>
                    <td className="r">{x.prev == null ? '–' : num(x.prev)}</td>
                    <td className="r">{x.qty == null ? '–' : num(x.qty)}</td>
                    <td className="r">{x.change == null ? '' : (x.change > 0 ? '+' : '') + num(x.change)}</td>
                    <td>{x.type}</td><td>{who(x.by_user, x.by_legacy)}</td><td className="d" title={x.src || ''}>{x.src || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="msg">No stock changes match.</p>}
        {rows.length > 300 && <p className="msg">Showing the latest 300. Use Excel for the full list.</p>}
      </div>
    </>
  )
}
