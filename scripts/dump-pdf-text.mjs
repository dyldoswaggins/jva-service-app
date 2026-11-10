// Print the text of a PDF, line by line per page (for reading Rolex/JVA forms).
// Usage: node scripts/dump-pdf-text.mjs "<file.pdf>"
import fs from 'node:fs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(process.argv[2])), verbosity: 0 }).promise
for (let n = 1; n <= pdf.numPages; n++) {
  const page = await pdf.getPage(n)
  const items = (await page.getTextContent()).items.filter(i => i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5] }))
  const rows = []
  for (const it of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const r = rows.find(r => Math.abs(r.y - it.y) < 2.5)
    if (r) r.t.push(it); else rows.push({ y: it.y, t: [it] })
  }
  console.log(`=== page ${n}`)
  for (const r of rows) console.log(r.t.sort((a, b) => a.x - b.x).map(i => i.s).join(' ').replace(/\s+/g, ' '))
  const fields = (await page.getAnnotations()).filter(a => a.fieldName).map(a => `${a.fieldType}:${a.fieldName}`)
  if (fields.length) console.log('fields:', fields.join(', '))
}
