# Compliance Matters Software — Product Mode Signup Spec

Status: ACTIVE planning spec  
Authority: Subordinate to [Active Spine V4.0 Current.md](./Active%20Spine%20V4.0%20Current.md), [Release_Scope_Lock_and_Post_Launch_Roadmap.md](./Release_Scope_Lock_and_Post_Launch_Roadmap.md), and [Compliance_Matters_Business_Layer_Roadmap.md](./Compliance_Matters_Business_Layer_Roadmap.md)  
Mode: Documentation/spec only (no implementation in this slice)  
Date: 2026-05-08

## 1. Purpose

This spec defines three signup/onboarding versions on one shared Compliance Matters platform engine:

1. ECC/HERS Compliance Testing version
2. HVAC Service Company version
3. Cleaning / Janitorial version

This is not a second app and not a codebase split.

This spec is a planning contract for future product-mode/account setup work and does not implement signup behavior in this slice.

## 2. Signup Versions

The product supports three onboarding choices for new companies:

1. ECC/HERS Compliance Testing
2. HVAC Service Company
3. Cleaning / Janitorial

Both choices provision into the same shared platform with different defaults and presentation emphasis.

## 3. Shared Foundation

Both versions share the same core foundation:

- accounts/tenants
- users/internal roles
- customers
- locations
- jobs
- service cases
- scheduling/calendar
- Work Items / Visit Scope
- notes/timeline
- attachments
- reports
- invoices/payment tracking
- pricebook
- notifications
- admin/company profile
- mobile/PWA shell
- source-of-truth model

Source-of-truth ownership remains unchanged:

- `job_events` = narrative/operational truth
- `ecc_test_runs` = ECC test truth
- `jobs.ops_status` = operational projection
- `service_cases` = continuity truth
- `jobs` = visit/execution truth

## 4. ECC/HERS Signup Defaults

When a company signs up as ECC/HERS Compliance Testing, default posture should be:

- product mode: ECC/HERS Compliance Testing
- job creation default: ECC/compliance job
- contractor intake/review is relevant/available in ECC mode
- contractor portal is relevant/available in ECC mode
- contractor admin visible
- ECC tests visible
- failed-test correction evidence visible
- retest review/request workflows visible
- cert/paperwork closeout emphasized
- contractor reports/signals visible
- compliance-oriented reporting emphasized
- ECC/compliance starter kit when starter kits become mode-aware

Tier/add-on clarification (future implementation):

- ECC/HERS Standard supports internal ECC job creation and ECC workflow management.
- Contractor portal/intake/correction flows should be enabled by tier/add-on/entitlement policy (for example Pro tier or explicit add-on), not by product mode alone.

## 5. HVAC Service Signup Defaults

When a company signs up as HVAC Service Company, default posture should be:

- product mode: HVAC Service
- job creation default: Service / Work Order
- contractor intake hidden/de-emphasized by default
- contractor portal hidden/de-emphasized by default
- ECC job creation hidden/de-emphasized by default
- customers/locations emphasized
- calendar/dispatch emphasized
- service cases emphasized
- Work Items emphasized
- internal users/technicians emphasized
- waiting reasons emphasized
- invoice/payment tracking emphasized
- service reports emphasized
- estimates/quoting positioned as service-first future module
- recurring services positioned as future service-side module
- service starter kit when starter kits become mode-aware

Tier/add-on clarification (future implementation):

- HVAC Service should hide contractor portal/intake by default unless a future entitlement explicitly enables a compatible workflow.
- Estimates, SMS, tenant customer payments, and recurring-service capabilities should be controlled by tier/add-on policy rather than product mode identity alone.

## 5A. Cleaning / Janitorial Signup Defaults

When a company signs up as Cleaning / Janitorial, default posture should be:

- product mode: Cleaning / Janitorial
- job creation default: Service / Work Order
- one-off cleaning jobs emphasized first
- recurring services, crews, checklists, allotted hours, and follow-up positioned as future cleaning-side modules
- contractor/ECC workflows hidden/de-emphasized by default unless explicitly enabled by future design
- Cleaning starter kit (`cleaning_v1`) for omitted starter-kit selection during first-owner provisioning and public Cleaning signup

## 6. Future Account-Level Product Mode

Future implementation can introduce an account-level identity setting concept such as:

- `product_mode = "ecc_hers" | "hvac_service" | "cleaning_services" | "hybrid"`

