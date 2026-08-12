-- Cross-tenant RLS isolation tests (pgTAP).
--
-- These probe the policies the application NEVER exercises through vitest
-- (unit tests mock the Supabase client): that one company's internal users
-- cannot read or write another company's rows through the anon/authenticated
-- role, even with hand-crafted queries.
--
-- Run with: scripts/run-rls-tests.sh  (see supabase/tests/README.md)
-- Requires a database with all supabase/migrations applied and pgTAP
-- available (the Supabase local stack ships it).
--
-- The whole file runs in one transaction and rolls back — it leaves no data.

begin;

create extension if not exists pgtap;
set search_path to public, extensions;

select plan(16);

-- ---------------------------------------------------------------------------
-- Seed two tenants (as superuser; RLS does not apply here).
--   Tenant A: owner_a + member_a (active) + inactive_a (deactivated member)
--   Tenant B: owner_b
--   orphan:   authenticated user with no internal_users membership
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-0000000000a1', 'owner-a@rls-test.example.com'),
  ('00000000-0000-4000-a000-0000000000a2', 'member-a@rls-test.example.com'),
  ('00000000-0000-4000-a000-0000000000a3', 'inactive-a@rls-test.example.com'),
  ('00000000-0000-4000-b000-0000000000b1', 'owner-b@rls-test.example.com'),
  ('00000000-0000-4000-c000-0000000000c1', 'orphan@rls-test.example.com');

insert into public.internal_users (user_id, role, is_active, account_owner_user_id, created_by) values
  ('00000000-0000-4000-a000-0000000000a1', 'admin', true,  '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000a1'),
  ('00000000-0000-4000-a000-0000000000a2', 'admin', true,  '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000a1'),
  ('00000000-0000-4000-a000-0000000000a3', 'admin', false, '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000a1'),
  ('00000000-0000-4000-b000-0000000000b1', 'admin', true,  '00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-b000-0000000000b1');

insert into public.customers (id, full_name, owner_user_id) values
  ('00000000-0000-4000-a000-00000000c0a1', 'Tenant A Customer', '00000000-0000-4000-a000-0000000000a1'),
  ('00000000-0000-4000-b000-00000000c0b1', 'Tenant B Customer', '00000000-0000-4000-b000-0000000000b1');

insert into public.jobs (id, title, customer_id) values
  ('00000000-0000-4000-a000-00000000d0a1', 'Tenant A Job', '00000000-0000-4000-a000-00000000c0a1'),
  ('00000000-0000-4000-b000-00000000d0b1', 'Tenant B Job', '00000000-0000-4000-b000-00000000c0b1');

-- ---------------------------------------------------------------------------
-- Impersonation helper: run subsequent statements as an authenticated user.
-- Mirrors what PostgREST does: role switch + request.jwt.claims.
-- ---------------------------------------------------------------------------

create or replace function pg_temp.impersonate(p_user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

-- ---------------------------------------------------------------------------
-- Tenant A member: sees own tenant, never tenant B.
-- ---------------------------------------------------------------------------

select pg_temp.impersonate('00000000-0000-4000-a000-0000000000a2');

select is(
  public.current_internal_account_owner_id(),
  '00000000-0000-4000-a000-0000000000a1'::uuid,
  'member_a resolves to tenant A account owner'
);

select results_eq(
  $$ select count(*) from public.customers where full_name like 'Tenant%' $$,
  $$ values (1::bigint) $$,
  'member_a sees exactly the tenant A customer'
);

select is_empty(
  $$ select id from public.customers where id = '00000000-0000-4000-b000-00000000c0b1' $$,
  'member_a cannot select the tenant B customer'
);

select results_eq(
  $$ select count(*) from public.jobs where title like 'Tenant%' $$,
  $$ values (1::bigint) $$,
  'member_a sees exactly the tenant A job'
);

select is_empty(
  $$ select id from public.jobs where id = '00000000-0000-4000-b000-00000000d0b1' $$,
  'member_a cannot select the tenant B job'
);

select is_empty(
  $$ select user_id from public.internal_users
     where account_owner_user_id = '00000000-0000-4000-b000-0000000000b1' $$,
  'member_a cannot enumerate tenant B teammates'
);

select throws_ok(
  $$ insert into public.customers (full_name, owner_user_id)
     values ('Injected into B', '00000000-0000-4000-b000-0000000000b1') $$,
  '42501',
  null,
  'member_a cannot insert a customer owned by tenant B'
);

select throws_ok(
  $$ insert into public.jobs (title, customer_id)
     values ('Injected into B', '00000000-0000-4000-b000-00000000c0b1') $$,
  '42501',
  null,
  'member_a cannot insert a job attached to a tenant B customer'
);

-- Cross-tenant UPDATE/DELETE must silently affect zero rows (RLS row filter).
update public.customers
   set full_name = 'Hijacked'
 where id = '00000000-0000-4000-b000-00000000c0b1';

delete from public.jobs
 where id = '00000000-0000-4000-b000-00000000d0b1';

reset role;

select results_eq(
  $$ select full_name from public.customers where id = '00000000-0000-4000-b000-00000000c0b1' $$,
  $$ values ('Tenant B Customer'::text) $$,
  'cross-tenant UPDATE by member_a changed nothing'
);

select results_eq(
  $$ select count(*) from public.jobs where id = '00000000-0000-4000-b000-00000000d0b1' $$,
  $$ values (1::bigint) $$,
  'cross-tenant DELETE by member_a removed nothing'
);

-- ---------------------------------------------------------------------------
-- Orphan authenticated user (no internal_users membership): sees nothing.
-- ---------------------------------------------------------------------------

select pg_temp.impersonate('00000000-0000-4000-c000-0000000000c1');

select is(
  public.current_internal_account_owner_id(),
  null::uuid,
  'orphan user resolves to no account owner'
);

select is_empty(
  $$ select id from public.customers where full_name like 'Tenant%' $$,
  'orphan user sees no customers'
);

select is_empty(
  $$ select id from public.jobs where title like 'Tenant%' $$,
  'orphan user sees no jobs'
);

reset role;

-- ---------------------------------------------------------------------------
-- Deactivated member of tenant A: membership must stop counting.
-- ---------------------------------------------------------------------------

select pg_temp.impersonate('00000000-0000-4000-a000-0000000000a3');

select is(
  public.current_internal_account_owner_id(),
  null::uuid,
  'deactivated member resolves to no account owner'
);

select is_empty(
  $$ select id from public.customers where full_name like 'Tenant%' $$,
  'deactivated member sees no customers'
);

reset role;

-- ---------------------------------------------------------------------------
-- Anonymous role: policies are TO authenticated, so anon sees nothing.
-- ---------------------------------------------------------------------------

set local role anon;

select is_empty(
  $$ select id from public.customers where full_name like 'Tenant%' $$,
  'anon role sees no customers'
);

reset role;

select * from finish();

rollback;
