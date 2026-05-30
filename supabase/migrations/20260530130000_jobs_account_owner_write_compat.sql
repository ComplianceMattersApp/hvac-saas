-- Short display numbers follow-up compatibility patch.
-- Ensures jobs.account_owner_user_id is always derived from canonical customer ownership
-- for write paths that do not yet send the column explicitly.

set check_function_bodies = off;

create or replace function public.jobs_ensure_account_owner_user_id()
returns trigger
language plpgsql
as $$
declare
  v_customer_owner uuid;
begin
  if new.customer_id is null then
    return new;
  end if;

  select c.owner_user_id
    into v_customer_owner
  from public.customers c
  where c.id = new.customer_id;

  if v_customer_owner is null then
    raise exception using
      errcode = '23502',
      message = 'jobs.customer_id must map to customers.owner_user_id';
  end if;

  if new.account_owner_user_id is null then
    new.account_owner_user_id := v_customer_owner;
  elsif new.account_owner_user_id <> v_customer_owner then
    raise exception using
      errcode = '23514',
      message = 'jobs.account_owner_user_id must match customers.owner_user_id';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_jobs_ensure_account_owner_user_id on public.jobs;

create trigger trg_jobs_ensure_account_owner_user_id
before insert or update of customer_id, account_owner_user_id
on public.jobs
for each row
execute function public.jobs_ensure_account_owner_user_id();
