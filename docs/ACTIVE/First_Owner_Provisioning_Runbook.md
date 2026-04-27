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

Default behavior:
- If --default-billing-mode is omitted or invalid, billing mode normalizes to external_billing.

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

Then verify first-owner invite acceptance routes to /ops/admin after anchor checks.

## 7. Pre-launch operator handoff note (small boundary reminder)

First-owner provisioning behavior is unchanged by Stripe Platform Subscription V1.

- Platform subscription onboarding is a separate pre-launch track from this provisioning runbook.
- Before live launch, configure live deployment env values (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, app URL) and live webhook endpoint `/api/stripe/webhook`.
- Do not commit sandbox/test Stripe values.
- `.env.local` remains local-only; hosted deployment env values are configured separately.
