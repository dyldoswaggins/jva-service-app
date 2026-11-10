// One harmonized layout for the four Rolex customer documents (Receipt, Estimate, Confirmation, Invoice),
// copying JVA's SAV templates (OneDrive › Rolex › 1. Service - Rolex › Rolex Service Documents › Rolex SAV Templates).
// Content grows with the information: text wraps and flows onto new pages — nothing is ever cut off.
// Required content: docs/rolex-customer-documents.md.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { braceletLine, dialLine, money, watchLine } from '../rules.js'
import LEGAL from './legal-notices.json'

const W = 612, H = 792, L = 50, R = 505, BOTTOM = 56
const STORE = ['J. Vair Jewellers', '409 - 3rd Street SW', 'T2P 4Z2, Calgary, AB', '(403) 266 1669']
const black = rgb(0, 0, 0), grey = rgb(0.35, 0.35, 0.35)

export async function buildDocument({ title, job, client = {}, date = new Date(), body, signaturePng, legal = true }) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${title} ${job.edge_no}`)
  pdf.setAuthor('J. Vair Anderson')
  const f = {
    reg: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    ital: await pdf.embedFont(StandardFonts.HelveticaOblique),
  }
  // J.VAIR "Jewellers since 1925" logo, taken from JVA's blank receipt template
  const tpl = await PDFDocument.load(await fetch('/templates/jva-receipt.pdf').then(r => r.arrayBuffer()))
  const logo = await pdf.embedPage(tpl.getPage(0), { left: 180, bottom: 700, right: 380, top: 770 })
  const sig = signaturePng ? await pdf.embedPng(signaturePng) : null
  const day = date.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })

  let page, y
  const text = (s, x, yy, { font = f.reg, size = 8, color = black } = {}) => page.drawText(String(s ?? ''), { x, y: yy, size, font, color })
  const right = (s, xr, yy, o = {}) => text(s, xr - (o.font || f.reg).widthOfTextAtSize(String(s ?? ''), o.size || 8), yy, o)
  const rule = (yy, t = 1) => page.drawLine({ start: { x: L, y: yy }, end: { x: R, y: yy }, thickness: t, color: black })
  const wrap = (s, font, size, width) => {
    const out = []
    for (const para of String(s ?? '').split('\n')) {
      let cur = ''
      for (const w of para.split(' ')) {
        const t = cur ? cur + ' ' + w : w
        if (font.widthOfTextAtSize(t, size) > width && cur) { out.push(cur); cur = w } else cur = t
      }
      out.push(cur)
    }
    return out
  }

  function header() {
    page = pdf.addPage([W, H])
    page.drawPage(logo, { x: (W - 180) / 2, y: H - 92, width: 180, height: 63 })
    STORE.forEach((s, i) => text(s, L, H - 108 - i * 9, { font: i ? f.reg : f.bold, size: 7 }))
    const billX = 412
    text('Bill to/Deliver to', billX, H - 108, { font: f.bold, size: 7 })
    ;[client.name, client.address1, client.address2, client.address3].filter(Boolean).forEach((s, i) => text(s, billX, H - 117 - i * 9, { size: 7 }))
    right(day, R, H - 160, { size: 7.5 })
    text(title.toUpperCase(), L, H - 182, { size: 13 })
    const ref = [['OUR REF #', job.edge_no], ['WATCH', watchLine(job)], ['SERIAL #', job.serial], ['BRACELET', braceletLine(job)], ['DIAL', dialLine(job)]]
    ref.forEach(([k, v], i) => { text(k, L, H - 202 - i * 10, { font: f.bold, size: 7 }); text(v, 155, H - 202 - i * 10, { size: 7.5 }) })
    y = H - 202 - ref.length * 10 - 6
  }
  const ensure = h => { if (y - h < BOTTOM) header() }

  // ---- building blocks ----
  const api = {
    gap(h = 8) { y -= h },
    section(heading, { rightHeading } = {}) {
      ensure(30)
      rule(y, 1.1); y -= 11
      text(heading, L, y, { font: f.bold, size: 8 })
      if (rightHeading) right(rightHeading, R, y, { font: f.bold, size: 7.5 })
      y -= 12
    },
    para(s, { size = 8, font = f.reg, indent = 0 } = {}) {
      for (const ln of wrap(s, font, size, R - L - indent)) { ensure(size * 1.3); text(ln, L + indent, y, { size, font }); y -= size * 1.3 }
    },
    bullets(list, o) { list.forEach(s => api.para(`- ${s}`, o)) },
    // { label, price, parts: ['24-704-0 crown with gasket 704 st'], subs: ['Clean case and bracelet'] }
    item({ label, price, parts = [], subs = [] }) {
      ensure(11 + (parts.length + subs.length) * 10)
      const lines = wrap(label, f.reg, 8, 330)
      lines.forEach((ln, i) => { text(ln, L, y, { size: 8 }); if (i === 0 && price != null) right(typeof price === 'string' ? price : money(price), R, y, { size: 8 }); y -= 10 })
      ;[...subs, ...parts].forEach(s => { for (const ln of wrap(`- ${s}`, f.ital, 7.5, 310)) { ensure(10); text(ln, L + 26, y, { size: 7.5, font: f.ital }); y -= 9.5 } })
    },
    totals(sub, { gst = 0.05 } = {}) {
      const tax = Math.round(sub * gst * 100) / 100
      ensure(44)
      y -= 4; rule(y + 8, 0.6)
      text('Services/Supplies Total', L, y, { size: 7.5 }); right(money(sub), R, y, { size: 7.5 }); y -= 4; rule(y, 0.6); y -= 9
      text(`GST ${Math.round(gst * 100)}%`, L, y, { size: 7.5 }); right(money(tax), R, y, { size: 7.5 }); y -= 4; rule(y, 0.6); y -= 9
      text('TOTAL CAD', L, y, { font: f.bold, size: 7.5 }); right(money(sub + tax), R, y, { font: f.bold, size: 7.5 }); y -= 4; rule(y, 1.2); rule(y - 2, 1.2); y -= 14
      return { sub, tax, total: sub + tax }
    },
    row(label, value) {
      ensure(12)
      text(label, L, y, { font: f.bold, size: 7.5 }); text(value, 155, y, { size: 8 }); y -= 11
    },
    checkbox(label, { checked = false, price } = {}) {
      ensure(14)
      page.drawRectangle({ x: L, y: y - 1.5, width: 8, height: 8, borderWidth: 0.8, borderColor: black })
      if (checked) text('X', L + 1.6, y - 0.3, { font: f.bold, size: 7.5 })
      text(label, L + 14, y, { size: 8 })
      if (price != null) right(money(price), R, y, { size: 8 })
      y -= 14
    },
    // "I, the undersigned <name>, …"  +  Date / Signature (signature image if signed)
    signature(statement, { name, signed = !!sig } = {}) {
      ensure(70)
      api.para(statement.replace('{name}', name || '______________________________'))
      y -= 18
      text('Date:', L, y, { font: f.bold, size: 7.5 }); text(signed ? day : '', L + 30, y, { size: 7.5 })
      page.drawLine({ start: { x: L + 28, y: y - 3 }, end: { x: 240, y: y - 3 }, thickness: 0.6, color: black })
      text('Signature:', 270, y, { font: f.bold, size: 7.5 })
      page.drawLine({ start: { x: 312, y: y - 3 }, end: { x: R, y: y - 3 }, thickness: 0.6, color: black })
      if (sig && signed) { const w = 150, h = Math.min(36, (sig.height / sig.width) * w); page.drawImage(sig, { x: 320, y: y - 2, width: w, height: h }) }
      y -= 20
    },
  }

  header()
  await body(api)

  // ---- legal notices (JVA, Alberta) in two columns ----
  if (legal) {
    header()
    rule(y, 1.1); y -= 12
    text('Legal Notices', L, y, { font: f.bold, size: 9 }); y -= 14
    const colW = (R - L - 18) / 2
    let x = L, top = y
    const colBottom = BOTTOM
    for (const s of LEGAL) {
      const lines = wrap(s.text, f.reg, 6.8, colW)
      const need = 10 + lines.length * 8.2 + 6
      if (y - need < colBottom) { if (x === L) { x = L + colW + 18; y = top } else { header(); top = y; x = L } }
      text(s.heading, x, y, { font: f.bold, size: 7.2 }); y -= 9.5
      lines.forEach(ln => { text(ln, x, y, { size: 6.8 }); y -= 8.2 })
      y -= 6
    }
  }

  // ---- page numbers ----
  const pages = pdf.getPages()
  pages.forEach((p, i) => { const s = `${i + 1}/${pages.length}`; p.drawText(s, { x: W / 2 - f.reg.widthOfTextAtSize(s, 6.5) / 2, y: 22, size: 6.5, font: f.reg, color: grey }) })
  return new Blob([await pdf.save()], { type: 'application/pdf' })
}
