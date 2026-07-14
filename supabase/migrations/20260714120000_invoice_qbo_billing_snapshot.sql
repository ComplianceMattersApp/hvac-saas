-- Phase 4 — freeze the QBO customer identity + country onto the invoice bill-to
-- snapshot, so the QBO sync maps a contractor-billed invoice to the CORRECT QBO
-- customer (the contractor, matched by qbo_customer_name) instead of the end
-- customer, and can send a complete BillAddr.

alter table public.internal_invoices
  add column if not exists billing_country text,
  add column if not exists qbo_customer_name text;

comment on column public.internal_invoices.qbo_customer_name is
  'Exact QuickBooks DisplayName to attach this invoice to, frozen from the bill-to source (contractor/customer) at draft time. Preferred by the QBO sync over the derived name.';

-- Symmetry with contractors: let customers also pin their QBO customer name.
alter table public.customers
  add column if not exists qbo_customer_name text;
