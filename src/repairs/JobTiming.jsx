import { useState } from 'react'
import { api } from '../data.js'
import { fmtTime } from '../rules.js'
import { makeTimingSheet } from '../docs/timingSheet.js'

// Rolex TIMING ANALYSIS (Ref. E6220-11), entered by the watchmaker. Workshop + archive only (never given to the client).
// 1st criterion = max − min of all rates; 2nd criterion = average rate at 0 hr; actual daily rate = average of the 4-day differences.
export const POSITIONS = ['Crown left', 'Crown down', 'Crown up', 'Dial up', 'Dial down']
export const OBS = ['Manual winding maximum (0 hr)', 'Dial up / 24 hr', 'Cyclostock / 24 hr', 'Crown up / 24 hr']
const n = v => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v))
const r1 = v => (v == null ? null : Math.round(v * 10) / 10)

export function timingCalc(s) {
  const rates = s.pos.flatMap(p => [n(p.r24), n(p.r0)]).filter(v => v != null)
  const zero = s.pos.map(p => n(p.r0)).filter(v => v != null)
  const diffs = s.obs.slice(1).map(o => n(o.diff)).filter(v => v != null)
  return {
    c1: rates.length ? r1(Math.max(...rates) - Math.min(...rates)) : null,
    c2: zero.length ? r1(zero.reduce((a, b) => a + b, 0) / zero.length) : null,
    daily: diffs.length ? r1(diffs.reduce((a, b) => a + b, 0) / diffs.length) : null,
  }
}
const blank = (job, name) => ({ watchmaker: name || '', calibre: job.calibre || '', repair: job.edge_no, movement_serial: job.movement_serial || '',
  case_serial: job.serial || '', case_ref: job.watch_ref || '', pos: POSITIONS.map(() => ({ r24: '', a24: '', r0: '', a0: '' })),
  obs: OBS.map(() => ({ date: '', time: '', state: '', diff: '' })), pr: { date: '', time: '', hours: '' }, result: '' })

// Final QC (Dylan, 2026-11-12): after the timing passes, a second watchmaker checks the watch; the watchmaker presses the button to record
// their sign-off. Invoice, Done and Ready for pickup wait for it.
function FinalQc({ job, can, userId, who, actions, onChange, passed }) {
  const [checker, setChecker] = useState('')
  const [msg, setMsg] = useState('')
  const run = async (fields, done) => { setMsg(''); try { await api.updateJob(job.id, fields); actions.say(done); onChange() } catch (e) { setMsg(e.message) } }
  if (job.qc_at) return (
    <div className="flagline good">✓ Final QC signed off by <b>{job.qc_checker || 'second watchmaker'}</b> · {fmtTime(job.qc_at)}{job.qc_by ? ` · recorded by ${who(job.qc_by)}` : ''}
      {can.bench && <button type="button" className="btn" onClick={() => run({ qc_at: null, qc_by: null, qc_checker: null }, 'Final QC sign-off removed')}>Undo</button>}
    </div>
  )
  return (
    <div className="subpanel qc">
      <b>Final QC</b>
      {!passed ? <p className="msg">After the timing analysis passes: a second watchmaker checks the watch, then sign it off here. The invoice and completion wait for it.</p> : (
        <>
          <p className="msg">A second watchmaker checks the finished watch. Press the button once they have signed it off.</p>
          {can.bench && (
            <div className="actions">
              <input value={checker} onChange={e => setChecker(e.target.value)} placeholder="Checked by (second watchmaker)" style={{ minWidth: 240 }} />
              <button type="button" className="btn solid" disabled={checker.trim().length < 2}
                onClick={() => run({ qc_at: new Date().toISOString(), qc_by: userId || null, qc_checker: checker.trim() }, 'Final QC signed off')}>✓ Final QC signed off</button>
            </div>
          )}
        </>
      )}
      {msg && <p className="msg warn">{msg}</p>}
    </div>
  )
}

