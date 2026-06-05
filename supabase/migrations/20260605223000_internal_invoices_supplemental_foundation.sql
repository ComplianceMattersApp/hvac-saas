-- Supplemental / add-on invoice foundation.
-- Preserves original invoice/payment truth while allowing future linked
-- supplemental invoices to coexist with one current primary invoice per job.

set check_function_bodies = off;

alter table public.internal_invoices
  add column if not exists invoice_kind text not null default 'primary',
  add column if not exists original_internal_invoice_id uuid null references public.internal_invoices(id) on delete restrict,
  add column if not exists supplemental_reason text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'internal_invoices_kind_valid_chk'
  ) then
    alter table public.internal_invoices
      add constraint internal_invoices_kind_valid_chk
      check (invoice_kind in ('primary', 'supplemental'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'internal_invoices_primary_has_no_original_chk'
  ) then
    alter table public.internal_invoices
      add constraint internal_invoices_primary_has_no_original_chk
      check (invoice_kind <> 'primary' or original_internal_invoice_id is null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'internal_invoices_supplemental_reason_trimmed_chk'
  ) then
    alter table public.internal_invoices
      add constraint internal_invoices_supplemental_reason_trimmed_chk
      check (supplemental_reason is null or length(btrim(supplemental_reason)) > 0);
  end if;
end
$$;

drop index if exists public.internal_invoices_job_unique_idx;
drop index if exists public.internal_invoices_job_active_unique_idx;

create unique index if not exists internal_invoices_job_active_primary_unique_idx
on public.internal_invoices (job_id)
where status <> 'void' and invoice_kind = 'primary';

create index if not exists internal_invoices_original_invoice_idx
on public.internal_invoices (original_internal_invoice_id)
where original_internal_invoice_id is not null;

create index if not exists internal_invoices_owner_job_kind_status_idx
on public.internal_invoices (account_owner_user_id, job_id, invoice_kind, status, created_at desc);

create or replace function public.assert_internal_invoice_supplemental_scope()
returns trigger
language plpgsql
as $$
declare
  v_original record;
begin
  if new.original_internal_invoice_id is not null and new.id is not null and new.original_internal_invoice_id = new.id then
    raise exception using
      errcode = '23514',
      message = 'internal_invoices.original_internal_invoice_id cannot self-reference';
  end if;

  if new.original_internal_invoice_id is null then
    return new;
  end if;

  if new.invoice_kind <> 'supplemental' then
    raise exception using
      errcode = '23514',
      message = 'only supplemental invoices may reference an original invoice';
  end if;

  select
    i.id,
    i.account_owner_user_id,
    i.job_id,
    i.customer_id,
    i.service_case_id,
    i.invoice_kind,
    i.status
  into v_original
  from public.internal_invoices i
  where i.id = new.original_internal_invoice_id;

  if v_original.id is null then
    raise exception using
      errcode = '23503',
      message = 'internal_invoices.original_internal_invoice_id must reference an existing internal invoice';
  end if;

  if new.account_owner_user_id <> v_original.account_owner_user_id then
    raise exception using
      errcode = '23514',
      message = 'supplemental invoice must match original invoice account owner';
  end if;

  if new.job_id <> v_original.job_id then
    raise exception using
      errcode = '23514',
      message = 'supplemental invoice must match original invoice job';
  end if;

  if v_original.invoice_kind <> 'primary' then
    raise exception using
      errcode = '23514',
      message = 'supplemental invoice must reference a primary invoice in first posture';
  end if;

  if v_original.status <> 'issued' then
    raise exception using
      errcode = '23514',
      message = 'supplemental invoice original reference must be an issued invoice';
  end if;

  if new.customer_id is not null and v_original.customer_id is not null and new.customer_id <> v_original.customer_id then
    raise exception using
      errcode = '23514',
      message = 'supplemental invoice must match original invoice customer when both are present';
  end if;

  if new.service_case_id is not null and v_original.service_case_id is not null and new.service_case_id <> v_original.service_case_id then
    raise exception using
      errcode = '23514',
      message = 'supplemental invoice must match original invoice service case when both are present';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_internal_invoices_zz_assert_supplemental_scope on public.internal_invoices;

create trigger trg_internal_invoices_zz_assert_supplemental_scope
before insert or update of invoice_kind, original_internal_invoice_id, account_owner_user_id, job_id, customer_id, service_case_id
on public.internal_invoices
for each row
execute function public.assert_internal_invoice_supplemental_scope();
