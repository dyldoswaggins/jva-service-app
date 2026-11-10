// Reads a Rolex Canada (ROLP) sales invoice PDF into header + lines.
// Pure layout parsing, no AI. Works in the browser and in Node (scripts/test-invoices.mjs).
import { splitRef, isSkippedRef, partId } from './rules.js'

const NUM = /^-?[\d,]+\.\d{2}$/
const toNum = s => Number(String(s).replace(/,/g, ''))
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december']

// "June 4, 2026" → "2026-06-04"
export function isoDate(s) {
  const m = String(s || '').trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/)
  if (!m) return null
  const mo = MONTHS.indexOf(m[1].toLowerCase())
  return mo < 0 ? null : `${m[3]}-${String(mo + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

// items: [{ s, x, y }] for one page (PDF coordinates, y grows upward)
function rowsOf(items) {
  const rows = []
  for (const it of items) {
    if (!it.s || !it.s.trim()) continue
    let r = rows.find(r => Math.abs(r.y - it.y) < 3)
    if (!r) rows.push((r = { y: it.y, cells: [] }))
    r.cells.push({ x: it.x, y: it.y, s: it.s.trim() })
  }
  rows.forEach(r => r.cells.sort((a, b) => a.x - b.x))
  return rows.sort((a, b) => b.y - a.y)
}

function below(cells, anchor, re, maxGap = 22) {
  return cells
    .filter(c => c.y < anchor.y && anchor.y - c.y <= maxGap && re.test(c.s))
    .sort((a, b) => b.y - a.y)[0]
}

export function parsePages(pages) {
  const head = { invoiceNo: '', date: null, dateText: '', docType: 'invoice' }
  const lines = []
  for (const items of pages) {
    const rows = rowsOf(items)
    const cells = rows.flatMap(r => r.cells)
    if (cells.some(c => /packing\s*list|bordereau|delivery\s*note|bon de livraison/i.test(c.s))) head.docType = 'packing_list'
    if (!head.invoiceNo) {
      const a = cells.find(c => /^(Invoice( \/ Facture)?|Packing list|Delivery( note)?)( (No\.?|number|#))?$/i.test(c.s))
      const n = a && below(cells, a, /^[A-Z0-9-]{6,}$/i)
      if (n) head.invoiceNo = n.s
    }
    if (!head.date) {
      const a = cells.find(c => /^(Invoice|Delivery|Shipping|Packing list) date|^Date\b/i.test(c.s))
      const d = a && below(cells, a, /^[A-Za-z]+\s+\d{1,2},\s*\d{4}$/)
      if (d) { head.dateText = d.s; head.date = isoDate(d.s) }
    }
    const hi = rows.findIndex(r => r.cells.some(c => /^Item number/i.test(c.s)))
    if (hi < 0) continue
    const itemX = rows[hi].cells.find(c => /^Item number/i.test(c.s)).x
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i]
      const text = r.cells.map(c => c.s).join(' ')
      if (/Total before taxes|^Subtotal|^GST|Shipping\/Ins|Page \d+ of/i.test(text)) break
      if (/^(Quantity|Quantité|Unit|Unité|Montant|Amount|Description|Prix|Numero d'article|Item number)/i.test(text)) continue
      if (/Numero d'article|Quantité Unité|Prix unitaire/i.test(text)) continue // repeated page header
      const custRef = r.cells.filter(c => c.x < itemX - 1).map(c => c.s).join(' ')
      const rest = r.cells.filter(c => c.x >= itemX - 1).map(c => c.s).join(' ')
      const m = rest.match(/^(\S+)\s+(.*?)\s*(-?[\d,]+\.\d{2})\s+([A-Z]{2,4})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})$/)
      if (m) {
        lines.push({ custRef, ref: m[1], desc: m[2].trim(), qty: toNum(m[3]), uom: m[4], unitPrice: toNum(m[5]), amount: toNum(m[6]) })
      } else if (lines.length && !r.cells.some(c => NUM.test(c.s))) {
        lines[lines.length - 1].desc += ' ' + rest // wrapped description
      }
    }
  }
  return { ...head, lines }
}

// Turn parsed lines into import lines matched to the parts list
export function toImportLines(parsed, partsById) {
  return parsed.lines.map(l => {
    const { rmc, pack } = splitRef(l.ref)
    const id = partId(rmc)
    const skipped = isSkippedRef(l.ref)
    const unitCost = l.unitPrice > 0 ? Math.round((l.unitPrice / pack) * 10000) / 10000 : null
    return {
      ...l, rmc, id, pack, units: Math.round(l.qty * pack), unitCost, packPrice: l.unitPrice > 0 ? l.unitPrice : null,
      match: partsById.has(id), skipped,
      // default: include real part lines; skip watches/tools/promo and no-charge lines
      include: !skipped && l.qty > 0 && l.unitPrice > 0,
    }
  })
}

// Browser: read a File with pdf.js
export async function readInvoiceFile(file) {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent()
    pages.push(tc.items.map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5] })))
  }
  return parsePages(pages)
}
