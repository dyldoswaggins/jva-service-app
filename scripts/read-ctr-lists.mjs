// Read Jared's calibre lists (OneDrive › Rolex Service › Watchmaking (Jared's Documents) › Calibre Inventory)
// into CTR kit rows, matched to the parts list. Used by import-ctr-kits.mjs and for checking.
// Usage (check only): node scripts/read-ctr-lists.mjs "<Calibre Inventory folder>"
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'

const FILES = { '21xx': '21XX.xlsx', '22xx': '22XX.xlsx', '31xx': '31XX.xlsx', '32xx': '32XX.xlsx', '41xx': 'Oyster Inventory.xlsx' }
const STATUS = { 'always change': 'always_change', 'always order': 'always_order', 'often changed': 'often_changed', 'systematic upgrade': 'upgrade', 'keep stock': 'keep_stock' }
const cell = v => (v && typeof v === 'object' ? v.result ?? v.text ?? v.richText?.map(t => t.text).join('') ?? '' : v ?? '')

// "Only for 3186/87" → ['3186','3187'];  "Only for 3136/55/56/87" → 3136,3155,3156,3187
export function onlyFor(note) {
  const m = String(note || '').match(/only\s+for\s+([\d/ ,]+)/i)
  if (!m) return []
  const parts = m[1].split(/[/, ]+/).filter(Boolean)
  const base = parts[0]
  return parts.map(p => (p.length >= base.length ? p : base.slice(0, base.length - p.length) + p))
}

export async function readLists(dir) {
  const rows = []
  for (const [family, file] of Object.entries(FILES)) {
    const f = path.join(dir, file)
    if (!fs.existsSync(f)) continue
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(f)
    const ws = wb.worksheets[0]
    let hdr = null
    ws.eachRow(r => {
      const v = r.values.slice(1).map(cell)
      if (!hdr) { if (v.some(c => /part number/i.test(String(c)))) hdr = v.map(c => String(c).trim().toLowerCase()); return }
      const get = name => v[hdr.indexOf(name)]
      const ref = String(get('part number') ?? '').trim()
      const status = STATUS[String(get('status') ?? '').trim().toLowerCase()]
      if (!ref || !status) return
      const note = String(get('special notes') ?? '').trim()
      rows.push({
        family, rmc: ref.replace(/^[BV](?=\d)/i, '').toUpperCase(), status,
        qty: Number(get('quantity')) || 1, retail: Number(String(get('price') ?? '').replace(/[^\d.]/g, '')) || null,
        note, only_for: onlyFor(note), stock_amounts: String(get('stock amounts') ?? ''), open_box: String(get('open box') ?? ''),
      })
    })
  }
  // A part listed twice in one list (e.g. 21XX 2130-429): keep one, preferring the line with a note
  const out = new Map()
  for (const r of rows) {
    const k = r.family + '|' + r.rmc
    if (!out.has(k) || (!out.get(k).note && r.note)) out.set(k, r)
  }
  return [...out.values()]
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = await readLists(process.argv[2])
  const parts = JSON.parse(fs.readFileSync(new URL('../data/parts.json', import.meta.url)))
  const byRmc = new Map(parts.map(p => [String(p.rmc).toUpperCase(), p]))
  const miss = rows.filter(r => !byRmc.has(r.rmc))
  const byFam = {}
  rows.forEach(r => { byFam[r.family] = byFam[r.family] || {}; byFam[r.family][r.status] = (byFam[r.family][r.status] || 0) + 1 })
  console.log('rows', rows.length, JSON.stringify(byFam))
  console.log('not in parts list:', miss.length, miss.map(r => `${r.family}:${r.rmc}(${r.status})`).join(' '))
  console.log('only_for examples:', rows.filter(r => r.only_for.length).map(r => `${r.rmc}→${r.only_for.join('/')}`).join(' '))
  const screws = rows.filter(r => /screw/i.test(r.note) || /screw/i.test(byRmc.get(r.rmc)?.name || ''))
  console.log('screws:', screws.length, screws.map(r => `${r.family}:${r.rmc}×${r.qty}(${r.status})`).join(' '))
}
