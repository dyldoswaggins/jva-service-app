// One shared connection to the Supabase database.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Open access (Dylan, 2026-11-12, "fully open for now"): no sign-in; the app opens on a role picker and sends the chosen role as the
// "x-app-role" header, which the database trusts only while app_settings.open_access is on (migration 030). VITE_ACCESS=signin turns
// the picker off (sign-in screen again).
export const OPEN_ACCESS = import.meta.env.VITE_ACCESS !== 'signin'
export const ROLE_KEY = 'jva.role'
export const chosenRole = () => { try { return localStorage.getItem(ROLE_KEY) || '' } catch { return '' } }
export const chooseRole = r => { try { if (r) localStorage.setItem(ROLE_KEY, r); else localStorage.removeItem(ROLE_KEY) } catch { /* private mode */ } location.reload() }

export const isConfigured = Boolean(url && key)
export const supabase = isConfigured
  ? createClient(url, key, OPEN_ACCESS && chosenRole() ? { global: { headers: { 'x-app-role': chosenRole() } } } : undefined)
  : null
