# Estimates Internal-Only Production Enablement Runbook

Status: ACTIVE EXECUTION-CONTROLLED PLANNING ARTIFACT  
Authority: Subordinate to `docs/ACTIVE/Active Spine V4.0 Current.md` and `docs/ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md`  
Scope: Production enablement procedure for Estimates V1 internal-only slice, including V1A execution closeout, V1H execution closeout, and future windows.

---

## 1. Executive summary

This runbook defines how internal-only production Estimates enablement must be executed through strict, auditable gates.

Executive readiness verdict: Ready after listed inputs.

This runbook and its companion planning docs are complete enough to schedule an internal-only enablement window, but not ready to execute until the live operator inputs are filled.

The latest clean-run Estimates rehearsal closed the earlier enabled-mode render-error report as a watch item only: the `TypeError: Cannot read properties of undefined (reading 'call')` did not reproduce in fresh captured smoke, and no code change is warranted without a real stack trace.

### Current locked status

- Estimates V1A-V1J is implemented to the current guarded internal baseline.
- Production estimates are internal-only live.
- Production estimate migrations are partially applied: V1A and V1H are applied; Product Mode remains pending.
- Production `ENABLE_ESTIMATES` is enabled (`true`) in Vercel Production only.
- Production `ENABLE_ESTIMATE_EMAIL_SEND` remains unset/false.
- Unauthenticated production access to `/estimates` and `/estimates/new` remains login-gated.
- Authenticated internal users can access `/estimates` and `/estimates/new`.
- Customer picker polish commit `235d0ce` is deployed and active in production (`/estimates/new` smart search picker).
- Estimate New Customer Assist V1 is complete on the guarded internal baseline for `/estimates/new`: existing smart customer picker behavior remains intact for existing customers, inline `+ Add Customer` adds internal-only customer/location creation fields inside the estimate flow, and estimate draft creation still links by canonical `customer_id` and `location_id` only after `Create Draft Estimate`.
- The sole pre-production code blocker (missing `createEstimateDraft` fail-closed flag check) is now resolved and committed.
- Estimates Guard Parity + Send Wording Polish closeout is complete on the guarded internal baseline (commit `edf5022`): `addEstimateLineItem` and `removeEstimateLineItem` now fail-close when `ENABLE_ESTIMATES` is false/unset, mutator tests now assert unavailable response plus no `requireInternalUser` call when gated off, and estimate detail/send-attempt wording now uses `Record Send Attempt` while preserving internal-only boundary language.
- Estimates Re-Entry audit watch item is closed for planning purposes only: the earlier enabled-mode `TypeError: Cannot read properties of undefined (reading 'call')` was not reproduced in clean captured smoke, `/estimates` and multiple `/estimates/[id]` routes returned `200`, `addLineItemAction` completed with `POST 200` twice, and no `Error`, `TypeError`, `ReferenceError`, `digest`, or `Unhandled` entry was captured. Treat this as a watch item only; do not recommend code changes without a real stack trace.
- Estimate Detail Wording + Internal Scaffolding Collapse closeout is complete on the guarded internal baseline and does not alter runbook gates, production disabled-state behavior, or deferred/non-goal boundaries.
- Estimate Pricebook Editable Defaults V1 closeout is complete on the guarded internal baseline and does not alter runbook gates, production disabled-state behavior, or deferred/non-goal boundaries.
- Customer Estimate Profile Entry V1 closeout is complete on the guarded internal baseline (commits `bcfa9f7`, `b977c89`) and does not alter runbook gates, production disabled-state behavior, or deferred/non-goal boundaries.
- Job-context Estimate Entry Wiring V1 closeout is complete on the guarded internal baseline (commit `92df487`) and does not alter runbook gates, production disabled-state behavior, or deferred/non-goal boundaries. Internal operators can now initiate estimate drafts from the job detail workspace with `customer_id`, `location_id`, `origin_job_id`, and `service_case_id` context carried into `/estimates/new`.
- Estimate Line Item Smart Entry closeout is complete on the guarded internal baseline (commit `939b04d`) and does not alter runbook gates, production disabled-state behavior, or deferred/non-goal boundaries:
	- draft estimate line-item entry now uses one unified smart-entry surface
	- users can search/select active Pricebook items or manually type estimate lines from one entry area
	- Pricebook selection can prefill estimate line name, description, type, category, unit label, quantity, and unit price
	- manual estimate lines remain supported
	- Estimate Lines remain proposed commercial scope and are not Work Items or Invoice Charges
	- no estimate email/PDF/customer approval/customer portal/conversion/payment/Stripe tenant payment/QBO behavior was added
