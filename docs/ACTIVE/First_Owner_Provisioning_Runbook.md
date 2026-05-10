# First Owner Provisioning Runbook

Status: active operator runbook
Purpose: safely provision the first account owner in invite-only mode using the V1 provisioning script, as an active/manual fallback path alongside public self-serve signup.

## 1. Scope and boundaries

This runbook is for controlled operator onboarding only.

- Public self-serve signup at `/signup` is available for standard onboarding.
- This runbook remains the manual/admin fallback onboarding path.
- Internal/comped owner provisioning remains operator-controlled (not public self-serve).
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

Supported product mode values for --product-mode:
- hvac_service
- ecc_hers
- hybrid

Supported starter kit selector values for --starter-kit-version:
- v1 (explicit legacy/manual option)
- v2 (explicit legacy/manual option)
- v3 (default when omitted, also explicit)

Default behavior:
- If --default-billing-mode is omitted or invalid, billing mode normalizes to external_billing.
- If --entitlement-preset is omitted, provisioning uses standard.
- If --starter-kit-version is omitted, provisioning uses starter kit v3.
- Starter kit v1 and v2 remain supported only when explicitly selected.
- Starter kit v3 is supported explicitly and also matches the omitted-selector default.
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
  --product-mode hvac_service \
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
  --product-mode hybrid \
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
  --product-mode hvac_service \
  --default-billing-mode external_billing \
  --starter-kit-version v2
