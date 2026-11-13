// Rolex service categories, from "2025-2026 Rolex Service Prices.xlsx" (OneDrive › Rolex › 1. Service - Rolex › Rolex Service Documents).
// The calibre decides the class (Modern / Classic / Vintage, Restoration = Rolex Toronto); the model name decides the collection.
// Intake uses this to choose the class and the complete-service offer itself (Dylan, 2026-11-12: "don't prompt for classic or vintage if
// the model doesn't fall into that category… once model is entered it auto selects"). Sales can still change it.
export const COLLECTIONS = [
  { cls: 'Modern', name: 'Oyster', price: 800, models: ['Air-King', 'Oyster Perpetual'], cals: [2130, 2230, 2231, 3130, 3132, 3230] },
  { cls: 'Modern', name: 'Date', price: 850, models: ['Date'], cals: [2135, 2235, 3135] },
  { cls: 'Modern', name: 'Datejust', price: 950, models: ['Datejust', 'Lady-Datejust', 'Pearlmaster', 'Turn-o-graph'], cals: [2135, 2235, 2236, 3135, 3136, 3235] },
  { cls: 'Modern', name: 'Day-Date', price: 1100, models: ['Day-Date'], cals: [3155, 3156, 3255] },
  { cls: 'Modern', name: 'Professional', price: 1000, models: ['Explorer', 'GMT-Master', 'Milgauss', 'Deepsea', 'Sea-Dweller', 'Submariner', 'Yacht-Master'], cals: [] },
  { cls: 'Modern', name: 'Cosmograph Daytona', price: 1100, models: ['Daytona'], cals: [4130, 4131] },
  { cls: 'Modern', name: 'Specialty', price: 1350, models: ['Deepsea Challenge', 'Sky-Dweller', 'Yacht-Master II'], cals: [4160, 4161, 9001, 9002] },
  { cls: 'Modern', name: 'Cellini', price: 800, models: ['Cellini', 'Cellissima', 'Cestello', 'Danaos', 'Dualtime', 'Moonphase', 'Orchid'], cals: [1602, 3165, 3180, 3195, 6220, 6621] },
  { cls: 'Classic', name: 'Oyster', price: 1000, models: ['Air-King', 'Oyster Perpetual'], cals: [1220, 1520, 1530, 1560, 1570, 2030, 3000] },
  { cls: 'Classic', name: 'Date', price: 1050, models: ['Date'], cals: [1225, 1525, 1535, 1565, 1575, 2035, 3035] },
  { cls: 'Classic', name: 'Datejust', price: 1100, models: ['Datejust', 'Lady-Datejust', 'Turn-o-graph'], cals: [1565, 1575, 2035, 3035, 5035] },
  { cls: 'Classic', name: 'Day-Date', price: 1350, models: ['Day-Date'], cals: [1555, 1556, 3055, 5055] },
  { cls: 'Classic', name: 'Professional', price: 1500, models: ['Explorer', 'GMT-Master', 'Milgauss', 'Sea-Dweller', 'Submariner'], cals: [1520, 1530, 1560, 1570, 1575, 1580, 3000, 3035, 3075, 3085] },
  { cls: 'Classic', name: 'Cosmograph Daytona', price: 1750, models: ['Daytona'], cals: [4030] },
  { cls: 'Classic', name: 'Cellini', price: 1000, models: ['Cellini', 'Cellissima', 'Classic', 'Danaos', 'Orchid', 'Prince', 'Midas'], cals: [1240, 1400, 1600, 1601, 651, 6620, 7040, 750] },
]
// Rolex Toronto: vintage calibres and restoration calibres
const VINTAGE = [/^1[0-3]\d\d$/, /^1401$/, /^1800$/, /^650$/]
const RESTORATION = [2508, 3335, 3346, 3525, 3666, 3835, 3997, 4048, 4113, 4500, 4537, 4767, 4768, 5036, 6034, 6036, 6232, 6234, 6236, 6238,
  6239, 6240, 6241, 6242, 6262, 6263, 6264, 6265, 6269, 6270, 6542, 6541, 6543, 5510, 5514, 5517, 6200, 6204, 6205, 6536, 6538, 6202, 2780, 1831, 6511, 5100, 6062, 8171]

