-- Consolidated contractor invoicing V1: atomic/idempotent draft creation RPC.

begin;

alter table public.internal_invoices
  add column if not exists consolidated_request_key text null;

alter table public.internal_invoices
  drop constraint if exists internal_invoices_consolidated_request_key_trimmed_chk;

alter table public.internal_invoices
  add constraint internal_invoices_consolidated_request_key_trimmed_chk
  check (
    consolidated_request_key is null
    or (
      length(btrim(consolidated_request_key)) between 16 and 200
      and consolidated_request_key = btrim(consolidated_request_key)
    )
  );

create unique index if not exists internal_invoices_owner_consolidated_request_unique_idx
  on public.internal_invoices (account_owner_user_id, consolidated_request_key)
  where consolidated_request_key is not null;

create or replace function public.create_consolidated_invoice_draft_v1(
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
  v_actor_user_id uuid := auth.uid();
  v_invoice_id uuid;
  v_anchor_job_id uuid;
  v_contractor_id uuid;
  v_member_count integer;
  v_job_count integer;
  v_total_cents integer;
  v_bad_job_id uuid;
  v_member record;
  v_line record;
begin
  if v_actor_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if not exists (
    select 1
    from public.internal_users actor
    where actor.user_id = v_actor_user_id
      and actor.is_active = true
      and actor.account_owner_user_id = p_account_owner_user_id
      and (
        actor.user_id = actor.account_owner_user_id
        or lower(actor.role::text) in ('admin', 'billing')
      )
  ) then
    raise exception using errcode = '42501', message = 'invoice lifecycle authority required';
  end if;

  p_request_key := btrim(coalesce(p_request_key, ''));
  if length(p_request_key) < 16 or length(p_request_key) > 200 then
    raise exception using errcode = '22023', message = 'valid consolidated invoice request key required';
  end if;

  if jsonb_typeof(p_memberships) is distinct from 'array' or jsonb_typeof(p_line_items) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'membership and line payloads must be arrays';
  end if;

  select id into v_invoice_id
  from public.internal_invoices
  where account_owner_user_id = p_account_owner_user_id
    and consolidated_request_key = p_request_key;

  if v_invoice_id is not null then
    if (
      select count(*)
      from public.internal_invoice_jobs membership
      where membership.internal_invoice_id = v_invoice_id
    ) <> jsonb_array_length(p_memberships)
    or exists (
      select 1 from public.internal_invoice_jobs membership
      where membership.internal_invoice_id = v_invoice_id
        and not exists (
          select 1 from jsonb_array_elements(p_memberships) member
          where (member->>'job_id')::uuid = membership.job_id
        )
    ) then
      raise exception using errcode = '23514', message = 'request key was already used for a different job selection';
    end if;
    return v_invoice_id;
  end if;

  v_member_count := jsonb_array_length(p_memberships);
  if v_member_count < 2 or v_member_count > 50 then
    raise exception using errcode = '22023', message = 'consolidated invoice requires between 2 and 50 jobs';
  end if;

  if jsonb_array_length(p_line_items) < 1 then
    raise exception using errcode = '22023', message = 'consolidated invoice requires at least one line item';
  end if;

  select count(distinct (member->>'job_id')::uuid)
  into v_job_count
  from jsonb_array_elements(p_memberships) member;

  if v_job_count <> v_member_count then
    raise exception using errcode = '22023', message = 'consolidated invoice membership contains duplicate jobs';
  end if;

  select (member->>'job_id')::uuid
  into v_anchor_job_id
  from jsonb_array_elements(p_memberships) member
  where (member->>'inclusion_order')::integer = 1
  limit 1;

  if v_anchor_job_id is null
     or (select count(*) from jsonb_array_elements(p_memberships) member where (member->>'inclusion_order')::integer = 1) <> 1
     or (select count(distinct (member->>'inclusion_order')::integer) from jsonb_array_elements(p_memberships) member) <> v_member_count then
    raise exception using errcode = '22023', message = 'consolidated invoice membership order is invalid';
  end if;

  -- Serialize competing invoice creation for every selected job in stable order.
  for v_member in
    select (member->>'job_id')::uuid as job_id
    from jsonb_array_elements(p_memberships) member
    order by (member->>'job_id')::uuid
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_member.job_id::text, 0));
  end loop;

  perform 1
  from public.jobs job
  join jsonb_array_elements(p_memberships) member
    on (member->>'job_id')::uuid = job.id
  order by job.id
  for update of job;

  select count(*) into v_job_count
  from public.jobs job
  join jsonb_array_elements(p_memberships) member
    on (member->>'job_id')::uuid = job.id
  where job.account_owner_user_id = p_account_owner_user_id;

  if v_job_count <> v_member_count then
    raise exception using errcode = '23514', message = 'all selected jobs must belong to the authenticated account';
  end if;

  select job.id into v_bad_job_id
  from public.jobs job
  join jsonb_array_elements(p_memberships) member
    on (member->>'job_id')::uuid = job.id
  where job.deleted_at is not null
     or lower(coalesce(job.lifecycle_state, 'active')) <> 'active'
     or lower(coalesce(job.status, '')) <> 'completed'
     or not coalesce(job.field_complete, false)
     or job.contractor_id is null
     or lower(coalesce(job.billing_recipient, '')) <> 'contractor'
     or job.billing_disposition is not null
  limit 1;

  if v_bad_job_id is not null then
    raise exception using errcode = '23514', message = 'selected job is not eligible for consolidated internal invoicing';
  end if;

  select count(distinct job.contractor_id)
  into v_job_count
  from public.jobs job
  join jsonb_array_elements(p_memberships) member
    on (member->>'job_id')::uuid = job.id;

  if v_job_count <> 1 then
    raise exception using errcode = '23514', message = 'all selected jobs must use the same contractor';
  end if;

  select job.contractor_id into v_contractor_id
  from public.jobs job
  join jsonb_array_elements(p_memberships) member
    on (member->>'job_id')::uuid = job.id
  limit 1;

  if (p_invoice->>'bill_to_kind') is distinct from 'contractor'
     or (p_invoice->>'bill_to_contractor_id')::uuid is distinct from v_contractor_id
     or (p_invoice->>'job_id')::uuid is distinct from v_anchor_job_id then
    raise exception using errcode = '23514', message = 'invoice recipient or anchor does not match selected jobs';
  end if;

  select membership.job_id into v_bad_job_id
  from public.internal_invoice_jobs membership
  join public.internal_invoices invoice on invoice.id = membership.internal_invoice_id
  join jsonb_array_elements(p_memberships) selected
    on (selected->>'job_id')::uuid = membership.job_id
  where invoice.status <> 'void'
    and invoice.invoice_kind = 'primary'
  limit 1;

  if v_bad_job_id is not null then
    raise exception using errcode = '23505', message = 'selected job already belongs to an active primary invoice';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_line_items) line
    where not exists (
      select 1 from jsonb_array_elements(p_memberships) member
      where (member->>'job_id')::uuid = (line->>'source_job_id')::uuid
    )
  ) then
    raise exception using errcode = '23514', message = 'every invoice line source job must be selected';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_memberships) member
    where not exists (
      select 1 from jsonb_array_elements(p_line_items) line
      where (line->>'source_job_id')::uuid = (member->>'job_id')::uuid
    )
  ) then
    raise exception using errcode = '23514', message = 'every selected job must contribute invoice lines';
  end if;

  if (
    select count(distinct (line->>'sort_order')::integer)
    from jsonb_array_elements(p_line_items) line
  ) <> jsonb_array_length(p_line_items)
  or (
    select min((line->>'sort_order')::integer) from jsonb_array_elements(p_line_items) line
  ) <> 1
  or (
    select max((line->>'sort_order')::integer) from jsonb_array_elements(p_line_items) line
  ) <> jsonb_array_length(p_line_items) then
    raise exception using errcode = '22023', message = 'invoice line ordering must be contiguous and deterministic';
  end if;

  select coalesce(sum(round(((line->>'line_subtotal')::numeric) * 100)), 0)::integer
  into v_total_cents
  from jsonb_array_elements(p_line_items) line;

  if v_total_cents <= 0 then
    raise exception using errcode = '23514', message = 'consolidated invoice total must be positive';
  end if;

  insert into public.internal_invoices (
    account_owner_user_id, job_id, customer_id, bill_to_kind,
    bill_to_contractor_id, location_id, service_case_id, invoice_number,
    status, invoice_date, source_type, subtotal_cents, total_cents, notes,
    billing_name, billing_email, billing_phone, billing_address_line1,
    billing_address_line2, billing_city, billing_state, billing_zip,
    billing_country, qbo_customer_name, consolidated_request_key,
    created_by_user_id, updated_by_user_id
  ) values (
    p_account_owner_user_id,
    v_anchor_job_id,
    nullif(p_invoice->>'customer_id', '')::uuid,
    'contractor',
    v_contractor_id,
    nullif(p_invoice->>'location_id', '')::uuid,
    nullif(p_invoice->>'service_case_id', '')::uuid,
    p_invoice->>'invoice_number',
    'draft',
    (p_invoice->>'invoice_date')::date,
    'job',
    v_total_cents,
    v_total_cents,
    nullif(p_invoice->>'notes', ''),
    nullif(p_invoice->>'billing_name', ''),
    nullif(p_invoice->>'billing_email', ''),
    nullif(p_invoice->>'billing_phone', ''),
    nullif(p_invoice->>'billing_address_line1', ''),
    nullif(p_invoice->>'billing_address_line2', ''),
    nullif(p_invoice->>'billing_city', ''),
    nullif(p_invoice->>'billing_state', ''),
    nullif(p_invoice->>'billing_zip', ''),
    nullif(p_invoice->>'billing_country', ''),
    nullif(p_invoice->>'qbo_customer_name', ''),
    p_request_key,
    v_actor_user_id,
    v_actor_user_id
  ) returning id into v_invoice_id;

  insert into public.internal_invoice_jobs (
    account_owner_user_id, internal_invoice_id, job_id, inclusion_order, created_by_user_id
  )
  select
    p_account_owner_user_id,
    v_invoice_id,
    (member->>'job_id')::uuid,
    (member->>'inclusion_order')::integer,
    v_actor_user_id
  from jsonb_array_elements(p_memberships) member
  where (member->>'job_id')::uuid <> v_anchor_job_id
  order by (member->>'inclusion_order')::integer;

  insert into public.internal_invoice_line_items (
    invoice_id, source_job_id, sort_order, source_kind,
    source_pricebook_item_id, source_visit_scope_item_id,
    item_name_snapshot, description_snapshot, item_type_snapshot,
    category_snapshot, unit_label_snapshot, quantity, unit_price,
    line_subtotal, created_by_user_id, updated_by_user_id
  )
  select
    v_invoice_id,
    (line->>'source_job_id')::uuid,
    (line->>'sort_order')::integer,
    nullif(line->>'source_kind', ''),
    nullif(line->>'source_pricebook_item_id', '')::uuid,
    nullif(line->>'source_visit_scope_item_id', '')::uuid,
    line->>'item_name_snapshot',
    nullif(line->>'description_snapshot', ''),
    line->>'item_type_snapshot',
    nullif(line->>'category_snapshot', ''),
    nullif(line->>'unit_label_snapshot', ''),
    (line->>'quantity')::numeric,
    (line->>'unit_price')::numeric,
    (line->>'line_subtotal')::numeric,
    v_actor_user_id,
    v_actor_user_id
  from jsonb_array_elements(p_line_items) line
  order by (line->>'sort_order')::integer;

  insert into public.job_events (job_id, event_type, meta, user_id)
  select
    (member->>'job_id')::uuid,
    'internal_invoice_drafted',
    jsonb_build_object(
      'invoice_id', v_invoice_id,
      'invoice_number', p_invoice->>'invoice_number',
      'status', 'draft',
      'total_cents', v_total_cents,
      'consolidated', true,
      'included_job_count', v_member_count
    ),
    v_actor_user_id
  from jsonb_array_elements(p_memberships) member;

  return v_invoice_id;
