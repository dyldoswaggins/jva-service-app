// Read a Rolex World Service Canada document (Estimate / Confirmation / Invoice PDF from Rolex Toronto) into structured data.
// Rolex's PDFs carry real text, so this runs locally (no AI service; the client name on Rolex's "Your reference" is never kept).
// Tested against Rolex's documents in OneDrive › Rolex › 1. Service - Rolex › 3. ROLEX RECEIVING INVOICES (scripts/test-rolex-import.mjs).

const MONEY = /([\d,]+\.\d{2})/
const num = s => (s == null ? null : Number(String(s).replace(/,/g, '')))
const HEADER = [/^ROLEX CANADA LTD\.?$/, /^50 ST\. CLAIR AVENUE/i, /^TORONTO, ON/i, /^CANADA$/, /^ROLEX WORLD SERVICE/, /^T\. \+1/, /^on\.rolex\.com\/service/,
  /^For more information on Rolex servicing/, /^\d+ \/ \d+$/, /^(Estimate|Confirmation|Invoice|Delivery note) n[°o]/i, /^Serial number /, /^Your reference /]
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 }

// pages: array of arrays of text lines (top to bottom), as produced by pdfLines()
export function parseRolexDoc(pages) {
  const all = pages.flat().map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const find = re => { for (const l of all) { const m = l.match(re); if (m) return m } return null }
  const out = { kind: null, number: null, service_no: null, version: null, date: null, watch: null, serial: null, bracelet: null, dial: null, job_ref: null,
    requests: '', analysis: '', necessary: [], optional: [], notes: [], weeks: null, delivery_mode: null, shipping: null, totals: {}, warnings: [] }

  const no = find(/^(Estimate|Confirmation|Invoice) n[°o]\s*([0-9]{10})(?:[_/ ]+([0-9]+))?/i)
  if (no) { out.kind = no[1].toLowerCase(); out.service_no = no[2]; out.version = no[3] || null; out.number = no[3] ? `${no[2]}_${no[3]}` : no[2] }
  const dt = find(/^Toronto, ([A-Za-z]+) (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})/)
  if (dt && MONTHS[dt[1].toLowerCase()]) out.date = `${dt[3]}-${String(MONTHS[dt[1].toLowerCase()]).padStart(2, '0')}-${dt[2].padStart(2, '0')}`
  out.watch = find(/^Watch (.+)$/)?.[1] || null
  out.serial = find(/^Serial number (\S+)/)?.[1] || null
  out.bracelet = find(/^Bracelet (\S.*)$/)?.[1] || null
  out.dial = find(/^Dial (\S.*)$/)?.[1] || null
  out.job_ref = find(/^Your reference\s+([0-9]{4,7}(?:-[0-9]{3})?)/)?.[1] || null   // JVA job # only — the client name after "/" is dropped
  const wk = find(/approximately (\d+)(?:\s*(?:to|-)\s*(\d+))? weeks/i); if (wk) out.weeks = Number(wk[2] || wk[1])
  out.delivery_mode = find(/^Delivery mode:\s*(.+)$/i)?.[1] || null

  // Body = all lines minus the repeated page header. Watch / bracelet / dial header lines are removed by exact value, so the
  // "Watch analysis" heading and analysis text such as "Bracelet is stretched" stay.
  const headerLines = new Set([`Watch ${out.watch}`, `Bracelet ${out.bracelet}`, `Dial ${out.dial}`, 'Dial', 'Bracelet', 'Watch'])
  const body = all.filter(l => !HEADER.some(re => re.test(l)) && !headerLines.has(l))
  const idx = re => body.findIndex(l => re.test(l))
  const between = (a, stops) => {
    const s = idx(a); if (s < 0) return []
    const rest = body.slice(s + 1); const e = rest.findIndex(l => stops.some(re => re.test(l)))
    return e < 0 ? rest : rest.slice(0, e)
  }
  const STOP_SECTION = [/^Watch analysis$/i, /^Necessary works/i, /^Option\(s\)/i, /^Notes$/i, /^Kindly return/i, /^Customer'?s decision/i, /^Services? provided/i]
  out.requests = between(/^Customer requests$/i, STOP_SECTION).join(' ')
  out.analysis = between(/^Watch analysis$/i, STOP_SECTION).join(' ')

  // Line items: "Label 1,530.00 1,430.00" (max public price, invoiced price); then "- part" lines or plain sub-lines
  const blockTotals = {}
  const items = (start, key) => {
    const s = idx(start); if (s < 0) return []
    const list = []
    for (let i = s + 1; i < body.length; i++) {
      const l = body[i]
      if (/^\(CAD\)$/.test(l)) continue
      const t = l.match(/^Service\/Supplies Total\s+([\d,]+\.\d{2})(?:\s+([\d,]+\.\d{2}))?/i)
      if (t && key) blockTotals[key] = { public: num(t[1]), invoiced: num(t[2] ?? t[1]) }
      if (/^Service\/Supplies Total/i.test(l) || STOP_SECTION.some(re => re.test(l)) || /^Shipping Costs/i.test(l) || /^(GST|HST|PST|QST)/.test(l) || /^Total /.test(l)) break
      const m = l.match(/^(.*?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/) || l.match(/^(.*?)\s+([\d,]+\.\d{2})$/)
      if (m && m[1]) {
        const footnote = /⁽[^⁾]*⁾|\(\d\)$/.test(m[1])   // Rolex's "⁽¹⁾" = "(1) In case of refusal, the service warranty will not be delivered in its entirety."
        list.push({ label: m[1].replace(/\s*⁽[^⁾]*⁾|\s*\(\d\)$/g, '').replace(/^-+\s*|\s*-+$/g, '').trim(), price: num(m[2]), invoiced: num(m[3] ?? m[2]), parts: [], subs: [], footnote })
      } else if (/^- /.test(l) && list.length) list[list.length - 1].parts.push(l.slice(2).trim())
      else if (list.length && !/[\d,]+\.\d{2}/.test(l) && list[list.length - 1].label !== l && /^(Clean|Do not|Refinish|Polish)/i.test(l)) list[list.length - 1].subs.push(l)
      else if (l && !/[\d,]+\.\d{2}/.test(l)) list.push({ label: l, price: null, invoiced: null, parts: [], subs: [], footnote: false }) // e.g. "Test Water resistance"
    }
    return list
  }
  out.necessary = items(/^Necessary works/i, 'necessary')
  out.optional = items(/^Option\(s\)\s+Max/i, 'optional')
  if (!out.necessary.length && out.kind !== 'estimate') out.necessary = items(/^Services? provided/i, 'necessary')

  // Totals per block + shipping (what Rolex charges JVA for transport)
  const ship = find(/^Shipping Costs\s+([\d,]+\.\d{2})/i); if (ship) out.shipping = num(ship[1])
  out.totals = blockTotals

  // Notes (estimate): text after "Notes" up to the return / decision block, without Rolex-only instructions
  const n = between(/^Notes$/i, [/^Kindly return/i, /^Customer'?s decision/i, /^Legal Notices/i])
  const paras = []; let cur = ''
  for (const l of n) { cur = cur ? `${cur} ${l}` : l; if (/[.)]$/.test(l)) { paras.push(cur); cur = '' } }
  if (cur) paras.push(cur)
  out.notes = [...new Set(paras.map(p => p.trim()))].filter(p => p && !/service\.canada@rolex\.com/i.test(p))

  if (!out.kind) out.warnings.push('Not recognised as a Rolex estimate, confirmation or invoice')
  if (out.kind === 'estimate' && !out.necessary.length && !out.optional.length) out.warnings.push('No work found')
  for (const k of ['necessary', 'optional']) {
    const sum = out[k].reduce((s, l) => s + (l.price || 0), 0), t = out.totals[k]?.public
    if (t != null && Math.abs(sum - t) > 0.02) out.warnings.push(`${k} lines add up to ${sum.toFixed(2)}, Rolex total ${t.toFixed(2)}`)
  }
  return out
}

// Text lines per page from a PDF (pdf.js); same grouping as scripts/dump-pdf-text.mjs
export async function pdfLines(pdfjs, data) {
  const pdf = await pdfjs.getDocument({ data, verbosity: 0 }).promise
  const pages = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const items = (await (await pdf.getPage(n)).getTextContent()).items.filter(i => i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5] }))
    const rows = []
    for (const it of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
      const r = rows.find(r => Math.abs(r.y - it.y) < 2.5)
      if (r) r.t.push(it); else rows.push({ y: it.y, t: [it] })
    }
    pages.push(rows.map(r => r.t.sort((a, b) => a.x - b.x).map(i => i.s).join(' ')))
  }
  return pages
}

// Browser helper
export async function readRolexPdf(file) {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return parseRolexDoc(await pdfLines(pdfjs, new Uint8Array(await file.arrayBuffer())))
}
export const _money = MONEY
