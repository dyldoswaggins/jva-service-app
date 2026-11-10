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
    async loadInvoices() { return [] },
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