Clarifications:

- This is a future implementation concept only.
- Do not implement schema in this slice.
- Do not reuse `billing_mode` for product identity.
- `billing_mode` and `product_mode` are separate concepts and must remain separate.

### 6.1 Product Mode V2 decision (implementation contract)

Product Mode V2 is approved as an **additive account-level settings decision**, not a billing/tier/entitlement repurposing.

V2 storage decision:

- Product mode should live in a dedicated account-level settings table, likely `account_settings`.
- `product_mode` values are:
   - `hybrid`
   - `hvac_service`
   - `ecc_hers`
   - `cleaning_services`
- `product_mode` remains nullable in first implementation for safe rollout.

Resolver order decision:

1. Read real account setting first (`account_settings.product_mode` when present)
2. Read temporary Slice 1 override second
3. Read signal fallback third
4. Apply safe default last

Separation and boundary decision:

- `product_mode` must not live in `billing_mode`.
- `product_mode` must not live in `plan_tier`.
- `product_mode` must not live in entitlements/add-on rows.
- `product_mode` must not be inferred from business-profile display fields.
- `product_mode` controls workflow relevance/defaults only.

Explicit non-authority for `product_mode`:

- no billing or payment behavior control
- no RLS/auth/security scope control
- no source-of-truth ownership changes
- no contractor authority changes
- no report dataset/calculation control
- no tier/add-on enforcement
- no feature-flag control

Rollout shape decision:

- First implementation should be additive and reversible.
- Admin display starts read-only.
- Admin mutation/edit UI is later.
- Signup capture is later.
- Tier/add-on enforcement is later.
- Full mode-aware navigation/report rewrites are later.

### 6.2 Implementation closeout snapshot (2026-05-09)

Completed implementation references:

- Product Mode V2 Slice 1 is implemented in commit `c42f4a2`.
- ECC Naming Phase 1 is implemented in commit `6680ba8`.

Product Mode V2 Slice 1 facts (implemented):

- Added account-level `account_settings` migration file.
- Added nullable `product_mode`.
- Allowed values remain `hybrid`, `hvac_service`, `ecc_hers`, `cleaning_services`.
- Resolver now reads `account_settings.product_mode` first.
- Resolver fallback order is:
   1. real account setting
   2. temporary Slice 1 override
   3. signal fallback
   4. safe default
- Mapping remains:
   - `hybrid` -> ECC default
   - `ecc_hers` -> ECC default
   - `hvac_service` -> Service default
   - `cleaning_services` -> Service default
- Contractor mode is unchanged.
- Draft `jobType` still wins.
- ECC and Service remain selectable.

ECC naming Phase 1 facts (implemented):

- Customer-facing/product wording now prefers "ECC" in visible copy where this phase applied.
- Internal code/storage may continue to use `ecc_hers` temporarily.
- Internal enum/data migration is deferred to a future Phase 2.

Explicit boundaries (not performed in these slices):

- No production migration was applied.
- No Supabase db push was run.
- No backfill or provisioning occurred.
- Do not treat this as admin-editable product mode.
- Do not treat this as signup product-mode capture.

Product Mode Surface Hints V0 closeout snapshot (2026-05-10):

- Product Mode Surface Hints V0 is implemented as a presentation-only follow-up.
- HVAC Service copy is slightly more service/work-order oriented on approved shell, admin, and `/jobs/new` surfaces.
- ECC/HERS and Hybrid preserve contractor/ECC relevance and Hybrid All-in-One access.
- Product mode continues to control workflow relevance/defaults only.
- No security/RLS/auth scope changes, role/permission changes, entitlement/tier enforcement, report dataset/calculation changes, billing/payment/QBO changes, contractor-authority changes, or hard route blocking were introduced.

HVAC Service Surface Cleanup V1 closeout snapshot (2026-05-10):

- HVAC Service Surface Cleanup V1 is implemented as a presentation-only follow-up.
- HVAC Service mode now de-emphasizes ECC/compliance-first breadcrumbs and keeps service/work-order language primary on approved admin and `/jobs/new` surfaces.
- Contractor/subcontractor collaboration tools remain available and were repositioned as optional/advanced within HVAC Service admin surfaces.
- No functionality was deleted and direct routes remain reachable.
- No permissions/security/RLS/auth scope, contractor-authority, billing/payment/QBO, report dataset/calculation, or Product Mode schema/provisioning behavior changed.