```

Expected dry-run behavior:
- No writes are committed
- Output lists what would be created/confirmed/patched
- Output now includes structured `pricebookSeeding` preview
- For a new account with omitted selector, dry-run should preview the V3 starter set (`97` rows)
- With `--starter-kit-version v1`, dry-run should preview the V1 starter set (`12` rows)
- With `--starter-kit-version v2`, dry-run should preview the V2 starter set (`23` rows)
- With `--starter-kit-version v3`, dry-run should preview the V3 starter set (`97` rows)
- For omitted selector, expected V3 metadata is:
  - `starter_kit_version = v3`
  - `seed_count = 97`
  - `active_seed_count = 91`
  - `inactive_seed_count = 6`
- Dry-run output includes selected starter kit metadata (`starter_kit_version`, `seed_count`, `active_seed_count`, `inactive_seed_count`)
- Dry-run output includes structured product-mode capture readiness (`selectedProductMode`, `applyReady`, `action`, `issues`)
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
  --product-mode hvac_service \
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
- account_settings row exists with selected `product_mode`
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
This section covers controlled backfill into existing accounts and is separate from first-owner provisioning defaults.

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
- `--starter-kit-version v2|v3` — starter kit version to backfill (default: `v2`)
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
- `seed_count`: total rows for the selected starter version (`23` for `v2`, `97` for `v3`)
- `active_seed_count`: active rows for selected starter version (`21` for `v2`, `91` for `v3`)
- `inactive_seed_count`: inactive/deferred rows for selected starter version (`2` for `v2`, `6` for `v3`)
- `would_insert_count`: rows that would be inserted
- `would_skip_existing_seed_key_count`: rows skipped because seed_key already exists
- `would_skip_existing_equivalent_count`: rows safely skipped because an active exact equivalent already exists under a different/legacy seed key
- `preview_existing_equivalent_rows`: preview of safe equivalent skips
- `possible_collision_count`: rows requiring review because they are not safe equivalents (unsafe/ambiguous matches)
- `preview_insert_rows`: preview of rows that would be inserted (limited by `--preview-limit`)
- `preview_skip_rows`: preview of rows that would be skipped
- `possible_collisions`: rows requiring review before apply (collision-blocking remains default)
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
- Safe-equivalent behavior:
  - exact active legacy/different-seed-key equivalents are skipped
  - safe equivalence requires matching item signature (`item_name`, `category`, `unit_label`, and `item_type` where available)
  - equivalent skips do not block apply
- Historical invoices and invoice snapshots are not touched.
- Payment, Stripe, and QBO behavior are unchanged.
- Visit Scope and service workflow behavior are unchanged.
- Collision blocking is the default: unsafe/ambiguous collisions still block apply unless `--allow-collisions` is passed.
- Seeding is idempotent by `seed_key`: re-running apply does not duplicate rows already seeded.
- Production existing-account backfill remains dry-run-first and operator-controlled; one controlled production owner-account V3 verification has been completed and documented, but this does not change single-account/manual operator boundaries.

### 10.8 Post-apply verification

After apply, verify:
- `inserted_count` matches the expected number of new rows
- `skipped_existing_seed_key_count` reflects already-present seed_key rows (expected 0 for a fresh backfill)
- Pricebook admin surface for the target account shows starter rows for the selected version (`v2` or `v3`)
- No invoice, payment, or user records were changed

### 10.9 Production verification example outcome (reference)

Reference-only example from completed controlled production verification:

- target owner: `93dd810e-3c0c-4b69-9dae-edfa0e481dbb`
- target host: `ornrnvxtwwtulohqwxop.supabase.co`
- terminal post-apply dry-run state:
  - `would_insert_count = 0`
  - `would_skip_existing_seed_key_count = 96`
  - `would_skip_existing_equivalent_count = 1`
  - `possible_collision_count = 0`
  - `errors = 0`
- owner-account Pricebook count verified: `108`
- legacy V1 `R-410A` remained non-duplicated and continued to classify as safe equivalent skip

- Seeding is idempotent by `seed_key`: re-running apply does not duplicate rows already seeded.
- Production existing-account backfill remains dry-run-first and operator-controlled; one controlled production owner-account V3 verification has been completed and documented, but this does not change single-account/manual operator boundaries.

### 10.8 Post-apply verification

After apply, verify:
- `inserted_count` matches the expected number of new rows
- `skipped_existing_seed_key_count` reflects already-present seed_key rows (expected 0 for a fresh backfill)
- Pricebook admin surface for the target account shows starter rows for the selected version (`v2` or `v3`)
- No invoice, payment, or user records were changed

### 10.9 Production verification example outcome (reference)

Reference-only example from completed controlled production verification:

- target owner: `93dd810e-3c0c-4b69-9dae-edfa0e481dbb`
- target host: `ornrnvxtwwtulohqwxop.supabase.co`
- terminal post-apply dry-run state:
  - `would_insert_count = 0`
  - `would_skip_existing_seed_key_count = 96`
  - `would_skip_existing_equivalent_count = 1`
  - `possible_collision_count = 0`
  - `errors = 0`
- owner-account Pricebook count verified: `108`
- legacy V1 `R-410A` remained non-duplicated and continued to classify as safe equivalent skip

This reference outcome does not imply automatic, batch, or admin-UI-triggered backfill behavior. Dry-run-first operator control remains mandatory.

---

## 11. Product-mode capture for first-owner provisioning (Slice 1 implemented)

Status: IMPLEMENTED for First Owner Provisioning script path.

Product mode capture is now supported in the operator provisioning flow as the first implementation surface, before public signup capture.

### 11.1 Slice 1 behavior — Product mode on first-owner provisioning

Current script behavior:

- Accepts `--product-mode` with allowed values: `hvac_service`, `ecc_hers`, `hybrid`.
- Parser rejects invalid values.
- Apply mode requires valid `--product-mode`; missing value blocks apply.
- During apply, `account_settings.product_mode` is upserted after owner identity resolution and before invite orchestration.
- Account settings write failure blocks completion and prevents invite send.
- Dry-run remains non-mutating.
- Dry-run without `--product-mode` reports non-apply-ready structured state.
- Dry-run with `--product-mode` reports selected value and preview action (`would_create` / `would_patch` / `would_confirm`).
- Entitlement preset remains independent from product mode selection.

Operator usage examples:

- Internal comped owner/shared-brand pattern:
  - `--entitlement-preset internal_comped --product-mode hybrid`
- Standard service-company pattern:
  - `--entitlement-preset standard --product-mode hvac_service`

### 11.2 Precedence and fallback rules

- Missing `--product-mode` blocks provisioning apply only (not signup or login).
- Current fallback behavior (signal-based defaults) remains functional for backward-compatible accounts.
- Accounts without `account_settings.product_mode` rows continue to resolve safely via signal fallback.
- Slice 1 does not require backfilling existing accounts with product_mode values.
- Slice 1 does not change trial/payment flow or entitlement behavior.

### 11.3 Relationship to other provisioning parameters

Product mode is separate from:
- `--entitlement-preset`: controls trial vs. comped entitlement status
- `--default-billing-mode`: controls invoice workflow (internal_invoicing vs. external_billing)
- `--starter-kit-version`: controls pricebook seeding (v1, v2, v3)
- Tier (`plan_key`): business package level
- Feature flags: rollout safety gates

These parameters remain independent in Slice 1 implementation and later phases.

### 11.4 Phase 2 — Public signup capture (future, later than Phase 1)

Public signup at `/signup` will eventually support:
- HVAC Service (`hvac_service`)
- ECC (`ecc_hers`, customer-facing label "ECC")
- Hybrid (`hybrid`) remains manual/internal/sales-assisted only

Possible signup routes (not yet decided):
- `/signup/hvac-service` and `/signup/ecc` as separate entry points
- or single `/signup` with choice page redirecting to mode-specific flow
- or branded landing pages (`/ecc`, `/hvac-service`) with signup entry points

Phase 2 scope:
- Capture product_mode from signup flow
- Write product_mode to account_settings during signup account creation
- Do not enable until production account_settings migration is live

### 11.5 Phase 3 — Admin configuration UI (future, later than Phase 1 and Phase 2)

Admin configuration should start with read-only display only:
- Admin Center should display current product_mode in read-only form
- Edit UI and customer-initiated mode switches are later and require explicit gating

### 11.6 Production gate and boundaries for product_mode capture

Production schema gate is now satisfied:

- Migration `20260509120000_account_settings_product_mode_v1.sql` is applied and verified in production.
- `public.account_settings` exists with row count `0` post-migration baseline.

Boundaries for this runbook section remain:

- No existing-account backfill.
- No owner Hybrid row write outside approved operator execution.
- No Angkor `hvac_service` provisioning/onboarding/invite in the same change pass.
- Product_mode row creation remains operator-runbook controlled and dry-run-first.

Execution-window boundaries (future production migration window):

- No `account_settings` row backfill in the same window.
- No owner Hybrid row write in the same window.
- No Angkor `hvac_service` provisioning/onboarding/invite in the same window.
- Product_mode row creation should occur later through approved provisioning/signup capture flows.

Non-actions still confirmed:

- No signup capture enablement.
- No admin edit UI enablement.
- No feature-flag or Vercel changes.

---

## 12. Operator handoff readiness packet (planning only — no onboarding approved)

Status: PLANNING ONLY. No onboarding is currently approved or scheduled.
Last updated: 2026-05-07
Authority: Subordinate to `docs/ACTIVE/Active Spine V4.0 Current.md`

---

### 11.1 Current status

- No onboarding is approved. First-owner apply remains parked until explicit owner approval.
- Release is parked pending remaining product/readiness work. Controlled tester onboarding is not active.
- Dry-run path has been verified after secret rotation (2026-05-07):
  - sandbox target: `kvpesjdukqwwlgpkzfjm`
  - mode: `dry_run`
  - `inviteSent: false`
  - `errors: []`
  - no apply, no invite, no onboarding occurred
- Mobile/PWA QA is 10/10 complete (contractor-session smoke closed 2026-05-07, commit `5c73c46`).
- Final Launch Confirmation Sweep completed with no blockers (commit `5c73c46` / prior `f164fc40`).
- All current checks are PASS or documented PENDING with known reason (none are blocking blockers).

---

### 11.2 Future operator sequence

When explicit owner approval is given, the operator must follow these steps in order. Do not skip or reorder.

**Step 1 — Branch and tree check**
```
git checkout main
git pull origin main
git status --short
```
Expected: clean working tree, HEAD matches origin/main.

**Step 2 — Target project verification**
- Open `docs/ENVIRONMENT_RULES.md` and confirm the intended project ref.
  - sandbox ref: `kvpesjdukqwwlgpkzfjm`
  - production ref: `ornrnvxtwwtulohqwxop`
- Do not proceed if target is ambiguous.
- Do not assume `.env.local` reflects the production target.

**Step 3 — Secrets presence check (no values printed)**
- Confirm `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` are set for the intended target.
- Confirm they match the verified project ref. Do not print or log values.
- If uncertain, stop and verify via Supabase Dashboard → Project Settings → API.

**Step 4 — Dry-run (required)**
```bash
ALLOW_FIRST_OWNER_PROVISIONING=true \
ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true \
npx tsx scripts/provision-first-owner.ts \
  --email OWNER_EMAIL_HERE \
  --business-display-name "BUSINESS_NAME_HERE" \
  --owner-display-name "OWNER_NAME_HERE" \
  --support-email SUPPORT_EMAIL_HERE \
  --support-phone "+1-XXX-XXX-XXXX" \
  --entitlement-preset internal_comped \
  --default-billing-mode external_billing \
  --starter-kit-version v3
