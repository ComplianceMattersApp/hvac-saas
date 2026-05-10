# Compliance Matters Software — Product Mode Signup Spec

Status: ACTIVE planning spec  
Authority: Subordinate to [Active Spine V4.0 Current.md](./Active%20Spine%20V4.0%20Current.md), [Release_Scope_Lock_and_Post_Launch_Roadmap.md](./Release_Scope_Lock_and_Post_Launch_Roadmap.md), and [Compliance_Matters_Business_Layer_Roadmap.md](./Compliance_Matters_Business_Layer_Roadmap.md)  
Mode: Documentation/spec only (no implementation in this slice)  
Date: 2026-05-08

## 1. Purpose

This spec defines two signup/onboarding versions on one shared Compliance Matters platform engine:

1. ECC/HERS Compliance Testing version
2. HVAC Service Company version

This is not a second app and not a codebase split.

This spec is a planning contract for future product-mode/account setup work and does not implement signup behavior in this slice.

## 2. Signup Versions

The product supports two onboarding choices for new companies:

1. ECC/HERS Compliance Testing
2. HVAC Service Company

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

## 6. Future Account-Level Product Mode

Future implementation can introduce an account-level identity setting concept such as:

- `product_mode = "ecc_hers" | "hvac_service" | "hybrid"`

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
- Allowed values remain `hybrid`, `hvac_service`, `ecc_hers`.
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
   - First Owner Provisioning script supports `--product-mode` with allowed values `hvac_service`, `ecc_hers`, `hybrid`
   - Invalid `--product-mode` is rejected by parser
   - Apply mode requires valid `--product-mode` and blocks apply when missing
   - Product mode is written to `account_settings.product_mode` during provisioning apply, after owner/account identity is resolved and before invite send
   - Account settings write failure blocks completion and prevents invite send
   - Dry-run remains non-mutating and reports product-mode capture readiness
   - Dry-run preview reports whether account_settings would be created, patched, or confirmed
   - See `docs/ACTIVE/First_Owner_Provisioning_Runbook.md` section 11 for operational details

2. **Phase 2: Public signup capture (later)**
   - Public signup at `/signup` will eventually support two customer paths:
     - HVAC Service (`hvac_service`)
     - ECC (`ecc_hers`, customer-facing as "ECC")
   - Hybrid (`hybrid`) remains manual/internal/sales-assisted only during this phase
   - Signup routing may eventually be:
     - `/signup/hvac-service`
     - `/signup/ecc`
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

## Cross-Reference Notes

This spec aligns with:

- [Compliance_Matters_Business_Layer_Roadmap.md](./Compliance_Matters_Business_Layer_Roadmap.md)
- [Owner_Led_Go_Live_Readiness_Addendum.md](./Owner_Led_Go_Live_Readiness_Addendum.md)
- [Release_Scope_Lock_and_Post_Launch_Roadmap.md](./Release_Scope_Lock_and_Post_Launch_Roadmap.md)
- [Competitive_Packaging_and_Tier_Spec.md](./Competitive_Packaging_and_Tier_Spec.md)

These references are for planning alignment only and do not activate implementation changes.