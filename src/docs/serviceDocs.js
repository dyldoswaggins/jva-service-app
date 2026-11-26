// Estimate, Confirmation and Invoice in the format of JVA's "Rolex SAV" page (post-audit "All" template, Richard, 2026-11-26):
// colour J.VAIR logo, 8.14 pt, same header as the post-audit receipt. Content: docs/rolex-customer-documents.md.
// Lines come from src/docs/lines.js; wording and order from the SAV page.
import { buildDocument } from './rolexDoc.js'
import { EXCHANGE_NOTE, analysisText, decidedLines, documentLines, sumLines } from './lines.js'
import { conditionText } from '../rules.js'
import { NO_OPTIONS, SERVICE_EMAIL } from '../savCatalog.js'

const cap = s => String(s || '').replace(/^./, c => c.toUpperCase())
const low = s => String(s || '').replace(/^./, c => c.toLowerCase())
const requestList = job => (job.estimate_source === 'rolex' && job.rolex_estimate?.requests
  ? job.rolex_estimate.requests.split(/,\s*/) : (job.job_requests || []).map(r => r.request))
// SAV: one line, "Perform complete overhaul, repair bracelet, replace crystal"
const requestsOf = job => requestList(job).map((r, i) => (i ? low(r) : cap(r))).join(', ')
const analysisOf = job => (job.estimate_source === 'rolex' && job.rolex_estimate?.analysis) || analysisText(job, conditionText) || 'No marks found.'
const detailOf = l => [...(l.subs || []), ...(l.parts || [])].filter(Boolean).join('. ')
const item = (d, l, o) => d.savItem({ label: l.label, price: l.price, detail: detailOf(l), ...o })
const notesOf = notes => [EXCHANGE_NOTE, ...(notes || '').split(/\n/).map(x => x.trim()).filter(x => x && x !== EXCHANGE_NOTE && !/^This estimate is intended to inform/i.test(x))].join('\n')

// Bill to/Deliver to as on the SAV page: name, address, postal code, "City, Province" (address2 on older jobs)
export const savBill = (c = {}) => [c.name, c.address1, c.postal_code || c.address3, [c.city, c.province].filter(Boolean).join(', ') || c.address2].filter(Boolean)
// Document dates from the sheet (Estimate date / Confirmation date / Invoice date), else today
export const docDate = (job, kind) => {
  const iso = { estimate: job.estimate_date, confirmation: job.confirmation_date, invoice: job.invoice_date }[kind]
  if (!iso) return new Date()
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(y, m - 1, d)
}
const deliveryText = (job, weeks) => (job.delivery_weeks ? `approximately ${job.delivery_weeks} weeks`
  : weeks ? `approximately ${weeks} week${weeks === 1 ? '' : 's'}` : 'to be confirmed')
const common = (job, client, kind, date) => ({ job, client, bill: savBill(client || {}), showDate: true, legalRefs: false, date: date || docDate(job, kind) })

