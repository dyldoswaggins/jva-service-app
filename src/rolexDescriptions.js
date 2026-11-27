// Bracelet and dial descriptions suggested while the associate types at intake (Richard, 2026-11-27).
// Built from Rolex's bracelet families, metals, dial colours and hour markers; tapping one fills the box, anything can still be typed.
const BRACELETS = ['Oyster', 'Oyster Fliplock', 'Jubilee', 'President', 'Pearlmaster', 'Oysterflex', 'Leather strap', 'Rubber strap']
const METALS = ['Oystersteel', 'Steel', 'Yellow Rolesor', 'White Rolesor', 'Everose Rolesor', '18 ct yellow gold', '18 ct white gold', '18 ct Everose gold', '950 platinum']
const COLOURS = ['black', 'blue', 'bright blue', 'white', 'silver', 'champagne', 'grey', 'slate', 'green', 'olive green', 'mint green', 'chocolate',
  'sundust', 'rhodium', 'aubergine', 'pink', 'turquoise', 'ice blue', 'mother-of-pearl', 'white mother-of-pearl', 'meteorite', 'black and white (Panda)']
const MARKERS = ['markers', 'markers w lgn', 'Roman numerals', 'Arabic numerals', 'diamonds', 'diamond markers', 'index', 'baton markers', 'fluted motif', 'jubilee motif']

const braceletList = [...BRACELETS.flatMap(b => METALS.map(m => `Rolex ${b} ${m}`))]
const dialList = COLOURS.flatMap(c => MARKERS.map(m => `${c} ${m}`))

const words = q => String(q || '').toLowerCase().split(/\s+/).filter(Boolean)
const matches = (s, ws) => { const t = s.toLowerCase(); return ws.every(w => t.includes(w)) }

// by = 'bracelet' | 'dial'. Dial descriptions start with the model number, as in "126610 black markers w lgn".
export function suggestDescriptions(by, typed, ref = '', limit = 8) {
  const ws = words(typed)
  if (!ws.length) return []
  if (by === 'bracelet') return braceletList.filter(s => matches(s, ws.filter(w => w !== 'rolex'))).slice(0, limit)
  const num = String(ref || '').replace(/^M(?=\d)/i, '').match(/^\d+/)?.[0] || ''
  const rest = ws.filter(w => w !== num) // ignore the model number if it was typed
  if (!rest.length) return []
  return dialList.filter(s => matches(s, rest)).slice(0, limit).map(s => (num ? `${num} ${s}` : s))
}
