// Envelope / job-bag tag (internal, never given to the client): job #, client name, intake date, watch.
// 4 × 2 in label (fits standard label printers; prints fine on a sheet too).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { watchLine } from '../rules.js'

export async function makeBagLabel({ job, clientName }) {
  const pdf = await PDFDocument.create()
  const W = 288, H = 144, page = pdf.addPage([W, H])
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const fit = (s, font, size, max) => { let t = String(s || ''); while (t && font.widthOfTextAtSize(t, size) > max) t = t.slice(0, -2) + '…'; return t }
  const d = new Date(job.intake_at || Date.now())
  const day = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  page.drawText('J. VAIR ANDERSON · ROLEX SERVICE', { x: 12, y: H - 20, size: 7, font: bold, color: rgb(0.45, 0.36, 0.2) })
  page.drawText(fit(job.edge_no, bold, 26, W - 24), { x: 12, y: H - 50, size: 26, font: bold })
  page.drawText(fit(clientName || '', reg, 13, W - 24), { x: 12, y: H - 72, size: 13, font: reg })
  page.drawText(fit(watchLine(job), reg, 9, W - 24), { x: 12, y: H - 90, size: 9, font: reg })
  page.drawText(fit(`Serial ${job.serial || '—'}`, reg, 9, W - 24), { x: 12, y: H - 103, size: 9, font: reg })
  page.drawText(`In ${day}`, { x: 12, y: 14, size: 9, font: bold })
  const tags = [job.classification, job.service_type === 'Vintage analysis' ? 'Rolex Toronto' : job.service_type === 'Engraving' ? 'Engraving · Rolex Toronto' : job.service_type].filter(Boolean).join(' · ')
  page.drawText(tags, { x: W - 12 - reg.widthOfTextAtSize(tags, 9), y: 14, size: 9, font: reg })
  page.drawRectangle({ x: 4, y: 4, width: W - 8, height: H - 8, borderWidth: 0.6, borderColor: rgb(0.6, 0.6, 0.6) })
  return new Blob([await pdf.save()], { type: 'application/pdf' })
}
