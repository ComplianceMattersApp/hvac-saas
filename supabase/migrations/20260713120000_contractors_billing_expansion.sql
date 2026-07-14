-- Slice 2 — contractor billing expansion.
-- Adds a complete bill-to for contractors: billing country, a distinct billing
-- (accounts-payable) contact the invoice is addressed to, and the exact QBO
-- customer name to match against. Also adds billing_country to customers so the
-- customer bill-to is QBO-complete too.

alter table public.contractors
  add column if not exists billing_country text,
  add column if not exists billing_contact_name text,
  add column if not exists billing_contact_email text,
  add column if not exists qbo_customer_name text;

comment on column public.contractors.billing_contact_name is
  'Accounts-payable / billing contact person the invoice is addressed to (distinct from the contractor company name).';
comment on column public.contractors.billing_contact_email is
  'Email a contractor-billed invoice is sent to (AP contact). Preferred over billing_email for contractor billing.';
comment on column public.contractors.qbo_customer_name is
  'Exact QuickBooks Online customer DisplayName to match this contractor to, so invoices attach to the existing QBO customer instead of creating a near-duplicate. Consumed by the QBO sync resolver.';

alter table public.customers
  add column if not exists billing_country text;
