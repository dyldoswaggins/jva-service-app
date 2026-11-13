// Build checklist shown to Admin (Checklist tab): what's still needed to finish the app — information only JVA has, things to build,
// and setup that needs a person. Ticks, notes and added items are saved in app_settings.build_checklist (Dylan, 2026-11-12).
export const CHECKLIST_GROUPS = ['Information needed', 'To build', 'Setup', 'Done']

export const CHECKLIST = [
  // ---- Information needed ----
  { id: 'price-list', group: 'Information needed', who: 'Dylan', title: 'Which price list sets the complete-service price?',
    detail: "Intake now picks the class and offer from the model, using Rolex's 2025-2026 Service Prices by collection (Modern: Oyster $800, Date $850, Datejust $950, Professional $1,000, Day-Date / Daytona $1,100, Specialty $1,350; Classic $1,000–$1,750). The offers shown are the Immediate Proceed ones (Modern $840 / $980 / $1,190, Classic $1,250 / $1,530 / $1,810). Confirm which list applies, and the collection → offer match: Oyster, Date, Cellini → $840; Datejust, Professional → $980; Day-Date, Daytona, Specialty → $1,190 (Classic: Oyster, Date, Datejust → $1,250; Day-Date, Professional → $1,530; Daytona → $1,810)." },
  { id: 'air-king', group: 'Information needed', who: 'Dylan', title: 'Air-King: Oyster or Professional collection?',
    detail: 'The price list has Air-King under both. The app uses Oyster for now.' },
  { id: 'reference-list', group: 'Information needed', who: 'Dylan', title: 'Full reference list → class (Modern / Classic / Vintage) and collection',
    detail: 'For now the class comes from the reference: 6 digits = Modern, 5 = Classic, 4 = Vintage (most watches). The full list will cover the exceptions and give the collection (and so the offer and polishing line) for every reference.' },
  { id: 'doc-formats', group: 'Information needed', who: 'Dylan', title: 'Approved document formats (estimate, confirmation, invoice)',
    detail: 'The current client documents need to match the approved format exactly. Send the correct-format samples (Phase 3).' },
  { id: 'kits-21-30', group: 'Information needed', who: 'Jared', title: '21xx and 30xx calibre CTR kit lists',
    detail: 'Statuses and per-job quantities, so those calibres take their CTR kit automatically.' },
  { id: 'open-box', group: 'Information needed', who: 'Jared', title: '"Open Box" column meaning (Yes / Could / No)' },
  { id: 'ctr-legend', group: 'Information needed', who: 'Jared / Dylan', title: 'Which parts are inside the CTR price, and the exceptions',
    detail: 'E.g. oscillator, balance complete. Does it change by class?' },
  { id: 'timing-labels', group: 'Information needed', who: 'Watchmakers', title: 'Timing sheet: confirm the position labels' },
  { id: 'engraving-fee', group: 'Information needed', who: 'Dylan', title: 'Engraving: price to quote and when it is charged',
    detail: 'Rolex lists $100–$150 retail. Intake shows "usually $100–150".' },
  { id: 'toronto-fields', group: 'Information needed', who: 'Dylan', title: 'Toronto send-outs: what to record',
    detail: 'E.g. date shipped, waybill / tracking, Rolex service #, date returned.' },
  { id: 'validation-steps', group: 'Information needed', who: 'Dylan', title: 'Watch validation: anything else the Service Manager checks?',
    detail: 'Now: Edge job #, WSC #, MRWS #, bracelet reference (and the watchmaker does the WSR check). Add papers / warranty card / other checks if needed.' },
  { id: 'statuses', group: 'Information needed', who: 'Dylan', title: 'Confirm the status list',
    detail: 'Estimate, Waiting on parts, On deck, Polishing, Timekeeping, Sent to Toronto, Done, Ready for pickup, Picked up, Cancelled.' },

  // ---- To build ----
  { id: 'dash-manager', group: 'To build', who: 'Claude', title: 'Service Manager dashboard',
    detail: 'Own home screen: estimates due / overdue, waiting on the client, watch validation, Toronto, pickup, invoices, plus turnaround times and weekly counts. Today: the to-do panel on the Jobs page.' },
  { id: 'dash-watchmaker', group: 'To build', who: 'Claude', title: 'Watchmaker dashboard',
    detail: 'My bench: jobs to assess, bench queue by ETA, time on each job, parts short, timing tests due.' },
  { id: 'phase3', group: 'To build', who: 'Claude', title: 'Client documents in the approved format', detail: 'Waits for the samples (see Information needed).' },
  { id: 'toronto-record', group: 'To build', who: 'Claude', title: 'Toronto send-out record, confirmation / invoice uploads' },
  { id: 'photo-suggest', group: 'To build', who: 'Claude', title: 'Suggest conditions from intake photos',
    detail: 'Only once there are enough photos with confirmed conditions to learn from.' },
  { id: 'training-video', group: 'To build', who: 'Claude', title: 'Training video: full walkthrough with every document' },

  // ---- Setup (needs a person) ----
  { id: 'sign-in', group: 'Setup', who: 'Dylan', title: 'Turn sign-in back on before real client data goes in',
    detail: 'The app is open (role picker, no sign-in). Anyone with the link can see and change data.' },
  { id: 'email', group: 'Setup', who: 'Dylan', title: 'Connect email',
    detail: 'Client copies (receipt at intake, estimate for signature) and service-manager copies. Needs the Gmail app password or a domain mailbox in Supabase secrets.' },
  { id: 'accounts', group: 'Setup', who: 'Dylan', title: "Staff accounts: re-create Dylan's, add Peiwen" },
  { id: 'leaked-pw', group: 'Setup', who: 'Dylan', title: 'Supabase: turn on leaked-password protection' },
  { id: 'scan-key', group: 'Setup', who: 'Dylan', title: 'Scan reading: Anthropic API key in Supabase secrets (if not done)' },
  { id: 'delete-scans', group: 'Setup', who: 'Claude', title: 'Delete the local copies of scanned service files used for testing' },

  // ---- Done (recent) ----
  { id: 'auto-class', group: 'Done', who: 'Claude', done: true, title: 'Intake picks Modern / Classic / Vintage (reference digits), the offer and the polishing line from the model' },
  { id: 'validation', group: 'Done', who: 'Claude', done: true, title: 'Watch validation: Edge #, WSC #, MRWS #, bracelet ref entered by the Service Manager' },
  { id: 'client-email', group: 'Done', who: 'Claude', done: true, title: 'Client email at intake (copy sent once email is connected)' },
  { id: 'engraving', group: 'Done', who: 'Claude', done: true, title: 'Engraving: straight to Rolex with the Engraving Request Form' },
  { id: 'role-picker', group: 'Done', who: 'Claude', done: true, title: 'Role picker: Service Manager, Watchmaker, Sales' },
  { id: 'pickup', group: 'Done', who: 'Claude', done: true, title: 'Completion checklist, pickup screen, contact log' },
  { id: 'signing', group: 'Done', who: 'Claude', done: true, title: 'Estimate signing in store or by link' },
  { id: 'rolex-convert', group: 'Done', who: 'Claude', done: true, title: "Upload Rolex's estimate and convert it to the JVA estimate" },
]