- Estimate Internal Quote Readiness Checklist V1 is complete on the guarded internal baseline: estimate detail now includes a read-only internal checklist for customer/location context, title/scope notes readiness, line-item presence, total readiness, recipient email-on-file readiness for manual send-attempt recording, and explicit proposed-scope/internal-only boundary reminders.
- Estimate Multi-Option Proposal Model Lock is documented in `docs/ACTIVE/Estimate_Multi_Option_Proposal_Model_Spec.md`: future Good / Better / Best proposals must use one parent Estimate / Proposal with child Option Packages; fake option headers inside flat estimate line items and three linked estimates remain rejected. This is docs/model only and does not change runbook gates or current production behavior.
- Estimate Approval Response V1 closeout is complete on the guarded internal baseline: `recordEstimateApprovalResponse` server action handles flat (no option selection required) and multi-option (option selection required; label and total snapshots captured at approval time). `buildEstimateApprovalViewModel` helper added to `estimate-domain.ts`. `EstimateApprovalResponseForm` component on estimate detail page replaces the simple "Mark Approved" button with an option-selector dropdown (multi-option) or confirm button (flat) plus optional response note. An approval response display panel is rendered when the estimate reaches `approved` status, showing selected option label, total, timestamp, and note. Migration `20260520110000_estimate_approval_response_v1.sql` adds 4 nullable columns to `estimates` (`selected_option_id`, `selected_option_label_snapshot`, `selected_option_total_cents`, `response_note`) — not yet applied to production. `estimate_approved` event enriched with full option snapshot and `response_source: "internal"` meta. No public/portal/email/conversion/payment/QBO/SMS/e-signature/stored PDF behavior was added. `ENABLE_ESTIMATES` and `ENABLE_ESTIMATE_EMAIL_SEND` remain unchanged.
- Estimate Conversion Contract Model Lock V1 is docs/model-only (Section 2B audit completed May 20, 2026): conversion is defined as two durable internal actions (estimate → job, then estimate → invoice draft), both require estimate `approved` status, and both are approval-gated / historically-only / not reversible in V1. Status transitions permit invoice conversion when estimate status is `approved` **OR** `converted`, enforcing that `approved` remains valid pre-conversion and `converted` becomes terminal only after at least one conversion completes. Selected-option requirement for multi-option, flat-option-only for single-option, all scope lines carry pricebook/manual provenance snapshots, durable linkage via `converted_job_id` and `converted_invoice_id` on estimates plus `origin_estimate_id` on jobs and `source_estimate_id` on invoices, audit trail via new `estimate_events` entry types (`estimate_converted_to_job`, `estimate_converted_to_invoice`), and idempotency guards via unique constraints on linkage fields. This is docs/contract only and does not change current production behavior or implement conversion actions. Schema additions, first implementation slice, and conversion behavior remain deferred to a separate approval and implementation window.
- Estimate Multi-Option Schema Foundation V1 is migration/test/docs only: `20260519110000_estimate_option_packages_foundation.sql` adds dormant option package tables for future use, preserves current flat `estimate_line_items`, and does not alter UI, print, actions, email, approval, conversion, portal, payment, QBO, SMS, or production behavior.
- Estimate Option Metadata Editing V1 is internal draft-only authoring: operators can create the default Good / Better / Best packages for eligible empty draft estimates and edit option label/summary after creation. Option notes, option line authoring, readiness scoring, approval/response, conversion, portal, outbound email, payment, add-ons, QBO, and SMS remain deferred.
- Estimate Manual Option Line Add/Remove V1 is internal draft-only authoring: operators can manually add and remove option line items inside Good / Better / Best packages, option totals recompute per option package only, and parent estimate totals remain unchanged. This slice remains blocked when legacy flat `estimate_line_items` exist on the estimate, with no readiness scoring, approval/response, conversion, portal, outbound email, payment, add-ons, QBO, or SMS behavior introduced.
- Estimate Option Pricebook Picker UI V1 is internal draft-only authoring: each option package card now includes a simple Pricebook picker to add source-backed option line items with editable defaults, option-only total recomputation, source-agnostic remove behavior, and parent estimate totals unchanged. Smart-entry extraction, readiness scoring, approval/response, conversion, portal, outbound email, payment, add-ons, QBO, and SMS remain deferred.
- Estimate Multi-Option Print Rendering V1 is internal authenticated browser-print only: `/estimates/[id]/print` now renders multi-option option package sections with per-option totals, preserves flat single-option print behavior, and hides the parent total as the multi-option grand total. Browser Print / Save as PDF only; approval, response, conversion, portal, email, payment, QBO, SMS, and generated/stored PDFs remain deferred.

### Locked internal-only boundaries for this runbook

This runbook covers **internal-only visibility only**.

The following are explicitly out of scope for this runbook and must not be enabled:
- real outbound estimate email (`ENABLE_ESTIMATE_EMAIL_SEND` must remain false)
- PDF generation or storage
- persistent revision storage
- customer approval or e-signature
- customer decline or request-change workflow
- customer portal estimate visibility
- public estimate links or tokens
- contractor visibility or authority
- estimate-to-job conversion
- estimate-to-invoice conversion
- payment or deposit
- Stripe tenant payment behavior
- QBO behavior

### Execution rule

Production enablement is allowed only after explicit gate approval at each phase, evidence capture, rollback readiness, and final sign-off. Each gate is a hard stop.

### 1.1 Production execution closeout (completed May 9, 2026)

Execution window outcome:
- Estimates V1A production migration execution completed successfully.
- Target migration applied in production: `20260501140000_estimates_v1a_schema_domain.sql`.
- Production project ref for execution: `ornrnvxtwwtulohqwxop`.
- Execution used an isolated single-migration artifact/worktree from commit `a200a17`.
- Isolated artifact included only:
	- `20260501120000_support_access_v1a_foundation.sql`
	- `20260501140000_estimates_v1a_schema_domain.sql`
- Isolated artifact excluded later pending migrations:
	- `20260502120000_estimate_communications_v1h.sql`
	- `20260509120000_account_settings_product_mode_v1.sql`
- Dry-run completed before apply.
- Explicit approval was received before apply.
- Apply succeeded.
- Benign `DROP POLICY IF EXISTS ... does not exist, skipping` notices were observed and were non-blocking.

Post-apply verification outcome (read-only verification):
- `public.estimates` exists.
- `public.estimate_line_items` exists.
- `public.estimate_events` exists.
- RLS is enabled on all three estimates tables.
- Expected columns exist.
- Expected constraints/FKs/checks exist.
- Expected indexes exist.
- Expected account-scoped internal policies exist.
- Row counts are all `0`:
	- `estimates`: `0`
	- `estimate_line_items`: `0`
	- `estimate_events`: `0`
- Migration history confirms `20260501140000` applied.
- Later migrations remain unapplied:
	- `20260502120000_estimate_communications_v1h.sql`
	- `20260509120000_account_settings_product_mode_v1.sql`

Non-invasive app smoke outcome:
- Production routes checked: `/`, `/ops`, `/estimates`, `/portal`.
- All returned login-gated pages.
- No public/unauthenticated estimates surface observed.

Boundaries preserved for this pass:
- `ENABLE_ESTIMATES` remained false/unset unless previously intentionally set; no flag change occurred in this pass.
- `ENABLE_ESTIMATE_EMAIL_SEND` remained false/unset; no flag change occurred in this pass.
- No estimate records were created.
- No estimate emails were sent.
- No PDFs were generated.
- No customer/public/contractor estimate exposure was enabled.
- No Estimate Communications migration was applied.
- No Product Mode migration was applied.
- No Vercel/env/feature-flag changes occurred.
- No code changes occurred in execution.
- No provisioning or account/user changes occurred.
- No Angkor onboarding occurred.
- No billing/report/entitlement/contractor-authority/source-of-truth/navigation/signup/admin-edit changes occurred.

Migration state after this execution window:
- Applied in production:
	- `20260501120000_support_access_v1a_foundation.sql`
	- `20260501140000_estimates_v1a_schema_domain.sql`
- Still pending in production:
	- `20260502120000_estimate_communications_v1h.sql`
	- `20260509120000_account_settings_product_mode_v1.sql`
- Main workspace Supabase link remained production ref `ornrnvxtwwtulohqwxop`; future sandbox work must relink and re-verify explicitly.

### 1.2 V1H-only migration-window addendum (execution completed May 10, 2026)

This addendum defines the next production migration window as a strict V1H-only apply sequence.

Current prerequisite state:
- V1A (`20260501140000_estimates_v1a_schema_domain.sql`) is already applied in production.
- Next migration target is only `20260502120000_estimate_communications_v1h.sql`.
- Product Mode migration `20260509120000_account_settings_product_mode_v1.sql` must remain excluded from this window.

