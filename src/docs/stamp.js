// Fill in the client's decision on the estimate itself (online signing), at the spots the estimate recorded
// when it was built (job_docs.fields: decision:<key>, refuse, undersigned, date, signature, remarks).
// The template stays exactly as printed; only the client's ticks, name, date, signature (and remarks) are added.
// A copy of this function lives in supabase/functions/sign/index.ts (Edge Functions can't import from src/) — keep them in step.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export async function stampEstimate(original, fields, { refused, chosen, name, sigPng, remarks, when = new Date(), dateText, audit }) {
  const pdf = await PDFDocument.load(original)
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const pages = pdf.getPages()
  const at = k => fields?.[k] && { ...fields[k], page: pages[fields[k].page] }
  const black = rgb(0, 0, 0), white = rgb(1, 1, 1), grey = rgb(0.35, 0.35, 0.35)
  const tick = k => { const f = at(k); if (f) f.page.drawText('X', { x: f.x, y: f.y + 0.2, size: 7.5, font: bold, color: black }) }
  if (refused) tick('refuse')
  else { tick('decision:necessary'); for (const k of chosen || []) tick(`decision:${k}`) }
  const u = at('undersigned')
  if (u) {
    u.page.drawRectangle({ x: u.x - 1, y: u.y - 2.5, width: u.w + 2, height: 11, color: white })
    u.page.drawText(name, { x: u.x + 2, y: u.y, size: 9, font: reg, color: black })
    u.page.drawLine({ start: { x: u.x, y: u.y - 2 }, end: { x: u.x + u.w, y: u.y - 2 }, thickness: 0.5, color: black })
  }
  const dd = n => String(n).padStart(2, '0')
  const d = at('date'); if (d) d.page.drawText(dateText || `${dd(when.getDate())}/${dd(when.getMonth() + 1)}/${when.getFullYear()}`, { x: d.x, y: d.y, size: 9, font: reg, color: black })
  const s = at('signature')
  if (s && sigPng) {
    const img = await pdf.embedPng(sigPng)
    const h = Math.min(s.h || 36, ((s.w || 180) * img.height) / img.width)
    s.page.drawImage(img, { x: s.x, y: s.y, width: (img.width / img.height) * h, height: h })
  }
  const r = at('remarks'); if (r && remarks) r.page.drawText(String(remarks).slice(0, 110), { x: r.x + 2, y: r.y + 1, size: 8.5, font: reg, color: black })
  if (audit && (d || s)) (d || s).page.drawText(audit, { x: 55, y: 28, size: 6, font: reg, color: grey })
  return await pdf.save()
}
