// Run the Rolex document reader over every Rolex PDF in a folder and report what it found (no client names printed).
// Usage: node scripts/test-rolex-import.mjs "<folder>" [file-prefix-to-print]
import fs from 'node:fs'
import path from 'node:path'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseRolexDoc, pdfLines } from '../src/docs/rolexImport.js'
const dir = process.argv[2]; const kinds = {}; const problems = []; let ok = 0
const read = async f => parseRolexDoc(await pdfLines(pdfjs, new Uint8Array(fs.readFileSync(path.join(dir, f)))))
for (const f of fs.readdirSync(dir).filter(x => x.toLowerCase().endsWith('.pdf'))) {
  try {
    const d = await read(f)
    kinds[d.kind || 'unknown'] = (kinds[d.kind || 'unknown'] || 0) + 1
    if (d.kind !== 'invoice' && (d.warnings.length || !d.job_ref || (d.kind === 'estimate' && !d.analysis)))
      problems.push(`${f.slice(0, 22)} ${d.kind} ref:${d.job_ref} nec:${d.necessary.length} opt:${d.optional.length} :: ${d.warnings.join('; ') || (!d.job_ref ? 'no job ref' : 'no analysis')}`)
    else ok++
  } catch (e) { problems.push(`${f.slice(0, 22)} ERROR ${e.message}`) }
}
console.log('kinds', JSON.stringify(kinds), 'clean', ok, 'flagged', problems.length)
console.log(problems.slice(0, 40).join('\n'))
if (process.argv[3]) { const d = await read(fs.readdirSync(dir).find(x => x.startsWith(process.argv[3]))); console.log(JSON.stringify({ ...d, notes: d.notes.map(n => n.slice(0, 90)) }, null, 1)) }
