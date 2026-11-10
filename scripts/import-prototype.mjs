// One-off import of the claude.ai Parts export (data/*.json) into Supabase.
// Needs a temporary import token created in the database (tmp_import_rows); see CLAUDE.md.
// Usage: node scripts/import-prototype.mjs <token>
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env.local'), 'utf8')
    .split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
)
const token = process.argv[2]
if (!token) { console.error('Usage: node scripts/import-prototype.mjs <token>'); process.exit(1) }

async function send(table, rows) {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/tmp_import_rows`, {
    method: 'POST',
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token, p_table: table, p_rows: rows }),
  })
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
  return res.json()
}

for (const table of ['parts', 'models', 'log']) {
  const rows = JSON.parse(fs.readFileSync(path.join(root, 'data', `${table}.json`), 'utf8'))
  let done = 0
  for (let i = 0; i < rows.length; i += 200) done += await send(table, rows.slice(i, i + 200))
  console.log(`${table}: ${done} of ${rows.length} imported`)
}
