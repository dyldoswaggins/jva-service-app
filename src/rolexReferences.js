// Rolex references the models table doesn't have yet, so the intake can suggest them (Richard, 2026-11-25).
// The models table (413 researched references, mostly 5–6 digit) stays the main list and wins when both have a reference;
// this adds well-known 4-digit vintage references and the newest releases. Names are the usual model names; calibre only
// where it is certain (vintage watches go to Rolex Toronto from the 4-digit reference whatever the calibre).
// Sales can always type a reference or name that isn't listed.
export const EXTRA_REFERENCES = [
  // Vintage (4-digit): Rolex Toronto
  { ref: '1002', name: 'Oyster Perpetual' }, { ref: '1005', name: 'Oyster Perpetual' }, { ref: '1007', name: 'Oyster Perpetual' },
  { ref: '1500', name: 'Oyster Perpetual Date' }, { ref: '1501', name: 'Oyster Perpetual Date' }, { ref: '6694', name: 'Oysterdate Precision' },
  { ref: '1601', name: 'Datejust' }, { ref: '1603', name: 'Datejust' }, { ref: '6605', name: 'Datejust' }, { ref: '1625', name: 'Datejust Turn-o-graph' },
  { ref: '1803', name: 'Day-Date' }, { ref: '1807', name: 'Day-Date' }, { ref: '6611', name: 'Day-Date' },
  { ref: '5500', name: 'Air-King' }, { ref: '5700', name: 'Air-King Date' },
  { ref: '1016', name: 'Explorer' }, { ref: '6350', name: 'Explorer' }, { ref: '6610', name: 'Explorer' }, { ref: '1655', name: 'Explorer II' },
  { ref: '6200', name: 'Submariner' }, { ref: '6204', name: 'Submariner' }, { ref: '6205', name: 'Submariner' }, { ref: '6536', name: 'Submariner' },
  { ref: '6538', name: 'Submariner' }, { ref: '5508', name: 'Submariner' }, { ref: '5510', name: 'Submariner' }, { ref: '5512', name: 'Submariner' },
  { ref: '5513', name: 'Submariner' }, { ref: '5517', name: 'Submariner (MilSub)' }, { ref: '1680', name: 'Submariner Date' },
  { ref: '1665', name: 'Sea-Dweller' }, { ref: '6542', name: 'GMT-Master' }, { ref: '1675', name: 'GMT-Master' },
  { ref: '6541', name: 'Milgauss' }, { ref: '1019', name: 'Milgauss' },
  { ref: '6234', name: 'Chronograph' }, { ref: '6238', name: 'Chronograph' },
  { ref: '6239', name: 'Cosmograph Daytona' }, { ref: '6241', name: 'Cosmograph Daytona' }, { ref: '6262', name: 'Cosmograph Daytona' },
  { ref: '6264', name: 'Cosmograph Daytona' }, { ref: '6263', name: 'Cosmograph Daytona' }, { ref: '6265', name: 'Cosmograph Daytona' },
  // Newest releases
  { ref: '136660DB', name: 'Deepsea D-Blue 44', cal: '3235' }, { ref: '126067', name: 'Deepsea Challenge 50', cal: '3230' },
  { ref: '52506', name: '1908 39', cal: '7140' }, { ref: '52508', name: '1908 39', cal: '7140' }, { ref: '52509', name: '1908 39', cal: '7140' },
  { ref: '127334', name: 'Land-Dweller 40', cal: '7135' }, { ref: '127234', name: 'Land-Dweller 36', cal: '7135' },
]

const plain = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^M(?=\d)/, '')

// One list for suggestions: the models table first, then the extra references it doesn't have
export function referenceCatalog(models) {
  const out = new Map()
  for (const m of models?.values?.() || []) if (m.ref) out.set(plain(m.ref), { ref: String(m.ref).toUpperCase(), name: m.name || '', cal: String(m.cal || '').split(/[,\s]+/)[0] || '' })
  for (const r of EXTRA_REFERENCES) if (!out.has(plain(r.ref))) out.set(plain(r.ref), { ref: r.ref, name: r.name, cal: r.cal || '' })
  return [...out.values()]
}

// Name results: 6-digit (current) references before 5- and 4-digit, plain references before gem-set/variant suffixes, newest first
const digits = r => (plain(r.ref).match(/^\d+/)?.[0] || '')
const byNewest = (a, b) => digits(b).length - digits(a).length || plain(a.ref).length - plain(b.ref).length || digits(b).localeCompare(digits(a)) || a.ref.localeCompare(b.ref)

// Best matches for what was typed in the model number (by = 'ref') or model name (by = 'name') field
export function suggestReferences(catalog, q, by = 'ref', limit = 8) {
  if (by === 'ref') {
    const p = plain(q)
    if (!p) return []
    const starts = catalog.filter(r => plain(r.ref).startsWith(p))
    const has = catalog.filter(r => !plain(r.ref).startsWith(p) && plain(r.ref).includes(p))
    return [...starts.sort((a, b) => a.ref.length - b.ref.length || a.ref.localeCompare(b.ref)), ...has].slice(0, limit)
  }
  const words = String(q || '').toLowerCase().split(/[\s-]+/).filter(Boolean)
  if (!words.length) return []
  const n = s => String(s || '').toLowerCase().replace(/-/g, ' ')
  return catalog.filter(r => words.every(w => n(r.name).includes(w))).sort(byNewest).slice(0, limit)
}
export const stripM = s => String(s || '').trim().toUpperCase().replace(/^M(?=\d)/, '')
