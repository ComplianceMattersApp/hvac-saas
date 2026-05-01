# Compliance Matters Software — Pre-Launch Confirmation Checklist

**Status:** ACTIVE PRE-LAUNCH PLANNING SUPPORT DOC  
**Authority:** Subordinate to `docs/ACTIVE/Active Spine V4.0 Current.md`  
**Purpose:** Keep final launch enablements, hardening items, and rollout confirmations visible so they do not fall off the agenda while core development continues.

---

## 1. What this document is

This is a **launch-readiness checklist**, not the operational source of truth.

If any item here conflicts with the active spine, the spine wins.

---

## 2. Pre-launch enablement items

### 2.1 Supabase Auth leaked password protection
- Enable leaked password protection when the required paid plan / launch readiness is in place.
- Treat as a launch hardening item, not a current development blocker.
- Verify the warning is cleared before launch.

### 2.2 SMS / on-the-way messaging
- Keep SMS/on-the-way messaging wired directionally in product planning.
- Do not fully configure/send live messages until right before launch.
- Final provider/payment-backed setup belongs to the pre-launch window.
- Verify wording does not imply live texting is active until setup is complete.

### 2.3 Payment/live enablement readiness
- Confirm launch posture remains `payment-ready by design, payment-active later` unless explicitly changed.
- Confirm Phase P1 payment-ready foundation is complete, while live processor-backed payment execution remains later/pre-launch enablement work.
- Confirm Stripe Platform Subscription V1 is implemented and live-smoke confirmed for platform account onboarding.
- Confirm this Stripe work is separate from tenant customer/work invoice payment execution.
- Confirm the tenant customer/work payment execution track remains future/deferred:
  - customer pays invoice online
  - payment outcome writes back to Compliance Matters
  - invoice payment status/balance updates
  - partial/full payment outcomes anticipated
  - refunds/disputes/payment-failure handling remains later
  - optional small platform fee remains future capability
  - QBO remains optional/downstream only
- Verify no UI implies live processor-backed payment collection before it truly exists.
- Confirm Stripe-first future direction and QBO-optional boundary remain intact.
- Confirm recent invoice/payment wording polish remains honest:
  - payment entries are tracking-only and do not execute card charges
  - no live Pay Now/Charge Card/checkout/refund/dispute/payout language appears as active behavior

### 2.3.1 Launch-readiness catch-up confirmations (completed)
- Service / Visit Scope clarity pass is complete:
  - Service Details vs Visit Scope purpose wording is clarified on job detail
  - Job Title fallback copy is clarified
  - no model/validation/billing/ECC/RLS behavior changes were introduced
- Invoice job-detail TLC pass is complete:
  - panel scanability and issue/send/payment/void wording are clearer
  - invoice truth anchor is explicit; payment recording remains tracking-only
  - external-billing lightweight wording emphasizes Invoice Sent tracking
- Internal invoice prefill fallback hardening is complete where source fields exist; existing drafts are not overwritten.
- Address state capture/wiring pass is complete for relevant intake/finalization seams and supports billing-state prefill where source data is captured.
- Internal invoice void recovery/replacement pass is complete:
  - voided invoices remain historical
  - voided invoices do not satisfy closeout billed truth
  - replacement draft flow is available for same-job continuity
- Invoice report wording polish is complete:
  - Send Status replaces Comm State
  - Payment Count replaces Payments
  - CSV header wording aligned where applicable

### 2.3.2 Stripe platform onboarding status and live rollout confirmation
- Stripe Platform Subscription V1 is implemented and has now passed live production smoke for platform account onboarding.
- Live Stripe Product/Price is configured for the flat platform account subscription.
- Vercel production env is configured with live Stripe values.
- Live Stripe webhook endpoint is configured for:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Production Checkout successfully opened live Stripe Checkout.
- Live subscription completion succeeded on a normal non-owner test account.
- Vercel logs confirmed `/api/stripe/webhook` returned `200`.
- `platform_account_entitlements` synced correctly after live purchase:
  - Billing Customer: Linked
  - Subscription: Active
  - Period End populated
