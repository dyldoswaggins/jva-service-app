// Printed Rolex TIMING ANALYSIS (Ref. E6220-11) from the watchmaker's entries: same fields and order as Rolex's paper form.
// Workshop + archive only.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { OBS, POSITIONS } from '../repairs/JobTiming.jsx'

export async function makeTimingSheet({ sheet: s }) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792])
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const L = 60, R = 552, black = rgb(0, 0, 0), grey = rgb(0.45, 0.45, 0.45)
  const t = (x, y, v, o = {}) => page.drawText(String(v ?? ''), { x, y, size: o.size || 10, font: o.font || reg, color: o.color || black })
  const box = (x, y, w, h) => page.drawRectangle({ x, y, width: w, height: h, borderWidth: 0.8, borderColor: black })
  const dmy = d => (d ? d.split('-').reverse().join('/') : '')
  t(L, 742, 'ROLEX', { font: bold, size: 16, color: rgb(0.1, 0.35, 0.2) }); t(390, 742, 'TIMING ANALYSIS', { size: 16, color: grey })
  // header
  let y = 690
  ;[[['Watchmaker:', s.watchmaker], ['Calibre:', s.calibre]], [['Repair number:', s.repair], ['Movement serial number:', s.movement_serial]], [['Case serial number:', s.case_serial], ['Case reference:', s.case_ref]]]
    .forEach(row => { box(L, y, R - L, 22); page.drawLine({ start: { x: 306, y }, end: { x: 306, y: y + 22 }, thickness: 0.8, color: black })
      row.forEach(([k, v], i) => { const x = i ? 312 : L + 6; t(x, y + 7, k, { font: bold, size: 9 }); t(x + bold.widthOfTextAtSize(k, 9) + 6, y + 7, v) }); y -= 22 })
  // positions
  y -= 20
  const cw = [92, 70, 84]
  for (const [side, x0] of [[0, L], [1, 312]]) {
    let x = x0; ['Position', side ? 'Rate at 0 hr' : 'Rate at 24 hr', 'Amplitude (°)'].forEach((h, i) => { box(x, y, cw[i], 22); t(x + 4, y + 8, h, { font: bold, size: 8.5 }); x += cw[i] })
    POSITIONS.forEach((p, r) => { let xx = x0; const yy = y - 22 * (r + 1); const v = s.pos[r] || {}
      ;[p, side ? v.r0 : v.r24, side ? v.a0 : v.a24].forEach((val, i) => { box(xx, yy, cw[i], 22); t(xx + 4, yy + 7, val, { size: i ? 11 : 8.5 }); xx += cw[i] }) })
  }
  y -= 22 * 6 + 14
  box(L, y, R - L, 22); t(L + 6, y + 12, '1st criterion:', { font: bold, size: 9 }); t(L + 6, y + 3, '(difference between minimum and maximum rate values)', { size: 7.5, color: grey }); t(R - 60, y + 7, s.c1 ?? '', { size: 12 })
  y -= 22; box(L, y, R - L, 22); t(L + 6, y + 12, '2nd criterion:', { font: bold, size: 9 }); t(L + 6, y + 3, '(average rate at 0 hr)', { size: 7.5, color: grey }); t(R - 60, y + 7, s.c2 ?? '', { size: 12 })
  // 4-day observation
  y -= 30; t(L, y, 'Observation for 4 days with case back tightened and locked', { font: bold, size: 10 }); y -= 26
  const ow = [40, 80, 60, 180, 66, 66]; let x = L
  ;['Day', 'Date', 'Time', 'Position', 'State', 'Difference'].forEach((h, i) => { box(x, y, ow[i], 22); t(x + 4, y + 8, h, { font: bold, size: 8.5 }); x += ow[i] })
  OBS.forEach((o, r) => { const v = s.obs[r] || {}; let xx = L; y -= 24
    ;[String(r), dmy(v.date), v.time, o, v.state, r ? v.diff : ''].forEach((val, i) => { box(xx, y, ow[i], 24); t(xx + 4, y + 8, val, { size: i === 3 ? 8.5 : 10 }); xx += ow[i] }) })
  y -= 26; box(L + 180, y, 312, 26); t(L + 186, y + 15, 'Actual daily rate:', { font: bold, size: 9 }); t(L + 186, y + 5, '(average difference)', { size: 7.5, color: grey }); t(R - 70, y + 9, `${s.daily ?? ''}  s/d`, { size: 11 })
  y -= 34; let xx = L; ;['4', dmy(s.pr?.date), s.pr?.time, 'Power reserve:', `${s.pr?.hours ?? ''}  hr`].forEach((val, i) => { const w = [40, 80, 60, 180, 132][i]; box(xx, y, w, 24); t(xx + 4, y + 8, val, { size: 10, font: i === 3 ? bold : reg }); xx += w })
  y -= 40; t(L, y, s.result === 'pass' ? 'PASSED' : s.result === 'fail' ? 'NOT PASSED' : '', { font: bold, size: 12, color: s.result === 'pass' ? rgb(0, 0.45, 0.15) : rgb(0.7, 0.1, 0.1) })
  t(L + 100, y, `${s.watchmaker || ''}${s.at ? ' · ' + new Date(s.at).toLocaleDateString('en-GB') : ''}`, { size: 10 })
  t(R - 70, 40, 'Ref. E6220-11', { size: 8, color: grey })
  return new Blob([await pdf.save()], { type: 'application/pdf' })
}
