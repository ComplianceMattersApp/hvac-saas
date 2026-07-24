-- Allow single-job invoice drafts to act as neutral prepared billing details.
-- Consolidation voids those source drafts and creates the consolidated draft in
-- the same transaction, so saved lines are never duplicated or lost.

begin;

create or replace function public.create_consolidated_invoice_from_prepared_drafts_v1(
  p_account_owner_user_id uuid,
  p_request_key text,
  p_invoice jsonb,
  p_memberships jsonb,
  p_line_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_member record;
  v_conflict_invoice_id uuid;
  v_result uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if jsonb_typeof(p_memberships) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'membership payload must be an array';
  end if;

  -- Preserve the canonical RPC's request-key idempotency after the source
  -- drafts have already been consumed by a successful first call.
  if exists (
    select 1
    from public.internal_invoices invoice
    where invoice.account_owner_user_id = p_account_owner_user_id
      and invoice.consolidated_request_key = btrim(coalesce(p_request_key, ''))
  ) then
    return public.create_consolidated_invoice_draft_v1(
      p_account_owner_user_id,
      p_request_key,
      p_invoice,
      p_memberships,
      p_line_items
    );
  end if;

  -- Match the lock order used by the canonical creation RPC.
  for v_member in
    select (member->>'job_id')::uuid as job_id
    from jsonb_array_elements(p_memberships) member
    order by (member->>'job_id')::uuid
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_member.job_id::text, 0));
  end loop;

  -- Only a single-job primary draft is neutral preparation. A consolidated
  -- draft or any issued lifecycle state remains a hard duplicate-billing gate.
  select invoice.id into v_conflict_invoice_id
  from public.internal_invoice_jobs membership
  join public.internal_invoices invoice on invoice.id = membership.internal_invoice_id
  join jsonb_array_elements(p_memberships) selected
    on (selected->>'job_id')::uuid = membership.job_id
  where invoice.status <> 'void'
    and invoice.invoice_kind = 'primary'
    and (
      invoice.status <> 'draft'
      or (
        select count(*)
        from public.internal_invoice_jobs source_membership
        where source_membership.internal_invoice_id = invoice.id
      ) <> 1
    )
  limit 1;

  if v_conflict_invoice_id is not null then
    raise exception using errcode = '23505', message = 'selected job already belongs to an active primary invoice';
  end if;

  update public.internal_invoices invoice
  set
    status = 'void',
    voided_at = now(),
    void_reason = 'Superseded by consolidated invoice draft',
    updated_by_user_id = auth.uid(),
    updated_at = now()
  where invoice.account_owner_user_id = p_account_owner_user_id
    and invoice.status = 'draft'
    and invoice.invoice_kind = 'primary'
    and exists (
      select 1
      from public.internal_invoice_jobs membership
      join jsonb_array_elements(p_memberships) selected
        on (selected->>'job_id')::uuid = membership.job_id
      where membership.internal_invoice_id = invoice.id
    )
    and (
      select count(*)
      from public.internal_invoice_jobs source_membership
      where source_membership.internal_invoice_id = invoice.id
    ) = 1;

  v_result := public.create_consolidated_invoice_draft_v1(
    p_account_owner_user_id,
    p_request_key,
    p_invoice,
    p_memberships,
    p_line_items
  );
  return v_result;
end;
$$;

revoke all on function public.create_consolidated_invoice_from_prepared_drafts_v1(uuid, text, jsonb, jsonb, jsonb) from public;
grant execute on function public.create_consolidated_invoice_from_prepared_drafts_v1(uuid, text, jsonb, jsonb, jsonb) to authenticated;

comment on function public.create_consolidated_invoice_from_prepared_drafts_v1(uuid, text, jsonb, jsonb, jsonb) is
  'Atomically consumes eligible single-job draft billing details into a consolidated draft; issued and consolidated invoices remain locked.';

commit;
