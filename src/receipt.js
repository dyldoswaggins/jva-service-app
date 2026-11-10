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