```
Replace placeholders with real values before running.
Review full output. Expected: `mode=dry_run`, `inviteSent=false`, `errors=[]`.

**Step 5 — Dry-run review gate**
- Confirm output shows the correct email, business name, entitlement preset, and starter kit version.
- Confirm `errors` is empty.
- Confirm `inviteSent` is false.
- Do not proceed if any value is wrong or unexpected.

**Step 6 — Owner approval gate (hard stop)**
- Do not proceed to apply without explicit written owner approval for this specific operator/account.
- Record who approved, when, and what was approved (email, business name, entitlement preset).

**Step 7 — Apply**
```bash
ALLOW_FIRST_OWNER_PROVISIONING=true \
ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true \
npx tsx scripts/provision-first-owner.ts \
  --email OWNER_EMAIL_HERE \
  --business-display-name "BUSINESS_NAME_HERE" \
  --owner-display-name "OWNER_NAME_HERE" \
  --support-email SUPPORT_EMAIL_HERE \
  --support-phone "+1-XXX-XXX-XXXX" \
  --entitlement-preset internal_comped \
  --default-billing-mode external_billing \
  --starter-kit-version v3 \
  --apply
```
Do not add `--apply` until Steps 1–6 are complete and recorded.

**Step 8 — Post-apply verification**
Verify (via Supabase Dashboard SQL Editor — read-only queries only):
- auth user exists for the target email
- profile row exists
- `internal_users` owner row exists, anchored to `account_owner_user_id`
- `internal_business_profiles` row exists
- `platform_account_entitlements` row exists with expected preset values
- first-owner marker is written to user metadata
- Pricebook starter rows exist for the new account (97 rows for v3)

**Step 9 — Invite path confirmation**
- Owner receives invite email.
- Owner clicks invite link → `/set-password?mode=invite`.
- After set-password: first-owner marker detected → routes to `/ops/admin`.
- Admin Center + Account Setup readiness card renders.
- Confirm `0 of 5 complete` on first load (not a misleading pre-filled state).

**Step 10 — Stop conditions**
Stop immediately and do not continue if any of the following occur:
- dry-run shows unexpected email, business name, or entitlement
- dry-run `errors` is not empty
- target project ref cannot be verified with certainty
- secrets do not correspond to the verified target
- owner approval has not been received
- apply output shows unexpected rows or errors
- invite email does not arrive or arrives for wrong address

---

### 11.3 Safety gates

- No apply without explicit owner approval.
- No invite without explicit owner approval.
- No onboarding while release is parked or product work is incomplete.
- Hosted Supabase target (including sandbox) requires both `ALLOW_FIRST_OWNER_PROVISIONING=true` and `ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true` for both dry-run and apply.
- Old key revocation is confirmed via Supabase Dashboard only — not terminal-tested. Never paste revoked or active service keys into transcripts, screenshots, or logs.
- No secrets in transcripts, screenshots, terminal logs, or docs.
- First-owner marker must be confirmed written before invite send is considered successful.
- Do not attempt Pricebook backfill (§10) in the same operator session as first-owner apply — treat as a separate controlled action.
- Entitlement preset for internal/comped accounts must be `internal_comped`; standard preset creates a trial entitlement and must not be used for owner accounts.
- Do not enable `ENABLE_ESTIMATES`, `ENABLE_SUPPORT_CONSOLE`, or any other deferred feature flag as part of this onboarding pass.

---

### 11.4 Evidence template

Fill in this template and retain for audit/handoff record. Do not paste secrets or key values.

```
First-Owner Provisioning Evidence Record
-----------------------------------------
Operator:              [name]
Date/time:             [YYYY-MM-DD HH:MM TZ]
Environment:           sandbox | production
Project ref:           [ref — verify before recording]
Commit hash (HEAD):    [git rev-parse HEAD output]
Branch:                main
Working tree clean:    yes | no