Isolated artifact/worktree requirement:
- An isolated artifact/worktree is required.
- Do not run normal `supabase db push` from full repo state if Product Mode is pending.

Migration include list for the isolated artifact:
- `20260501120000_support_access_v1a_foundation.sql`
- `20260501140000_estimates_v1a_schema_domain.sql`
- `20260502120000_estimate_communications_v1h.sql`

Migration exclude list for the isolated artifact:
- `20260509120000_account_settings_product_mode_v1.sql`

Locked disabled-state boundaries for this V1H-only window:
- `ENABLE_ESTIMATES` remains false/unset.
- `ENABLE_ESTIMATE_EMAIL_SEND` remains false/unset.
- No outbound email.
- No PDFs.
- No public/customer/contractor estimate exposure.
- No estimate record creation.
- No estimate conversion (job/invoice).
- No payment, Stripe tenant payment, or QBO behavior.
- No Support Console changes.

Required V1H preflight checklist before dry-run:
- Branch is `main`.
- Working tree is clean.
- Source docs are committed and pushed.
- Production ref is confirmed as `ornrnvxtwwtulohqwxop`.
- V1A migration (`20260501140000`) is confirmed applied.
- V1H migration (`20260502120000`) is confirmed pending.
- Product Mode migration (`20260509120000`) is confirmed pending.
- `ENABLE_ESTIMATES` and `ENABLE_ESTIMATE_EMAIL_SEND` are confirmed false/unset.

V1H dry-run and apply sequence (approval-gated):
1. Run dry-run first in the isolated artifact/worktree.
2. Stop at a hard approval gate after dry-run review.
3. Apply only after explicit owner approval.

Required post-apply verification checklist for V1H:
- `public.estimate_communications` exists.
- Expected columns exist.
- Expected constraints/FKs/checks exist.
- Expected indexes exist.
- RLS is enabled.
- Expected account-scoped policies exist.
- Row count is `0`.
- Migration history confirms `20260502120000` applied.
- Migration history confirms `20260509120000` remains unapplied.

Required disabled-state smoke checklist after V1H apply:
- `/`, `/ops`, `/estimates`, `/portal` remain login-gated or disabled as expected.
- No public estimate exposure appears.
- No estimate communication rows are created by smoke.
- No outbound email is sent.

V1H no-go triggers (hard stop):
- Wrong linked project ref.
- Product Mode migration present in the isolated artifact/worktree.
- Unexpected migration drift.
- `ENABLE_ESTIMATE_EMAIL_SEND` is true/set.
- Any public/customer/contractor estimate exposure appears.
- Dry-run output differs from V1H-only target.
- Evidence path missing.
- Rollback owner missing.

### 1.3 V1H production execution closeout (completed May 10, 2026)

Execution window outcome:
- Estimate Communications V1H production migration execution completed successfully.
- Target migration applied in production: `20260502120000_estimate_communications_v1h.sql`.
- Production project ref for execution: `ornrnvxtwwtulohqwxop`.
- Execution used an isolated single-migration artifact/worktree from commit `e5a8e8e`.
- Isolated artifact included only:
	- `20260501120000_support_access_v1a_foundation.sql`
	- `20260501140000_estimates_v1a_schema_domain.sql`
	- `20260502120000_estimate_communications_v1h.sql`
- Isolated artifact excluded:
	- `20260509120000_account_settings_product_mode_v1.sql`
- Dry-run completed before apply; output confirmed only `20260502120000_estimate_communications_v1h.sql` would be pushed.
- Explicit approval was received before apply.
- Apply succeeded.

Post-apply verification outcome (read-only verification):
- `public.estimate_communications` exists.
- RLS is enabled.
- All 13 expected columns present: `account_owner_user_id`, `attempt_error`, `attempt_status`, `attempted_at`, `body_template_key`, `created_at`, `estimate_id`, `id`, `initiated_by_user_id`, `provider_message_id`, `provider_name`, `recipient_email_snapshot`, `subject_snapshot`.
- All 8 expected constraints present: PK (`estimate_communications_pkey`), 3 FKs (`estimates`, `auth.users` x2), 4 checks (attempt_status, recipient, subject, body_template_key not-blank).
- Both expected indexes present: `estimate_communications_estimate_id_idx`, `estimate_communications_account_owner_idx`.
- Both expected RLS policies present: `estimate_communications_select_internal`, `estimate_communications_insert_internal` (PERMISSIVE, authenticated).
- Row count: `0`.
- Migration history confirms `20260502120000` applied in production.
- Migration history confirms `20260509120000` is NOT in production (correctly excluded).

Non-invasive app smoke outcome:
- Production routes checked: `/`, `/ops`, `/estimates`, `/portal`.
- All returned login-gated pages.
- No public/unauthenticated estimates surface observed.

Boundaries preserved for this pass:
- `ENABLE_ESTIMATES` remained false/unset; no flag change occurred.
- `ENABLE_ESTIMATE_EMAIL_SEND` remained false/unset; no flag change occurred.
- No estimate records were created.
- No estimate emails were sent.
- No PDFs were generated.
- No customer/public/contractor estimate exposure was enabled.
- No Product Mode migration was applied.
- No Vercel/env/feature-flag changes occurred.
- No code changes occurred in execution.
- No provisioning or account/user changes occurred.

Migration state after this execution window:
- Applied in production:
	- `20260501120000_support_access_v1a_foundation.sql`
	- `20260501140000_estimates_v1a_schema_domain.sql`
	- `20260502120000_estimate_communications_v1h.sql`
- Still pending in production:
	- `20260509120000_account_settings_product_mode_v1.sql`
- Isolated worktree removed and pruned after successful verification.

### 1.4 Internal-only production flag enablement and controlled smoke closeout (completed May 10, 2026)

Enablement execution outcome:
- `ENABLE_ESTIMATES=true` was enabled in Vercel Production only.
- Production redeploy completed successfully and is aliased to `https://hvac-saas-xi.vercel.app`.
- `ENABLE_ESTIMATE_EMAIL_SEND` remained unset/false throughout.

Phase D disabled-state confirmation outcome (pre-enable):
- Unauthenticated production routes `/estimates` and `/estimates/new` remained login-gated.

Phase E feature-flag enablement outcome:
- `ENABLE_ESTIMATES=true` set in Production only.
- No other flag changed.
- `ENABLE_ESTIMATE_EMAIL_SEND` remained unset/false.

Phase F internal-only production smoke outcome:
- Authenticated internal smoke passed:
	- `/estimates` loads.
	- `/estimates/new` loads.
	- Smart customer picker works in production.
	- Location field enables/scopes correctly after customer selection.
