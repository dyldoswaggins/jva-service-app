// Rolex IMMEDIATE PROCEED (Modern & Classic Watches Category, v1.2 EN), filled in on Rolex's own PDF so the format is exactly
// Rolex's (public/templates/rolex-immediate-proceed.pdf, from "SAV ALL - POST AUDIT NEW"). Signed at intake for every complete
// service (and Vintage, per Workflow v2.1). The form is flattened after filling, so it can't be edited.
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { conditionText } from '../rules.js'

// Rolex's official offers, exactly as in the form's list (also the CTR prices offered at intake)
export const ROLEX_CO_OFFERS = {
  'CO - MODERN $840': 840, 'CO - MODERN $980': 980, 'CO - MODERN $1,190': 1190,
  'CO - CLASSIC $1,250': 1250, 'CO - CLASSIC $1,530': 1530, 'CO - CLASSIC $1,810': 1810,
}
const money = n => '$' + Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dmy = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
// Split text over the form's two lines (each ~396 pt wide at 10 pt)
function twoLines(text, font, size = 9.5, width = 390) {
  const out = ['', '']; let i = 0
  for (const w of String(text || '').split(/\s+/).filter(Boolean)) {
    const t = out[i] ? out[i] + ' ' + w : w
    if (font.widthOfTextAtSize(t, size) > width && out[i]) { if (i === 1) { out[1] += '…'; break } i = 1; out[1] = w } else out[i] = t
  }
  return out
}

export async function makeImmediateProceedRolex({ job, client, requests = [], conditions = [], signaturePng, staffName, date = new Date(),
  offer, offerPrice, polish = false, polishPrice = 210, includeAllowance = false, vintageFee = null }) {
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
  const extra = requests.map(r => r.request || r).filter(r => !/^Perform complete overhaul$|^Do not refinish|^Refinish case and bracelet$/i.test(r))
  const dd = form.getDropdown('Dropdown1')
  if (offer && dd.getOptions().includes(offer)) { dd.select(offer); try { dd.setFontSize(10) } catch { /* keeps Rolex's setting */ } } else form.removeField(dd)
  const [i1, i2] = twoLines(vintageFee != null ? ['Rolex Vintage Analysis Fee $350 (analysis and estimate by Rolex)', ...extra].join(', ') : extra.join(', '), font)
  set('undefined', i1, 9.5); set('undefined_2', i2, 9.5)
  // Polish & satin-finishing (Optional) $210: Yes / No
  const yes = form.getCheckBox('Check Box4'), no = form.getCheckBox('Check Box5')
  if (vintageFee == null) { if (polish) yes.check(); else no.check() }
  // Watch conditions and client additional information
  const [c1, c2] = twoLines(conditions.length ? conditionText(conditions) : 'No visible marks noted.', font)
  set('undefined_3', c1, 9.5); set('undefined_4', c2, 9.5)
  // Total (tax excl.): set price + polish; optionally with the 15 % allowance the form permits
  const base = vintageFee != null ? Number(vintageFee) : (Number(offerPrice) || 0) + (polish ? Number(polishPrice) || 0 : 0)
  set('Dollar Amount', money(includeAllowance && vintageFee == null ? Math.round(base * 115) / 100 : base).replace('$', ''), 10)
  set('Date1', dmy(date)); set('Date2', dmy(date))
  set('Client Signature', ''); set('Retailer Signature', staffName ? `${staffName} · J. Vair Anderson` : '', 9)
  try { form.removeField(form.getButton('RESET FORM')) } catch { /* not present */ }

  form.updateFieldAppearances(font)
  // Client's signature drawn over the "Client signature" field (rect 153,102 206×30)
  if (signaturePng) {
    const img = await pdf.embedPng(signaturePng), page = pdf.getPage(0)
    const h = Math.min(28, (200 * img.height) / img.width)
    page.drawImage(img, { x: 156, y: 103, width: (img.width / img.height) * h, height: h })
  }
  form.flatten()
  return new Blob([await pdf.save()], { type: 'application/pdf' })
}
export const immediateProceedFileName = job => `JVA-${job.edge_no}-Immediate-Proceed.pdf`
