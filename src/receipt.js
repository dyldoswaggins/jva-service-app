// Receipt (Rolex SAV document 1) and the J. Vair Vintage Analysis Fee form, both on JVA's post-audit receipt layout
// ("Rolex Receipt (Modern & Classic) - Editable.pdf": src/docs/rolexDoc.js, variant 'receipt'; Richard, 2026-11-25).
// Content: docs/rolex-customer-documents.md. Client details live only inside these PDFs (Admin + Sales only).
// Without a signature (client signs later by email link) each PDF records where the name, date, signature and ticks go
// (blob.fields), so the signing can fill in the same document.
import { buildDocument } from './docs/rolexDoc.js'
import { conditionText } from './rules.js'

// quote: { items: [{ label, price }], total, weeks }  (indicative, before the watchmakers' analysis)
export async function makeReceipt({ job, client, requests, conditions, signaturePng, date = new Date(), quote }) {
  return buildDocument({
    title: 'Receipt', job, client, date, signaturePng, variant: 'receipt',
    body: d => {
      d.para('Dear Sir, Madam,'); d.gap(6)
      d.para('Thank you for entrusting the above-mentioned watch to us for an estimate of the potential work required, based on the details below. ' +
        'We will contact you to review the completed estimate and next steps in 2-3 business days. Retain this document and present it alongside ' +
        'government issued photo ID upon pick up. Our responsibility ends when the timepiece is delivered to the bearer of this claim letter.')
      d.gap(14)
      d.section('Customer Requests')
      d.bullets(requests.map(r => r.request))
      d.gap(8)
      d.section('Watch condition on arrival')
      d.para(conditions.length ? conditionText(conditions) : 'No visible marks noted.')
      d.gap(8)
      if (quote?.items?.length) {
        d.section('Indicative estimate (before analysis)', { rightHeading: 'MSRP CAD (TAX EXCL.)' })
        quote.items.forEach(i => d.item(i))
        if (quote.total) d.item({ label: 'Indicative total', price: quote.total })
        d.para(`The detailed estimate follows our watchmakers' analysis.${quote.weeks ? ` Delivery: approximately ${quote.weeks} week${quote.weeks === 1 ? '' : 's'} on approval.` : ''}`)
        d.gap(8)
      }
      d.section('Acknowledgement and Authorization')
      d.signature('I, the undersigned {name}, declare that I have read and accepted the legal notices applicable to the establishment of the estimate ' +
        '(appendix page). I confirm that the data transmitted on the watch is correct.', { name: client.name })
    },
  })
}

export const receiptFileName = job => `JVA-${job.edge_no}-Receipt.pdf`

const dmy = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
export const VINTAGE_FOOTER = '409 - 3rd Street SW, Calgary | 403.266.1669 | jvairanderson.com | info@jvairanderson.com'

// J. Vair "ROLEX Vintage Analysis Fee" form (Vintage watches only). Every word of "Vintage Analysis Fee Form - Editable_1.pdf"
// (SAV ALL - POST AUDIT NEW), set in the receipt's font size, margins and layout (Richard, 2026-11-25).
// decision: 'accept' | 'decline' | null (null = the client ticks it when signing by email link)
export async function makeVintageFee({ job, client, requests, conditions, signaturePng, date = new Date(), fee = 350, weeks = 18, decision = null }) {
  const c = client || {}
  return buildDocument({
    title: 'Vintage Analysis Fee', titleText: 'ROLEX Vintage Analysis Fee', job, client, date, signaturePng, variant: 'receipt', footer: VINTAGE_FOOTER,
    bill: [`Name: ${c.name || ''}`, `Address: ${c.address1 || ''}`, `City, Province: ${c.address2 || ''}`, `Postal Code: ${c.postal_code || c.address3 || ''}`, `Date: ${dmy(date)}`],
    body: d => {
      d.section('Customer Requests')
      d.bullets(requests.map(r => r.request))
      d.gap(4)
      d.section('Watch condition on arrival')
      d.para(conditions.length ? conditionText(conditions) : 'No visible marks noted.')
      d.gap(4)
      d.section('Necessary Works', { rightHeading: 'MSRP CAD (TAX EXCL.)' })
      d.item({ label: 'Rolex Vintage Analysis Fee', price: fee })
            d.para('An in-depth analysis of the watch will be necessary in order to prepare an estimate. This fee remains payable in the event of refusal ' +
        'of the estimate, or if the watch is deemed to be counterfeit. Vintage estimates are available within 3 weeks; Restoration estimates are ' +
        'available within 3 months from the day we receive your approval to proceed with the analysis.')
      d.totals(fee)
      d.section("Client's Decision")
      d.inlineBoxes([
        { label: 'I accept the analysis fee', name: 'decision:accept_fee', checked: decision === 'accept' },
        { label: 'I decline the analysis fee', name: 'decision:decline_fee', checked: decision === 'decline' },
      ])
      d.para(`This estimate is valid for 3 months from the date of issue. Delivery: approximately ${weeks} weeks on approval.`)
      d.gap(6)
      d.remarks({ italic: true })
      d.signature('I, the undersigned {name} , certify that I have read and understood the estimate as well as the legal notices attached and ' +
        'confirm my decision for the above-mentioned watch.', { name: c.name })
    },
  })
}

// One file to print several documents together (each is still filed separately)
export async function mergePdfs(blobs) {
  const { PDFDocument } = await import('pdf-lib')
  const out = await PDFDocument.create()
  for (const b of blobs) {
    const src = await PDFDocument.load(await b.arrayBuffer())
    for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p)
  }
  return new Blob([await out.save()], { type: 'application/pdf' })
}

export const vintageFeeFileName = job => `JVA-${job.edge_no}-Vintage-Analysis-Fee.pdf`