- Controlled production smoke estimate created:
	- Estimate ID: `8796f8fc-04fb-4c53-bb05-15ab98ab31b4`
	- Estimate number: `EST-20260510-414FB343`
	- Status: `Draft`
	- Title: `PROD SMOKE 2026-05-10 - customer picker controlled draft`
	- Customer: `Eddie Castellanos`
	- Location: `3166 Jade Ct, Stockton`
	- One manual line item added: `Production smoke manual line item`
	- Quantity: `1`
	- Unit price: `$123.45`
	- Total confirmed: `$123.45`

Boundaries preserved during enablement/smoke:
- no estimate email sending enabled
- no outbound email
- no PDF
- no public links
- no contractor/customer exposure
- no estimate-to-job conversion
- no estimate-to-invoice conversion
- no payment/Stripe tenant payment/QBO behavior
- no Product Mode migration
- no Support Console changes

Warning/watch item:
- Intermittent `net::ERR_ABORTED` browser-log events appeared during navigation/action transitions, but required smoke outcomes persisted successfully.

### 1.5 Section 2B: Estimate Conversion Contract Model Lock (completed May 20, 2026)

Audit-only status: Model lock complete, no implementation performed, no schema changes, no code behavior changes, no production Supabase commands.

#### Conversion definition

Estimate conversion is defined as **two durable internal actions**, not one hard dependency:

1. **Action A:** Estimate → Job (operational truth creation)
2. **Action B:** Estimate → Invoice Draft (billing truth creation; requires Action A or existing job)

Both actions are:
- Internal-only (no customer-facing, portal, email, PDF, payment, or provider behavior)
- Approval-gated (require estimate `approved` status for initial conversion)
- Historically-only (not reversible in V1; downstream job/invoice can be voided separately)
- Schema-anchored (durable linkage via foreign keys, not reversible through status transitions)

#### Flat estimate conversion rules

- All flat `estimate_line_items` map to `visit_scope_items` in the created job.
- All flat `estimate_line_items` map to `internal_invoice_line_items` in the created invoice.
- Flat approved amount snapshot is captured as `total_cents` in conversion audit event metadata.
- No live Pricebook re-fetch; use snapshots only.

#### Multi-option estimate conversion rules

- **Requirement:** `selected_option_id` must exist and reference a valid approved option.
- **Rule:** Only selected option `estimate_option_line_items` convert.
- **Rule:** Unselected options remain historical-only (never converted).
- **Rule:** No grand total fallback; use selected option subtotal only.

#### Job conversion contract

From estimate → job, carry:
- `customer_id` (required)
- `location_id` (required)
- `origin_estimate_id` (new linkage, required)
- `service_case_id` (if present on estimate)
- Selected option summary in `job_notes` (multi-option only)
- `visit_scope_items` from conversion scope with provenance:
  - `source_pricebook_item_id` (if available)
  - `item_type`, `category`, `unit_label`, `expected_unit_price` (snapshots)

#### Invoice conversion contract

From estimate → invoice draft, require:
- Job linkage (via `converted_job_id` or parameter)
- `source_estimate_id` on invoice (new linkage)
- `status = 'draft'` (ready for issue after manual review/adjustment)
- `internal_invoice_line_items` from conversion scope with provenance:
  - `source_kind` (pricebook or manual)
  - `source_pricebook_item_id` (if applicable)
  - All snapshot fields: `item_type`, `category`, `unit_label`, `unit_price_cents`, `expected_unit_price`

#### Status transition contract (corrected for conversion consistency)

**Critical correction:** This contract allows invoice conversion to proceed after job conversion without blocking.

- **Gating for Action A (Estimate → Job):**
  - Require estimate status = `approved`
  - Block if `converted_job_id` already set (idempotency)

- **Status after Action A:** Estimate status moves to `converted` and remains terminal for normal status transitions.

- **Gating for Action B (Estimate → Invoice Draft):**
  - Allow estimate status = `approved` **OR** `converted` (this permits invoice conversion after job conversion)
  - Require `converted_job_id` is set (Action A must complete first or job must exist)
  - Block if `converted_invoice_id` already set (idempotency)
  - Block if target job already has active (non-void) invoice (enforce one-active-per-job)

- **Terminal behavior:** `converted` status is terminal for regular estimate transitions (cannot move back to `approved`), but both conversion actions remain callable when `converted` because they operate on durable linkage fields, not status progression.

- **Conversion is historical-only:** To reverse conversion in V1, manually void the created job or invoice; the estimate remains `converted`.

#### Audit & idempotency contract

**Conversion linkage on `estimates` (source-owned):**
- `converted_job_id` uuid null (unique where not null)
- `converted_invoice_id` uuid null (unique where not null)
- `converted_by_user_id` uuid null
- `converted_at` (already exists)

**Target-side origin references (for duplicate prevention):**
- `jobs.origin_estimate_id` uuid null (unique where not null)
- `internal_invoices.source_estimate_id` uuid null (partial unique index where not null and status != 'void')

**Audit events:**
- `estimate_events` entry type `estimate_converted_to_job` with meta: `{ job_id, converted_by_user_id, approved_total_cents }`
- `estimate_events` entry type `estimate_converted_to_invoice` with meta: `{ invoice_id, job_id, converted_by_user_id }`

#### Implementation scope boundaries (locked)

✋ Conversion implementation must NOT introduce:
- Payment collection
- Stripe tenant customer payment execution
- QBO sync
- SMS send
- Public/customer portal conversion controls
- Customer-facing email changes
- Contractor estimate access expansion
- Any behavior beyond operational (visit scope) and billing (invoice line item) scope linkage

---

## 2. Owner / responsibility table

| Role | Owner | Responsibility | Authority |
|---|---|---|---|
| Release coordinator | RELEASE_OWNER | Runs checklist, tracks gates, records timestamps and evidence | Recommends go/no-go |
| Engineering lead | ENG_LEAD | Validates technical readiness and rollback feasibility | Joint approver |
| Data owner | DB_OWNER | Validates migration readiness and post-apply checks | Joint approver |
| Security/compliance owner | SEC_COMP_OWNER | Validates RLS, least privilege, tenant boundaries, and auditability | Joint approver |
| QA/validation owner | QA_OWNER | Executes or witnesses smoke evidence steps | Recommends |
| Incident commander | IC_OWNER | Owns rollback command decision during an incident | Rollback authority |
| Product/final approver | PRODUCT_OWNER | Final launch authorization | Final approver |

---

## 3. Required placeholders / inputs

