-- Short display numbers follow-up compatibility patch (invoices).
-- Auto-allocates invoice_display_number for legacy insert paths and
-- enforces account owner consistency against related job/customer records.

set check_function_bodies = off;

create or replace function public.internal_invoices_ensure_display_owner_consistency()
returns trigger
language plpgsql
as $$
declare
  v_job_owner uuid;
  v_customer_owner uuid;
begin
  if new.job_id is not null then
    select j.account_owner_user_id
      into v_job_owner
    from public.jobs j
    where j.id = new.job_id;

    if v_job_owner is null then
      raise exception using
        errcode = '23502',
        message = 'internal_invoices.job_id must reference jobs.account_owner_user_id';
    end if;
  end if;

  if new.customer_id is not null then
    select c.owner_user_id
      into v_customer_owner
    from public.customers c
    where c.id = new.customer_id;

    if v_customer_owner is null then
      raise exception using
        errcode = '23502',
        message = 'internal_invoices.customer_id must reference customers.owner_user_id';
    end if;
  end if;

  if new.account_owner_user_id is null then
    new.account_owner_user_id := coalesce(v_job_owner, v_customer_owner);
  end if;

  if new.account_owner_user_id is null then
    raise exception using
      errcode = '23502',
      message = 'internal_invoices.account_owner_user_id is required';
  end if;

  if v_job_owner is not null and new.account_owner_user_id <> v_job_owner then
    raise exception using
      errcode = '23514',
      message = 'internal_invoices.account_owner_user_id must match jobs.account_owner_user_id';
  end if;

  if v_customer_owner is not null and new.account_owner_user_id <> v_customer_owner then
    raise exception using
      errcode = '23514',
      message = 'internal_invoices.account_owner_user_id must match customers.owner_user_id';
  end if;

  if tg_op = 'INSERT' and new.invoice_display_number is null then
    new.invoice_display_number := public.allocate_next_invoice_display_number(new.account_owner_user_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_internal_invoices_ensure_display_owner_consistency on public.internal_invoices;

create trigger trg_internal_invoices_ensure_display_owner_consistency
before insert or update of account_owner_user_id, customer_id, job_id, invoice_display_number
on public.internal_invoices
for each row
execute function public.internal_invoices_ensure_display_owner_consistency();
