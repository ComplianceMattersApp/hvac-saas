-- Consolidated contractor invoicing V1: additive membership and line provenance.
-- This migration does not create consolidated invoices or change invoice lifecycle UI.

begin;

create table if not exists public.internal_invoice_jobs (
  id uuid primary key default gen_random_uuid(),
  account_owner_user_id uuid not null references auth.users(id) on delete restrict,
  internal_invoice_id uuid not null references public.internal_invoices(id) on delete restrict,
  job_id uuid not null references public.jobs(id) on delete restrict,
  inclusion_order integer not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint internal_invoice_jobs_invoice_job_unique unique (internal_invoice_id, job_id),
  constraint internal_invoice_jobs_invoice_order_unique unique (internal_invoice_id, inclusion_order),
  constraint internal_invoice_jobs_inclusion_order_positive_chk check (inclusion_order > 0)
);

create index if not exists internal_invoice_jobs_owner_job_idx
  on public.internal_invoice_jobs (account_owner_user_id, job_id, created_at desc);

create index if not exists internal_invoice_jobs_invoice_order_idx
  on public.internal_invoice_jobs (internal_invoice_id, inclusion_order);

create or replace function public.assert_internal_invoice_job_membership_scope()
returns trigger
language plpgsql
as $$
declare
  v_invoice record;
  v_job_owner uuid;
begin
  select id, account_owner_user_id, job_id, status, invoice_kind
  into v_invoice
  from public.internal_invoices
  where id = new.internal_invoice_id;

  if v_invoice.id is null then
    raise exception using errcode = '23503', message = 'internal_invoice_jobs invoice not found';
  end if;

  select account_owner_user_id
  into v_job_owner
  from public.jobs
  where id = new.job_id;

  if v_job_owner is null then
    raise exception using errcode = '23503', message = 'internal_invoice_jobs job not found';
  end if;

  if new.account_owner_user_id <> v_invoice.account_owner_user_id
     or new.account_owner_user_id <> v_job_owner then
    raise exception using errcode = '23514', message = 'internal_invoice_jobs account scope mismatch';
  end if;

  if v_invoice.invoice_kind = 'supplemental' and new.job_id <> v_invoice.job_id then
    raise exception using errcode = '23514', message = 'supplemental invoice membership must remain on its anchor job';
  end if;

  if tg_op = 'UPDATE' and (
    old.internal_invoice_id is distinct from new.internal_invoice_id
    or old.job_id is distinct from new.job_id
    or old.account_owner_user_id is distinct from new.account_owner_user_id
    or old.created_by_user_id is distinct from new.created_by_user_id
    or old.created_at is distinct from new.created_at
  ) then
    raise exception using errcode = '23514', message = 'internal_invoice_jobs identity is immutable';
  end if;

  if tg_op = 'UPDATE' and v_invoice.status <> 'draft' then
    raise exception using errcode = '23514', message = 'issued or void invoice membership is immutable';
  end if;

  if v_invoice.status <> 'void' and v_invoice.invoice_kind = 'primary' then
    perform pg_advisory_xact_lock(hashtextextended(new.job_id::text, 0));

    if exists (
      select 1
      from public.internal_invoice_jobs membership
      join public.internal_invoices invoice on invoice.id = membership.internal_invoice_id
      where membership.job_id = new.job_id
        and membership.internal_invoice_id <> new.internal_invoice_id
        and invoice.status <> 'void'
        and invoice.invoice_kind = 'primary'
    ) then
      raise exception using errcode = '23505', message = 'job already belongs to an active primary invoice';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_internal_invoice_jobs_assert_scope
before insert or update on public.internal_invoice_jobs
for each row execute function public.assert_internal_invoice_job_membership_scope();

create or replace function public.prevent_non_draft_internal_invoice_membership_delete()
returns trigger
language plpgsql
as $$
declare
  v_status text;
  v_anchor_job_id uuid;
begin
  select status, job_id into v_status, v_anchor_job_id
  from public.internal_invoices
  where id = old.internal_invoice_id;

  if old.job_id = v_anchor_job_id then
    raise exception using errcode = '23514', message = 'invoice anchor membership cannot be deleted';
  end if;

  if v_status is distinct from 'draft' then
    raise exception using errcode = '23514', message = 'issued or void invoice membership cannot be deleted';
  end if;

  return old;
end;
$$;

create trigger trg_internal_invoice_jobs_prevent_historical_delete
before delete on public.internal_invoice_jobs
for each row execute function public.prevent_non_draft_internal_invoice_membership_delete();

-- Preserve the existing single-job creation path: its required job_id is also
-- inserted as membership order 1 without requiring an application change.
create or replace function public.ensure_internal_invoice_anchor_membership()
returns trigger
language plpgsql
as $$
begin
  insert into public.internal_invoice_jobs (
    account_owner_user_id,
    internal_invoice_id,
    job_id,
    inclusion_order,
    created_by_user_id,
    created_at
  ) values (
    new.account_owner_user_id,
    new.id,
    new.job_id,
    1,
    new.created_by_user_id,
    new.created_at
  )
  on conflict (internal_invoice_id, job_id) do nothing;

  return new;
end;
$$;

create trigger trg_internal_invoices_ensure_anchor_membership
after insert on public.internal_invoices
for each row execute function public.ensure_internal_invoice_anchor_membership();