Do not hardcode production secrets or project IDs in this document. Use placeholders:
- `PRODUCTION_PROJECT_REF` — Supabase project reference for production (`ornrnvxtwwtulohqwxop`)
- `SANDBOX_PROJECT_REF` — Supabase project reference for sandbox (`kvpesjdukqwwlgpkzfjm`)
- `RELEASE_OPERATOR` — person executing the runbook
- `CHANGE_WINDOW` — approved datetime range and timezone
- `DEPLOYMENT_ID` — the production build/commit hash being enabled against
- `EVIDENCE_LOCATION` — agreed storage path for screenshots and logs

Additional required inputs before any phase begins:
- Approved change window and timezone
- Named live decision channel
- Evidence storage location
- Rollback on-call roster
- Confirmation that sandbox end-to-end smoke was completed and signed off

### 3.1 Hard stop gates

Before any production action begins, every gate below must pass. A single failure is a hard stop; do not proceed until it is resolved and re-confirmed.

| # | Gate | Verification command / action | Required result |
|---|---|---|---|
| G-1 | Branch is `main` | `git branch --show-current` | `main` |
| G-2 | Working tree is clean | `git status` | `nothing to commit, working tree clean` |
| G-3 | Source docs committed | `git log --oneline -3` | All estimate doc and code changes visible in log |
| G-4 | Production project ref | Confirm linked project in Supabase CLI (`supabase status` or `supabase projects list`) | `ornrnvxtwwtulohqwxop` |
| G-5 | Sandbox project ref | Confirm sandbox project ref | `kvpesjdukqwwlgpkzfjm` |
| G-6 | Email send flag | Confirm `ENABLE_ESTIMATE_EMAIL_SEND` is unset or false in production env | unset / `false` |
| G-7 | Secrets hygiene | No project refs, passwords, or API keys appear in shared logs, screenshots, or chat | All clear |

Do not proceed past hard stop gates. Record gate verification evidence before advancing to Phase A.

---

## 4. Phase A — governance preflight

All checks must pass before any production action. This phase is read-only.

1. Confirm `DEPLOYMENT_ID` is deployed and traceable to the estimates V1A-V1J baseline plus the production readiness hardening guard.
2. Confirm `createEstimateDraft` fail-closed guard is present: function must return `{ success: false, error: "Estimates are currently unavailable." }` when `ENABLE_ESTIMATES` is false or unset.
3. Confirm production is still disabled (`ENABLE_ESTIMATES` unset/false) pre-change.
4. Confirm production `ENABLE_ESTIMATE_EMAIL_SEND` remains unset/false and is not changed in this runbook.
5. Reconfirm locked internal-only boundaries with all approvers (see Section 1).
6. Confirm no additional estimate features are bundled into this rollout beyond the internal-only slice.
7. Confirm rollback owner and trigger authority.
8. Confirm evidence templates are prepared before the first action.
9. Confirm all required approvers are present or formally delegated.
10. Confirm that sandbox two-migration end-to-end smoke has been completed and evidence is recorded.
11. Record preflight completion timestamp and names.

Gate decision:
- Go only if all preflight checks are complete and signed.
- No-go if any owner, approval, environment confirmation, or artifact is missing.

### 4.1 Preflight read-only verification commands

Run these commands during Phase A to verify environment state. These are **read-only**. Do not run migration or apply commands in this phase.

```sh
# G-1: Confirm branch
git branch --show-current
# Expected: main

# G-2: Confirm clean working tree
git status
# Expected: nothing to commit, working tree clean

# G-3: Show recent commits to confirm estimate baseline is present
git log --oneline -5
# Expected: commits covering estimates V1A-V1J, production readiness guard, and doc alignment

# G-4: Confirm production project is linked (Supabase CLI)
supabase status
# Or: supabase projects list
# Confirm the linked project ref is ornrnvxtwwtulohqwxop

# G-5: Review production migration history (read-only)
supabase migration list --linked
# Confirm the two estimate migrations are NOT yet listed for production:
#   20260501140000  (estimates_v1a_schema_domain)
#   20260502120000  (estimate_communications_v1h)
# Any unexpected migrations in the list are a no-go.

# G-6: Inspect current production env flag values (Vercel CLI example)
vercel env pull --environment=production
# Or inspect via Vercel dashboard: Project → Settings → Environment Variables
# Confirm ENABLE_ESTIMATES is unset or false
# Confirm ENABLE_ESTIMATE_EMAIL_SEND is unset or false
# WARNING: Do not commit or screenshot env files containing secrets.
```

> **Vercel / hosting note:** Production environment variables are managed in the hosting provider (Vercel) and are NOT reflected in `.env.local`. Always verify flag values from the Vercel dashboard or `vercel env pull` output rather than relying on local files.

---

## 5. Phase B — sandbox pre-validation (must precede any production migration)

This phase confirms that the sandbox environment is healthy and that both migrations produce the expected schema before production is touched.

### 5.1 Sandbox migration inventory

Two migrations cover the V1 estimate schema. Both must be applied in order:
1. `20260501140000_estimates_v1a_schema_domain.sql` — core estimate schema (estimates, estimate_line_items, estimate_events)
2. `20260502120000_estimate_communications_v1h.sql` — estimate_communications table

Both migrations are already applied to sandbox (`SANDBOX_PROJECT_REF`).

### 5.2 Sandbox validation checklist

Confirm that sandbox is in a healthy baseline state before proceeding:

1. `estimates` table exists and has expected columns: `id`, `account_owner_user_id`, `estimate_number`, `customer_id`, `location_id`, `service_case_id`, `origin_job_id`, `status`, `title`, `notes`, `subtotal_cents`, `total_cents`, `created_by_user_id`, `updated_by_user_id`, `created_at`, `updated_at`, and status timestamp fields (`sent_at`, `approved_at`, `declined_at`, `expired_at`, `cancelled_at`).
2. `estimate_line_items` table exists and has expected provenance/snapshot columns.
3. `estimate_events` table exists.
4. `estimate_communications` table exists.
5. `ENABLE_ESTIMATES=true` sandbox smoke passed: `/estimates` loads, create draft succeeds, add line item succeeds, Pricebook picker available, status transitions available, communication history renders, blocked send copy is present, no email/PDF/customer-facing controls exposed.
6. `ENABLE_ESTIMATES=false` sandbox disabled-state smoke passed: `/estimates` redirects to `/ops?notice=estimates_unavailable`, estimates nav is hidden.
7. `createEstimateDraft` returns unavailable when `ENABLE_ESTIMATES` is unset/false (confirmed by test suite: `npx vitest run lib/estimates` = `131/131`).
8. `npx tsc --noEmit` passes cleanly with no estimate-related errors.
9. Record sandbox validation evidence with operator name and timestamp.

Gate decision:
- Go only if sandbox validation evidence is recorded and signed.
- No-go on any missing table, schema drift, test failure, or smoke anomaly.

