// Rolex IMMEDIATE PROCEED (Modern & Classic Watches Category, v1.2 EN), filled in on Rolex's own PDF so the format is exactly
// Rolex's (public/templates/rolex-immediate-proceed.pdf, from "SAV ALL - POST AUDIT NEW"). Filled and signed at every Modern,
// Classic and Vintage intake (Richard, 2026-11-25). The form is flattened after filling, so it can't be edited.
// retailerSigPng: the Sales associate's drawn signature on "Retailer signature". Without a client signature (the client signs
// by email link) the PDF records where the signature and date go (blob.fields), like the receipt.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { conditionText } from '../rules.js'

// Rolex's official offers, exactly as in the form's list (also the CTR prices offered at intake)
// Customer request line that carries the associate's intake notes
export const NOTES_PREFIX = 'Notes: '

export const ROLEX_CO_OFFERS = {
  'CO - MODERN $840': 840, 'CO - MODERN $980': 980, 'CO - MODERN $1,190': 1190,
  'CO - CLASSIC $1,250': 1250, 'CO - CLASSIC $1,530': 1530, 'CO - CLASSIC $1,810': 1810,
}
const money = n => '$' + Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dmy = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
// Wrap text to a width, nothing dropped (a word longer than the line is split)
function wrap(text, font, size, width = 390) {
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
// Everything gathered at intake must show (Richard, 2026-11-27). Each section has two 21 pt lines on Rolex's form (field
// bottoms in ys). Try the two lines at 9.5 → 7.5 pt, then two rows per line (four rows) at 7 → 6 pt; if it still doesn't fit,
// the rows end with "continued on page 2" and the full text is printed on a page added after the form.
function fitSection(text, font, ys) {
  for (const size of [9.5, 9, 8.5, 8, 7.5]) {
    const l = wrap(text, font, size); if (l.length <= 2) return { size, rows: l.map((t, i) => ({ t, y: ys[i] + 6 })) }
  }
  const rowY = [ys[0] + 12, ys[0] + 3.5, ys[1] + 12, ys[1] + 3.5]
  for (const size of [7, 6.5, 6]) {
    const l = wrap(text, font, size); if (l.length <= 4) return { size, rows: l.map((t, i) => ({ t, y: rowY[i] })) }
  }
  const more = ' … continued on page 2'
  const l = wrap(text, font, 6, 390 - font.widthOfTextAtSize(more, 6))
  return { size: 6, more: true, rows: [...l.slice(0, 3), l[3] + more].map((t, i) => ({ t, y: rowY[i] })) }
}

export async function makeImmediateProceedRolex({ job, client, requests = [], conditions = [], signaturePng, staffName, date = new Date(),
  offer, offerPrice, polish = false, polishPrice = 210, includeAllowance = false, vintageFee = null, retailerSigPng = null, parts = [] }) {
  // parts: [{ label, price }] typed by the rep at intake (Richard, 2026-11-27): written in the interventions and added to the total
  const bytes = await fetch('/templates/rolex-immediate-proceed.pdf').then(r => r.arrayBuffer())
  const pdf = await PDFDocument.load(bytes)
  const form = pdf.getForm()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page0 = pdf.getPage(0)
  // Fill a field; fields Rolex left without a font setting are typed straight onto the page at the field's spot instead
  const set = (name, v, size = 10) => {
    const f = form.getTextField(name)
    if (!f.acroField.getDefaultAppearance()) f.acroField.setDefaultAppearance(`/Helv ${size} Tf 0 g`) // Rolex left a few fields without one
    f.setFontSize(size); f.setText(String(v ?? ''))
  }
  const ref = String(job.watch_ref || '').trim().toUpperCase()

  set('Retailer Name', 'J. Vair Anderson')
  set('Retailer Ref', job.edge_no)
  set('Client Name', client?.name || '')
  set('Serial N', job.serial || 'N/A')
  set('Model N', ref ? (ref.startsWith('M') ? ref : 'M' + ref) : 'N/A')

  // Interventions: the Rolex offer (list) + the client's other requests (two lines)
  const all = requests.map(r => r.request || r)
  const notes = all.filter(r => r.startsWith(NOTES_PREFIX)).map(r => r.slice(NOTES_PREFIX.length))
  const extra = all.filter(r => !r.startsWith(NOTES_PREFIX) && !/^Perform complete overhaul$|^Do not refinish|^Refinish case and bracelet$/i.test(r))
  const dd = form.getDropdown('Dropdown1')
  if (offer && dd.getOptions().includes(offer)) { dd.select(offer); try { dd.setFontSize(10) } catch { /* keeps Rolex's setting */ } } else form.removeField(dd)
  const partText = parts.map(p => `${p.label}${Number(p.price) ? ` ${money(p.price).replace('.00', '')}` : ''}`)
  const interventions = [...(Number(vintageFee) > 0 ? [`Rolex Vintage Analysis Fee ${money(vintageFee).replace('.00', '')} (analysis and estimate by Rolex)`] : []), ...extra, ...partText].join(', ')
  set('undefined', ''); set('undefined_2', '')
  // Polish & satin-finishing (Optional): Yes when chosen, No otherwise, for every class (Richard, 2026-11-27)
  const yes = form.getCheckBox('Check Box4'), no = form.getCheckBox('Check Box5')
  if (polish) yes.check(); else no.check()
  // Watch conditions and client additional information
  // Conditions, then the associate's notes (Richard, 2026-11-25): own line when both fit, else run on over the two lines
  const cond = conditions.length ? conditionText(conditions) : 'No visible marks noted.'
  const condOwn = notes.length > 0
  const condText = [cond, ...notes].join(' · ')
  set('undefined_3', ''); set('undefined_4', '')
  // Total (tax excl.): set price + polish; optionally with the 15 % allowance the form permits
  const base = (vintageFee != null ? Number(vintageFee) : Number(offerPrice) || 0) + (polish ? Number(polishPrice) || 0 : 0) +
    parts.reduce((s, p) => s + (Number(p.price) || 0), 0)
  set('Dollar Amount', money(includeAllowance && vintageFee == null ? Math.round(base * 115) / 100 : base).replace('$', ''), 10)
  set('Date1', signaturePng ? dmy(date) : ''); set('Date2', dmy(date))
  set('Client Signature', ''); set('Retailer Signature', retailerSigPng ? '' : staffName ? `${staffName} · J. Vair Anderson` : '', 9)
  try { form.removeField(form.getButton('RESET FORM')) } catch { /* not present */ }

  form.updateFieldAppearances(font)
  // Client's signature drawn over the "Client signature" field (rect 153,102 206×30)
  const drawSig = async (png, y) => {
    const img = await pdf.embedPng(png)
    const h = Math.min(28, (200 * img.height) / img.width)
    page0.drawImage(img, { x: 156, y, width: (img.width / img.height) * h, height: h })
  }
  if (signaturePng) await drawSig(signaturePng, 103)
  // Associate's signature over "Retailer signature" (rect 153,65 206×30), their name small underneath
  if (retailerSigPng) {
    await drawSig(retailerSigPng, 66)
    if (staffName) page0.drawText(`${staffName} · J. Vair Anderson`, { x: 156, y: 58, size: 6.5, font })
  }
  // Vintage: Rolex's form prints $210 (Modern & Classic polishing); the Vintage price replaces it (Richard, 2026-11-27).
  // "$210" ends at x 431.1 on the line at y 368.3 (measured from Rolex's PDF).
  if (vintageFee != null && Number(polishPrice) && Number(polishPrice) !== 210) {
    page0.drawRectangle({ x: 410.6, y: 366, width: 22, height: 10.5, color: rgb(1, 1, 1) })
    page0.drawText(money(polishPrice).replace('.00', ''), { x: 411.1, y: 368.3, size: 9, font, color: rgb(0.35, 0.35, 0.35) })
  }
  form.flatten()
  // Interventions (lines at y 409 / 387): drawn so all of it fits (see fitSection)
  const sections = []
  if (interventions) {
    const fit = fitSection(interventions, font, [409, 387])
    for (const r of fit.rows) page0.drawText(r.t, { x: 146, y: r.y, size: fit.size, font, color: rgb(0, 0, 0) })
    if (fit.more) sections.push(['Interventions and Spare Parts requested by Client', interventions])
  }
  // Watch conditions (Richard, 2026-11-27): four dotted lines instead of Rolex's two, in the same space (Rolex's lines at
  // y 321.7 / 299.6 and their bullets are covered; the title sits at 345.7, "IMMEDIATE PROCEED" from about y 281).
  // Same line style as Rolex's (#404040, 0.48 pt, dots 0.48 / 0.96). Conditions first, notes on their own line when they fit.
  {
    const lineY = [331.5, 316.5, 301.5, 286.5], X = 144, LEN = 395.88
    page0.drawRectangle({ x: 125, y: 284.5, width: 420, height: 57.5, color: rgb(1, 1, 1) })
    for (const y of lineY) {
      page0.drawLine({ start: { x: X, y }, end: { x: X + LEN, y }, thickness: 0.48, color: rgb(0.25, 0.25, 0.25), dashArray: [0.48, 0.96] })
      page0.drawText('•', { x: 131, y: y + 2.5, size: 9.5, font, color: rgb(0.25, 0.25, 0.25) })
    }
    let size = null, rows = null
    for (const s of [9.5, 9, 8.5, 8, 7.5, 7]) {
      const own = condOwn ? [...wrap(cond, font, s), ...wrap(notes.join(' · '), font, s)] : null
      const run = wrap(condText, font, s)
      rows = own && own.length <= 4 ? own : run.length <= 4 ? run : null
      if (rows) { size = s; break }
    }
    if (!rows) {
      const more = ' … continued on page 2'
      const l = wrap(condText, font, 7, 390 - font.widthOfTextAtSize(more, 7))
      rows = [...l.slice(0, 3), l[3] + more]; size = 7
      sections.push(['Watch Conditions and Client additional information', condText])
    }
    rows.forEach((t, i) => page0.drawText(t, { x: 146, y: lineY[i] + 2.5, size, font, color: rgb(0, 0, 0) }))
  }
  if (sections.length) {
    const p = pdf.insertPage(1, [612, 792]), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    let y = 720
    p.drawText('IMMEDIATE PROCEED – continued from page 1', { x: 75, y, size: 11, font: bold }); y -= 18
    p.drawText(`Retailer Ref. N°: ${job.edge_no || ''}    Model N°: ${ref ? (ref.startsWith('M') ? ref : 'M' + ref) : 'N/A'}    Serial N°: ${job.serial || 'N/A'}`, { x: 75, y, size: 9.5, font }); y -= 30
    for (const [title, text] of sections) {
      p.drawText(title, { x: 75, y, size: 10, font: bold }); y -= 16
      for (const t of wrap(text, font, 10, 462)) { p.drawText(t, { x: 75, y, size: 10, font }); y -= 14 }
      y -= 16
    }
  }
  const blob = new Blob([await pdf.save()], { type: 'application/pdf' })
  if (!signaturePng) blob.fields = { signature: { page: 0, x: 156, y: 103, w: 200, h: 28 }, date: { page: 0, x: 416, y: 112 }, audit: { page: 0, x: 75, y: 14 } }
  return blob
}
export const immediateProceedFileName = job => `JVA-${job.edge_no}-Immediate-Proceed.pdf`
