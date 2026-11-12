// One harmonized layout for the four Rolex customer documents (Receipt, Estimate, Confirmation, Invoice),
// copying JVA's SAV templates (OneDrive › Rolex › 1. Service - Rolex › Rolex Service Documents › Rolex SAV Templates).
// Content grows with the information: text wraps and flows onto new pages — nothing is ever cut off.
// Required content: docs/rolex-customer-documents.md.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { braceletLine, dialLine, money, watchLine } from '../rules.js'
import LEGAL from './legal-notices.json'

const W = 612, H = 792, BOTTOM = 56
// Measured from JVA's SAV templates (Rolex Service Estimate / Confirmation / Invoice .pdf, and Rolex Service Receipt.pdf)
const VARIANTS = {
  standard: { L: 55, R: 562, FS: 9, titleSize: 14.7, valueX: 173, rowGap: 13.5, storeSize: 9, storeGap: 12, storeTop: 681, billX: 457, dateY: 610, titleY: 588, refTop: 557,
    store: ['J. Vair Jewellers', '409 - 3rd Street SW', 'T2P 4Z2, Calgary, AB', '(403) 266 1669'],
    labels: ['OUR REF #', 'WATCH', 'SERIAL #', 'BRACELET', 'DIAL'] },
  // Invoice template: same style, header block 57 pt lower
  get invoice() { return { ...this.standard, storeTop: 624, dateY: 553, titleY: 531, refTop: 500 } },
  receipt: { L: 81, R: 531, FS: 6.8, titleSize: 15.4, valueX: 170, rowGap: 9.3, storeSize: 5.2, storeGap: 9.3, storeTop: 626, billX: 394, dateY: 560, titleY: 525, refTop: 504,
    store: ['J.Vair Anderson Jewellers', '409 3rd Street SW', 'Calgary, Alberta, T2P 4Z2', '(403) 266 -1669'],
    labels: ['OUR REFERENCE N°', 'WATCH', 'SERIAL N°', 'BRACELET', 'DIAL'] },
}
const black = rgb(0, 0, 0), grey = rgb(0.35, 0.35, 0.35)

