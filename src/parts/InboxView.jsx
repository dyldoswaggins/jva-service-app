import { useEffect, useState } from 'react'
import { api } from '../data.js'
import { readInvoiceFile } from '../invoice.js'
import { fmtDate, fmtTime } from '../rules.js'
import ReviewDoc, { docLabel } from './ReviewDoc.jsx'

const STATUS = { new: 'New', reading: 'Reading…', ready: 'To check', error: 'Problem', applied: 'Applied', dismissed: 'Dismissed' }

// Delivery documents (invoices, packing lists) arrive here by email or upload, already read.
// Nothing changes stock until Admin opens one and presses Apply.
export default function InboxView({ allParts, actions, userId }) {
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(null) // { item, parsed }
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [showDone, setShowDone] = useState(false)

  const load = () => api.loadInbox().then(setRows).catch(e => setMsg(e.message))
  useEffect(() => { load() }, [])
  useEffect(() => api.subscribe({ onInbox: r => r?.id && setRows(x => x && (x.some(y => y.id === r.id) ? x.map(y => (y.id === r.id ? r : y)) : [r, ...x])) }), [])

  async function upload(files) {
    setMsg('')
    for (const f of files) {
      setBusy(`Uploading ${f.name}…`)
      try { await api.uploadToInbox(f, userId) } catch (e) { setMsg(`${f.name}: ${e.message}`) }
    }
    setBusy(''); load()
  }

  async function openItem(item, force = false) {
    setMsg('')
    try {
      if (item.read_by === 'claude' && item.parsed && !force) return setOpen({ item, parsed: item.parsed })
      if (item.read_by === 'layout' && !force) {
        setBusy('Reading…')
        const parsed = await readInvoiceFile(await api.inboxFile(item))
        setBusy('')
        if (parsed.lines.length) return setOpen({ item, parsed })
        setMsg(`${item.file_name}: not a Rolex PDF layout. Use “Read scan” to have it read.`)
        return
      }
      setBusy('Reading the scan… (up to a minute)')
      await api.readInbox(item.id, true)
      setBusy(''); await load()
    } catch (e) { setBusy(''); setMsg(e.message); load() }
  }

  async function viewFile(item) {
    try {
      const f = await api.inboxFile(item)
      window.open(URL.createObjectURL(f), '_blank')
    } catch (e) { setMsg(e.message) }
  }

  if (open)
    return (
      <ReviewDoc item={open.item} parsed={open.parsed} fileName={open.item.file_name} allParts={allParts} actions={actions}
        onClose={() => setOpen(null)} onApplied={() => { setOpen(null); load() }} />
    )

  const shown = (rows || []).filter(r => showDone || !['applied', 'dismissed'].includes(r.status))
  return (
    <div className="panel">
      <div className="actions">
        <h2 className="grow">Inbox: invoices and packing lists</h2>
        <label className="btn">Upload…
          <input type="file" multiple accept=".pdf,application/pdf,image/jpeg,image/png,image/webp" hidden
            onChange={e => { upload([...e.target.files]); e.target.value = '' }} />
        </label>
        <label className="tog"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show applied</label>
        <button type="button" className="btn" onClick={load}>Refresh</button>
      </div>
      <p className="msg">Documents emailed to the parts inbox appear here, already read. Rolex PDFs are read directly; scans and photos are read by Claude. Nothing changes stock until you open one and press Apply.</p>
      {busy && <p className="msg">{busy}</p>}
      {msg && <p className="msg warn">{msg}</p>}
      {!rows ? <p className="msg">Loading…</p> : shown.length ? (
        <div className="imp-wrap">
          <table className="imp">
            <thead><tr><th>Received</th><th>From</th><th>File</th><th>Type</th><th>No.</th><th>Date</th><th>Status</th><th /></tr></thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.id} className={['applied', 'dismissed'].includes(r.status) ? 'off' : ''}>
                  <td>{fmtTime(r.received_at)}</td>
                  <td className="d" title={r.subject || ''}>{r.source === 'email' ? r.sender || 'Email' : 'Upload'}</td>
                  <td className="d" title={r.file_name}><button type="button" className="link" onClick={() => viewFile(r)}>{r.file_name}</button></td>
                  <td>{r.doc_type ? docLabel(r.doc_type) : r.read_by === 'layout' ? 'Rolex PDF' : ''}</td>
                  <td className="mono">{r.doc_no || ''}</td>
                  <td>{r.doc_date ? fmtDate(r.doc_date) : ''}</td>
                  <td>{r.status === 'error' ? <span className="tag warn" title={r.error || ''}>{STATUS.error}: {r.error}</span> : STATUS[r.status]}</td>
                  <td className="actions">
                    {r.status === 'ready' && <button type="button" className="btn solid" onClick={() => openItem(r)}>Check</button>}
                    {['error', 'new', 'ready'].includes(r.status) && (
                      <button type="button" className="btn" onClick={() => openItem(r, true)}>Read scan</button>
                    )}
                    {['error', 'new', 'ready'].includes(r.status) && (
                      <button type="button" className="btn" onClick={async () => {
                        await api.updateInbox(r.id, { status: 'dismissed' }); load()
                        actions.say(`${r.file_name} dismissed`, async () => { await api.updateInbox(r.id, { status: r.status }); load() })
                      }}>Dismiss</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="msg">Nothing waiting.</p>}
    </div>
  )
}
