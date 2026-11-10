// Business rules — the ONE place for parts maths, order limits, matching and formatting.
// Pages import from here; never repeat these rules elsewhere (CLAUDE.md §2).

export const CATS = {
  Case: ['Crown', 'Crystals', 'Gaskets', 'Bezels', 'Case backs', 'Pushers', 'Screws', 'TBD'],
  Bracelet: ['Spring bars', 'Links', 'Clasps', 'Screws', 'Bracelets', 'Straps', 'TBD'],
  Movement: ['15xx', '20xx', '21xx', '22xx', '30xx', '31xx', '32xx', '41xx', 'Interchangeable', 'TBD'],
  Display: ['Hands', 'Dials', 'Screws'],
}
export const CAT_ORDER = Object.keys(CATS)
export const PACKS = [1, 5, 10, 20, 25, 50, 100]

// Rolex order limits per job
export const ORDER_LIMIT = { A: 25, B: 5, C: 1 }
export const orderClassText = abc =>
  abc === 'A' ? 'up to 25 per job' : abc === 'B' ? 'up to 5 per job' : abc === 'C' ? '1 only per job' : ''

// EDGE usage window Jan 2025 – Oct 2026
export const USAGE_MONTHS = 22

// ---------- ids ----------
export const partId = rmc => 'p_' + String(rmc).replace(/[^A-Za-z0-9_\-.~:@+]/g, '_')
export const modelId = ref => 'm_' + String(ref).toUpperCase().replace(/[^A-Z0-9]/g, '')

// ---------- invoices ----------
// The 11.5 stock confirmation already counts everything received up to this date:
// invoices dated on or before it update cost only, never stock.
export const STOCK_BASELINE_DATE = '2026-11-05'
export const invoiceCanAddStock = isoDate => !!isoDate && isoDate > STOCK_BASELINE_DATE

// Strip packaging codes: B3135-5100-G100 → 3135-5100 ×100 units; V14-601 → 14-601 ×1
export function splitRef(ref) {
  let s = String(ref || '').replace(/\s+/g, '').toUpperCase(), pack = 1
  if (/^B(?=\d)/.test(s)) {
    s = s.slice(1)
    const m = s.match(/^(.*)-([A-Z])(\d+)$/)
    if (m) { s = m[1]; pack = Number(m[3]) || 1 }
  } else if (/^V(?=\d)/.test(s)) s = s.slice(1)
  return { rmc: s, pack }
}
// Not parts: M = watches, E = tools / service cards, RP / IMR = promo
export const isSkippedRef = ref => /^(M\d|E\d|E-|RP[-\d]|IMR[-\d])/i.test(String(ref || '').trim())

// Best guess for a part that isn't in the list yet (staff check it afterwards)
export function guessCat(rmc, desc) {
  const t = String(desc || '').toUpperCase()
  if (rmc.startsWith('13/') || /\bDIAL\b/.test(t)) return ['Display', 'Dials', '']
  if (/^(14|15|410|41S)-/.test(rmc) || /\bHAND/.test(t)) return ['Display', 'Hands', '']
  if (/^20-/.test(rmc)) return ['Bracelet', 'Bracelets', '']
  if (/^21\d-/.test(rmc) || /\bSTRAP\b|\bSTR\b/.test(t)) return ['Bracelet', 'Straps', '']
  if (/^(23|32)-/.test(rmc))
    return ['Bracelet', /CLASP/.test(t) ? 'Clasps' : /\bSCREW|\bSCR\b/.test(t) ? 'Screws' : /SPRING ?BAR|\bBAR\b/.test(t) ? 'Spring bars' : /LINK/.test(t) ? 'Links' : 'TBD', '']
  if (/\bSCREW|\bSCR\b/.test(t) && /^(24|25|29|31\d)-/.test(rmc)) return ['Case', 'Screws', '']
  if (rmc.startsWith('29-') || (rmc.startsWith('316-') && /GASKET|GSK/.test(t))) return ['Case', 'Gaskets', '']
  if (rmc.startsWith('25')) return ['Case', 'Crystals', '']
  if (/^24-P/.test(rmc) || /PUSHER/.test(t)) return ['Case', 'Pushers', '']
  if (rmc.startsWith('24-')) return ['Case', 'Crown', '']
  if (rmc.startsWith('311-') || /CASE BACK/.test(t)) return ['Case', 'Case backs', '']
  if (/^(313|315|317)-/.test(rmc) || /BEZEL|INSERT/.test(t)) return ['Case', 'Bezels', '']
  if (/^(316|319)-/.test(rmc)) return ['Case', 'Gaskets', '']
  const MV = ['15xx', '20xx', '21xx', '22xx', '30xx', '31xx', '32xx', '41xx']
  const m = rmc.match(/^(\d{4})-/)
  if (m && MV.includes(m[1].slice(0, 2) + 'xx')) return ['Movement', m[1].slice(0, 2) + 'xx', m[1]]
  const c = t.match(/\b(15|20|21|22|30|31|32|41)\d\d\b/)
  if (c) return ['Movement', c[1] + 'xx', c[0]]
  return ['Movement', 'Interchangeable', '']
}
export function guessAbc(desc) {
  const t = String(desc || '').toUpperCase()
  if (/SCREW|GASKET|GSK|SPRING ?BAR|\bBAR\b/.test(t)) return 'A'
  if (/\bDIAL\b|BRACELET|CASE BACK|BEZEL|CERAMIC|\b18 ?[YWP]G?\b|RL18/.test(t)) return 'C'
  return 'B'
}

