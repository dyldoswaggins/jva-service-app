# Rolex customer documents — rules the app must follow

Source: `OneDrive › Sir. Claude Claudentin › Rolex Service › Customer Documents` (reviewed 2026-11-09):
**Plaque – Customer Service Documents (Rolex Canada, V10.2024)**, CONTENT ONLY guidelines 1 Receipt / 2 Estimate / 3 Confirmation / 4 Invoice,
Rolex Harmonized Document Excel template, JVA's editable Rolex Receipt (Modern & Classic), Immediate Proceed form (v1.2 EN),
JVA Vintage Analysis Fee form.

## JVA templates and how the app builds documents
- JVA's own SAV templates: `OneDrive › Rolex › 1. Service - Rolex › Rolex Service Documents › Rolex SAV Templates` — Rolex Service Receipt / Estimate / Confirmation / Invoice (2024–25). **These are the design to follow.**
- The app draws all four on **one shared layout** (`src/docs/rolexDoc.js`) copying those templates: J.VAIR "Jewellers since 1925" logo (taken from the blank receipt template, `public/templates/jva-receipt.pdf`), store block left, "Bill to/Deliver to" right, date, title, OUR REF # / WATCH / SERIAL # / BRACELET / DIAL, sections under heavy rules, line items with italic part sub-lines, MSRP CAD (TAX EXCL.) column, Services/Supplies Total / GST 5% / TOTAL CAD, signature lines, legal notices page.
- **Content grows with the information** (Dylan, 2026-11-09): text wraps and flows onto new pages, header repeated on each page, page numbers "1/2". Never fixed boxes that cut text off.
- **Legal notices** = JVA's Alberta version (`src/docs/legal-notices.json`, extracted from page 2 of "Rolex Receipt (Modern & Classic) - Editable.pdf" by `scripts/extract-legal-notices.mjs`).
  ⚠ The 2025 SAV Estimate/Confirmation templates' legal page says "confidential arbitration under **Ontario law in Toronto**" and "J.Vair Anderson **Canada** Ltd." — not used; flag to Dylan / legal.
- Built (2026-11-09): Receipt (`src/receipt.js`), **Estimate, Confirmation, Invoice** (`src/docs/serviceDocs.js`), lines from one builder (`src/docs/lines.js`):
  - Necessary: Complete overhaul (CTR tier price, "– Clean case and bracelet"), Refinish case and bracelet (polish price), billable parts marked Required ("Replace <component>", "– <part #> <description>", retail × qty), extra service lines.
  - Optional: billable parts marked Optional + optional extra lines. CTR kit / In-CTR / upgrade parts never printed.
  - Notes: exchange-basis legal sentence + one "While examining your watch, our watchmakers found that the … is …" per priced finding (auto until edited) + reasons for declined requests.
  - Estimate: requests, analysis, necessary + totals (GST 5%), notes, optional, client's decision boxes, validity 3 months, delivery ≈ N weeks (from ETA), remarks, undersigned + date/signature, legal notices.
  - Confirmation: requests, analysis, accepted work + totals, notes, Delivery + Delivery mode (Counter), Optional work (DECLINED) + totals, legal notices.
  - Invoice: services provided (accepted work) + totals, guarantee line.
  - Admin flow on the job page (`JobDocuments`): client details → prices (must all be set) → Create estimate → Record decision (declined parts go back to stock) → Create confirmation → Create invoice. Each PDF is filed on the job (Print / Open / Email to service manager).
  - Client name/address: `job_clients` (Admin, and the Sales associate who took it in); saved at intake. Watchmakers never see it.

## The process (Plaque I)
1. **Receipt** — formal confirmation of reception + customer request. Not the job bag. Archived (scanned/saved). ✅ built (signed on iPad, filed on the job).
2. **WSR serial number check** — before any intervention, so before the Estimate. Bracelet sizing on new watches is not an intervention. ✅ prompt on the job; blocks leaving Estimate.
3. **Estimate** — within **24 h** of intake (up to 72 h for 40 % of repairs), after the watchmaker's analysis. Necessary vs Optional clearly separated. Client tick boxes (accept necessary / tick accepted options / refuse), date + signature. Archived. Not the job bag, not the Rolex pre-approval form (pre-approval only for watches sent to Rolex). An "immediate estimate" over the counter is recommended.
4. **Confirmation** — the accepted Necessary/Optional work (breakdown), may list refused options. Issued after the client's decision (print / PDF by email). Cannot be the scanned estimate. Archived.
5. **Timing sheet** — per MRWS (watch info, timing, 1st/2nd criteria, 4-day test, power reserve, dates). Workshop + archive only.
6. **WSR declaration** — intervention and configuration change declared at the service end date.
7. **Invoice** — based on the Confirmation: breakdown + pricing of services and charged spare parts. Printed or PDF, archived.

All documents **dated**; **typed** (only signatures, pre-approval form, timing sheet and tick boxes may be handwritten). The four documents must share **one common template** (harmonized). Rolex layout optional; the content is mandatory.

