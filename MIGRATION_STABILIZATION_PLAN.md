# Migration Stabilization Plan

## 1. Scope and Safety Boundary
- This plan covers migration-history reconciliation for the production Supabase project so migration commands can be trusted again.
- It uses three evidence streams separately: repo migration files, documented repo findings, and known operational context provided in this task.
- It does not execute production changes in this pass.
- It does not propose destructive actions (no drops/resets/rebuilds).
- It does not introduce app feature changes or schema redesign.

## 2. Migration Inventory

1. Version: `20260301`
- File: `supabase/migrations/20260301_baseline_foundation.sql`
- Purpose: Baseline foundation (core tables, functions, views, policies, indexes, triggers) including `internal_users`, `job_events`, `notifications`, `service_cases`, and `search_customers` function.
- Risk class: `baseline`

2. Version: `20260320`
- File: `supabase/migrations/20260320_job_events_contractor_intake_rls_fix.sql`
- Purpose: Repairs contractor insert RLS policy on `job_events` for limited event types.
- Risk class: `fix`

3. Version: `20260325`
- File: `supabase/migrations/20260325_search_customers_canonical_name_fix.sql`
- Purpose: `create or replace function public.search_customers(...)` to canonicalize customer-name search logic.
- Risk class: `fix`

4. Version: `20260326`
- File: `supabase/migrations/20260326_internal_notes.sql`
- Purpose: Adds `internal_notes` table, trigger, and user-owned RLS policies.
- Risk class: `additive`

5. Version: `20260327`
- File: `supabase/migrations/20260327_notifications_read_state.sql`
- Purpose: Adds `notifications.read_at` and unread index `notifications_read_at_idx`.
- Risk class: `additive/fix`

## 3. Production Reconciliation Matrix

Evidence note:
- Repo-grounded facts were taken from migration SQL and docs including `SOURCE_OF_TRUTH_RECONCILIATION_REPORT.md` and `ENVIRONMENT_RULES.md`.
- Operational facts supplied in this task were treated as operator evidence (manual `read_at` SQL in prod, wrong-project linking occurred, and `db push` attempted baseline replay and failed on already-existing objects).

| migration version | expected schema effect | likely schema presence in production | likely migration-history presence in production | status | rationale |
|---|---|---|---|---|---|
| `20260301` | Baseline objects incl. `service_cases`, `job_events`, `notifications`, `internal_users`, baseline policies/functions/views | `LIKELY_ALREADY_PRESENT_IN_PROD` | `NOT_VERIFIED` (possibly missing/partial) | `SAFE_TO_MARK_APPLIED` | App is working; baseline replay failed because objects already existed, which strongly suggests baseline schema already exists. History row presence must be verified separately. |
| `20260320` | `job_events` contractor insert policy replacement (`contractor_insert_own_job_events_limited`) | `NOT_VERIFIED` | `NOT_VERIFIED` | `NOT_VERIFIED` | This is policy-level drift-sensitive. Must verify policy definition in prod before deciding mark-vs-execute. |
| `20260325` | `create or replace function public.search_customers(...)` | `NOT_VERIFIED` | `NOT_VERIFIED` | `NOT_VERIFIED` | Function may exist but body/version equivalence is unproven without live function definition check. |
| `20260326` | Adds `internal_notes` table + trigger + RLS policies | `NOT_VERIFIED` | `NOT_VERIFIED` | `NOT_VERIFIED` | Additive structure; presence not proven in provided live evidence. |
| `20260327` | Adds `notifications.read_at` + `notifications_read_at_idx` | `LIKELY_ALREADY_PRESENT_IN_PROD` | `LIKELY_MISSING_FROM_PROD` | `SAFE_TO_MARK_APPLIED` | Task states manual additive SQL already applied in production; schema likely present while migration history likely absent. |

Decision meaning used above:
- `SAFE_TO_MARK_APPLIED`: candidate for migration-history reconciliation after schema-equivalence checks pass.
- `REQUIRES_REAL_EXECUTION`: use only when schema effect is truly missing in production.
- `NOT_VERIFIED`: evidence insufficient; verification gate required before choosing mark or execute.

## 4. Key Drift Findings
- Baseline replay risk:
  - Attempting blanket `db push` on production can try to replay old baseline migrations and fail on existing objects.
  - This is unsafe and noisy for a live system.
