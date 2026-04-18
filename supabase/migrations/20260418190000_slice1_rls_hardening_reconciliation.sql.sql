-- Compliance Matters — RLS hardening slice 1 reconciliation
-- Purpose:
--   Reconcile repo migration history to match the already-applied TEST/PROD hotfixes for:
--   1) public.services exposure closure
--   2) public.contractors RLS hardening
--   3) legacy public summary/test view hardening
--
-- Important:
--   This migration is meant to bring repo history back in sync with live schema reality.
--   It is written to be safely re-runnable.

begin;

-- =========================================================
-- 1) public.services
-- Close exposed dormant table:
-- - enable RLS
-- - remove anon/authenticated access
-- - intentionally leave no policies (dark table)
-- =========================================================

alter table public.services enable row level security;

revoke all on table public.services from anon;
revoke all on table public.services from authenticated;

-- =========================================================
-- 2) public.contractors
-- Harden live table:
-- - enable RLS
-- - remove anon access
-- - authenticated CRUD remains grant-level, but actual access is policy-gated
-- - internal users get owner-scoped read/write/delete
-- - no contractor self-read policy here (it caused recursion through contractor_users)
-- =========================================================

alter table public.contractors enable row level security;

revoke all on table public.contractors from anon;
revoke all on table public.contractors from authenticated;
grant select, insert, update, delete on table public.contractors to authenticated;

drop policy if exists contractors_internal_select_owner_scope on public.contractors;
create policy contractors_internal_select_owner_scope
on public.contractors
for select
to authenticated
using (
  exists (
    select 1
    from public.internal_users actor
    where actor.user_id = auth.uid()
      and actor.is_active = true
      and actor.account_owner_user_id = public.contractors.owner_user_id
  )
);

drop policy if exists contractors_internal_insert_owner_scope on public.contractors;
create policy contractors_internal_insert_owner_scope
on public.contractors
for insert
to authenticated
with check (
  exists (
    select 1
    from public.internal_users actor
    where actor.user_id = auth.uid()
      and actor.is_active = true
      and actor.account_owner_user_id = public.contractors.owner_user_id
  )
);

drop policy if exists contractors_internal_update_owner_scope on public.contractors;
create policy contractors_internal_update_owner_scope
on public.contractors
for update
to authenticated
using (
  exists (
    select 1
    from public.internal_users actor
    where actor.user_id = auth.uid()
      and actor.is_active = true
      and actor.account_owner_user_id = public.contractors.owner_user_id
  )
)
with check (
  exists (
    select 1
    from public.internal_users actor
    where actor.user_id = auth.uid()
      and actor.is_active = true
      and actor.account_owner_user_id = public.contractors.owner_user_id
  )
);

drop policy if exists contractors_internal_delete_owner_scope on public.contractors;
create policy contractors_internal_delete_owner_scope
on public.contractors
for delete
to authenticated
using (
  exists (
    select 1
    from public.internal_users actor
    where actor.user_id = auth.uid()
      and actor.is_active = true
      and actor.account_owner_user_id = public.contractors.owner_user_id
  )
);

-- =========================================================
-- 3) Legacy public views
-- These were flagged by advisor as security-definer/publicly exposed.
-- Keep them for now, but:
-- - switch to security_invoker
-- - remove anon/authenticated grants
-- =========================================================

alter view public.customer_locations_summary set (security_invoker = true);
alter view public.customer_summary set (security_invoker = true);
alter view public.job_visit_test_summary set (security_invoker = true);
alter view public.location_jobs set (security_invoker = true);
alter view public.location_summary set (security_invoker = true);

revoke all on public.customer_locations_summary from anon;
revoke all on public.customer_locations_summary from authenticated;

revoke all on public.customer_summary from anon;
revoke all on public.customer_summary from authenticated;

revoke all on public.job_visit_test_summary from anon;
revoke all on public.job_visit_test_summary from authenticated;

revoke all on public.location_jobs from anon;
revoke all on public.location_jobs from authenticated;

revoke all on public.location_summary from anon;
revoke all on public.location_summary from authenticated;

commit;