## Required content (Plaque II) — on every document where it applies
- Date (issue date, + client acceptance date where applicable)
- Retailer: J. Vair Anderson, 409 – 3rd Street SW, Calgary AB T2P 4Z2, (403) 266-1669
- Client: first and last name, address
- Title: RECEIPT / ESTIMATE / CONFIRMATION / INVOICE
- Repair number (our Edge job #, "OUR REF #")
- **Watch description, 4 parts:**
  1. Model number + description — `M126710BLNR Rolex GMT-Master II`, `M124300 Rolex Oyster Perpetual` (`watchLine()`)
  2. Case serial number
  3. Bracelet reference + description — `20-93150-20 Rolex Oyster Fliplock Steel` (`braceletLine()`)
  4. Dial description — `Dial 16610 black markers w lgn` (`dialLine()`)
- Customer requests — Rolex wording: "Perform complete overhaul", "Refinish case and bracelet" / "Do not refinish case", "Do not refinish bracelet", "Replace crystal"…
- Watch analysis (estimate onwards) — e.g. "Hands scratched, Dial scratched, Bezel dented, Insert discoloured, Crown worn, Crystal badly chipped, Case dented at 2, Bracelet scratched"
- **Necessary work** and **Optional work**, separated; every service and every charged spare part listed with Rolex part # + description and **MSRP CAD (tax excl.)**. Services priced from the **Rolex Service Handbook** (ask RCL if missing); parts from **MyRolexWorldService**. Labour for optional parts is inside the CTR set price.
- Client acceptance / refusal
- **Service lead time**: 10, 15 or 20 business days (documents show "Delivery: approximately N weeks")
- Tax line: **GST 5%** (Alberta); totals "Service / Supplies Total", "G.S.T 5%", "Total CAD"
- **Legal notice must include**: "All component prices are calculated on an exchange basis, and therefore any replaced components will not be returned. All replacement components will be of the current generation available." (JVA's receipt page 2 has the full Alberta legal notices — reuse it.)

## Document specifics (CONTENT ONLY guidelines + Excel template)
- **Receipt**: header, Bill to/Deliver to, RECEIPT, OUR REF #, WATCH, SERIAL #, BRACELET, DIAL, "Dear Sir, Madam…", **Customer requests** as "- …" lines, Acknowledgement and authorization ("I, the undersigned … declare that I have read and accepted the legal notices… I confirm that the data transmitted on the watch is correct."), DATE + SIGNATURE, page 2 legal notices.
- **Estimate**: + Customer requests, **Watch analysis**, **Necessary work** (lines + part sub-lines "– 24-704-0 crown with gasket 704 st", MSRP), Service/Supplies Total, GST, Total CAD; page 2 **Notes** (exchange-basis sentence; one "After analysis, our watchmakers found that the … is …; its replacement is proposed in the optional work…" note per finding; "luminous material … new generation" where relevant); **Optional work** (lines + MSRP, "(1) In case of refusal, the service guarantee will not be delivered in its entirety" where it applies); page 3 **Client's decision** (☐ I accept the necessary work + total; Optional work — tick accepted options; ☐ I refuse the estimate), "This estimate is valid for 3 months from the date of issue. Delivery: approximately N weeks on approval.", Remarks, "I, the undersigned … certify that I have read and understood the estimate as well as the legal notices attached and confirm my decision…", Date + Signature; legal notices page.
- **Confirmation**: CONFIRMATION title, Customer requests, Watch analysis, **Accepted work** (lines + parts + MSRP, totals, GST), Notes, Delivery (approx. N weeks), Delivery mode (Counter), **Optional work (DECLINED)** with totals; legal notices.
- **Invoice**: INVOICE title, **Services provided** (lines + parts + MSRP), Service/Supplies Total, GST 5%, Total CAD.
- Footer on Rolex samples: "on.rolex.com/service — For more information on Rolex servicing".

## Other forms
- **Immediate Proceed (Modern & Classic)** — Rolex form for over-the-counter CTR: Retailer name/ref, serial, model, client name, requested interventions; "For Complete Overhaul: Polishing & Satin-Finishing of Case and Bracelet (Optional) **$210**" Yes/No; watch conditions; total amount tax excl.; accepted that extra necessary work is charged up to **15 % of the set service price** without a new estimate (beyond that a detailed estimate is sent); data transmitted to Rolex Canada; client + retailer signatures/dates. → candidate to generate at intake when the client wants to proceed immediately.
- **Vintage Analysis Fee** (JVA) — $350.00 + GST 5% = $367.50; payable even if the estimate is refused or the watch is counterfeit; vintage estimates within 3 weeks, restoration estimates within 3 months; client accept/decline, signature; JVA legal notices. → generate at intake for vintage watches.

## Watch analysis vocabulary (Plaque II, merged into `CONDITIONS` in `src/rules.js`)
Bezel: discoloured, scratched, dented · Insert (disc for bezel): discoloured, scratched, chipped · Crystal: chipped, cracked, damaged ·
Dial: discoloured, scratched, stained · Hands: discoloured, scratched, stained · Mid-case: dented, scratched · Crown: damaged, dented, worn ·
Bracelet: dented, scratched, stretched, worn.

## Watchmaker assessment (Dylan, 2026-11-09)
- The watchmaker decides Necessary vs Optional on the job page (`JobAssessment`): billable parts (Parts → + Add → Billable) and service lines (+ Service). The office prices them in `JobDocuments`.
- **Optional work must be backed by a confirmed finding in the watch analysis** (component + term). Enforced in the database (migration 016: `add_job_part`, `set_job_part_need`, trigger on `jobs.extra_lines`) and in the UI; the estimate can't be created while an optional line is unbacked. Each backed line gets its "While examining your watch…" note.