- Manual SQL vs migration-history mismatch:
  - `notifications.read_at` was manually applied in production, so schema and migration history can diverge.
- Environment-link mismatch risk:
  - Known wrong-project linkage occurred during workflow; this can corrupt confidence in migration actions.
  - `ENVIRONMENT_RULES.md` has refs, but process enforcement still depends on operator discipline.
- Stale artifact risk:
  - `SOURCE_OF_TRUTH_RECONCILIATION_REPORT.md` explicitly flags snapshot artifacts (e.g., `prod_schema.sql`) as not sole authority.
  - Migration SQL + live schema + migration history must be reconciled together.

## 5. Recommended Safe Reconciliation Sequence

Conservative principle: do not run production `db push` until migration history and schema-equivalence are reconciled.

1. Pre-flight environment lock (must pass before any migration operation)
- Confirm current linked project ref equals production: `ornrnvxtwwtulohqwxop`.
- Confirm intended environment from `ENVIRONMENT_RULES.md`.
- Capture screenshots/log snippets of project ref confirmation in release notes.

2. Read-only production verification in Supabase SQL editor (no writes)
- Verify migration history table and recorded versions.
- Verify schema effects for each migration:
  - `20260301`: key baseline objects exist (`service_cases`, `job_events`, `notifications`, `internal_users`, expected key columns).
  - `20260320`: current `job_events` contractor insert policy definition matches intended policy.
  - `20260325`: `public.search_customers` function body/signature matches migration intent.
  - `20260326`: `internal_notes` table/trigger/policies exist.
  - `20260327`: `notifications.read_at` column and `notifications_read_at_idx` exist.
- If any check cannot be proven, mark that migration `NOT_VERIFIED` and stop automated reconciliation.

3. Build reconciliation set
- For each migration version:
  - If schema effect exists and migration version is absent in history -> candidate `mark applied`.
  - If schema effect is missing -> candidate `real execution` (single migration only, no blanket push).

4. History repair phase (only for schema-equivalent, missing-history versions)
- Use migration repair to mark only verified-equivalent versions as applied in production history.
- Strong expected candidate from known state: `20260327`.
- `20260301` may also be a candidate if baseline equivalence is confirmed and history row is absent.

5. Real execution phase (only for verified missing schema effects)
- Execute only the specific missing migration SQL (targeted), then record history accordingly.
- Do not run full `db push` while unresolved baseline/history drift exists.

6. Post-reconciliation checks
- Re-query migration history and schema checks.
- Confirm no pending migration appears that would replay baseline unexpectedly.

7. When NOT to use `db push`
- Do not use `db push` on production when:
  - baseline/history mismatch is unresolved,
  - project-link confirmation is missing,
  - manual SQL equivalence has not been reconciled into history.

8. Manual SQL equivalence rule
- If manual SQL was already run (e.g., `notifications.read_at`), reconcile by marking the matching migration version as applied after schema verification; do not re-run equivalent DDL blindly.

## 6. Required Repo Guardrails
- Add `MIGRATION_ENVIRONMENT_MAP.md`:
  - explicit refs and names for production (`ornrnvxtwwtulohqwxop`) and sandbox (`kvpesjdukqwwlgpkzfjm`).
  - copy-paste verification commands/checklist.
- Add `MIGRATION_RELEASE_CHECKLIST.md` with required gates:
  - linked project ref verified,
  - migration history inspected,
  - schema-equivalence checked for manual fixes,
  - explicit decision recorded: mark-applied vs execute.
- Add a production migration rule in docs:
  - No blanket `db push` to production when baseline replay risk exists.
  - Use targeted reconciliation (verify -> repair history -> execute only truly missing migrations).
- Add PR template checkbox section:
  - "Schema change?"
  - "Manual DB hotfix performed?"
  - "Matching migration + reconciliation plan included?"
- Add sandbox/production handling rule:
  - sandbox tests migrations first;
  - production requires explicit environment confirmation and migration-history plan.

## 7. Immediate Next Best Action
- Run a read-only production verification session in Supabase SQL editor to build the final mark-vs-execute list per version (especially `20260301` and `20260327`) before any further migration command is attempted.