- Manage billing path remains available.
- Local sandbox smoke and hardening also remain confirmed:
  - `/api/stripe/webhook` bypasses session-auth proxy redirect (no Stripe 307 redirect loop)
  - webhook signature verification remains enforced inside `app/api/stripe/webhook/route.ts`
  - unmanaged/fixture `checkout.session.completed` events are safely ignored with 200
  - period-end mapping uses `subscription.items.data[*].current_period_end` with legacy fallback to `subscription.current_period_end`
- This remains platform account subscription billing only.
- Sandbox/test Stripe values must never be committed.
- `.env.local` remains local-only.
- Local Stripe CLI webhook secret is not the same as deployed/live webhook secret.
- Keep this priority separate from tenant customer invoice payment execution.
- Tenant customer invoice payment execution remains deferred unless explicitly pulled forward.
- Live payment execution surfaces (Pay Now/Charge Card/checkout/refunds/disputes/payouts) remain deferred.

### 2.3.3 Completed production-shipped cleanup sequence confirmation
- Completed production-shipped cleanup batch is confirmed as launch-readiness baseline documentation:
  - Notifications/proposals: unread-awareness cleanup on accept/reject/finalize, card identity restoration, preserved contractor follow-up comments, preserved internal adjudication notes, and intact contractor-visible/internal-only boundaries.
  - Calendar/scheduling: phone wiring fix in details, card identity restoration (job title/city), no-tech scheduled visibility, unassigned filter chip, inspector collapsible/default-closed behavior, responsive default views (desktop Month, mobile List, explicit view preserved), and unified-surface drag/drop direction with manual scheduling still available.
  - UI polish: date-only display format changed to MM-DD-YYYY (storage/input/query unchanged), login password show/hide toggle, and day/aging counters on Failed and Need Info/Pending Info internal/portal surfaces.
  - ECC/test workflow: refrigerant Photo Taken path is attestation-only, does not require/verify uploaded photo proof, does not claim numeric pass, preserves computed_pass = null until manual/admin review or override where needed, and keeps numeric/manual override paths intact.
  - Duct leakage override suggestion list includes Asbestos while preserving custom/manual reason support.
- Confirmed boundaries for this closeout:
  - no payment execution behavior change
  - no Pricebook behavior change
  - no RLS behavior change
  - no claim of calendar engine rebuild
  - no technician-assignment ownership change from calendar drag/drop

### 2.4 First owner onboarding/provisioning readiness
- **V1 implemented and browser-smoked.** Public self-serve signup exists for standard onboarding at `/signup`, and invite-only platform-admin/operator provisioning remains active/manual fallback.
- Confirmed: provisioning script (`scripts/provision-first-owner.ts`) requires explicit allow flags for apply mode; defaults to dry-run.
- Confirmed: provisioning confirms/creates auth user, profile, owner-anchored `internal_users` row, `internal_business_profiles`, `platform_account_entitlements`.
- Confirmed: internal/comped entitlement support is complete for owner-safe accounts.
- Confirmed: production owner account is protected with `entitlement_status = active`, `seat_limit = null`, `notes = internal_comped_v1`, and no Stripe customer/subscription linkage.
- Confirmed: sandbox owner account is aligned to the same protected comped pattern.
- Confirmed: production owner account and Terry are protected under the production account-owner entitlement.
- Confirmed: owner/internal comped accounts are not pushed into Stripe Checkout.
- Confirmed: first-owner marker is durably written to user metadata before invite send.
- Confirmed: first-owner routing seam (`lib/auth/first-owner-routing.ts`) detects marker and confirms all anchor rows before routing; fails closed if any row is missing.
- Confirmed: first owner acceptance (`/set-password?mode=invite`) routes to `/ops/admin`; Admin Center + Account Setup readiness card renders.
- Confirmed: normal internal user routing (`/ops`) and contractor routing (`/portal`) branches are preserved.
- Confirmed: Self-Serve Onboarding V1 functional smoke passed (`/signup` load/submit, invite delivery, set-password/login completion, successful login for fresh email).
- Confirmed: duplicate/existing email public response behavior is intentionally neutral.
- Confirmed: public self-serve signup does not introduce tenant customer/work payment execution, QBO behavior, or RLS model change.
- Confirmed: initial signup first-impression polish is acceptable for current baseline; deeper public-brand polish remains deferred.
- Confirmed: operator runbook path remains active and required for manual/admin fallback onboarding.
- Confirmed: internal/comped owner provisioning remains operator-controlled and is not a public self-serve path.
- **Pre-launch operator runbook item:** before onboarding the first real production account, operator must run dry-run first, verify the intended Supabase project, then run apply with both `ALLOW_FIRST_OWNER_PROVISIONING=true` and `ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true`. Note: the production-flag is also required for any hosted Supabase project (including sandbox) because `.supabase.co` URLs are classified as production-like remote targets.
- Runbook reference: `docs/ACTIVE/First_Owner_Provisioning_Runbook.md`.