---

## 6. Phase C — production migration readiness and apply

V1H-only execution note:
- If V1A is already applied in production, execute this phase as V1H-only using the isolated include/exclude lists in Section 1.2. Do not re-run a broad two-migration apply path.

### 6.1 Pre-apply confirmation

Before applying either migration to production:
1. Confirm target production project is `PRODUCTION_PROJECT_REF` and not sandbox.
2. Confirm current production schema does not already contain the estimate tables (guard against double-apply).
3. Confirm migration history in `schema_migrations` for `PRODUCTION_PROJECT_REF` does not already include the estimate migration timestamps.
4. Confirm both migration files are present and unmodified in the repo at the `DEPLOYMENT_ID` baseline.
5. Confirm the migration apply window is within `CHANGE_WINDOW`.
6. Confirm DB_OWNER and SEC_COMP_OWNER are present for the apply.

### 6.2 Migration apply sequence

Apply in order. Do not skip or reverse:
1. Apply `20260501140000_estimates_v1a_schema_domain.sql` to `PRODUCTION_PROJECT_REF`.
2. Verify post-apply: `estimates`, `estimate_line_items`, and `estimate_events` tables exist in production with expected columns.
3. Apply `20260502120000_estimate_communications_v1h.sql` to `PRODUCTION_PROJECT_REF`.
4. Verify post-apply: `estimate_communications` table exists in production.

### 6.3 Post-migration verification checklist

1. All four expected tables exist in production.
2. No unexpected schema drift is detected.
3. Existing non-estimate production critical paths remain healthy (jobs, invoices, calendar, ops queue).
4. `ENABLE_ESTIMATES` remains unset/false in production environment at this point.
5. Record post-migration verification evidence with operator name and timestamp.

Gate decision:
- Go only if all four tables are verified and existing paths are healthy.
- No-go on any schema anomaly, migration error, or unexpected drift.
- If migration apply fails or produces unexpected results: halt, do not proceed to Phase D, escalate to DB_OWNER and IC_OWNER.

### 6.4 Schema rollback note

There is **no casual schema rollback path** for applied migrations.

If a migration must be undone, it requires a deliberate reverse migration authored, reviewed, and applied under a separate controlled window. Do not treat disabling `ENABLE_ESTIMATES` as a schema rollback — that is feature flag rollback only.

---

## 7. Phase D — disabled-state smoke (with migration applied, flag still off)

Before enabling `ENABLE_ESTIMATES`, confirm that production is correctly fail-closed with the schema applied but the flag still off.

Checklist:
1. `ENABLE_ESTIMATES` remains unset/false in `PRODUCTION_PROJECT_REF` environment.
2. Navigate to production `/estimates` — confirm redirect to `/ops?notice=estimates_unavailable`.
3. Confirm estimates nav link is not visible in production nav.
4. Confirm no estimate rows were created or mutated during this check.
5. Record evidence with screenshots, operator name, and timestamp.

Gate decision:
- Go only if the disabled-state is confirmed clean.
- No-go if any estimate UI surface is accessible without the flag, or if any unexpected data mutation occurred.

### 7.1 Phase D execution closeout (May 10, 2026)

- Completed as planned before flag enablement.
- Unauthenticated production `/estimates` and `/estimates/new` remained login-gated.
- Evidence captured in the execution record.

---

## 8. Phase E — internal-only feature flag enablement

This phase enables `ENABLE_ESTIMATES=true` in the production environment for internal users only.

### 8.1 Pre-enable checklist

1. Confirm Phase D disabled-state smoke evidence is recorded and signed.
2. Confirm all Phase A-D gates are closed.
3. Confirm `ENABLE_ESTIMATE_EMAIL_SEND` will remain unset/false after this enable.
4. Confirm the enable is scoped to `ENABLE_ESTIMATES=true` only. No other flags change.
5. Confirm ENG_LEAD, DB_OWNER, and PRODUCT_OWNER are present or delegated.

### 8.2 Enable step

Set `ENABLE_ESTIMATES=true` in the production environment for `PRODUCTION_PROJECT_REF`.

Verify the deployment picks up the new value (may require a redeploy depending on environment variable strategy).

### 8.3 Phase E execution closeout (May 10, 2026)

- Completed: `ENABLE_ESTIMATES=true` enabled in Vercel Production only.
- Completed: production redeploy succeeded and active alias is `https://hvac-saas-xi.vercel.app`.
- Confirmed: `ENABLE_ESTIMATE_EMAIL_SEND` remained unset/false.

---

## 9. Phase F — internal-only production smoke

After enabling `ENABLE_ESTIMATES=true`, execute the following smoke checklist. All steps are internal-only. No customer-facing, email, PDF, or payment-related actions are performed.

### 9.1 Estimates list

- [ ] Navigate to `/estimates` as an internal user.
- [ ] Confirm the estimates list loads without error.
- [ ] Confirm no customer-facing controls are exposed.

### 9.2 Create draft estimate

- [ ] Navigate to `/estimates/new`.
- [ ] Create a draft estimate with a valid customer, location, and title.
- [ ] Confirm draft estimate is created and an estimate number is assigned (`EST-YYYYMMDD-XXXXXXXX` format).
- [ ] Confirm redirect to `/estimates/[id]` for the new draft.
- [ ] Confirm draft detail renders: estimate number, status badge, customer/location context, empty line items, totals at $0.

### 9.3 Add line items

- [ ] Add at least one manual line item (item name, type, quantity, unit price).
- [ ] Confirm line item appears in the draft with correct subtotal computation.
- [ ] Add at least one Pricebook-backed line item using the picker.
- [ ] Confirm Pricebook-backed item snapshot fields are populated correctly.
- [ ] Confirm subtotal and total recompute after each add.

### 9.4 Remove line item

- [ ] Remove one line item from the draft.
- [ ] Confirm line item is removed and totals recompute.

### 9.5 Status transitions

- [ ] Transition draft to sent. Confirm status badge updates.
- [ ] Confirm send-attempt UI renders with blocked-send copy (no email/PDF is sent).
- [ ] Confirm communication history shows a blocked-attempt record.
- [ ] Confirm line-edit controls are hidden after sent.
- [ ] Transition sent to approved. Confirm status badge updates and approved timestamp renders.
- [ ] Confirm no job, invoice, payment, conversion, or customer approval record was created.

### 9.6 Boundary confirmations

- [ ] Confirm no estimate email was sent during any step.
- [ ] Confirm no PDF was generated or stored.
- [ ] Confirm no customer portal or public-link controls are exposed.
- [ ] Confirm no contractor controls are exposed.
- [ ] Confirm `ENABLE_ESTIMATE_EMAIL_SEND` remains unset/false.
- [ ] Confirm no payment, Stripe, or QBO behavior was triggered.