export async function buildDocument({ title, job, client = {}, date = new Date(), body, signaturePng, legal = true, variant = 'standard' }) {
  const V = VARIANTS[variant] || VARIANTS.standard
  const { L, R, FS } = V
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
  const dd = n => String(n).padStart(2, '0')
  const day = `${dd(date.getDate())}/${dd(date.getMonth() + 1)}/${date.getFullYear()}` // template: 04/02/2025
  const fields = {}

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
    V.store.forEach((s, i) => text(s, L, V.storeTop - i * V.storeGap, { font: i ? f.reg : f.bold, size: V.storeSize }))
    const billX = V.billX
    text('Bill to/Deliver to', billX, V.storeTop, { font: f.bold, size: FS })
    ;[client.name, client.address1, client.address2, client.address3].filter(Boolean).forEach((s, i) => text(s, billX, V.storeTop - FS - 5 - i * (FS + 3), { size: FS }))
    text(day, billX, V.dateY, { size: FS })
    text(title.toUpperCase(), L, V.titleY, { size: V.titleSize })
    const vals = [job.edge_no, watchLine(job), job.serial, braceletLine(job), dialLine(job)]
    V.labels.forEach((k, i) => { text(k, L, V.refTop - i * V.rowGap, { font: f.bold, size: FS }); text(vals[i], V.valueX, V.refTop - i * V.rowGap, { size: FS }) })
    y = V.refTop - V.labels.length * V.rowGap - 4
  }
  const ensure = h => { if (y - h < BOTTOM) header() }

  // ---- building blocks ----
  const pageNo = () => pdf.getPageCount() - 1
  const mark = (name, x, yy, extra = {}) => { fields[name] = { page: pageNo(), x, y: yy, ...extra } }
  const api = {
    fonts: f,
    gap(h = 8) { y -= h },
    newPage() { header() },
    // Heavy rule, bold heading (+ "MSRP CAD (TAX EXCL.)" on the right), as in the SAV templates
    section(heading, { rightHeading, middle } = {}) {
      ensure(40)
      rule(y, 1.1); y -= 13
      text(heading, L, y, { font: f.bold, size: FS })
      if (middle) text(middle, V.valueX, y, { font: f.bold, size: FS })
      if (rightHeading) right(rightHeading, R, y, { font: f.bold, size: FS })
      y -= 19
    },
    para(s, { size = FS, font = f.reg, indent = 0 } = {}) {
      for (const ln of wrap(s, font, size, R - L - indent)) { ensure(size * 1.3); text(ln, L + indent, y, { size, font }); y -= size * 1.27 }
    },
    bullets(list, o) { list.forEach(s => api.para(`- ${s}`, o)) },
    // { label, price, parts: ['24-704-0 crown with gasket 704 st'], subs: ['Clean case and bracelet'] }: "-" at 86, italic text at 92
    item({ label, price, parts = [], subs = [] }) {
      ensure(14 + (parts.length + subs.length) * 12)
      const lines = wrap(label, f.reg, FS, 360)
      lines.forEach((ln, i) => { text(ln, L, y, { size: FS }); if (i === 0 && price != null) right(typeof price === 'string' ? price : money(price), R, y, { size: FS }); y -= 12.5 })
      ;[...subs, ...parts].forEach(s => { wrap(s, f.ital, FS, R - L - 50).forEach((ln, i) => { ensure(12); if (!i) text('-', L + 31, y, { font: f.bold, size: FS }); text(ln, L + 37, y, { size: FS, font: f.ital }); y -= 12 }) })
    },
    totals(sub, { gst = 0.05 } = {}) {
      const tax = Math.round(sub * gst * 100) / 100
      ensure(64)
      y -= 10; rule(y, 1.1); y -= 15
      text('Services/Supplies Total', L, y, { size: FS }); right(money(sub), R, y, { size: FS }); y -= 7; rule(y, 0.6); y -= 11
      text(`GST ${Math.round(gst * 100)}%`, L, y, { size: FS }); right(money(tax), R, y, { size: FS }); y -= 6; rule(y, 0.6); y -= 10
      text('TOTAL CAD', L, y, { font: f.bold, size: FS }); right(money(sub + tax), R, y, { font: f.bold, size: FS }); y -= 5; rule(y, 1.1); y -= 20
      return { sub, tax, total: sub + tax }
    },
    row(label, value) {
      ensure(14)
      text(label, L, y, { font: f.bold, size: FS }); text(value, 173, y, { size: FS }); y -= 13.5
    },
    // Template box: square at x 78, italic caption at 92 (e.g. "Accepted"). name → fill-in spot for online signing
    box(caption = '', { name, checked = false } = {}) {
      ensure(18)
      page.drawRectangle({ x: L + 23, y: y - 1, width: 7.5, height: 7.5, borderWidth: 0.7, borderColor: black })
      if (name) mark(name, L + 24.2, y)
      if (checked) text('X', L + 24.2, y + 0.2, { font: f.bold, size: 7.5 })
      if (caption) text(caption, L + 37, y, { size: FS, font: f.ital })
      y -= 17.5
    },
    // Client's decision row: label + price, then "☐ Accepted" underneath (Rolex Service Estimate.pdf, page 2)
    decision(label, price, { name, checked } = {}) {
      ensure(36)
      text(label, L, y, { size: FS }); if (price != null) right(money(price), R, y, { size: FS }); y -= 18
      api.box('Accepted', { name, checked })
    },
    checkbox(label, { checked = false, price, name } = {}) {
      ensure(16)
      page.drawRectangle({ x: L, y: y - 1, width: 7.5, height: 7.5, borderWidth: 0.7, borderColor: black })
      if (name) mark(name, L + 1.2, y)
      if (checked) text('X', L + 1.2, y + 0.2, { font: f.bold, size: 7.5 })
      text(label, L + 14, y, { size: FS })
      if (price != null) right(money(price), R, y, { size: FS })
      y -= 15
    },
    // "I, the undersigned ____ , certify …" then DATE: (x 55) and SIGNATURE: (x 298), as in the template
    signature(statement, { name, signed = !!sig } = {}) {
      ensure(80)
      const [before, after] = statement.split('{name}')
      const blank = '___________________________'
      const who = name || blank
      const first = before + who + after
      const lines = wrap(first, f.reg, FS, R - L)
      if (!name) mark('undersigned', L + f.reg.widthOfTextAtSize(before, FS) + 2, y + 1.5, { w: f.reg.widthOfTextAtSize(blank, FS) })
      lines.forEach(ln => { ensure(12); text(ln, L, y, { size: FS }); y -= 11.5 })
      y -= 27
      text('DATE:', L, y, { size: FS }); text('SIGNATURE:', 298, y, { size: FS })
      if (signed) text(day, L + 36, y, { size: FS }); else mark('date', L + 36, y)
      if (sig && signed) { const w = 150, h = Math.min(36, (sig.height / sig.width) * w); page.drawImage(sig, { x: 356, y: y - 4, width: w, height: h }) }
      else mark('signature', 356, y - 4, { w: 180, h: 36 })
      y -= 24
    },
    // Remarks line (blank on the estimate; filled by online signing)
    remarks() { ensure(16); text('Remarks: _______________________________________________________________________________', L, y, { size: FS }); mark('remarks', L + 44, y + 1.5); y -= 21 },
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
  pages.forEach((p, i) => { const s = `${i + 1}/${pages.length}`; p.drawText(s, { x: 554, y: 11, size: 6, font: f.reg, color: grey }) })
  const blob = new Blob([await pdf.save()], { type: 'application/pdf' })
  blob.fields = fields // fill-in spots for online signing (page, x, y)
  return blob
}