### 2.5 Admin readiness checklist confirmation
- Confirm Admin Readiness / Setup Checklist V1 is present and working on `/ops/admin` and contextually visible on `/ops/admin/company-profile`.
- Confirm readiness packaging remains read-only derived state from existing tenant/account sources (no new readiness truth table).
- Confirm required criteria and optional criteria render separately with clear setup guidance.
- Confirmed: setup-progress timestamps were added at `internal_business_profiles.profile_reviewed_at` and `internal_business_profiles.team_reviewed_at`, and applied in sandbox and production.
- Confirmed: readiness now separates provisioning-created foundation rows from user-completed onboarding actions.
- Confirmed: a newly provisioned standard account first login shows `0 of 5 complete`, not a misleading `5 of 5 complete`.
- Confirmed: saving company profile marks the profile-related readiness steps complete.
- Confirmed: confirming team setup marks the team step complete.
- Confirmed: production browser verification showed the newest account at `0 of 5` on first login.
- Confirmed: `/ops/admin/internal-users` launch cleanup removed/hid the `Link existing auth user` panel from the normal admin page while preserving Invite teammate, team setup confirmation, and the team member list.
- Closeout clarification: this roadmap area is closed at the current baseline, but readiness and first-owner provisioning remain required pre-launch verification/runbook checks.

### 2.6 Launch billing decision (confirmed)
- V1/live launch uses a flat platform account subscription with unlimited users.
- Active user count remains visible.
- Per-seat billing remains a desired later track, but is not enforced in V1/live launch.
- Future per-seat work should include seat-limit enforcement, Stripe quantity sync, proration handling, and customer portal quantity rules.

### 2.6.1 Operational entitlement mutation guard rollout closeout (sandbox-ready)
- Confirmed: operational entitlement mutation guard rollout is complete on `sandbox-clean-start` through Slice 16C for active internal operational mutation paths.
- Confirmed guarded operational mutation families:
  - internal job creation/intake
  - job ops/scheduling/contact
  - closeout/completion
  - internal invoices/invoice lines/manual payment tracking
  - notes
  - calendar block events
  - contractor report preview/send
  - attachments
  - equipment/systems
  - ECC test-run/test-data
  - staffing/assignment/contractor relink
  - remaining job-detail operations
  - contractor intake adjudication
  - customer/profile mutations
  - contractor directory/admin mutations
  - Pricebook mutations
- Confirmed server-side entitlement result:
  - active entitlement is allowed
  - valid trial is allowed
  - internal/comped accounts are allowed
  - expired trial is blocked before writes/side effects
  - null-ended trial is blocked before writes/side effects
  - missing entitlement is blocked before writes/side effects
- Confirmed intentionally accessible setup/recovery/admin paths remain outside internal operational entitlement gating:
  - company profile
  - team setup
  - internal user/admin invite and password recovery
  - billing/setup recovery
  - notification read-state
