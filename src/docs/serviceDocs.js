// Estimate, Confirmation and Invoice (Rolex SAV documents 2, 3, 5) on the shared harmonized layout.
// Content: docs/rolex-customer-documents.md. Lines come from src/docs/lines.js.
import { buildDocument } from './rolexDoc.js'
import { EXCHANGE_NOTE, decidedLines, documentLines, sumLines } from './lines.js'
import { conditionText } from '../rules.js'

const requestsOf = job => (job.job_requests || []).map(r => r.request)
const analysisOf = job => conditionText((job.job_conditions || []).filter(c => c.state === 'confirmed')) || 'No marks found.'
const delivery = weeks => (weeks ? `approximately ${weeks} week${weeks === 1 ? '' : 's'}` : 'to be confirmed')

export async function buildEstimate({ job, client, allParts, notes, weeks, date }) {
  const { necessary, optional } = documentLines(job, allParts)
  return buildDocument({
    title: 'Estimate', job, client, date,
    body: d => {
      d.section('Customer requests'); d.bullets(requestsOf(job)); d.gap(4)
      d.section('Watch analysis'); d.para(analysisOf(job)); d.gap(4)
      d.section('Necessary work', { rightHeading: 'MSRP CAD (TAX EXCL.)' })
      necessary.forEach(l => d.item(l))
      d.totals(sumLines(necessary))
      d.section('Notes')
      d.para(EXCHANGE_NOTE, { size: 7.5 })
      if (notes?.trim()) { d.gap(3); d.para(notes.trim(), { size: 7.5 }) }
      d.gap(4)
      if (optional.length) {
        d.section('Optional work', { rightHeading: 'MSRP CAD (TAX EXCL.)' })
        optional.forEach(l => d.item(l))
        d.gap(6)
      }
      d.section("Client's decision", { rightHeading: 'MSRP CAD (TAX EXCL.)' })
      d.checkbox('I accept the necessary work', { price: sumLines(necessary) })
      if (optional.length) {
        d.para('Optional work (tick accepted options)', { font: undefined, size: 7.5 })
        optional.forEach(l => d.checkbox(l.label + (l.parts?.length ? ` — ${l.parts[0]}` : ''), { price: l.price }))
      }
      d.checkbox('I refuse the estimate')
      d.para(`This estimate is valid for 3 months from the date of issue. Delivery: ${delivery(weeks)} on approval.`, { size: 7.5 })
      d.gap(6)
      d.para('Remarks: ____________________________________________________________________________________________')
      d.gap(8)
      d.signature('I, the undersigned {name}, certify that I have read and understood the estimate as well as the legal notices attached and confirm ' +
        'my decision for the above mentioned watch.', { name: '', signed: false })
    },
  })
}

export async function buildConfirmation({ job, client, allParts, notes, weeks, date }) {
  const { accepted, declined, refused } = decidedLines(job, allParts)
  return buildDocument({
    title: 'Confirmation', job, client, date,
    body: d => {
      d.section('Customer requests'); d.bullets(requestsOf(job)); d.gap(4)
      d.section('Watch analysis'); d.para(analysisOf(job)); d.gap(4)
      d.section('Accepted work', { rightHeading: 'MSRP CAD (TAX EXCL.)' })
      if (refused) d.para('The client refused the estimate.')
      accepted.forEach(l => d.item(l))
      d.totals(sumLines(accepted))
      d.section('Notes')
      d.para(EXCHANGE_NOTE, { size: 7.5 })
      if (notes?.trim()) { d.gap(3); d.para(notes.trim(), { size: 7.5 }) }
      d.gap(4)
      d.row('Delivery', delivery(weeks))
      d.row('Delivery mode', 'Counter')
      d.gap(4)
      if (declined.length) {
        d.section('Optional work (DECLINED)', { rightHeading: 'MSRP CAD (TAX EXCL.)' })
        declined.forEach(l => d.item(l))
        d.totals(sumLines(declined))
      }
    },
  })
}

export async function buildInvoice({ job, client, allParts, date }) {
  const { accepted } = decidedLines(job, allParts)
  return buildDocument({
    title: 'Invoice', job, client, date, legal: false,
    body: d => {
      d.section('Services provided', { rightHeading: 'MSRP CAD (TAX EXCL.)' })
      accepted.forEach(l => d.item(l))
      d.totals(sumLines(accepted))
      d.para('Work and parts are guaranteed for 24 months from the date the work was completed and the watch was available for collection, ' +
        'as set out in the legal notices of your estimate. For more information on Rolex servicing: on.rolex.com/service', { size: 7 })
    },
  })
}

export const docFileName = (job, kind) => `JVA-${job.edge_no}-${kind[0].toUpperCase()}${kind.slice(1)}.pdf`