// ---------- stock ----------
export const isCounted = p => typeof p.qty === 'number'

// Units per pack: stored `pack`, else from a B…-XY ref (Y = units)
export function packOf(p) {
  if (typeof p.pack === 'number' && p.pack > 0) return p.pack
  for (const r of String(p.edge_refs || '').split(/,\s*/)) {
    const m = r.trim().toUpperCase().match(/^B.*-([A-Z])(\d+)$/)
    if (m) return Number(m[2]) || 1
  }
  return 1
}
// Packs of 5+ are reordered in whole packs
export const bigPack = p => { const k = packOf(p); return k >= 5 ? k : 0 }

// About two months' cover from past use, at least 1 if used
export const suggestedMin = p => (p.used ? Math.max(1, Math.ceil((p.used / USAGE_MONTHS) * 2)) : 0)
export const minIsSet = p => typeof p.min === 'number'
export function minOf(p) {
  const m = minIsSet(p) ? p.min : suggestedMin(p)
  const k = bigPack(p)
  return k && m > 0 ? Math.ceil(m / k) * k : m
}
export const isLow = p => isCounted(p) && minOf(p) > 0 && p.qty <= minOf(p)

export function reorderList(parts) {
  return parts
    .filter(p => !p.archived && isLow(p))
    .map(p => {
      const k = bigPack(p)
      const short = Math.max(1, minOf(p) - p.qty)
      return { p, need: k ? Math.ceil(short / k) * k : short, packs: k ? Math.ceil(short / k) : 0 }
    })
    .sort((a, b) => 'ABC'.indexOf(a.p.abc || 'B') - 'ABC'.indexOf(b.p.abc || 'B') || (b.p.used || 0) - (a.p.used || 0))
}

export const locStr = p =>
  [p.lcab && 'C' + p.lcab, p.ldrw && 'D' + p.ldrw, p.ltab && 'T' + p.ltab].filter(Boolean).join('·')

export function sortParts(list) {
  return list.sort(
    (a, b) =>
      CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat) ||
      (CATS[a.cat] || []).indexOf(a.sub) - (CATS[b.cat] || []).indexOf(b.sub) ||
      String(a.cal || '').localeCompare(String(b.cal || '')) ||
      String(a.rmc).localeCompare(String(b.rmc), undefined, { numeric: true })
  )
}

// ---------- models ----------
const digits = x => String(x || '').replace(/\D/g, '')
export const fitsOf = p => String(p.fits || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean)
export const calsOf = m => String(m.cal || '').split(/[,;/\s]+/).map(x => x.trim()).filter(Boolean)

// A part fits a model when its `fits` contains the ref (digits match) OR its calibre is one of the model's
export function fitsModel(p, m) {
  const d = digits(m.ref)
  return (d.length >= 4 && fitsOf(p).some(f => digits(f) === d)) || (!!p.cal && calsOf(m).includes(p.cal))
}
export function modelsMatching(models, q) {
  q = String(q || '').trim().toLowerCase()
  if (q.length < 3) return []
  const qd = digits(q)
  return models.filter(
    m =>
      (qd.length >= 4 && qd === q.replace(/[^0-9]/g, '') && digits(m.ref).startsWith(qd)) ||
      String(m.ref).toLowerCase() === q ||
      (/[a-z]/.test(q) && String(m.name || '').toLowerCase().includes(q))
  )
}
export const addFit = (p, ref) => {
  ref = String(ref || '').trim().toUpperCase()
  if (!ref || fitsOf(p).some(f => digits(f) && digits(f) === digits(ref))) return null
  return fitsOf(p).concat(ref).join(', ')
}

// ---------- formatting ----------
export const money = n =>
  '$' + (Number(n) || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const num = n => (Number(n) || 0).toLocaleString('en-CA')
export const fmtTime = t =>
  t ? new Date(t).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
export const fmtDate = d =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : ''

// CSV that opens cleanly in Excel
export function toCsv(rows) {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const cell = v => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  return '﻿' + [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n')
}
export function download(name, text, type = 'text/csv') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
