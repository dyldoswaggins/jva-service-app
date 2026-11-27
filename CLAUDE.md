# JVA Watch Service System — project spec

Read this first, every session. It is the source of truth. When a rule changes, update this file in the same change and add a line to the Changelog at the bottom.

## 1. What this is

A web app for J. Vair Anderson Jewellers' Rolex service workshop (Calgary). It replaces The Edge for watch service (The Edge stays for retail). Built by Dylan Barr, with Richard (Service Manager) also working on it through Claude Code. Neither codes: explain in plain language, ask before anything risky, keep steps small. See §2b before changing anything.

Sections:

| # | Section | Status |
|---|---|---|
| 1 | Parts (stock count, reorder, invoices, models) | **Rebuilt in the app** (`src/parts/`): Count, Reorder, History, Models. Invoice import (PDF, adds stock + cost, Undo in History) done. Still to port from the prototype: PDF count sheets/report, voice count, drawer sheets/scan, photo check, quick scan. Prototype artifact stays live until cut-over. |
| 2 | Repairs (intake, watchmaker bench screen, parts on a job) | **Parts 1–2 built** (`src/repairs/`): iPad intake with signed receipt, jobs list, job page with condition + request prompts and status gate, CTR kits from Jared's lists (auto), + Add (In CTR / Upgrades / Billable / Search), stock taken when a job leaves Estimate. Next: client-facing intake redesign (Sales see only intake), CTR + polish price, ETA from queue, iPad photos. |
| 3 | Documents (intake receipt, estimate, confirmation, invoice) | **Built** on one harmonized layout from JVA's SAV templates (`src/docs/`, `docs/rolex-customer-documents.md`). Since 2026-11-26 Estimate, Confirmation and Invoice follow the **Rolex SAV page's post-audit format** (same as the receipt). Admin works on the job's SAV sheet (Intake tab) and previews / files each document on its tab. |
| 4 | Dashboards | **Built**: Service Manager (Dashboard tab, `src/ManagerDashboard.jsx`), Watchmaker (Bench tab, `src/WatchmakerDashboard.jsx`). Admin Checklist tab = what's left to build or decide. |

## 2. Stack (agreed)

