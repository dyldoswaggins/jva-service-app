# Rolex customer documents â€” rules the app must follow

Source: `OneDrive â€º Sir. Claude Claudentin â€º Rolex Service â€º Customer Documents` (reviewed 2026-11-09):
**Plaque â€“ Customer Service Documents (Rolex Canada, V10.2024)**, CONTENT ONLY guidelines 1 Receipt / 2 Estimate / 3 Confirmation / 4 Invoice,
Rolex Harmonized Document Excel template, JVA's editable Rolex Receipt (Modern & Classic), Immediate Proceed form (v1.2 EN),
JVA Vintage Analysis Fee form.

## JVA templates and how the app builds documents
- JVA's own SAV templates: `OneDrive â€º Rolex â€º 1. Service - Rolex â€º Rolex Service Documents â€º Rolex SAV Templates` â€” Rolex Service Receipt / Estimate / Confirmation / Invoice (2024â€“25). **These are the design to follow.**
- The app draws all four on **one shared layout** (`src/docs/rolexDoc.js`) copying those templates: J.VAIR "Jewellers since 1925" logo (taken from the blank receipt template, `public/templates/jva-receipt.pdf`), store block left, "Bill to/Deliver to" right, date, title, OUR REF # / WATCH / SERIAL # / BRACELET / DIAL, sections under heavy rules, line items with italic part sub-lines, MSRP CAD (TAX EXCL.) column, Services/Supplies Total / GST 5% / TOTAL CAD, signature lines, legal notices page.
- **Content grows with the information** (Dylan, 2026-11-09): text wraps and flows onto new pages, header repeated on each page, page numbers "1/2". Never fixed boxes that cut text off.
- **Legal notices** = JVA's Alberta version (`src/docs/legal-notices.json`, extracted from page 2 of "Rolex Receipt (Modern & Classic) - Editable.pdf" by `scripts/extract-legal-notices.mjs`).
  âš  The 2025 SAV Estimate/Confirmation templates' legal page says "confidential arbitration under **Ontario law in Toronto**" and "J.Vair Anderson **Canada** Ltd." â€” not used; flag to Dylan / legal.
- Built (2026-11-09): Receipt (`src/receipt.js`), **Estimate, Confirmation, Invoice** (`src/docs/serviceDocs.js`), lines from one builder (`src/docs/lines.js`):
  - Necessary: Complete overhaul (CTR tier price, "â€“ Clean case and bracelet"), Refinish case and bracelet (polish price), billable parts marked Required ("Replace <component>", "â€“ <part #> <description>", retail Ã— qty), extra service lines.
  - Optional: billable parts marked Optional + optional extra lines. CTR kit / In-CTR / upgrade parts never printed.
  - Notes: exchange-basis legal sentence + one "While examining your watch, our watchmakers found that the â€¦ is â€¦" per priced finding (auto until edited) + reasons for declined requests.
  - Estimate: requests, analysis, necessary + totals (GST 5%), notes, optional, client's decision boxes, validity 3 months, delivery â‰ˆ N weeks (from ETA), remarks, undersigned + date/signature, legal notices.
  - Confirmation: requests, analysis, accepted work + totals, notes, Delivery + Delivery mode (Counter), Optional work (DECLINED) + totals, legal notices.
  - Invoice: services provided (accepted work) + totals, guarantee line.
  - Admin flow on the job page (`JobDocuments`): client details â†’ prices (must all be set) â†’ Create estimate â†’ Record decision (declined parts go back to stock) â†’ Create confirmation â†’ Create invoice. Each PDF is filed on the job (Print / Open / Email to service manager).
  - Client name/address: `job_clients` (Admin, and the Sales associate who took it in); saved at intake. Watchmakers never see it.

## The process (Plaque I)
1. **Receipt** â€” formal confirmation of reception + customer request. Not the job bag. Archived (scanned/saved). âœ… built (signed on iPad, filed on the job).
2. **WSR serial number check** â€” before any intervention, so before the Estimate. Bracelet sizing on new watches is not an intervention. âœ… prompt on the job; blocks leaving Estimate.
3. **Estimate** â€” within **24 h** of intake (up to 72 h for 40 % of repairs), after the watchmaker's analysis. Necessary vs Optional clearly separated. Client tick boxes (accept necessary / tick accepted options / refuse), date + signature. Archived. Not the job bag, not the Rolex pre-approval form (pre-approval only for watches sent to Rolex). An "immediate estimate" over the counter is recommended.
4. **Confirmation** â€” the accepted Necessary/Optional work (breakdown), may list refused options. Issued after the client's decision (print / PDF by email). Cannot be the scanned estimate. Archived.
5. **Timing sheet** â€” per MRWS (watch info, timing, 1st/2nd criteria, 4-day test, power reserve, dates). Workshop + archive only.
6. **WSR declaration** â€” intervention and configuration change declared at the service end date.
7. **Invoice** â€” based on the Confirmation: breakdown + pricing of services and charged spare parts. Printed or PDF, archived.

