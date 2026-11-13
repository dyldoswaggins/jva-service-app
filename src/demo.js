// Demo mode for local development only (npm run dev, then add ?demo to the address).
// Loads the data/ export into memory. Never included in the public build.
export function makeDemo() {
  const role = new URLSearchParams(location.search).get('role') || 'admin' // try ?demo&role=sales / watchmaker
  const me = { id: 'demo', email: 'demo@localhost', name: 'Dylan (demo)', role, legacy_id: 'u_5FbqzfZ79582E4oxzrqCvw' }
  const ts = ms => (ms ? new Date(ms).toISOString() : null)
  let store = null
  const listeners = []
  async function load() {
    if (store) return store
    const [p, m, l] = await Promise.all([
      import('../data/parts.json'), import('../data/models.json'), import('../data/log.json'),
    ])
    const parts = p.default.map(r => ({
      id: r.id, rmc: r.rmc, name: r.name || '', cat: r.cat || '', sub: r.sub || '', cal: r.cal || '', abc: r.abc || '',
      qty: r.qty ?? null, c_by: null, c_by_legacy: r.cBy || null, c_at: ts(r.cAt), price: r.price ?? null,
      pack_price: r.packPrice ?? null, pack: r.pack ?? null, price_src: r.priceSrc ?? null, price_prev: r.pricePrev ?? null,
      price_2022: r.price2022 ?? null, retail: r.retail ?? null, retail_src: r.retailSrc ?? null, over: r.over ?? null,
      min: null, fits: r.fits ?? null, lcab: null, ldrw: null, ltab: null, used: r.used ?? null, jobs: r.jobs ?? null,
      last_used: r.lastUsed || null, edge_desc: r.edgeDesc ?? null, edge_refs: r.edgeRefs ?? null, edge_note: r.edgeNote ?? null,
      flag: r.flag || '', note: r.note || '', src: r.src ?? null, ord: r.ord ?? null, archived: false,
    }))
    const models = m.default.map(r => ({
      id: r.id, ref: r.ref, name: r.name || '', cal: r.cal || '', ok: !!r.ok, by_user: null, by_legacy: r.by || null,
      at: ts(r.at), src: r.src ?? null, years: r.years ?? null, conf: r.conf ?? null,
    }))
    const log = l.default.map(r => ({
      id: r.id, part_id: r.pid || null, rmc: r.rmc, prev: r.prev ?? null, qty: r.qty ?? null,
      change: r.pid && r.qty != null ? r.qty - (r.prev ?? 0) : null, by_user: null, by_legacy: r.by || null,
      at: ts(r.at), src: r.src ?? null, type: r.type || (String(r.src || '').startsWith('Invoice') ? 'Received' : 'Count'), ref: null,
    })).sort((a, b) => (a.at < b.at ? 1 : -1))
    store = { parts: new Map(parts.map(x => [x.id, x])), models: new Map(models.map(x => [x.id, x])), log }
    return store
  }
  const emit = (kind, row) => listeners.forEach(l => l[kind]?.(row))
  const demoBacked = (j, c, t) => !!c && !!t && (j.job_conditions || []).some(x => x.state === 'confirmed' && x.component.toLowerCase() === c.toLowerCase() && x.term.toLowerCase() === t.toLowerCase())
  return {
    mode: 'demo',
    configured: true,
    session: async () => ({ user: me }),
    onAuth: () => () => {},
    signIn: () => {},
    signOut: () => alert('Demo mode: no sign-out.'),
    async loadAll() {
      const s = await load()
      return { parts: [...s.parts.values()], models: [...s.models.values()], profiles: [me] }
    },
    async loadLog(limit = 500) { return (await load()).log.slice(0, limit) },
    async loadInvoices() { return [...((await load()).invoices || [])] },
    // Mirrors apply_invoice() in supabase/migrations/003 (simplified)
    async applyInvoice(inv, lines) {
      const s = await load()
      s.invoices = s.invoices || []
      const type = inv.doc_type || 'invoice'
      if (s.invoices.some(x => x.doc_type === type && x.invoice_no === inv.invoice_no && !x.undone)) throw new Error(`${inv.invoice_no} was already imported`)
      const id = crypto.randomUUID(), canStock = inv.date > '2026-11-05', src = (type === 'invoice' ? 'Invoice ' : 'Packing list ') + inv.invoice_no, at = new Date().toISOString()
      const pool = s.invoices.filter(d => !d.undone && d.doc_type !== type).flatMap(d => d.lines.filter(x => !x.matched))
      const out = []
      for (const l of lines) {
        if (!s.parts.has(l.part_id)) {
          if (!l.new_part) throw new Error(`Part ${l.rmc} is not in the list`)
          s.parts.set(l.part_id, { id: l.part_id, rmc: l.rmc, qty: null, archived: false, note: '', ...l.new_part, edge_refs: l.ref, src, flag: `Added from ${src}: check category and class` })
        }
        let p = s.parts.get(l.part_id), costed = false, stocked = false, prev_price = null
        const match = pool.find(x => !x.matched && x.part_id === l.part_id && (x.mrws_ref || '') === (l.mrws_ref || ''))
        if (match) match.matched = true
        if (type === 'invoice' && l.set_cost !== false && l.unit_cost > 0 && (!p.price_date || inv.date >= p.price_date)) {
          prev_price = p.price
          p = { ...p, price_prev: p.price, price: l.unit_cost, pack: l.pack ?? p.pack, pack_price: l.pack_price ?? p.pack_price, price_src: `${src} (${inv.date})`, price_date: inv.date }
          costed = true
        }
        if (canStock && l.add_stock !== false && l.units > 0 && !(match && match.stocked)) {
          const lg = { id: crypto.randomUUID(), part_id: p.id, rmc: p.rmc, prev: p.qty, qty: (p.qty ?? 0) + l.units, change: l.units, by_user: me.id, at, src, type: 'Received', ref: id }
          p = { ...p, qty: lg.qty, c_by: me.id, c_at: at }
          s.log.unshift(lg); emit('onLog', lg); stocked = true
        }
        s.parts.set(p.id, p)
        out.push({ ...l, added: !!l.new_part, stocked, costed, prev_price, matched: !!match, matched_units: match?.units })
      }
      s.invoices.unshift({ id, doc_type: type, invoice_no: inv.invoice_no, date: inv.date, file: inv.file, add_stock: canStock, by_user: me.id, at, lines: out, undone: false })
      return id
    },
    async receiptMatches(docType, lines) {
      const s = await load(), used = new Set()
      const pool = (s.invoices || []).filter(d => !d.undone && d.doc_type !== docType)
        .flatMap(d => d.lines.map((l, k) => ({ ...l, key: d.id + k, doc_type: d.doc_type, doc_no: d.invoice_no, matched: l.matched })))
        .filter(l => !l.matched)
      const out = lines.map((l, i) => {
        const m = pool.find(p => !used.has(p.key) && p.part_id === l.part_id && (p.mrws_ref || '') === (l.mrws_ref || ''))
        if (!m) return null
        used.add(m.key)
        return { i, doc_type: m.doc_type, doc_no: m.doc_no, units: m.units, stocked: m.stocked }
      })
      const refs = new Set(lines.map(l => l.mrws_ref).filter(Boolean))
      return { lines: out, missing: pool.filter(p => !used.has(p.key) && refs.has(p.mrws_ref)).map(p => ({ doc_type: p.doc_type, doc_no: p.doc_no, rmc: p.rmc, mrws_ref: p.mrws_ref, units: p.units })) }
    },
    // ---------- jobs (in memory) ----------
    async addContact(jobId, method, direction, summary) { const s = await load(); const j = s.jobs.find(x => x.id === jobId); j.job_contacts = [...(j.job_contacts || []), { id: crypto.randomUUID(), job_id: jobId, at: new Date().toISOString(), by_user: me.id, method, direction, summary }] },
    async loadPickupJobs() { const s = await load(); return (s.jobs || []).filter(j => j.status === 'Ready for pickup').map(j => ({ ...j })) },
    async markPickedUp(jobId, checklist) {
      if (!checklist?.id_checked) throw new Error("Check the client's government photo ID first")
      const s = await load(), j = s.jobs.find(x => x.id === jobId)
      if (j.status !== 'Ready for pickup') throw new Error('This watch is not ready for pickup')
      j.job_status_log.push({ id: crypto.randomUUID(), status: 'Picked up', by_user: me.id, at: new Date().toISOString() })
      Object.assign(j, { status: 'Picked up', picked_up_at: new Date().toISOString(), picked_up_by: me.id, pickup_checklist: checklist })
    },
    async loadStatuses() {
      return ['Estimate', 'Waiting on parts', 'On deck', 'Polishing', 'Timekeeping', 'Sent to Toronto', 'Done', 'Ready for pickup', 'Picked up', 'Cancelled']
        .map((name, i) => ({ name, ord: i, kind: ['Done', 'Ready for pickup', 'Picked up'].includes(name) ? 'done' : name === 'Cancelled' ? 'cancelled' : name === 'Sent to Toronto' ? 'away' : 'open' }))
    },
    async loadJobs() {
      const s = await load()
      // ?demo&sample → one realistic job to look at (e.g. ?demo&role=watchmaker&sample)
      if (!s.jobs && new URLSearchParams(location.search).has('sample')) {
        s.jobs = []
        await this.createJob({ edge_no: '125100-001', service_type: 'CTR', classification: 'Modern', watch_ref: '126610LN', watch_name: 'Submariner Date', serial: '9X8Y7Z66', calibre: '3235',
          bracelet_ref: '20-72610', bracelet: 'Rolex Oyster Oystersteel', dial: '126610 black markers w lgn', ctr_tier: 'CO - MODERN $980', ctr_price: 980,
          polish: true, polish_family: 'Submariner / GMT-Master / Explorer / Sea-Dweller', polish_price: 210, eta_quoted: '2026-11-24' },
        [{ component: 'Crystal', term: 'Chipped', note: "at 2 o'clock" }, { component: 'Bezel', term: 'Scratched', note: '' }, { component: 'Bracelet', term: 'Stretched', note: '' }],
        [{ request: 'Perform complete overhaul', note: 'Modern CTR' }, { request: 'Refinish case and bracelet', note: '' }, { request: 'Replace crystal', note: '' }],
        { name: 'Sample Client' })
      }
      return (s.jobs || []).map(j => ({ ...j }))
    },
    async loadJob(id) { const s = await load(); return { ...s.jobs.find(j => j.id === id) } },
    async saveJobClient(jobId, fields) { const s = await load(); const j = s.jobs.find(x => x.id === jobId); j.job_clients = { job_id: jobId, ...(j.job_clients || {}), ...fields } },
    async setJobPartPrice(lineId, retail) { const s = await load(); for (const j of s.jobs) { const l = (j.job_parts || []).find(x => x.id === lineId); if (l) l.retail = retail } },
    async recordDecision(jobId, { refused, accepted, declined, extra }) {
      const s = await load(), j = s.jobs.find(x => x.id === jobId)
      for (const l of j.job_parts || []) {
        if (accepted.includes(l.id)) l.decision = 'accepted'
        if (declined.includes(l.id) && l.state === 'active') { await this.removeJobPart(l.id); l.decision = 'declined' }
      }
      Object.assign(j, { estimate_decision: refused ? 'refused' : 'accepted', decision_at: new Date().toISOString(), extra_lines: extra ?? j.extra_lines })
    },
    // online signing (mirrors migration 021 + Edge Function "sign"; signed PDF built in the browser)
    async createSignRequest(jobId, docId, lines, channel, email = null) {
      const s = await load(); s.signs = s.signs || []
      if (channel === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) throw new Error("Enter the client's email address")
      s.signs.filter(r => r.job_id === jobId && !r.signed_at).forEach(r => { r.cancelled_at = new Date().toISOString() })
      const r = { id: crypto.randomUUID(), token: [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join(''), job_id: jobId, doc_id: docId, lines, channel, email, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 864e5).toISOString() }
      s.signs.push(r); try { localStorage.setItem('demoSign', JSON.stringify({ token: r.token })) } catch { /* */ }
      return { id: r.id, token: r.token, expires_at: r.expires_at }
    },
    async loadSignRequests(jobId) { return ((await load()).signs || []).filter(r => r.job_id === jobId).reverse() },
    async emailSignRequest() { await new Promise(r => setTimeout(r, 300)); throw new Error('Demo mode: email is sent from the live site only') },
    async signGet(token) {
      const s = await load(), r = (s.signs || []).find(x => x.token === token)
      if (!r) return { status: 'invalid' }
      const j = s.jobs.find(x => x.id === r.job_id)
      if (r.signed_at || r.cancelled_at) return { status: r.signed_at ? 'signed' : 'cancelled', edge_no: j.edge_no }
      const doc = j.job_docs.find(d => d.id === r.doc_id)
      return { status: 'open', edge_no: j.edge_no, watch: [j.watch_ref && 'M' + j.watch_ref.replace(/^M/, ''), 'Rolex', j.watch_name].filter(Boolean).join(' '), serial_last4: String(j.serial || '').slice(-4),
        client_name: j.job_clients?.name || '', lines: r.lines, pdf_url: URL.createObjectURL(doc._blob), expires_at: r.expires_at, channel: r.channel }
    },
    async signSubmit({ token, refused, optional, name, signature, remarks }) {
      const s = await load(), r = (s.signs || []).find(x => x.token === token)
      if (!r || r.signed_at || r.cancelled_at) throw new Error('This signing link is no longer valid.')
      const j = s.jobs.find(x => x.id === r.job_id), doc = j.job_docs.find(d => d.id === r.doc_id)
      const chosen = refused ? [] : r.lines.optional.filter(l => optional?.[l.key]).map(l => l.key)
      const { stampEstimate } = await import('./docs/stamp.js')
      const sigPng = new Uint8Array(await (await fetch(signature)).arrayBuffer())
      const bytes = await stampEstimate(new Uint8Array(await doc._blob.arrayBuffer()), doc._blob.fields, { refused, chosen, name, sigPng, remarks,
        audit: `Signed electronically by ${name} on ${new Date().toLocaleString('en-CA')} (demo)` })
      await this.uploadJobDoc(j.id, 'signed_estimate', new Blob([bytes], { type: 'application/pdf' }), `JVA-${j.edge_no}-Estimate-signed.pdf`)
      const ids = ls => ls.filter(l => l.source === 'part' && l.id).map(l => l.id)
      const opt = r.lines.optional, nec = r.lines.necessary
      await this.recordDecision(j.id, { refused, accepted: refused ? [] : [...ids(nec), ...ids(opt.filter(l => chosen.includes(l.key)))],
        declined: [...ids(opt.filter(l => !chosen.includes(l.key))), ...(refused ? ids(nec) : [])],
        extra: (j.extra_lines || []).map(x => ({ ...x, decision: x.kind === 'optional' ? (chosen.includes('extra:' + x.id) ? 'accepted' : 'declined') : (refused ? 'declined' : 'accepted') })) })
      Object.assign(r, { signed_at: new Date().toISOString(), signer_name: name })
      return { ok: true, refused, copied: false }
    },
    async createJob(job, conditions, requests, client = null) {
      const s = await load(); s.jobs = s.jobs || []
      if (s.jobs.some(j => j.edge_no === job.edge_no)) throw new Error(`Job ${job.edge_no} already exists`)
      const id = crypto.randomUUID(), at = new Date().toISOString()
      s.jobs.unshift({ id, ...job, watch_ref: (job.watch_ref || '').toUpperCase(), status: 'Estimate', intake_by: me.id, intake_at: at, extra_lines: [],
        job_clients: client ? { job_id: id, ...client } : null, job_photos: [],
        job_conditions: conditions.map(c => ({ id: crypto.randomUUID(), job_id: id, ...c, source: 'intake', state: 'to_confirm', by_user: me.id, at })),
        job_requests: requests.map(r => ({ id: crypto.randomUUID(), job_id: id, ...r, state: 'to_review', by_user: me.id, at })),
        job_status_log: [{ id: crypto.randomUUID(), status: 'Estimate', by_user: me.id, at }], job_docs: [] })
      return id
    },
    async updateJob(id, fields) {
      const s = await load(), j = s.jobs.find(x => x.id === id)
      for (const x of fields.extra_lines || []) { // mirrors trigger jobs_extra_lines_backed (016)
        const o = (j.extra_lines || []).find(y => y.id === x.id && y.kind === 'optional' && y.component === x.component && y.term === x.term)
        if (x.kind === 'optional' && x.source !== 'rolex' && !o && !demoBacked(j, x.component, x.term)) throw new Error(`Optional work must be backed by the watch analysis ("${x.label}")`)
      }
      if (['serial', 'watch_ref', 'watch_name', 'bracelet_ref', 'bracelet', 'dial', 'dial_ref'].some(k => k in fields && (fields[k] ?? null) !== (j[k] ?? null))) j.ident_changed_at = new Date().toISOString()
      if (fields.status && fields.status !== j.status) j.job_status_log.push({ id: crypto.randomUUID(), status: fields.status, by_user: me.id, at: new Date().toISOString() })
      // stock comes off when the job leaves Estimate (mirrors take_job_stock)
      if (j.status === 'Estimate' && fields.status && !['Estimate', 'Cancelled'].includes(fields.status) && !j.stock_taken_at) {
        for (const l of (j.job_parts || []).filter(x => x.state === 'active' && x.consumed_qty < x.qty)) {
          const p = s.parts.get(l.part_id), want = l.qty - l.consumed_qty, take = Math.min(want, p.qty ?? 0)
          s.parts.set(p.id, { ...p, qty: (p.qty ?? 0) - take }); l.consumed_qty += take; l.short_qty = want - take
        }
        j.stock_taken_at = new Date().toISOString()
      }
      Object.assign(j, fields)
    },
    async loadSettings() {
      const s = await load()
      s.settings = s.settings || {
        ctr_prices: { 'CO - MODERN $840': 840, 'CO - MODERN $980': 980, 'CO - MODERN $1,190': 1190, 'CO - CLASSIC $1,250': 1250, 'CO - CLASSIC $1,530': 1530, 'CO - CLASSIC $1,810': 1810 },
        polish_prices: { 'Oyster Perpetual / Datejust / Air-King': 210, 'Submariner / GMT-Master / Explorer / Sea-Dweller': 210, 'Daytona / Yacht-Master / Sky-Dweller': 210, 'Day-Date / gold': 210 },
        immediate_proceed: { include_allowance: false },
        bench: { watches_per_week: 6, parts_wait_days: 0 },
        vintage: { fee: 350, weeks: 18 },
      }
      return JSON.parse(JSON.stringify(s.settings))
    },
    async saveSetting(key, value) { const s = await load(); await this.loadSettings(); s.settings[key] = value },
    // time on the job (mirrors migration 015)
    async timeStart(jobId) {
      if (!['admin', 'watchmaker'].includes(role)) return null
      const s = await load(); s.time = s.time || []
      s.time.forEach(t => { if (t.user_id === me.id) t.ended = true })
      const t = { id: crypto.randomUUID(), job_id: jobId, user_id: me.id, started_at: Date.now(), last_seen_at: Date.now(), ended: false }
      s.time.push(t); return t.id
    },
    async timeBeat(id) {
      const t = ((await load()).time || []).find(x => x.id === id)
      if (!t || t.ended || Date.now() - t.last_seen_at > 180000) return false
      t.last_seen_at = Date.now(); return true
    },
    async timeStop(id) {
      const t = ((await load()).time || []).find(x => x.id === id)
      if (t && !t.ended) { if (Date.now() - t.last_seen_at <= 180000) t.last_seen_at = Date.now(); t.ended = true }
    },
    async jobTime(jobId) {
      const rows = ((await load()).time || []).filter(t => t.job_id === jobId)
      const sec = t => (t.last_seen_at - t.started_at) / 1000
      const by = {}; rows.forEach(t => { by[t.user_id] = (by[t.user_id] || 0) + sec(t) })
      return { seconds: Math.round(rows.reduce((a, t) => a + sec(t), 0)), people: role === 'admin' ? Object.entries(by).map(([user_id, seconds]) => ({ user_id, seconds })) : null }
    },
    async queueEta(jobId = null) {
      const s = await load(), st = await this.loadSettings(), jobs = s.jobs || []
      const me_ = jobs.find(j => j.id === jobId)
      const ahead = jobs.filter(j => !['Done', 'Cancelled', 'Sent to Toronto'].includes(j.status) && j.classification !== 'Vintage' && (!me_ || (j.id !== jobId && j.intake_at < me_.intake_at))).length
      const d = new Date(); d.setDate(d.getDate() + Math.ceil((ahead + 1) / Math.max(st.bench.watches_per_week, 0.5)) * 7 + (st.bench.parts_wait_days || 0))
      return { ahead, eta: d.toISOString().slice(0, 10) }
    },
    async uploadJobPhoto(jobId, blob, label) { const s = await load(); const j = s.jobs.find(x => x.id === jobId); (j.job_photos = j.job_photos || []).push({ id: crypto.randomUUID(), label, _blob: blob, at: new Date().toISOString() }) },
    async photoUrl(photo) { return URL.createObjectURL(photo._blob) },
    async loadKit(family) { const k = (await import('../data/ctr_kits.json')).default; return k.filter(x => x.family === family) },
    async buildKit(jobId) {
      const s = await load(), j = s.jobs.find(x => x.id === jobId)
      if (j.service_type !== 'CTR') throw new Error('This job is not a CTR')
      const fam = /^\d{4}/.test(j.calibre || '') ? j.calibre.slice(0, 2) + 'xx' : null
      if (!fam) throw new Error('Enter the calibre first')
      j.job_parts = j.job_parts || []
      const kit = (await import('../data/ctr_kits.json')).default.filter(x => x.family === fam && x.auto && x.part_id && (!x.only_for.length || x.only_for.includes(j.calibre)))
      let n = 0
      for (const k of kit) if (!j.job_parts.some(l => l.part_id === k.part_id && l.kind === 'ctr_kit' && l.state === 'active')) {
        j.job_parts.push({ id: crypto.randomUUID(), job_id: jobId, part_id: k.part_id, rmc: k.rmc, qty: k.qty, kind: 'ctr_kit', source: 'kit', retail: k.retail, consumed_qty: 0, short_qty: 0, state: 'active', at: new Date().toISOString() }); n++
      }
      return n
    },
    async addJobPart({ jobId, partId, qty, kind, source, component = null, condition = null, required = null, reason = null }) {
      const s = await load(), j = s.jobs.find(x => x.id === jobId), p = s.parts.get(partId)
      if (kind === 'billable' && String(reason || '').trim().length < 3) throw new Error('Give the reason this part is needed (shown on the client documents)')
      if (kind === 'billable' && (!component || !condition || !required)) throw new Error('Billable parts need a component, a condition and Necessary / Optional')
      if (kind === 'billable' && required === 'optional' && !demoBacked(j, component, condition)) throw new Error(`Optional work must be backed by the watch analysis: confirm or add "${component} ${condition.toLowerCase()}" first`)
      j.job_parts = j.job_parts || []
      const l = { id: crypto.randomUUID(), job_id: jobId, part_id: partId, rmc: p.rmc, qty, kind, source, component, condition_term: condition, required, reason: reason ? String(reason).trim() : null, retail: p.retail, consumed_qty: 0, short_qty: 0, state: 'active', at: new Date().toISOString() }
      j.job_parts.push(l)
      if (j.stock_taken_at) { const take = Math.min(qty, p.qty ?? 0); s.parts.set(partId, { ...p, qty: (p.qty ?? 0) - take }); l.consumed_qty = take; l.short_qty = qty - take }
      return l.id
    },
    async setJobPartSupply(lineId, field, value) {
      const s = await load(), now = new Date().toISOString()
      for (const j of s.jobs) { const l = (j.job_parts || []).find(x => x.id === lineId); if (!l) continue
        if (field === 'supply') l.supply = value
        if (field === 'ordered') Object.assign(l, value === 'on' ? { ordered_at: now, ordered_by: me.id, supply: 'order' } : { ordered_at: null, ordered_by: null })
        if (field === 'picked') Object.assign(l, value === 'on' ? { picked_at: now, picked_by: me.id } : { picked_at: null, picked_by: null }) }
    },
    async setJobPartNeed(lineId, required, component = null, term = null) {
      const s = await load()
      for (const j of s.jobs) {
        const l = (j.job_parts || []).find(x => x.id === lineId)
        if (!l) continue
        if (j.estimate_decision) throw new Error('The client has already decided; change it on a new estimate')
        const c = component || l.component, t = term || l.condition_term
        if (required === 'optional' && !demoBacked(j, c, t)) throw new Error(`Optional work must be backed by the watch analysis: confirm or add "${c} ${String(t).toLowerCase()}" first`)
        Object.assign(l, { required, component: c, condition_term: t })
      }
    },
    async removeJobPart(lineId) {
      const s = await load()
      for (const j of s.jobs) { const l = (j.job_parts || []).find(x => x.id === lineId); if (l) { if (l.consumed_qty) { const p = s.parts.get(l.part_id); s.parts.set(p.id, { ...p, qty: (p.qty ?? 0) + l.consumed_qty }) } l.state = 'removed'; return l.consumed_qty } }
    },
    async requestReorder(partId, on) { const s = await load(); s.parts.set(partId, { ...s.parts.get(partId), reorder_req: on }) },
    async addCondition(row) { const s = await load(); s.jobs.find(j => j.id === row.job_id).job_conditions.push({ id: crypto.randomUUID(), at: new Date().toISOString(), ...row }) },
    async updateCondition(id, f) { const s = await load(); for (const j of s.jobs) { const c = j.job_conditions.find(x => x.id === id); if (c) Object.assign(c, f) } },
    async addRequest(row) { const s = await load(); s.jobs.find(j => j.id === row.job_id).job_requests.push({ id: crypto.randomUUID(), at: new Date().toISOString(), ...row }) },
    async updateRequest(id, f) { const s = await load(); for (const j of s.jobs) { const r = j.job_requests.find(x => x.id === id); if (r) Object.assign(r, f) } },
    async uploadJobDoc(jobId, kind, blob, fileName) { const s = await load(); const d = { id: crypto.randomUUID(), kind, file_name: fileName, _blob: blob, fields: blob.fields || null, at: new Date().toISOString() }; s.jobs.find(j => j.id === jobId).job_docs.push(d); return d },
    async uploadJobFile(jobId, file, label, note) { const s = await load(); const d = { id: crypto.randomUUID(), kind: 'upload', label, note, file_name: file.name, content_type: file.type, _blob: file, at: new Date().toISOString() }; s.jobs.find(j => j.id === jobId).job_docs.push(d); return d },
    async jobDocFile(doc) { return doc._blob },
    async emailJobDoc() { await new Promise(r => setTimeout(r, 400)); throw new Error('Demo mode: email is sent from the live site only') },
    async loadInbox() { const s = await load(); return [...(s.inbox || [])] },
    async uploadToInbox(file) {
      const s = await load()
      s.inbox = s.inbox || []
      const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf'
      const row = { id: crypto.randomUUID(), received_at: new Date().toISOString(), source: 'upload', file_name: file.name, mime: file.type, _file: file,
        status: isPdf ? 'ready' : 'error', read_by: isPdf ? 'layout' : null, error: isPdf ? null : 'Demo mode: scans are read on the live site only' }
      s.inbox.unshift(row)
      return row
    },
    async readInbox() { throw new Error('Demo mode: scans are read on the live site only') },
    async checkEmail() { await new Promise(r => setTimeout(r, 600)); throw new Error('Demo mode: email is checked on the live site only') },
    async inboxFile(row) { return row._file },
    async updateInbox(id, fields) { const s = await load(); const r = s.inbox.find(x => x.id === id); Object.assign(r, fields) },
    async undoInvoice(id) {
      const s = await load(), inv = s.invoices.find(x => x.id === id)
      if (!inv || inv.undone) throw new Error('Already undone')
      let n = 0
      for (const l of inv.lines) {
        let p = s.parts.get(l.part_id)
        if (l.stocked) { const take = Math.min(l.units, p.qty ?? 0); if (take) { p = { ...p, qty: p.qty - take }; n++ } }
        if (l.costed && String(p.price_src).startsWith(`Invoice ${inv.invoice_no} (`)) p = { ...p, price: l.prev_price, price_date: null, price_src: `Restored (undo Invoice ${inv.invoice_no})` }
        s.parts.set(p.id, p)
      }
      inv.undone = true; inv.undone_at = new Date().toISOString()
      return { parts: n, short: [] }
    },
    async stockChange({ partId, type, qty = null, delta = null, src = null, ref = null }) {
      const s = await load(), p = s.parts.get(partId)
      if (!p) throw new Error('Part not found')
      const prev = p.qty, next = qty ?? (prev ?? 0) + delta
      if (next < 0) throw new Error(`Not enough stock: ${prev ?? 0} on hand`)
      const row = { ...p, qty: next, c_by: me.id, c_at: new Date().toISOString() }
      s.parts.set(partId, row)
      const lg = { id: crypto.randomUUID(), part_id: partId, rmc: p.rmc, prev, qty: next, change: next - (prev ?? 0), by_user: me.id, by_legacy: null, at: row.c_at, src, type, ref }
      s.log.unshift(lg)
      emit('onLog', lg)
      return row
    },
    async updatePart(id, fields) {
      const s = await load(), row = { ...s.parts.get(id), ...fields }
      s.parts.set(id, row)
      return row
    },
    async addPart(row) {
      const s = await load()
      if (s.parts.has(row.id)) throw new Error(`${row.rmc} is already listed`)
      const full = { qty: null, flag: '', note: '', archived: false, ...row }
      s.parts.set(row.id, full)
      return full
    },
    async saveModel(id, fields, insert = false) {
      const s = await load()
      if (insert && s.models.has(id)) throw new Error('Already listed')
      const row = { ...(s.models.get(id) || { id }), ...fields }
      s.models.set(id, row)
      return row
    },
    subscribe(l) { listeners.push(l); return () => listeners.splice(listeners.indexOf(l), 1) },
  }
}

