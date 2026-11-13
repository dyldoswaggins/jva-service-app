import { useEffect, useState } from 'react'
import { api } from './data.js'
import { CHECKLIST, CHECKLIST_GROUPS } from './buildChecklist.js'
import { fmtTime } from './rules.js'

// Admin: the build checklist — what's still needed to finish the app. Ticks / notes / added items saved in app_settings.build_checklist.
export default function ChecklistView({ actions }) {
  const [state, setState] = useState(null) // { items: { id: { done, at, note } }, custom: [] }
  const [show, setShow] = useState('open')
  const [add, setAdd] = useState(null)
  useEffect(() => { api.loadSettings().then(s => setState({ items: {}, custom: [], ...(s.build_checklist || {}) })).catch(e => actions.say(e.message)) }, [])
  if (!state) return <p className="msg">Loading…</p>

  const save = async next => { setState(next); try { await api.saveSetting('build_checklist', next) } catch (e) { actions.say(e.message) } }
  const all = [...CHECKLIST, ...state.custom]
  const isDone = it => state.items[it.id]?.done ?? !!it.done
  const tick = it => save({ ...state, items: { ...state.items, [it.id]: { ...state.items[it.id], done: !isDone(it), at: new Date().toISOString() } } })
  const note = (it, v) => v !== (state.items[it.id]?.note || '') && save({ ...state, items: { ...state.items, [it.id]: { ...state.items[it.id], note: v } } })
  const addItem = () => {
    if (!add.title.trim()) return
    save({ ...state, custom: [...state.custom, { id: 'c' + Date.now(), group: add.group, who: add.who.trim(), title: add.title.trim(), detail: add.detail.trim() }] })
    setAdd(null)
  }
  const open = all.filter(it => !isDone(it)).length

  return (
    <div className="panel checklist-view">
      <div className="actions">
        <h2 className="grow">Build checklist <span className="msg">· {open} open</span></h2>
        <div className="chips small">
          <button type="button" className="chip" aria-pressed={show === 'open'} onClick={() => setShow('open')}>Open</button>
          <button type="button" className="chip" aria-pressed={show === 'all'} onClick={() => setShow('all')}>All</button>
        </div>
        {!add && <button type="button" className="btn solid" onClick={() => setAdd({ title: '', detail: '', who: '', group: 'Information needed' })}>+ Item</button>}
      </div>
      <p className="msg">What's still needed to finish the app: information only JVA has, things to build, and setup that needs a person. Tick when done; notes are saved.</p>
      {add && (
        <div className="subpanel">
          <div className="grid">
            <label>Item<input autoFocus value={add.title} onChange={e => setAdd({ ...add, title: e.target.value })} /></label>
            <label>Who<input value={add.who} onChange={e => setAdd({ ...add, who: e.target.value })} placeholder="Dylan, Jared, Claude…" /></label>
            <label>Group<select value={add.group} onChange={e => setAdd({ ...add, group: e.target.value })}>{CHECKLIST_GROUPS.filter(g => g !== 'Done').map(g => <option key={g}>{g}</option>)}</select></label>
          </div>
          <label className="stackfield">Details<input value={add.detail} onChange={e => setAdd({ ...add, detail: e.target.value })} /></label>
          <div className="actions"><button type="button" className="btn solid" onClick={addItem}>Add</button><button type="button" className="btn" onClick={() => setAdd(null)}>Cancel</button></div>
        </div>
      )}
      {CHECKLIST_GROUPS.map(g => {
        const items = all.filter(it => it.group === g && (show === 'all' || !isDone(it) || g === 'Done'))
        if (!items.length || (g === 'Done' && show === 'open')) return null
        return (
          <section key={g} className="cl-group">
            <h3>{g} <span className="count">{all.filter(it => it.group === g && !isDone(it)).length || '✓'}</span></h3>
            {items.map(it => {
              const st = state.items[it.id] || {}
              return (
                <div key={it.id} className={`cl-item${isDone(it) ? ' done' : ''}`}>
                  <input type="checkbox" checked={isDone(it)} onChange={() => tick(it)} aria-label={`Done: ${it.title}`} />
                  <div className="grow">
                    <b>{it.title}</b>{it.who && <span className="tag">{it.who}</span>}
                    {it.detail && <div className="msg">{it.detail}</div>}
                    <input className="cl-note" defaultValue={st.note || ''} placeholder="Note / answer" onBlur={e => note(it, e.target.value.trim())} />
                    {st.at && <span className="msg"> {isDone(it) ? 'ticked' : 'reopened'} {fmtTime(st.at)}</span>}
                  </div>
                </div>
              )
            })}
          </section>
        )
      })}
      {show === 'open' && <p className="msg">Done items are under All.</p>}
    </div>
  )
}