### 9.7 Disabled-state regression

- [ ] Confirm that if `ENABLE_ESTIMATES` were set to false, the redirect behavior would still fire (review code guard or run a quick sandbox toggle smoke if policy allows).

### 9.8 Evidence and sign-off

- Record evidence for each step: screenshot/log, operator name, timestamp.
- File evidence at `EVIDENCE_LOCATION`.
- RELEASE_OWNER signs off that smoke is complete.
- PRODUCT_OWNER gives final authorization.

Gate decision:
- Go only if all smoke steps pass and evidence is recorded.
- No-go on any unexpected estimate behavior, email, PDF, customer exposure, payment trigger, or boundary failure.

### 9.9 Phase F execution closeout (May 10, 2026)

- Authenticated internal smoke passed for `/estimates` and `/estimates/new`.
- Production smart customer picker behavior was verified (commit `235d0ce` deployed):
	- searchable dropdown + smart search filtering
	- customer selection
	- location enable/scope after customer selection
- Controlled production smoke estimate created and verified:
	- ID `8796f8fc-04fb-4c53-bb05-15ab98ab31b4`
	- number `EST-20260510-414FB343`
	- status `Draft`
	- title `PROD SMOKE 2026-05-10 - customer picker controlled draft`
	- one manual line item added (`Production smoke manual line item`, qty `1`, unit `$123.45`)
	- total verified at `$123.45`
- All internal-only boundaries remained preserved.

---

## 10. Phase G — rollback plan

### 10.1 Feature flag rollback (primary path)

If smoke reveals an issue after `ENABLE_ESTIMATES=true`, the primary rollback is:

1. Set `ENABLE_ESTIMATES` to unset/false in `PRODUCTION_PROJECT_REF`.
2. Verify production reverts to disabled state: `/estimates` redirects, nav is hidden.
3. Record rollback timestamp, operator, and reason.
4. Do not attempt further estimate operations until root cause is identified and a new enablement window is approved.

Feature flag rollback does **not** undo the applied schema migrations. The estimate tables remain in the production schema after flag rollback; they will simply be inaccessible through the application.

### 10.2 Schema rollback (non-casual path)

Schema rollback is not a casual recovery option. If the estimate migrations must be reversed, this requires:
- A deliberate reverse migration authored, reviewed, tested in sandbox, and approved.
- A separate controlled change window.
- DB_OWNER and SEC_COMP_OWNER joint authorization.
- Do not attempt a schema rollback without that full process.

### 10.3 Rollback authority

IC_OWNER holds rollback command authority during an active incident. IC_OWNER may unilaterally execute Phase G.1 (feature flag rollback) without waiting for full approver quorum if the incident warrants immediate action.

---

## 11. Explicit non-goals for this runbook

The following are explicitly deferred beyond this runbook's scope. They must not be implemented during or after this enablement without a separate design pass and a new runbook:

- real outbound production estimate email (requires `ENABLE_ESTIMATE_EMAIL_SEND=true` and a separate email-enablement runbook)
- PDF generation or storage
- persistent revision storage
- customer approval or e-signature flows
- customer portal estimate visibility
- public estimate links or tokens
- contractor estimate visibility or authority
- estimate-to-job conversion
- estimate-to-invoice conversion
- payment or deposit flows
- Stripe tenant customer payment behavior
- QBO behavior or accounting sync

---

## 12. Post-enablement monitoring

After a successful internal-only enablement:
- Monitor application error logs for any unexpected estimate-related errors.
- Monitor for any accidental email send attempts (should appear as blocked-attempt records only in `estimate_communications`).
- Confirm no customer-facing estimate surfaces have appeared in production.
- Schedule a 24-hour follow-up check.
- Record monitoring results at `EVIDENCE_LOCATION`.

---

## 14. No-go conditions

The following conditions are hard stops at any phase. If any of these arise, halt immediately, do not proceed to the next phase, and notify all approvers.

| Condition | Reason |
|---|---|
| Branch is not `main` | Uncommitted or branch-specific code could be deployed instead of the locked baseline |
| Working tree is dirty | Uncommitted changes could be silently included in the deployed build |
| Production project ref is not `ornrnvxtwwtulohqwxop` | Risk of applying migrations or enabling flags against the wrong project |
| Pending uncommitted docs or code | Source of truth is not closed; proceed only from a clean committed baseline |
| Production migration list contains unexpected items | Schema may have drifted from the expected baseline |
| `ENABLE_ESTIMATE_EMAIL_SEND` is true or set | Internal-only slice must not send real email |
| Product Mode migration is present in isolated artifact/worktree | Window is out of scope; do not risk bundled apply |
| Any customer/public/contractor estimate surface appears | Scope boundary violation |
| Any real outbound email is sent | Immediate rollback required |
| Any PDF or storage object is created | Scope boundary violation |
| Any payment, Stripe, or QBO behavior is triggered | Scope boundary violation |
| Any estimate-to-job or estimate-to-invoice conversion occurs | Scope boundary violation |
| Any customer approval record is created | Scope boundary violation |
| Smoke step fails or produces unexpected output | Do not advance; root-cause before retrying |
| Dry-run output differs from V1H-only target | Do not apply; rebuild isolated artifact and re-review |
| Operator confidence is uncertain | Do not proceed on doubt; pause and review |
| Rollback owner unavailable | Do not proceed without confirmed rollback authority |
| Evidence storage is unavailable | Do not proceed without a place to record evidence |

Any single condition above requires a halt, a documented reason, and a re-approval before resuming.

---

## 15. Post-execution documentation requirements

After a successful migration or enablement run, the following documentation updates are required **before** the execution window is considered closed.

### 15.1 Required doc updates

| Document | Section | Required update |
|---|---|---|
| `docs/ACTIVE/Compliance_Matters_Prelaunch_Confirmation_Checklist.md` | Readiness closeout bullets | Record migration apply result, boundaries preserved, smoke result, and date |
| `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md` | Runbook-gated Estimates item | Record migration state and pending-set updates |
| `docs/ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md` | Parked Estimates rollout note | Record migration state while preserving disabled boundaries |
| `docs/ACTIVE/Estimates_Production_Enablement_Runbook.md` | Version history and addenda | Record execution/addendum details with date and outcome |

For a migration-only window where feature flags remain disabled, `docs/ACTIVE/Active Spine V4.0 Current.md` is optional unless release governance explicitly requests it.

### 15.2 Required evidence records

Each of the following must be recorded at `EVIDENCE_LOCATION` before the window closes:

