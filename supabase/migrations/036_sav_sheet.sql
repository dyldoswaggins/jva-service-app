-- 036: Service Manager job sheet copied from JVA's "Rolex SAV" page (Richard, 2026-11-26). Adds columns only.
-- jobs: the SAV sheet's dates, lead time, accessories, client-decision details, Rolex's price per estimate line,
-- the Rolex World Service block, invoice extras, and a soft delete (jobs are never erased: CLAUDE.md §4).
alter table public.jobs
  add column if not exists estimate_date date,
  add column if not exists confirmation_date date,
  add column if not exists invoice_date date,
  add column if not exists lead_time text,              -- "Service lead time" printed on the confirmation
  add column if not exists delivery_weeks text,         -- "Delivery: approximately … weeks" on the estimate (e.g. "5 to 6")
  add column if not exists accessories text,            -- box, papers, extra links, strap
  add column if not exists decision_remarks text,
  add column if not exists signed_by text,
  add column if not exists signed_date date,
  add column if not exists rolex_prices jsonb not null default '{}'::jsonb, -- { line key: what Rolex charges JVA }
  add column if not exists rolex_ws jsonb not null default '{}'::jsonb,     -- Rolex World Service: sent, conf_no, conf_date, due, mode, inv_no, inv_date, shipping, returned
  add column if not exists inv_shipping numeric(10,2),  -- shipping charged to the client (a line on the invoice)
  add column if not exists payment_method text,
  add column if not exists deleted_at timestamptz,      -- "Delete this intake": hidden from every list, can be restored
  add column if not exists deleted_by uuid;

-- Bill to / Deliver to: city and province apart (address2 kept for older jobs), delivery choice
alter table public.job_clients
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists delivery text;