- Confirmed: external contractor onboarding/invite acceptance remains outside internal operational entitlement gating.
- Confirmed: `createJob` remains a low-level helper only; active entrypoints are guarded.
- Confirmed: `lib/actions/intake-actions.ts` remains dormant legacy and is a later cleanup/retirement candidate.
- Confirmed: no Stripe tenant customer/work payment execution was introduced by this rollout.
- Confirmed: no QBO behavior was introduced by this rollout.
- Confirmed: no schema migration or Supabase data change was part of this rollout.
- Remaining rollout work is now limited to final validation, docs/source-of-truth closeout, branch-promotion decision, and later dormant legacy intake cleanup.

### 2.7 Pricebook invoice-line sourcing promotion confirmation (C1B/C1C)
- Completed: Pricebook C1B/C1C invoice-line sourcing promotion is production-promoted and production-smoke confirmed.
- Completed verification on promoted behavior:
  - active nonnegative items are selectable
  - inactive items are not selectable
  - negative/default-credit items are blocked/deferred
- Completed verification of frozen invoice-line snapshot/provenance fields for Pricebook-backed adds:
  - `source_kind`
  - `source_pricebook_item_id`
  - `category_snapshot`
  - `unit_label_snapshot`
- Completed verification that manual invoice line add/edit/remove flow remains intact after Pricebook-backed adds.
- Completed verification that issued/void invoices remain non-editable for Pricebook add controls.
- Completed verification that wording remains honest and does not imply live payment execution.
- Deferred policy remains unchanged: negative/default-credit adjustments remain blocked/deferred pending a separate adjustment/credit policy track.
- Payment execution remains deferred; tenant customer card/checkout charging is not part of this closeout.

### 2.8 Pricebook starter seeding promotion confirmation (D2C-3/D2C-4)
- Completed: D2C-3/D2C-4 are production-promoted.
  - D2C-3: starter seed helper foundation
  - D2C-4: first-owner provisioning integration + structured operator output
- Completed: production dry-run smoke confirmed `pricebookSeeding` output shape.
  - top-level mode was `dry_run`
  - `pricebookSeeding` preview returned the V1 starter set (`inserted_count = 12`, `skipped_count = 0`)
  - errors were empty and invite send was false
- Confirmed: no apply/write/invite action occurred during smoke.
- Before onboarding first real production accounts, operators must:
  - run dry-run first
  - verify production project ref before each run
  - confirm `pricebookSeeding` preview output is present and sane
  - run apply only when intentionally provisioning a real account

### 2.9 Pricebook controlled-options refinement promotion confirmation (D3B)
- Completed: D3B controlled-options refinement is production-promoted on `main` (merge `58dcb31`, change `3084906`).
- Completed: controlled options were refined in code/test only:
  - `lib/business/pricebook-options.ts`
  - `lib/business/__tests__/pricebook-options.test.ts`
- Completed: controlled option refinement for Pricebook includes:
  - categories added: `Electrical`, `Compliance Docs`
  - unit labels added: `trip`, `doc`
  - Pricebook controlled unit label removed: `cfm`
- Confirmed: CFM remains valid in ECC/airflow/testing contexts; this promotion did not alter ECC/workflow logic.
- Confirmed: no schema migration, Supabase command, or DB write action occurred for this promotion.
- Confirmed: no invoice/payment/Stripe/QBO/Visit Scope/service workflow behavior changed.
- Confirmed: Starter Kit V2 content was not implemented by D3B and was implemented later by V2A/V2B.

### 2.10 Pricebook Starter Kit V2A/V2B promotion confirmation
- Completed: V2A/V2B are production-promoted on `main`.
  - V2A: Starter Kit V2 seed definitions added (`23` rows total, `21` active, `2` inactive/deferred)
  - V2B: explicit provisioning selector wiring added for Starter Kit `v1|v2`
