import { useEffect, useRef, useState } from 'react'
import { api } from '../data.js'

const IDLE_MS = 60 * 60 * 1000 // no touch on the page for an hour → pause (tablet left open)
const BEAT_MS = 60 * 1000

// Whole minutes only: "0h 07m", "2h 14m"
export const fmtDur = s => {
  const t = Math.max(0, Math.floor(s / 60)), h = Math.floor(t / 60), m = t % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}

// "Time on this job" counter in the job header. While a watchmaker has an open job on screen, time is recorded
// for the job (one job at a time). Pauses when the page is hidden, the tablet sleeps, or nobody touches it for an hour.
export default function JobTimer({ jobId, live, who, isAdmin }) {
  const [base, setBase] = useState(0)        // seconds recorded before this session
  const [people, setPeople] = useState(null)
  const [since, setSince] = useState(null)   // ms when the current session started (running)
  const [paused, setPaused] = useState(false)
  const [, tick] = useState(0)
  const sess = useRef(null)
  const lastTouch = useRef(Date.now())

  const refresh = () => api.jobTime(jobId).then(r => { if (r) { setBase(r.seconds); setPeople(r.people) } }).catch(() => {})

  const stop = async () => {
    const id = sess.current
    sess.current = null; setSince(null)
    if (id) { try { await api.timeStop(id) } catch { /* ends at last beat anyway */ } }
    await refresh()
  }
  const start = async () => {
    if (sess.current || !live || document.hidden) return
    await refresh()
    try {
      const id = await api.timeStart(jobId)
      if (id) { sess.current = id; setSince(Date.now()); lastTouch.current = Date.now() }
    } catch { /* timer is best effort; never block the job page */ }
  }

  useEffect(() => {
    refresh()
    if (!live) return
    setPaused(false)
    start()
    const touch = () => { lastTouch.current = Date.now() }
    const vis = () => (document.hidden ? stop() : !paused && start())
    const beat = setInterval(async () => {
      if (!sess.current) return
      if (Date.now() - lastTouch.current > IDLE_MS) { await stop(); setPaused(true); return }
      try {
        if (!(await api.timeBeat(sess.current))) { sess.current = null; setSince(null); await start() } // lapsed (tablet slept)
      } catch { /* retry next beat */ }
    }, BEAT_MS)
    const clock = setInterval(() => tick(t => t + 1), 10000)
    ;['pointerdown', 'keydown', 'scroll'].forEach(e => window.addEventListener(e, touch, { passive: true }))
    document.addEventListener('visibilitychange', vis)
    return () => {
      clearInterval(beat); clearInterval(clock)
      ;['pointerdown', 'keydown', 'scroll'].forEach(e => window.removeEventListener(e, touch))
      document.removeEventListener('visibilitychange', vis)
      stop()
    }
  }, [jobId, live])

  const shown = base + (since ? (Date.now() - since) / 1000 : 0)
  const resume = () => { setPaused(false); start() }
  const pause = async () => { await stop(); setPaused(true) }

  return (
    <div className="jobtimer">
      <button type="button" className={`timer${since ? ' on' : ''}`} onClick={live ? (since ? pause : resume) : undefined}
        title={live ? (since ? 'Pause' : 'Resume') : 'Time on this job'} aria-label={`Time on this job ${fmtDur(shown)}${live ? (since ? ', tap to pause' : ', tap to resume') : ''}`}>
        <span className="timer-label">On this job</span>
        <span className="timer-value">{fmtDur(shown)}</span>
        {live && !since && <span className="timer-label">{paused ? 'paused · tap' : '—'}</span>}
      </button>
      {isAdmin && people?.length > 0 && (
        <div className="msg timer-people">{people.map(p => `${who(p.user_id)} ${fmtDur(p.seconds)}`).join(' · ')}</div>
      )}
    </div>
  )
}
