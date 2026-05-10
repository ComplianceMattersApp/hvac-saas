# Compliance Matters — Release Scope Lock and Post-Launch Roadmap

Status: ACTIVE planning packet  
Mode: Documentation/planning only  
Authority: Subordinate to Active Spine and existing ACTIVE runbooks/roadmaps  
Date: 2026-05-08

---

## 1) Executive Summary

This packet locks current owner-release scope and defines a practical post-launch order.

Current release posture is confirmed as:
- ECC/HERS-first go-to-market
- HVAC Service-ready foundation on the same shared platform engine
- no codebase split
- no customer portal in current release scope
- contractor external access remains the current external model
- no product-mode switch implementation required before owner-release

Completion quality across the owner-release stack is high and coherent. Recent notification sanity returned pass with no must-fix blockers. Remaining deferred items are intentional and runbook-gated where applicable.

This packet therefore recommends:
- lock current owner-release scope as complete for current quality bar,
- keep deferred work deferred,
- use runbooks for controlled enablement only,
- start with Support V0 plus controlled onboarding,
- sequence post-launch roadmap in low-risk dependency order.

Execution companion note: for practical first-customer support posture and expansion-lane classification guardrails, see `docs/ACTIVE/Owner_Led_Go_Live_Readiness_Addendum.md`.

---

## 2) Current Owner-Release Completion Status

### 2.1 Completion matrix (current owner-release quality)

| Area | Status | Evidence summary |
|---|---|---|
| Core Ops | Complete for owner-release | Ops command center, queue projection discipline, event-backed signals, and operational reporting are documented and stabilized in ACTIVE spine/checklist docs. |
| Job lifecycle | Complete for owner-release | Lifecycle remains resolver/event driven with locked source-of-truth boundaries; queue semantics and retest chain rules are documented as stable. |
| ECC/HERS testing truth | Complete for owner-release | ECC truth remains in ecc_test_runs with ops projection via jobs.ops_status; no UI-owned lifecycle/test truth. |
| Service cases | Complete for current continuity layer | Service case as continuity container is active; service case continuity model is present and stable in active docs. |
| Customer profile continuity V1 | Complete for V1 | Canonical customer/location strategy and sync-point model are documented and active; continuity is established at V1 level. |
| Contractor portal | Complete for owner-release scope | Contractor-focused external surface is active with correction/retest flow and status-safe wording boundaries. |
| Calendar/scheduling | Complete for owner-release | Calendar polish and guardrails complete for current scope; scheduling remains projection/display discipline aligned. |
| Notifications | Complete (PASS) | Final sanity pass: pass, no must-fix issues; optional hardening remains future/non-blocking. |
| Reports / decision surfaces | Complete for owner-release | Report center and invoice/payment tracking honesty alignment documented and stabilized. |
| Admin/setup | Complete for owner-release | Admin and setup polish complete; owner/operator readiness runbook path exists. |
| Invoice/payment tracking honesty | Complete for current scope | Payments are tracking truth only; no live tenant payment execution implied; wording boundaries remain explicit. |
| Product-mode matrix documentation | Complete | Matrix documented as shared-engine, presentation/configuration direction without pre-release switching requirement. |
| Mobile/PWA baseline | Complete baseline | Installability baseline and route/access smoke documented; offline/native packaging remains deferred. |
| First-owner/operator readiness runbook | Complete as controlled runbook | First-owner provisioning runbook is active with strict guardrails, dry-run/apply gates, and verification checklist. |

### 2.2 Completion interpretation

Owner-release completion means stable, honest, and supportable for current market posture, not that every future module is enabled.

---

## 3) Locked Release Scope List

The following is now locked as in-scope for owner-release quality:

1. Operations-first platform with event-backed operational truth.
2. ECC/HERS-first external posture with contractor-focused collaboration.
3. HVAC Service-ready foundation on same engine (not separate product codebase).
4. Shared source-of-truth model:
   - job_events for narrative/operational history,
   - ecc_test_runs for ECC truth,
   - jobs.ops_status as projection,
   - service_cases as continuity container,
   - jobs as visit/execution unit.