- Phase A: preflight completion timestamp and approver names
- Phase B: sandbox validation evidence with operator name and timestamp
- Phase C: post-migration verification screenshots (all four tables confirmed), operator name, timestamp
- Phase D: disabled-state smoke screenshots before flag enable
- Phase E: flag enable confirmation with timestamp
- Phase F: all smoke checklist steps with screenshots/logs, operator name, timestamp
- Phase G ready state: rollback procedure reviewed and owner confirmed (whether or not rollback was executed)

### 15.3 Required explicit confirmations in the post-execution record

The post-execution record must explicitly state:
- `ENABLE_ESTIMATE_EMAIL_SEND` remained false/unset throughout and was not changed.
- No real outbound email was sent.
- No PDF was generated or stored.
- No customer/public/contractor estimate surface was exposed.
- No estimate-to-job or estimate-to-invoice conversion occurred.
- No payment, Stripe tenant payment, or QBO behavior was triggered.
- No customer approval record was created.

---

## 16. Final recommendation

### Current eligibility

The project is **eligible for a future internal-only production enablement run** based on the following confirmed baseline:

- Estimates V1A-V1J is implemented to the guarded internal baseline.
- The sole pre-production code blocker (`createEstimateDraft` missing fail-closed guard) is resolved and committed.
- `lib/estimates` test suite passes at `131/131`; `npx tsc --noEmit` is clean.
- Both estimate migrations are applied to sandbox and confirmed healthy.
- Sandbox end-to-end smoke has been completed (V1J draft-detail smoke closed).
- Source docs are committed and aligned.
- This runbook is documented and covers all required phases.

### Unresolved decisions / blockers before execution

The following items must be resolved before executing this runbook against production:

| # | Item | Status |
|---|---|---|
| 1 | Named production approver (`PRODUCT_OWNER`) confirmed and available for change window | Pending operator confirmation |
| 2 | `CHANGE_WINDOW` — approved datetime range and timezone agreed | Pending scheduling |
| 3 | `EVIDENCE_LOCATION` — agreed storage path for screenshots and logs | Pending agreement |
| 4 | Rollback on-call roster confirmed for the change window | Pending confirmation |
| 5 | Named live decision channel open during execution | Pending confirmation |
| 6 | All hard stop gates (§3.1) pass at execution time | Must be confirmed live |
| 7 | `DEPLOYMENT_ID` confirmed as the estimates V1A-V1J + guard baseline build | Must be confirmed live |

### What this runbook does NOT grant

Completing this runbook does not authorize:
- `ENABLE_ESTIMATE_EMAIL_SEND=true` — requires a separate email-enablement runbook
- PDF generation or storage
- Customer portal or public estimate visibility
- Contractor estimate access
- Estimate-to-job or estimate-to-invoice conversion
- Payment, Stripe tenant payment, or QBO behavior

---

## 13. Runbook version history

| Version | Date | Author | Notes |
|---|---|---|---|
| v1.0 | May 3, 2026 | Initial draft | Planning-only; no production execution. |
| v1.1 | May 3, 2026 | Planning pass | Added production project ref (`ornrnvxtwwtulohqwxop`), hard stop gates (§3.1), preflight commands (§4.1), no-go conditions (§14), post-execution doc requirements (§15), final recommendation (§16). No execution; planning-only. |
| v1.2 | May 9, 2026 | Docs closeout pass | Recorded Estimates Guard Parity + Send Wording Polish (`edf5022`): mutator-level fail-closed parity for add/remove, updated guarded-baseline validation (`131/131`), and `Record Send Attempt` wording safety. No runbook execution; production estimates remain disabled and runbook-gated. |
| v1.3 | May 9, 2026 | Planning closeout pass | Recorded the enabled-mode render-error watch-item closeout: intermittent `TypeError` not reproduced in clean captured smoke, `/estimates` and `/estimates/[id]` returned `200`, `addLineItemAction` posted `200` twice, and no real stack trace was captured. No code changes; planning/watch item only. |
| v1.4 | May 9, 2026 | Docs closeout pass | Recorded completed Estimates V1A production migration execution for `20260501140000_estimates_v1a_schema_domain.sql` on ref `ornrnvxtwwtulohqwxop` using isolated artifact from `a200a17`, with dry-run + explicit approval, successful apply, post-apply schema/RLS/policy/index/constraint verification, zero-row confirmation, login-gated smoke, and preserved no-change boundaries. |
| v1.5 | May 10, 2026 | Docs planning pass | Added V1H-only migration-window addendum: V1A already applied, target-only `20260502120000_estimate_communications_v1h.sql`, Product Mode exclusion (`20260509120000`), required isolated artifact include/exclude lists, preflight, approval-gated dry-run/apply sequence, post-apply verification, disabled-state smoke, no-go triggers, and migration-only documentation requirements alignment. |
| v1.6 | May 10, 2026 | Docs closeout pass | Recorded completed Estimate Communications V1H production migration execution for `20260502120000_estimate_communications_v1h.sql` on ref `ornrnvxtwwtulohqwxop` using isolated artifact from `e5a8e8e`, with dry-run + explicit approval, successful apply, full post-apply schema/RLS/policy/index/constraint/column verification, zero-row confirmation, login-gated smoke, preserved disabled-state boundaries, worktree cleanup. Product Mode (`20260509120000`) confirmed excluded and absent from migration history. |
| v1.7 | May 10, 2026 | Docs closeout pass | Recorded completed internal-only production feature enablement: `ENABLE_ESTIMATES=true` in Vercel Production only, successful redeploy to `https://hvac-saas-xi.vercel.app`, `ENABLE_ESTIMATE_EMAIL_SEND` remained unset/false, unauthenticated routes remained login-gated, authenticated internal smoke passed (`/estimates`, `/estimates/new`, smart customer picker + location scoping), controlled smoke estimate created (`8796f8fc-04fb-4c53-bb05-15ab98ab31b4`, `EST-20260510-414FB343`) with one manual line item and total `$123.45`, boundaries preserved, and `net::ERR_ABORTED` warning logged as watch item only. |
| v1.8 | May 11, 2026 | Docs closeout pass | Recorded Group 6B Job-context Estimate Entry Wiring V1 (commit `92df487`): job detail `Create Estimate` CTA with full context params, multi-param prefill parsing/validation on `/estimates/new`, `NewEstimateForm` location init and origin field wiring, new pure helper module `lib/estimates/estimate-new-entry.ts`, `143/143` tests passing, TSC clean, all browser smokes passed, no runbook gates/boundaries/flag state changed. Sandbox smoke data: `EST-20260511-DBC7949F`. Group 6 status updated to Monitoring / controlled-user ready for internal Estimates. |
