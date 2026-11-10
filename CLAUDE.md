# JVA Watch Service System — project spec

Read this first, every session. It is the source of truth. When a rule changes, update this file in the same change and add a line to the Changelog at the bottom.

## 1. What this is

A web app for J. Vair Anderson Jewellers' Rolex service workshop (Calgary). It replaces The Edge for watch service (The Edge stays for retail). Built by Dylan Barr, who does not code: explain in plain language, ask before anything risky, keep steps small.

Sections:

| # | Section | Status |
|---|---|---|
| 1 | Parts (stock count, reorder, invoices, models) | **Rebuilt in the app** (`src/parts/`): Count, Reorder, History, Models. Still to port from the prototype: invoice import, PDF count sheets/report, voice count, drawer sheets/scan, photo check, quick scan. Prototype artifact stays live until cut-over. |
| 2 | Repairs (intake, watchmaker bench screen, parts on a job) | Designed (this file), not built |
| 3 | Documents (intake receipt, estimate, confirmation, invoice) | Not started; design here in Claude Code |
| 4 | Service Manager Dashboard | Not started; design here in Claude Code |

## 2. Stack (agreed)

- **Code** lives in `C:\Users\dylan\jva-service-app` (not OneDrive: sync breaks on `node_modules`), backed up to a private GitHub repo. Netlify publishes from GitHub. OneDrive source files (Jared's lists, ROLP invoices, intake worksheet) are read in place.
- **Website** hosted on **Netlify** (store already uses it for the intake form). This app: site `watchservicejva` (https://watchservicejva.netlify.app), team "Watch Service", auto-deploys from GitHub `dyldoswaggins/jva-service-app` branch `main`. Supabase URL/key set as Netlify build env vars.
- **Supabase**: Postgres database, auth, realtime. Project `jva-service` (ref `lexvtfypmutjirluuwwn`), region ca-central-1. URL + publishable key in `.env.local` (not committed) and Netlify env vars.
- **Sign-in with Microsoft (Entra)** using staff JVA accounts. One login per person.
- **2–4 people at once**, live updates via Supabase Realtime.
- **Stock changes run as a single database transaction** (update `parts.qty` + insert `log` together). Never allow a negative count.
- Roles checked on the server (Row Level Security), not just hidden buttons.
- Prefer a Canadian region for the database if available.
- Daily backups; Excel export of parts, log and jobs any time.
- Keep the code simple and readable. Business rules (order limits, pack maths, CTR kit, pricing) live in one module, not repeated per page.

## 3. People and roles

| Role | Can |
|---|---|
| Admin | Everything, incl. settings, costs, stock adjust, roles |
| Watchmaker | See jobs/parts, analysis, add parts to jobs, change status |
| Sales | Intake: create job, links, service type, requests, visible condition |
| View only | Read |

Anyone without a role = View only. Watchmaker steps must be **minimal** (main task in 2–3 taps).

## 4. Hard rules

- **No customer data in this system.** No names, phones, emails, addresses. Jobs link out via three references (below). The ROLP parts list and job breakdown exports contain customer names: **never import those columns**.
- **Job number = Edge repair number format**, e.g. `124595-001`.
- **Job links:** `edgeNo` (Edge repair #, = the job number), `rolexServiceNo` (Rolex/WSC #), `mrwsRef` (MRWS customer reference; printed on Rolex parts invoices and links special-order parts to a job). The invoice side stores extra detail and links by Edge number.
- **`qty` on `parts` is the only stock count**, in **units**. Never keep a second count anywhere.
- **Every stock change** updates `parts.qty` and adds a `log` row in the same transaction.
- **Never hard-delete** jobs (use `cancelled`), log rows, or parts (use `archived`).
- **Only add fields**; don't rename or drop existing ones without a migration and a changelog line.
- **ROLP invoices update COST only** (`price`, `pack`, `packPrice`, `priceSrc`, `pricePrev`). Never add invoice quantities to stock. Latest invoice date wins. Skip M (watches), E (tools/service cards), RP/IMR (promo).
- **Order limits per job (Rolex):** A up to 25, B up to 5, C 1. Warn when a job goes over.
- Money in CAD, stored as numbers, shown `$412.50`. Who/when = user id + timestamp; names looked up when shown.
- Serials: lists show last 4 only (`•••3F2A`); full number on the job and its documents.
- File names carry no client details: `JVA-124595-001-Estimate.pdf`.
- Nothing personal is sent to any AI service.

## 5. Data (from the Parts prototype — see `data/`)

Exported 2026-11-09 from the live artifact database. Counts: parts 906, models 412, log 924, invoices 0 (none imported yet). Stock baseline = 11.5 stock confirmation: **3,007 units across 535 parts**.

**Imported into Supabase 2026-11-09 and verified** (535 parts / 3,007 units). Schema: `supabase/migrations/`. Import script: `scripts/import-prototype.mjs`.

### Database names (Supabase, snake_case)
Same fields as below, written snake_case in Postgres: `cBy`→`c_by` (uuid), `cAt`→`c_at` (timestamptz), `packPrice`→`pack_price`, `priceSrc`→`price_src`, `pricePrev`→`price_prev`, `price2022`→`price_2022`, `retailSrc`→`retail_src`, `lastUsed`→`last_used` (date), `edgeDesc/edgeRefs/edgeNote`→`edge_desc/edge_refs/edge_note`. Log: `pid`→`part_id`, `by`→`by_user` (uuid), `at` (timestamptz), plus `change` (= qty − prev). Models: `by`→`by_user`. Invoices: `invoiceNo`→`invoice_no`, `addStock`→`add_stock`, `setCost`→`set_cost`, `mrwsRef`→`mrws_ref`, `edgeNo`→`edge_no`.
- Imported claude.ai user ids sit in `c_by_legacy` / `by_legacy`; `profiles.legacy_id` links them to a new login (Dylan = `u_5FbqzfZ79582E4oxzrqCvw`).
- Parts gain `archived` (never delete). Summary log rows have `part_id` null (e.g. `s115_summary`, type Import).
- **Stock changes only via `stock_change(part_id, type, qty | delta, src, ref)`** — locks the row, refuses negatives, writes `log` in the same transaction, checks role (Count/Adjust/Received = Admin; Used/Auto/Returned = Admin or Watchmaker). Direct writes to `log` are revoked; triggers block log edits and deletes of parts/models/invoices.
- Roles live in `profiles.role` (admin/watchmaker/sales/view, default view); new sign-ins get a profile automatically. `app_role()` returns the caller's role for policies.

### parts (one per Rolex part ref)
- `id` = `p_` + rmc, chars outside `[A-Za-z0-9_-.~:@+]` → `_` (e.g. `25/7035` → `p_25_7035`)
- `rmc` = Rolex ref without packaging codes (`B3135-5100-G100` → `3135-5100`, `V14-601` → `14-601`)
- `name`, `cat`, `sub`, `cal` (calibre or blank), `abc` (order class A/B/C)
- `qty` units; `null` = not counted, `0` = counted, none
- `cBy`, `cAt` last count change
- `price` cost per unit CAD; `packPrice`, `pack` (from `-XY` suffix, Y = units), `priceSrc`, `pricePrev`, `price2022`
- `retail` per unit CAD + `retailSrc` (220 movement parts from Jared's lists ≈ cost × 1.25). **Charge customers from `retail`, not `price`.**
- `over` overstock units (included in qty)
- `min` staff-set minimum; missing = suggest ceil(used ÷ 22 months × 2), min 1 if used; packs of 5+ round up to whole packs
- `fits` comma-separated watch/bracelet refs
- Location: `lcab`, `ldrw`, `ltab` (Lista cabinet/drawer/tab) — fields planned, not yet filled
- EDGE usage Jan 2025–Oct 2026: `used`, `jobs`, `lastUsed`, `edgeDesc`, `edgeRefs`, `edgeNote`
- `flag` (text when something needs checking), `note`, `src`, `ord`

### log (one per stock change, add-only)
`pid, rmc, prev, qty, by, at, src, type` (+ planned `change`, `ref`).
Types: **Count, Received, Used, Returned, Adjust, Auto** (Auto = CTR auto-consumption). Existing rows without `type`: Received if `src` starts with "Invoice", else Count.

### models (one per watch ref)
`id` = `m_` + ref uppercased, non-alphanumerics removed (`m_126610LN`). Fields `ref, name, cal (one or more, comma-separated), ok (staff-confirmed), by, at, src, years, conf (high/medium/low)`.
Confirmed by Dylan: Day-Date 40 → 3255, GMT-Master II → 3285, Datejust → 3235. About 74 researched refs were never written (batches mb8, mb9).
**Matching rule:** a part fits a model when the part's `fits` contains the ref (digits match) OR the part's `cal` is one of the model's calibres.

### invoices
`invoiceNo, date, supplier, file, addStock, setCost, by, at, lines[{ref, rmc, qty, pack, units, unitCost, added}], undone?` (+ `mrwsRef`/`edgeNo` to link special orders).

### Blister maths
`B…-G100` = 100 units per pack; `V…` = 1 unit; `-XY` suffix: Y = units per pack. Count individually, reorder in whole packs. Use from the opened blister first.

### Parts categories
- Case: Crown, Crystals, Gaskets, Bezels, Case backs, Pushers, Screws, TBD
- Bracelet: Spring bars, Links, Clasps, Screws, Bracelets, Straps, TBD
- Movement: 15xx, 20xx, 21xx, 22xx, 30xx, 31xx, 32xx, 41xx, Interchangeable, TBD
- Display: Hands, Dials, Screws

## 6. Repairs — agreed design

Reference: the current paper/HTML form "Rolex Service Overview Worksheet" at
`OneDrive - J. Vair Anderson Jewellers › Rolex › 1. Service - Rolex › 1. ROLEX SERVICE DOCUMENTS › 1. SERVICE DOCUMENTS › SAV ALL - POST AUDIT NEW › SERVICE Forms (Workshop intake form) › index.html`.
Rebuild its sections as the job screen, **dropping the Client field**. Its watch-analysis items and condition terms are the strict condition list.

### Who does what
- **Sales at intake:** job links (Edge #, Rolex #, MRWS), service type (CTR, Partial, Warranty, Quick Service), requests, **visible condition** using the same strict terms.
- **Watchmaker at the bench, one pass top to bottom:**
  1. Watch details (declaration fields: ref, serial, calibre, etc.)
  2. Analysis: sales' marks shown pre-ticked → confirm or change. Strict options only.
  3. CTR kit: automatic, nothing to enter.
  4. **+ Add** for anything beyond the CTR (dropdown, below).
  5. Done → status moves on.
- **System:** CTR consumption, stock, log, wording on client documents.

### CTR (full service at set price)
- **Authority = Jared's calibre lists**: `OneDrive › Sir. Claude Claudentin › Rolex Service › Watchmaking (Jared's Documents) › Calibre Inventory` — `31XX.xlsx`, `22XX.xlsx`, `32XX.xlsx`, `Oyster Inventory.xlsx` (= 4130). Columns: Part Number, Status, Quantity (per job), Price, Stock Amounts, Special Notes, Stock Cost, Inventory, Open Box. Screw lists: `Calibre Screws › 21XX/22XX/32XX Screws.docx`.
- Status values and what they do:

| Jared status | In the app |
|---|---|
| Always Change | **Consumed automatically on every CTR**, Jared's quantity, log type Auto. Reorders via `min`. |
| Always Order | **Consumed automatically on every CTR**, then a **reorder prompt** (one line per part, ticked lines go to the Reorder list; nothing ordered on its own). |
| Often Changed | Dropdown "In CTR" group, one tap, logged, not printed. Screws with a quantity here are **auto-consumed per CTR** too (see below). |
| Systematic Upgrade | Dropdown "Upgrades" group / prompt when old version present. |
| Keep Stock | Dropdown "In CTR" group (less common parts are covered by the CTR price). |

- **Auto screws per CTR:** screws on Jared's lists come off stock automatically with his per-job quantities (e.g. 31xx 3135-5110 ×16, 3135-5115 ×11). Jared's quantities stand. Stock review then posts one **Adjust** for any gap.
- **Calibre-specific notes** in Jared's lists ("Only for 3186/87", "Only for 3130/32") filter by the job's exact calibre.
- **CTR kit parts never print on client documents.** The document shows one CTR line with the set price.
- No list yet for **21xx and 30xx** (Jared has the data): until imported, nothing is auto-consumed for those; dropdown shows case/bracelet + search, and fills from finished jobs.

### + Add (beyond CTR)
Dropdown for the job's calibre and watch ref, most common first:
- **In CTR (logged only, not printed):** Often Changed + Keep Stock movement parts.
- **Upgrades:** Systematic Upgrade.
- **Billable (condition required):** case and bracelet parts by watch ref (`models` + `fits`): crowns, tubes, crystals, etc.
- **Search all parts.**
Each row shows stock on hand and Lista location; out of stock flags as Order (special order, linked by MRWS ref).

Billable parts require **component → condition (strict term) → part → Required / Optional**. Exact condition wording prints on client documents. Movement parts, if billable, use **Worn / Damaged** only, and the line shows the part name. If the component was marked in Analysis, the condition pre-fills.

### Client estimate example
```
ESTIMATE  124595-001
  Rolex CTR (complete service)                    $1,250.00
  Crystal          Chipped     Sapphire crystal   Required   $…
  Movement         Worn        Seconds wheel      Required   $…
  Bezel            Scratched   Polish             Optional   $…
```

### Stock timing
Default: stock comes off when the job leaves the first status (estimate), not when a part is added. Returning a part = add units back with log type Returned, `src: "Job #… (returned)"`.

### Learning
- When a part is used on a job, add the job's watch ref to the part's `fits` (no duplicates); create `models/m_{REF}` if missing (`ok: false`).
- Record what was suggested (`recShown`) and where each part came from (`source`: kit / dropdown / search) on every job.
- ★ on parts used on most past jobs for that model/calibre; counts on hover only. Suggestions only; nothing changes defaults without Admin approval.


### Also from the Setup doc
- Learning targets (later): parts per model+calibre, ignored suggestions drop, parts found by search 3+ times join recommendations, turnaround time per status by calibre, estimate accuracy, reorder levels from usage + Rolex delivery times. Minimum 3 past jobs for a model before suggesting; else calibre; else nothing. Calculated from jobs and log, not stored.
- Optional monthly review (Admin): AI reads last month's jobs with no client data or serials and lists suggested changes; Admin accepts or dismisses each.
- Status changes saved to `statusLog` (status, by, at); jobs can move to any status, including backwards.
- Privacy open questions: data retention period; Alberta PIPA consent wording on the intake receipt.

## 7. Job history analysis (done 2026-11-08)

`data/ctr_job_analysis.csv`: share of in-house CTR jobs using each part, by calibre family. Built from the EDGE Job Breakdown Report (Jan 2025 – Oct 2026), customer column dropped.
Kept 132 jobs: removed 172 sent to Toronto (FedEx / RCL / "shipped to Rolex"), 25 not completed, 34 with fewer than 5 parts logged. EDGE under-logs screws and jewels, so low percentages for those mean "not logged", not "not used". Use for ★ ranking and sanity checks only; Jared's lists win.

## 8. Style

- Colours (CSS variables, light / dark):
  `--bg #fbfaf7 / #0c1a21`, `--surface #ffffff / #11232b`, `--fg #14232b / #ebe5d8`, `--muted #5f6b70 / #97a5aa`, `--line #e2dccf / #22404b`, `--line2 #efeae0 / #1a323c`, `--navy #003349 / #d9c08a`, `--gold #9c7c3f / #d2b47a`, `--focus #bb9b5f / #d2b47a`, `--band #f1ebdd / #182e37`, `--hover #faf8f3 / #152a33`, `--warn #8a5a14 / #e6be7a`, `--warn-bg #f8ecd7 / #33281a`.
- **No red/green to show status.** Words plus gold left edge (done) or warn tag (to check). In charts use other colours plus line patterns.
- System font: `system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`. Base 15px; part numbers and quantities 15px semibold, tabular figures; nothing under 12px. Sentence case; uppercase only for small "J. VAIR ANDERSON" and category bars. Line height 1.4. Printed docs: same font, 11pt min, black on white.
- Compact rows (~34px). Sticky header with small gold "J. VAIR ANDERSON". `.btn` / `.btn.solid` (navy; one solid button per panel). Navy category bar, cream subcategory bar, rows expand with `i`.
- **Undo, not "Are you sure?"**
- Wording: plain language, 1–2 word labels, symbols where clear (★ suggested, ••• masked, ✓ done), messages one short line. Same word for the same action everywhere.
- One search box: job #, serial, part #.

## 9. Open items

From Jared (he has the data; files go in his folder):
- 21xx and 30xx calibre lists (statuses + per-job quantities)
- "Open Box" column meaning (Yes / Could / No)
- CTR vs non-CTR legend (may be Dylan's): which categories/parts are inside the CTR price, exceptions (e.g. oscillator, balance complete), whether it varies by CTR tier (Modern / Classic / Professional)

From Dylan:
- Status list (editable in settings; seed from: Estimate, Waiting on parts, On deck, Polishing, Timekeeping, Done)
- Mov't bridges and Balance wheel: own analysis items or folded into Movement (Worn / Damaged)
- Who besides Dylan gets Admin
- Part costs: visible to watchmakers or Admin only
- Toronto send-outs: a field, or tracked with their own status

## 10. Build order (suggested)

1. Project setup: Netlify + Supabase + Microsoft sign-in; roles.
2. Import `data/` (parts, models, log); verify 3,007 units / 535 parts in stock.
3. Parts screens (match the prototype: Count, Reorder, History, Models; imports cost-only).
4. Repairs (Sections 6) — test alongside the paper worksheet before switching.
5. Documents.
6. Dashboard.
Cut-over: freeze counts in the artifact, re-export, import, switch. Keep the artifact running until then (it is live for the Rolex certification).

## Changelog
| Date | Change |
|---|---|
| 2026-11-09 | Spec created from claude.ai chats (Setup doc, Parts handoff v29, Repairs decisions). Superseded from Setup doc: single-artifact stack → Supabase/Netlify; job # `2026-0001` → Edge format `124595-001`; customer data on jobs → none; per-part billing settings → CTR model (kit auto-consumed, only extras printed). |
| 2026-11-09 | Code folder moved out of OneDrive to `C:\Users\dylan\jva-service-app` + private GitHub repo; Netlify deploys from GitHub. |
| 2026-11-09 | Supabase project `jva-service` created in ca-central-1 (replaces US-East "Watch Service", to be deleted). App skeleton: Vite + React + supabase-js. |
| 2026-11-09 | Database created (migrations 001–002): snake_case names (mapping in §5), profiles/roles, RLS, `stock_change()`, add-only log, no hard deletes, realtime. Prototype data imported and verified: 906 parts, 412 models, 924 log rows, 535 parts / 3,007 units in stock. Netlify team-login wall turned off (Microsoft sign-in + RLS protect the app). |
| 2026-11-09 | Parts screens built (Count, Reorder, History, Models) with rules in `src/rules.js`, data access in `src/data.js`. Undo toast replaces confirm prompts (archive replaces delete). Excel exports are CSV for now. Demo mode for local testing: `npm run dev`, open `/?demo` (loads `data/` in memory; `src/demo.js` never ships in the build). |
