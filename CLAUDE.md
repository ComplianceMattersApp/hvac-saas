# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

EveryStep FieldWorks (legal entity: Compliance Matters CA) — a field service management SaaS for HVAC companies and ECC/HERS compliance raters. It is an event-driven operational workflow system (scheduling, staffing, contractor collaboration, audit-backed job resolution), not a CRUD app or calendar toy. Many older files/docs still say "Compliance Matters"; **FieldWorks** is the canonical product name.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind 4 · Supabase (Postgres + Auth + RLS + Storage) · Stripe (connected-account payments) · QuickBooks Online sync (`intuit-oauth`) · Resend/nodemailer email · web-push · OpenAI · Zod. Deployed on Vercel (crons in `vercel.json`). Capacitor wraps the hosted production URL (`capacitor.config.ts` points at `app.compliancemattersca.com`) as the iOS/Android app "EveryStep FieldWorks".

## Commands

```bash
npm run dev                 # dev server on :3000
npm run build               # production build
npm run lint                # eslint
npx tsc --noEmit            # typecheck (strict mode)
npm run test                # vitest run (all unit/component tests)
npm run test:watch          # vitest watch mode
npm run test:coverage       # vitest with v8 coverage → ./coverage
npx vitest run path/to/file.test.ts        # single test file
npx vitest run -t "test name"              # single test by name
npm run test:e2e            # Playwright e2e (boots app with placeholder Supabase env)
npm run test:e2e:report     # open last Playwright HTML report
```

- Vitest discovers `*.test.{ts,tsx}` under `lib/`, `scripts/`, `app/`, `components/` (env: node, jsdom available). Tests conventionally live in `__tests__/` folders next to the code.
- E2E has two phases: `e2e/public-pages.spec.ts` runs everywhere against placeholder env; `e2e/authenticated.spec.ts` self-skips unless `E2E_BASE_URL`/`E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` are set. See `e2e/README.md`.
- CI (`.github/workflows/`) runs vitest coverage and Playwright phase 1 on pushes to `main` and PRs.

## Git & environment discipline (non-negotiable)

- **Never work directly on `main`.** `sandbox-clean-start` is the integration branch; branch off it for larger work and merge back. `main` = production release, promoted from `sandbox-clean-start`. Full flow: `app/BRANCH_FLOW.md`.
- Two Supabase projects (`ENVIRONMENT_RULES.md`): **Sandbox** = `CMTest` (`kvpesjdukqwwlgpkzfjm`), **Production** = `ComplianceMatters` (`ornrnvxtwwtulohqwxop`). Migrations are tested in sandbox first; never `db push` to production without verifying the linked project. Never point production code at the sandbox DB.
- Migrations live in `supabase/migrations/` as timestamped SQL (`YYYYMMDD[HHMMSS]_description.sql`). Schema changes are additive by design; production-only manual DB changes are forbidden outside emergencies (and must be captured back into migrations).
- Do not modify `.github/instructions/*` or `.github/prompt/*` (operational tooling config, not docs).

## Locked architecture — source of truth

These rules come from `docs/PROJECT_TRUTH.md` and `.github/instructions/Instructions.instructions.md` and never bend without explicit owner approval:

**Operational hierarchy:** Ops Command Center → Customer → Location → Service Case → Job → Portal. Service Case = the problem (continuity container); Job = a visit (execution unit). A case may have many jobs; retests are **new child jobs** (`parent_job_id`) — the failed parent stays historically failed, never merged or overwritten.

**Truth layers:**
- `job_events` = narrative/operational truth (meaningful actions become events)
- `ecc_test_runs` = ECC technical test truth
- `jobs.ops_status` = operational **projection** driving queues — never a freeform UI state or decision layer
- `service_cases` = continuity container; `jobs` = visit execution

**UI is a reflection layer only.** It never owns lifecycle, computes status, guesses ECC pass/fail, or invents transitions. If a bug originates upstream, fix the owning layer (DB / resolver / action), not the UI. The dispatch calendar (`components/calendar/*`) is a pure visual projection — no UI-derived status or scheduling logic, edits only via the inspector panel (see `.github/instructions/dispatch-calendar.instructions.md`).

**Payments truth:** Stripe webhook-confirmed `internal_invoice_payments` rows are collected-money truth — opening a link or returning from Checkout never marks an invoice paid. QBO is optional *downstream* sync and never overrides EveryStep invoice/payment/job truth. Never imply live payment acceptance where it doesn't exist. A 2xx from a provider is not proof a change happened — verify by re-reading.

**Contractors** interact only through constrained portal paths (`app/portal`, `lib/portal`) — they never own lifecycle, schedules, or job closure. Portal-visible invoices are strictly scoped to `bill_to_kind = 'contractor'` with a matching `bill_to_contractor_id`.

## Code structure

- `app/` — App Router routes. Feature areas: `ops` (command center), `jobs`, `customers`, `calendar`, `estimates`, `proposals`, `payments`, `portal` (external contractor surface), `intake`, `time-clock`, `today`, `training`, etc. `app/api/` holds webhooks and crons (`cron/`, `stripe/`, `sms/`, `qbo/`).
- `lib/actions/` — server actions (`"use server"`), the primary mutation layer (~70 files, one per domain). Pattern: create Supabase client → auth/scope check (e.g. `requireInternalUser`) → entitlement check → mutate → `revalidatePath`/`redirect`.
- `lib/supabase/server.ts` — `createClient()` (cookie-session, RLS-scoped) vs `createAdminClient()` (service role, bypasses RLS — use deliberately). `lib/supabase/client.ts` for browser.
- `lib/auth/` — access scoping and identity: `requireInternalUser`, per-domain scope guards (`internal-job-scope`, `internal-contractor-scope`, …), `request-actor-context`.
- `lib/<domain>/` — domain logic (jobs, invoices, qbo, ecc, communications, reconciliation, workflows, …). Read models and invariants live here, not in components.
- `proxy.ts` — Next.js request gate (Next 16's middleware equivalent): auth redirect for protected routes; static assets, provider webhooks (Stripe/Twilio), and cron routes bypass auth (webhooks verify signatures inside their route handlers).
- `components/` — shared React components by feature area; `components/ui` for primitives.
- `scripts/` — operational/backfill scripts (`npx tsx scripts/<name>.ts`) with their own tests in `scripts/__tests__`.
- Path alias: `@/*` → repo root.

## Documentation control plane

Docs are governed (`docs/ACTIVE/Documentation_Authority_Map.md`). The authorities:

- `docs/PROJECT_TRUTH.md` — stable product truth, locked architecture, standing constraints. Read this first for any non-trivial work.
- `docs/CURRENT_ROADMAP.md` — active lanes, sequencing, next safe slices.
- `docs/SESSION_CONTEXT_TEMPLATE.md` — session-start execution discipline.

When asked to "update docs" without a named target, identify the intended authority doc before editing — don't duplicate closeout detail into control-plane docs. `docs/ACTIVE/Active Spine V4.0 Current.md` is retired; do not cite it as authority. Root-level `*_AUDIT.md` / `*_REPORT.md` files are historical working evidence, not current truth.

## Working style

- Prefer additive, minimal, localized changes; no parallel/duplicate logic paths.
- Before changing behavior: identify the owning domain (DB / resolver / action / UI), confirm the source-of-truth layer, trace where the behavior originates, then apply the smallest fix at that layer.
- If a locked decision, production-protection rule, or owner-approved boundary is in the way: stop and ask, don't guess.