// Most specific name first ("Submariner Date" is Professional, not Date; "Yacht-Master II" is Specialty)
const NAME_ORDER = ['Deepsea Challenge', 'Sky-Dweller', 'Yacht-Master II', 'Daytona', 'Day-Date', 'Datejust', 'Lady-Datejust', 'Pearlmaster', 'Turn-o-graph',
  'Explorer', 'GMT-Master', 'Milgauss', 'Deepsea', 'Sea-Dweller', 'Submariner', 'Yacht-Master', 'Air-King', 'Oyster Perpetual', 'Cellini', 'Cellissima', 'Cestello',
  'Danaos', 'Dualtime', 'Moonphase', 'Orchid', 'Prince', 'Midas', 'Date']
const norm = s => String(s || '').toLowerCase().replace(/[\s-]+/g, '')

// → { cls, collection, price, why } or null when it can't tell (Sales chooses)
// Class: the reference's digits first (Dylan, 2026-11-12: "most 6 digit references are modern, 5 digit are classic and 4 digits vintage";
// a full reference list is coming — Build checklist), then the calibre when there's no usable reference.
export function classifyWatch({ calibre, watch_name, watch_ref }) {
  const cal = String(calibre || '').match(/\d{3,4}/)?.[0]
  const refDigits = String(watch_ref || '').replace(/^M/i, '').match(/^\d+/)?.[0] || ''
  const name = norm(watch_name)
  const byCal = cal ? COLLECTIONS.filter(c => c.cals.includes(Number(cal))) : []
  let cls = null, why = ''
  if ([4, 5, 6].includes(refDigits.length)) { cls = { 6: 'Modern', 5: 'Classic', 4: 'Vintage' }[refDigits.length]; why = `${refDigits.length}-digit reference` }
  else if (cal && !byCal.length && VINTAGE.some(r => r.test(cal))) { cls = 'Vintage'; why = `calibre ${cal}` }
  else if (byCal.length) { cls = byCal[0].cls; why = `calibre ${cal}` }
  else if (cal && Number(cal) >= 2100) { cls = 'Modern'; why = `calibre ${cal}` } // current calibres not listed by number (e.g. 3285)
  if (!cls) return null
  // Vintage (incl. restoration references, sheet column "Calibres" but these are 4-digit refs): Rolex Toronto
  if (cls === 'Vintage') return { cls, collection: RESTORATION.includes(Number(refDigits)) ? 'Restoration' : 'Vintage', price: null, why }
  const key = NAME_ORDER.find(k => name.includes(norm(k)))
  const pool = COLLECTIONS.filter(c => c.cls === cls)
  const inClass = byCal.filter(c => c.cls === cls)
  const col = (key && pool.find(c => c.models.some(m => norm(m) === norm(key)))) || (inClass.length === 1 ? inClass[0] : null)
  return { cls, collection: col?.name || null, price: col?.price ?? null, why }
}

// The Rolex complete-service offers on the Immediate Proceed form, matched to the collection's band.
// ⚠ Band mapping inferred from the two price lists; to be confirmed by Dylan (see Build checklist).
export const OFFER_BAND = {
  Modern: { Oyster: 'CO - MODERN $840', Date: 'CO - MODERN $840', Cellini: 'CO - MODERN $840', Datejust: 'CO - MODERN $980', Professional: 'CO - MODERN $980',
    'Day-Date': 'CO - MODERN $1,190', 'Cosmograph Daytona': 'CO - MODERN $1,190', Specialty: 'CO - MODERN $1,190' },
  Classic: { Oyster: 'CO - CLASSIC $1,250', Date: 'CO - CLASSIC $1,250', Datejust: 'CO - CLASSIC $1,250', Cellini: 'CO - CLASSIC $1,250',
    'Day-Date': 'CO - CLASSIC $1,530', Professional: 'CO - CLASSIC $1,530', 'Cosmograph Daytona': 'CO - CLASSIC $1,810' },
}
export const offerFor = (cls, collection) => OFFER_BAND[cls]?.[collection] || null