Dry-run result:
  mode:                dry_run
  inviteSent:          false
  errors:              []
  entitlement preset:  internal_comped | standard
  starter kit version: v3
  pricebook seed_count: 97

Owner approval:
  Approved by:         [name]
  Approval date/time:  [YYYY-MM-DD HH:MM TZ]
  Approved email:      [email]

Apply result:
  apply executed:      yes | no
  errors:              []
  auth user created:   yes | no
  profile row:         yes | no
  internal_users row:  yes | no
  entitlements row:    yes | no
  first-owner marker:  yes | no
  pricebook rows:      [count]

Invite path:
  invite sent:         yes | no
  invite email:        [email]
  owner accepted:      yes | no
  routed to /ops/admin: yes | no
  readiness card (0 of 5): yes | no

Rollback/stop notes:   [describe any stop or rollback, or "none"]
```

---

### 11.5 Explicit non-goals

This section and this runbook are not:
- A launch approval. Release remains parked pending remaining product/readiness work.
- An onboarding action. No provisioning apply or invite is implied or scheduled.
- A production Estimates enablement. `ENABLE_ESTIMATES` production flag must remain unset/false until Estimates runbook gates are approved.
- A Support Console enablement. `ENABLE_SUPPORT_CONSOLE` production flag must remain unset until Support Console runbook gates are approved.
- A tenant customer payment execution path. Tenant invoice/payment track remains deferred.
- A QBO enablement. QBO remains optional/downstream only.
- A native app-store or offline/service-worker action. Those remain separate deferred slices.
- Authorization to skip any step in §11.2 or bypass any gate in §11.3.