5. Internal ops action ownership in queues/workspaces, with notifications as awareness (not queue replacement).
6. Customer/location continuity V1 behavior and snapshot sync-point strategy.
7. Reports/decision surfaces and invoice/payment-tracking honesty at current non-execution boundary.
8. Admin/setup and first-owner/operator controlled readiness path.
9. Mobile/PWA baseline installable web posture.

Release scope lock statements:
- No codebase split.
- No product-mode switch implementation required before owner-release.
- No customer portal in current release scope.
- Contractor external access remains current external model.

---

## 4) Deferred and Parked Items

The following remain intentionally deferred/parked (not blockers for owner-release):

1. Estimates production enablement (runbook-gated; currently disabled in production).
2. Support Console production enablement (runbook-gated; currently disabled).
3. First-owner provisioning apply/invites outside controlled runbook operation.
4. Tenant customer payment execution (online checkout/payment rail at tenant invoice layer; later Stripe-first invoice acceptance, separate from platform subscription billing).
5. QBO integration (last-last, optional downstream accounting sync/export only).
6. Recurring services / maintenance agreements (customer-owned agreement V1; manual prep only; no automatic job generation).
7. Customer portal (requires separate customer/location-scoped external visibility design).
8. Service worker/offline/native app-store packaging.
9. Product-mode configuration next slices (admin mutation/edit UI, signup capture, tier/add-on enforcement, and full mode-aware navigation/report/starter-kit behavior).
10. Mode-aware navigation rendering.
11. Mode-aware starter kits.
12. Mode-aware report presets.
13. Additional ECC test expansion beyond current accepted scope.
14. Full case-level timeline / case_events expansion.
15. Notification test expansion / badge optimization hardening.
16. Broad performance campaign unless daily use surfaces specific real issues.

Deferred means intentionally sequenced later, not ignored.

Product Mode V2 boundary note:

- Product mode should live in dedicated account-level settings (likely `account_settings`).
- `product_mode` values are `hybrid`, `hvac_service`, `ecc_hers`.
- First implementation keeps `product_mode` nullable for safe rollout.
- Resolver order should be: real account setting, temporary Slice 1 override, signal fallback, safe default.
- Product mode controls workflow relevance/defaults only.
- Product mode must not control billing/payments, RLS/security, source-of-truth ownership, contractor authority, report datasets/calculations, tier/add-on enforcement, or feature flags.
- Admin mutation/edit UI, signup capture, tier/add-on enforcement, and full navigation/report rewrites remain later.

Product Mode V2 Slice 1 and ECC naming Phase 1 closeout note:

- Product Mode V2 Slice 1 is implemented in commit `c42f4a2`.
- ECC Naming Phase 1 is implemented in commit `6680ba8`.
- Implemented V2 Slice 1 behavior:
   - resolver now reads real `account_settings.product_mode` first
   - fallback order remains: real setting -> temporary Slice 1 override -> signal fallback -> safe default
   - mapping remains: `hybrid` -> ECC default, `ecc_hers` -> ECC default, `hvac_service` -> Service default
   - contractor mode unchanged
   - draft `jobType` still wins
   - ECC and Service remain selectable
- Implemented ECC naming Phase 1 behavior:
   - visible user-facing/product copy now prefers "ECC" where this phase applied
   - internal value `ecc_hers` remains intentionally unchanged
   - `ProductMode` type remains intentionally unchanged
   - `account_settings.product_mode` constraint remains intentionally unchanged
   - resolver logic remains unchanged by naming cleanup
   - internal enum/data migration remains deferred to a future Phase 2
- Explicit non-actions:
   - no production migration applied
   - no Supabase db push run
   - no backfill or provisioning
   - no implication that product_mode is editable in admin yet
   - no implication that signup mode capture exists yet

Product Mode V2 sandbox migration apply closeout note:

- Guarded initial attempt correctly stopped when production ref `ornrnvxtwwtulohqwxop` was detected, with no writes.
- Corrected pass relinked to sandbox ref `kvpesjdukqwwlgpkzfjm`.
- Branch/worktree state was `main` with clean status.
- Before apply, migration `20260509120000_account_settings_product_mode_v1.sql` was pending only in sandbox.
- Dependency preflight checks passed:
   - `public.set_updated_at` exists
   - `public.current_internal_account_owner_id` exists
   - `public.account_settings` did not already exist in conflicting shape
- Sandbox apply commands executed:
   - `supabase db push --linked --dry-run`
   - `supabase db push --linked`
- Post-apply verification passed:
   - `public.account_settings` exists
   - expected columns exist
   - PK/check/FKs present
   - RLS enabled
   - SELECT policy `account_settings_select_account_scope` exists and is scoped by `current_internal_account_owner_id()`
   - trigger `account_settings_set_updated_at` exists and uses `set_updated_at`
   - migration list shows local/remote applied for `20260509120000`
- Browser smoke passed for `/jobs/new` load and default toggling behavior:
   - owner/hybrid current account defaults ECC
   - Service remains manually selectable
   - switching back to ECC works
- Intentionally skipped checks:
   - optional allowed-values mutation test (extra mutation risk avoidance)
   - cross-account HVAC/ECC fixture smoke (no fixture/account context switch available)
- Production remained untouched:
   - no production migration
   - no production db push
   - no production writes
   - no env/feature-flag/provisioning actions

Product Mode V2 sandbox row validation closeout note:

- Sandbox Supabase ref confirmed: `kvpesjdukqwwlgpkzfjm`.
- Production ref `ornrnvxtwwtulohqwxop` remained untouched.
- Branch: `main`, git status: clean.
- Read-only discovery identified 2 usable test fixtures (Hybrid fixture, ECC fixture).
- Controlled upsert: `INSERT INTO public.account_settings (account_owner_user_id, product_mode) VALUES (...) ON CONFLICT (...) DO UPDATE ...` for 2 explicit account UUIDs.
- Mutation result: 2 rows inserted with correct values ('hybrid', 'ecc_hers') on 2026-05-10 05:02:58 UTC.
- Post-mutation verification passed:
   - exactly 2 rows exist with expected values
   - Hybrid fixture: product_mode = 'hybrid' ✓
   - ECC fixture: product_mode = 'ecc_hers' ✓
   - resolver correctly prioritizes explicit rows
   - rowless accounts still use signal fallback ✓
- Browser smoke (partial): `/jobs/new` loaded, form rendered without errors, job family section correctly gated behind customer selection.
- Skipped checks (documented scope limitations):
   - HVAC Service fixture smoke (no HVAC fixture account in sandbox)
   - Cross-account browser switching (single session only)
   - Contractor-session smoke (no contractor auth available)
   - Full job-family default verification (requires customer selection workflow; partial validation only)
   - Draft jobType persistence (requires full job creation; deferred)
- Production verification: no migration, no db push, no writes, no env/flag/provisioning changes.
- Rollback readiness: pre-mutation state preserved; DELETE/UPDATE procedures documented if needed.
- Validation verdict: Resolver chain works correctly; schema/RLS/trigger stable; `/jobs/new` renders without errors; sandbox-only mutation controlled and verifiable; production untouched; no regressions detected.

Product Mode Provisioning Capture Planning note:

- Product mode capture should be phased, with First Owner Provisioning as the first implementation surface (before public signup capture).
- Phase 1 (First Owner Provisioning): script should require `--product-mode hvac_service|ecc_hers|hybrid` and write to account_settings during apply. Missing/invalid values should block apply only (not user/account functionality).
- Phase 2 (Public signup): `/signup` will eventually support two paths (HVAC Service, ECC). Hybrid remains manual/internal/sales-assisted only. Customer-facing "ECC" maps to internal `ecc_hers` until future rename/migration.
- Phase 3 (Admin configuration): read-only display first; edit UI later and guarded.
- Separation: product_mode controls workflow relevance/defaults only; plan_tier controls package level; entitlements/add-ons control feature availability; billing_mode controls invoice workflow; feature_flags control rollout safety. These remain independent.
- Safety: missing product_mode continues to fall back safely (signal-based defaults); missing product_mode must not block login/signup/invites/reports.
- Future: Production account_settings migration must be applied before production provisioning/signup writes product_mode values. Sandbox validation complete; production migration and validation remain future work.
- Angkor Heating and Air: should later be assigned hvac_service during approved onboarding/provisioning, but no onboarding/provisioning/invites happen now.
- Non-actions in Phase 1: no tier/add-on enforcement, no signup payment/trial flow changes, no feature-flag enables, no automatic contractor portal hiding, no report dataset changes.
- See `docs/ACTIVE/Product_Mode_Signup_Spec.md` section 6.5 for full provisioning capture planning details.
- See `docs/ACTIVE/First_Owner_Provisioning_Runbook.md` section 11 for future Phase 1 implementation planning.