insert into public.internal_invoice_jobs (
  account_owner_user_id,
  internal_invoice_id,
  job_id,
  inclusion_order,
  created_by_user_id,
  created_at
)
select
  invoice.account_owner_user_id,
  invoice.id,
  invoice.job_id,
  1,
  invoice.created_by_user_id,
  invoice.created_at
from public.internal_invoices invoice
on conflict (internal_invoice_id, job_id) do nothing;

-- Re-check all member jobs when a parent becomes an active primary invoice.
create or replace function public.assert_internal_invoice_active_memberships()
returns trigger
language plpgsql
as $$
declare
  v_membership record;
begin
  if new.status = 'void' or new.invoice_kind <> 'primary' then
    return new;
  end if;

  for v_membership in
    select job_id from public.internal_invoice_jobs where internal_invoice_id = new.id order by job_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_membership.job_id::text, 0));
    if exists (
      select 1
      from public.internal_invoice_jobs membership
      join public.internal_invoices invoice on invoice.id = membership.internal_invoice_id
      where membership.job_id = v_membership.job_id
        and membership.internal_invoice_id <> new.id
        and invoice.status <> 'void'
        and invoice.invoice_kind = 'primary'
    ) then
      raise exception using errcode = '23505', message = 'job already belongs to an active primary invoice';
    end if;
  end loop;

  return new;
end;
$$;

create trigger trg_internal_invoices_assert_active_memberships
before update of status, invoice_kind on public.internal_invoices
for each row execute function public.assert_internal_invoice_active_memberships();

alter table public.internal_invoice_line_items
  add column if not exists source_job_id uuid null references public.jobs(id) on delete restrict;

create index if not exists internal_invoice_line_items_source_job_idx
  on public.internal_invoice_line_items (source_job_id)
  where source_job_id is not null;

update public.internal_invoice_line_items line_item
set source_job_id = invoice.job_id
from public.internal_invoices invoice
where invoice.id = line_item.invoice_id
  and line_item.source_job_id is null;

alter table public.internal_invoice_line_items
  drop constraint if exists internal_invoice_line_items_source_job_membership_fk;

alter table public.internal_invoice_line_items
  add constraint internal_invoice_line_items_source_job_membership_fk
  foreign key (invoice_id, source_job_id)
  references public.internal_invoice_jobs (internal_invoice_id, job_id)
  on delete restrict;

create or replace function public.assert_internal_invoice_line_source_job()
returns trigger
language plpgsql
as $$
declare
  v_anchor_job_id uuid;
begin
  select job_id into v_anchor_job_id
  from public.internal_invoices
  where id = new.invoice_id;

  if v_anchor_job_id is null then
    raise exception using errcode = '23503', message = 'invoice line parent invoice not found';
  end if;

  new.source_job_id := coalesce(new.source_job_id, v_anchor_job_id);

  if not exists (
    select 1
    from public.internal_invoice_jobs membership
    where membership.internal_invoice_id = new.invoice_id
      and membership.job_id = new.source_job_id
  ) then
    raise exception using errcode = '23514', message = 'invoice line source job must belong to the invoice';
  end if;

  return new;
end;
$$;

create trigger trg_internal_invoice_line_items_assert_source_job
before insert or update of invoice_id, source_job_id on public.internal_invoice_line_items
for each row execute function public.assert_internal_invoice_line_source_job();

alter table public.internal_invoice_jobs enable row level security;

create policy internal_invoice_jobs_select_account_scope
on public.internal_invoice_jobs for select to authenticated
using (
  exists (
    select 1 from public.internal_users actor
    where actor.user_id = auth.uid()
      and actor.is_active = true
      and actor.account_owner_user_id = internal_invoice_jobs.account_owner_user_id
  )
);

create policy internal_invoice_jobs_insert_account_scope
on public.internal_invoice_jobs for insert to authenticated
with check (
  created_by_user_id = auth.uid()
  and exists (
    select 1 from public.internal_users actor
    where actor.user_id = auth.uid()
      and actor.is_active = true
      and actor.account_owner_user_id = internal_invoice_jobs.account_owner_user_id
  )
);

create policy internal_invoice_jobs_update_account_scope
on public.internal_invoice_jobs for update to authenticated
using (
  exists (
    select 1 from public.internal_users actor
    where actor.user_id = auth.uid()
      and actor.is_active = true
      and actor.account_owner_user_id = internal_invoice_jobs.account_owner_user_id
  )
)
with check (
  exists (
    select 1 from public.internal_users actor
    where actor.user_id = auth.uid()
      and actor.is_active = true
      and actor.account_owner_user_id = internal_invoice_jobs.account_owner_user_id
  )
);

create policy internal_invoice_jobs_delete_account_scope
on public.internal_invoice_jobs for delete to authenticated
using (
  exists (
    select 1
    from public.internal_users actor
    join public.internal_invoices invoice on invoice.id = internal_invoice_jobs.internal_invoice_id
    where actor.user_id = auth.uid()
      and actor.is_active = true
      and actor.account_owner_user_id = internal_invoice_jobs.account_owner_user_id
      and invoice.status = 'draft'
  )
);

comment on table public.internal_invoice_jobs is
  'Durable job membership for normal and consolidated internal invoices. Invoice remains commercial/payment truth.';
comment on column public.internal_invoices.job_id is
  'Backward-compatible anchor job. Canonical invoice membership is internal_invoice_jobs.';
comment on column public.internal_invoice_line_items.source_job_id is
  'Job whose existing invoice contribution produced this frozen line; must be an invoice member.';

commit;
