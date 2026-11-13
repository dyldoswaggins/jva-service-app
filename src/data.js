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
  // Microsoft sign-in (needs IT; switch on with VITE_SIGNIN=microsoft)
  signIn: () =>
    supabase.auth.signInWithOAuth({ provider: 'azure', options: { scopes: 'email', redirectTo: location.origin } }),
  // Email + password (accounts created by Admin in Supabase → Authentication → Users)
  async signInPassword(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(/invalid login|credentials/i.test(error.message) ? 'Username or password is wrong.' : error.message)
  },
  async changePassword(password) {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(/should be different/i.test(error.message) ? 'Choose a different password from your current one.' : error.message)
  },
  // Email code sign-in (backup): only @jvairanderson.com, enforced in the database
  async sendCode(email) {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
    if (error) throw new Error(/database error|saving new user/i.test(error.message)
      ? 'Only J. Vair Anderson email addresses can sign in.'
      : /rate|limit|security purposes/i.test(error.message) ? 'Too many codes sent. Wait a minute and try again.' : error.message)
  },
  async verifyCode(email, token) {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (error) throw new Error(/expired|invalid/i.test(error.message) ? 'That code is wrong or has expired. Send a new one.' : error.message)
  },
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
  // ---------- jobs ----------
  async loadStatuses() {
    const { data, error } = await supabase.from('job_statuses').select('*').order('ord')
    if (error) throw error
    return data
  },
  async loadJobs() {
    const { data, error } = await supabase.from('jobs')
      .select('*, job_conditions(state), job_requests(state), job_docs(kind, at), job_parts(state, short_qty)').order('intake_at', { ascending: false }).limit(500)
    if (error) throw error
    return data
  },
  async loadJob(id) {
    const { data, error } = await supabase.from('jobs')
      .select('*, job_conditions(*), job_requests(*), job_status_log(*), job_docs(*), job_parts(*), job_photos(*), job_clients(*)').eq('id', id).single()
    if (error) throw error
    return data
  },
  async createJob(job, conditions, requests, client = null) {
    const { data, error } = await supabase.rpc('create_job', { p_job: job, p_conditions: conditions, p_requests: requests, p_client: client })
    if (error) throw error
    return data
  },
  // ---------- estimate / confirmation / invoice ----------
  async saveJobClient(jobId, fields, exists) {
    const q = exists ? supabase.from('job_clients').update(fields).eq('job_id', jobId) : supabase.from('job_clients').insert({ job_id: jobId, ...fields })
    const { error } = await q
    if (error) throw error
  },
  async setJobPartPrice(lineId, retail) {
    const { error } = await supabase.rpc('set_job_part_price', { p_line: lineId, p_retail: retail })
    if (error) throw error
  },
  async setJobPartSupply(lineId, field, value) {
    const { error } = await supabase.rpc('set_job_part_supply', { p_line: lineId, p_field: field, p_value: value })
    if (error) throw error
  },
  async setJobPartNeed(lineId, required, component = null, term = null) {
    const { error } = await supabase.rpc('set_job_part_need', { p_line: lineId, p_required: required, p_component: component, p_term: term })
    if (error) throw error
  },
  // ---------- online signing of the estimate (migration 021, Edge Function "sign") ----------
  async createSignRequest(jobId, docId, lines, channel, email = null) {
    const { data, error } = await supabase.rpc('create_sign_request', { p_job: jobId, p_doc: docId, p_lines: lines, p_channel: channel, p_email: email })
    if (error) throw error
    return data
  },
  async loadSignRequests(jobId) {
    const { data, error } = await supabase.from('sign_requests').select('id, token, channel, email, created_at, emailed_at, cancelled_at, signed_at, signer_name, expires_at, doc_id').eq('job_id', jobId).order('created_at', { ascending: false })
    if (error) throw error
    return data
  },
  async signCall(body) {
    const { data, error } = await supabase.functions.invoke('sign', { body })
    if (error) {
      const msg = await error.context?.json?.().then(j => j.error).catch(() => null)
      throw new Error(msg || error.message)
    }
    return data
  },
  emailSignRequest(id) { return this.signCall({ action: 'email', request_id: id, origin: location.origin }) },
  signGet(token) { return this.signCall({ action: 'get', token }) },
  signSubmit(payload) { return this.signCall({ action: 'submit', ...payload }) },
  async recordDecision(jobId, { refused, accepted, declined, extra }) {
    const { error } = await supabase.rpc('record_decision', { p_job: jobId, p_refused: refused, p_accepted: accepted, p_declined: declined, p_extra: extra })
    if (error) throw error
  },
  async updateJob(id, fields) {
    const { error } = await supabase.from('jobs').update(fields).eq('id', id)
    if (error) throw error
  },
  // ---------- time on the job (bench) ----------
  async timeStart(jobId) {
    const { data, error } = await supabase.rpc('time_start', { p_job: jobId })
    if (error) throw error
    return data
  },
  async timeBeat(id) {
    const { data, error } = await supabase.rpc('time_beat', { p_id: id })
    if (error) throw error
    return data
  },
  async timeStop(id) {
    const { error } = await supabase.rpc('time_stop', { p_id: id })
    if (error) throw error
  },
  async jobTime(jobId) {
    const { data, error } = await supabase.rpc('job_time_total', { p_job: jobId })
    if (error) throw error
    return data
  },
  // ---------- settings, ETA, photos ----------
  async loadSettings() {
    const { data, error } = await supabase.from('app_settings').select('*')
    if (error) throw error
    return Object.fromEntries(data.map(r => [r.key, r.value]))
  },
  async saveSetting(key, value) {
    const { error } = await supabase.from('app_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key)
    if (error) throw error
  },
  async queueEta(jobId = null) {
    const { data, error } = await supabase.rpc('queue_eta', { p_job: jobId })
    if (error) throw error
    return data
  },
  async uploadJobPhoto(jobId, blob, label, userId) {
    const path = `${jobId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`
    const up = await supabase.storage.from('job-photos').upload(path, blob, { contentType: 'image/jpeg' })
    if (up.error) throw up.error
    const { error } = await supabase.from('job_photos').insert({ job_id: jobId, file_path: path, label, by_user: userId })
    if (error) throw error
  },
  async photoUrl(photo) {
    const { data, error } = await supabase.storage.from('job-photos').createSignedUrl(photo.file_path, 3600)
    if (error) throw error
    return data.signedUrl
  },
  // ---------- CTR kits + parts on jobs ----------
  async loadKit(family) {
    const { data, error } = await supabase.from('ctr_kit_items').select('*').eq('family', family)
    if (error) throw error
    return data
  },
  async buildKit(jobId) {
    const { data, error } = await supabase.rpc('build_ctr_kit', { p_job: jobId })
    if (error) throw error
    return data
  },
  async addJobPart({ jobId, partId, qty, kind, source, component = null, condition = null, required = null, reason = null }) {
    const { data, error } = await supabase.rpc('add_job_part', {
      p_job: jobId, p_part: partId, p_qty: qty, p_kind: kind, p_source: source,
      p_component: component, p_condition: condition, p_required: required, p_reason: reason,
    })
    if (error) throw error
    return data
  },
  async removeJobPart(lineId) {
    const { data, error } = await supabase.rpc('remove_job_part', { p_line: lineId })
    if (error) throw error
    return data
  },
  async requestReorder(partId, on) {
    const { error } = await supabase.rpc('request_reorder', { p_part: partId, p_on: on })
    if (error) throw error
  },
  async addCondition(row) {
    const { error } = await supabase.from('job_conditions').insert(row)
    if (error) throw error
  },
  async updateCondition(id, fields) {
    const { error } = await supabase.from('job_conditions').update(fields).eq('id', id)
    if (error) throw error
  },
  async addRequest(row) {
    const { error } = await supabase.from('job_requests').insert(row)
    if (error) throw error
  },
  async updateRequest(id, fields) {
    const { error } = await supabase.from('job_requests').update(fields).eq('id', id)
    if (error) throw error
  },
  async uploadJobDoc(jobId, kind, blob, fileName, userId) {
    const path = `${jobId}/${Date.now()}-${fileName}`
    const up = await supabase.storage.from('job-docs').upload(path, blob, { contentType: 'application/pdf' })
    if (up.error) throw up.error
    const { data, error } = await supabase.from('job_docs').insert({ job_id: jobId, kind, file_path: path, file_name: fileName, by_user: userId, fields: blob.fields || null }).select().single()
    if (error) throw error
    return data
  },
  // Any file on a job (Rolex paperwork, emails, scans, photos): kind 'upload' with a label
  async uploadJobFile(jobId, file, label, note, userId) {
    const safe = file.name.replace(/[^\w.\- ]+/g, '_')
    const path = `${jobId}/${Date.now()}-${safe}`
    const up = await supabase.storage.from('job-docs').upload(path, file, { contentType: file.type || 'application/octet-stream' })
    if (up.error) throw up.error
    const { data, error } = await supabase.from('job_docs').insert({ job_id: jobId, kind: 'upload', label, note: note || null, content_type: file.type || null,
      file_path: path, file_name: file.name, by_user: userId }).select().single()
    if (error) throw error
    return data
  },
  // Email a job document to the watch service manager (Edge Function send-doc, parts Gmail)
  async emailJobDoc(docId) {
    const { data, error } = await supabase.functions.invoke('send-doc', { body: { doc_id: docId } })
    if (error) {
      const msg = await error.context?.json?.().then(j => j.error).catch(() => null)
      throw new Error(msg || error.message)
    }
    return data
  },
  async jobDocFile(doc) {
    const { data, error } = await supabase.storage.from('job-docs').download(doc.file_path)
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
  subscribe({ onPart, onModel, onLog, onInbox, onJob }) {
    const ch = supabase
      .channel('live-' + crypto.randomUUID())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parts' }, e => onPart?.(e.new))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'models' }, e => onModel?.(e.new))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'log' }, e => onLog?.(e.new))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inbox' }, e => onInbox?.(e.new))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, e => onJob?.(e.new))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_conditions' }, e => onJob?.({ id: e.new?.job_id }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_requests' }, e => onJob?.({ id: e.new?.job_id }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_parts' }, e => onJob?.({ id: e.new?.job_id }))
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
