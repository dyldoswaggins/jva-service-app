// Rolex Canada ENGRAVING REQUEST FORM (Feb 2017), filled in on Rolex's own PDF (public/templates/rolex-engraving.pdf, from
// OneDrive › Rolex › 1. Service - Rolex › Rolex - Other Documents › Rolex Engraving Form). Positions measured from the form.
// Engraving requests go straight to Rolex Toronto (Dylan, 2026-11-12).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export const ENGRAVING_FONTS = ['Times New Roman', 'Helvetica', 'Commercial Script']
export const ENGRAVING_CASES = ['Sentence case', 'lowercase', 'UPPERCASE', 'Capitalize Each Word']
const FONT_Y = { 'Times New Roman': 337, Helvetica: 309, 'Commercial Script': 282 }
const CASE_Y = { 'Sentence case': 337, lowercase: 309, UPPERCASE: 282, 'Capitalize Each Word': 255 }

export async function makeEngravingForm({ job, client, engraving, staffName, date = new Date() }) {
  const pdf = await PDFDocument.load(await fetch('/templates/rolex-engraving.pdf').then(r => r.arrayBuffer()))
  const page = pdf.getPage(0)
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.05, 0.1, 0.35)
  const t = (s, x, y, size = 10, font = reg) => s && page.drawText(String(s), { x, y, size, font, color: ink })
  const ref = String(job.watch_ref || '').trim().toUpperCase()
  t('J. Vair Anderson', 345, 674); t(job.edge_no, 345, 646); t(client?.name || '', 345, 618)
  t(job.serial, 140, 548); t(ref ? (ref.startsWith('M') ? ref : 'M' + ref) : '', 375, 548)
  t(job.watch_name, 150, 520); t(job.dial, 150, 493); t([job.bracelet_ref, job.bracelet].filter(Boolean).join(' '), 150, 466)
  // Engraving text (left column, under ENGRAVING INSTRUCTIONS), wrapped
  let y = 396
  const lines = String(engraving.text || '').split(/\n/)
  for (const raw of lines) {
    let cur = ''
    for (const w of raw.split(' ')) { const s = cur ? cur + ' ' + w : w; if (bold.widthOfTextAtSize(s, 11) > 240 && cur) { t(cur, 68, y, 11, bold); y -= 15; cur = w } else cur = s }
    t(cur, 68, y, 11, bold); y -= 15
    if (y < 250) break
  }
  if (engraving.position) { y -= 4; for (const ln of [`Position: ${engraving.position}`]) { t(ln, 68, y, 9); y -= 12 } }
  if (engraving.note) t(engraving.note, 68, Math.max(y - 2, 236), 8.5)
  // Ticks
  if (FONT_Y[engraving.font]) t('X', 327.5, FONT_Y[engraving.font] + 0.5, 10, bold)
  if (CASE_Y[engraving.case]) t('X', 437.5, CASE_Y[engraving.case] + 0.5, 10, bold)
  // "Authorized By" is signed by hand (the form says "Please sign"); the date is filled in
  void staffName
  t(`${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`, 432, 149, 10)
  return new Blob([await pdf.save()], { type: 'application/pdf' })
}
export const engravingFileName = job => `JVA-${job.edge_no}-Rolex-Engraving-Request.pdf`
