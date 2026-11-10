// The one place that decides what goes on the Estimate, Confirmation and Invoice.
// Rolex: Necessary and Optional work separated; every service and every charged part listed with MSRP CAD (tax excl.).
// CTR kit / In-CTR / upgrade parts are inside the CTR set price and are never printed.

const lc = s => String(s || '').toLowerCase()

export function documentLines(job, allParts) {
  const necessary = [], optional = []
  if (job.service_type === 'CTR') {
    necessary.push({ key: 'ctr', label: 'Complete overhaul', price: job.ctr_price ?? null, subs: ['Clean case and bracelet'], source: 'ctr' })
  }
  if (job.polish) necessary.push({ key: 'polish', label: 'Refinish case and bracelet', price: job.polish_price ?? null, source: 'polish' })
  for (const l of job.job_parts || []) {
    if (l.kind !== 'billable') continue
    if (l.state !== 'active' && l.decision !== 'declined') continue      // removed before the client saw it
    const p = allParts?.get?.(l.part_id) || {}
    const line = {
      key: 'part:' + l.id, id: l.id, source: 'part', decision: l.decision || null, component: l.component, term: l.condition_term,
      label: `Replace ${lc(l.component)}${l.qty > 1 ? ` (×${l.qty})` : ''}`.replace(/^Replace (.)/, (m, c) => 'Replace ' + c.toUpperCase()),
      parts: [`${l.rmc} ${lc(p.name)}`.trim()],
      price: l.retail != null ? Math.round(l.retail * l.qty * 100) / 100 : null,
      retailUnit: l.retail, qty: l.qty,
    }
    ;(l.required === 'optional' ? optional : necessary).push(line)
  }
  for (const x of job.extra_lines || []) {
    const line = { key: 'extra:' + x.id, id: x.id, source: 'extra', label: x.label, price: x.price ?? null, subs: x.details ? [x.details] : [], decision: x.decision || null }
    ;(x.kind === 'optional' ? optional : necessary).push(line)
  }
  return { necessary, optional }
}

export const sumLines = lines => Math.round(lines.reduce((s, l) => s + (Number(l.price) || 0), 0) * 100) / 100
export const unpriced = lines => lines.filter(l => l.price == null)

// Accepted / declined after the client's decision
export function decidedLines(job, allParts) {
  const { necessary, optional } = documentLines(job, allParts)
  const refused = job.estimate_decision === 'refused'
  return {
    accepted: refused ? [] : [...necessary, ...optional.filter(l => l.decision === 'accepted')],
    declined: optional.filter(l => l.decision === 'declined' || refused),
    refused,
  }
}

export const EXCHANGE_NOTE = 'This estimate is intended to inform the Client on the price of a service. It does not attest to or guarantee the ' +
  'authenticity of a watch. All component prices are calculated on an exchange basis, including any potential return of precious material, and ' +
  'therefore any replaced components will not be returned. All replacement components will be of the current generation available.'

// "While examining your watch, our watchmakers found that the crystal is chipped. …" — one per priced finding
export function autoNotes(job, allParts) {
  const { necessary, optional } = documentLines(job, allParts)
  const out = []
  for (const l of [...necessary, ...optional].filter(x => x.source === 'part' && x.component && x.term)) {
    const nec = necessary.includes(l)
    out.push(`While examining your watch, our watchmakers found that the ${lc(l.component)} is ${lc(l.term)}. ` +
      (nec ? 'Its replacement is necessary and is included in the necessary work.' : 'Therefore its replacement is proposed in the optional work.'))
  }
  for (const r of job.job_requests || []) {
    if (r.state === 'declined') out.push(`Regarding your request "${r.request}": ${r.reason || 'it is not included in this estimate'}.`)
  }
  return out.join('\n')
}
