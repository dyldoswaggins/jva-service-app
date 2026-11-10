// Receipt (Rolex SAV document 1) on the shared harmonized layout (src/docs/rolexDoc.js).
// Content: docs/rolex-customer-documents.md. Client details live only inside this PDF (Admin + Sales only).
import { buildDocument } from './docs/rolexDoc.js'
import { conditionText } from './rules.js'

// quote: { items: [{ label, price }], total, weeks }  (indicative, before the watchmakers' analysis)
export async function makeReceipt({ job, client, requests, conditions, signaturePng, date = new Date(), quote }) {
  return buildDocument({
    title: 'Receipt', job, client, date, signaturePng,
    body: d => {
      d.para('Dear Sir, Madam,'); d.gap(4)
      d.para('Thank you for entrusting the above-mentioned watch to us for an estimate of the potential work required, based on the details below. ' +
        'We will contact you to review the completed estimate and next steps in 2-3 business days. Retain this document and present it alongside ' +
        'government issued photo ID upon pick up. Our responsibility ends when the timepiece is delivered to the bearer of this claim letter.')
      d.gap(6)
      d.section('Customer requests')
      d.bullets(requests.map(r => r.request))
      d.gap(4)
      d.section('Watch condition on arrival')
      d.para(conditions.length ? conditionText(conditions) : 'No visible marks noted.')
      d.gap(4)
      if (quote?.items?.length) {
        d.section('Indicative estimate (before analysis)', { rightHeading: 'MSRP CAD (TAX EXCL.)' })
        quote.items.forEach(i => d.item(i))
        if (quote.total) d.item({ label: 'Indicative total', price: quote.total })
        d.para(`The detailed estimate follows our watchmakers' analysis.${quote.weeks ? ` Delivery: approximately ${quote.weeks} week${quote.weeks === 1 ? '' : 's'} on approval.` : ''}`, { size: 7.5 })
        d.gap(4)
      }
      d.section('Acknowledgement and authorization')
      d.signature('I, the undersigned {name}, declare that I have read and accepted the legal notices applicable to the establishment of the estimate ' +
        '(appendix page). I confirm that the data transmitted on the watch is correct.', { name: client.name })
    },
  })
}

export const receiptFileName = job => `JVA-${job.edge_no}-Receipt.pdf`

// J. Vair Vintage Analysis Fee form (Vintage watches, signed at intake instead of the receipt).
// Wording from "Vintage Analysis Fee Form - Editable_1.pdf" (Customer Documents); same harmonized layout and legal notices.
export async function makeVintageFee({ job, client, requests, conditions, signaturePng, date = new Date(), fee = 350, weeks = 18 }) {
  return buildDocument({
    title: 'Vintage Analysis Fee', job, client, date, signaturePng,
    body: d => {
      d.section('Customer requests')
      d.bullets(requests.map(r => r.request))
      d.gap(4)
      d.section('Watch condition on arrival')
      d.para(conditions.length ? conditionText(conditions) : 'No visible marks noted.')
      d.gap(4)
      d.section('Necessary work', { rightHeading: 'MSRP CAD (TAX EXCL.)' })
      d.item({ label: 'Rolex Vintage Analysis Fee', price: fee })
      d.para('An in-depth analysis of the watch will be necessary in order to prepare an estimate. This fee remains payable in the event of refusal ' +
        'of the estimate, or if the watch is deemed to be counterfeit. Vintage estimates are available within 3 weeks; Restoration estimates are ' +
        'available within 3 months from the day we receive your approval to proceed with the analysis.', { size: 7.5 })
      d.totals(fee)
      d.section("Client's decision")
      d.checkbox('I accept the analysis fee', { checked: !!signaturePng })
      d.checkbox('I decline the analysis fee')
      d.para(`This estimate is valid for 3 months from the date of issue. Delivery: approximately ${weeks} weeks on approval.`)
      d.gap(4)
      d.signature('I, the undersigned {name}, certify that I have read and understood the estimate as well as the legal notices attached and ' +
        'confirm my decision for the above-mentioned watch.', { name: client.name })
    },
  })
}
export const vintageFeeFileName = job => `JVA-${job.edge_no}-Vintage-Analysis-Fee.pdf`
