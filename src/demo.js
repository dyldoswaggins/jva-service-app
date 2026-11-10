// Demo mode for local development only (npm run dev, then add ?demo to the address).
// Loads the data/ export into memory. Never included in the public build.
export function makeDemo() {
  const me = { id: 'demo', email: 'demo@localhost', name: 'Dylan (demo)', role: 'admin', legacy_id: 'u_5FbqzfZ79582E4oxzrqCvw' }
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

