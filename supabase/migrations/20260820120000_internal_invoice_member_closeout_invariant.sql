-- Keep consolidated invoice membership and job closeout projections atomic.
--
-- An issued consolidated invoice is commercial truth for every member job,
-- not only internal_invoices.job_id. Older application code could later finish
-- ECC certificates using an anchor-only invoice lookup and strand non-anchor
-- members at invoice_required even though the batch invoice was issued.

begin;

create or replace function public.reconcile_internal_invoice_members_on_issue()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.invoice_kind <> 'primary'
     or new.status <> 'issued'
     or old.status = 'issued' then
    return new;
  end if;

  update public.jobs as job
  set
    invoice_complete = true,
    invoice_number = new.invoice_number,
    ops_status = case
      -- Close only derived closeout states. Explicit waits, holds, follow-ups,
      -- failures, and review states remain authoritative.
      when lower(coalesce(job.ops_status, '')) in ('paperwork_required', 'invoice_required')
       and coalesce(job.field_complete, false) = true
       and (
         lower(coalesce(job.job_type, '')) <> 'ecc'
         or coalesce(job.certs_complete, false) = true
       )
      then 'closed'
      else job.ops_status
    end
  from public.internal_invoice_jobs as membership
  where membership.internal_invoice_id = new.id
    and membership.job_id = job.id
    and membership.account_owner_user_id = new.account_owner_user_id;

  return new;
end;
$$;

drop trigger if exists trg_internal_invoices_reconcile_members_on_issue
  on public.internal_invoices;

create trigger trg_internal_invoices_reconcile_members_on_issue
after update of status on public.internal_invoices
for each row
when (new.status = 'issued' and old.status is distinct from new.status)
execute function public.reconcile_internal_invoice_members_on_issue();

comment on function public.reconcile_internal_invoice_members_on_issue() is
  'Atomically projects an issued primary invoice onto every member job and closes only satisfied derived closeout states.';

-- Repair existing members whose issued batch invoice is already canonical
-- truth. The scope deliberately excludes explicit operational blockers.
with repair_candidates as materialized (
  select distinct on (job.id)
    job.id,
    job.ops_status as previous_ops_status,
    job.invoice_complete as previous_invoice_complete,
    job.invoice_number as previous_invoice_number,
    invoice.invoice_number as issued_invoice_number,
    case
      when lower(coalesce(job.ops_status, '')) in ('paperwork_required', 'invoice_required')
       and coalesce(job.field_complete, false) = true
       and (
         lower(coalesce(job.job_type, '')) <> 'ecc'
         or coalesce(job.certs_complete, false) = true
       )
      then 'closed'
      else job.ops_status
    end as repaired_ops_status
  from public.jobs as job
  join public.internal_invoice_jobs as membership
    on membership.job_id = job.id
   and membership.account_owner_user_id = job.account_owner_user_id
  join public.internal_invoices as invoice
    on invoice.id = membership.internal_invoice_id
   and invoice.account_owner_user_id = membership.account_owner_user_id
  where invoice.invoice_kind = 'primary'
    and invoice.status = 'issued'
    and job.deleted_at is null
    and lower(coalesce(job.status, '')) <> 'cancelled'
    and (
      coalesce(job.invoice_complete, false) = false
      or job.invoice_number is distinct from invoice.invoice_number
      or (
        lower(coalesce(job.ops_status, '')) in ('paperwork_required', 'invoice_required')
        and coalesce(job.field_complete, false) = true
        and (
          lower(coalesce(job.job_type, '')) <> 'ecc'
          or coalesce(job.certs_complete, false) = true
        )
      )
    )
  order by job.id, invoice.issued_at desc nulls last, invoice.created_at desc
), repaired_jobs as (
  update public.jobs as job
  set
    invoice_complete = true,
    invoice_number = candidate.issued_invoice_number,
    ops_status = candidate.repaired_ops_status
  from repair_candidates as candidate
  where job.id = candidate.id
  returning
    job.id,
    candidate.previous_ops_status,
    candidate.repaired_ops_status,
    candidate.previous_invoice_complete,
    candidate.previous_invoice_number,
    candidate.issued_invoice_number
)
insert into public.job_events (
  job_id,
  event_type,
  message,
  meta,
  user_id
)
select
  repaired.id,
  'ops_update',
  'Issued consolidated invoice closeout projection repaired',
  jsonb_build_object(
    'source', 'supabase_migration_20260820120000_internal_invoice_member_closeout_invariant',
    'repair_kind', 'issued_invoice_member_closeout_projection',
    'changes', jsonb_build_array(
      jsonb_build_object(
        'field', 'invoice_complete',
        'from', repaired.previous_invoice_complete,
        'to', true
      ),
      jsonb_build_object(
        'field', 'invoice_number',
        'from', repaired.previous_invoice_number,
        'to', repaired.issued_invoice_number
      ),
      jsonb_build_object(
        'field', 'ops_status',
        'from', repaired.previous_ops_status,
        'to', repaired.repaired_ops_status
      )
    )
  ),
  null
from repaired_jobs as repaired;

commit;
