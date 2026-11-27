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
  // JVA's post-audit receipt "Rolex Receipt (Modern & Classic) - Editable.pdf" (Rolex › 1. Service - Rolex › … › SAV ALL - POST AUDIT NEW),
  // measured 2026-11-25 (Richard). Also used for the Vintage Analysis Fee form, so both look the same.
  receipt: { L: 103.4, R: 509.5, FS: 8.14, lineRatio: 1.2, titleSize: 13.28, valueX: 212, rowGap: 10.1, storeSize: 8.14,
    storeYs: [596, 584, 574.3, 564.5], storeTop: 596, billX: 418.3, billSize: 7.42, billYs: [584, 574, 564, 554], dateY: 540, titleY: 523.5, refTop: 510.5,
    refTopNoTitle: 539.6, headRule: 9, afterHeadRule: 13.4, secHead: 8.8, secAfter: 14, sigX: 316.3, sigGap: 23.6, sigRule: 5,
    logo: { file: '/templates/jva-logo-2026.pdf', box: { left: 200, bottom: 660, right: 415, top: 725 } },
    pageNo: { x: 507, y: 68.5, size: 4 }, bottom: 74,
    legal: { title: 11.86, titleGap: 18, rightUp: 20, head: 6.58, body: 5.86, lineH: 7.5, headGap: 8.3, paraGap: 9.7, colGap: 13 },
    store: ['J. Vair Jewellers', '409 - 3rd Street SW', 'T2P 4Z2, Calgary, AB', '(403) 266 1669'],
    labels: ['OUR REF #', 'WATCH', 'SERIAL #', 'BRACELET', 'DIAL'] },
  // SAV invoice (Rolex SAV page, post-audit "All" template): same as the receipt, header block 58 pt lower (Richard, 2026-11-26)
  get savInvoice() {
    const r = this.receipt, d = 58
    return { ...r, storeYs: r.storeYs.map(v => v - d), storeTop: r.storeTop - d, billYs: r.billYs.map(v => v - d), dateY: r.dateY - d, titleY: r.titleY - d, refTop: r.refTop - d }
  },
}
// Bill to/Deliver to lines from the client details (postal code has its own field since 2026-11-25; address3 on older jobs)
export const billLines = (c = {}) => [c.name, c.address1, c.address2, c.postal_code || c.address3].filter(Boolean)
const black = rgb(0, 0, 0), grey = rgb(0.35, 0.35, 0.35)

