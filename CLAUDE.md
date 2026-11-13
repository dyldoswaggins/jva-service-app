# JVA Watch Service System — project spec

Read this first, every session. It is the source of truth. When a rule changes, update this file in the same change and add a line to the Changelog at the bottom.

## 1. What this is

A web app for J. Vair Anderson Jewellers' Rolex service workshop (Calgary). It replaces The Edge for watch service (The Edge stays for retail). Built by Dylan Barr, who does not code: explain in plain language, ask before anything risky, keep steps small.

Sections:

| # | Section | Status |
|---|---|---|
| 1 | Parts (stock count, reorder, invoices, models) | **Rebuilt in the app** (`src/parts/`): Count, Reorder, History, Models. Invoice import (PDF, adds stock + cost, Undo in History) done. Still to port from the prototype: PDF count sheets/report, voice count, drawer sheets/scan, photo check, quick scan. Prototype artifact stays live until cut-over. |
| 2 | Repairs (intake, watchmaker bench screen, parts on a job) | **Parts 1–2 built** (`src/repairs/`): iPad intake with signed receipt, jobs list, job page with condition + request prompts and status gate, CTR kits from Jared's lists (auto), + Add (In CTR / Upgrades / Billable / Search), stock taken when a job leaves Estimate. Next: client-facing intake redesign (Sales see only intake), CTR + polish price, ETA from queue, iPad photos. |
| 3 | Documents (intake receipt, estimate, confirmation, invoice) | **Built** on one harmonized layout from JVA's SAV templates (`src/docs/`, `docs/rolex-customer-documents.md`). Admin creates Estimate → records decision → Confirmation → Invoice on the job page. |
| 4 | Service Manager Dashboard | Not started; design here in Claude Code |

## 2. Stack (agreed)

