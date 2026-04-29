# First Owner Provisioning Runbook

Status: active operator runbook
Purpose: safely provision the first account owner in invite-only mode using the V1 provisioning script.

## 1. Scope and boundaries

This runbook is for controlled operator onboarding only.

- Not public signup
- Not auth redesign
- Not billing/payment execution work

## 2. Script and supported options

Script:
- scripts/provision-first-owner.ts

Supported billing mode values for --default-billing-mode:
- external_billing
- internal_invoicing

Supported entitlement preset values for --entitlement-preset:
- standard (default)
- internal_comped

Supported starter kit selector values for --starter-kit-version:
- v1 (default when omitted)
- v2 (explicit selection only)

Default behavior:
- If --default-billing-mode is omitted or invalid, billing mode normalizes to external_billing.
- If --entitlement-preset is omitted, provisioning uses standard.
- If --starter-kit-version is omitted, provisioning uses starter kit v1.
- Starter kit v2 is used only when `--starter-kit-version v2` is explicitly provided.
- Invalid `--starter-kit-version` values are rejected before provisioning executes.

Entitlement preset behavior:
- standard
  - keeps current baseline behavior (`plan_key=starter`, `entitlement_status=trial` for newly created entitlement rows)
- internal_comped
  - applies owner-safe comped entitlement values using existing schema:
    - `plan_key=starter`
    - `entitlement_status=active`
    - `seat_limit=NULL`
    - `trial_ends_at=NULL`
    - `entitlement_valid_until=NULL`
    - Stripe linkage fields remain NULL
  - writes notes marker `internal_comped_v1` for explicit comped detection in admin UI/read model

## 3. Guardrails for hosted Supabase targets

Hosted Supabase projects (including sandbox) use .supabase.co URLs and are treated as production-like remote targets by the script guardrails.

For hosted .supabase.co targets, both flags are required before dry-run and apply:
- ALLOW_FIRST_OWNER_PROVISIONING=true
- ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true

Important clarification:
- ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true is explicit remote-target confirmation for hosted projects.
- It is not proof that the target project is true production.

Operator must verify the intended Supabase project before dry-run and before apply.

Security logging rule:
- Never paste service-role keys or other secrets into terminal logs, tickets, chat transcripts, or screenshots.

## 4. Dry-run first (required)

Hosted target dry-run example:

```bash
ALLOW_FIRST_OWNER_PROVISIONING=true \
ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true \
npx tsx scripts/provision-first-owner.ts \
  --email owner@example.com \
  --business-display-name "Example HVAC" \
  --owner-display-name "Example Owner" \
  --support-email support@example.com \
  --support-phone "+1-555-555-0100" \
  --entitlement-preset standard \
  --default-billing-mode external_billing
```

Internal comped dry-run example:

```bash
ALLOW_FIRST_OWNER_PROVISIONING=true \
ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true \
npx tsx scripts/provision-first-owner.ts \
  --email owner@example.com \
  --business-display-name "Example HVAC" \
  --owner-display-name "Example Owner" \
  --support-email support@example.com \
  --support-phone "+1-555-555-0100" \
  --entitlement-preset internal_comped \
  --default-billing-mode external_billing
```

Explicit Starter Kit v2 dry-run example:

```bash
ALLOW_FIRST_OWNER_PROVISIONING=true \
ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true \
npx tsx scripts/provision-first-owner.ts \
  --email owner@example.com \
  --business-display-name "Example HVAC" \
  --owner-display-name "Example Owner" \
  --support-email support@example.com \
  --support-phone "+1-555-555-0100" \
  --entitlement-preset standard \
  --default-billing-mode external_billing \
  --starter-kit-version v2
```

Expected dry-run behavior:
- No writes are committed
- Output lists what would be created/confirmed/patched
- Output now includes structured `pricebookSeeding` preview
- For a new account with omitted selector, dry-run should preview the V1 starter set (12 rows)
- With `--starter-kit-version v2`, dry-run should preview the V2 starter set (23 rows)
- Dry-run output includes selected starter kit metadata (`starter_kit_version`, `seed_count`, `active_seed_count`, `inactive_seed_count`)
- Dry-run remains non-mutating and must not send invites

## 5. Apply after project verification

Apply remains an explicit operator action and is never implied by dry-run.
Use `--apply` only after dry-run verification and project-ref confirmation.

Hosted target apply example:

