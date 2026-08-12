# Database (RLS) tests

pgTAP tests that exercise the **actual Row-Level Security policies** in
Postgres. The vitest suite mocks the Supabase client, so nothing there proves
that tenant isolation holds at the database layer — these tests do.

`rls_cross_tenant.test.sql` seeds two tenants and probes, as a real
`authenticated` role with `request.jwt.claims` set (exactly how PostgREST
executes queries):

- a tenant A member sees tenant A customers/jobs and none of tenant B's;
- cross-tenant INSERTs are rejected (`42501`), UPDATEs/DELETEs touch zero rows;
- teammates of another tenant cannot be enumerated via `internal_users`;
- an authenticated user with **no** `internal_users` membership sees nothing;
- a **deactivated** member sees nothing;
- the `anon` role sees nothing.

Everything runs in one transaction and rolls back — no data is left behind.

## Running

You need a **disposable local/test database with all `supabase/migrations`
applied** and pgTAP available. The easiest way is the Supabase CLI local stack
(pgTAP ships with it):

```bash
supabase init        # once, if supabase/config.toml doesn't exist yet
supabase start       # boots local Postgres with the auth schema + roles
supabase db reset    # applies all migrations in supabase/migrations

RLS_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  scripts/run-rls-tests.sh
```

The runner refuses non-local database URLs unless `RLS_TEST_ALLOW_REMOTE=1`
— these tests must never point at production (see `ENVIRONMENT_RULES.md`).

## Adding tests

Add more `*.test.sql` files to this directory — the runner picks up all of
them. Follow the same shape: `begin; … select plan(N); … select * from
finish(); rollback;`, seed as superuser, then impersonate with the
`pg_temp.impersonate(uuid)` pattern from the existing file. Good next
candidates: `attachments`, `internal_invoices`, `estimates`, and the
contractor-scoped policies (`contractor_users` seeing only their own jobs).