- **Code** lives in `C:\Users\<you>\jva-service-app` on each person's computer (not OneDrive: sync breaks on `node_modules`), shared through the private GitHub repo. Netlify publishes from GitHub. OneDrive source files (Jared's lists, ROLP invoices, intake worksheet) are read in place.
- **Website** hosted on **Netlify** (store already uses it for the intake form). This app: site `watchservicejva` (https://watchservicejva.netlify.app), team "Watch Service", auto-deploys from GitHub `dyldoswaggins/jva-service-app` branch `main`. Supabase URL/key set as Netlify build env vars.
- **Supabase**: Postgres database, auth, realtime. Project `jva-service` (ref `lexvtfypmutjirluuwwn`), region ca-central-1. URL + publishable key in `.env.local` (not committed) and Netlify env vars.
- **Sign-in (current, 2026-11-12): OPEN ACCESS — no sign-in.** The app opens on a role picker (Service Manager / Watchmaker / Sales); the choice is sent as the `x-app-role` header and trusted while `app_settings.open_access.enabled` is true (migration 030). Anyone with the link can read and change data, so **no real client data until it is switched off** (set it false + Netlify `VITE_ACCESS=signin`). Staff accounts (username + password, roles from `staff_roles`, migrations 019–020) still work and return when it's off. Microsoft (Entra) sign-in kept in code for later (`VITE_SIGNIN=microsoft`).
- **2–4 people at once**, live updates via Supabase Realtime.
- **Stock changes run as a single database transaction** (update `parts.qty` + insert `log` together). Never allow a negative count.
- Roles checked on the server (Row Level Security), not just hidden buttons.
- Prefer a Canadian region for the database if available.
- Daily backups; Excel export of parts, log and jobs any time.
- Keep the code simple and readable. Business rules (order limits, pack maths, CTR kit, pricing) live in one module, not repeated per page.

## 2b. Working together (Dylan + Richard)

Two people change this app, each with their own Claude Code on their own computer. Claude follows these steps every session, without being asked:

1. **Start: get the latest.** `git pull` before reading or changing anything. If it fails or there are local changes you didn't make, stop and explain in plain words before going further.
2. **One person at a time.** Before starting real work, ask whether the other person is working on the app right now. If yes, wait or agree who does what. Never both on the same screen or file at once.
3. **Small, finished steps.** Each change: build (`npm run build`), test in demo mode (`npm run dev`, open `/?demo&role=admin`, also `role=watchmaker` / `role=sales`), then commit with a clear message and `git push`. Anything pushed to `main` **goes live on the site automatically** (Netlify) — never push something half-done or untested.
4. **Database changes** (Supabase): ask the person first, describe it in plain words, save it as the next numbered file in `supabase/migrations/`, apply it, and mention it in the commit. Never delete data or drop tables; no hard deletes.
5. **Record decisions here.** When a rule or design changes, update this file in the same commit and add a Changelog line with the date and who asked ("Richard, 2026-11-20: …"). This file is the shared memory: Claude's own memory is per person and is not shared.
6. **Build checklist.** Open questions and remaining work live in the app's Checklist tab (`src/buildChecklist.js`). Tick items there when done; add new ones there rather than only in chat.
7. **End: push everything.** Finish with a commit and push so the other person starts from the latest. Say plainly what changed and what is not done.
8. **Never commit or share** secrets (`.env.local`, passwords, API keys) or client data (scans, signed documents, names). Test only with demo data.
9. **Disagreements** between what the two people asked for: don't pick one silently — point out the conflict and ask.

Setup for a new person: GitHub collaborator (Write) on `dyldoswaggins/jva-service-app`, Supabase team invite (Developer) on project `jva-service`, own Claude Code; then clone the repo, `npm install`, and create `.env.local` from `.env.example` (Supabase → Project Settings → API).

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
- **Job number = JVA Number**: plain digits as JVA writes it (`114486`, Richard 2026-11-27, migration 037) or Edge repair format `124595-001`; provisional `P<yymmdd>-<nn>` until validated. Stored exactly as typed. Pattern `JOB_NO` in rules.js; database check `jobs_edge_no_check`.
- **Job links:** `edgeNo` (Edge repair #, = the job number), `rolexServiceNo` (Rolex/WSC #), `mrwsRef` (MRWS customer reference; printed on Rolex parts invoices and links special-order parts to a job). The invoice side stores extra detail and links by Edge number.
- **`qty` on `parts` is the only stock count**, in **units**. Never keep a second count anywhere.
- **Every stock change** updates `parts.qty` and adds a `log` row in the same transaction.
- **Never hard-delete** jobs (use `cancelled`, or **Delete this intake** = `jobs.deleted_at`, hidden everywhere and restorable from the Deleted filter, migration 036), log rows, or parts (use `archived`).
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

### Service Manager job sheet = Rolex SAV page (Richard, 2026-11-26, migration 036)
- Copied from `SAV ALL - POST AUDIT NEW › Rolex SAV › index.html` (`src/repairs/SavSheet.jsx`, lists in `src/savCatalog.js`). **Intake tab**, field for field: Job (Our Ref #, Estimate / Confirmation / Invoice dates, status, taken in by, service lead time), Bill to / Deliver to (name, address, city, province, postal code, phone, email, delivery), Watch (model number + name, serial, bracelet, dial, Era/CTR, accessories), Customer requests (pick list → a request the watchmaker answers), Watch analysis (pick list → confirmed condition), **Necessary works** and **Options** (service, part/detail, client price, **Rolex price**; GST 5 % totals), Notes (pick list), Client's decision (Waiting / Accepts / Refuses + OK ticks on options, remarks, delivery weeks, signed by/date), **Rolex World Service** (sent, confirmation n°/date, due, delivery mode, service/invoice n°, Rolex invoice date, shipping, returned; client total vs Rolex cost), Customer invoice extras (shipping charged → a "Shipping" line on the invoice, payment method), **Delete this intake** (warning, then hidden; Restore on the job). Saves on leaving each field.
- Lines: still filled by the watchmaker's assessment, parts and service price (Richard: "both"); **+ Add service / + Add option** picks from the SAV's 31 services with JVA's prices and part details (typed services allowed). Options must name the watch-analysis finding that backs them (rule of 2026-11-09 still enforced).
- Below the SAV sections: "Workshop and records" (watchmaker prompts, validation, intake forms, service overview, price/ETA/photos, parts, timing, completion, contact log, documents, more watch details).
- **Estimate / Confirmation / Invoice tabs** show the document page by page as it prints (`DocPreview.jsx`), Print / Save as PDF, Download, and the existing file / sign / send buttons.
- Documents (`src/docs/serviceDocs.js`): SAV wording and order — Estimate p1 Customer Requests (one line), Watch Analysis, Necessary Works + totals; p2 Option(s) + totals, Notes; p3 "Kindly return this estimate … by email at …", Client's Decision (☐ I accept the estimate, Option(s) (Tick accepted options), ☐ I refuse all work on estimate), validity + delivery, Remarks, undersigned, DATE / SIGNATURE; legal notices (no watch block). Confirmation p1 Accepted Works + totals; p2 Service Lead Time, Notes. Invoice one page, Services Provided + totals, header lower. Kept from Rolex's required content although the SAV page leaves them out: date on the confirmation, Delivery mode and declined options on the confirmation, the exchange-basis notice in Notes, dates as DD/MM/YYYY.
- New columns (036): jobs `estimate_date, confirmation_date, invoice_date, lead_time, delivery_weeks, accessories, decision_remarks, signed_by, signed_date, rolex_prices (jsonb by line key), rolex_ws (jsonb), inv_shipping, payment_method, deleted_at, deleted_by`; job_clients `city, province, delivery`. `loadJobs()` leaves deleted jobs out everywhere (`{ deleted: true }` for the filter).

### Intake forms + e-signature (Richard, 2026-11-25, migration 035)
- **Every Modern, Classic and Vintage intake fills in and files the Receipt + Rolex Immediate Proceed; Vintage also the Vintage Analysis Fee form** (Engraving: receipt + Rolex engraving form, no Immediate Proceed). Replaces the 2026-11-12 rule that Immediate Proceed was only for Vintage or "proceed immediately" (Richard's decision, Dylan to be told).
- Receipt and Vintage Analysis Fee form follow JVA's post-audit **"Rolex Receipt (Modern & Classic) - Editable.pdf"** (SAV ALL - POST AUDIT NEW): measured layout in `src/docs/rolexDoc.js` variant `receipt` (8.14 pt, margins 103/510, colour J.VAIR logo from `public/templates/jva-logo-2026.pdf`, logo only, no client data). The Vintage form keeps every word of "Vintage Analysis Fee Form - Editable_1.pdf" (labelled Bill to lines, Necessary Works, Client's Decision boxes, Remarks, footer address line).
- **e-Signature**: "Sign here on the iPad" = one signature box per form (each form has View form), or "Email me a link to sign" = forms filed unsigned + private link (sign request purpose `intake`, `create_intake_sign_request`, Edge Function `sign`, `IntakeSignPage.jsx`; the client signs each form and ticks accept/decline for the Vintage fee). Unsigned forms record their fill-in spots (`job_docs.fields`); signed copies are filed as new docs labelled "Signed online". The associate draws the Retailer signature on the Immediate Proceed.
- **Forms to the service manager and the rep after every intake** (Richard, 2026-11-27): right after saving, all intake forms are emailed to the service manager (secret `SERVICE_MANAGER_EMAIL`) and the associate (if their email was given); signed on the iPad → the signed copies (client gets them too); signing by link → the filled forms at once, marked "waiting for client signature", then the signed copies when the client signs (`sign` function). The thank-you step "Email to service manager" ticks itself when that email went out. send-doc `signed_copies` with `pending`.
- **Signed copies by email** to the client and to the associate who took the watch in (`jobs.intake_staff_name/email`, @jvairanderson.com only): send-doc `to: signed_copies` after iPad signing; the `sign` function after online signing. Job page → Documents → "Intake forms": status, Email link again, Sign in store, Email signed copies.
- **Client Details is step 1 of the intake** (Richard, 2026-11-25): **JVA Number** (= the job number: OUR REF # on the receipt and Vintage form, Retailer Ref. N° on the Immediate Proceed), name, address, city/province, postal code, phone: **required**; email optional (Richard, 2026-11-26; needed only for "Email me a link to sign", and for the client's emailed copy). Associate name and signature also required; associate email optional (Richard, 2026-11-27; if typed it must be @jvairanderson.com, and only then does the associate get a signed copy); every client signature required (on the iPad, or by the emailed link).
- **After saving, three steps are required** (Richard, 2026-11-25): Print documents, Print bag label, Email to service manager (ticked ✓ when done). "Next client" or "Sign out" before all three shows a warning (Go back and finish / … anyway).
- **Model number / model name auto-suggest** (Richard, 2026-11-25): the model number field always shows a fixed **M** (the job still stores the reference without it; documents add it). Suggestions come from the models table plus `src/rolexReferences.js` (4-digit vintage references and the newest releases the table lacks); tapping one fills number, name and calibre. Anything not listed can be typed by hand. **Bracelet Description / Dial Description** (Richard, 2026-11-27): suggestions while typing from `src/rolexDescriptions.js` (Rolex bracelet families × metals; dial colours × markers, prefixed with the model number); tap to fill, free typing allowed.
- **Notes** under Condition on arrival (Richard, 2026-11-25): saved as the customer request "Notes: …" (watchmaker sees it with the requests); printed under Customer Requests on the receipt (and Vintage form), and under Watch Conditions and Client additional information on the Immediate Proceed (not in its interventions).
- Client details: separate **Postal code** and **Phone** (`job_clients.postal_code/phone`); `address3` kept for older jobs.
- iPad first: intake and signing screens use ≥44 px touch targets, 17 px fields (no Safari zoom), 210 px signature boxes, two columns in portrait.

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
- **Service Manager Jobs tab** (Richard, 2026-11-26) mimics JVA's "Rolex SAV" intake page (`SAV ALL - POST AUDIT NEW › Rolex SAV › index.html`): job list on the left (search, status filter, job # + status pill + client · model), the open job on the right with **Intake / Estimate / Confirmation / Invoice** tabs; panels styled as its fieldsets (Cormorant Garamond titles, IBM Plex Sans/Mono, small uppercase labels; fonts from Google Fonts, used only there). Status pills keep the no red/green rule. Watchmakers keep the plain list and one-page job. Two warnings are allowed here instead of Undo (Richard, 2026-11-26): **Delete this intake** and **Record decision** (declined parts go back to stock).

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
| 2026-11-12 | **Open access, no sign-in** (Dylan: "fully open for now"). Migration 030: `open_access()` setting; `app_role()` trusts the `x-app-role` header while it's on; policies/grants extended to anon. App opens on a role picker (`RolePicker.jsx`: Service Manager = admin, Watchmaker, Sales), choice kept in localStorage `jva.role`, "Switch role" in the header. Edge functions accept the header (verify_jwt off). Time on the job isn't recorded without a person. **Keep real client data out until it's switched off:** `update app_settings set value='{"enabled": false}' where key='open_access'` + Netlify `VITE_ACCESS=signin`. |
| 2026-11-12 | Migration 031: **Engraving** service type — straight to Rolex Toronto (Dylan). Intake asks text, font, letter case, position, note (`jobs.engraving`); fills Rolex Canada's Engraving Request Form (`public/templates/rolex-engraving.pdf`, `src/docs/engravingForm.js`, doc kind `engraving_request`; "Authorized By" signed by hand), printed with the receipt. No watchmaker prompts, assessment, parts, timing, estimate or bench ETA; dashboard "Send to Rolex Toronto"; request "Engraving by Rolex" carries the details. |
| 2026-11-12 | Intake (Dylan's review): class + complete-service offer chosen from the model (`src/serviceCatalog.js`, from Rolex's "2025-2026 Rolex Service Prices.xlsx": calibre → Modern/Classic/Vintage, restoration refs → Vintage, model name → collection → offer band; "Change" / "Other offers" to override; band mapping to be confirmed). Bracelet ref and "For the boutique" removed from intake; client email field (copy emailed via `send-doc` `to: 'client'` once email is connected). Migration 032: provisional job # `P<yymmdd>-<nn>` (`next_provisional_no()`), `create_job` saves client email, `build_checklist` setting. Watch validation panel + dashboard bucket (Service Manager enters Edge #, WSC #, MRWS #, bracelet ref). Migration 033: filling an empty identifier no longer flags earlier documents; signed intake docs never flagged. Admin **Checklist** tab (`ChecklistView.jsx`, `buildChecklist.js`): information needed, to build, setup, done — ticks/notes/added items saved. |
| 2026-11-12 | Class from the reference digits first (Dylan: 6 = Modern, 5 = Classic, 4 = Vintage; calibre only when no usable reference; full reference list to come — Checklist). Polishing shows only the model's line ("Other lines" to change). |
| 2026-11-12 | Migration 034: final QC (`qc_at`, `qc_by`, `qc_checker`). Under the timing analysis the watchmaker signs off once a second watchmaker has checked the watch. Invoice, status Done / Ready for pickup / Picked up and "Mark ready for pickup" wait for a passed timing + QC (`finishBlockers`, in-store services only). Watchmaker to-do: Final QC. |
| 2026-11-12 | **Dashboards.** Service Manager: Dashboard tab, Admin home (`ManagerDashboard.jsx`): headline numbers (in the workshop, estimates due/overdue, waiting on client, ready for pickup, this week), to-do cards, status bars + bench load, turnaround last 90 days vs Rolex 24 h targets, weekly taken-in / done, longest open. Watchmaker: Bench tab, watchmaker home (`WatchmakerDashboard.jsx`): to assess with estimate due, next up by ETA with next step (parts / service / timing / final QC), timing due, QC, parts short, time on each job; no client details or costs. Dashboard rows open the job (`jump` prop on JobsView). |
| 2026-11-18 | §2b "Working together" (Dylan): Richard also works on the app with his own Claude Code. Every session: pull first, one person at a time, test in demo before pushing (push = live), database changes asked + saved as migrations, decisions recorded here + Changelog, Checklist tab for open items, push at the end, no secrets or client data. Sign-in section and dashboards row brought up to date. |
| 2026-11-25 | **Missing part costs filled from EDGE (Dylan).** 133 in-stock parts had no cost; set `price` to the cost on the latest EDGE item received (EdgeRawItems 2026-11-20, `Vendor Style` = part #; EDGE cost is per unit and matched the app's costs, median ratio 1.00 over 449 parts), `price_src` = "EDGE cost, invoice … (date)", `price_date` = EDGE entered date, so later ROLP invoices still update them. Jared's calibre-list "Price" is retail (≈ cost × 1.25), not cost, so it wasn't used. 47 in-stock parts (185 units) still have no cost. Stock value at cost: $44,813.89 (551 part #s, 3,065 units). Report: `Rolex Service › Stock Exports › Parts Inventory Report 2026-11-25.xlsx`. |
| 2026-11-25 | **Intake forms + e-signature (Richard).** Migration 035: `job_clients.postal_code/phone`, `jobs.intake_staff_name/email`, sign requests for intake forms (`purpose`, `doc_ids`, `create_intake_sign_request`, `apply_signed_intake`; estimate requests no longer cancel intake ones). Receipt + Rolex Immediate Proceed on **every** Modern/Classic/Vintage intake (replaces the 2026-11-12 Dylan rule) + Vintage Analysis Fee form for Vintage, each signed in its own box on the iPad or by emailed link; associate signs the Immediate Proceed; signed copies emailed to client + associate. Receipt and Vintage form re-laid on JVA's post-audit receipt (colour logo, 8.14 pt). Intake made iPad-friendly. Edge Functions `sign` and `send-doc` updated. |
| 2026-11-25 | Intake (Richard): Client Details moved to the top with a required **JVA Number** (the job number on every form); all client fields, associate name/email and all signatures required. |
| 2026-11-25 | Sales thank-you page (Richard): Print documents, Print bag label and Email to service manager required; warning on Next client / Sign out until all three are done. |
| 2026-11-25 | Intake (Richard): model number (fixed M) and model name auto-suggest from the models table + `src/rolexReferences.js` (vintage 4-digit + newest references); free typing still allowed. |
| 2026-11-25 | Intake (Richard): Notes box under Condition on arrival → Customer Requests on the receipt, Watch Conditions and Client additional information on the Immediate Proceed. |
| 2026-11-25 | Intake order (Richard): 1 Client Details, 2 Your timepiece, 3 Photos, 4 Your service, 5 Condition on arrival (+ Notes), 6 Estimate and timing, 7 Signatures, 8 For the boutique. |
| 2026-11-26 | Intake (Richard): step 2 renamed "Timepiece Information" (was "Your timepiece"). |
| 2026-11-26 | Intake (Richard): client email optional (still required when the client signs by emailed link). |
| 2026-11-26 | Intake (Richard): step 3 renamed "Timepiece Photo/s" (was "Photos"), its description line removed. |
| 2026-11-26 | Intake (Richard): step 4 renamed "Rolex Service Information" (was "Your service"). |
| 2026-11-26 | Intake (Richard): Classic described as "Serviced in-store or at Rolex Toronto (Model/Reference depending)" (`CLASSES` in rules.js). |
| 2026-11-26 | **Service Manager Jobs tab redesigned like the Rolex SAV page (Richard).** `JobsView` (Admin): job rail + working sheet; `JobView` `tabs`: Intake (job, validation, bill to, watch, requests, prompts, analysis, overview, service/price/ETA/photos), Estimate (assessment, parts, estimate + decision), Confirmation (confirmation, timing + QC), Invoice (completion, invoice, contact log, documents). `JobDocuments` `part` prop; `loadJobs({ clients })` adds the client name for Admin only. No database change. |
| 2026-11-26 | **Job sheet + documents copied from the Rolex SAV page (Richard).** Migration 036 (columns only). Service Manager Intake tab = the SAV sheet (`SavSheet.jsx`, `savCatalog.js`): all SAV fields incl. Rolex price per line, Rolex World Service, invoice extras; + Add service/option from the SAV list; decision with OK ticks. Estimate/Confirmation/Invoice tabs preview the documents (`DocPreview.jsx`). Estimate, Confirmation and Invoice PDFs switched to the SAV post-audit format (`serviceDocs.js`, `rolexDoc.js` `savInvoice`, `savItem`, `savBox`, `rich`, `line`, legal page without watch block). **Delete this intake** with a warning = soft delete (`deleted_at`), Deleted filter + Restore. |
| 2026-11-27 | Intake (Richard): associate (service advisor) email no longer required; name and signature still are. A typed email must be @jvairanderson.com. |
| 2026-11-27 | Intake (Richard): step 8 renamed "Rolex Sales Advisor" (was "For the boutique"). |
| 2026-11-27 | Intake (Richard): "Bracelet Description" and "Dial Description" capitalised; both suggest Rolex wording while typing (`src/rolexDescriptions.js`). |
| 2026-11-27 | Intake (Richard): forms emailed automatically to the service manager and the rep after every intake (signed copies; or filled forms waiting for the client's online signature, then the signed ones). Edge Functions `send-doc` (v5) and `sign` (v5) deployed. |
| 2026-11-27 | send-doc v6: `{ to: "check" }` (Admin) reports which email secrets are filled in (yes/no only, sends nothing). Checked 2026-11-27: GMAIL_USER, GMAIL_APP_PASSWORD and SERVICE_MANAGER_EMAIL all still missing, so no app email goes out yet. |
| 2026-11-27 | Photos (Richard): "+ Take photo" opens the iPad / phone back camera (as before); new "Choose photos" picks from the photo library or files. Intake and job page. |
| 2026-11-27 | **Email connected (Richard).** Supabase secrets GMAIL_USER (JVA service Gmail), GMAIL_APP_PASSWORD and SERVICE_MANAGER_EMAIL set; send-doc `{ to: "test" }` (Admin) sends one plain test email to the service manager; test sent OK. Note: saving secrets bumps Edge Function version numbers without changing code. |
| 2026-11-27 | Intake (Richard): "Optional" hint removed from the client Email box (it stays optional). |
| 2026-11-27 | Intake (Richard): Vintage Analysis Fee acceptance tick and every signature box (client per form, associate) marked required (*) with a warning until the fee is ticked; all were already enforced before saving. |
| 2026-11-27 | **JVA Number may be plain digits (Richard).** Intake failed with "jobs_edge_no_check" for numbers like 124595. Migration 037: check now accepts `^d{4,7}$` as well as `124595-001` and provisional; stored as typed. Intake shows a clear message for any other format. |
| 2026-11-27 | Receipt (Richard): "Watch condition on arrival" and "Indicative estimate (before analysis)" removed. The Receipt now has the letter, Customer Requests (incl. Notes), Acknowledgement and Authorization, signature, legal notices. Conditions still go to the watchmaker prompts and the Immediate Proceed; the Vintage fee form is unchanged. |
| 2026-11-27 | Signatures on documents (Richard): SignaturePad trims each signature to its ink; documents place it right after "SIGNATURE:", sitting on the line, up to 32 pt tall, with 12 pt more space above the DATE / SIGNATURE line. Applies to iPad and online signing (fill-in spot size). |
| 2026-11-27 | Intake (Richard): "Refinish (polish and satin-finish) case and bracelet" also offered for Vintage, under the Rolex Vintage Analysis Fee. Ticked = request "Refinish case and bracelet"; not ticked = "Do not refinish case" / "Do not refinish bracelet". No JVA polishing line or price for Vintage (Rolex prices it in the vintage estimate). On the Immediate Proceed the Vintage refinish choice is written in the interventions. |
| 2026-11-27 | Vintage polishing $420 (Richard): Settings → Vintage "Polish and satin-finish" (app_settings.vintage.polish, default 420); intake shows it under the Vintage fee and adds it to the estimate total when chosen (job polish_price). Rolex Immediate Proceed: Yes ticked when polishing is chosen, No otherwise, for every class; for Vintage the form's "$210" is covered and "$420" printed (measured spot x 411, y 368), and the total includes it. |
| 2026-11-27 | Vintage intake (Richard): two boxes, each with a tick: **Rolex Vintage Analysis Fee** (ticked by default) and **Vintage Service Warranty** (vintage repair covered by the Rolex service warranty, request "Vintage repair under Rolex service warranty", VINTAGE_WARRANTY_REQUEST). At least one required. Warranty only: no analysis fee (jobs.vintage_fee 0, no fee line on documents), no Vintage Analysis Fee form, Receipt + Immediate Proceed only. No database change. |
| 2026-11-27 | Intake (Richard): **Estimated weeks** box under Estimate and timing — choose (Approximately 6 to 18 weeks (Vintage), 4, 6, 8, 12 weeks) or type; Vintage starts on 6 to 18 weeks. Migration 038: create_job saves it as jobs.lead_time (the SAV sheet's "Service lead time", printed on the Confirmation). Not printed on intake forms (Richard: nowhere for now). |