- Completed: default first-owner dry-run path still resolves to Starter Kit `v1` when selector is omitted.
- Completed: explicit `--starter-kit-version v2` dry-run path returns V2 preview (`23` rows) with selector metadata.
- Completed: invalid selector values (for example `v3`) are rejected clearly before provisioning execution.
- Completed: no provisioning apply/backfill action occurred during promotion verification.
- Completed: no payment behavior changed by V2A/V2B promotion.
- Completed: no migration, Supabase command, or production data action occurred as part of V2A/V2B promotion.

### 2.11 Visit Scope -> invoice bridge promotion confirmation (A1-A5)
- Completed: A1-A5 Visit Scope -> invoice bridge stack is production-promoted on `main`.
- Completed: production migration `20260428113000_internal_invoice_line_items_visit_scope_provenance_v1.sql` was applied and migration list sync was confirmed.
- Completed: promotion validation passed before and after merge:
  - targeted suite: 37 tests passed
  - `npx tsc --noEmit` passed
- Completed: broader smoke coverage confirmed the production-intent behavior set:
  - Service intake rejects summary-only scope
  - Service intake succeeds with at least one structured Visit Scope item
  - ECC optional scope remains lightweight/optional
  - ECC companion scope remains allowed
  - Build Invoice from Visit Scope adds draft line items at qty `1.00` / unit `$0.00`
  - Already-added state prevents duplicate scope-item adds
  - manual draft invoice line add still works
  - Pricebook draft invoice line add still works
  - issued/void invoice states keep builder/edit controls hidden
  - invoice/payment wording remains tracking-only and does not imply live charging
- Before launch (post-deploy), operators should verify this path in production UI:
  - Service intake structured-scope requirement
  - ECC optional scope behavior
  - Build Invoice from Visit Scope draft builder
  - manual + Pricebook invoice add coexistence
  - issued/void invoice lock behavior

### 2.12 Pricebook existing-account Starter Kit V2 backfill tooling promotion confirmation (V2C-1/V2C-2/V2C-3)
- Completed: V2C-1/V2C-2/V2C-3 are production-promoted on `main` (commit `4ead046`).
  - V2C-1: dry-run planner helper promoted
  - V2C-2: apply helper promoted (requires explicit `confirmApply: true`; collision-blocking is default)
  - V2C-3: CLI wrapper (`scripts/backfill-pricebook-starter-kit.ts`) promoted
- Completed: promotion validation passed before and after merge:
  - 86 tests passed (64 pricebook-seeding + 22 backfill CLI)
  - `npx tsc --noEmit` passed
- Confirmed: no Supabase command, migration, provisioning apply, backfill run against real data, or production data action occurred as part of V2C promotion.
- Confirmed: backfill is not automatic; no production account has been backfilled.
- Confirmed: CLI defaults to dry-run; apply requires explicit `--apply` flag.
- Confirmed: insert-only behavior; existing rows are never updated or mutated.
- Confirmed: hosted/production-like targets require both `ALLOW_FIRST_OWNER_PROVISIONING=true` and `ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true` before dry-run or apply.
- Confirmed: invoice snapshots, historical invoices, payments, Stripe, QBO, Visit Scope, and service workflow behavior are unchanged.
- Pre-launch operator verification item: before any real account backfill, operator must run dry-run only against the intended target, review the full plan output, and confirm `would_insert_count` and collision output are sane before any apply.
- Runbook reference: `docs/ACTIVE/First_Owner_Provisioning_Runbook.md` (Section 10).

### 2.13 Pricebook/Admin visibility polish promotion confirmation (P1)
- Completed: Pricebook/Admin Polish P1 is production-promoted on `main` (commit `aecb735`).
- Completed: admin Pricebook screen smoke confirms clarity-focused UI labels/chips for normal users:
  - Starter
  - Custom
  - Active
  - Inactive
  - Deferred placeholder (where applicable)