```bash
ALLOW_FIRST_OWNER_PROVISIONING=true \
ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true \
npx tsx scripts/provision-first-owner.ts \
  --email owner@example.com \
  --business-display-name "Example HVAC" \
  --owner-display-name "Example Owner" \
  --support-email support@example.com \
  --support-phone "+1-555-555-0100" \
  --entitlement-preset standard \
  --default-billing-mode external_billing \
  --apply
```

## 6. Post-apply verification

Confirm the run completed and the owner invite path is valid:

- auth user exists for target email
- profile row exists
- internal_users owner row exists and is self-anchored to account_owner_user_id
- internal_business_profiles row exists
- platform_account_entitlements row exists
- first-owner marker is written before invite send
- starter Pricebook rows exist for the new account after apply
- starter seeding is idempotent by `seed_key` (re-running apply does not duplicate seeded rows)

When `--entitlement-preset internal_comped` is used, also verify:
- `plan_key = starter`
- `entitlement_status = active`
- `seat_limit IS NULL`
- `trial_ends_at IS NULL`
- `entitlement_valid_until IS NULL`
- `stripe_customer_id IS NULL`
- `stripe_subscription_id IS NULL`
- `stripe_subscription_status IS NULL`
- `notes` contains `internal_comped_v1`

Then verify first-owner invite acceptance routes to /ops/admin after anchor checks.

## 7. Sandbox and production verification safety checklist

Before any hosted dry-run or apply:
- Verify intended Supabase project ref from `ENVIRONMENT_RULES.md`.
  - sandbox ref: `kvpesjdukqwwlgpkzfjm`
  - production ref: `ornrnvxtwwtulohqwxop`
- Confirm current linked/target project matches intended environment.
- Never assume local `.env.local` reflects production.

Read-only entitlement verification query (safe for sandbox and production):

```sql
select
  account_owner_user_id,
  plan_key,
  entitlement_status,
  seat_limit,
  trial_ends_at,
  entitlement_valid_until,
  stripe_subscription_status,
  stripe_customer_id,
  stripe_subscription_id,
  notes
from public.platform_account_entitlements
where account_owner_user_id = 'OWNER_UUID_HERE';
```

## 8. Production-safe one-time comped update pattern (manual, future)

Do not run this in the app runtime. Use manual SQL only after explicit production project-ref verification.

Pre-check (read-only):

```sql
select
  account_owner_user_id,
  plan_key,
  entitlement_status,
  seat_limit,
  trial_ends_at,
  entitlement_valid_until,
  stripe_customer_id,
  stripe_subscription_id,
  stripe_subscription_status,
  stripe_current_period_end,
  stripe_cancel_at_period_end,
  notes
from public.platform_account_entitlements
where account_owner_user_id = 'OWNER_UUID_HERE';
```

Transactional update template (future/manual):

```sql
begin;

update public.platform_account_entitlements
set
  plan_key = 'starter',
  entitlement_status = 'active',
  seat_limit = null,
  trial_ends_at = null,
  entitlement_valid_until = null,
  stripe_customer_id = null,
  stripe_subscription_id = null,
  stripe_price_id = null,
  stripe_subscription_status = null,
  stripe_current_period_end = null,
  stripe_cancel_at_period_end = false,
  notes = 'internal_comped_v1',
  updated_at = now()
where account_owner_user_id = 'OWNER_UUID_HERE';

commit;
```

Post-check (read-only):

```sql
select
  account_owner_user_id,
  plan_key,
  entitlement_status,
  seat_limit,
  trial_ends_at,
  entitlement_valid_until,
  stripe_customer_id,
  stripe_subscription_id,
  stripe_subscription_status,
  notes
from public.platform_account_entitlements
where account_owner_user_id = 'OWNER_UUID_HERE';
```

Rollback requirement:
- Capture full before-state entitlement row before manual update.
- Rollback uses that captured row as source-of-truth restore values.
- Never perform production write operations without project-ref verification gate.

## 9. Pre-launch operator handoff note (small boundary reminder)

First-owner provisioning behavior is unchanged by Stripe Platform Subscription V1.

- Platform subscription onboarding is a separate pre-launch track from this provisioning runbook.
- Live deployment env values and the live webhook endpoint `/api/stripe/webhook` are now configured for the platform account subscription slice.
- Live smoke is confirmed for a normal non-owner platform subscription purchase; this does not change first-owner provisioning behavior.
- Internal/comped owner accounts remain outside Stripe checkout and use the comped entitlement path documented above.
- Do not commit sandbox/test Stripe values.
- `.env.local` remains local-only; hosted deployment env values are configured separately.

