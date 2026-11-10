import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './data.js'
import { isCounted, money, num, reorderList } from './rules.js'
import PartsView from './parts/PartsView.jsx'
import ReorderView from './parts/ReorderView.jsx'
import HistoryView from './parts/HistoryView.jsx'
import ModelsView from './parts/ModelsView.jsx'
import InboxView from './parts/InboxView.jsx'
import SignIn from './SignIn.jsx'
import JobsView from './repairs/JobsView.jsx'

const VIEWS = ['Jobs', 'Parts', 'Reorder', 'History', 'Models', 'Inbox']

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = checking
  useEffect(() => {
    if (!api.configured) return setSession(null)
    api.session().then(setSession)
    return api.onAuth(setSession)
  }, [])

  if (!api.configured) return <Shell><p className="msg">Not connected to the database yet.</p></Shell>
  if (session === undefined) return <Shell><p className="msg">Loading…</p></Shell>
  if (!session) return <Shell><SignIn /></Shell>
  return <Workshop session={session} />
}

function Shell({ children, right }) {
  return (
    <>
      <header className="top">
        <div className="wrap top-in">
          <h1><small>J. Vair Anderson</small>Watch service</h1>
          {right}
        </div>
      </header>
      <main className="wrap page">{children}</main>
    </>
  )
}

function Workshop({ session }) {
  const [parts, setParts] = useState(null) // Map id → part
  const [models, setModels] = useState(new Map())
  const [profiles, setProfiles] = useState([])
  const [view, setView] = useState('Jobs')
  const [loadError, setLoadError] = useState('')
  const [toast, setToast] = useState(null)
  const [modelFilter, setModelFilter] = useState('')
  const toastTimer = useRef()

  useEffect(() => {
    api.loadAll()
      .then(d => {
        setParts(new Map(d.parts.map(p => [p.id, p])))
        setModels(new Map(d.models.map(m => [m.id, m])))
        setProfiles(d.profiles)
      })
      .catch(e => setLoadError(e.message || String(e)))
    return api.subscribe({
      onPart: p => p?.id && setParts(m => m && new Map(m).set(p.id, p)),
      onModel: x => x?.id && setModels(m => new Map(m).set(x.id, x)),
    })
  }, [])

  const me = profiles.find(p => p.id === session.user.id) || { role: 'view' }
  const role = me.role || 'view'
  const can = {
    count: role === 'admin', edit: role === 'admin', models: role === 'admin' || role === 'watchmaker',
    intake: role === 'admin' || role === 'sales',                       // take in a watch, see signed receipts
    bench: role === 'admin' || role === 'watchmaker',                   // confirm conditions / requests
    status: ['admin', 'sales', 'watchmaker'].includes(role),            // change status, edit watch details
    costs: role === 'admin',                                            // what JVA pays (watchmakers see retail only)
  }

  const who = useCallback(
    (id, legacy) => {
      const p = profiles.find(x => (id && x.id === id) || (legacy && x.legacy_id === legacy))
      return p ? p.name || p.email || 'Someone' : legacy === 'claude' ? 'Research' : id || legacy ? 'Someone' : ''
    },
    [profiles]
  )

  const say = useCallback((text, undo) => {
    clearTimeout(toastTimer.current)
    setToast({ text, undo })
    toastTimer.current = setTimeout(() => setToast(null), undo ? 8000 : 4000)
  }, [])
  const put = p => setParts(m => new Map(m).set(p.id, p))

  const actions = useMemo(
    () => ({
      // Count = set the stock count (Admin). Undo sets it back.
      async count(p, qty, src = 'Count') {
        qty = Math.max(0, Math.round(qty))
        if (p.qty === qty) return
        const prev = p.qty
        try {
          put(await api.stockChange({ partId: p.id, type: 'Count', qty, src }))
          say(`${p.rmc}: ${prev ?? '–'} → ${qty}`, prev == null ? null : async () => {
            put(await api.stockChange({ partId: p.id, type: 'Count', qty: prev, src: 'Undo' }))
            say(`${p.rmc} back to ${prev}`)
          })
        } catch (e) { say(e.message) }
      },
      async update(p, fields, label = 'Saved') {
        const before = Object.fromEntries(Object.keys(fields).map(k => [k, p[k] ?? null]))
        try {
          put(await api.updatePart(p.id, fields))
          say(`${p.rmc}: ${label}`, async () => { put(await api.updatePart(p.id, before)); say(`${p.rmc}: undone`) })
        } catch (e) { say(e.message) }
      },
      async add(row) {
        try { put(await api.addPart(row)); say(`${row.rmc} added`); return true } catch (e) { say(e.message); return false }
      },
      async saveModel(id, fields, insert) {
        try {
          const m = await api.saveModel(id, { ...fields, by_user: session.user.id, at: new Date().toISOString() }, insert)
          setModels(x => new Map(x).set(m.id, m))
          return true
        } catch (e) { say(e.message); return false }
      },
      showModel(id) { setModelFilter(id); setView('Parts') },
      goInbox() { setView('Inbox') },
      say,
      async reload() {
        const d = await api.loadAll()
        setParts(new Map(d.parts.map(p => [p.id, p])))
      },
    }),
    [say, session.user.id]
  )

  const list = useMemo(() => (parts ? [...parts.values()].filter(p => !p.archived) : []), [parts])
  const counted = list.filter(isCounted)
  const reorderN = useMemo(() => reorderList(list).length, [list])

  const totals = parts && (
    <div className="totals" aria-live="polite">
      <span>Counted <b>{num(counted.length)} / {num(list.length)}</b></span>
      <span>Units <b>{num(counted.reduce((s, p) => s + p.qty, 0))}</b></span>
      {can.costs && <span>Value <b>{money(counted.reduce((s, p) => s + p.qty * (Number(p.price) || 0), 0))}</b></span>}
      <span className="me">
        {me.name || me.email || session.user.email} · {role === 'view' ? 'View only' : role[0].toUpperCase() + role.slice(1)}
        {api.mode === 'demo' && <b className="tag warn">Demo</b>}
        <button className="btn" onClick={api.signOut}>Sign out</button>
      </span>
    </div>
  )

  return (
    <Shell right={totals}>
      {loadError && <p className="msg warn">Couldn't load the parts list: {loadError}</p>}
      {!parts && !loadError && <p className="msg">Loading the parts list…</p>}
      {parts && (
        <>
          <div className="views" role="group" aria-label="View">
            {VIEWS.filter(v => v !== 'Inbox' || can.edit).map(v => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
                {v}{v === 'Reorder' && reorderN ? ` (${reorderN})` : ''}
              </button>
            ))}
          </div>
          {role === 'view' && <p className="msg">You can view everything. Ask Dylan for a role to make changes.</p>}
          {view === 'Jobs' && <JobsView models={models} can={can} actions={actions} userId={session.user.id} who={who} />}
          {view === 'Parts' && (
            <PartsView parts={list} allParts={parts} models={models} can={can} actions={actions} who={who}
              modelFilter={modelFilter} setModelFilter={setModelFilter} />
          )}
          {view === 'Reorder' && <ReorderView parts={list} can={can} />}
          {view === 'History' && <HistoryView who={who} can={can} actions={actions} />}
          {view === 'Models' && <ModelsView models={models} parts={list} can={can} actions={actions} />}
          {view === 'Inbox' && can.edit && <InboxView allParts={parts} actions={actions} userId={session.user.id} />}
        </>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && (
            <button className="btn" onClick={() => { const u = toast.undo; setToast(null); u() }}>Undo</button>
          )}
        </div>
      )}
    </Shell>
  )
}
