// Pick list (internal, never given to the client): every part on the job with Rolex #, description, quantity, stock and Lista
// location, in stock vs to order, MRWS # and boxes to tick when picked. Replaces the parts table on the paper Service Overview.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { locStr, watchLine } from '../rules.js'

export async function makePickList({ job, lines, allParts }) {
  const pdf = await PDFDocument.create()
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const W = 612, H = 792, L = 40, R = 572
  let page, y
  const fit = (s, f, size, max) => { let t = String(s ?? ''); while (t && f.widthOfTextAtSize(t, size) > max) t = t.slice(0, -2) + '…'; return t }
  const cols = [['', 16], ['Rolex #', 70], ['Description', 190], ['Qty', 30], ['Stock', 38], ['Location', 70], ['Supply', 52], ['MRWS', 34], ['Picked', 40]]
  const head = () => {
    page = pdf.addPage([W, H]); y = H - 44
    page.drawText(`PICK LIST · Job ${job.edge_no}`, { x: L, y, size: 15, font: bold }); y -= 16
    page.drawText(fit(`${watchLine(job)} · serial ${job.serial || '—'} · calibre ${job.calibre || '—'}${job.mrws_ref ? ` · MRWS # ${job.mrws_ref}` : ''}`, reg, 9, R - L), { x: L, y, size: 9, font: reg }); y -= 22
    let x = L; for (const [h, w] of cols) { page.drawText(h, { x, y, size: 8, font: bold }); x += w } y -= 5
    page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.8, color: rgb(0, 0, 0) }); y -= 13
  }
  head()
  for (const l of lines) {
    if (y < 50) head()
    const p = allParts.get(l.part_id) || {}
    const stock = p.qty ?? 0, supply = l.supply || (stock >= l.qty ? 'stock' : 'order')
    const vals = ['☐', l.rmc, p.name || '', String(l.qty), String(stock), locStr(p) || '', supply === 'order' ? 'ORDER' : 'In stock', l.ordered_at ? 'yes' : '', l.picked_at ? 'yes' : '']
    let x = L
    cols.forEach(([, w], i) => {
      if (i === 0) page.drawRectangle({ x, y: y - 1, width: 8, height: 8, borderWidth: 0.7, borderColor: rgb(0, 0, 0) })
      else page.drawText(fit(vals[i], i === 1 ? bold : reg, 8.5, w - 4), { x, y, size: 8.5, font: i === 1 ? bold : reg, color: i === 6 && supply === 'order' ? rgb(0.7, 0.1, 0.1) : rgb(0, 0, 0) })
      x += w
    })
    y -= 15
  }
  y -= 10
  page.drawText(`${lines.length} lines · ${lines.reduce((s, l) => s + l.qty, 0)} units · printed ${new Date().toLocaleString('en-CA')}`, { x: L, y, size: 8, font: reg, color: rgb(0.35, 0.35, 0.35) })
  return new Blob([await pdf.save()], { type: 'application/pdf' })
}
