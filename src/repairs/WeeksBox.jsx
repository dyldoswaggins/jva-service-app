import { useState } from 'react'
import { LEAD_TIMES } from '../savCatalog.js'

// Estimated weeks / service lead time: type anything, or tap ▾ for Approximately 2 … 18 weeks.
// Same box at Sales intake and on the Service Manager's SAV sheet (Richard, 2026-11-27).
// onChange: every keystroke / pick; onCommit: when the box is left or a week is picked (to save).
export default function WeeksBox({ value, onChange, onCommit, placeholder = 'Approximately 2 weeks' }) {
  const [open, setOpen] = useState(false)
  const pick = v => { onChange?.(v); onCommit?.(v); setOpen(false) }
  return (
    <span className="weeksbox">
      <span className="combo">
        <input value={value || ''} onChange={e => onChange?.(e.target.value)} onFocus={() => setOpen(true)}
          onBlur={e => { setOpen(false); onCommit?.(e.target.value.trim()) }} placeholder={placeholder} autoComplete="off" />
        <button type="button" className="combo-btn" aria-label="Show the weeks" onPointerDown={e => { e.preventDefault(); setOpen(o => !o) }}>▾</button>
      </span>
      {open && (
        <ul className="suggest" role="listbox">
          {LEAD_TIMES.map(v => (
            <li key={v} role="option" aria-selected={value === v} onPointerDown={e => { e.preventDefault(); pick(v) }}><span>{v}</span></li>
          ))}
        </ul>
      )}
    </span>
  )
}

// Same box keeping its own text, saved when left or picked (SAV sheet: jobs.lead_time)
export function WeeksField({ initial, onSave, placeholder }) {
  const [v, setV] = useState(initial || '')
  return <WeeksBox value={v} onChange={setV} onCommit={x => x !== (initial || '') && onSave(x)} placeholder={placeholder} />
}
