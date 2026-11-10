// Data layer: every read/write to the database goes through here.
// Live mode = Supabase. Demo mode (local dev only, add ?demo to the address) = the data/ export in memory.
import { supabase, isConfigured } from './supabase.js'

// ---------------- live (Supabase) ----------------
const live = {
  mode: 'live',
  configured: isConfigured,
  async session() {
    const { data } = await supabase.auth.getSession()
    return data.session
  },
  onAuth(cb) {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => cb(s))
    return () => data.subscription.unsubscribe()
  },
  signIn: () =>
    supabase.auth.signInWithOAuth({ provider: 'azure', options: { scopes: 'email', redirectTo: location.origin } }),
  signOut: () => supabase.auth.signOut(),

  async loadAll() {
    const all = async (table, order) => {
      const rows = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from(table).select('*').order(order).range(from, from + 999)
        if (error) throw error
        rows.push(...data)
        if (data.length < 1000) return rows
      }
    }
    const [parts, models, profiles] = await Promise.all([all('parts', 'id'), all('models', 'id'), all('profiles', 'id')])
    return { parts, models, profiles }
  },
  async loadLog(limit = 500) {
    const { data, error } = await supabase.from('log').select('*').order('at', { ascending: false }).limit(limit)
    if (error) throw error
    return data
  },
  async loadInvoices() {
    const { data, error } = await supabase.from('invoices').select('*').order('at', { ascending: false }).limit(200)
    if (error) throw error
    return data
  },
  async stockChange({ partId, type, qty = null, delta = null, src = null, ref = null }) {
    const { data, error } = await supabase.rpc('stock_change', {
      p_part_id: partId, p_type: type, p_qty: qty, p_delta: delta, p_src: src, p_ref: ref,
    })
    if (error) throw error
    return data
  },
  async applyInvoice(invoice, lines) {
    const { data, error } = await supabase.rpc('apply_invoice', { p_invoice: invoice, p_lines: lines })
    if (error) throw error
    return data
  },
  async undoInvoice(id) {
    const { data, error } = await supabase.rpc('undo_invoice', { p_id: id })
    if (error) throw error
    return data
  },
  async receiptMatches(docType, lines) {
    const { data, error } = await supabase.rpc('receipt_matches', { p_doc_type: docType, p_lines: lines })
    if (error) throw error
    return data
  },
  // ---------- inbox ----------
  async loadInbox() {
    const { data, error } = await supabase.from('inbox').select('*').order('received_at', { ascending: false }).limit(150)
    if (error) throw error
    return data
  },
  async uploadToInbox(file, userId) {
    const path = `upload/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_')}`
    const mime = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : '')
    const up = await supabase.storage.from('inbox').upload(path, file, { contentType: mime || undefined })
    if (up.error) throw up.error
    const { data, error } = await supabase.from('inbox')
      .insert({ source: 'upload', file_path: path, file_name: file.name, mime, by_user: userId }).select().single()
    if (error) throw error
    await live.readInbox(data.id).catch(() => {}) // errors are saved on the inbox row
    return data
  },
  async readInbox(id, force = false) {
    const { data, error } = await supabase.functions.invoke('inbox', { body: { action: 'read', id, force } })
    if (error) {
      const msg = await error.context?.json?.().then(j => j.error).catch(() => null)
      throw new Error(msg || error.message)
    }
    return data
  },
  // "Check email": fetch new documents from the connected mailbox, only when asked
  async checkEmail() {
    const { data, error } = await supabase.functions.invoke('inbox', { body: { action: 'check' } })
    if (error) {
      const msg = await error.context?.json?.().then(j => j.error).catch(() => null)
      throw new Error(msg || error.message)
    }
    return data
  },
  async inboxFile(row) {
    const { data, error } = await supabase.storage.from('inbox').download(row.file_path)
    if (error) throw error
    return new File([data], row.file_name, { type: row.mime || data.type })
  },
  async updateInbox(id, fields) {
    const { error } = await supabase.from('inbox').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },
  async updatePart(id, fields) {
    const { data, error } = await supabase.from('parts').update(fields).eq('id', id).select().single()
    if (error) throw error
    return data
  },
  async addPart(row) {
    const { data, error } = await supabase.from('parts').insert(row).select().single()
    if (error) throw error
    return data
  },
  async saveModel(id, fields, insert = false) {
    const q = insert ? supabase.from('models').insert({ id, ...fields }) : supabase.from('models').update(fields).eq('id', id)
    const { data, error } = await q.select().single()
    if (error) throw error
    return data
  },
  subscribe({ onPart, onModel, onLog, onInbox }) {
    const ch = supabase
      .channel('live-' + crypto.randomUUID())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parts' }, e => onPart?.(e.new))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'models' }, e => onModel?.(e.new))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'log' }, e => onLog?.(e.new))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inbox' }, e => onInbox?.(e.new))
      .subscribe()
    return () => supabase.removeChannel(ch)
  },
}

// Demo mode: local dev only, loaded on demand so it never ships in the public build.
let api = live
if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
  api = (await import('./demo.js')).makeDemo()
}
export { api }