- Completed: filter/chip language is consolidated for normal admin clarity and no longer exposes V1/V2 terminology on the page.
- Completed: promotion validation passed:
  - `npx tsc --noEmit` passed
  - Pricebook test suites passed (`lib/business/__tests__/pricebook-options.test.ts`, `lib/business/__tests__/pricebook-seeding.test.ts`)
  - total passed: 69 tests
- Confirmed: no Supabase command, migration, provisioning apply, or backfill run occurred as part of P1 promotion.
- Confirmed: no business/seed/backfill behavior changed by P1; this promotion is UI/read-only clarity polish.

### 2.14 Pricebook/Admin usability polish promotion confirmation (P2)
- Completed: Pricebook/Admin Polish P2 is production-promoted on `main` (commit `a97c764`).
- Completed: catalog management usability improvements confirmed:
  - add item form is clearer with helper copy explaining reusable catalog item purpose and future-selection-only impact
  - edit fields disclosure clearly labeled "Edit fields" with improved form layout and spacing
  - price and unit display now grouped in single table column for easier scanning
  - activate/deactivate buttons now color-coded (red for deactivating, green for activating) with helper text clarifying:
    - deactivation prevents future selection and does not mutate historical invoices
    - activation enables item in future selections
  - empty state messaging clarified with actionable guidance
- Completed: P1 clarity fully preserved for normal admin users:
  - Starter/Custom source identification remains clear
  - Active/Inactive status remains clear
  - Deferred placeholder status remains clear where applicable
- Completed: V1/V2 terminology remains intentionally hidden from normal admin-facing page and labels.
- Completed: promotion validation passed:
  - `npx tsc --noEmit` passed
  - Pricebook test suites passed (69 tests total)
    - `lib/business/__tests__/pricebook-options.test.ts`: 5 tests
    - `lib/business/__tests__/pricebook-seeding.test.ts`: 64 tests
- Confirmed: no Supabase command, migration, provisioning apply, or backfill run occurred as part of P2 promotion.
- Confirmed: no business logic, seed definitions, or backfill behavior changed by P2; this promotion is UI/usability polish only.
- Confirmed: admin UI backfill controls remain future work; operator-run tooling boundary is unchanged.
- Confirmed: no invoice/payment/Stripe/QBO/Visit Scope/service workflow behavior changed by P2.

### 2.15 Starter Kit V3 default adoption promotion confirmation
- Completed: Starter Kit V3 promotion is confirmed on `main` (commits `28cc757`, `b31d433`) with prior P2 cleanup commit `987af81` in the same promoted stack.
- Completed: first-owner provisioning default changed from starter kit `v1` to starter kit `v3` when selector is omitted.
- Completed: explicit starter kit selectors remain preserved (`v1`, `v2`, `v3`) and invalid values still fail closed.
- Completed: promoted V3 catalog baseline is confirmed:
  - `seed_count = 97`
  - `active_seed_count = 91`
  - `inactive_seed_count = 6`
  - refrigerant coverage includes `R-410A`, `R-454B`, `R-32`
- Completed: promotion validation passed:
  - `npx tsc --noEmit` passed
  - 5-file validation suite passed (`140` tests)
- Confirmed: no Supabase command, migration, provisioning apply, backfill run against real data, or production data action occurred during promotion.
- Confirmed: existing-account backfill remains operator-controlled and dry-run-first; no account has been backfilled as part of V3 default adoption.
- Pre-launch operator requirement: before onboarding the first real account on this baseline, verify dry-run preview output shows V3 starter metadata and sane row counts.

### 2.16 Pricebook V3 sandbox backfill + Admin P3 closeout confirmation
- Completed: safe-equivalent existing-account backfill tooling is production-promoted on `main` (commit `41d5dae`).
- Completed: controlled sandbox existing-account V3 backfill apply succeeded for account owner `6e93b2f7-1509-4a39-87e5-6558497f2157`.
- Completed verification:
  - pre-apply dry-run: `seed_count = 97`, `would_insert_count = 96`, `would_skip_existing_equivalent_count = 1`, `possible_collision_count = 0`, `errors = []`
  - apply result: `inserted_count = 96`, `skipped_existing_equivalent_count = 1`, `possible_collision_count = 0`, `errors = []`
  - post-apply dry-run: `would_insert_count = 0`, `would_skip_existing_seed_key_count = 96`, `would_skip_existing_equivalent_count = 1`, `possible_collision_count = 0`, `errors = []`
