# Compliance Matters Software — Business Layer Expansion Roadmap

**Status:** DRAFT SUPPORTING PLANNING DOC  
**Authority:** Subordinate to `docs/ACTIVE/Active Spine V4.0 Current.md` and `docs/ACTIVE/Compliance_Matters_Payments_Roadmap.md`  
**Purpose:** Define the future business/commercial layer that expands the current operational platform without regressing the live workflow or conflicting with the active spine.

---

## 1. Document role

This document is a **future-state business-layer planning doc**, not the operational source of truth.

It exists to plan the next commercial/business modules on top of the existing platform, while staying aligned with the active spine.

### Locked authority rule
If any planning detail in this document conflicts with either of the following:

- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Compliance_Matters_Payments_Roadmap.md`

the spine and payments roadmap win.

---

## 2. Current platform baseline

The current operational platform remains valid and live.

This roadmap does not replace that foundation.  
It extends it.

### Existing truths remain intact
- `job_events` = narrative / operational truth
- `ecc_test_runs` = technical truth
- `jobs.ops_status` = operational projection
- `jobs` = visit execution truth
- `service_cases` = continuity truth

### Locked relationship rules
- **Job** = work / visit record
- **Visit Scope** = operational work scope for a specific visit/job
- **Service Case** = problem / continuity container
- **Estimate** = proposed commercial scope
- **Invoice** = billed commercial scope
- **Payment** = money collected against an internal invoice, when payment capability exists

### Current status note (reporting/truth separation)
- Internal invoice ledger collected-payment visibility is now implemented for internal invoicing report surfaces (including CSV export) as reporting/tracking only.
- Separation remains locked:
	- invoices = billed truth (`internal_invoices` / `internal_invoice_line_items`)
	- payments = collected truth (`internal_invoice_payments`)
	- platform entitlement = platform account truth (`platform_account_entitlements`)
- This status update does not introduce payment execution, Stripe checkout, QBO sync, or dashboard payment analytics expansion.

P1 closeout note:
- Phase P1 payment-ready foundation is now complete enough to close at the current baseline, with final closeout-quality test fidelity polish completed on collected-payment report projections.

### Launch-readiness catch-up (completed)
- Service / Visit Scope clarity pass is complete:
  - job detail now clarifies Service Details classification vs Visit Scope trip-owned work definition
  - Job Title fallback copy is clarified
  - no model, validation, billing, ECC, or RLS behavior changes were introduced in that pass
- Invoice job-detail TLC pass is complete:
  - internal invoice panel scanability is improved
  - invoice truth anchor is explicit: invoices are billed truth, payment entries are tracking-only and do not execute card charges
  - issue/send/payment/void section wording is clarified
  - external-billing lightweight path wording now emphasizes Invoice Sent tracking
  - line-item editor microcopy polish is complete
  - no live payment execution was introduced
- Internal invoice draft prefill fallback hardening is complete where source fields exist:
  - available job/customer/contractor/location fields are now used for fallback prefill
  - existing drafts are not overwritten
  - issue/send/payment behavior is unchanged
- Address state capture/wiring support is complete for relevant intake/finalization paths:
  - `locations.state` is populated where state is captured
  - contractor intake proposal state persists through `proposed_state`
  - this supports invoice billing-state prefill where source data exists
- Internal invoice void recovery/replacement behavior is complete:
  - voided internal invoices remain historical
  - voided invoices do not satisfy billed-truth closeout
  - replacement draft invoice can be created for the same job and becomes the active billing/closeout path
  - no payment execution was introduced
- Invoice report label polish is complete:
  - Comm State -> Send Status
  - Payments -> Payment Count
  - CSV header wording aligned where applicable
  - no invoice/payment calculations were changed

### Priority ordering update (pre-launch)
- Stripe Platform Subscription V1 for new account users/platform onboarding is implemented and live-smoke confirmed in production for the platform account subscription slice.
- Live confirmation includes deployed env, live webhook handling, successful non-owner checkout completion, entitlement sync, and Manage billing availability.
- This onboarding priority remains separate from tenant customer invoice payment execution.
- Tenant customer invoice payment execution remains deferred unless explicitly pulled forward.
- Live Pay Now/Charge Card/checkout/refunds/disputes/payout execution remains deferred.
- Invoice/payment language remains tracking-only until processor-backed execution exists.

### Locked rule
Business-layer modules must not collapse, overwrite, or blur operational ownership boundaries.

Visit Scope is an operational layer under the job/visit model, not a billing record.
Invoice line items remain billed truth and must not be treated as the primary visit/work-definition layer.

---

## 3. Business-layer scope

This roadmap covers future planning for:

- Pricebook
- Estimates
- Internal invoicing
- Billing/reporting structure
- Company billing modes
- Business-layer rollout rules
- Optional accounting sync context

This roadmap does **not** own payment-execution architecture.

Payment-execution direction is governed by:

- `docs/ACTIVE/Compliance_Matters_Payments_Roadmap.md`

### Payment expectation (locked)
Yes — **Stripe is now the future payment expectation**.

That means:
- future payment acceptance should follow the Stripe-first direction defined in the payments roadmap
- QBO remains optional and downstream only
- this document should not redefine payment architecture independently

---

## 4. Company billing modes (locked)

A company must operate in one of two billing modes:

### 4.1 External Billing
The company uses Compliance Matters for operations, but bills outside the platform.

Supported behavior:
- current `Invoice Sent` workflow remains valid
- no internal invoice records
- no internal payment records
- billing is tracked only at the lightweight action level

### 4.2 Internal Invoicing
The company uses Compliance Matters as its billing system.

Supported behavior:
- internal invoice records
- invoice line items
- invoice/reporting workflows
- later payment support when that capability is introduced under the payments roadmap

### 4.3 Locked rule
A company is either **in** or **out** of internal invoicing.

Do not support half-use inside one live company workflow, because it corrupts reporting meaning.

---

## 5. Current starter closeout layer (locked clarification)

The current system already supports lightweight billing-action tracking through the existing **Invoice Sent** behavior.

This is a valid and supported live workflow.

### Meaning
- `Invoice Sent` is a lightweight billing-action tracker
- it does **not** mean a full internal invoice record exists
- it remains first-class for **external-billing** companies

### Locked rule
Current invoice-sent behavior remains the lightweight billing-action layer.

Future internal invoicing is a richer optional module layered on top, not a replacement that invalidates the current workflow.

### Implemented repo truth clarification
Current implemented repo truth includes both billing-mode paths:
- external-billing companies still use job-level closeout and lightweight invoice-action tracking
- internal-invoicing companies now use the internal invoice domain as billed truth
- manual collected-payment truth exists for issued internal invoices through `internal_invoice_payments`
- collected-payment reporting/visibility exists in the internal invoice ledger and CSV export
- live payment execution still does not exist

For current live workflows:
- `Invoice Sent` remains the lightweight billing-action path for external-billing companies
- `jobs.invoice_complete` remains an operational closeout marker
- neither `Invoice Sent` nor `jobs.invoice_complete` should be treated as internal-invoice-domain truth for internal-invoicing companies

Completed billing hardening slices for the current stabilized baseline:
- the external-billing split-brain closeout seam was corrected narrowly
- the supported `Mark Invoice Sent -> Closed` path now writes the lightweight billed-truth marker before supported closeout
- billing-truth read-side normalization is complete for current closeout/report/dashboard/ops surfaces: internal-invoicing readers derive billed truth from the internal invoice domain, while external-billing readers preserve lightweight job-level invoice-action meaning
- invoice-required counter/label normalization is complete for the current stabilized surfaces: invoice-required metrics and messaging now derive from billing-aware invoice-needed truth rather than raw `jobs.ops_status = invoice_required`
- external-billing secondary-field unification is complete for the supported lightweight completion paths: `data_entry_completed_at` is aligned across those supported paths, while `invoice_number` remains intentionally owned by the explicit data-entry path rather than being invented by lightweight action buttons
- internal-invoicing workflow and invoice-record truth ownership were intentionally left unchanged

Intentionally deferred after these completed slices:
- any broader dashboard/report expansion beyond the completed billing-aware normalization already shipped
- any payment-execution behavior

### Locked seam rule
- jobs remain operational closeout truth
- invoices become billed truth for internal-invoicing companies
- payments are collected truth (materially implemented for issued internal invoices) and must not become job billing truth

---

## 6. Company profile / business identity

Company profile / internal business identity is considered complete enough to support business-layer planning.

This means future:
- pricebook
- estimates
- invoices
- templates
- reporting

may rely on company context as the business-facing identity foundation.

### Locked rule
Company profile is not the next unresolved model decision in this roadmap.

### 6.1 First owner onboarding / account provisioning V1 (implemented — complete)

**Status: V1 complete.**

For V1 launch readiness, onboarding is invite-only / platform-admin provisioned for first company/account ownership setup. This is controlled operator provisioning, not public signup or auth redesign.

Implemented files:
- `lib/business/first-owner-provisioning.ts` — idempotent provisioning helper; resolves/creates auth user → profile → `internal_users` → `internal_business_profiles` → `platform_account_entitlements`; dry-run / apply modes
- `scripts/provision-first-owner.ts` — operator script wrapper; defaults to dry-run; hosted `.supabase.co` targets require both allow flags for dry-run and apply as explicit remote-target confirmation
- `lib/auth/first-owner-routing.ts` — first-owner marker detection; routes to `/ops/admin` when all anchor rows confirmed; fails closed if any row is missing
- `app/set-password/page.tsx` — updated to call routing seam; routes first-owner to `/ops/admin`, normal internal to `/ops`, contractor to `/portal`
- `lib/business/pricebook-seeding.ts` — starter seed helper with V1 starter definitions and idempotent dry-run/apply behavior by `seed_key`

Tenant identity boundaries (unchanged):
- `internal_users` / `account_owner_user_id` = tenant/account anchor; owner row self-anchors (user_id = account_owner_user_id)
- `internal_business_profiles` = tenant operational identity
- `platform_account_entitlements` = platform account status context
- readiness = derived setup state; not a new source-of-truth table

V1 confirmed sequence:
- operator runs provisioning script (dry-run first, then apply with explicit allow flags)
- provisioning confirms/creates all required tenant rows
- provisioning dry-run/apply now includes Pricebook starter seeding through the helper
- first-owner marker is durably written to user metadata before invite send
- first owner accepts invite and sets password
- routing seam confirms all anchor rows before routing to `/ops/admin`; fails closed otherwise
- first owner lands in Admin Center readiness setup flow

Production dry-run smoke confirmation for D2C-3/D2C-4:
- top-level output `mode` is `dry_run`
- structured `pricebookSeeding` appears in operator output
- dry-run preview confirmed V1 starter set (`inserted_count = 12`, `skipped_count = 0`)
- no errors returned, no invite sent, and no apply/write action executed during smoke

Operator flag note: hosted Supabase projects use `.supabase.co` and are classified as production-like remote targets by the provisioning script. `ALLOW_FIRST_OWNER_PROVISIONING=true` enables the tool. `ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true` is also required for any hosted Supabase project (including sandbox) as explicit remote-target confirmation. Operators must verify the intended project before running apply. Dry-run should always be run first.

Why this direction:
- avoids orphaned tenant/company records
- prevents uncontrolled public-signup clutter during early launch
- keeps account-owner boundaries controlled around `account_owner_user_id`
- keeps support/onboarding quality intentional

Public self-signup is explicitly deferred to a later SaaS growth phase.

Deferred-later public-signup capability may include:
- start trial
- email verification
- company profile creation
- owner account creation
- platform entitlement creation
- readiness-checklist onboarding
- optional Stripe subscription connection only if separately enabled later

Packaged-app note:
- if Compliance Matters is later packaged as an app, authentication still relies on the same server-side account provisioning/auth model; app shell packaging does not replace tenant onboarding or ownership setup.

### 6.2 Admin readiness / setup checklist V1 (completed)

Admin Readiness / Setup Checklist V1 is complete as a read-only packaging layer on current admin surfaces.

Boundary clarification:
- tenant operational identity remains sourced from `internal_business_profiles`
- platform account entitlement/status remains sourced from `platform_account_entitlements`
- readiness is derived state for setup packaging/visibility only, not a new source-of-truth table

This completion does not introduce a new tenant settings system and does not alter onboarding implementation boundaries.

Readiness behavior confirmation:
- `internal_business_profiles.profile_reviewed_at` and `internal_business_profiles.team_reviewed_at` are the setup-progress timestamps for user-completed onboarding steps.
- Newly provisioned standard accounts now show `0 of 5 complete` on first login until the admin actually reviews company profile and team setup.
- Saving company profile completes the profile-related readiness steps; confirming team setup completes the team step.
- This fixed the misleading first-login `5 of 5 complete` state without creating a new readiness truth table.

### 6.3 Closeout status for this roadmap area (current baseline)

Out-of-box readiness / business identity / settings packaging is complete enough to close at the current baseline with:
- Admin Readiness / Setup Checklist V1 complete as a read-only derived packaging layer
- First owner onboarding/account provisioning V1 complete as invite-only platform-admin/operator provisioning
- first-owner runbook documented and referenced for pre-launch operations

Boundaries remain unchanged:
- `internal_business_profiles` remains tenant operational identity
- `platform_account_entitlements` remains platform entitlement/status context
- readiness remains derived packaging state, not a new source-of-truth table
- public self-signup remains deferred
- platform subscription billing for onboarding is live-smoke confirmed for the platform account subscription slice
- internal/comped owner protection is complete; comped owner/internal accounts remain outside Stripe checkout and surface as Internal / Comped with no billing-customer or subscription requirement
- `/ops/admin/internal-users` normal launch UI no longer exposes the Link existing auth user panel; invite teammate, team setup confirmation, and team member management remain intact
- tenant customer invoice payment execution remains deferred
- live Stripe/customer checkout remains deferred

---

## 7. Pricebook v1 (implemented baseline; active continuation)

### Current status
Pricebook V1 is no longer fully deferred.

Current baseline state is:
- implemented in production from prior work: Pricebook admin surface, starter catalog rows, controlled Category/Unit Label options, and server-side validation of controlled Pricebook values
- production-promoted for C1B/C1C: invoice-line provenance/snapshot plumbing and draft internal invoice picker wiring are now production-complete and production-smoke confirmed
- production includes seed identity/versioning foundation: `seed_key` and `starter_version` (migration `20260427170000_pricebook_seed_identity_v1`)
- D2C-3 seed helper is production-promoted and matches original V1 starter seed definitions
- D2C-4 first-owner provisioning integration is production-promoted and uses helper dry-run/apply paths
- operator script now surfaces structured `pricebookSeeding` output for first-owner dry-run/apply visibility

### Purpose
Pricebook is the reusable catalog of billable items.

It feeds:
- estimates
- invoices (draft internal invoice Pricebook picker flow is production-promoted)
- future reporting by item/category

### Pricebook item ownership
Pricebook owns reusable definitions, not transactional history.

### Required fields
- item_name
- item_type
- category
- default_description
- default_unit_price
- is_active

### v1 item types
- service
- material
- diagnostic
- adjustment

### Starter catalog rule
Pricebook launches with a starter/default set of common items.

Each company must be able to:
- add items
- expand categories
- deactivate items
- customize its own working catalog over time

Current D2C continuation clarifications:
- seeding is idempotent by `seed_key`
- dry-run previews starter seeding before apply
- existing accounts are not auto-backfilled in D2C-3/D2C-4
- Starter Kit V2 content remains future work
- D3B controlled-options refinement is production-promoted on `main` (merge `58dcb31`, change `3084906`):
  - code/test-only option refinement in `lib/business/pricebook-options.ts` and `lib/business/__tests__/pricebook-options.test.ts`
  - categories added: `Electrical`, `Compliance Docs`
  - unit labels added: `trip`, `doc`
  - Pricebook controlled unit label removed: `cfm` (CFM remains in ECC/airflow/testing contexts)
  - no schema migration, Supabase command, or DB write action was part of this promotion
- broader category/unit rollout remains future work
- no new starter seed rows were introduced by D2C-3/D2C-4
- Starter Kit V2 content remains future work and was not implemented by D3B
- no negative credit/adjustment implementation was introduced
- no invoice/payment/Stripe/QBO/Visit Scope/service workflow behavior changed by D2C-3/D2C-4
- no invoice/payment/Stripe/QBO/Visit Scope/service workflow behavior changed by D3B

### Production-complete C1B/C1C closeout (production-promoted)
- nullable invoice-line provenance/snapshot fields are production-migrated: `source_kind`, `source_pricebook_item_id`, `category_snapshot`, `unit_label_snapshot`
- server-side Pricebook-to-invoice-line frozen snapshot mapping exists for draft internal invoice adds
- draft internal invoice UI Add From Pricebook picker is production-promoted
- manual invoice line flow remains intact alongside Pricebook-backed adds
- issued/void invoice behavior remains immutable (no editable add controls)
- inactive Pricebook items are not selectable
- negative/default-credit items are blocked/deferred from picker selection
- no payment, Stripe, QBO, Visit Scope, or service workflow behavior changed by C1B/C1C
- production smoke is confirmed for C1B/C1C with no payment-execution language drift observed

### Historical integrity rule
Changing pricebook later must not mutate historical estimates or invoices.

Inactive items remain visible historically where already used, but cannot be newly selected.

---

## 8. Service V1 baseline

Service Contract V1 is already implemented and remains subordinate to the active spine.

Milestone-1 closeout status:
Service model buildout is now closed as prerequisite foundation.

The current baseline for Service is:
- `service_cases.case_kind` is structured case classification
- `jobs.service_visit_type`, `jobs.service_visit_reason`, and `jobs.service_visit_outcome` are the current visit-level Service fields
- follow-up continuity is carried through shared `service_case_id`
- parent/child lineage must remain inside one service case

Closed milestone-1 baseline also includes:
- relationship-aware internal intake V1
- Visit Scope as the job-owned operational scope layer
- ECC optional vs Service required Visit Scope behavior
- ECC companion-scope promotion into real Service jobs
- promoted-companion read-only visibility on internal scan surfaces
- Service intake title ownership clarified:
  - Service visit creation now treats **Job Title** as the explicit short human-facing headline for the visit.
  - Visit Scope remains the operational work-definition layer under the job/visit model.
  - If Job Title is blank and exactly one work item exists, the first work item may provide the derived title fallback to reduce duplicate entry.
  - `service_visit_reason` should align to the title layer rather than a separate fuzzy summary layer.
  - This preserves the locked business-layer distinction:
    - Job / visit title = visit headline
    - Visit Scope = operational work performed on the visit
    - invoice line items = downstream billed/commercial truth
- Practical intake rule:
  - Service intake should not force duplicate typing when one work item already clearly expresses the visit.
  - Preferred behavior is:
    - user-entered Job Title when provided
    - first-work-item-derived fallback when title is blank and one work item exists
    - Visit Scope work items remain the detailed execution layer either way
- milestone-1 write-path reliability cleanup for the live `jobs.updated_at` mismatch

### ECC rule
ECC / Title 24 intake may remain defaulted/standardized as its own structured workflow family.

### Locked rule
This roadmap does not reopen Service Contract V1 design.

Future business-layer planning in this document must build on the existing Service baseline for commercial workflows, reporting, and consistency.

Billing / invoice workflow is now complete enough to move forward for the current milestone-2 scope.

That achieved milestone-2 baseline includes:
- job-linked internal invoice workflow
- reviewable draft invoice behavior
- issue/send invoice behavior
- resend as a communication action on the same invoice record
- operator-facing invoice communication tracking/history

Bare-bones invoice email content/presentation is acceptable for this milestone boundary; email formatting/content polish remains deferred refinement work.

Reporting / analytics is no longer the active incomplete milestone.

Payment P1 foundation is closed at the current baseline.
Out-of-box readiness / business identity / settings packaging is also closed at the current baseline.
The next natural roadmap area is smaller service-model revisions / service workflow refinement.

Separate pre-launch enablement track:
- Stripe Platform Subscription V1 for new account users/platform onboarding is implemented and live-smoke confirmed in production for the platform account subscription slice.
- Live confirmation includes deployed env, live webhook handling, successful non-owner checkout completion, entitlement sync, and Manage billing availability.
- This does not move tenant customer invoice payment execution into current scope.

Roadmap guardrail:
- Payment P1 foundation is complete and closed.
- Payment execution remains deferred.
- Stripe platform subscription billing for platform account onboarding is implemented and live-smoke confirmed.
- Tenant customer invoice payment execution remains a deferred track unless explicitly pulled forward.
- This does not imply live Stripe/payment execution start unless explicitly planned.
- This does not imply QBO dependency.

Completed RLS / permission hardening slices for the current stabilized baseline:
- customer/location internal account-owner reconciliation is complete
- jobs and service_cases were already ahead on account-owner-aware internal read scope; customers and locations have now been reconciled to that same internal account-owner model for internal same-account teammates
- validated passed for customer list, customer detail, internal `/jobs/new` guided lookup, and location detail for non-owner internal teammates
- customer/location visibility no longer depends primarily on admin/manual scope reconstruction for those internal reads
- targeted internal same-account job/service-case mutation boundary hardening is also complete
- the hardened internal operational mutation paths now explicitly assert same-account scope before proceeding instead of relying on `user is internal` alone
- cross-account internal mutation is denied on the targeted hardened paths
- the completed targeted mutation-boundary slice covers visit scope mutation and service contract / linked service-case mutation
- internal same-account job-detail operational mutation boundary hardening is also complete
- targeted internal `/jobs/[id]` ops-lane mutations no longer rely on internal-user membership alone for the hardened paths
- same-account scope is now explicitly asserted before the targeted ops-lane mutations proceed
- cross-account internal mutation is denied on the targeted ops-lane hardened paths
- the completed targeted ops-lane mutation-boundary slice covers resolve failure by correction review, mark certs complete, mark invoice complete, update job ops details, update job ops state, mark field complete, and customer contact attempt logging
- this was a targeted internal job-detail operational mutation-boundary slice, not a full jobs/service_cases/job_events permission-model rewrite
- internal same-account pending-info release / re-evaluate mutation boundary hardening is also complete
- targeted internal `/jobs/[id]` release / re-evaluate form entrypoints no longer rely on internal-user membership alone for the hardened paths
- same-account scope is now explicitly asserted before the targeted release/re-evaluate mutations proceed
- cross-account internal mutation is denied on the targeted release/re-evaluate hardened paths
- the completed targeted release/re-evaluate mutation-boundary slice covers `releasePendingInfoAndRecomputeFromForm` and `releaseAndReevaluateFromForm`
- this was a targeted release/re-evaluate ops-lane mutation-boundary slice, not a full jobs/job_events permission-model rewrite
- internal same-account service closeout mutation boundary hardening is also complete
- targeted internal `/jobs/[id]` service closeout actions no longer rely on internal-user membership alone for the hardened paths
- same-account scope is now explicitly asserted before the targeted service closeout mutations proceed
- cross-account internal mutation is denied on the targeted service closeout hardened paths
- the completed targeted service closeout mutation-boundary slice covers `markServiceComplete` and `markInvoiceSent`
- denied targeted service closeout paths do not write `jobs`, `service_cases`, or `job_events`
- contractor authority was not expanded in this targeted service closeout slice
- this was a targeted service closeout mutation-boundary slice, not a full jobs/service_cases/job_events permission-model rewrite
- internal same-account contractor report preview/send boundary hardening is also complete
- targeted internal contractor report preview/send paths no longer rely on internal-user membership alone for the hardened paths
- same-account scope is now explicitly asserted before the targeted contractor report actions proceed
- cross-account internal access is denied on the targeted contractor report paths
- the completed targeted contractor-report boundary slice covers `generateContractorReportPreview` and `sendContractorReport`
- denied targeted contractor-report paths do not write `jobs` or `job_events`
- denied targeted contractor-report paths do not enqueue or send contractor-report notifications/emails
- contractor authority was not expanded in this targeted contractor-report slice
- this was a targeted contractor-report boundary hardening slice, not a full jobs/job_events permission-model rewrite
- internal job attachments / attachment-storage account-scope hardening is also complete
- the hardened internal attachment flows now explicitly assert same-account scope before proceeding instead of relying on broad internal access alone
- cross-account internal attachment/storage access is denied on the targeted hardened paths
- the completed targeted attachment/account-scope slice covers upload-token issuance, finalize upload, discard upload, and share-to-contractor
- matching attachment/storage policy reconciliation was completed for this seam
- this was a targeted internal attachment/account-scope slice, not a full attachment subsystem rewrite
- internal job attachments read/download account-scope boundary hardening is also complete
- the internal attachments read/download page no longer relies on internal auth plus implicit row filtering alone
- one explicit same-account internal scoped-job preflight is now asserted before any attachment row read proceeds on the targeted page
- one explicit same-account internal scoped-job preflight is now asserted before signed URL generation proceeds on the targeted page
- cross-account internal access is denied before attachment row read on the targeted read/download path
- cross-account internal access is denied before signed URL generation on the targeted read/download path
- non-internal access is denied before attachment row read and before signed URL generation on the targeted read/download path
- the completed targeted internal attachment read/download boundary slice covers the `app/jobs/[id]/attachments/page.tsx` route
- contractor redirect behavior to portal remains intact
- this was a targeted internal attachment read/download route-boundary slice, not a full attachment subsystem rewrite and not the end of broader RLS hardening
- internal ECC test-run account-scope hardening is also complete
- the hardened targeted ECC mutation paths now explicitly assert same-account scope before proceeding instead of relying on broad internal access alone
- cross-account internal ECC mutation is denied on the targeted hardened paths
- the completed targeted ECC truth/account-scope slice covers override update, add test run, delete test run, and a representative ECC test-save path
- matching `ecc_test_runs` policy reconciliation was completed for this seam
- this was a targeted ECC truth/account-scope slice, not a full ECC subsystem rewrite or full ECC permission-model completion
- internal job_equipment / job_systems account-scope hardening is also complete
- the hardened targeted equipment/system mutation paths now explicitly assert same-account scope before proceeding instead of relying on broad internal access alone
- cross-account internal equipment/system mutation is denied on the targeted hardened paths
- the completed targeted equipment/system account-scope slice covers add equipment, update equipment, delete equipment, and coupled system creation, reuse, and orphan delete behavior inside those flows
- matching `job_equipment` / `job_systems` policy reconciliation was completed for this seam
- this was a targeted equipment/system account-scope slice, not a full equipment/system domain rewrite or full equipment/system permission-model completion
- internal same-account lifecycle/scheduling mutation boundary hardening is also complete
- targeted lifecycle/scheduling actions no longer rely on internal-user membership alone for the hardened paths
- same-account scope is now explicitly asserted before targeted lifecycle/scheduling mutations proceed
- cross-account internal mutation is denied on the targeted lifecycle/scheduling hardened paths
- the completed targeted lifecycle/scheduling mutation-boundary slice covers `advanceJobStatusFromForm`, `revertOnTheWayFromForm`, and `updateJobScheduleFromForm`
- denied targeted lifecycle/scheduling paths do not write `jobs` or `job_events`
- denied targeted schedule paths do not enqueue or send customer/contractor scheduling emails
- contractor authority was not expanded in this targeted lifecycle/scheduling slice
- this was a targeted lifecycle/scheduling mutation-boundary slice, not a full jobs/job_events permission-model rewrite and not the end of broader RLS hardening
- contractor CRUD mutation boundary hardening is also complete
- targeted contractor mutation paths no longer rely on incomplete or inconsistent app-layer owner checks for the hardened paths
- same-account internal scope is now explicitly asserted before targeted contractor mutations proceed
- cross-account internal mutation is denied on the targeted contractor mutation paths
- the completed targeted contractor CRUD mutation-boundary slice covers `updateContractorFromForm` and legacy `createContractorFromForm`
- denied targeted contractor CRUD paths do not write contractor records
- contractor authority was not expanded in this targeted contractor CRUD slice
- this was a targeted contractor CRUD mutation-boundary slice, not a full contractor subsystem rewrite and not the end of broader RLS hardening
- staffing / job assignment mutation boundary hardening is also complete
- targeted staffing mutation paths no longer rely on internal-user membership plus plain job existence checks alone for the hardened paths
- same-account internal scope is now explicitly asserted before targeted staffing mutations proceed
- cross-account internal mutation is denied on the targeted staffing mutation paths
- the completed targeted staffing / job assignment mutation-boundary slice covers `assignJobAssigneeFromForm`, `setPrimaryJobAssigneeFromForm`, and `removeJobAssigneeFromForm`
- denied targeted staffing paths do not write `job_assignments`
- denied targeted staffing paths do not write staffing-related `job_events`
- assignable-user validation now runs inside actor account scope for the hardened staffing paths
- matching `job_assignments` account-scope reconciliation was completed for this seam
- contractor authority was not expanded in this targeted staffing slice
- this was a targeted staffing / job assignment mutation-boundary slice, not a full staffing subsystem rewrite and not the end of broader RLS hardening
- job contractor relink mutation boundary hardening is also complete
- the targeted contractor relink path no longer relies on internal-user membership plus plain job read/update flow alone for the hardened path
- same-account scope is now explicitly asserted before the targeted contractor relink mutation proceeds
- cross-account internal mutation is denied on the targeted contractor relink path
- the completed targeted job contractor relink mutation-boundary slice covers `updateJobContractorFromForm`
- denied targeted contractor relink paths do not write `jobs`
- denied targeted contractor relink paths do not write `job_events`
- forged cross-account `contractor_id` targets are denied before write on the hardened path
- contractor authority was not expanded in this targeted contractor relink slice
- this was a targeted job contractor relink mutation-boundary slice, not a full jobs/job_events permission-model rewrite and not the end of broader RLS hardening
- customer standalone mutation boundary hardening is also complete
- targeted customer standalone mutation paths no longer rely on internal-membership checks plus direct row mutation alone for the hardened paths
- same-account customer scope is now explicitly asserted before the targeted customer standalone mutations proceed
- cross-account internal mutation is denied on the targeted customer standalone paths
- the completed targeted customer standalone mutation-boundary slice covers `archiveCustomerFromForm` and `updateCustomerNotesFromForm`
- denied targeted customer standalone paths do not write `customers`
- contractor authority was not expanded in this targeted customer standalone slice
- this was a targeted customer standalone mutation-boundary slice, not a full customer subsystem rewrite and not the end of broader RLS hardening
- legacy job-detail entrypoint mutation boundary hardening is also complete
- targeted legacy job-detail mutation entrypoints no longer rely on missing or incomplete server-side actor/scope enforcement on the hardened paths
- same-account scope is now explicitly asserted before the targeted legacy job-detail mutations proceed
- cross-account internal access is denied before write on the targeted legacy job-detail paths
- non-internal access is denied before write on the targeted legacy job-detail paths
- denied targeted legacy job-detail paths do not write `jobs` or `job_events`
- the generic low-level `updateJob` helper was safely reduced to internal-only/non-exported usage
- this was a targeted legacy job-detail mutation-boundary slice, not a full jobs/job_events permission-model rewrite and not the end of broader RLS hardening
- internal invoice mutation boundary hardening is also complete
- targeted internal invoice mutation entrypoints no longer rely on internal-user membership plus implicit RLS outcome alone for the hardened paths
- explicit internal same-account scoped-job preflight is now asserted before targeted internal invoice mutation/side-effect flows proceed
- cross-account internal access is denied before write on the targeted internal invoice paths
- non-internal access is denied before write on the targeted internal invoice paths
- the completed targeted internal invoice mutation-boundary slice covers `createInternalInvoiceDraftFromForm`, `saveInternalInvoiceDraftFromForm`, `issueInternalInvoiceFromForm`, `voidInternalInvoiceFromForm`, `addInternalInvoiceLineItemFromForm`, `updateInternalInvoiceLineItemFromForm`, `removeInternalInvoiceLineItemFromForm`, and `sendInternalInvoiceEmailFromForm`
- denied targeted internal invoice paths do not write `internal_invoices`, `internal_invoice_line_items`, `jobs`, `job_events`, or `notifications`
- denied targeted internal invoice paths do not send invoice email side effects
- this was a targeted internal invoice mutation-boundary slice, not billing feature expansion, not payment execution work, and not the end of broader RLS hardening
- internal notification read-state mutation boundary hardening is also complete
- targeted internal notification read-state entrypoints no longer rely on internal membership plus `recipient_type` filtering alone for the hardened paths
- explicit same-account internal notification scope is now asserted before targeted notification read-state flows proceed
- cross-account internal access is denied/excluded on the targeted notification read-state paths
- non-internal access is denied before targeted notification read-state flows proceed
- the completed targeted internal notification read-state mutation-boundary slice covers `listInternalNotifications`, `markNotificationAsRead`, `markAllNotificationsAsRead`, and `getInternalUnreadNotificationCount`
- denied targeted notification read-state mark paths do not write `notifications`
- this was a targeted internal notification read-state mutation-boundary slice, not notification UX redesign, not messaging feature expansion, and not the end of broader RLS hardening
- internal user/admin identity mutation boundary hardening is also complete
- targeted internal identity/admin entrypoints no longer rely on internal-membership checks plus downstream mutation/side-effect behavior alone for the hardened paths
- explicit same-account target preflight is now asserted before targeted internal identity/admin mutation or identity side-effect flows proceed
- cross-account internal access is denied before targeted internal identity/admin writes and identity side effects
- non-internal access is denied before targeted internal identity/admin mutation and invite/reset flows proceed
- the completed targeted internal identity/admin mutation-boundary slice covers `createInternalUserFromForm`, `updateInternalUserRoleFromForm`, `activateInternalUserFromForm`, `deactivateInternalUserFromForm`, `inviteInternalUserFromForm`, `deleteInternalUserFromForm`, `updateInternalUserProfileFromForm`, `resendInternalInviteFromForm`, `sendPasswordResetFromForm`, `resendContractorInviteFromForm`, and `inviteContractorUserFromForm`
- denied targeted internal identity/admin paths do not write `internal_users`
- denied targeted internal identity/admin paths do not trigger `inviteUserByEmail`, `resetPasswordForEmail`, or `inviteContractor` side effects
- this was a targeted internal identity/admin mutation-boundary slice, not role redesign, not support-access modeling, and not the end of broader RLS hardening
- dispatch calendar account-scope read boundary hardening is also complete
- the hardened central dispatch calendar dataset path no longer relies on broad downstream reads alone
- explicit same-account scope is now asserted before dispatch calendar dataset assembly proceeds
- cross-account jobs are excluded from the returned dispatch calendar dataset
- cross-account internal `job_events` are excluded from downstream dispatch event expansion
- cross-account assignment expansion is excluded from downstream dispatch staffing expansion
- non-internal access is denied before dispatch calendar dataset assembly proceeds
- this was a targeted dispatch calendar read-boundary slice in `calendar-actions.ts`, not a calendar UI redesign, not a calendar block mutation pass, and not the end of broader RLS hardening
- dispatch calendar block mutation boundary hardening is also complete
- targeted calendar block mutation entrypoints no longer rely on incomplete or inconsistent mutation-path checks
- one explicit same-account internal mutation boundary is now asserted before targeted calendar block writes proceed
- cross-account internal access is denied before write on the targeted calendar block paths
- non-internal access is denied before write on the targeted calendar block paths
- the hardened targeted calendar block mutation-boundary slice covers `createCalendarBlockEventFromForm`, `updateCalendarBlockEventFromForm`, and `deleteCalendarBlockEventFromForm`
- denied targeted calendar block mutation paths do not write `calendar_events`
- this was a targeted calendar block mutation-boundary slice, not a calendar UI redesign, not a dispatch dataset rewrite, and not the end of broader RLS hardening
- admin job terminal mutation boundary hardening is also complete
- targeted admin terminal job mutation entrypoints no longer rely on admin gating plus direct row mutation alone
- one explicit admin + same-account scoped-job preflight is now asserted before the targeted terminal job write phases proceed
- cross-account admin access is denied before write on the targeted terminal job paths
- non-admin internal access is denied before write on the targeted terminal job paths
- non-internal access is denied before write on the targeted terminal job paths
- the hardened targeted admin terminal job mutation-boundary slice covers `archiveJobFromForm` and `cancelJobFromForm`
- denied targeted archive paths do not write `jobs`
- denied targeted cancel paths do not write `jobs` or `job_events`
- this was a targeted admin terminal job mutation-boundary slice, not a general jobs/job_events permission-model rewrite, and not the end of broader RLS hardening
- contractor portal intake proposal visibility and collaboration boundary hardening is also complete
- live contractor-facing proposal list/detail/comment paths no longer rely on page-local contractor filtering plus elevated admin reads/writes alone for the hardened paths
- one explicit contractor-scoped proposal access boundary is now asserted before targeted elevated proposal visibility/collaboration flows proceed
- cross-contractor access is denied before targeted elevated read/write on the hardened proposal paths
- non-contractor access is denied before targeted elevated read/write on the hardened proposal paths
- denied targeted proposal paths do not proceed into elevated proposal row reads
- denied targeted proposal paths do not proceed into elevated proposal comment reads/writes
- denied targeted proposal paths do not proceed into elevated proposal attachment reads
- the hardened contractor portal proposal paths cover proposal list visibility, proposal detail visibility, and the contractor proposal addendum/comment collaboration path
- this was a targeted contractor portal proposal visibility/collaboration boundary slice, not a contractor portal UX redesign, not a contractor intake adjudication redesign, and not the end of broader RLS hardening
- customer profile upsert mutation boundary hardening is also complete
- `upsertCustomerProfileFromForm` no longer relies on internal-only access plus downstream update flow alone for the hardened path
- one explicit same-account customer mutation preflight is now asserted before canonical customer write or downstream job snapshot sync proceeds on the targeted upsert path
- cross-account internal access is denied before write on the targeted upsert path
- non-internal access is denied before write on the targeted upsert path
- denied targeted upsert paths do not write `customers`
- denied targeted upsert paths do not write downstream `jobs` snapshot fields
- this was a targeted customer profile upsert mutation-boundary slice, not a broader customer subsystem rewrite, not a snapshot-model rewrite, and not the end of broader RLS hardening
- contractor admin edge mutation boundary hardening is also complete
- the remaining live contractor admin edge mutation entrypoints no longer rely on partial or incomplete admin/owner checks alone for the hardened paths
- one explicit same-account contractor mutation preflight is now asserted before targeted contractor admin edge writes proceed
- cross-account internal/admin access is denied before write on the targeted edge paths
- non-internal access is denied before write on the targeted edge paths
- denied targeted edge paths do not write contractor records
- the hardened contractor admin edge entrypoints cover `updateContractorNameAndEmailFromForm` and `createQuickContractorFromForm`
- this was a targeted contractor admin edge mutation-boundary slice, not a contractor subsystem rewrite, not a contractor invite redesign, and not the end of broader RLS hardening
- contractor invite acceptance membership boundary hardening is also complete
- the live contractor invite acceptance membership path no longer relies on elevated invite/membership reads-writes plus fallback-by-email behavior alone for the hardened path
- one explicit scoped acceptance preflight is now asserted before contractor membership creation or invite-acceptance mutation proceeds on the targeted acceptance path
- preferred acceptance resolution is auth-user-first where available
- legacy fallback-by-email is now constrained to deterministic single-scope acceptance only
- ambiguous invite scope is denied before write on the hardened acceptance path
- invalid or unsafe cross-scope acceptance is denied before write on the hardened acceptance path
- denied targeted acceptance paths do not write `contractor_users`
- denied targeted acceptance paths do not write `contractor_invites`
- the hardened targeted acceptance path covers `ensureContractorMembershipFromInvite` and the live set-password acceptance handoff behavior that uses that path
- this was a targeted contractor invite acceptance membership-boundary slice, not a broader auth redesign, not a contractor invite issuance/resend redesign, and not the end of broader RLS hardening
- internal business profile mutation boundary hardening is also complete
- the live internal business profile save path no longer relies on elevated profile/storage mutation flow alone for the hardened path
- one explicit scoped business-profile mutation preflight is now asserted before profile upsert or storage mutation proceeds on the targeted path
- cross-account or invalid-scope access is denied before write on the targeted path
- non-admin/non-internal access is denied before write on the targeted path
- denied targeted business-profile paths do not write `internal_business_profiles`
- denied targeted business-profile paths do not perform storage upload/remove mutations
- the hardened targeted business-profile path covers `saveInternalBusinessProfileFromForm` and the live admin company-profile form path that uses it
- this was a targeted internal business profile mutation-boundary slice, not a broader business-identity redesign, not tenant-settings expansion, and not the end of broader RLS hardening
- internal intake create mutation boundary hardening is also complete
- `createJobFromForm` no longer relies on broad downstream create flow alone for internal intake creation on the hardened path
- one explicit owner-scoped internal intake create preflight is now asserted before canonical create/link mutation or downstream side effect proceeds on the targeted intake-create path
- cross-account or invalid-scope internal access is denied before write on the targeted intake-create path
- non-internal access is denied before write on the targeted intake-create path
- contractor-authorized intake behavior was preserved without authority expansion
- denied targeted intake-create paths do not write `customers`, `locations`, `jobs`, or `job_events`
- denied targeted intake-create paths do not trigger downstream notifications/emails tied to the blocked create flow
- this was a targeted internal intake create mutation-boundary slice, not a `/jobs/new` redesign, not a contractor intake redesign, and not the end of broader RLS hardening
- internal job-detail customer / notes / data-entry mutation boundary confirmation hardening is also complete
- the remaining live internal `/jobs/[id]` customer / notes / data-entry mutation entrypoints now have explicit seam-proof coverage on the hardened path
- the targeted confirmed entrypoints are `updateJobCustomerFromForm`, `addPublicNoteFromForm`, `addInternalNoteFromForm`, and `completeDataEntryFromForm`
- those targeted entrypoints were confirmed to already route through the shared same-account internal scoped-job boundary on the hardened path
- same-account internal allow is now explicitly proven for that targeted cluster
- cross-account internal deny is now explicitly proven for that targeted cluster
- non-internal deny is now explicitly proven for that targeted cluster
- denied targeted cluster paths do not write `jobs` or `job_events`
- denied `completeDataEntryFromForm` paths do not advance downstream ops-projection-changing behavior on the blocked path
- this was a targeted internal job-detail customer / notes / data-entry seam-proof confirmation slice, not a `/jobs/[id]` redesign, not an ECC redesign, and not the end of broader RLS hardening
- internal ECC save / save-complete mutation boundary confirmation hardening is also complete
- the remaining live internal `/jobs/[id]/tests` ECC save / save-complete mutation entrypoints now have explicit seam-proof coverage on the hardened path
- the targeted confirmed entrypoints are `saveRefrigerantChargeDataFromForm`, `saveAirflowDataFromForm`, `completeEccTestRunFromForm`, `saveAndCompleteDuctLeakageFromForm`, `saveAndCompleteAirflowFromForm`, and `saveAndCompleteRefrigerantChargeFromForm`
- those targeted entrypoints were confirmed to already route through the shared same-account internal ECC scoped boundary on the hardened path
- same-account internal allow is now explicitly proven for that targeted ECC cluster
- cross-account internal deny is now explicitly proven for that targeted ECC cluster
- non-internal deny is now explicitly proven for that targeted ECC cluster
- denied targeted ECC cluster paths do not write `ecc_test_runs`
- denied `completeEccTestRunFromForm` paths do not advance downstream ops-projection-changing behavior on the blocked path
- denied `completeEccTestRunFromForm` paths do not advance retest-resolution/job-event behavior where reachable on the blocked path
- this was a targeted internal ECC save / save-complete seam-proof confirmation slice, not an ECC redesign, not a `/jobs/[id]/tests` redesign, and not the end of broader RLS hardening
- contractor intake adjudication mutation boundary hardening is also complete
- targeted contractor intake adjudication entrypoints no longer rely on partial/inconsistent owner checks across adjudication flows
- one explicit same-account adjudication preflight is now asserted before the targeted adjudication write phases proceed
- cross-account internal access is denied before write on the targeted adjudication paths
- non-internal access is denied before write on the targeted adjudication paths
- the completed targeted contractor intake adjudication mutation-boundary slice covers `finalizeContractorIntakeSubmissionFromForm`, `rejectContractorIntakeSubmissionFromForm`, and `markContractorIntakeSubmissionAsDuplicateFromForm`
- denied targeted contractor intake adjudication paths do not write `contractor_intake_submissions`, `customers`, `locations`, `jobs`, or `job_events`
- this was a targeted contractor intake adjudication mutation-boundary slice, not a contractor intake UX redesign, not a contractor portal redesign, and not the end of broader RLS hardening
- contractor authority was not expanded, and this was not a full jobs/service_cases RLS rewrite
- contractor customer/location visibility remains constrained, read-only, and job-derived
- notifications internal-awareness write-path hardening is also complete
- notifications remain account-owner-scoped for internal awareness
- the generic `42501 -> service-role` fallback was removed from the internal awareness notification write path
- contractor-originated or mixed-context internal awareness notifications now use one explicit, policy-aligned write contract
- internal notification read boundaries remain internal-only; contractors still do not get direct read access to internal notifications
- Report Center account-scope read/export boundary hardening is also complete
- targeted Report Center read/export surfaces now assert explicit account-scoped data boundaries for the hardened report paths
- report jobs/KPI paths now scope job reads by account contractor IDs where applicable
- service case continuity report paths now scope service case reads by account customer IDs where applicable
- closeout follow-up report paths now apply the account-owner scope that was already accepted but not fully used
- dashboard report read model now scopes both jobs and internal invoice reads to the account boundary
- targeted CSV/export report paths were included in this Report Center boundary pass
- empty account-scope lists now use sentinel-safe behavior to prevent accidental fetch-all outcomes on hardened report reads
- focused seam coverage was added for same-account allow, cross-account exclusion/deny, empty scope behavior, and invoice billing-mode honesty
- targeted seam tests passed: 15/15
- full suite passed: 284/284
- TypeScript build passed with `npx tsc --noEmit`
- browser smoke test passed after implementation
- this was a targeted Report Center read/export boundary hardening slice, not a Report Center redesign, not a KPI logic redesign, not a billing expansion, not payment execution work, not QBO work, not a broad RLS rewrite, and not the end of broader RLS / permission hardening
- reporting truth boundaries remain locked: `jobs` / `jobs.ops_status` = operational truth/projection, `service_cases` = continuity truth, `job_events` = audit/activity truth, `internal_invoices` = billed truth for internal-invoicing mode, and `payments` = collected truth only when materially implemented
- external-billing companies must not be treated as if internal invoice/payment records exist
- reporting remains owner-family split and must not collapse operational, billed, and collected truth
- internal job-detail read boundary hardening for `app/jobs/[id]/page.tsx` is also complete
- the main internal job detail page now asserts an explicit same-account internal scoped-job preflight before main job-detail read assembly
- the main internal job detail page now asserts an explicit same-account internal scoped-job preflight before attachment signed URL generation performed from that page
- cross-account internal access is denied before job-detail read assembly on the targeted path
- cross-account internal access is denied before main-page attachment signed URL generation on the targeted path
- denied signed URL paths do not call signed URL generation
- contractor enumeration used by the internal job detail page is scoped to the current internal account owner
- existing contractor/login redirect behavior was preserved
- existing mutation behavior was not changed
- focused seam tests were added for same-account allow, cross-account deny, non-internal behavior preservation, signed URL deny-before-call behavior, and contractor enumeration scoping
- targeted seam tests passed: 7/7
- full suite passed: 291/291
- TypeScript build passed with `npx tsc --noEmit`
- browser smoke test passed after implementation
- this was a targeted internal job-detail read-boundary slice, not a `/jobs/[id]` UI redesign, not a job-detail mutation rewrite, not an attachment subsystem rewrite, not a Report Center change, not a billing expansion, not payment execution work, not QBO work, not a role redesign, not a support-access model, not a broad RLS rewrite, and not the end of broader RLS / permission hardening
- jobs / jobs.ops_status remain operational truth / operational projection
- service_cases remain continuity truth
- job_events remain audit/activity truth
- internal_invoices remain billed truth for internal-invoicing mode
- payments remain collected truth only when materially implemented
- contractor authority was not expanded
- reporting and billing boundaries remain unchanged
- no role redesign, support-access model, payment work, billing work, broader notifications UX/polish work, or broad portal/contractor authority expansion was part of these slices

- Formal closeout review completed for the RLS / permission hardening milestone against live repo evidence and the active hardening ledger.
- Required live access-surface families were reviewed across internal mutations, reads, attachments/signing, ECC flows, equipment/system, lifecycle/scheduling, contractor/customer/location surfaces, invoicing, report exports, notification read-state, identity/admin, dispatch/calendar, intake/adjudication/portal collaboration, server route handlers, and dormant app-local action cleanup.
- Targeted seam hardening coverage is confirmed complete for the milestone-defined families.
- App-local orphan cleanup is confirmed complete for the dormant job-detail action file removal.
- No concrete remaining live permission seam was proven in the closeout review.
- Broad global normalization of all admin-client/service-role usage remains intentionally deferred outside this milestone closeout scope.
- Broad global completion of every notification/email side-effect path remains intentionally deferred outside this milestone closeout scope.
- This milestone is now formally closed at the targeted seam-hardening level.
- This closeout does not imply role redesign, support-access redesign, payment execution work, billing expansion, UI redesign, or a broad cross-domain RLS rewrite.

What this completion does not mean:
- it does not mean broad global permission/security normalization is finished across every possible path
- it does not mean the full broader jobs/service-cases permission model is finished
- it does not mean the full broader jobs/service_cases/job_events operational mutation model is finished across every path
- it does not mean the full broader contractor permission model is finished across every possible path
- it does not mean the full broader staffing permission model is finished across every possible path
- it does not mean the full broader customer permission model is finished across every possible path
- it does not mean the full broader attachment permission model is finished
- it does not mean the full broader ECC permission model is finished
- it does not mean the full broader equipment/system permission model is finished
- it does not mean payment execution is live
- it does not mean checkout/processor behavior was added
- it does not mean the full broader invoice/billing permission model is finished across every possible path
- it does not mean the full broader notification/messaging permission model is finished across every possible path
- it does not mean the full broader internal identity/admin permission model is finished across every possible path
- it does not mean the full broader calendar/dispatch permission model is finished across every possible path
- it does not mean the full broader contractor intake/intake-review permission model is finished across every possible path
- it does not mean contractor portal UX redesign was done
- it does not mean contractor intake adjudication redesign was done
- it does not mean contractor portal redesign was done
- it does not mean contractor invite redesign was done
- it does not mean contractor invite issuance/resend redesign was done
- it does not mean customer/location redesign was done
- it does not mean snapshot-model rewrite was done
- it does not mean full auth/identity lifecycle redesign was done
- it does not mean the full broader auth/identity lifecycle model is finished across every possible path
- it does not mean business-identity redesign was done
- it does not mean tenant-settings expansion was done
- it does not mean the full broader intake permission model is finished across every possible path
- it does not mean `/jobs/new` workflow redesign was done
- it does not mean `/jobs/[id]` workflow redesign was done
- it does not mean `/jobs/[id]/tests` workflow redesign was done
- it does not mean ECC redesign was done
- it does not mean the full broader ECC workflow/permission model is finished across every possible path
- it does not mean contractor notifications were introduced
- it does not mean support-access modeling is complete
- it does not mean role redesign was done
- it does not mean payment/billing/security work outside this seam was done
- no contractor authority expansion happened in this targeted invoice hardening slice
- no notification UX redesign happened in this targeted internal notification read-state hardening slice

Closed milestones:
- Payment P1 foundation is closed at the current baseline.
- Out-of-box readiness / business identity / settings packaging is closed at the current baseline.
- First Owner Provisioning V1 and runbook are complete.

Next natural roadmap area:
- Smaller service-model revisions / service workflow refinement.

Separate pre-launch enablement track:
- Stripe Platform Subscription V1 for new account users/platform onboarding is implemented and live-smoke confirmed in production for the platform account subscription slice.
- Live confirmation includes deployed env, live webhook handling, successful non-owner checkout completion, entitlement sync, and Manage billing availability.
- This does not move tenant customer invoice payment execution into current scope.

Roadmap guardrail:
- Payment P1 foundation is complete and closed.
- Payment execution remains deferred.
- Stripe platform subscription billing for platform account onboarding is implemented and live-smoke confirmed.
- Tenant customer invoice payment execution remains a deferred track unless explicitly pulled forward.
- This does not imply live Stripe/payment execution start unless explicitly planned.
- This does not imply QBO dependency.

Older archived Service planning docs are historical only and remain subordinate to the active spine and this active roadmap.

---

## 9. Estimate v1 (planned)

### Purpose
Estimate is the proposed commercial scope for solving a problem.

### Estimate ownership
Estimate belongs to:
- customer
- location
- service_case

It does not belong only to a job by default, because jobs are visits and estimates describe broader commercial scope.

### Required fields
- estimate_number
- customer_id
- location_id
- service_case_id
- status
- title_or_summary
- subtotal
- total
- created_at

### Useful early fields
- notes
- sent_at
- approved_at
- declined_at

### v1 statuses
- draft
- sent
- approved
- declined

### Estimate line item rule
Estimate line items are frozen quoted snapshots.

Required line-item fields:
- estimate_id
- sort_order
- source_pricebook_item_id optional
- item_name_snapshot
- description_snapshot
- item_type_snapshot
- quantity
- unit_price
- line_subtotal

### Locked rule
If the pricebook changes later, old estimates do not change.

---

## 10. Approved estimate flow (planned)

### Core rule
An approved estimate does not directly become a job by default.

Instead:
1. estimate is approved
2. approved scope becomes authorized scope under a service case
3. ops schedules one or more jobs under that case
4. jobs execute the work as visits

### Service-case behavior
- if no service case exists, approval creates one
- if a service case exists, approval updates/attaches authorized scope under it

### Locked rule
Approved estimate → service case/business scope first, then jobs/visits under it.

---

## 11. Invoice sourcing rules (implemented baseline + planned expansion)

### Core rule
Invoice line items must come from a defined source, then become frozen billing records.

When invoice sourcing comes from job execution, the operational source is completed visit scope.
Internal invoicing remains downstream of visit execution and must not define visit scope itself.

### Current production-promoted sourcing extension (C1B/C1C)
- Pricebook-backed draft internal invoice line creation is production-complete and production-smoke confirmed
- manual and Pricebook-backed line creation coexist in the draft invoice workflow
- Pricebook item remains a mutable reusable catalog definition
- invoice line item remains a frozen billed snapshot once written
- editing/deactivating Pricebook items must not mutate existing invoice lines
- current provenance/snapshot fields used for this seam are: `source_kind`, `source_pricebook_item_id`, `category_snapshot`, `unit_label_snapshot`

### Allowed source paths
- approved estimate scope
- completed visit scope
- manual office-created billing scope

### Default sourcing hierarchy
1. approved estimate scope, if present
2. completed visit scope, if no approved estimate exists
3. manual office creation, if neither applies or override is needed

### Non-estimated additions
Office may add non-estimated items to invoices.

Those additions must not silently rewrite the estimate.

### Locked rule
Estimate = proposed scope.  
Invoice = billed scope.

They may overlap heavily, but they are not the same record.

Completed visit scope may feed invoice creation later, but invoice line items remain frozen billed snapshots rather than the primary operational work-definition layer.

---

## 12. Internal Invoice V1 — implemented baseline and planned refinements

### Purpose
Invoice is the internal commercial billing record when a company is in internal invoicing mode.

### Default relationship rule
One job may have **one primary invoice by default**.

The architecture must not assume that is the only possible future shape forever.

### Required fields
- invoice_number
- company_id
- customer_id
- location_id
- job_id
- service_case_id optional but preferred
- status
- invoice_date
- issued_date nullable until issued
- subtotal
- total
- notes optional

### Useful early fields
- source_type (`estimate`, `job`, `manual`)
- source_estimate_id optional
- voided_at optional
- void_reason optional

### V1 workflow scope
Internal Invoice V1 explicitly includes:
- job-linked invoice first
- reviewable draft invoice before issuance
- job/customer/location prefill into the draft invoice
- issue/send invoice from the job-linked invoice record
- resend as a communication action, not a second invoice
- invoice communication tracking/history owned by the invoice workflow
- source-path compatibility for approved estimate scope, completed job/visit scope, and manual office-created billing scope
- paid-state planning in the invoice roadmap, without implying live processor execution in this phase

### Current milestone-2 baseline status
This invoice/billing workflow is now complete enough to move forward for the current milestone-2 scope.

Achieved baseline at this milestone includes:
- invoice review before issuance
- invoice issue/send behavior
- resend behavior as a communication action
- invoice communication tracking/history at the job-linked invoice layer
- closeout alignment around billed truth for internal-invoicing mode

Deferred refinement still remaining:
- invoice email content/design polish
- broader presentation refinements that do not change billed truth, closeout ownership, or payment boundaries

### Invoice communication seam
Invoice communication tracking is an invoice-owned communication seam, not payment execution.

It should support at least:
- sent
- resent
- failed
- recipient
- last sent at
- delivery/error note if available
- honest attempt tracking rather than fake guaranteed-delivery claims

This seam must not be read as introducing Stripe checkout, live card/ACH collection, refunds/disputes, contractor payouts, QBO sync, or any other live payment-execution behavior.

### v1 statuses
- draft
- issued
- void
- paid (planned later under payment tracking, not the initial invoice-closeout seam)

### Locked rule
Sourcing creates drafts.  
Issuance makes the invoice real.

For Internal Invoice V1, `issued` is the billing-satisfied boundary for operational closeout. `paid` remains part of invoice-state planning, but belongs to later payment-tracking truth rather than the initial invoice-closeout seam.

### Invoice line items
Invoice line items are frozen billing snapshots.

Required line-item fields:
- invoice_id
- sort_order
- source_kind optional (`manual` | `pricebook`)
- source_pricebook_item_id optional
- source_estimate_line_item_id optional
- category_snapshot optional
- unit_label_snapshot optional
- item_name_snapshot
- description_snapshot
- item_type_snapshot
- quantity
- unit_price
- line_subtotal

### Locked rule
Once created, invoice line items do not live-sync back to estimate, job, or pricebook.

Pricebook-backed draft invoice adds are production-promoted as part of the active continuation path, and invoice line items remain frozen billed snapshots once created.

Manual invoice lines and Pricebook-backed invoice lines are both valid paths and may coexist on the same draft invoice.

### Closeout seam clarification
Internal Invoice V1 must not create a second billing truth on jobs.

For internal-invoicing companies:
- the primary job-linked invoice is billed truth
- `jobs.invoice_complete` remains an operational closeout projection
- `jobs.invoice_complete` may be satisfied by invoice issuance, but it is not itself the invoice record

For external-billing companies:
- the current lightweight `Invoice Sent` / closeout behavior remains the billing-action path
- no internal invoice record is required

---

## 13. Field invoice finalization rules (planned)

### General principle
Techs may participate in job-linked invoicing when company workflow allows it.

This is especially important for field-only or small operations without dedicated office staff.

### Techs may be allowed to
- open the draft invoice tied to their job
- review existing line items
- add job-linked invoice items in the field
- adjust quantity
- send/finalize the invoice
- later collect payment if/when live payment capability exists under the payments roadmap
- send invoice/receipt to the customer

### Guardrails
- pricebook-backed additions are the preferred/default path
- custom one-off items should be permission-controlled
- unrestricted price override should not be default
- field-added or field-modified billing items should be attributable to the acting user

### Locked rule
Field invoice finalization is allowed, but field invoice administration is not broad by default.

---

## 14. Payments relationship note (subordinate to payments roadmap)

This roadmap does not define payment processor architecture.

That direction is owned by:
- `docs/ACTIVE/Compliance_Matters_Payments_Roadmap.md`

### Business-layer meaning of payments
For business-layer planning purposes:
- payment = money collected against an internal invoice (manual/off-platform tracking now available for issued internal invoices; live processor execution remains later)
- one invoice may have many payments
- reporting must distinguish billed truth from collected truth
- payment behavior must respect company billing mode
- collected-payment truth is now materially implemented in `public.internal_invoice_payments` for internal-invoicing companies

### Locked rule
Do not use this document to override:
- Stripe-first future payment direction
- QBO optional-only rule
- payment-ready-now / payment-active-later architecture
- small configurable platform-fee support

Those belong to the payments roadmap.

---

## 15. Billing permissions (planned)

### Office/Admin
- full invoice management
- create/edit draft invoices
- issue invoices
- void invoices
- manage broader billing administration
- later manage payment correction flows if/when payment capability exists

### Tech
May be allowed, depending on company workflow/settings:
- access job-linked draft invoice
- add/adjust permitted line items
- send/finalize job-linked invoice
- later collect payment if enabled by company workflow and payment capability

Techs do **not** broadly administer company-wide billing by default.

### Contractor
No ownership of internal invoice/payment records.

---

## 16. Reporting and tracking principles (planned)

### Reporting families
Reporting must be split into:
- operational reporting
- commercial reporting
- collection reporting
- continuity/service-quality reporting

### Owner discipline
- jobs / ops_status = operational truth
- service_cases = continuity truth
- estimates = quoted truth
- invoices = billed truth
- payments = collected truth when payment capability exists
- job_events = audit/activity truth

### Mode-aware reporting rule

#### External-billing companies
Valid:
- invoice action taken/not taken
- billing follow-up visibility

Not valid:
- internal invoice totals
- payment collection reports
- internal receivables reporting

#### Internal-invoicing companies
Valid:
- draft/issued/paid/void invoice reports
- outstanding balances
- payments collected when payment capability exists
- collected by tech/user
- payment method reporting when payment capability exists

### No mixed-meaning bucket rule
Do not combine these into one ambiguous metric:
- no billing action yet
- billed externally
- internal invoice drafted
- internal invoice issued
- payment outstanding
- payment complete

### Snapshot rule
Historical reporting must read frozen transactional snapshots, not today’s mutable pricebook definitions.

### Current implemented reporting baseline (achieved)

Reporting / analytics now has a real Report Center baseline and is no longer only planning-level direction.

Current implemented baseline includes:
- Dashboard as the default internal reporting entry
- Jobs Report for visit-level operational reporting
- Service Cases Report for continuity/service-quality reporting
- Closeout Report for visit-owned closeout/follow-up backlog reporting
- Invoices Report for billed-truth internal invoice reporting where internal invoicing mode is active
- CSV export support on the report-family ledgers
- dashboard drill/export behavior that reuses existing ledgers where that is the honest source
- KPI Reference retained as lower-priority internal scaffolding rather than a primary product destination

Locked boundary:
- Reporting still must stay split by family and owner truth.
- Operational truth, billed truth, and collected truth must not be collapsed into one ambiguous reporting surface.
- Invoice reporting may surface billed truth where real internal invoice records exist.
- Collection/payment reporting remains later and must not be implied before payment truth materially supports it.

---

## 17. Optional accounting sync seam (planning only)

Compliance Matters must remain usable as a standalone system.

### Locked rule
QBO remains optional and downstream.

### Meaning
Future accounting sync may later include:
- exported/synced customer mappings
- synced invoice mappings
- synced payment mappings
- reconciliation status / sync status fields

But:
- QBO is not required for core use
- QBO is not the payment foundation
- QBO is not the source of operational truth

For payment architecture, defer to the payments roadmap.

---

## 18. Rollout and integration guardrails (locked)

### Additive-first rule
Business-layer rollout must be additive first, not replacement first.

### Current closeout protection
Current live closeout behavior remains valid during rollout:
- Invoice Sent
- cert-complete behavior
- existing job closeout logic

Current implemented protection note:
- for external-billing companies, the supported `Invoice Sent` / `Mark Invoice Sent -> Closed` path now satisfies the same lightweight `jobs.invoice_complete` projection required by external-billing closeout before the supported closed path is reached
- for internal-invoicing companies, job-level `invoice_complete` remains only an operational closeout projection and must not compete with invoice-record billed truth
- internal-invoicing closeout/report/dashboard/ops readers must derive billed truth from the invoice record domain, not from lightweight job-level invoice-action markers
- external-billing readers must preserve the lightweight job-level invoice-action meaning and must not pretend an internal invoice record exists
- invoice-required metrics and operator messaging must derive from billing-aware invoice-needed truth, not raw `jobs.ops_status = invoice_required`
- supported lightweight external-billing completion paths now align `data_entry_completed_at`; `invoice_number` remains explicit data-entry-owned input rather than lightweight button-generated data

### Billing-mode-driven exposure
Feature exposure must follow company billing mode.

### No mixed billing truth
Do not let lightweight invoice-action tracking and internal invoice records compete inside one live company workflow.

For internal-invoicing companies, do not let job-level `invoice_complete` compete with invoice record state as separate billing truth. Job closeout may project billing-satisfied state, but the invoice record owns billed truth.

### Historical integrity
Do not fake-backfill historical invoice/payment records just to make reporting look complete.

### Mode switching rule
Switching from external billing to internal invoicing must be explicit and deliberate.

### v1 rollout focus
Internal invoicing rollout should begin with **job-linked invoices**, not broad freeform billing across the system.

### Must-not-regress list
New business modules must not regress:
- current job closeout behavior
- ECC/service distinction
- cert-completion logic
- service case / job ownership model
- operational dashboard truth
- external-billing workflow via current Invoice Sent path

---

## 19. Deferred / later business-layer expansion

Not part of v1 unless explicitly pulled forward:
- due dates / terms
- tax and discount breakdown
- revision/superseded estimate flow
- deposit/progress invoicing
- multiple active invoices per job
- advanced payment correction/reversal tooling
- deeper receivables aging
- membership/maintenance-linked billing
- advanced recurring-service billing
- richer accounting sync behavior

---

## 20. One-line definition

Compliance Matters’ business layer is an **internal-first, mode-aware commercial planning roadmap** built on top of the existing operational platform, where estimates define proposed scope, invoices define billed scope, payments relate to collected money when enabled, and commercial reporting stays clean by respecting ownership boundaries.