All documents **dated**; **typed** (only signatures, pre-approval form, timing sheet and tick boxes may be handwritten). The four documents must share **one common template** (harmonized). Rolex layout optional; the content is mandatory.

## Required content (Plaque II) â€” on every document where it applies
- Date (issue date, + client acceptance date where applicable)
- Retailer: J. Vair Anderson, 409 â€“ 3rd Street SW, Calgary AB T2P 4Z2, (403) 266-1669
- Client: first and last name, address
- Title: RECEIPT / ESTIMATE / CONFIRMATION / INVOICE
- Repair number (our Edge job #, "OUR REF #")
- **Watch description, 4 parts:**
  1. Model number + description â€” `M126710BLNR Rolex GMT-Master II`, `M124300 Rolex Oyster Perpetual` (`watchLine()`)
  2. Case serial number
  3. Bracelet reference + description â€” `20-93150-20 Rolex Oyster Fliplock Steel` (`braceletLine()`)
  4. Dial description â€” `Dial 16610 black markers w lgn` (`dialLine()`)
- Customer requests â€” Rolex wording: "Perform complete overhaul", "Refinish case and bracelet" / "Do not refinish case", "Do not refinish bracelet", "Replace crystal"â€¦
- Watch analysis (estimate onwards) â€” e.g. "Hands scratched, Dial scratched, Bezel dented, Insert discoloured, Crown worn, Crystal badly chipped, Case dented at 2, Bracelet scratched"
- **Necessary work** and **Optional work**, separated; every service and every charged spare part listed with Rolex part # + description and **MSRP CAD (tax excl.)**. Services priced from the **Rolex Service Handbook** (ask RCL if missing); parts from **MyRolexWorldService**. Labour for optional parts is inside the CTR set price.
- Client acceptance / refusal
- **Service lead time**: 10, 15 or 20 business days (documents show "Delivery: approximately N weeks")
- Tax line: **GST 5%** (Alberta); totals "Service / Supplies Total", "G.S.T 5%", "Total CAD"
- **Legal notice must include**: "All component prices are calculated on an exchange basis, and therefore any replaced components will not be returned. All replacement components will be of the current generation available." (JVA's receipt page 2 has the full Alberta legal notices â€” reuse it.)

## Document specifics (CONTENT ONLY guidelines + Excel template)
- **Receipt**: header, Bill to/Deliver to, RECEIPT, OUR REF #, WATCH, SERIAL #, BRACELET, DIAL, "Dear Sir, Madamâ€¦", **Customer requests** as "- â€¦" lines, Acknowledgement and authorization ("I, the undersigned â€¦ declare that I have read and accepted the legal noticesâ€¦ I confirm that the data transmitted on the watch is correct."), DATE + SIGNATURE, page 2 legal notices.
- **Estimate**: + Customer requests, **Watch analysis**, **Necessary work** (lines + part sub-lines "â€“ 24-704-0 crown with gasket 704 st", MSRP), Service/Supplies Total, GST, Total CAD; page 2 **Notes** (exchange-basis sentence; one "After analysis, our watchmakers found that the â€¦ is â€¦; its replacement is proposed in the optional workâ€¦" note per finding; "luminous material â€¦ new generation" where relevant); **Optional work** (lines + MSRP, "(1) In case of refusal, the service guarantee will not be delivered in its entirety" where it applies); page 3 **Client's decision** (â˜ I accept the necessary work + total; Optional work â€” tick accepted options; â˜ I refuse the estimate), "This estimate is valid for 3 months from the date of issue. Delivery: approximately N weeks on approval.", Remarks, "I, the undersigned â€¦ certify that I have read and understood the estimate as well as the legal notices attached and confirm my decisionâ€¦", Date + Signature; legal notices page.
- **Confirmation**: CONFIRMATION title, Customer requests, Watch analysis, **Accepted work** (lines + parts + MSRP, totals, GST), Notes, Delivery (approx. N weeks), Delivery mode (Counter), **Optional work (DECLINED)** with totals; legal notices.
- **Invoice**: INVOICE title, **Services provided** (lines + parts + MSRP), Service/Supplies Total, GST 5%, Total CAD.
- Footer on Rolex samples: "on.rolex.com/service â€” For more information on Rolex servicing".

## Other forms
- **Immediate Proceed (Modern & Classic)** â€” Rolex form for over-the-counter CTR: Retailer name/ref, serial, model, client name, requested interventions; "For Complete Overhaul: Polishing & Satin-Finishing of Case and Bracelet (Optional) **$210**" Yes/No; watch conditions; total amount tax excl.; accepted that extra necessary work is charged up to **15 % of the set service price** without a new estimate (beyond that a detailed estimate is sent); data transmitted to Rolex Canada; client + retailer signatures/dates. â†’ candidate to generate at intake when the client wants to proceed immediately.
- **Vintage Analysis Fee** (JVA) â€” $350.00 + GST 5% = $367.50; payable even if the estimate is refused or the watch is counterfeit; vintage estimates within 3 weeks, restoration estimates within 3 months; client accept/decline, signature; JVA legal notices. â†’ generate at intake for vintage watches.

## Watch analysis vocabulary (Plaque II, merged into `CONDITIONS` in `src/rules.js`)
Bezel: discoloured, scratched, dented Â· Insert (disc for bezel): discoloured, scratched, chipped Â· Crystal: chipped, cracked, damaged Â·
Dial: discoloured, scratched, stained Â· Hands: discoloured, scratched, stained Â· Mid-case: dented, scratched Â· Crown: damaged, dented, worn Â·
Bracelet: dented, scratched, stretched, worn.

## Watchmaker assessment (Dylan, 2026-11-09)
- The watchmaker decides Necessary vs Optional on the job page (`JobAssessment`): billable parts (Parts â†’ + Add â†’ Billable) and service lines (+ Service). The office prices them in `JobDocuments`.
- **Optional work must be backed by a confirmed finding in the watch analysis** (component + term). Enforced in the database (migration 016: `add_job_part`, `set_job_part_need`, trigger on `jobs.extra_lines`) and in the UI; the estimate can't be created while an optional line is unbacked. Each backed line gets its "While examining your watchâ€¦" note.

## Classification at intake (Workflow v2.1, 2026-11-09)
- Sales picks **Modern / Classic / Vintage** (`jobs.classification`, migration 017). Modern/Classic: Receipt, in-store, CTR tier pre-selected when it has the same name.
- **Vintage**: the signed document is the **J. Vair Vintage Analysis Fee** form (`makeVintageFee` in `src/receipt.js`, kind `vintage_fee`; wording from the JVA editable form; fee + delivery weeks in Settings, default $350 / 18 weeks). Service type `Vintage analysis`, no CTR tier/polish/kit, no timeframe from the bench queue, excluded from the queue ETA. Job page: Rolex Toronto note, no Parts; the assessment panel is for the office (RCL's lines for the invoice); the fee is a necessary line on documents.
- âš  Rolex's **Immediate Proceed** form is headed "Modern & Classic watches category", but Workflow v2.1 lists it for Vintage intake. Not generated yet â€” ask Dylan whether it belongs to Vintage, or to Modern/Classic over-the-counter CTR.


## Template match + online signing (Dylan, 2026-11-12)
- Layout measured from JVA's SAV templates (`Rolex Service Estimate/Confirmation/Invoice/Receipt.pdf`): margins 55/562, 9 pt, values at x 173,
  title 14.7 pt, dates DD/MM/YYYY, page numbers bottom right, item sub-lines "-" at 86 / italic at 92, template capitalisation
  ("Complete Overhaul", "Replace Crystal", "Clean Case and Bracelet"). Receipt has its own variant (6.8 pt, margin 81, "OUR REFERENCE N°").
  Invoice header sits 57 pt lower, as in its template.
- Estimate: page 1 requests / analysis / Necessary Work + totals (+ Optional Work, required by Rolex); page 2 Notes (italic paragraph) and
  Clients Decision: each item with "☐ Accepted", "I refuse the estimate ☐", validity, Remarks, undersigned, DATE / SIGNATURE; legal notices.
- Confirmation: page 1 Accepted Work + totals; page 2 Notes + "Delivery … Delivery mode: Counter" (Rolex) + "Optional work (DECLINED)".
  Invoice: Services Provided + totals only. Receipt keeps "Watch condition on arrival" and the intake price (JVA practice).
- Online signing (migration 021/022, Edge Function `sign`, `src/repairs/SignPage.jsx`): "Email for signature" (estimate PDF attached +
  private link, 30 days) or "Sign in store" (iPad, full screen). The client's ticks, remarks, name, date and signature are filled into the
  estimate's own spots (`job_docs.fields`, `src/docs/stamp.js`) → "Estimate-signed" PDF filed on the job, decision recorded, declined parts
  back to stock, copy emailed to the client. Paper decisions still go through "Record paper decision".

## Phase 1 of the scanned-files plan (2026-11-12)
- Approved formats: client documents follow JVA's post-audit set (`Rolex › 1. Service - Rolex › 1. ROLEX SERVICE DOCUMENTS › 1. SERVICE DOCUMENTS ›
  SAV ALL - POST AUDIT NEW` and the workbook `SAV ALL- post audit.xlsx`, which generates the issued Estimates). Rolex forms are filled on Rolex's own PDF.
- **Immediate Proceed** (`src/docs/immediateProceed.js`): Rolex's fillable PDF (`public/templates/rolex-immediate-proceed.pdf`) filled and flattened
  for Vintage, and for a complete service only when the client ticks "Proceed immediately" at intake (not routine in store: the receipt shows
  the estimated price and the estimate follows within 24 h; the Rolex Pre-Approval is not used in store — Dylan, 2026-11-12): offer from Rolex's list, polish $210 Yes/No, other requests, conditions, total (15 % allowance
  optional in Settings), dates, client signature, associate. Printed with the receipt, filed separately (kind `immediate_proceed`).
- CTR prices = Rolex's offers CO - MODERN $840/$980/$1,190, CO - CLASSIC $1,250/$1,530/$1,810 (migration 023); polish with CTR $210.
- New identifiers: movement serial, bracelet links, clasp/bracelet code, Rolex service # (Toronto); "Rolex / WSC #" relabelled "WSC #".
- Changing serial / model / bracelet / dial after a document was made flags that document on the job ("create it again").
- Job-bag label (`src/docs/label.js`, 4×2 in): job #, client name, watch, serial, intake date. Internal only.

## Phase 4a: uploads + Rolex estimate conversion (2026-11-12)
- Any file can be uploaded on the job (Documents → Add a document) with a type: Rolex estimate / confirmation / invoice / delivery note,
  email, signed estimate scan, warranty card, photo, other (+ note). Kind `upload`, label in `job_docs.label` (migration 024). Office only.
- **Rolex estimate → JVA estimate**: Rolex's PDFs have text, read locally by `src/docs/rolexImport.js` (no AI service; the client name on
  "Your reference" is dropped). Tested on 193 Rolex documents (`scripts/test-rolex-import.mjs`): all 63 estimates read; necessary + options,
  part sub-lines, "included" lines (Test Water Resistance), "(1)" refusal footnote, notes, delivery weeks, shipping, max public vs invoiced.
  Review screen checks job #, serial and model against the job, then "Use for the JVA estimate": `estimate_source = 'rolex'`, lines in
  `extra_lines` (source `rolex`, client price = Rolex max. public price, `invoiced` kept), Rolex requests/analysis/notes printed on JVA's
  estimate. Rolex's $50 shipping is not charged to the client unless ticked. Revised Rolex estimates (_002…): upload, "Convert to JVA estimate".
- Client answers 2026-11-12: approved format = the issued 2026 estimates (post-audit workbook); polishing is a separate charge (new price list);
  Rolex Pre-Approval not used (receipt + estimate). Engraving requests: not answered yet.

## Phase 2: Service Overview, parts sourcing, timing (2026-11-12)
- **Service overview** panel on the job (`JobOverview.jsx`): client requests always in front of the watchmaker (declined ones marked), special
  handling chips (return old parts/crown, keep original parts/crown, do not refinish case/bracelet/case back, do not open dial side, change
  gaskets only), guarantee exclusions (water resistance, bracelet, movement, dial and hands, case), pre-cleaning done by / when, remarks &
  observations. Migration 025. Exclusions are stored now; printing them as estimate footnotes waits for the approved document format.
- Parts: no pick list and no extra sourcing ticks (Dylan, 2026-11-12). The parts process stays as agreed: the calibre's CTR kit loads by itself
  and comes off stock automatically when the job leaves Estimate; shortages are flagged to order.
- **Timing analysis** (`JobTiming.jsx`, `src/docs/timingSheet.js`): Rolex E6220-11 fields; 1st criterion (max − min), 2nd (average at 0 hr)
  and actual daily rate calculated; 4-day observation, power reserve, passed / not passed; several tests kept; printable. Position labels
  (Crown left / down / up, Dial up / down) to confirm with the watchmakers. Hidden for Vintage (Rolex Toronto).
- Watch analysis vocabulary: + Oscillating weight (bench only).
- **Reason for added parts** (Dylan, 2026-11-12; migration 026): any part added beyond the automatic CTR kit (In CTR, upgrade, billable,
  search) needs a reason, enforced in `add_job_part`. Reasons show on the parts list and the Watch analysis panel, and print on the
  Estimate / Confirmation under "Watch analysis" after the confirmed conditions (`analysisText` in `src/docs/lines.js`; duplicates skipped).