---

## 10. Existing-account Pricebook Starter Kit backfill

This section is separate from first-owner provisioning.

First-owner provisioning seeds Pricebook rows as part of new account creation.
This section covers backfilling Starter Kit V2 rows into an existing account that was already provisioned before V2 seeds existed.

### 10.1 Scope and boundaries

This runbook section is for controlled operator backfill only.

- Not automatic
- Not batch
- Not part of first-owner provisioning
- Not auth redesign
- Not billing/payment execution work
- Does not provision users or send invites
- Single-account target only

### 10.2 Script

Script:
- `scripts/backfill-pricebook-starter-kit.ts`

Default mode: dry-run (never writes without explicit `--apply`)

### 10.3 Supported options

Required:
- `--account-owner-user-id <uuid>` — the owner UUID of the account to backfill (required)

Optional:
- `--starter-kit-version v2` — starter kit version to backfill (default: `v2`; only `v2` is supported by this tool)
- `--apply` — run apply mode (write rows); omit for dry-run (default)
- `--allow-collisions` — required to override collision blocking when `possible_collision_count > 0`
- `--preview-limit <n>` — number of preview rows to include in dry-run output (default: 10; must be a positive integer)
- `--json` — structured JSON output mode

### 10.4 Guardrails for hosted Supabase targets

Hosted Supabase projects use `.supabase.co` URLs and are treated as production-like remote targets by the script guardrails.

For hosted `.supabase.co` targets, both flags are required before dry-run and apply:
- `ALLOW_FIRST_OWNER_PROVISIONING=true`
- `ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true`

Operator must verify the intended Supabase project before dry-run and before apply.

Security logging rule:
- Never paste service-role keys or other secrets into terminal logs, tickets, chat transcripts, or screenshots.

### 10.5 Dry-run first (required)

Always run dry-run first and review the full plan output before any apply.

Hosted target dry-run example:

```bash
ALLOW_FIRST_OWNER_PROVISIONING=true \
ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true \
npx tsx scripts/backfill-pricebook-starter-kit.ts \
  --account-owner-user-id OWNER_UUID_HERE
```

Expected dry-run output fields:
- `mode`: `dry_run`
- `seed_count`: total V2 seed rows (23)
- `active_seed_count`: active V2 seeds (21)
- `inactive_seed_count`: inactive/deferred V2 seeds (2)
- `would_insert_count`: rows that would be inserted
- `would_skip_existing_seed_key_count`: rows skipped because seed_key already exists
- `possible_collision_count`: non-seed rows with a matching `item_name` that would not be inserted
- `preview_insert_rows`: preview of rows that would be inserted (limited by `--preview-limit`)
- `preview_skip_rows`: preview of rows that would be skipped
- `possible_collisions`: rows with potential name overlap
- `warnings`: any non-fatal warnings
- `errors`: any blocking errors (empty on success)

### 10.6 Apply after dry-run review

Apply remains an explicit operator action. Never run apply without reviewing dry-run output first.

Use `--apply` only after dry-run verification and project-ref confirmation.

Hosted target apply example:

```bash
ALLOW_FIRST_OWNER_PROVISIONING=true \
ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true \
npx tsx scripts/backfill-pricebook-starter-kit.ts \
  --account-owner-user-id OWNER_UUID_HERE \
  --apply
```

Apply with collision override (only use after reviewing collision output in dry-run):

```bash
ALLOW_FIRST_OWNER_PROVISIONING=true \
ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true \
npx tsx scripts/backfill-pricebook-starter-kit.ts \
  --account-owner-user-id OWNER_UUID_HERE \
  --apply \
  --allow-collisions
```

### 10.7 Behavior rules

- Insert-only: the backfill never updates existing Pricebook rows.
- Customized rows are never mutated.
- Historical invoices and invoice snapshots are not touched.
- Payment, Stripe, and QBO behavior are unchanged.
- Visit Scope and service workflow behavior are unchanged.
- Collision blocking is the default: if `possible_collision_count > 0`, apply will error unless `--allow-collisions` is passed.
- Seeding is idempotent by `seed_key`: re-running apply does not duplicate rows already seeded.

### 10.8 Post-apply verification

After apply, verify:
- `inserted_count` matches the expected number of new rows
- `skipped_existing_seed_key_count` reflects already-present seed_key rows (expected 0 for a fresh backfill)
- Pricebook admin surface for the target account shows the V2 starter rows
- No invoice, payment, or user records were changed
