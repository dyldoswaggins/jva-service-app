// Check the invoice reader against every PDF in a folder.
// Usage: node scripts/test-invoices.mjs "<folder with ROLP invoice PDFs>"
import fs from 'node:fs'
import path from 'node:path'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parsePages } from '../src/invoice.js'

const dir = process.argv[2]
let ok = 0, bad = 0
const refs = {}
for (const f of fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf'))) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(dir, f))), verbosity: 0 }).promise
  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent()
    pages.push(tc.items.map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5] })))
  }
  // compare with the invoice's printed total quantity
  const all = pages.flat().map(i => i.s.trim()).filter(Boolean)
  const tqi = all.findIndex(s => /^Total quantity/i.test(s))
  const printedQty = tqi >= 0 ? Number(all.slice(tqi + 1).find(s => /^[\d,]+\.\d{2}$/.test(s))?.replace(/,/g, '')) : NaN
  const r = parsePages(pages)
  const sumQty = r.lines.reduce((s, l) => s + l.qty, 0)
  const good = r.invoiceNo && r.date && r.lines.length && Math.abs(sumQty - printedQty) < 0.001
  good ? ok++ : bad++
  console.log(`${good ? 'OK ' : 'BAD'} ${r.invoiceNo || '?'} ${r.date || '?'} pages=${pdf.numPages} lines=${r.lines.length} qty=${sumQty}/${printedQty}`)
  for (const l of r.lines) {
    refs[l.ref.slice(0, 3)] = (refs[l.ref.slice(0, 3)] || 0) + 1
    if (!good || process.argv[3] === '-v') console.log(`     [${l.custRef}] ${l.ref} | ${l.desc} | ${l.qty} ${l.uom} @ ${l.unitPrice} = ${l.amount}`)
  }
}
console.log(`\n${ok} read correctly, ${bad} need a look. Ref prefixes:`, JSON.stringify(refs))