---

## 5) Runbook-Gated / Controlled Enablement Items

The following are explicitly runbook-gated and must remain controlled:

1. Estimates production enablement
   - Controlled by Estimates production enablement runbook
   - Internal-only boundaries; feature flags and migration gates required
2. Support Console production enablement
   - Controlled by Support Console runbook
   - V1 read-only, account-scoped, no impersonation, no tenant mutation
3. First Owner Provisioning
   - Controlled by first-owner provisioning runbook
   - Dry-run first, guarded apply, environment verification gates
4. Platform subscription billing/Stripe where applicable
   - Platform account subscription slice is live-smoke confirmed
   - Tenant customer payment execution remains deferred and separately gated
5. Any production flag enablement
   - Must remain evidence-backed, gate-approved, and rollback-ready

---

## 6) New-User Support Model (V0 / V1 / V2)

### Support V0 (launch/manual support)

Purpose: launch-safe manual support without additional platform risk.

Components:
1. Support contact channel:
   - support email
   - support phone
2. Admin setup checklist for first deployments.
3. Issue reporting template (minimum required fields: account, route, timestamp, user role, expected vs actual).
4. White-glove manual help by internal team.
5. Strict boundaries:
   - no impersonation,
   - no support-side mutation,
   - no Support Console required.

Definition of done for V0:
- documented contact process,
- documented triage flow,
- documented escalation owner,
- documented response-time targets,
- reusable issue intake template available.

### Support V1 (read-only support console)

Purpose: reduce support friction while preserving strict safety boundaries.

Requirements:
1. Runbook-gated production enablement only.
2. Read-only access model only.
3. Account-scoped grant model.
4. No impersonation.
5. No tenant mutation.
6. Complete audit trail for start/view/end support session events.

Enablement condition:
- only when V0 load/latency justifies operational need and runbook gates are green.

### Support V2 (in-app support intake)

Purpose: improve signal quality and reduce back-and-forth for issue capture.

Scope:
1. In-app Report Issue entry point.
2. Auto-captured route/page context.
3. Structured issue metadata (role, account, browser/device basics, timestamp).
4. Optional screenshot/upload extension later.
5. Routing to support queue/email.
6. Same safety boundary: no mutation unless explicitly designed/approved later.

Implementation note:
- V2 intake augments support workflow; it does not imply support write authority.

---

## 7) Post-Launch Roadmap Order (Recommended)

Recommended order after owner-release:

1. Support V0 documentation/readiness closeout — **complete.** See `docs/ACTIVE/Support_V0_Operational_Readiness_Pack.md` for the full pack (contact SOP, intake template, severity matrix, escalation tree, engineering handoff template, daily review checklist, launch-week cadence, boundaries, and tester onboarding acceptance checklist).
2. Controlled first tester onboarding.
3. Read-only Support Console V1 only if/when support load justifies it.
4. Estimates production enablement (internal-only runbook execution).
5. Recurring services / maintenance agreements (customer-owned agreement V1; manual prep only; no automatic job generation).
6. Tenant customer payment execution.
7. QBO integration last-last (optional downstream accounting sync/export only).
8. Product-mode configuration layer (settings/visibility/presets).
9. Customer portal only if explicitly reopened.
10. Native/offline/app-store packaging later.

Ordering rationale:
- support safety first,
- controlled adoption second,
- operational/commercial expansion next,
- accounting sync and broader packaging last.