- **Code** lives in `C:\Users\dylan\jva-service-app` (not OneDrive: sync breaks on `node_modules`), backed up to a private GitHub repo. Netlify publishes from GitHub. OneDrive source files (Jared's lists, ROLP invoices, intake worksheet) are read in place.
- **Website** hosted on **Netlify** (store already uses it for the intake form). This app: site `watchservicejva` (https://watchservicejva.netlify.app), team "Watch Service", auto-deploys from GitHub `dyldoswaggins/jva-service-app` branch `main`. Supabase URL/key set as Netlify build env vars.
- **Supabase**: Postgres database, auth, realtime. Project `jva-service` (ref `lexvtfypmutjirluuwwn`), region ca-central-1. URL + publishable key in `.env.local` (not committed) and Netlify env vars.
- **Sign-in (changed 2026-11-09): email code.** Staff enter their @jvairanderson.com address and get a 6-digit code (Supabase email OTP, sent through the parts Gmail account's SMTP). Other domains are refused by a database trigger on `auth.users` (migration 005). New logins are View only until Admin gives a role. Microsoft (Entra) sign-in is kept in code for later: build with `VITE_SIGNIN=microsoft` once IT registers the app. One login per person.
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

- **No customer data as fields.** No name/phone/email/address columns anywhere. **One exception (Dylan, 2026-11-09): the signed intake receipt PDF** (client name, address, signature) is filed with its job in private bucket `job-docs`, readable by **Admin and Sales only** (`job_docs.has_client_data`). Watchmakers never see client details. Jobs link out via three references (below). The ROLP parts list and job breakdown exports contain customer names: **never import those columns**. Open: Alberta PIPA consent wording on the receipt, and a retention period for signed receipts.
- **Job number = Edge repair number format**, e.g. `124595-001`.
- **Job links:** `edgeNo` (Edge repair #, = the job number), `rolexServiceNo` (Rolex/WSC #), `mrwsRef` (MRWS customer reference; printed on Rolex parts invoices and links special-order parts to a job). The invoice side stores extra detail and links by Edge number.
- **`qty` on `parts` is the only stock count**, in **units**. Never keep a second count anywhere.
- **Every stock change** updates `parts.qty` and adds a `log` row in the same transaction.
- **Never hard-delete** jobs (use `cancelled`), log rows, or parts (use `archived`).
- **Only add fields**; don't rename or drop existing ones without a migration and a changelog line.
- **ROLP invoice import adds received stock and updates cost** (changed 2026-11-09 by Dylan; was cost-only). Runs as one transaction via `apply_invoice()`; Undo via `undo_invoice()` (takes units back, never below 0; restores cost if still from that invoice). Rules:
  - Invoices dated **on or before 2026-11-05** (11.5 stock confirmation) update **cost only**, never stock (enforced in the database).
  - Cost: `price`, `pack`, `pack_price`, `price_src`, `price_prev`, `price_date`; **latest invoice date wins**.
  - Skip M (watches), E (tools/service cards), RP/IMR (promo); no-charge lines default off.
  - Same invoice number can't be imported twice (unless undone).
  - Nearly every line carries a customer reference (MRWS #); store it per line. **If the MRWS # matches a repair job, prompt at import to set the part aside for that job; otherwise it is stock.** (Set-aside prompt to build with Repairs.)
  - Reader is layout parsing of the Rolex PDF (`src/invoice.js`), no AI; checked against all 52 invoices in `ROLP Invoices` (`node scripts/test-invoices.mjs "<folder>"`).
- **Packing lists** (added 2026-11-09): same import as invoices but no costs (`doc_type = 'packing_list'`).
  - **Whichever document arrives first adds the stock.** Lines are matched to the other document type on **MRWS # + part** (`receipt_lines`); a matched later line adds no stock (an invoice still updates cost). Packing list and invoice numbers differ, so never match on document number.
  - The review screen shows each line's match, quantity differences, and lines on the other document missing from this one, before Apply.
  - Undo of the first document **hands its stock over** to the matched later one instead of removing it.
- **Inbox** (`inbox` table + private storage bucket `inbox`, Admin only): documents arrive by **email** (shared mailbox, fetched by Edge Function `inbox` action `mail`) or upload. Text PDFs (Rolex layout) are read in the browser, no AI. **Scans/photos are read by Claude** (`claude-opus-5-5`, structured output, Edge Function `inbox` action `read`); the file goes to Anthropic (part #s, MRWS #s, no customer names). **Nothing is applied automatically**: Admin checks and presses Apply.
- **Order limits per job (Rolex):** A up to 25, B up to 5, C 1. Warn when a job goes over.
- Money in CAD, stored as numbers, shown `$412.50`. Who/when = user id + timestamp; names looked up when shown.
- Serials: lists show last 4 only (`•••3F2A`); full number on the job and its documents.
- File names carry no client details: `JVA-124595-001-Estimate.pdf`.
- Nothing personal is sent to any AI service.
- **Customer documents (Receipt, Estimate, Confirmation, Invoice) must follow Rolex's required content and share one harmonized template — read `docs/rolex-customer-documents.md` before touching any document.** Watch description is always 4 parts: `watchLine()` (M + model number + "Rolex" + model name), serial, `braceletLine()` (bracelet ref + description), `dialLine()` (dial description). Customer requests in Rolex wording (`REQ` in `src/rules.js`). WSR serial check before the estimate.

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

### Intake on iPad + confirm prompts (built 2026-11-09)
- **Sales on iPad** (`IntakeView`): Edge job #, Rolex/WSC #, MRWS #, service type; watch ref (fills model + calibre from `models`), serial, bracelet, dial; **visible condition** (strict terms, intake components only); **client requests** (chips + other); client name/address + **finger signature** → fills JVA's editable receipt (`public/templates/receipt.pdf`, `src/receipt.js`) incl. "Condition noted at intake: …", flattens it, files it on the job, offers it to print. Job created in one step by `create_job()`.
- **Watchmaker at estimate** (`JobView`): every intake condition is a prompt (**Confirm / Change / Not present**); every client request is a prompt (**Include in estimate / Not included + reason**). The job **can't leave Estimate** (except Cancelled) until all prompts are answered. Watchmaker can add conditions found at the bench (incl. Mov't bridges, Balance wheel). Full condition history kept (`job_conditions.state`, `replaces`).
- Confirmed conditions feed the estimate's "Watch analysis" line and "While examining your watch, our watchmakers found…" notes (Rolex estimate guideline). Included requests go on the estimate; declined ones carry the reason.
- Tables: `jobs`, `job_conditions`, `job_requests`, `job_status_log` (trigger), `job_docs`, `job_statuses` (editable list; seeded Estimate, Waiting on parts, On deck, Polishing, Timekeeping, Sent to Toronto, Done, Cancelled). Migrations 006–007.
- **Documents on a job:** Print (from the page; iPad opens the PDF to print/share), Open, and **Email to service manager** — sent from the parts Gmail by Edge Function `send-doc` (Admin + Sales; secrets `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `SERVICE_MANAGER_EMAIL`); `job_docs.emailed_at/_to/_by` recorded (migration 009). Estimates/invoices will use the same buttons when built.
- Decided with defaults (2026-11-09, changeable): Toronto = own status; analysis keeps Mov't bridges + Balance wheel as on the worksheet; **part costs Admin only** (UI; watchmakers see retail).

### Client-facing intake, prices, ETA, photos (built 2026-11-09, migration 011)
- **Sales associates see only the intake** ("Rolex Service Reception", JVA emblem `public/jva-emblem.svg`, numbered steps: timepiece → photos → condition → service & price → estimate & timing → details & signature → "For the boutique" job refs). After saving: "Thank you" page with Print receipt / Email to service manager / Next client (`SalesHome`). Enforced in the database too: Sales can't read parts, stock log, invoices, kits, status logs or other associates' jobs; they read back only jobs/receipts/photos they took in (last 24 h for jobs) and can't update jobs.
- **Prices** (Admin → Settings, `app_settings`): CTR by tier (Modern / Classic / Professional), polishing by watch family/size (line suggested from the model name). Stored on the job (`ctr_tier`, `ctr_price`, `polish`, `polish_family`, `polish_price`) and printed on the receipt with "Estimate before tax" — final estimate after analysis. Amounts to be entered by Dylan.
- **ETA**: `queue_eta()` = today + ceil((open bench jobs ahead + 1) ÷ watches per week) weeks + parts wait days (Settings → Bench capacity). Quoted at intake (`eta_quoted`, on the receipt); live on the job page; watchmaker override (`eta_override` + `eta_note`). Toronto jobs aren't counted in the bench queue.
- **Photos**: iPad camera at intake and on the job (`job_photos`, private bucket `job-photos`, compressed to 1800px JPEG). No client data, so all staff can view.

### CTR kits + parts on jobs (built 2026-11-09, migration 010)
- `ctr_kit_items`: Jared's 21XX, 22XX, 31XX, 32XX, Oyster (= 41XX/4130) lists, 229 lines, all matched to `parts`. Re-import any time: `node scripts/import-ctr-kits.mjs "<Calibre Inventory>" <token>` (temporary `tmp_import_kits` + token, dropped after). Demo copy in `data/ctr_kits.json`.
- **Auto kit** (`auto = true`): Always Change + Always Order + screws with a per-job quantity (Often Changed, "screw" in note or part name); "Only for …" notes → `only_for` exact calibres. Loads by itself when a watchmaker opens a CTR job at Estimate with a calibre (`build_ctr_kit`). Shown as one collapsed line; never printed.
- **+ Add**: In CTR (Often Changed + Keep Stock, not auto), Upgrades (Systematic Upgrade), Billable (★ parts tagged to the watch ref first, then most-used case/bracelet/dial parts; filter box), Search all. Billable needs component → condition (pre-filled from confirmed analysis; Movement = Worn/Damaged) → Required/Optional. Shows stock + Lista location; out of stock = "Order". Warns over Rolex A/B/C limits.
- **Stock**: comes off when the job leaves Estimate (trigger `take_job_stock`, once — `jobs.stock_taken_at`); parts added later come off when added. Never negative: what isn't there is recorded as `short_qty` ("short · order"). Log type Auto (kit) / Used (added), src `Job #…`. Remove = Returned. Learning: the job's watch ref is added to the part's `fits`, model created if missing.
- **Always Order prompt** after stock is taken: tick → `parts.reorder_req` → part shows on the Reorder tab.
- All writes go through `build_ctr_kit`, `add_job_part`, `remove_job_part`, `request_reorder` (watchmaker/Admin); `job_parts` has no direct write access.
- Note: retail prices exist for 220 movement parts only (Jared's lists); case/bracelet parts mostly show "–" until retail is filled.

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

### Time on the job (Dylan, 2026-11-09)
- Header counter "On this job" in whole minutes (`src/repairs/JobTimer.jsx`, migration 015 `job_time`). Framed as job time, not a per-person tracker.
- Runs automatically while an Admin/watchmaker has an open-status job on screen; one job at a time (opening another ends the previous). Heartbeat every minute; a session ends at its last beat (page closed, tab hidden, tablet asleep). Pauses after 60 min with no touch; tap the counter to pause/resume.
- Everyone (not Sales) sees the job total (`job_time_total`); only Admin sees the split by person. Rows written only through `time_start/time_beat/time_stop`; never deleted.
- Use later: turnaround and bench time by calibre/service in a report.
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

## 8b. Setup still to finish (needs people, not code)
- **Email-code sign-in (current):** Gmail app password → Supabase → Authentication → Emails → SMTP (smtp.gmail.com, 465) + templates "Magic Link" and "Confirm signup" show `{{ .Token }}` + Site URL `https://watchservicejva.netlify.app` + raise the email rate limit. After Dylan's first sign-in: set his `profiles.role = 'admin'` and `legacy_id = 'u_5FbqzfZ79582E4oxzrqCvw'`.
- **Microsoft sign-in (later, optional):** IT completes `docs/microsoft-signin-setup.md` Part 1 → Dylan enters client ID / secret / tenant in Supabase → Authentication → Providers → Azure, and sets Site URL `https://watchservicejva.netlify.app` (+ redirect `http://localhost:5173`).
- **Scan reading:** Dylan creates an Anthropic API key (JVA account) and adds it in Supabase → Edge Functions → Secrets as `ANTHROPIC_API_KEY`.
- **Email inbox, Gmail option (chosen 2026-11-09, no IT needed):** dedicated Gmail account (2-step verification on) runs `scripts/gmail-inbox.gs` (Google Apps Script, deployed as a web app) → Edge Function `inbox` action `ingest`, protected by secret `INGEST_SECRET` (24+ chars, same value in Supabase secrets and the script's properties); web app URL saved as secret `GMAIL_SCRIPT_URL`. Handled mail gets the label "Sent to JVA app"; nothing deleted.
- **Email is checked only on request** (Dylan, 2026-11-09): Admin presses **Check email** in the Inbox → `inbox` action `check` → runs the Gmail script (or fetches the M365 mailbox). No timer/schedule. Reading happens in the background; rows appear live.
- **Email inbox, Microsoft 365 option (alternative):** IT completes Part 2 → Dylan adds secrets `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `INBOX_MAILBOX`, `CRON_SECRET` → then schedule (SQL, once): enable `pg_cron` + `pg_net`, store the cron secret in Vault, and `cron.schedule('inbox-mail', '*/5 * * * *', …net.http_post to /functions/v1/inbox with body {"action":"mail"} and header x-cron-secret…)`.

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
| 2026-11-09 | **Rule change (Dylan): invoices now add received stock**, not cost only. Migration 003: `apply_invoice()` / `undo_invoice()`, `parts.price_date`, unique active invoice number, baseline date 2026-11-05 enforced server-side. MRWS # stored per line; set-aside-for-job prompt deferred to Repairs. PDF reader in `src/invoice.js` (pdf.js). |
| 2026-11-09 | Packing lists + Inbox (migration 004, Edge Function `inbox`): doc_type on documents, `receipt_lines` matching on MRWS # + part (first document adds stock), `receipt_matches()` preview, undo hands stock over, inbox table + private bucket, Claude reads scans, mailbox fetch ready (waiting on IT). Parts "Import invoice" → Inbox tab. |
| 2026-11-09 | Gmail drop-off: Edge Function `inbox` action `ingest` (secret `INGEST_SECRET`) + `scripts/gmail-inbox.gs`, so a Gmail account can feed the Inbox without Microsoft 365 / IT approval. |
| 2026-11-09 | No automatic email checks: **Check email** button (Admin) → `inbox` action `check`; Gmail script runs as a web app on request (`GMAIL_SCRIPT_URL`); reading runs in the background. |
| 2026-11-09 | Sign-in switched to email codes (no IT needed): `src/SignIn.jsx`, migration 005 restricts logins to @jvairanderson.com. Microsoft sign-in kept behind `VITE_SIGNIN=microsoft`. |
| 2026-11-09 | Repairs part 1: iPad intake (Sales) with signed receipt filed on the job (exception to the customer-data rule, Admin + Sales only), condition + request prompts the watchmaker must answer before a job leaves Estimate, jobs list, job page, status log. Costs hidden from non-Admins. Jared's folder now has 21XX (41XX = Oyster Inventory copy); 30xx still missing. |
| 2026-11-09 | Job documents: Print from the site + Email to service manager via parts Gmail (Edge Function `send-doc`, migration 009). Open idea from Dylan: remote digital signature for estimates (client signs from home) — decide with Documents. |
| 2026-11-09 | Repairs part 2 (migration 010): CTR kits from Jared's lists, parts on jobs, stock taken on leaving Estimate (never negative, shortfalls flagged), returns, learning `fits`, Always Order → reorder. Intake now fills model + calibre as soon as the ref matches. Requested next: client-facing intake design, Sales limited to intake, CTR + polish price, queue ETA, iPad photos. |
| 2026-11-09 | Migration 011: client-facing intake ("Rolex Service Reception"), Sales limited to intake (UI + RLS), CTR price by tier + polishing offer by family (Admin → Settings), queue ETA with watchmaker override, iPad photos. |
| 2026-11-09 | Rolex customer documents reviewed → `docs/rolex-customer-documents.md`. Migration 013: bracelet ref + dial ref saved at intake, WSR check (gates Estimate). Intake requires model name, bracelet ref + description, dial description; watch line `M<ref> Rolex <model>`; requests in Rolex wording (Do not refinish case/bracelet when no polish); receipt restructured. Added Dial "Stained", Bracelet "Stretched". |
| 2026-11-09 | Harmonized document engine `src/docs/rolexDoc.js` copying JVA's SAV templates; content flows onto extra pages (no clipping); JVA Alberta legal notices page on every document; receipt rebuilt on it. Condition text grouped by part. Old fixed-field receipt template removed. |
| 2026-11-09 | Migration 014: Estimate, Confirmation, Invoice. `job_clients` (client name/address, Admin + intake associate only — extends the receipt exception), `jobs.extra_lines/estimate_notes/estimate_decision`, `job_parts.decision`, `set_job_part_price()`, `record_decision()` (declined parts back to stock), `create_job(…, p_client)`. |
| 2026-11-09 | Migration 015: time on the job. `job_time` + `time_start/beat/stop`, `job_time_total` (Admin sees per person). Header counter in minutes, auto while a watchmaker has the job open. Demo `&sample` seeds once. |
| 2026-11-09 | Migration 016: watchmaker assessment, Necessary vs Optional (`JobAssessment.jsx`). Optional parts/service lines must be backed by a confirmed watch-analysis finding (DB + UI); `set_job_part_need()`; service lines added by the watchmaker, priced by the office; estimate blocked while optional work is unbacked. |
| 2026-11-09 | Workflow v2.1 golden rule 3: intake shows/prints a timeframe only for a plain CTR (no polishing, no requests beyond the overhaul; `timeframeAtIntake`, `CTR_INCLUDED` in rules.js). Otherwise "Timing: with your estimate", no `eta_quoted`. |
| 2026-11-09 | Migration 017: Modern/Classic/Vintage at intake (`jobs.classification`, `vintage_fee`, service type `Vintage analysis`, doc kind `vintage_fee`, settings `vintage`). Vintage signs the Vintage Analysis Fee form instead of the receipt; no CTR/polish/kit/ETA; excluded from queue_eta; job page notes Rolex Toronto. Immediate Proceed form pending a decision. |
| 2026-11-10 | Migration 018: Rolex Immediate Proceed form at Vintage intake with the Vintage Analysis Fee form (Workflow v2.1); both signed once, printed together (`mergePdfs`), filed separately. |
| 2026-11-10 | Migration 019: `staff_roles` (email → role/name/title; Watchmaker→watchmaker, Service Manager→admin, Admin→admin, Rolex Professional→sales), applied by `handle_new_user` when Dylan creates the account in Supabase. Dylan = admin, legacy history linked. Sign-in is now email + password (code as backup, no new accounts from codes); "Change password" in the header. No passwords stored by the app. |
| 2026-11-12 | Sign-in by **username** + password (`richard` → richard@jvairanderson.com behind the scenes; Outlook not needed). Migration 020: `staff_roles.legacy_id`, re-linked automatically when an account is (re)created. |
| 2026-11-12 | To-do dashboard on the Jobs page (`TodoPanel.jsx`): Admin — estimates to send (24 h / 72 h weekend, overdue in red), waiting for client, confirmations to send, Vintage to ship, ready to invoice; everyone — parts short; watchmakers — to assess, bench queue by ETA. `loadJobs` now includes doc kinds and part shortages. |
| 2026-11-12 | Documents re-measured to JVA SAV templates (estimate page 2 Clients Decision, DD/MM/YYYY, receipt/invoice variants, template capitalisation). Online estimate signing: migrations 021 (`sign_requests`, client email, `signed_estimate`) + 022 (`job_docs.fields`), Edge Function `sign`, `/sign/<token>` page, "Email for signature" / "Sign in store". Email sending needs GMAIL_USER / GMAIL_APP_PASSWORD secrets. |
| 2026-11-12 | Phase 1 (scanned-files plan): Rolex Immediate Proceed on Rolex's own PDF at every complete-service intake; CTR prices = Rolex CO offers; polish $210; Immediate Proceed 15 % setting; migration 023 (movement serial, bracelet links, clasp code, Rolex service #, ident_changed_at + stale-document warning); job-bag label. |
| 2026-11-12 | Immediate Proceed not routine in store (receipt shows the estimated price, estimate within 24 h; Rolex Pre-Approval not used): only Vintage, or "Proceed immediately" ticked at intake. |
| 2026-11-12 | Phase 4a: per-job uploads (migration 024: job_docs label/note/content_type, kind upload; jobs.estimate_source, rolex_estimate) and Rolex estimate PDF → JVA estimate (local reader tested on 193 Rolex documents, review screen with job/serial/model checks). |
| 2026-11-12 | Phase 2: migration 025 (jobs remarks/precleaned/handling/exclusions/timing; job_parts supply/ordered/picked + set_job_part_supply), Service overview panel, parts sourcing + pick list, Rolex Timing Analysis entry/print. |
| 2026-11-12 | Removed the pick list and part sourcing ticks (Dylan): parts process stays automatic — calibre CTR kit, stock off when the job leaves Estimate, shortages flagged. |
| 2026-11-12 | Migration 026: reason required for every part added beyond the CTR kit; printed under Watch analysis on client documents. |
| 2026-11-12 | Phase 5: migrations 027–029 (completion fields, Ready for pickup / Picked up, mark_picked_up, job_contacts, Sales pickup RLS, purchase_date; reason only for billable parts). Completion panel + Service Advisor checklist, Sales Pickup screen + handover, contact log, warranty purchase date, dashboard buckets. |
