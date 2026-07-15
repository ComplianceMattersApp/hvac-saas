-- Freeze accounts-receivable ownership on each invoice independently from the
-- job's mutable billing preference. Job/customer association controls where an
-- invoice is visible; these fields control who actually owes the balance.

alter table public.internal_invoices
  add column if not exists bill_to_kind text,
  add column if not exists bill_to_contractor_id uuid references public.contractors(id) on delete set null;

alter table public.internal_invoices
  drop constraint if exists internal_invoices_bill_to_kind_valid_chk;

alter table public.internal_invoices
  add constraint internal_invoices_bill_to_kind_valid_chk
  check (bill_to_kind is null or bill_to_kind in ('customer', 'contractor', 'other'));

alter table public.internal_invoices
  drop constraint if exists internal_invoices_bill_to_contractor_consistent_chk;

alter table public.internal_invoices
  add constraint internal_invoices_bill_to_contractor_consistent_chk
  check (
    (bill_to_kind = 'contractor' and bill_to_contractor_id is not null)
    or (bill_to_kind is distinct from 'contractor' and bill_to_contractor_id is null)
    or bill_to_kind is null
  );

create index if not exists internal_invoices_owner_bill_to_contractor_status_idx
  on public.internal_invoices (account_owner_user_id, bill_to_contractor_id, status)
  where bill_to_kind = 'contractor';

comment on column public.internal_invoices.bill_to_kind is
  'Frozen accounts-receivable owner type. Visibility may still follow the service customer/job.';

comment on column public.internal_invoices.bill_to_contractor_id is
  'Frozen contractor payer when bill_to_kind=contractor. Never derive customer balance from job association alone.';

