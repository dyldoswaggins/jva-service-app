// Watchmakers a job can be assigned to (Richard, 2026-11-27): jobs.assigned_to = first name; list in app_settings 'watchmakers'.
// Each has its own colour (never red / green, §8): 1st blue, 2nd plum, 3rd teal, 4th ochre; unassigned grey.
import { useEffect, useState } from 'react'
import { api } from './data.js'

export const WATCHMAKERS = ['Emmanuel', 'Jared']
export const wmNames = settings => {
  const n = settings?.watchmakers?.names
  return Array.isArray(n) && n.filter(Boolean).length ? n.filter(Boolean) : WATCHMAKERS
}
// CSS class with the watchmaker's colour (styles.css .wmc-0 … .wmc-4)
export const wmClass = (name, names) => {
  const i = name ? names.indexOf(name) : -1
  return `wmc-${i < 0 ? 0 : (i % 4) + 1}`
}

// The list, loaded once per screen
export function useWatchmakers() {
  const [names, setNames] = useState(WATCHMAKERS)
  useEffect(() => { api.loadSettings().then(s => setNames(wmNames(s))).catch(() => {}) }, [])
  return names
}

// Which watchmaker's work this iPad / computer shows: 'all' or a name (kept on the device)
export function useWatchmakerScope() {
  const [scope, set] = useState(() => { try { return localStorage.getItem('jva.wm') || 'all' } catch { return 'all' } })
  const setScope = v => { set(v); try { localStorage.setItem('jva.wm', v) } catch { /* private mode */ } }
  return [scope, setScope]
}
