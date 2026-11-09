# JVA Watch Service – 1. Parts → handover for 2. Repairs

Paste this into the Repairs chat. Read it before building Repairs, Documents or the Service Manager Dashboard.

## 1. The artifact (one app, one database)
- **Rolex Spare Parts Count:** https://claude.ai/artifact/MBHXuVF1437qgfiPCP7QbV (private, v29)
- **Repairs must live in this same artifact.** A database can't be read from a different artifact.
- **Before publishing:** read the artifact (`Artifact` action `read`) and build on the live version. **Don't overwrite the Parts code.** Add Repairs as a new tab, or as its own file in the same artifact.
- **Capabilities:** omit `capabilities` on republish to keep them. If you pass them, restate all of them:
  `{"db": {}, "user": {"scopes": ["profile"]}, "downloads": true, "sample": {"images": true}}`
- **Styling:** follow "0. Setup — JVA Watch Service System" (https://claude.ai/artifact/JvooNHqjLgg2MCjmcdfK3w). The setup doc wins where the two differ. No red/green status colours. Plain language.

## 2. Database collections
### `parts/{id}`: one per part reference (about 895)
- **`id`** = `"p_" + rmc`, with characters outside `[A-Za-z0-9_-.~:@+]` replaced by `_` (e.g. `25/7035` → `p_25_7035`).
- **`rmc`** = Rolex ref with the packaging codes removed (`B3135-5100-G100` → `3135-5100`, `V14-601` → `14-601`).
- **Description fields:**
  - `name`, `cat`, `sub`
  - `cal`: calibre, or blank
  - `abc`: Rolex order class A, B or C
- **`qty`** = counted stock in **units**.
  - `null` = not counted. `0` = counted, none on hand.
  - **This is the only stock count. Never keep a second one.**
- **`cBy` / `cAt`:** who changed the count and when (user id, ms timestamp).
- **Cost:**
  - **`price`** = cost per **unit** in CAD.
  - `packPrice` = invoice price per pack. `pack` = pack size, from the `-XY` suffix (Y = units).
  - `priceSrc` = the invoice it came from. `pricePrev` = the old unit cost.
- **`retail`** = retail price per **unit** (CAD), kept separate from cost. `retailSrc` = where it came from (e.g. "Jared's 31XX list"). 220 movement parts have retail from Jared's calibre lists (about cost × 1.25). **Repairs should charge customers from `retail`, not `price`.**
- **`over`:** units of `qty` that are overstock. **Already included in `qty`, not extra.**
- **`min`:** minimum stock set by staff.
  - Missing = use the suggestion: ceil(used ÷ 22 months × 2), at least 1 if the part has been used.
  - For packs of 5+, min rounds **up to whole packs**.
- **`fits`:** comma-separated watch / bracelet refs (e.g. `"116610, 126610LN"`).
- **Location:** `lcab`, `ldrw`, `ltab` (Lista cabinet / drawer / tab).
- **EDGE usage (Jan 2025 – Oct 2026):** `used`, `jobs`, `lastUsed`, `edgeDesc`, `edgeRefs`, `edgeNote`.
- **Other:** `flag` (text when something needs checking, "" when clear), `note`, `src`.

### `log/{auto}`: one per stock change
- Fields: `{pid, rmc, prev, qty, by, at, src, type}`.
- **Repairs uses `src: "Job #…"` and `type: "Repair"`.**

### `models/m_{REF}`: one per watch reference
- **`id`** = `"m_"` + ref uppercased, non-alphanumerics removed (e.g. `m_126610LN`).
- Fields: `{ref, name, cal, ok, by, at, src, years, conf}`.
  - `cal` = one or more calibres, comma-separated.
  - `ok` = confirmed by staff.
  - `conf` = high, medium or low (research confidence).
  - `years` = production years.
- **About 470 references have been researched**: Datejust, Day-Date, Submariner, Sea-Dweller, GMT, Explorer, Daytona, Yacht-Master, Sky-Dweller, Milgauss, Air-King, Oyster Perpetual, Lady-Datejust and Cellini, from the 1970s to now.
- **Confirmed by Dylan:** Day-Date 40 → **3255**, GMT-Master II → **3285**, Datejust → **3235**.
- **⚠ About 74 researched refs are still to be written** (batches mb8 and mb9 in the Parts chat).
- **Matching rule:** a part fits a model when the part's **`fits` contains the ref** (digits match) **OR** the part's **`cal` is one of the model's calibres**.

### `invoices/{auto}`: imported ROLP invoices
`{invoiceNo, date, supplier, file, addStock, setCost, by, at, lines:[{ref, rmc, qty, pack, units, unitCost, added}], undone?}`

## 3. What Repairs needs to do with parts
1. **Pick parts for a job:**
   - Search by part #, name, calibre, or **watch reference**. Use the `models` matching rule to suggest parts for the watch on the ticket.
   - Show `qty`, location (`C{lcab}-D{ldrw}` tab `ltab`) and `price`.
2. **Use a part on a job:**
   - Decrement `parts/{id}.qty` by the units used. Set `cBy`/`cAt`.
   - Add a `log` entry with `src: "Job #…"`.
   - If `qty` would go below 0, warn and don't save a negative count.
3. **Learn models:**
   - When a part is used on a job, add the job's watch ref to the part's `fits` (no duplicates).
   - Create `models/m_{REF}` if it's missing (`ok: false`).
4. **Job cost:** units × `price` (per unit). For blister parts, charge per unit used, not per pack.
5. **Order limits per job (Rolex):** A up to 25, B up to 5, C 1 only. Use 1 on the watch and keep the rest in stock.
6. **Low stock:** after a job, if `qty` ≤ min, the part appears on the Parts **Reorder** tab automatically. Repairs doesn't need its own reorder list.
7. **Undo:** returning a part = add the units back, with a log entry `src: "Job #… (returned)"`.

## 4. Rules
- **ROLP invoices** (OneDrive › Rolex Service › ROLP Invoices) **update COST ONLY.**
  - Updates: `price`, `pack`, `packPrice`, `priceSrc`, `pricePrev`.
  - **Never add invoice quantities to stock.** The latest invoice date wins.
  - Skip M (watches), E (tools / service cards), RP/IMR (promo).
- **Blister maths:**
  - `B…-G100` = 100 units per pack. `V…` = 1 unit.
  - `-XY` suffix: Y = units per pack.
  - Count individually. Reorder in whole packs.
- **Stock baseline:** the **11.5 stock confirmation** overwrote all counts. Parts not listed on it = 0. That came to 3,007 units across 535 parts in stock.
- **Customer data:** none in the parts data. **Decide deliberately before storing customer names in Repairs.**
- **The Edge:** being dropped for watch service; it stays for retail.

## 5. Parts page today (so you don't rebuild it)
- **Tabs:** Parts (count), Reorder (★ at or below min, A/B/C, Excel), History (invoices with Undo, plus the stock log), Models.
- **Count row:** location · part # · name · **Count · Min · i · + / −**
  - Min: **bold** = set by staff, *italic* = suggested.
  - "+N OS" badge = overstock.
- **Buttons:**
  - **Import:** invoices (cost only; "Add units to stock" is off by default).
  - **Voice count.**
  - **Export:**
    - Full inventory count sheet: 2 columns per page, showing Location · Part # · Current · Count. Option to hide out-of-stock parts.
    - Partial count sheet: by category or subcategory.
    - Inventory report: with optional cost and sign-off.
    - Drawer count sheets, and scanning filled sheets back in.
- **Categories:**
  - **Case:** Crown, Crystals, Gaskets, Bezels, Case backs, Pushers, Screws, TBD
  - **Bracelet:** Spring bars, Links, Clasps, Screws, Bracelets, Straps, TBD
  - **Movement:** 15xx, 20xx, 21xx, 22xx, 30xx, 31xx, 32xx, 41xx, Interchangeable, TBD
  - **Display:** Hands, Dials, Screws

## 6. Source files (OneDrive › Sir. Claude Claudentin › Rolex Service)
- **SS:**
  - Rolex Parts Email reference.docx (categories and order classes)
  - Blister and invoice explanation PDF
  - ROLP Parts List 2025–26 .xlsx (**contains customer names; don't import them**)
- **Other folders:**
  - **ROLP Invoices:** costs
  - **SS Export:** EDGE inventory
  - **Stock Count:** the 11.5 confirmation
  - **Watchmaker SS**