export default function JobTiming({ job, can, userId, who, actions, onChange }) {
  const sheets = job.timing || []
  const last = sheets[sheets.length - 1]
  const [s, setS] = useState(null)
  const [msg, setMsg] = useState('')
  const calc = s ? timingCalc(s) : null
  const setPos = (i, k, v) => setS({ ...s, pos: s.pos.map((p, j) => (j === i ? { ...p, [k]: v } : p)) })
  const setObs = (i, k, v) => setS({ ...s, obs: s.obs.map((o, j) => (j === i ? { ...o, [k]: v } : o)) })

  async function save() {
    setMsg('')
    if (!s.result) return setMsg('Mark the result: passed or not passed.')
    const sheet = { ...s, ...timingCalc(s), id: s.id || crypto.randomUUID(), at: new Date().toISOString(), by: userId }
    try {
      await api.updateJob(job.id, { timing: s.id ? sheets.map(x => (x.id === s.id ? sheet : x)) : [...sheets, sheet] })
      actions.say('Timing analysis saved'); setS(null); onChange()
    } catch (e) { setMsg(e.message) }
  }
  const print = async sheet => window.open(URL.createObjectURL(await makeTimingSheet({ sheet, job })), '_blank')
  const inp = (v, on, w = 64, ph = '') => <input value={v} onChange={e => on(e.target.value)} style={{ width: w }} inputMode="decimal" placeholder={ph} />

  return (
    <section className="panel">
      <div className="actions">
        <h3 className="grow">Timing analysis</h3>
        {last && <button type="button" className="btn" onClick={() => print(last)}>Print</button>}
        {can.bench && !s && <button type="button" className="btn solid" onClick={() => setS(last ? { ...last } : blank(job, who(userId)))}>{last ? 'Edit' : 'Enter timing'}</button>}
        {can.bench && !s && last && <button type="button" className="btn" onClick={() => setS(blank(job, who(userId)))}>New test</button>}
      </div>
      {!s && (last
        ? <p className="msg">{last.result === 'pass' ? '✓ Passed' : '✗ Not passed'} · 1st criterion {last.c1 ?? '—'} · 2nd {last.c2 ?? '—'} · daily rate {last.daily ?? '—'} s/d · power reserve {last.pr?.hours || '—'} h · {last.watchmaker} · {fmtTime(last.at)}{sheets.length > 1 ? ` · ${sheets.length} tests` : ''}</p>
        : <p className="msg">No timing entered yet (Rolex requires one per watch serviced).</p>)}
      {!s && <FinalQc job={job} can={can} userId={userId} who={who} actions={actions} onChange={onChange} passed={last?.result === 'pass'} />}
      {s && (
        <div className="stack timing">
          <div className="grid">
            {[['watchmaker', 'Watchmaker'], ['calibre', 'Calibre'], ['repair', 'Repair number'], ['movement_serial', 'Movement serial number'], ['case_serial', 'Case serial number'], ['case_ref', 'Case reference']].map(([k, l]) => (
              <label key={k}>{l}<input value={s[k]} onChange={e => setS({ ...s, [k]: e.target.value })} /></label>
            ))}
          </div>
          <table className="imp">
            <thead><tr><th>Position</th><th className="r">Rate at 24 hr</th><th className="r">Amplitude (°)</th><th className="r">Rate at 0 hr</th><th className="r">Amplitude (°)</th></tr></thead>
            <tbody>{POSITIONS.map((p, i) => (
              <tr key={p}><td>{p}</td><td className="r">{inp(s.pos[i].r24, v => setPos(i, 'r24', v))}</td><td className="r">{inp(s.pos[i].a24, v => setPos(i, 'a24', v))}</td>
                <td className="r">{inp(s.pos[i].r0, v => setPos(i, 'r0', v))}</td><td className="r">{inp(s.pos[i].a0, v => setPos(i, 'a0', v))}</td></tr>
            ))}</tbody>
          </table>
          <p><b>1st criterion</b> <span className="msg">(difference between minimum and maximum rate values)</span>: <b>{calc.c1 ?? '—'}</b> · <b>2nd criterion</b> <span className="msg">(average rate at 0 hr)</span>: <b>{calc.c2 ?? '—'}</b></p>
          <b>Observation for 4 days with case back tightened and locked</b>
          <table className="imp">
            <thead><tr><th>Day</th><th>Date</th><th>Time</th><th>Position</th><th className="r">State</th><th className="r">Difference</th></tr></thead>
            <tbody>{OBS.map((o, i) => (
              <tr key={o}><td>{i}</td><td><input type="date" value={s.obs[i].date} onChange={e => setObs(i, 'date', e.target.value)} /></td>
                <td><input type="time" value={s.obs[i].time} onChange={e => setObs(i, 'time', e.target.value)} /></td><td>{o}</td>
                <td className="r">{inp(s.obs[i].state, v => setObs(i, 'state', v))}</td><td className="r">{i ? inp(s.obs[i].diff, v => setObs(i, 'diff', v)) : '—'}</td></tr>
            ))}
              <tr><td>4</td><td><input type="date" value={s.pr.date} onChange={e => setS({ ...s, pr: { ...s.pr, date: e.target.value } })} /></td>
                <td><input type="time" value={s.pr.time} onChange={e => setS({ ...s, pr: { ...s.pr, time: e.target.value } })} /></td><td>Power reserve (hr)</td>
                <td className="r">{inp(s.pr.hours, v => setS({ ...s, pr: { ...s.pr, hours: v } }))}</td><td /></tr>
            </tbody>
          </table>
          <p><b>Actual daily rate</b> <span className="msg">(average difference)</span>: <b>{calc.daily ?? '—'} s/d</b></p>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={s.result === 'pass'} onClick={() => setS({ ...s, result: 'pass' })}>✓ Passed</button>
            <button type="button" className="chip" aria-pressed={s.result === 'fail'} onClick={() => setS({ ...s, result: 'fail' })}>✗ Not passed</button>
          </div>
          {msg && <p className="msg warn">{msg}</p>}
          <div className="actions"><button type="button" className="btn solid" onClick={save}>Save timing</button><button type="button" className="btn" onClick={() => { setS(null); setMsg('') }}>Cancel</button></div>
        </div>
      )}
    </section>
  )
}
