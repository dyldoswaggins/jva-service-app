// Estimate, Confirmation and Invoice (Rolex SAV documents 2, 3, 5) on the shared harmonized layout.
// Content: docs/rolex-customer-documents.md. Lines come from src/docs/lines.js.
import { buildDocument } from './rolexDoc.js'
import { EXCHANGE_NOTE, decidedLines, documentLines, sumLines } from './lines.js'
import { conditionText } from '../rules.js'

const requestsOf = job => (job.job_requests || []).map(r => r.request)
const analysisOf = job => conditionText((job.job_conditions || []).filter(c => c.state === 'confirmed')) || 'No marks found.'
const delivery = weeks => (weeks ? `approximately ${weeks} week${weeks === 1 ? '' : 's'}` : 'to be confirmed')

// Layout = JVA "Rolex Service Estimate.pdf": page 1 requests, analysis, necessary work + totals; page 2 notes (one italic
// paragraph) and the client's decision (each item with "☐ Accepted", "I refuse the estimate", validity, remarks, undersigned,
// DATE / SIGNATURE); then the legal notices. Rolex requires optional work to be listed separately, so it follows the totals.
// Fill-in spots (blob.fields) let the client sign online: decision:<key>, refuse, undersigned, date, signature, remarks.
export async function buildEstimate({ job, client, allParts, notes, weeks, date }) {
  const { necessary, optional } = documentLines(job, allParts)
  const notesText = [EXCHANGE_NOTE, ...(notes || '').split(/\n/).map(x => x.trim()).filter(Boolean)].join(' ')
  return buildDocument({
    title: 'Estimate', job, client, date,
    body: d => {
      d.section('Customer requests'); d.bullets(requestsOf(job)); d.gap(6)
      d.section('Watch analysis'); d.para(analysisOf(job)); d.gap(6)
      d.section('Necessary Work', { rightHeading: 'MSRP CAD (TAX EXCL.)' })
      necessary.forEach(l => d.item(l))
      d.totals(sumLines(necessary))
      if (optional.length) {
        d.section('Optional Work', { rightHeading: 'MSRP CAD (TAX EXCL.)' })
        optional.forEach(l => d.item(l))
        d.gap(6)
      }
      d.newPage()
      d.section('Notes')
      d.para(notesText, { font: d.fonts.ital })
      d.gap(14)
      d.section('Clients Decision', { rightHeading: 'MSRP CAD (TAX EXCL.)' })
      d.decision(job.service_type === 'CTR' ? 'Complete Overhaul Service' : 'Necessary Work', sumLines(necessary), { name: 'decision:necessary' })
      optional.forEach(l => d.decision(l.label + (l.parts?.length ? ` (${l.parts[0]})` : ''), l.price, { name: `decision:${l.key}` }))
      d.gap(2)
      d.para('I refuse the estimate'); d.gap(6)
      d.box('', { name: 'refuse' })
      d.para(`This estimate is valid for 3 months from the date of issue. Delivery: ${delivery(weeks)} on approval.`)
      d.gap(8)
      d.remarks()
      d.signature('I, the undersigned {name} , certify that I have read and understood the estimate as well as the legal notices attached and confirm ' +
        'my decision for the above mentioned watch.', { name: '', signed: false })
    },
  })
}

// Layout = JVA "Rolex Service Confirmation.pdf": page 1 requests, analysis, Accepted Work + totals; page 2 notes (italic),
// then "Optional work (DECLINED)" + totals. Rolex also asks for Delivery and Delivery mode, given under the notes.
export async function buildConfirmation({ job, client, allParts, notes, weeks, date }) {
  const { accepted, declined, refused } = decidedLines(job, allParts)
  const notesText = [EXCHANGE_NOTE, ...(notes || '').split(/\n/).map(x => x.trim()).filter(Boolean)].join(' ')
  return buildDocument({
    title: 'Confirmation', job, client, date,
    body: d => {
      d.section('Customer requests'); d.bullets(requestsOf(job)); d.gap(6)
      d.section('Watch analysis'); d.para(analysisOf(job)); d.gap(6)
      d.section('Accepted Work', { rightHeading: 'MSRP CAD (TAX EXCL.)' })
      if (refused) d.para('The client refused the estimate.')
      accepted.forEach(l => d.item(l))
      d.totals(sumLines(accepted))
      d.newPage()
      d.section('Notes')
      d.para(notesText, { font: d.fonts.ital, size: 8.1 })
      d.gap(4)
      d.para(`Delivery: ${delivery(weeks)}. Delivery mode: Counter.`, { font: d.fonts.ital, size: 8.1 })
      d.gap(10)
      if (declined.length) {
        d.section('Optional work', { middle: '(DECLINED)', rightHeading: 'MSRP CAD (TAX EXCL.)' })
        declined.forEach(l => d.item(l))
        d.totals(sumLines(declined))
      }
    },
  })
}

// Layout = JVA "Rolex Service Invoice.pdf": Services Provided + totals, one page, no legal notices.
export async function buildInvoice({ job, client, allParts, date }) {
  const { accepted } = decidedLines(job, allParts)
  return buildDocument({
    title: 'Invoice', job, client, date, legal: false, variant: 'invoice',
    body: d => {
      d.section('Services Provided', { rightHeading: 'MSRP CAD (TAX EXCL.)' })
      accepted.forEach(l => d.item(l))
      d.totals(sumLines(accepted))
    },
  })
}

export const docFileName = (job, kind) => `JVA-${job.edge_no}-${kind[0].toUpperCase()}${kind.slice(1)}.pdf`