HVAC Service Ops First Impression + Shared Notes De-Emphasis V1 closeout snapshot (2026-05-12):

- Implemented as a mode-aware presentation polish for HVAC Service-first operations and job detail readability.
- In `hvac_service` mode on `/ops`, primary contractor filter/search presentation is replaced by Team Work Snapshot + Work by Technician, while existing job search remains available.
- HVAC Service scope language on the Ops surface is team/work oriented where applicable.
- ECC/HERS contractor filter/search behavior and contractor-related links/query params are preserved.
- Hybrid / Master / All-in-One broad behavior is preserved (including contractor visibility).
- On `/jobs/[id]`, HVAC Service keeps Timeline and Internal Notes / Team Notes visible.
- Shared Notes is now hidden on internal `/jobs/[id]` across internal modes; it was not deleted from data history and contractor portal behavior remains unchanged.
- `job_events` remains source-of-truth narrative history with no behavior changes.
- Validation recorded:
   - TypeScript passed: `npx.cmd tsc --noEmit`.
   - Browser smoke passed for HVAC Service, ECC/HERS, and Hybrid / Master / All-in-One expected behavior.
   - No console/hydration issues were reported.
- Explicit non-changes:
   - no schema or migration work
   - no Supabase command work
   - no RLS/auth/scope changes
   - no contractor authority changes
   - no billing/payment/Stripe/QBO changes
   - no report calculation changes
   - no source-of-truth ownership change
   - no feature deletion

`/jobs/new` Product-Mode Family Visibility Tightening V1 closeout snapshot (2026-05-12):

- Internal `/jobs/new` now applies strict normal-account family presentation by product mode:
   - `hvac_service`: show Service / Work Order family only.
   - `ecc_hers`: show ECC / Compliance Test family only.
   - `hybrid`: preserve both Service and ECC visibility for All-in-One/internal owner usage.
- Normal product accounts no longer render both family cards side-by-side on `/jobs/new`.
- Hidden-field safety was tightened so stale draft/query/form state cannot silently submit the wrong family for non-hybrid internal accounts.
- Shared engine behavior remains intact (no ECC or Service capability deletion).
- Future cross-family unlock for ECC accounts remains roadmap-only tier/add-on work and is not active in this implementation.
- Non-change boundaries preserved: no schema/migration/Supabase/RLS/auth/security/source-of-truth/authority/billing/report behavior changes.

`/jobs/new` HVAC Service Contractor-Control Visibility Tightening V1 closeout snapshot (2026-05-12):

- In `hvac_service` internal intake mode only, `/jobs/new` now hides:
   - contractor assignment selector (`contractor_id` UI)
   - billing recipient contractor option (`Contractor (company)`)
- HVAC Service hidden-field safety clamps stale contractor assignment and stale contractor billing selection.
- `ecc_hers` and `hybrid` behavior is unchanged.
- No new Related Company / Source model is introduced in this slice.
- Non-change boundaries preserved: no schema/migrations/Supabase/RLS/auth/security/contractor-authority/portal-rule/notification/billing-engine/report-calculation/source-of-truth changes.

Related Companies V1 planning snapshot (2026-05-12):

- Decision: do not reuse `contractor_id` for Service-side related companies/sources.
- HVAC Service-only future scope unless explicitly expanded; ECC/HERS and Hybrid/Master behavior remains unchanged.
- V1 target: internal tracking only with account-scoped reusable related-company directory plus job/work-order relationship link.
- V1 relationship types:
   - Home Warranty Company
   - Property Manager
   - Builder
   - Realtor
   - Insurance
   - Referral Source
   - Other
- V1 allows optional contact details and notes.
- V1 excludes: portal access, authority model changes, contractor_id writes, billing behavior changes, `billing_recipient` changes, invoice/payment changes, notification behavior changes.
- Deferred: service-case/customer/location defaults, billing responsibility workflows, estimate/invoice sharing, portal access, approval workflows, notifications, external party accounts.
- Planning-only boundary: no schema changes, no migrations, no Supabase commands, no auth/RLS changes.

Product Mode Signup Links V1 closeout snapshot (2026-05-10):