// SAV estimate: p1 requests, analysis, Necessary Works + totals; p2 Option(s) + totals, Notes; p3 Client's Decision; legal notices.
// Fill-in spots (blob.fields) for online signing: decision:necessary, decision:<key>, refuse, remarks, undersigned, date, signature.
export async function buildEstimate({ job, client, allParts, notes, weeks, date }) {
  const { necessary, optional } = documentLines(job, allParts)
  return buildDocument({
    title: 'Estimate', variant: 'receipt', ...common(job, client, 'estimate', date),
    body: d => {
      d.section('Customer Requests'); d.para(requestsOf(job)); d.gap(2)
      d.section('Watch Analysis'); d.para(analysisOf(job)); d.gap(14)
      d.section('Necessary Works', { rightHeading: 'MSRP CAD (TAX EXCL.)' })
      necessary.forEach(l => item(d, l, { gap: 9 }))
      d.gap(30); d.totals(sumLines(necessary))
      d.newPage()
      d.section('Option(s)', { rightHeading: 'MSRP CAD (TAX EXCL.)' })
      if (optional.length) optional.forEach(l => item(d, l, { italic: true }))
      else d.para(NO_OPTIONS, { font: d.fonts.ital })
      d.gap(60); d.totals(sumLines(optional))
      d.gap(-12)
      d.para('Notes', { font: d.fonts.bold }); d.para(notesOf(notes))
      d.newPage()
      d.rich([['Kindly return this estimate duly completed and signed by email at '], [SERVICE_EMAIL, true],
        [' so that we can initiate the service. A confirmation by telephone can unfortunately not be taken into consideration.']])
      d.gap(2)
      d.section("Client's Decision", { rightHeading: 'MSRP CAD (TAX EXCL.)' })
      d.gap(14)
      d.savBox('I accept the estimate', sumLines(necessary), { name: 'decision:necessary' })
      if (optional.length) {
        d.para('Option(s) (Tick accepted options)', { font: d.fonts.bold })
        optional.forEach(l => d.savBox(l.label + (l.parts?.length ? ` (${l.parts[0]})` : ''), l.price, { name: `decision:${l.key}`, small: true }))
      }
      d.gap(40)
      d.savBox('I refuse all work on estimate', null, { name: 'refuse' })
      d.gap(14)
      d.para(`This estimate is valid for 3 months from the date of issue. Delivery: ${deliveryText(job, weeks)} on approval.`)
      d.line(9); d.remarks({ italic: true }); d.gap(10); d.line(13)
      d.signature('I, the undersigned {name} , certify that I have read and understood the estimate as well as the legal notices attached and confirm ' +
        'my decision for the above mentioned watch.', { name: '', signed: false })
    },
  })
}

// SAV confirmation: p1 requests, analysis, Accepted Works + totals; p2 Service Lead Time, Notes; legal notices.
// Rolex also asks for the delivery mode and the declined optional work: given on page 2 when there is any.
export async function buildConfirmation({ job, client, allParts, notes, weeks, date }) {
  const { accepted, declined, refused } = decidedLines(job, allParts)
  return buildDocument({
    title: 'Confirmation', variant: 'receipt', ...common(job, client, 'confirmation', date),
    body: d => {
      d.section('Customer Requests'); d.para(requestsOf(job)); d.gap(2)
      d.section('Watch Analysis'); d.para(analysisOf(job)); d.gap(14)
      d.section('Accepted Works', { rightHeading: 'MSRP CAD (TAX EXCL.)' })
      if (refused) d.para('The client refused the estimate.')
      accepted.forEach(l => item(d, l, { gap: 3 }))
      d.gap(30); d.totals(sumLines(accepted))
      d.newPage()
      d.gap(4)
      d.rich([['Service Lead Time: ', true], [job.lead_time || cap(deliveryText(job, weeks))]])
      d.rich([['Delivery mode: ', true], [client?.delivery || 'Pick up in store']])
      d.gap(4)
      if (declined.length) {
        d.section('Option(s) (DECLINED)', { rightHeading: 'MSRP CAD (TAX EXCL.)' })
        declined.forEach(l => item(d, l, { italic: true }))
        d.totals(sumLines(declined))
      }
      d.section('Notes'); d.para(notesOf(notes))
    },
  })
}

// SAV invoice: one page, Services Provided + totals (+ shipping charged to the client), no legal notices.
export async function buildInvoice({ job, client, allParts, date }) {
  const { accepted } = decidedLines(job, allParts)
  const lines = [...accepted, ...(Number(job.inv_shipping) ? [{ key: 'shipping', label: 'Shipping', price: Number(job.inv_shipping) }] : [])]
  return buildDocument({
    title: 'Invoice', legal: false, variant: 'savInvoice', ...common(job, client, 'invoice', date),
    body: d => {
      d.section('Services Provided', { rightHeading: 'MSRP CAD (TAX EXCL.)' })
      lines.forEach(l => item(d, l, { gap: 3 }))
      d.gap(50); d.totals(sumLines(lines))
    },
  })
}

export const docFileName = (job, kind) => `JVA-${job.edge_no}-${kind[0].toUpperCase()}${kind.slice(1)}.pdf`