// titleText: the title exactly as printed (default: title in capitals). bill: lines under "Bill to/Deliver to" (default from the client).
// footer: one centred line at the bottom of every page.
export async function buildDocument({ title, job, client = {}, date = new Date(), body, signaturePng, legal = true, variant = 'standard', titleText, bill, footer, showDate, legalRefs = true }) {
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
  // J.VAIR "Jewellers since 1925" logo, taken from JVA's blank receipt template (the post-audit receipt has the colour emblem)
  const LOGO = V.logo || { file: '/templates/jva-receipt.pdf', box: { left: 180, bottom: 700, right: 380, top: 770 }, at: { x: (W - 180) / 2, y: H - 92, width: 180, height: 63 } }
  const tpl = await PDFDocument.load(await fetch(LOGO.file).then(r => r.arrayBuffer()))
  const logo = await pdf.embedPage(tpl.getPage(0), LOGO.box)
  const logoAt = LOGO.at || { x: LOGO.box.left, y: LOGO.box.bottom, width: LOGO.box.right - LOGO.box.left, height: LOGO.box.top - LOGO.box.bottom }
  const lineH = size => size * (V.lineRatio || 1.27)
  const billText = bill || billLines(client)
  const sig = signaturePng ? await pdf.embedPng(signaturePng) : null
  const dd = n => String(n).padStart(2, '0')
  const day = `${dd(date.getDate())}/${dd(date.getMonth() + 1)}/${date.getFullYear()}` // template: 04/02/2025
  const fields = {}

  let page, y, topY
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

  // noTitle: the legal-notices page repeats the header without the title (as in the post-audit receipt)
  // noRefs: SAV legal-notices page — store and Bill to only, then the rule (no date, no watch block)
  function header({ noTitle = false, noRefs = false } = {}) {
    page = pdf.addPage([W, H])
    page.drawPage(logo, logoAt)
    V.store.forEach((s, i) => text(s, L, V.storeYs ? V.storeYs[i] : V.storeTop - i * V.storeGap, { font: i ? f.reg : f.bold, size: V.storeSize }))
    const billX = V.billX
    text('Bill to/Deliver to', billX, V.storeTop, { font: f.bold, size: FS })
    billText.forEach((s, i) => text(s, billX, V.billYs ? (V.billYs[i] ?? V.billYs[V.billYs.length - 1] - (i - V.billYs.length + 1) * 10) : V.storeTop - FS - 5 - i * (FS + 3), { size: V.billSize || FS }))
    if ((showDate ?? !bill) && !noRefs) text(day, billX, V.dateY, { size: V.billSize || FS })
    if (noRefs) {
      const by = (V.billYs ? V.billYs[V.billYs.length - 1] - Math.max(0, billText.length - V.billYs.length) * 10 : V.storeTop - 40) - 14
      page.drawLine({ start: { x: L - 1.6, y: by }, end: { x: R + 0.8, y: by }, thickness: 0.8, color: black })
      y = topY = by - (V.afterHeadRule || 12)
      return
    }
    const top = noTitle && V.refTopNoTitle ? V.refTopNoTitle : V.refTop
    if (!(noTitle && V.refTopNoTitle)) text(titleText || title.toUpperCase(), L, V.titleY, { size: V.titleSize })
    const vals = [job.edge_no, watchLine(job), job.serial, braceletLine(job), dialLine(job)]
    V.labels.forEach((k, i) => { text(k, L, top - i * V.rowGap, { font: f.bold, size: FS }); text(vals[i], V.valueX, top - i * V.rowGap, { size: FS }) })
    const last = top - (V.labels.length - 1) * V.rowGap
    if (V.headRule) { page.drawLine({ start: { x: L - 1.6, y: last - V.headRule }, end: { x: R + 0.8, y: last - V.headRule }, thickness: 0.8, color: black }); y = last - V.headRule - V.afterHeadRule }
    else y = V.refTop - V.labels.length * V.rowGap - 4
    topY = y
  }
  const ensure = h => { if (y - h < (V.bottom || BOTTOM)) header() }

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
      if (V.headRule && y === topY) y += V.afterHeadRule - (V.secHead || 13) // right under the header rule: no second rule
      else rule(y, V.headRule ? 0.8 : 1.1)
      y -= V.secHead || 13
      text(heading, L, y, { font: f.bold, size: FS })
      if (middle) text(middle, V.valueX, y, { font: f.bold, size: FS })
      if (rightHeading) right(rightHeading, R, y, { font: f.bold, size: FS })
      y -= V.secAfter || 19
    },
    para(s, { size = FS, font = f.reg, indent = 0 } = {}) {
      for (const ln of wrap(s, font, size, R - L - indent)) { ensure(size * 1.3); text(ln, L + indent, y, { size, font }); y -= lineH(size) }
    },
    // Boxes on one line after their captions (Vintage form: "I accept the analysis fee ☐   I decline the analysis fee ☐")
    inlineBoxes(list) {
      ensure(18)
      let x = L + 24
      for (const { label, name, checked } of list) {
        text(label, x, y, { size: FS }); x += f.reg.widthOfTextAtSize(label, FS) + 5
        page.drawRectangle({ x, y: y - 1.5, width: 9, height: 9, borderWidth: 0.7, borderColor: black })
        if (name) mark(name, x + 2, y)
        if (checked) text('X', x + 2, y + 0.2, { font: f.bold, size: 8 })
        x += 60
      }
      y -= lineH(FS) + 5
    },
    bullets(list, o) { list.forEach(s => api.para(`- ${s}`, o)) },
    // A plain rule across the page (SAV: above Remarks and above the signature statement)
    line(after = 11) { ensure(20); rule(y, 0.8); y -= after },
    // Paragraph mixing regular and bold runs: [['Kindly return … at '], ['email', true], [' so that …']]
    rich(runs, { size = FS } = {}) {
      const words = runs.flatMap(([t, b]) => String(t).split(/(?<= )/).filter(Boolean).map(w => ({ w, font: b ? f.bold : f.reg })))
      let line = [], width = 0
      const flush = () => { ensure(size * 1.3); let x = L; for (const p of line) { text(p.w, x, y, { size, font: p.font }); x += p.font.widthOfTextAtSize(p.w, size) } y -= lineH(size); line = []; width = 0 }
      for (const p of words) { const wd = p.font.widthOfTextAtSize(p.w, size); if (width + wd > R - L && line.length) flush(); line.push(p); width += wd }
      if (line.length) flush()
    },
    // SAV line: service on the left, price on the right (none when 0 / not set), detail in italics underneath
    savItem({ label, price, detail, italic = false, gap = 6 }) {
      ensure(14 + (detail ? 12 : 0))
      const font = italic ? f.ital : f.reg
      wrap(label, font, FS, 380).forEach((ln, i) => { text(ln, L, y, { size: FS, font }); if (!i && Number(price)) right(money(price), R, y, { size: FS }); y -= lineH(FS) + 1 })
      if (detail) wrap(detail, f.ital, FS * 0.92, R - L - 90).forEach(ln => { ensure(12); text(ln, L, y, { size: FS * 0.92, font: f.ital }); y -= lineH(FS * 0.92) })
      y -= gap
    },
    // SAV client's decision row: ☐ at L+15, caption at L+42, price on the right. small: the option rows (italic, smaller)
    savBox(caption, price, { name, checked = false, small = false } = {}) {
      ensure(18)
      page.drawRectangle({ x: L + 15, y: y - 1, width: 7.5, height: 7.5, borderWidth: 0.7, borderColor: black, borderRadius: 1 })
      if (name) mark(name, L + 16.2, y)
      if (checked) text('X', L + 16.2, y + 0.2, { font: f.bold, size: 7.5 })
      text(caption, L + 42, y, { size: small ? FS * 0.8 : FS, font: small ? f.ital : f.reg })
      if (price != null) right(money(price), R, y, { size: FS })
      y -= small ? 14 : 18
    },
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
      ensure(V.lineRatio ? 56 : 80)
      const [before, after] = statement.split('{name}')
      const blank = '___________________________'
      const who = name || blank
      const first = before + who + after
      const lines = wrap(first, f.reg, FS, R - L)
      if (!name) mark('undersigned', L + f.reg.widthOfTextAtSize(before, FS) + 2, y + 1.5, { w: f.reg.widthOfTextAtSize(blank, FS) })
      const gap = V.lineRatio ? lineH(FS) : 11.5
      lines.forEach(ln => { ensure(12); text(ln, L, y, { size: FS }); y -= gap })
      // Room above the DATE / SIGNATURE line for a larger signature (Richard, 2026-11-27)
      y -= (V.sigGap ? V.sigGap - gap : 27) + 12
      const sx = V.sigX || 298
      text('DATE:', L, y, { size: FS }); text('SIGNATURE:', sx, y, { size: FS })
      if (signed) text(day, L + 36, y, { size: FS }); else mark('date', L + 36, y)
      // The signature (trimmed to its ink by SignaturePad) starts right after "SIGNATURE:" and sits on the line, up to 32 pt tall
      const vx = sx + f.reg.widthOfTextAtSize('SIGNATURE:', FS) + 8, maxW = R - vx, SIG_H = 32
      if (sig && signed) { const h = Math.min(SIG_H, (sig.height / sig.width) * maxW); page.drawImage(sig, { x: vx, y: y - 3, width: (sig.width / sig.height) * h, height: h }) }
      else mark('signature', vx, y - 3, { w: maxW, h: SIG_H })
      if (!(sig && signed)) mark('audit', L, V.pageNo ? V.pageNo.y - 24 : 28) // e-signature trail line, clear of the footer
      if (V.sigRule) rule(y - V.sigRule, 0.8)
      y -= 24
    },
    // Remarks line (blank on the estimate; filled by online signing). italic: "Remarks:" in italics with space under it (Vintage form)
    remarks({ italic = false } = {}) {
      ensure(16)
      if (italic) { text('Remarks:', L, y, { size: FS, font: f.ital }); mark('remarks', L + 40, y); y -= 26; return }
      text('Remarks: _______________________________________________________________________________', L, y, { size: FS }); mark('remarks', L + 44, y + 1.5); y -= 21
    },
  }

  header()
  await body(api)

  // ---- legal notices (JVA, Alberta) in two columns ----
  if (legal) {
    const G = V.legal || { title: 9, titleGap: 14, head: 7.2, body: 6.8, lineH: 8.2, headGap: 9.5, paraGap: 6, colGap: 18 }
    header({ noTitle: true, noRefs: !legalRefs })
    if (!V.headRule) { rule(y, 1.1); y -= 12 } else y -= 2
    text('Legal Notices', L, y, { font: f.bold, size: G.title }); y -= G.titleGap
    const colW = (R - L - G.colGap) / 2
    let x = L, top = y
    const colBottom = V.bottom || BOTTOM
    for (const s of LEGAL) {
      const lines = wrap(s.text, f.reg, G.body, colW)
      const need = G.headGap + lines.length * G.lineH
      if (y - need < colBottom) { if (x === L) { x = L + colW + G.colGap; y = top + (G.rightUp || 0) } else { header({ noTitle: true, noRefs: !legalRefs }); top = y; x = L } }
      text(s.heading, x, y, { font: f.bold, size: G.head }); y -= G.headGap
      lines.forEach(ln => { text(ln, x, y, { size: G.body }); y -= G.lineH })
      y -= G.paraGap
    }
  }

  // ---- page numbers (+ footer line) ----
  const pages = pdf.getPages()
  const PN = V.pageNo || { x: 554, y: 11, size: 6 }
  pages.forEach((p, i) => {
    p.drawText(`${i + 1}/${pages.length}`, { x: PN.x, y: PN.y, size: PN.size, font: f.reg, color: grey })
    if (footer) p.drawText(footer, { x: (W - f.reg.widthOfTextAtSize(footer, 7)) / 2, y: 26, size: 7, font: f.reg, color: grey })
  })
  const blob = new Blob([await pdf.save()], { type: 'application/pdf' })
  blob.fields = fields // fill-in spots for online signing (page, x, y)
  return blob
}
