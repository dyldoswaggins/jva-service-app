// Extract JVA's legal notices (two columns) into src/docs/legal-notices.json.
// Source of truth: page 2 of "Rolex Receipt (Modern & Classic) - Editable.pdf" (Alberta law, J. Vair Anderson Ltd.).
// (The 2025 SAV estimate/confirmation templates say "Ontario law in Toronto" and "J.Vair Anderson Canada Ltd." — not used.)
// Usage: node scripts/extract-legal-notices.mjs "<Rolex Receipt (Modern & Classic) - Editable.pdf>"
import fs from 'node:fs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

const HEADINGS = ['Client', 'Analysis and Service of a watch', 'Counterfeit and stolen watches/components', 'Jurisdiction and applicable law',
  'Validity of the quote', 'Delivery lead time', 'Unclaimed property', 'Loss or damage', 'Price of components and replaced parts',
  'Full Service only', 'Terms of payment']
const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(process.argv[2])), verbosity: 0 }).promise
const page = await pdf.getPage(2)
const items = (await page.getTextContent()).items.filter(i => i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5] }))
  .filter(i => i.y < 480 && i.y > 40)   // below the header, above the page number
const cols = [items.filter(i => i.x < 312), items.filter(i => i.x >= 312)]
const sections = []
for (const col of cols) {
  const rows = []
  for (const it of col.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const r = rows.find(r => Math.abs(r.y - it.y) < 2.5)
    if (r) r.t += ' ' + it.s; else rows.push({ y: it.y, t: it.s })
  }
  let cur = null
  for (const r of rows) {
    const t = r.t.replace(/\s+/g, ' ').trim()
    if (t === 'Legal Notices') continue
    if (HEADINGS.includes(t)) { cur = { heading: t, text: '' }; sections.push(cur); continue }
    if (cur) cur.text = (cur.text + ' ' + t).trim()
  }
}
const out = sections.map(s => ({ ...s, text: s.text.replace(/\s+([.,)])/g, '$1').replace(/- /g, '-').replace(/\s{2,}/g, ' ') }))
fs.writeFileSync(new URL('../src/docs/legal-notices.json', import.meta.url), JSON.stringify(out, null, 1))
console.log(out.map(s => `## ${s.heading}\n${s.text}`).join('\n\n'))
