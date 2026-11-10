// Fill JVA's own editable Rolex receipt (public/templates/receipt.pdf) and add the client's signature.
// Client details only ever live inside this PDF (stored with the job, Admin + Sales only).
import { PDFDocument } from 'pdf-lib'
import { conditionText } from './rules.js'

export async function makeReceipt({ job, client, requests, conditions, signaturePng, date = new Date() }) {
  const tpl = await fetch('/templates/receipt.pdf').then(r => { if (!r.ok) throw new Error('Receipt template missing'); return r.arrayBuffer() })
  const pdf = await PDFDocument.load(tpl)
  const form = pdf.getForm()
  const set = (name, value) => { try { form.getTextField(name).setText(value || '') } catch { /* field missing */ } }
  const day = date.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })

  set('Customer Name', client.name)
  set('Address 1', client.address1)
  set('Address 2', client.address2)
  set('Address 3', client.address3)
  set('Date', day)
  set('Job Reference Number', job.edge_no)
  set('Watch', [job.watch_ref, 'Rolex', job.watch_name].filter(Boolean).join(' '))
  set('Serial Number', job.serial)
  set('Bracelet', job.bracelet)
  set('Dial Colour', job.dial)
  const req = requests.map(r => r.request + (r.note ? ` (${r.note})` : '')).join('; ')
  const cond = conditions.length ? `Condition noted at intake: ${conditionText(conditions)}.` : 'Condition noted at intake: no visible marks noted.'
  set('Customer Request', [req && `${req}.`, `Service type: ${job.service_type}.`, cond].filter(Boolean).join('\n\n'))
  set('Undersigned Name', client.name)

  if (signaturePng) {
    const img = await pdf.embedPng(signaturePng)
    const w = 140, h = Math.min(34, (img.height / img.width) * w)
    pdf.getPage(0).drawImage(img, { x: 372, y: 213, width: w, height: h })
  }
  form.flatten()
  return new Blob([await pdf.save()], { type: 'application/pdf' })
}

export const receiptFileName = job => `JVA-${job.edge_no}-Receipt.pdf`
