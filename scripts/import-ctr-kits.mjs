// Import Jared's calibre lists as CTR kits. Needs a temporary import token (tmp_import_kits), dropped afterwards.
// Usage: node scripts/import-ctr-kits.mjs "<Calibre Inventory folder>" <token>
// Kit rule: Always Change + Always Order + screws with a per-job quantity are consumed on every CTR (auto).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readLists } from './read-ctr-lists.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/).filter(l => l.includes('='))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const [dir, token] = process.argv.slice(2)
const parts = JSON.parse(fs.readFileSync(path.join(root, 'data', 'parts.json'), 'utf8'))
const nameOf = new Map(parts.map(p => [String(p.rmc).toUpperCase(), p.name || '']))

const rows = (await readLists(dir)).map(r => ({
  ...r,
  auto: r.status === 'always_change' || r.status === 'always_order' ||
    (r.status === 'often_changed' && (/screw/i.test(r.note) || /screw/i.test(nameOf.get(r.rmc) || ''))),
}))
const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/tmp_import_kits`, {
  method: 'POST', headers: { apikey: env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_token: token, p_rows: rows }),
})
console.log(res.status, await res.text(), `(${rows.length} rows, ${rows.filter(r => r.auto).length} in the automatic kit)`)