exception
  when unique_violation then
    select id into v_invoice_id
    from public.internal_invoices
    where account_owner_user_id = p_account_owner_user_id
      and consolidated_request_key = p_request_key;
    if v_invoice_id is not null then
      if (
        select count(*)
        from public.internal_invoice_jobs membership
        where membership.internal_invoice_id = v_invoice_id
      ) <> jsonb_array_length(p_memberships)
      or exists (
        select 1 from public.internal_invoice_jobs membership
        where membership.internal_invoice_id = v_invoice_id
          and not exists (
            select 1 from jsonb_array_elements(p_memberships) member
            where (member->>'job_id')::uuid = membership.job_id
          )
      ) then
        raise exception using errcode = '23514', message = 'request key was already used for a different job selection';
      end if;
      return v_invoice_id;
    end if;
    raise;
end;
$$;

revoke all on function public.create_consolidated_invoice_draft_v1(uuid, text, jsonb, jsonb, jsonb) from public;
grant execute on function public.create_consolidated_invoice_draft_v1(uuid, text, jsonb, jsonb, jsonb) to authenticated;

comment on function public.create_consolidated_invoice_draft_v1(uuid, text, jsonb, jsonb, jsonb) is
  'Atomically creates one user-selected contractor invoice draft, memberships, and frozen lines. No issue/send/payment/QBO side effects.';

commit;
