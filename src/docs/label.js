// Envelope / job-bag label (internal, never given to the client).
// Half a letter sheet (Richard, 2026-11-27): a letter page with the label in the top half (8.5 × 5.5 in) and a dashed cut line,
// so it prints the same size on any printer. Job #, client, watch, serial, then Services and Customer requests
// (everything is shown: text shrinks to fit the label), intake date, class · service, estimated weeks.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { watchLine } from '../rules.js'
import { NOTES_PREFIX } from './immediateProceed.js'

const money = n => '$' + Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\.00$/, '')

function wrap(text, font, size, width) {
  const out = []; let line = ''
  for (let w of String(text || '').split(/\s+/).filter(Boolean)) {
    while (font.widthOfTextAtSize(w, size) > width) {
      let k = w.length - 1
      while (k > 1 && font.widthOfTextAtSize(w.slice(0, k), size) > width) k--
      if (line) { out.push(line); line = '' }
      out.push(w.slice(0, k)); w = w.slice(k)
    }
    const t = line ? line + ' ' + w : w
    if (font.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = w } else line = t
  }
  if (line) out.push(line)
  return out
}

// What was booked at intake, in plain words (from the job; parts only when given — they aren't saved on the job)
export function labelServices(job, parts = []) {
  const s = []
  if (job.service_type === 'Engraving') s.push('Engraving by Rolex (Toronto)')
  else if (job.classification === 'Vintage') {
    if (Number(job.vintage_fee) > 0) s.push(`Rolex Vintage Analysis Fee ${money(job.vintage_fee)}`)
  } else if (job.ctr_tier) s.push(`Complete overhaul · ${job.ctr_tier.replace(/^CO - /, '').replace(/ \$.*/, '').toLowerCase().replace(/^./, c => c.toUpperCase())}${job.ctr_price ? ` ${money(job.ctr_price)}` : ''}`)
  else if (job.service_type) s.push(job.service_type)
  if (job.polish) s.push(`Refinish case and bracelet${Number(job.polish_price) ? ` ${money(job.polish_price)}` : ''}`)
  for (const p of parts) s.push(`${p.label}${Number(p.price) ? ` ${money(p.price)}` : ''}`)
  return s
}

export async function makeBagLabel({ job, clientName, requests, parts = [] }) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792])
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const gold = rgb(0.45, 0.36, 0.2), grey = rgb(0.6, 0.6, 0.6)
  // Label area: top half of the sheet, 0.3 in in from the edges
  const X0 = 22, X1 = 590, TOP = 770, BOT = 418, W = X1 - X0
  const fit = (s, font, size, max) => { let t = String(s || ''); while (t && font.widthOfTextAtSize(t, size) > max) t = t.slice(0, -2) + '…'; return t }
  const d = new Date(job.intake_at || Date.now())
  const day = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`

  page.drawRectangle({ x: X0, y: BOT, width: W, height: TOP - BOT, borderWidth: 0.8, borderColor: grey })
  const L = X0 + 18, R = X1 - 18, IW = R - L
  page.drawText('J. VAIR ANDERSON · ROLEX SERVICE', { x: L, y: TOP - 26, size: 9, font: bold, color: gold })
  page.drawText(fit(job.edge_no, bold, 40, IW / 2), { x: L, y: TOP - 68, size: 40, font: bold })
  // Right of the job #: client, watch, serial
  const RX = L + IW / 2 + 10, RW = R - RX
  page.drawText(fit(clientName || '', bold, 15, RW), { x: RX, y: TOP - 44, size: 15, font: bold })
  page.drawText(fit(watchLine(job), reg, 11, RW), { x: RX, y: TOP - 61, size: 11, font: reg })
  page.drawText(fit(`Serial ${job.serial || '—'}`, reg, 11, RW), { x: RX, y: TOP - 76, size: 11, font: reg })
  page.drawLine({ start: { x: L, y: TOP - 90 }, end: { x: R, y: TOP - 90 }, thickness: 0.6, color: grey })

  // Services (left) and Customer requests (right), shrinking until everything fits above the footer
  const reqs = (requests || job.job_requests || []).map(r => (r.request || r) + (r.note && !String(r.request || '').startsWith(NOTES_PREFIX) && !/overhaul/i.test(r.request || '') ? ` (${r.note})` : ''))
  const notes = reqs.filter(r => r.startsWith(NOTES_PREFIX))
  const cols = [['Services', labelServices(job, parts)], ['Customer requests', [...reqs.filter(r => !r.startsWith(NOTES_PREFIX)), ...notes]]]
  const colW = (IW - 20) / 2, top = TOP - 110, floor = BOT + 40
  let size = 11, laid
  for (; ; size -= 0.5) {
    laid = cols.map(([, items]) => items.map(t => wrap(t, reg, size, colW - 10)))
    const h = Math.max(...laid.map(c => c.reduce((s, l) => s + l.length * size * 1.25 + 2, 0)))
    if (top - 16 - h >= floor || size <= 5) break
  }
  cols.forEach(([title, items], i) => {
    const x = L + i * (colW + 20)
    page.drawText(title.toUpperCase(), { x, y: top, size: 8.5, font: bold, color: gold })
    let y = top - 16
    if (!items.length) page.drawText('—', { x, y, size, font: reg })
    laid[i].forEach(lines => {
      page.drawText('•', { x, y, size, font: reg })
      for (const t of lines) { page.drawText(t, { x: x + 10, y, size, font: reg }); y -= size * 1.25 }
      y -= 2
    })
  })

  // Footer: intake date, estimated weeks, class · service
  page.drawText(`In ${day}${job.lead_time ? `   ·   ${job.lead_time}` : ''}`, { x: L, y: BOT + 16, size: 11, font: bold })
  const tags = [job.classification, job.service_type === 'Vintage analysis' ? 'Rolex Toronto' : job.service_type === 'Engraving' ? 'Engraving · Rolex Toronto' : job.service_type].filter(Boolean).join(' · ')
  page.drawText(tags, { x: R - reg.widthOfTextAtSize(tags, 11), y: BOT + 16, size: 11, font: reg })

  // Cut line across the middle of the sheet
  for (let x = 10; x < 602; x += 8) page.drawLine({ start: { x, y: 396 }, end: { x: x + 4, y: 396 }, thickness: 0.5, color: grey })
  page.drawText('cut here', { x: 10, y: 386, size: 7, font: reg, color: grey })
  return new Blob([await pdf.save()], { type: 'application/pdf' })
}