- Product-specific public signup entry links are implemented.
- `/signup/service` maps the public Service signup path to internal `hvac_service`.
- `/signup/ecc` maps the public ECC / Compliance Testing signup path to internal `ecc_hers`.
- `/signup/cleaning` maps the public Cleaning / Janitorial signup path to internal `cleaning_services`.
- Generic `/signup` remains available and keeps existing broad self-serve behavior.
- Hybrid / All-in-One remains manual/operator-only; no public `/signup/hybrid` route is exposed.
- Product-mode capture happens through the existing first-owner provisioning helper and writes `account_settings.product_mode` after owner creation.
- Public signup no longer passes a hard-coded HVAC/ECC starter-kit selector; the provisioning helper chooses the product-mode default.
- `/signup/cleaning` provisions `cleaning_services` and receives the Cleaning starter Pricebook kit (`cleaning_v1`) when no explicit operator starter-kit override is supplied.
- Cleaning starter kit closeout: active defaults are General Cleaning, Deep Cleaning, Move-In / Move-Out Cleaning, Post-Construction Cleaning, Office / Commercial Cleaning, Restroom Detail / Sanitizing, Floor Cleaning, Window Cleaning, Trash / Debris Removal, Emergency / Same-Day Cleanup, Extra Labor Hour, and Supplies / Consumables.
- Cleaning inactive/deferred add-ons are Carpet Spot Treatment, Carpet Cleaning, Floor Strip / Wax / Polish, Heavy Soil / Excessive Buildup Fee, After-Hours Service, and Biohazard / Hazardous Cleanup Review.
- Cleaning fee-style starter add-ons use the existing supported internal Pricebook `adjustment` item type; `Extra Labor Hour` remains an internal `service` with Labor category/hour unit, and `Supplies / Consumables` remains internal `material`.
- High Dusting, Wall Spot Cleaning, Interior Glass Cleaning, Refrigerator Interior Cleaning, Oven Interior Cleaning, and Cabinet Interior Cleaning are intentionally omitted from this lean starter kit and remain future detail/checklist/appliance-detail work.
- Product-mode write/capture failure prevents product-specific signup from presenting a ready/success state.
- No tier/add-on enforcement, billing/payment/QBO behavior, security/RLS authority, contractor authority, report dataset/calculation behavior, or Product Mode schema changed. First Owner Provisioning behavior changed only for omitted starter-kit selection, which is now product-mode-aware.

Pricebook CSV Import V1 closeout snapshot:

- Admin Pricebook now includes `Import services and add-ons`.
- The downloadable CSV template uses friendly headers: `Service Name,Category,Kind,Unit,Price,Active,Description`.
- Friendly CSV `Kind` values map to existing internal Pricebook types: Service and Labor import as `service`, Material imports as `material`, and Fee imports as `adjustment`.
- CSV import is shared across product modes and is not Cleaning-only.
- Import preview groups rows as `Ready to add`, `Already exists`, and `Needs review`.
- Confirm import inserts only valid new rows, re-checks duplicates by normalized Service Name, and skips existing items.
- Imported rows are normal account-owned custom Pricebook items: `is_starter=false`, no starter `seed_key`.
- The import does not create jobs, invoices, charges, payments, checklist tasks, recurring services, crews, or dispatch records.
- No schema, RLS/auth/security, billing/payment, reporting, entitlement, or product-mode logic changes were introduced.

Product Choice Signup Landing V1 closeout snapshot (2026-05-10):

- Public `/signup` now shows a product-choice landing instead of an ambiguous generic signup form.
- Three public cards are exposed: SERVICE, ECC, and CLEANING.
- SERVICE routes to `/signup/service`; ECC routes to `/signup/ecc`; CLEANING routes to `/signup/cleaning`.
- Existing `/signup/service`, `/signup/ecc`, and `/signup/cleaning` behavior remains unchanged.
- Hybrid remains manual/operator-only and no public `/signup/hybrid` signup path is exposed.
- No tier/add-on enforcement, billing/payment/QBO behavior, security/RLS authority, or contractor-authority behavior changed.

### 6.3 Sandbox migration apply closeout (2026-05-09)

Execution guardrail and environment facts:

- Initial guarded attempt correctly stopped when production ref `ornrnvxtwwtulohqwxop` was detected.
- No writes occurred during that stopped production-linked attempt.
- Corrected pass relinked to sandbox ref `kvpesjdukqwwlgpkzfjm`.
- Branch was `main` and worktree was clean.

Pre-apply scope and dependency checks:

- Migration `20260509120000_account_settings_product_mode_v1.sql` was pending only in sandbox before apply.
- Dependency preflight checks passed:
   - `public.set_updated_at` exists.
   - `public.current_internal_account_owner_id` exists.
   - `public.account_settings` did not already exist in conflicting shape.

Sandbox apply commands (executed in order):

- `supabase db push --linked --dry-run`
- `supabase db push --linked`

Post-apply verification passed:

- `public.account_settings` exists.
- Expected columns exist.
- PK/check/FKs are present.
- RLS is enabled.
- SELECT policy `account_settings_select_account_scope` exists and is scoped by `current_internal_account_owner_id()`.
- Trigger `account_settings_set_updated_at` exists and uses `set_updated_at`.
- Migration list shows local/remote applied for `20260509120000`.

Browser smoke passed:

- `/jobs/new` loads.
- Owner/hybrid current account defaults ECC.
- Service remains manually selectable.
- Switching back to ECC works.

Skipped checks (intentional risk control):

- Optional allowed-values mutation test was skipped to avoid extra mutation risk.
- Cross-account HVAC/ECC fixture smoke was skipped because fixture/account context switching was unavailable.

Production remained untouched:

- No production migration.
- No production db push.
- No production writes.
- No env, feature-flag, or provisioning changes.

### 6.4 Sandbox row validation closeout (2026-05-10)

Sandbox row validation executed as a controlled pass to verify the `account_settings` resolver works correctly with explicit product_mode rows.

Environment facts:

- Sandbox Supabase ref confirmed: `kvpesjdukqwwlgpkzfjm`.
- Production ref `ornrnvxtwwtulohqwxop` remained untouched.
- Branch: `main`, git status: clean throughout.
- No code changes, no new migrations, no Vercel/production actions.

Pre-mutation discovery (read-only):

- Identified 3 sandbox accounts with discoverable internal users:
  - One hybrid-mode test fixture (classified: OWNER-HYBRID)
  - One multi-user fixture with contractors (classified: ECC-FIXTURE)
  - One third account (OWNER-HYBRID-C, reserved for future validation)
- All accounts had display_name = "Compliance Matters" per signal fallback.
- All accounts had explicit_product_mode = NULL (table empty at start).

Controlled row mutations (sandbox-only):

- Executed: `INSERT INTO public.account_settings (account_owner_user_id, product_mode) VALUES (OWNER-HYBRID, 'hybrid'), (ECC-FIXTURE, 'ecc_hers') ON CONFLICT (account_owner_user_id) DO UPDATE SET product_mode = EXCLUDED.product_mode`.
- Scope: Two explicit account_owner_user_id values only; no wildcards, no bulk updates.
- Result: 2 rows inserted successfully on 2026-05-10 05:02:58 UTC.

Post-mutation verification (read-only):

- Confirmed 2 exact rows existed with correct values:
  - OWNER-HYBRID: product_mode = 'hybrid' ✓
  - ECC-FIXTURE: product_mode = 'ecc_hers' ✓
- Verified resolver chain using SQL:
  - OWNER-HYBRID and ECC-FIXTURE correctly resolved to explicit values (explicit row read priority).
  - OWNER-HYBRID-C (no explicit row) still correctly resolved to 'hybrid' via signal fallback.
- No unintended rows created; no adjacent accounts affected.

Browser smoke (partial):

- `/jobs/new` loaded successfully when authenticated as ECC-FIXTURE account.
- Form rendered STEP 1 customer selection correctly.
- Job Family (ECC/Service radio) section was correctly gated behind customer/location completion (expected behavior).
- Confirmed no errors or migration-related issues on form load.

Skipped checks (documented scope limitations):

- HVAC Service fixture smoke: Skipped because no suitable HVAC fixture account exists in sandbox (requires non-default display_name).
- Cross-account browser switching: Skipped because only one active session available.
- Contractor-session smoke: Skipped because no contractor auth session active in current browser.
- Full job-family default verification: Partially deferred because form requires customer selection unlock before job family radios render; customer selection workflow not completed in this pass.
- Draft jobType persistence: Skipped because requires full job creation workflow; deferred to future validation.

Production verification:

- No production migration applied.
- No production db push executed.
- No production account_settings rows created/modified.
- No Vercel env vars changed.
- No feature flags enabled/disabled.
- No provisioning executed.
- Git status: clean, no commits made.

Rollback readiness:

- Pre-mutation state preserved: account_settings table was empty before insertions.
- Rollback procedure if needed: `DELETE FROM public.account_settings;` or `UPDATE public.account_settings SET product_mode = NULL;`
- Fallback behavior verified to work correctly for accounts without explicit rows.

Validation verdict:

- Resolver chain works correctly: explicit account_settings rows are prioritized, fallback works for rowless accounts.
- account_settings table schema, RLS, and trigger are stable.
- /jobs/new form renders without errors.
- Sandbox-only mutation was controlled, scoped, and verifiable.
- Production remained untouched.
- No regressions detected in partial browser validation.

Future validation (recommended):

- Complete cross-account browser smoke with proper HVAC/Hybrid/ECC fixtures when multi-account session switching is available.
- Verify job-family default selection (ECC vs Service) matches product_mode on form unlock.
- Test draft jobType persistence (ensure draft selection is not overwritten by product_mode default).
- Test contractor-portal behavior unchanged for contractor-role users.
- Create HVAC Service fixture account with non-default display_name for HVAC smoke validation.

### 6.5 Provisioning capture Slice 1 (implemented, 2026-05-10)

Product mode capture should be phased, with the first implementation surface being First Owner Provisioning, not public signup.

Current implementation status:

1. **Phase 1: First Owner Provisioning (implemented)**
   - First Owner Provisioning script supports `--product-mode` with allowed values `hvac_service`, `ecc_hers`, `hybrid`, `cleaning_services`
   - Invalid `--product-mode` is rejected by parser
   - Apply mode requires valid `--product-mode` and blocks apply when missing
   - Product mode is written to `account_settings.product_mode` during provisioning apply, after owner/account identity is resolved and before invite send
   - Account settings write failure blocks completion and prevents invite send
   - Dry-run remains non-mutating and reports product-mode capture readiness
   - Dry-run preview reports whether account_settings would be created, patched, or confirmed
   - See `docs/ACTIVE/First_Owner_Provisioning_Runbook.md` section 11 for operational details

2. **Phase 2: Public signup capture (later)**
   - Public signup at `/signup` supports three customer paths:
     - HVAC Service (`hvac_service`)
     - ECC (`ecc_hers`, customer-facing as "ECC")
     - Cleaning / Janitorial (`cleaning_services`)
   - Hybrid (`hybrid`) remains manual/internal/sales-assisted only during this phase
   - Signup routing may eventually be:
     - `/signup/service`
     - `/signup/ecc`
     - `/signup/cleaning`
     - or single `/signup` with choice page
   - Customer-facing "ECC" label maps to internal stored value `ecc_hers` until future internal rename/migration phase

3. **Phase 3: Admin configuration (later)**
   - Admin/company setup should start with read-only product_mode display only
   - Admin edit UI is later and must be guarded with explicit approval
   - Customer-initiated mode changes require admin authority gates

Fallback and safety rules:

- Missing `product_mode` should continue to fall back safely (signal-based defaults remain functional)
- Missing `product_mode` must not block login, signup, invites, or reports
- In Slice 1 implementation, missing `product_mode` blocks provisioning apply (not user/account functionality)

Separation of concerns:

- `product_mode` controls workflow relevance and default job/work-order types only
- `plan_tier` controls package level (starter, growth, pro, etc.)
- `entitlements` / `add-ons` control feature availability and write access (e.g., estimates, SMS, contractor portal)
- `billing_mode` controls invoice workflow behavior (internal_invoicing vs external_billing)
- `feature_flags` control rollout safety and optional behavior gates
- Starter-kit selection is product-mode-aware only at provisioning default time: `cleaning_services` defaults to `cleaning_v1`; `hvac_service`, `ecc_hers`, `hybrid`, and missing product mode continue to default to v3. Explicit operator `--starter-kit-version v1|v2|v3` still overrides the default.
- None of these concepts are equivalent and must remain separate in both planning and implementation

Special case: Angkor Heating and Air

- Angkor Heating and Air should later be assigned `hvac_service` during approved onboarding/provisioning
- No onboarding, provisioning, invites, or account changes happen for Angkor in current timeframe
- Angkor remains a reference account for non-mode-aware legacy behavior during Phase 1/2

Production readiness requirement:

- Production `account_settings` migration prerequisite is satisfied (`20260509120000_account_settings_product_mode_v1.sql` applied)
- Provisioning product_mode writes remain operator-runbook controlled and approval-gated
- This slice does not perform backfill or existing-account product_mode writes

