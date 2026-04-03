-- Persist ECC failed-job correction submissions as canonical pending_office_review.
-- Scope: contractor-owned ECC failed jobs only.

create or replace function public.mark_job_needs_internal_review(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_job record;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return false;
  end if;

  select
    j.id,
    j.contractor_id,
    j.job_type,
    j.ops_status
  into v_job
  from public.jobs j
  where j.id = p_job_id
    and j.deleted_at is null
  limit 1;

  if not found then
    return false;
  end if;

  if coalesce(lower(v_job.job_type), '') <> 'ecc' then
    return false;
  end if;

  if coalesce(lower(v_job.ops_status), '') <> 'failed' then
    return false;
  end if;

  if not exists (
    select 1
    from public.contractor_users cu
    where cu.user_id = v_user_id
      and cu.contractor_id = v_job.contractor_id
  ) then
    return false;
  end if;

  update public.jobs
  set ops_status = 'pending_office_review'
  where id = v_job.id
    and coalesce(lower(ops_status), '') = 'failed';

  return found;
end;
$$;

grant execute on function public.mark_job_needs_internal_review(uuid) to authenticated;
