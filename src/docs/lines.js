// The one place that decides what goes on the Estimate, Confirmation and Invoice.
// Rolex: Necessary and Optional work separated; every service and every charged part listed with MSRP CAD (tax excl.).
// CTR kit / In-CTR / upgrade parts are inside the CTR set price and are never printed.

const lc = s => String(s || '').toLowerCase()
// Template capitalisation: "Complete Overhaul", "Replace Crystal", "Clean Case and Bracelet"
export const tc = s => String(s || '').replace(/\S+/g, (w, i) => (i && /^(and|or|of|the|a|an|to|in|on|with|for)$/i.test(w) ? w.toLowerCase() : /^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w))

export function documentLines(job, allParts) {
  const necessary = [], optional = []
  const rolex = job.estimate_source === 'rolex' // converted from Rolex Toronto's estimate: only those lines
  if (!rolex) {
  // Vintage: the analysis fee is charged whatever the client decides on the Rolex estimate
  if (job.classification === 'Vintage') necessary.push({ key: 'vintage_fee', label: 'Rolex Vintage Analysis Fee', price: job.vintage_fee ?? null, source: 'vintage' })
  if (job.service_type === 'CTR') {
    necessary.push({ key: 'ctr', label: 'Complete Overhaul', price: job.ctr_price ?? null, subs: ['Clean Case and Bracelet', ...(job.polish && !(Number(job.polish_price) > 0) ? ['Refinish Case and Bracelet'] : [])], source: 'ctr' })
  }
  if (job.polish && (Number(job.polish_price) > 0 || job.service_type !== 'CTR')) necessary.push({ key: 'polish', label: 'Refinish Case and Bracelet', price: job.polish_price ?? null, source: 'polish' })
  for (const l of job.job_parts || []) {
    if (l.kind !== 'billable') continue
    if (l.state !== 'active' && l.decision !== 'declined') continue      // removed before the client saw it
    const p = allParts?.get?.(l.part_id) || {}
    const line = {
      key: 'part:' + l.id, id: l.id, source: 'part', decision: l.decision || null, component: l.component, term: l.condition_term,
      label: `Replace ${tc(lc(l.component))}${l.qty > 1 ? ` (×${l.qty})` : ''}`,
      parts: [`${l.rmc} ${lc(p.name)}`.trim()],
      price: l.retail != null ? Math.round(l.retail * l.qty * 100) / 100 : null,
      retailUnit: l.retail, qty: l.qty,
    }
    ;(l.required === 'optional' ? optional : necessary).push(line)
  }
  }
  for (const x of job.extra_lines || []) {
    if (rolex !== (x.source === 'rolex')) continue
    const line = { key: 'extra:' + x.id, id: x.id, source: 'extra', label: tc(x.label) + (x.footnote ? ' (1)' : ''), price: x.price ?? null,
      subs: x.subs || (x.details ? [x.details] : []), parts: x.parts || [], decision: x.decision || null, included: !!x.included, rolex: x.source === 'rolex',
      component: x.component || null, term: x.term || null }
    ;(x.kind === 'optional' ? optional : necessary).push(line)
  }
  return { necessary, optional }
}

// Reasons given for parts added beyond the CTR kit (Dylan, 2026-11-12): printed under "Watch analysis" after the conditions
export function partReasons(job, conditionsText = '') {
  const seen = new Set(), have = String(conditionsText).toLowerCase()
  return (job.job_parts || []).filter(l => l.kind !== 'ctr_kit' && l.reason && (l.state === 'active' || l.decision === 'accepted'))
    .map(l => l.reason.trim().replace(/[.\s]+$/, '')).filter(r => { const k = r.toLowerCase(); if (seen.has(k) || have.includes(k)) return false; seen.add(k); return true })
    .map(r => r[0].toUpperCase() + r.slice(1))
}
// Watch analysis as printed: confirmed conditions, then the reasons for added parts
export function analysisText(job, conditionText) {
  const cond = conditionText((job.job_conditions || []).filter(c => c.state === 'confirmed'))
  const reasons = partReasons(job, cond)
  return [cond, ...reasons].filter(Boolean).join('. ') + ((cond || reasons.length) ? '.' : '')
}

// Optional work must be backed by a confirmed finding in the watch analysis (Dylan, 2026-11-09)
export const findings = job => (job.job_conditions || []).filter(c => c.state === 'confirmed')
export const isBacked = (job, component, term) =>
  !!component && !!term && findings(job).some(c => lc(c.component) === lc(component) && lc(c.term) === lc(term))
export const unbackedOptional = (job, allParts) => documentLines(job, allParts).optional.filter(l => !l.decision && !l.rolex && !isBacked(job, l.component, l.term))

export const sumLines = lines => Math.round(lines.reduce((s, l) => s + (Number(l.price) || 0), 0) * 100) / 100
export const unpriced = lines => lines.filter(l => l.price == null && !l.included)

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
  if (job.estimate_source === 'rolex') return (job.rolex_estimate?.notes || []).filter(n => !/^This estimate is intended to inform/i.test(n)).join('\n')
  const { necessary, optional } = documentLines(job, allParts)
  const out = []
  for (const l of [...necessary, ...optional].filter(x => (x.source === 'part' || x.source === 'extra') && x.component && x.term)) {
    const nec = necessary.includes(l)
    out.push(`While examining your watch, our watchmakers found that the ${lc(l.component)} is ${lc(l.term)}. ` +
      (nec ? 'Its replacement is necessary and is included in the necessary work.' : 'Therefore its replacement is proposed in the optional work.'))
  }
  for (const r of job.job_requests || []) {
    if (r.state === 'declined') out.push(`Regarding your request "${r.request}": ${r.reason || 'it is not included in this estimate'}.`)
  }
  return out.join('\n')
}