Non-actions (scope out of Phase 1):

- No tier/add-on enforcement based on product_mode
- No signup billing/payment flow changes (trial/payment flow remains separate from product_mode)
- No feature-flag enables as part of product_mode capture
- No automatic contractor portal hiding (mode separation remains presentation-level only)
- No report dataset changes (shared report engine remains unchanged; mode-aware presets are later)

### 6.6 Production migration execution closeout (completed, 2026-05-10)

Execution scope and target:

- Production ref: `ornrnvxtwwtulohqwxop`.
- Isolated apply worktree: `C:/Users/eddie/hvac-saas-productmode-dryrun`.
- Applied migration only: `supabase/migrations/20260509120000_account_settings_product_mode_v1.sql`.
- Final pre-apply dry-run targeted only `20260509120000`.
- Apply completed with exit code `0`.

Post-apply verification (read-only) passed:

- `public.account_settings` exists.
- Expected columns exist: `account_owner_user_id`, `product_mode`, `product_mode_updated_at`, `product_mode_updated_by_user_id`, `created_at`, `updated_at`.
- PK on `account_owner_user_id` exists.
- FK `account_owner_user_id -> auth.users` exists.
- FK `product_mode_updated_by_user_id -> auth.users` exists.
- Allowed-values check for `product_mode` includes `hybrid`, `hvac_service`, `ecc_hers`, and nullable behavior.
- RLS is enabled.
- Policy `account_settings_select_account_scope` exists.
- Trigger `account_settings_set_updated_at` exists.
- Row count is `0`.
- Migration history shows `20260509120000` applied.

No-write smoke passed:

- `/jobs/new` loads for internal user.
- Existing default/manual ECC and Service selection behavior remains stable.
- `/estimates` behavior remains unchanged.
- Support/People & Access workspace remains unchanged.
- No admin product-mode edit UI appears.
- No signup product-mode capture appears.
- Contractor admin/access flows appear unchanged.

Warnings and watch items:

- Idempotent trigger/policy drop notices were expected and benign during apply.
- Intermittent `net::ERR_ABORTED` browser navigation requests appeared, but destination pages loaded and smoke checks passed.
- Supabase CLI update notice appeared during command output.

Boundaries preserved:

- No `account_settings` rows created.
- No backfill.
- No owner Hybrid row written.
- No customer account product-mode rows created.
- No signup capture enablement.
- No admin edit UI enablement.
- No tier/add-on enforcement.
- No navigation/report/starter-kit behavior changes.
- No billing/payments changes.
- No contractor authority changes.
- No Estimates behavior changes.
- No Support Console behavior changes.
- No Vercel env/flag changes.

Provisioning dependency remains unchanged:

- First Owner Provisioning `--product-mode` capture remains a separate later phase and does not imply backfill in this migration window.

## 7. Signup Flow Concepts

Possible future signup approaches:

1. One signup page with an explicit choice:
   - "I run a compliance testing/HERS business"
   - "I run an HVAC service company"
2. Separate signup routes, for example:
   - `/signup/ecc`
   - `/signup/service`

Clarifications:

- Actual routes are not implemented now.
- Final route names can be decided later.

## 8. Setup Checklist Differences

Future onboarding/setup should emphasize different priorities by version.

ECC/HERS setup emphasis:

- company profile
- contractors
- contractor users
- test workflows
- permit/cert closeout
- compliance reports

HVAC Service setup emphasis:

- company profile
- internal team/technicians
- customers/locations
- pricebook/work items
- calendar/dispatch
- invoice/payment tracking
- service reports

## 9. Navigation/Admin/Report Implications

Future mode-aware behavior should follow these rules:

- ECC/HERS keeps Contractors / Contractor Intake / Tests / Retests / Compliance Closeout emphasis
- HVAC Service favors Team / Technicians / Dispatch / Work Orders / Service Cases / Work Items
- reports should eventually provide mode-aware presets
- admin should eventually hide/de-emphasize mode-irrelevant cards

This is a future presentation/configuration pass, not a current implementation requirement.

## 10. Portal Boundary

Current portal model is contractor-focused.

Rules:

- ECC/HERS version treats contractor portal/intake as relevant workflows, with final enablement controlled by tier/add-on/entitlement policy.
- HVAC Service version should not show contractor portal/intake by default.
- No customer portal is included in current scope.
- Any future customer portal requires customer/location-scoped visibility and separate design.
- Current sticky menu behavior: show the `Compliance Matters Portal` nav entry only when a user has active paid/internal app access and valid ECC/contractor portal access. Do not show that redundant nav entry to portal-only/non-paid users already in `/portal`.
- Current portal access resolver accepts current `contractor_users` membership and legacy active `contractors.owner_user_id = auth user id` owner mapping. Payment/entitlement status must not hide valid portal access, and valid portal access must not grant internal app authority.

## 11. Relationship to Upcoming Estimates / Quoting

Estimates / Quoting V1 can proceed before full signup/product_mode implementation.

Planning rules:

- Estimates should be planned as shared/service-first while respecting product separation rules.
- HVAC Service likely uses estimates as a core workflow.
- ECC/HERS may use estimates optionally for service/add-on/commercial work.

This preserves current release-scope boundaries while enabling forward planning.

## 12. Implementation Sequence Recommendation

Recommended future implementation order:

1. Product Mode Signup Spec (this document)
2. Product Mode V1 Slice 1 temporary resolver/default seam (completed)
3. Product Mode V2 account settings read path (`account_settings.product_mode`, nullable)
4. Add safe defaults such as `/jobs/new` default by product mode via resolver order
5. Add read-only admin product-mode display
6. Add signup choice/routes later
7. Add mode-aware navigation/admin/report/starter-kit behavior later
8. Add admin mutation UI and tier/add-on enforcement later

## 13. Non-Goals

Note: non-goals below are the original planning-slice non-goals for this spec document; see Section 6.2 for implemented closeout facts.

Out of scope for this slice:

- no schema changes
- no signup route implementation
- no `product_mode` field implementation
- no navigation rewrite
- no contractor portal removal
- no customer portal work
- no Estimates production enablement
- no payment/SMS/QBO work
- no codebase split

## 14. Owner Signup Visibility V1 Closeout

- Owner Signup Visibility V1 is implemented as an allowlisted observability slice and is not a Hybrid tenant feature.
- Best-effort owner notification now runs after successful signup provisioning and invite orchestration attempt; notification failure is non-blocking.
- Read-only Platform Owner Dashboard route is `/ops/owner-console`.
- Dashboard authority is env allowlist based (`PLATFORM_OWNER_EMAILS`, optional `PLATFORM_OWNER_USER_IDS`) and fails closed when allowlist envs are empty/missing.
- Notification recipient uses `PLATFORM_OWNER_SIGNUP_NOTIFY_EMAIL` with fallback to first valid `PLATFORM_OWNER_EMAILS` value.
- Platform owner authority is not derived from `product_mode`, including `hybrid`.
- Scope boundaries preserved: not Support Console, no impersonation, no support-side mutation, no tenant data editing, no product-mode editing, no billing/payment/QBO/security/RLS behavior changes.

## Cross-Reference Notes

This spec aligns with:

- [Compliance_Matters_Business_Layer_Roadmap.md](./Compliance_Matters_Business_Layer_Roadmap.md)
- [Owner_Led_Go_Live_Readiness_Addendum.md](./Owner_Led_Go_Live_Readiness_Addendum.md)
- [Release_Scope_Lock_and_Post_Launch_Roadmap.md](./Release_Scope_Lock_and_Post_Launch_Roadmap.md)
- [Competitive_Packaging_and_Tier_Spec.md](./Competitive_Packaging_and_Tier_Spec.md)

These references are for planning alignment only and do not activate implementation changes.

---

## Group 2 — Signup Front Door / Product Choice: Closeout Status (May 2026)

Group 2 is closed.

- `/signup` product-choice landing is live with SERVICE, ECC, and CLEANING cards.
- `/signup/service` routes to `hvac_service` provisioning path.
- `/signup/ecc` routes to `ecc_hers` provisioning path.
- `/signup/cleaning` routes to `cleaning_services` provisioning path.
- Hybrid / All-in-One remains manual/operator-only with no public signup route.
- All provisioning, product-mode capture, and notification behaviors are documented in sections 6.x above.
- No tier/add-on enforcement, billing/payment/QBO behavior, security/RLS authority, or contractor-authority behavior changed.
- Remaining signup-related work (admin edit UI, tier/add-on enforcement, full navigation/report mode rewrites) remains deferred to Groups 7 and 7A.