- Completed: existing V1 `R-410A` row was not duplicated.
- Completed: sandbox Pricebook UI now shows `109` items.
- Completed: Pricebook/Admin P3 usability promotion is on `main` (commit `4446af3`) with Search Pricebook, category filter, clear filters, filtered counts, and filtered empty state.
- Completed: validation passed for both promotion slices (`npx tsc --noEmit`; targeted Pricebook suites).
- Confirmed: no production data was touched for this closeout.
- Confirmed: no Supabase command, migration, provisioning apply, or backfill batch/automatic run occurred.
- Pre-launch operator note: before any additional production existing-account backfill, run dry-run first and verify inserts/skips/equivalents/collisions are sane before any apply.

### 2.17 Pricebook V3 production existing-account backfill verification confirmation
- Completed: production existing-account Starter Kit V3 verification is complete for owner account `93dd810e-3c0c-4b69-9dae-edfa0e481dbb` on host `ornrnvxtwwtulohqwxop.supabase.co`.
- Completed: production owner-account Pricebook count is verified at `108` items.
- Completed: production terminal dry-run state is verified:
  - `would_insert_count = 0`
  - `would_skip_existing_seed_key_count = 96`
  - `would_skip_existing_equivalent_count = 1`
  - `possible_collision_count = 0`
  - `errors = 0`
- Completed: R-410A non-duplication is verified:
  - `Refrigerant R-410A (per lb)` count = `1`
  - legacy V1 `R-410A` remains the safe equivalent skip row
- Confirmed: no Supabase CLI command, migration, provisioning apply, schema change, code change, file change, push, or commit occurred during final verification.
- Confirmed: production data was already in post-apply terminal state when final verification was executed.
- Security follow-up preserved:
  - previously exposed legacy production service_role key was rotated
  - new Supabase secret key is in use
  - Vercel `SUPABASE_SERVICE_ROLE_KEY` was updated as Sensitive
  - production was redeployed and smoke tested successfully
  - terminal sessions were closed
- Deferred hardening item (still required): migrate away from legacy JWT anon/service_role key usage before disabling JWT-based API keys.

---

## 3. Support / customer-operations readiness

### 3.1 Remote support access model
- Define a safe way for internal support staff to assist customer accounts remotely.
- Do not rely on informal tenant-boundary bypass or raw database access as the product answer.
- Support access must preserve:
  - tenant isolation
  - auditability
  - least privilege
  - explicit support-session or scoped-access behavior

### 3.2 Internal support operations
- Confirm support contact/business identity surfaces are ready enough for customer-facing use.
- Confirm support workflow expectations are documented for launch.

---

## 4. Deferred but pinned hardening items

### 4.1 `pg_trgm` in `public`
- Current advisor warning is acknowledged and intentionally deferred.
- `pg_trgm` is actively backing live trigram indexes for customer/location search.
- Any move out of `public` must be handled as a dedicated search/index maintenance pass with regression testing.
- Preferred timing: deliberate pre-launch hardening window or immediate post-launch maintenance, depending on stability risk.

---

## 5. Final launch confirmation sweep

Before launch, confirm:
- core operational workflows still pass live smoke testing
- contractor intake / portal flows still behave correctly
- internal/admin critical paths still behave correctly
- notifications and awareness surfaces are honest and current
- billing/payment wording remains truthful
- tenant customer invoice payment execution is still not live
- pre-launch enablements above are either completed or intentionally deferred with explicit decision
- no deferred hardening item has been silently forgotten

---

## 6. One-line definition

This checklist exists to keep the final launch-critical enablements, support requirements, and deferred hardening tasks visible so launch readiness is deliberate rather than accidental.