---

## 8) Remaining Risks and Unknowns

1. Support operational process readiness
   - Risk: ad-hoc support variance without clear intake/escalation discipline.
   - Mitigation: Support V0 SOP artifacts are now documented in `docs/ACTIVE/Support_V0_Operational_Readiness_Pack.md`.

2. Product-mode buyer-story drift
   - Risk: ECC/HERS and Service narratives blur in UX or roadmap language.
   - Mitigation: continue using product-mode matrix as planning guardrail until mode settings are implemented.

3. Daily-use performance variance
   - Risk: backend/network variance causes intermittent latency spikes.
   - Mitigation: measured, surgical performance follow-up only when user-visible issues appear.

4. Deferred payment expectations
   - Risk: users infer live payment execution from invoice/payment surfaces.
   - Mitigation: preserve strict wording honesty and explicit payment-tracking-only boundaries until P2 execution.

5. First-owner provisioning gates
   - Risk: uncontrolled apply/invite use outside runbook.
   - Mitigation: keep provisioning operator-controlled with dry-run/apply discipline.

6. Support Console gates
   - Risk: pressure to bypass runbook and enable quickly.
   - Mitigation: no-go unless all governance/migration/grant/smoke/audit gates pass.

7. Estimates gates
   - Risk: enablement pressure before migration/flag/smoke controls are satisfied.
   - Mitigation: runbook-first, internal-only boundaries, immediate rollback readiness.

---

## 9) Recommended Documentation Update Approach

Recommendation: both.

1. Create this dedicated release packet doc (this file) as the canonical lock/scope/roadmap artifact for current owner-release decisioning.
2. Keep existing foundational docs as source authority and update them only for small cross-reference continuity when needed.

Why both:
- Existing docs remain deep domain/runbook authorities.
- A dedicated packet gives leadership/support/release stakeholders one concise decision surface for current scope lock and post-launch order.

Cross-reference recommendation (future docs-only slice):
- Add a one-line pointer from prelaunch checklist and active spine status note to this packet.
- Add a one-line pointer to [Competitive_Packaging_and_Tier_Spec.md](./Competitive_Packaging_and_Tier_Spec.md) for mode-vs-tier-vs-add-on packaging separation guidance.

---

## 10) Documentation Prompt History

The following prompt was used for the Support V0 Operational Readiness Pack slice (complete):

"Create a docs-only Support V0 Operational Readiness Pack in docs/ACTIVE with no code changes. Include:
1) support contact SOP,
2) intake/triage template,
3) severity matrix (S1-S4),
4) response-time targets,
5) escalation tree,
6) handoff template to engineering,
7) daily support review checklist,
8) launch-week support staffing cadence,
9) boundaries (no impersonation, no support mutation),
10) acceptance checklist for controlled first tester onboarding.
Keep runbook-gated items unchanged. No schema/migration/Supabase/feature-flag changes."

Result: `docs/ACTIVE/Support_V0_Operational_Readiness_Pack.md` created. 

---

## 11) Explicit Confirmation of Non-Implementation

This packet was produced as documentation/planning audit only.

Explicitly not performed in this slice:
- no product code changes,
- no schema changes,
- no migrations,
- no Supabase commands,
- no data writes,
- no feature-flag changes,
- no onboarding/provisioning/apply/invite execution,
- no estimates production enablement,
- no support console production enablement,
- no tenant payment execution,
- no QBO work,
- no customer portal work,
- no source-of-truth rewrite.

---

## Source References Reviewed for This Packet

- docs/ACTIVE/Active Spine V4.0 Current.md
- docs/ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md
- docs/ACTIVE/Compliance_Matters_Prelaunch_Confirmation_Checklist.md
- docs/ACTIVE/First_Owner_Provisioning_Runbook.md
- docs/ACTIVE/Support_Console_Production_Enablement_Runbook.md
- docs/ACTIVE/Estimates_Production_Enablement_Runbook.md
- docs/ACTIVE/Compliance_Matters_Payments_Roadmap.md
- docs/ACTIVE/source-of-truth-strategy.md
