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

Default behavior:
- If --default-billing-mode is omitted or invalid, billing mode normalizes to external_billing.
- If --entitlement-preset is omitted, provisioning uses standard.

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

Expected dry-run behavior:
- No writes are committed
- Output lists what would be created/confirmed/patched

## 5. Apply after project verification

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
