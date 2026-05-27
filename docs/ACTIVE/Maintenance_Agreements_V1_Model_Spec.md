# Maintenance Agreements / Recurring Services V1 Model Spec

Status: ACTIVE IMPLEMENTATION TRACKING SPEC
Owner lane: Group 9A - Recurring Services / Maintenance Agreements  
Scope: model guidance plus Group 9A-2 backend foundation closeout documentation. Backend foundation is committed in repo but is not production-active until migration apply is intentionally executed through the environment process.

## Purpose

Maintenance Agreements V1 defines the future customer-owned recurring service agreement model for Compliance Matters Software.

The V1 goal is simple: let an operator track recurring service obligations for a customer, optionally tied to one primary location, and manually create normal Jobs / Work Orders when a visit is due.

This spec is intentionally not a billing, payment, portal, SMS, or automation design.

Financial/payment model boundary:

- Future recurring maintenance/service-plan billing must follow the Financial Ledger / Payments Register V1 model lock in [Financial_Ledger_Payments_Register_V1_Model_Spec.md](./Financial_Ledger_Payments_Register_V1_Model_Spec.md).
- Service Plan Billing Foundation Phase 2 model lock is documented in [Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md](./Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md).
- Recurring billing must connect through billing periods and payment allocations.
- First Service Plan Billing posture is billing-period plus normal internal invoice linkage, with customer payment through existing invoice payment infrastructure.
- Internal invoice/payment linkage is optional and must not be required for operational workflow progression.
- Jobs/work orders, service-plan visit creation/scheduling/completion, visit counting, and next-due confirmation must remain operationally available without internal payment attachment.
- External-billing/off-platform postures must remain first-class supported paths for work tracking.
- Future Service Plan Billing Period posture must allow internal invoice-backed, external/off-platform, manual, no-charge, waived, and not-billed-through-Compliance-Matters paths.
- Payment status can drive warnings/reporting context, but must not hard-block service-plan operational workflow in current posture unless explicitly reopened later.
- Money must not attach directly to service visit links, visit count rows, or `maintenance_agreement_visits`.

Phase 5B model lock (Service Plan Billing Period, docs/model only):

- Table/terminology lock:
	- database table name: `maintenance_agreement_billing_periods`
	- product/UI language: Service Plan Billing Period
	- rationale: align with existing `maintenance_agreements` model while preserving service-plan language
- Source-of-truth boundaries lock:
	- Maintenance Agreement = recurring service obligation truth
	- Maintenance Agreement Visit = operational visit/link/counting truth
	- Billing Period = commercial coverage-window truth
	- Internal Invoice = billed commercial truth
	- Internal Invoice Payment = collected money truth
	- Payment Allocation = payment-to-invoice relationship truth
	- paid/unpaid billing state is derived display/read truth only and cannot become operational truth
- First posture lock:
	- billing periods are commercial coverage records
	- billing period may optionally link to one normal internal invoice
	- first implementation links only to existing normal job-scoped internal invoices
	- first billing-period schema slice does not expand `internal_invoices` beyond required `job_id`
	- no auto-create invoices in foundation slice
	- invoice/payment linkage is optional and never required for billing-period existence
- Required fields lock:
	- `id`
	- `account_owner_user_id`
	- `maintenance_agreement_id`
	- optional denormalized `customer_id`
	- `coverage_start_date`
	- `coverage_end_date`
	- `billing_due_date`
	- `billing_cadence`
	- `amount_due_cents`
	- `currency`
	- `billing_posture`
	- `billing_period_status`
	- nullable `internal_invoice_id`
	- external/off-platform reference fields
	- no-charge/waiver/not-billed reason fields
	- created/updated audit fields
- Explicitly forbidden fields in first posture:
	- payment IDs
	- allocation IDs
	- `maintenance_agreement_visit` IDs
	- visit-count fields
	- `next_due_date` mutation fields
	- operational blocking flags
	- direct Stripe/subscription IDs
	- QBO IDs
- Lifecycle statuses lock:
	- `draft`
	- `pending_billing`
	- `invoice_linked`
	- `externally_billed`
	- `no_charge`
	- `waived`
	- `not_billed`
	- `cancelled`
- Billing posture values lock:
	- `internal_invoice`
	- `external_off_platform`
	- `manual`
	- `no_charge`
	- `waived`
	- `not_billed_through_compliance_matters`
- Derived payment display state lock (read-model only):
	- `not_invoice_backed`
	- `invoice_draft`
	- `unpaid`
	- `partially_paid`
	- `paid`
	- `invoice_void`
	- `payment_attention`
	- derives from linked invoice/payment truth where applicable and does not block operational work
- Invoice linkage rules lock:
	- billing period may link to one internal invoice
	- linkage must be same account/customer scope
	- linkage should prefer service-plan-originated/job-related invoice when available
	- first posture disallows multiple billing periods claiming the same invoice
	- payment allocations remain invoice-targeted and do not directly target billing periods yet
- External/off-platform/no-charge guardrails lock:
	- external/off-platform/manual billing never creates fake CM payment rows
	- no-charge/waived/not-billed postures are never treated as collected money
	- external references/notes/status metadata are allowed
	- operational work remains allowed without internal billing
- Operational guardrails lock:
	- jobs/work orders/visits do not require billing period
	- visit counting does not require invoice/payment
	- billing period status does not mutate `maintenance_agreement_visits`
	- payment status does not advance `next_due_date`
	- unpaid status may inform warnings/reporting only
	- tenants not using internal billing remain supported
- Phase 5C schema-foundation acceptance criteria lock:
	- additive table only
	- RLS/account-scope enforced
	- same-account agreement/customer/invoice checks
	- no UI
	- no invoice generation
	- no payment behavior changes
	- no projection/read-path switch
	- no service-plan visit/count behavior changes

Phase 5C closeout (Service Plan Billing Period Schema Foundation, schema/tests/docs only):

- Phase 5C schema foundation is complete as additive migration `20260526150000_maintenance_agreement_billing_periods_foundation.sql`.
- Added table `maintenance_agreement_billing_periods` with first-posture fields only; product/UI language remains Service Plan Billing Period.
- Locked lifecycle statuses and billing posture values are enforced in schema checks.
- Coverage-window validity, nonnegative amount, currency-format validation, duplicate coverage-window prevention, and optional internal-invoice uniqueness are enforced.
- Same-account scope integrity is enforced through trigger/function checks for maintenance agreement account, optional customer agreement match, and optional internal invoice account/customer consistency where available.
- Account-scoped RLS is enabled with SELECT/INSERT/UPDATE and no DELETE policy.
- No payment/allocation/visit/next-due mutation fields were added.
- Service-plan operations remain non-blocking and unchanged: jobs/work orders/visits/visit counting/next-due workflows do not require billing periods or payments.
- No UI, invoice generation, payment behavior, allocation projection/read-path switch, Stripe checkout/webhook behavior, or service-plan runtime behavior changed in this phase.
- Local migration validation succeeded; sandbox/production migration apply remains separate from this closeout.

Phase 5C-2 closeout (Production Dormant Billing Period Migration Apply):
- Migration `20260526150000_maintenance_agreement_billing_periods_foundation.sql` applied to production (`ornrnvxtwwtulohqwxop`) on 2026-05-26; linked ref returned to CMTest sandbox `kvpesjdukqwwlgpkzfjm` after apply.
- Table `public.maintenance_agreement_billing_periods` verified in production: all 20 required columns, no forbidden fields, all constraints/indexes/RLS/policies/triggers/functions confirmed, row count `0`.
- No billing period rows created, no invoice generation, no backfill, no UI/payment/Stripe/allocation/projection/service-plan behavior changed.
- Phase 5C is fully closed across repo, sandbox, and production. Next slice is Phase 5D read-model planning/foundation.

Phase 5D-B closeout (Service Plan Billing Period Read-Model Helper Foundation):
- Added read-only helper module `lib/maintenance-agreements/billing-period-read-model.ts` for billing-period list helpers and pure label/state derivation.
- Invoice-backed rows derive payment state from internal invoice truth and recorded payments only; pending/failed/reversed rows can surface `payment_attention` without changing paid math.
- The helper avoids direct payment-allocation reads and keeps forbidden payment, allocation, visit, next-due, and blocking fields out of the read model.
- No UI, mutation, invoice generation/linking action, payment behavior change, allocation read-path switch, or service-plan blocking was introduced.
- Phase 5D-B is complete; next slice remains Phase 5D-C.

Phase 5E-B closeout (Customer Profile Read-Only Billing Period Visibility):
- Added customer-profile-only read-only Billing Periods visibility inside each internal Maintenance Agreement card on `app/customers/[id]/page.tsx`.
- Billing periods are display-only: no billing-period mutations, no invoice generation/linking, no payment/Stripe/allocation/projection behavior changes, and no operational service-work blocking were introduced.
- Billing periods remain non-blocking for work orders, visits, next due date, and visit counting.
- Phase 5E-B is complete; next slice remains Phase 5E-C.

Phase 5F-A2 closeout (Billing Period Manual Mutation Model Lock, docs/model only):
- Manual billing-period mutation starts customer-profile-only inside existing Maintenance Agreement cards.
- Mutation authority is locked to Owner/Admin/Billing financial authority; read visibility remains broader/internal under existing Maintenance Agreement visibility.
- First mutation slice is locked to create/edit/cancel only; no delete. Cancellation is the non-destructive end-state and uses `billing_period_status = cancelled`.
- Required manual-mutation fields are locked to coverage start/end, billing cadence, amount, currency, billing posture, and lifecycle status, with account/customer/agreement derived from scoped context.
- Posture-specific validation is locked: `internal_invoice` allows `draft`/`pending_billing` only with no invoice id and amount > 0; `external_off_platform` allows `draft`/`externally_billed` and amount > 0; `manual` allows `draft`/`pending_billing` and amount > 0; `no_charge` normalizes to `no_charge` with amount 0; `waived` normalizes to `waived` with reason required; `not_billed_through_compliance_matters` normalizes to `not_billed` with reason required.
- Coverage-window validation is locked to valid dates, end date >= start date, exact duplicate window rejection, overlap rejection for non-cancelled rows, and cancelled rows not blocking future windows.
- Edits are locked to non-linked rows only.
- No invoice generation/linking, payment rows, allocation rows, Stripe calls, projection/read-path changes, or work-blocking behavior are introduced by the first mutation slice.
- Phase 5F-A2 is a model lock only; implementation remains deferred to the future mutation slice.

Phase 5F-B1 closeout (Manual Billing Period Server Actions Foundation):
- Manual billing-period server actions are complete and server-action only; no UI was added in this slice.
- Mutation authority is enforced to Owner/Admin/Billing through the active internal-user and financial-access gate.
- Create/edit/cancel actions validate customer-profile/agreement scope, required coverage fields, posture/status rules, duplicate/overlap windows, and cancel-by-status-only behavior.
- Delete remains forbidden; cancellation remains the only end-state and uses `billing_period_status = cancelled`.
- No invoice generation/linking, payment rows, allocation rows, Stripe calls, projection/read-path changes, or service-plan operational blocking were introduced.
- Validation snapshot: billing-period action tests passed, billing-period read-model tests passed, maintenance-agreements suite passed, financial-access suite passed, `npx.cmd tsc --noEmit` passed, and `git diff --check` passed.

Phase 5F-B2 closeout (Customer Profile Billing Period UI Wiring):
- Customer-profile billing-period mutation UI wiring is complete inside existing Maintenance Agreement cards.
- Mutation controls are customer-profile-only and use the already-tested server actions for create, edit, and cancel.
- Owner/Admin/Billing controls are shown only when the clean financial-access signal is available; read-only viewers remain read-only.
- Delete is not exposed.
- No invoice generation/linking, payment rows, allocation rows, Stripe calls, projection/read-path changes, or service-plan operational blocking were introduced.
- Browser smoke was attempted, but the available session was not authorized for the target customer profile, so the smoke path remained blocked by access rather than implementation.

Phase 5F-B3 closeout (Sandbox Billing Period UI Smoke):
- Phase 5F-B3 sandbox UI smoke is complete on sandbox ref `kvpesjdukqwwlgpkzfjm` for customer `ad18fa80-2817-476b-8fca-bdcf4ff3c3d6` and maintenance agreement `454b3737-fa39-46be-8925-45131a571693`.
- Customer-profile billing period create/edit/cancel workflow passed in sandbox.
- Cancellation is status-based and non-destructive; cancelled row remained visible as billing history.
- Exact same-window reuse after cancellation was blocked by current model/schema behavior; this is tracked as a future model decision rather than a smoke failure.
- Adjacent non-overlapping replacement period creation succeeded.
- No invoice generation/linking, no internal invoice payment creation, no allocation creation, no Stripe/webhook behavior, no `maintenance_agreement_visits` mutation, and no `next_due_date` mutation occurred.
- Billing periods remain non-operational and do not block work orders, visits, visit counting, or next due behavior.
- Commit `d751b23` fixed billing-period action async client resolution (`await createClient`) before `requireInternalUser` and added regression coverage.

Phase 5G-A2 closeout (Billing Period Invoice Linkage Model Lock, docs/model only):
- First invoice relationship posture is manual link to an existing internal invoice.
- Invoice generation from billing periods is deferred.
- Invoice schema expansion is deferred.
- Billing-period invoice line-item generation is deferred.
- Linking remains relationship-only in first posture: no payment rows, no allocation rows, no Stripe calls, no payment link creation, no invoice issue/send behavior, and no invoice email behavior.
- Billing-period paid state remains derived display from existing invoice/payment truth only.
- Billing periods remain non-operational and non-blocking for service-plan execution.
- Manual link eligibility is locked to:
	- Owner/Admin/Billing financial authority only
	- same-account billing period and invoice scope
	- non-cancelled billing period only
	- billing period must not already have `internal_invoice_id`
	- invoice must not be void
	- invoice must not already be claimed by another billing period
	- invoice customer must match maintenance-agreement customer where invoice customer scope exists
	- first posture requires invoice job linkage to the same maintenance agreement through `maintenance_agreement_visits`, not same-customer-only matching
- Manual unlink/correction posture is locked to:
	- Owner/Admin/Billing financial authority only
	- required unlink reason
	- non-destructive behavior (no deletes)
	- no mutation of invoice/payment/allocation rows
	- clear `internal_invoice_id` only
	- return billing-period lifecycle status to `pending_billing` unless a later approved model changes this rule
	- preserve prior invoice/payment history
- Status/display lock:
	- link sets billing-period status to `invoice_linked`
	- paid/partial/unpaid remains derived from invoice/payment truth
	- voided linked invoice should surface `invoice_void` display state without auto-mutation of billing/payment truth
	- invoice webhook/payment events must not auto-mutate billing-period lifecycle in first posture
- Explicit deferrals remain:
	- invoice generation
	- non-job invoice model expansion
	- billing-period invoice line items
	- automatic invoice issue/send
	- automatic payment link creation
	- Stripe checkout from billing periods
	- billing-period-targeted allocations
	- customer portal/self-service
	- autopay/subscriptions
	- QBO/ACH/refunds/disputes/saved cards/partial payments/receipt automation/platform-fee execution

Phase 5G-B1 closeout (Billing Period Manual Invoice Link/Unlink Server Actions):
- Phase 5G-B1 is complete as server-action-only implementation; no UI changes were introduced.
- Added manual link/unlink server-action wrappers in `lib/maintenance-agreements/billing-period-actions.ts` (`linkInternalInvoiceToBillingPeriodFromForm`, `unlinkInternalInvoiceFromBillingPeriodFromForm`).
- Access is enforced to active internal Owner/Admin/Billing only via existing internal-user and financial-authority gating; dispatcher/technician/non-financial roles are denied.
- Manual link eligibility enforcement is active for required ids, same-account scope, non-cancelled period, unlinked period, non-void invoice, unclaimed invoice, invoice-customer alignment where scoped, and required invoice-job linkage to the same maintenance agreement through `maintenance_agreement_visits`.
- Manual unlink/correction enforcement is active for required `status_reason`, currently-linked period requirement, and non-destructive correction behavior.
- Success behavior is active:
	- link sets `internal_invoice_id` and `billing_period_status = invoice_linked`
	- unlink clears `internal_invoice_id`, sets `billing_period_status = pending_billing`, and stores `status_reason`
	- both paths set `updated_by_user_id`, revalidate the customer profile path, and redirect with clear banners
- Runtime boundaries remain preserved: no invoice generation, no invoice line-item generation, no invoice issue/send/email behavior, no payment-link creation, no payment/allocation row mutation, no Stripe behavior change, no projection/read-path switch, no `maintenance_agreement_visits` mutation, and no `next_due_date` behavior change.
- Validation snapshot: focused billing-period action tests passed, billing-period read-model tests passed, maintenance-agreements suite passed, `npx.cmd tsc --noEmit` passed, and `git diff --check` passed.

Phase 6A closeout (Service Plan Automated Billing + Stripe-Saved Payment Method Audit, docs/model only):
- Service Plan Billing Foundation V1 is complete, but full recurring-service automation requires a dedicated lane for generated invoices, Stripe-saved payment methods, explicit autopay consent, manual charge saved payment method, scheduled autopay attempts, and failed-payment/retry/attention workflow.
- Locked source-of-truth boundaries:
	- Maintenance Agreement = recurring service obligation truth
	- Billing Period = commercial coverage-window truth
	- Internal Invoice = billed commercial truth
	- Internal Invoice Payment = collected/failed payment event truth when materially recorded
	- Payment Allocation = invoice-targeted allocation truth
	- Stripe = processor/payment method/money movement truth
	- Compliance Matters Autopay Setting = future instruction/consent/audit truth
	- Visits and `next_due_date` = operational truth and must never auto-mutate from payment success alone
- Invoice generation model lock:
	- one billing period may generate at most one active generated invoice in V1
	- keep `internal_invoices` job-scoped in Phase 6B; do not expand away from required `job_id`
	- generated invoice requires explicit operator-selected anchor job linked to the same maintenance agreement via `maintenance_agreement_visits`
	- first generation slice is draft-only with no auto-send, no auto-charge, no scheduled job, and no saved-card logic
	- one controlled service-plan billing line item only
	- amount from `billing_period.amount_due_cents`; description from deterministic coverage-window/cadence template
	- taxability/pricebook mapping must be explicit, not inferred
	- duplicate prevention requires link-state block (`billing_period.internal_invoice_id` set) and generation idempotency/audit keyed by account + billing period + generation kind
	- voided invoice surfaces via derived display only (no automatic lifecycle rewrite)
	- cancelled billing period blocks new generation
	- generation can transition to `invoice_linked` only after successful link
- Stripe-saved payment method model lock:
	- Compliance Matters must never store full card number, CVC, raw bank/card data, or payment credentials
	- Stripe stores payment method and money movement; Compliance Matters stores only safe references/metadata
	- SetupIntent-first saved-method flow in connected-account context
	- Stripe customer profile scope = tenant account + tenant customer
	- multiple service plans for one customer may share the same Stripe customer/payment profile
	- multiple saved methods may exist with one default marker
	- connected-account disconnect/change marks profile stale and blocks charge attempts
- Autopay consent model lock:
	- autopay disabled by default
	- consent scoped per maintenance agreement
	- persist consent version/timestamp/source/actor/capture channel/evidence reference
	- customer consent path preferred
	- tenant-captured authorization remains future-only unless explicitly modeled with source flag + stronger audit
	- saved card present does not imply autopay enabled
	- autopay lifecycle states are distinct (`enabled`, `disabled`, `paused`, `revoked`)
	- disable/revoke are state transitions, not hard deletes
- Manual charge saved-method lock:
	- manual `Charge Saved Payment Method` precedes scheduled autopay
	- preconditions: issued invoice, non-void invoice, positive balance due, non-cancelled billing period, active consent, connected-account readiness, active saved method
	- charge initiation creates payment-attempt record
	- webhook remains sole collected-money truth
	- Stripe idempotency key basis = account + invoice + attempt ordinal
- Scheduled autopay lock:
	- deferred until manual saved-method charge posture is proven
	- scheduler evaluates due issued invoices and enqueues attempts only
	- scheduler never marks invoices paid
	- scheduler skips draft/void/cancelled-context invoices, missing consent, stale profile, disconnected Stripe, and in-flight attempts
- Failed payment/retry lock:
	- failed payment creates attention state, not collected money
	- failed payment does not mutate visits or `next_due_date`
	- `requires_action` failures pause autopay until customer re-authenticates
	- retry policy is explicit and bounded; infinite loops are forbidden
- Required future schema/model candidates (future additive posture):
	- `service_plan_invoice_generation_audit`
	- `customer_stripe_payment_profiles`
	- `customer_stripe_payment_methods`
	- `maintenance_agreement_autopay_settings`
	- `autopay_consent_events`
	- `invoice_payment_attempts`
	- `scheduled_billing_jobs` (deferred)
- Recommended implementation sequence:
	1. Phase 6A docs/model lock
	2. Phase 6B manual Generate Draft Invoice from Billing Period
	3. Phase 6C sandbox smoke for generated draft invoice
	4. Phase 6D Stripe saved-method + autopay consent schema/model lock
	5. Phase 6E saved payment method setup flow
	6. Phase 6F manual Charge Saved Payment Method for issued invoice
	7. Phase 6G scheduled autopay attempts
	8. Phase 6H failed payment retry/attention workflow
	9. Phase 6I production enablement checklist

## Group 9A-9A Model Snapshot

## Group 9A-9A Model Snapshot (service plan job linkage + visit balance planning decisions)

Group 9A-9A is a docs/model decision pass only. No implementation changes are included in this slice.

### Preferred linkage model (future implementation target)

- Preferred long-term model is a separate linkage table, likely `maintenance_agreement_visits`.
- Do not use direct `jobs.maintenance_agreement_id` as the primary long-term source of truth for visit accounting.
- Purpose of the future link table: connect a Maintenance Agreement / Service Plan to actual Jobs / Work Orders created from or counted toward the plan.

Suggested future fields for `maintenance_agreement_visits`:

- `agreement_id`
- `job_id`
- `created_at`
- `created_by_user_id`
- `link_source`
- `counts_toward_visit_balance`
- `counted_at`
- `counted_by_user_id`
- `count_status`
- `reversed_at` (optional future)
- `reversed_by_user_id` (optional future)
- `reversal_reason` (optional future)

Count status lifecycle (future):

- `linked`
- `eligible`
- `counted`
- `excluded`
- `reversed`

### Counting and balance rules

- A visit should count against the plan only after linked maintenance work is completed/closed as valid maintenance work.
- Do not count at agreement creation, work-order creation, scheduling, or work start.
- V1 balance model should be derived from valid counted link rows plus agreement term/included-visit configuration when that configuration is added later.
- Do not store mutable "remaining visits" as source-of-truth in V1.

### Due-date and lifecycle handling rules

- `next_due_date` remains manual in current scope.
- Later advancement should require explicit operator confirmation or a clearly designed completion workflow.
- No automatic `next_due_date` advancement in current scope.

Cancellation/reschedule/duplicate handling rules:

- cancelled jobs do not count
- no-show jobs do not count unless explicitly marked valid later
- rescheduled same job does not double-count
- duplicate jobs are prevented by unique agreement/job linkage plus `count_status` rules
- reversal tooling is future

### Ledger decision (parked)

- Full visit balance ledger is parked for V2 unless real reversal/adjustment/renewal pressure requires first-class audit events.

Potential future ledger events (V2 planning):

- `visits_granted`
- `visit_used`
- `visit_reversed`
- `visit_adjusted`
- `renewal_granted`

### Explicit non-goals for current scope

- no automatic recurrence engine
- no automatic due-date advancement
- no visit-balance deduction yet
- no billing/payment execution
- no recurring billing
- no SMS/customer portal/QBO
- no renewal automation

## Group 9A-9B Closeout Snapshot (maintenance agreement visits link table foundation + read helpers implemented in repo)

Group 9A-9B (Maintenance Agreement Visits Link Table Foundation) is implemented and pushed in commit `6bf7329`.

Recorded implementation artifacts:

- New migration: `supabase/migrations/20260513110000_maintenance_agreement_visits_link_foundation.sql`
- New link table: `maintenance_agreement_visits` in `public` schema
- Read helpers: extended `lib/maintenance-agreements/read-model.ts` with link-table helpers
- Tests: extended `lib/maintenance-agreements/__tests__/read-model.test.ts` with 4 new link-helper tests

Recorded table purpose:

- Durable link table connecting Maintenance Agreements / Service Plans to Jobs / Work Orders
- Not a job replacement or agreement truth replacement
- Not billing/payment truth
- Link source values distinguish prefill vs manual vs future system origins
- Count status lifecycle enables future reversibility without implementing count mutations in V1

Recorded table schema:

- Primary key: `(agreement_id, job_id)` â€” ensures one-link-per-agreement-job pair
- Core fields:
  - `link_source`: enum `service_plan_prefill` | `manual` | `system_future` â€” origin of link creation
  - `count_status`: enum `linked` | `eligible` | `counted` | `excluded` | `reversed` â€” lifecycle state
  - `counts_toward_visit_balance`: boolean â€” controls V1 "used visits" projection
  - `counted_at`, `counted_by_user_id` â€” marks when link moved to `counted` status
  - `reversed_at`, `reversed_by_user_id`, `reversal_reason` â€” future reversal audit trail fields (not populated in V1)
- New links default to `count_status='linked'` and `counts_toward_visit_balance=false`
- Links with `count_status='counted'` and `counts_toward_visit_balance=true` project into used visits
- Excluded/reversed links do not count as used visits

Recorded RLS policy model:

- SELECT policy: account-scoped via strict `account_owner_user_id` match on both agreement and job through their respective customer/account relationships
- INSERT policy: account-scoped via explicit `account_owner_user_id` match (requires job to be customer-linked and agreement to belong to the same account owner)
- UPDATE policy: account-scoped via same account-owner-user-id match
- DELETE policy: intentionally absent (no delete path in V1 â€” use reversal status instead)
- Index coverage: account_owner_user_id, agreement_id, job_id, count_status for fast queries

Recorded read helpers:

- `listMaintenanceAgreementVisitsForAgreement(params)`: lists all links for a given agreement, optionally filtered by count_status
- `listMaintenanceAgreementLinksForJob(params)`: lists all links for a given job, optionally filtered by count_status
- `summarizeMaintenanceAgreementVisitLinksForAgreement(params)`: projects summary counts (linked/eligible/counted/excluded/reversed/used_visits) from link table for an agreement
- All helpers enforce account-owner-user-id scoping and safe-empty returns on missing scope

Recorded behavior:

- New links do not count by default (`count_status='linked'`, `counts_toward_visit_balance=false`)
- Used visits project only from links with `count_status='counted'` and `counts_toward_visit_balance=true`
- Excluded/reversed status preserves link history without counting
- No automatic counting wired in V1 (remains parked)
- No DELETE policy â€” reversals use status updates only

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`38` tests total; 4 new visit-link tests added).
- `npx.cmd tsc --noEmit` passed.
- `git diff --check` passed (no blocking issues; normal LF/CRLF warnings only).

Boundaries preserved in Group 9A-9B:

- no UI changes
- no new routes
- no job creation wiring
- no automatic counting logic
- no automatic due-date advancement
- no visit-balance deduction
- no recurrence engine
- no invoice/payment behavior
- no Stripe/QBO/SMS/customer portal behavior
- no Supabase commands executed
- no production migration apply
- no production writes
- no feature flag changes

Environment activation rule:

- Link table foundation is committed in repo, but is not production-active until migration `20260513110000_maintenance_agreement_visits_link_foundation.sql` is intentionally applied through the appropriate environment process.
- Runtime wiring (count logic, UI interaction, or automatic transitions) remains parked for future implementation.

Watch items:

- Current RLS policy scopes job ownership through `jobs.customer_id` to `customers.owner_user_id` match. Jobs without a customer linkage will fail the INSERT policy check until/if model assumptions broaden to accept job-agency or job-system-assigned cases.
- Count-state transitions (linked â†’ eligible â†’ counted, or reversal flows) are not wired yet. Future count mutation handlers and reversal UI tooling remain parked for V2 or later.
- Once link helpers are wired into runtime/UI (future), test coverage should expand to include prefix-filtering, pagination, and performance characteristics.

## Group 9A-9C Closeout Snapshot (create link row when work order is created from service plan)

Group 9A-9C (Create Link Row When Work Order Is Created from Service Plan) is implemented and pushed in commit `071915a`.

Recorded implementation artifacts:

- New action: `createMaintenanceAgreementVisitLinkFromJobCreation` in `lib/maintenance-agreements/agreement-actions.ts`
- Form capture: `maintenance_agreement_id` hidden input in `app/jobs/new/NewJobForm.tsx`
- Link creation hooks: calls after each of three job creation paths in `lib/actions/job-actions.ts`
- Tests: added 2 new tests for link creation behavior in `lib/maintenance-agreements/__tests__/agreement-actions.test.ts`

Recorded behavior:

- When a normal Job / Work Order is created from Service Plan prefill, a durable link row is created in `maintenance_agreement_visits`
- Link row uses: `link_source = 'service_plan_prefill'`, `count_status = 'linked'`, `counts_toward_visit_balance = false`
- Link creation is **non-blocking**: silently fails on invalid scopes, never blocks job creation
- Agreement record remains unchanged; `next_due_date` not advanced; visit balance not deducted; no automatic counting

Recorded safety and scope validation:

- Feature flag `ENABLE_MAINTENANCE_AGREEMENTS` must be enabled
- Internal user required via `internal_users` table lookup
- Strict `account_owner_user_id` matching on agreement, job, and customer
- Job/agreement must belong to same customer
- Duplicate links handled gracefully (ON CONFLICT)
- Invalid/out-of-scope agreement silently skipped (non-blocking)

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`40` tests total; 2 new link creation tests added)
- `npx.cmd tsc --noEmit` passed
- `git diff --check` passed (no blocking issues)

Boundaries preserved in Group 9A-9C:

- no automatic counting logic
- no automatic due-date advancement
- no visit-balance deduction
- no invoice/payment behavior
- no Supabase commands executed
- no production migration apply
- no production writes
- no feature flag changes

Environment activation rule:

- Link creation is committed in repo and active immediately after migration `20260513110000_maintenance_agreement_visits_link_foundation.sql` is applied
- Feature flag `ENABLE_MAINTENANCE_AGREEMENTS` controls prefill availability; once flag enabled and link table exists, link creation occurs automatically on job creation from service plan prefill

Watch items:

- Current RLS policy scopes job ownership through `jobs.customer_id` to `customers.owner_user_id` match. Jobs without customer linkage will silently fail link creation.
- Link creation runs silently with no logging; future internal warning/logging infrastructure may help troubleshooting when feature goes live
- Count-state transitions and reversal tooling remain parked for V2 or later

## Group 9A-9E Closeout Snapshot (service plan Work Items prefill + link creation runtime fix)

Group 9A-9E (Service Plan Work Items Prefill + Link Creation Runtime Fix) is implemented and pushed in commit `c4a08d9`.

Recorded implementation artifacts:

- Agreement mutation layer updates in `lib/maintenance-agreements/agreement-actions.ts`
- Customer agreement form updates in `app/customers/[id]/page.tsx`
- Job creation ordering fix in `lib/actions/job-actions.ts`
- Test updates in `lib/maintenance-agreements/__tests__/agreement-actions.test.ts` and `lib/actions/__tests__/job-intake-create-scope-hardening.test.ts`

Recorded behavior:

- Service Plan / Maintenance Agreement default Work Items now persist on agreement create/update.
- Agreement create/edit forms now support default Visit Scope / Work Items, not summary text only.
- Service Plan Work Items prefill into `/jobs/new` Step 5 `Visit Reason & Work Items`.
- Service-plan-origin job creation persists:
	- `job_type = service`
	- `service_visit_type = maintenance`
	- `visit_scope_summary`
	- `visit_scope_items`
- `maintenance_agreement_visits` link row is created when service-plan-origin job creation succeeds.
- Link row initialization remains:
	- `link_source = service_plan_prefill`
	- `count_status = linked`
	- `counts_toward_visit_balance = false`

Root cause and runtime fix:

- Prior runtime ordering placed link creation after `postCreate(...)`.
- `postCreate(...)` redirects, so link insertion after it was unreachable.
- Fix moved link creation before `postCreate(...)` in job creation branches.

Validation recorded:

- `45/45` targeted tests passed.
- `npx.cmd tsc --noEmit` passed.
- `git diff --check` passed.
- Browser smoke passed:
	- seeded Service Plan default Work Items through app UI
	- `/jobs/new` showed prefilled summary and Work Items
	- submitted job persisted service/maintenance + visit scope fields
	- `maintenance_agreement_visits` row created with linked/not-counted defaults

Boundaries preserved in Group 9A-9E:

- agreement record remains unchanged during job creation
- no automatic counting
- no due-date advancement
- no visit-balance deduction
- no invoice/payment behavior
- no recurrence engine
- no Stripe/QBO/SMS/customer portal behavior
- no production migration apply

## Group 9A-10B Closeout Snapshot (service plan count eligibility read-only projection)

Group 9A-10B (Service Plan Count Eligibility Read-Only Projection) is implemented, validated, and pushed in commit `0588a26`.

Recorded behavior:

- `/service-plans` now shows a read-only `Visit Count Review` column.
- Projection labels include:
	- `No linked visits`
	- `Linked`
	- `Eligible for count review`
	- `Counted`
	- `Excluded`
	- `Reversed`
	- `Not eligible`
- Projection remains read-only and does not mutate visit-link lifecycle.
- Used visits still derive only from link rows where:
	- `count_status = counted`
	- `counts_toward_visit_balance = true`

Validation recorded:

- Browser smoke passed with `ENABLE_MAINTENANCE_AGREEMENTS=true`:
	- `/service-plans` renders
	- `Visit Count Review` column appears
	- `No linked visits` label appears where expected
	- `Linked` / `Not eligible` badges render for linked plans
	- no `Mark Visit Counted` button exists
	- no forms/actions for counting exist
	- filters work
	- customer links work
- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`45` tests).
- `npx.cmd tsc --noEmit` passed.
- `git diff --check` passed.

Boundaries preserved in Group 9A-10B:

- no count-status mutation
- no automatic counting on completion
- no `Mark Visit Counted` action yet
- no due-date advancement
- no visit-balance deduction
- no mutable remaining-visit counter
- no billing/payment behavior
- no customer portal/SMS/QBO behavior
- no recurrence generation

Watch items:

- No-show and duplicate are handled defensively but are not first-class lifecycle enums yet.
- Partial Work Items still need a future per-item completion model before automatic counting would be safe.

Future parked enhancement note:

- Service Plan creation should later be template-driven.
- Agreement name, type, frequency, default Work Items, and cadence should come from selected templates.
- `start_date` remains operator-entered.
- `next_due_date` should later auto-calculate from `start_date + template frequency`, with operator override.
- `renewal_date` should later derive from plan term/payment option.

## Group 9A-10C Closeout Snapshot (manual Mark Visit Counted on job detail)

Group 9A-10C (Manual Mark Visit Counted on Job Detail) is implemented and pushed in commit `1b69336`, with visibility closure fix pushed in commit `2ae1a4b`.

Recorded behavior:

- Eligible linked maintenance jobs on job detail now surface `Service Plan Visit Count Review` with `Mark Visit Counted` action.
- Action is operator-confirmed with exact copy:
	- `This will count this completed maintenance job as one used visit for this Service Plan. It will not create an invoice, collect payment, or advance the next due date. Continue?`
- Action mutates only `maintenance_agreement_visits` for the targeted link row:
	- `count_status = counted`
	- `counts_toward_visit_balance = true`
	- `counted_at = now`
	- `counted_by_user_id = current internal user`
	- `updated_by_user_id = current internal user`
- Agreement record is not mutated.
- `next_due_date` is not advanced.
- No invoice or payment behavior is introduced.
- No automatic counting is introduced.
- Already-counted jobs do not re-show the action.

Recorded root cause and fix:

- Initial 10C action surface rendered inside collapsed `Edit Job details` container.
- Result: jobs could be logically eligible but not visibly actionable in normal workflow.
- Fix in `2ae1a4b` moved `Service Plan Visit Count Review` into always-visible job-detail scope while preserving existing eligibility gates and shared projection logic.

Browser smoke recorded:

- Job: `d39a96d9-e699-45fe-b545-2968202441b9`
- Link row: `82b44fd5-86c5-459b-a893-037b37a968a1`
- Before:
	- `count_status = linked`
	- `counts_toward_visit_balance = false`
	- `counted_at = null`
- After:
	- `count_status = counted`
	- `counts_toward_visit_balance = true`
	- `counted_at` populated
	- `counted_by_user_id` populated
- `/service-plans` projection moved from `Eligible for count review` to `Counted` for the affected agreement.
- Agreement `next_due_date` remained `2026-06-15`.
- No invoice/payment side effects were observed.

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__ job-detail-operational-entitlement-hardening.test.ts` passed (`77` tests).
- `npx.cmd tsc --noEmit` passed.
- `git diff --check` passed.

Boundaries preserved in Group 9A-10C:

- no automatic counting
- no automatic due-date advancement
- no recurrence engine
- no invoice/payment behavior
- no Stripe/QBO/SMS/customer portal behavior
- no renewal automation
- no mutable remaining-visit counter

## Group 9A-11A Model Snapshot (service plan due-window and next-due suggestion planning)

Group 9A-11A is a docs/model decision pass only. No implementation changes are included in this slice.

Guiding product principle:

- Simple first. Helpful next. Automation last.

Core rule:

- Counting a Service Plan visit must not automatically advance `maintenance_agreements.next_due_date`.
- Any future next-due write remains explicit and operator-confirmed.

Two supported future cadence models:

- Interval cadence:
	- `monthly`
	- `quarterly`
	- `semi_annual`
	- `annual`
	- `custom` (manual scheduling)
- Seasonal service-window cadence:
	- Spring AC maintenance windows
	- Fall heat maintenance windows
	- custom seasonal windows

Interval suggestion algorithm (future read-only suggestion model):

- Use cadence-preserving hybrid logic:
	- Start with current `agreement.next_due_date`.
	- Add the agreement frequency interval.
	- If the result is on or before the counted job completion date, roll forward by the same interval until the suggested date is after the counted completion date.
- Frequency interval mapping:
	- `monthly` = +1 month
	- `quarterly` = +3 months
	- `semi_annual` = +6 months
	- `annual` = +12 months
	- `custom` = no automatic suggestion; manual scheduling required

Seasonal service-window model (future template-driven model):

- Future Service Plan templates should define:
	- season/window name
	- `window_start_month/day`
	- `window_end_month/day`
	- `reminder_lead_days`
	- default Work Items
	- cadence label
- Example windows:
	- Spring AC Maintenance: March 1 to May 31, reminders starting 30 days before window open
	- Fall Heat Maintenance: September 1 to November 30, reminders starting 30 days before window open

Due-state language decision:

- Seasonal window UX should prefer:
	- `Upcoming`
	- `In Service Window`
	- `Overdue`
	- `Manual scheduling required`
- Avoid date-only language that implies only a single fixed due date for seasonal plans.

Suggested placement order (future implementation sequence):

- First placement: job detail after `Mark Visit Counted` success, in or near `Service Plan Visit Count Review`.
- Next mirrors:
	- customer profile Service Plan card
	- `/service-plans` drilldown
- Later: due-window queue views used by office scheduling workflows.

Future confirmation action model (parked for later slice):

- A separate `Confirm Next Due Date` / `Confirm Next Window` action may update:
	- `maintenance_agreements.next_due_date`
	- `maintenance_agreements.updated_by_user_id`
	- `updated_at` via normal DB behavior
- Confirm action should not mutate:
	- `maintenance_agreement_visits`
	- invoices
	- payments
	- jobs
	- service cases

Agreement status gating decision:

- Future confirm action: active agreements only.
- `paused`, `expired`, `cancelled`, and `draft` should block confirm writes.
- Suggestion/read-only guidance may still display informationally when useful.

Template alignment decision (future):

- Service Plan creation should become template-driven.
- Template should supply:
	- agreement name
	- type and frequency
	- default Work Items
	- cadence model (interval or seasonal window)
- Operator should still enter `start_date`.
- `next_due_date` may be suggested from `start_date + cadence` in future flows.
- `renewal_date` should later derive from purchased plan term/payment option.

Explicit non-goals for Group 9A-11A:

- no automatic due-date advancement
- no recurrence engine
- no automatic job generation
- no invoice/payment behavior
- no billing behavior
- no customer portal/SMS/QBO behavior
- no renewal automation
- no template implementation in this slice
- no seasonal-window schema implementation in this slice

## Group 9A-11B Closeout Snapshot (read-only suggested next due projection on job detail)

Group 9A-11B (Read-Only Suggested Next Due / Due Window Projection) is implemented and pushed in commit `d627b91`.

Recorded behavior:

- Job detail now shows a read-only `Suggested next due date` block after a Service Plan visit is counted.
- Projection is suggestion-only with explicit copy:
	- `This is a suggestion only. Confirming next due date will be added later.`
- No `Confirm Next Due Date` button/action is present in this slice.
- Agreement `next_due_date` is not mutated.
- No automatic due-date advancement is introduced.
- No invoice/payment behavior is introduced.
- No recurrence/job generation behavior is introduced.

Projection behavior:

- Supported interval frequencies:
	- `monthly`
	- `quarterly`
	- `semi_annual`
	- `annual`
- Cadence-preserving roll-forward logic:
	- start from current `agreement.next_due_date`
	- add the configured frequency interval
	- if result is on or before counted completion anchor, roll forward by same interval until after anchor
- `custom` frequency or missing `next_due_date` falls back to `Manual scheduling required.`
- Seasonal window support remains model/docs-only in this slice.

Browser validation recorded:

- Fixture IDs:
	- `customer_id = ad18fa80-2817-476b-8fca-bdcf4ff3c3d6`
	- `agreement_id = 454b3737-fa39-46be-8925-45131a571693`
	- `job_id = f6600de6-63d9-4551-94c1-a0b3a8db9a5c`
	- `link_row_id = 307cc7d6-5ef2-4d06-bf8c-25fa828b4d66`
- Pre-count: `Service Plan Visit Count Review` and `Mark Visit Counted` were present.
- Post-count:
	- visit-counted banner appeared
	- `Suggested next due date` block rendered
	- suggestion-only copy rendered
	- no `Confirm Next Due Date` action present
	- `Mark Visit Counted` no longer present
- DB verification after count:
	- link row set to `count_status = counted`
	- `counts_toward_visit_balance = true`
	- `counted_at` populated
	- `counted_by_user_id` populated
	- agreement `next_due_date` remained `2026-06-15`
	- `internal_invoices` count for job remained `0`
	- `internal_invoice_payments` count for job remained `0`

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`61` tests).
- `npx.cmd tsc --noEmit` passed.
- `git diff --check` passed.
- `git status --short` clean.

Boundaries preserved in Group 9A-11B:

- no automatic `next_due_date` advancement
- no `Confirm Next Due Date` action
- no invoice/payment behavior
- no recurrence engine
- no automatic job generation
- no customer portal/SMS/QBO behavior

## Group 9A-11C-A Model Snapshot (confirm next due date planning audit)

Group 9A-11C-A is a docs/model update only. No implementation changes are included in this slice.

First action location decision:

- First confirm action location is job detail, directly under or near the read-only `Suggested next due date` block.
- Customer profile agreement-card confirm action is parked until job-detail V1 confirm behavior is proven.
- `/service-plans` confirm action is parked until job-detail V1 confirm behavior is proven.
- Seasonal due-window queue confirm behavior remains parked until template/window schema exists.

Core rule:

- Suggested next due date must never auto-write.
- Any update to `maintenance_agreements.next_due_date` must be explicit and operator-confirmed.

Required preconditions for future confirm action:

- Maintenance Agreements feature exposure enabled.
- Active internal user context present.
- Agreement status is `active`.
- Link row is `counted` and `counts_toward_visit_balance = true`.
- Suggested next due date exists.
- Agreement frequency is interval-based (`monthly`, `quarterly`, `semi_annual`, `annual`), not manual/custom.
- Account/customer scope matches across job, link, agreement, and customer.
- Agreement `next_due_date` still matches the value used when the suggestion was calculated.

Mutation contract (future confirm action):

- May update only:
	- `maintenance_agreements.next_due_date`
	- `maintenance_agreements.updated_by_user_id`
	- `updated_at` via normal DB behavior
- Must not mutate:
	- `maintenance_agreement_visits`
	- `jobs`
	- `service_cases`
	- calendar events
	- invoices
	- payments

Optimistic concurrency / stale-state rule:

- If agreement `next_due_date` changed after suggestion render, confirm action must fail safely and block the write.
- User should be prompted to refresh and review the latest suggestion before retrying.
- Suggested UX message:
	- `This suggestion is out of date. Refresh and review the latest next due date before confirming.`

Confirmation copy decision:

- `This will update the Service Plan next due date to [date]. It will not create a job, schedule an appointment, create an invoice, collect payment, or renew the plan. Continue?`

Custom/manual frequency decision:

- No confirm action should render.
- `Manual scheduling required.` remains the only guidance.

Seasonal-window decision:

- Seasonal-window confirm behavior remains parked in this slice.
- Future behavior should likely confirm a next service window, not a single `next_due_date`.
- Revisit only after template/window schema is approved.

Explicit non-goals for Group 9A-11C-A:

- no automatic date advancement
- no recurrence engine
- no automatic job generation
- no calendar events
- no invoice/payment behavior
- no customer portal/SMS/QBO behavior
- no renewal automation
- no customer profile confirm action yet
- no `/service-plans` confirm action yet

## Group 9A-11C-B Closeout Snapshot (confirm next due date action on job detail)

Group 9A-11C-B (Confirm Next Due Date Action on Job Detail for Counted Service Plans) is implemented and pushed in commit `c30cbac`.

Recorded implementation artifacts:

- Server action: `confirmMaintenanceAgreementNextDueDateFromForm` in `lib/maintenance-agreements/agreement-actions.ts` (~157 lines)
- Client component: `ConfirmNextDueDateActionButton.tsx` (new file, ~57 lines) in `app/jobs/[id]/_components/`
- Job detail integration: enhanced `app/jobs/[id]/page.tsx` with import, type enhancement, data retrieval, UI button (~16 lines)
- Comprehensive test suite: `confirm-next-due.test.ts` (new file, ~470 lines) with 6 test scenarios

Recorded behavior:

- Job detail page now shows a blue `Confirm Next Due Date` action button for counted Service Plan visits with valid interval-based suggested next due dates.
- Button appears only when:
	- Maintenance Agreements feature exposure enabled
	- Internal user context present
	- Agreement status is `active`
	- Link row is `counted` and `counts_toward_visit_balance = true`
	- Suggested next due date exists and is not marked manual-scheduling-required
	- Agreement frequency is interval-based (`monthly`, `quarterly`, `semi_annual`, `annual`)
- Button is blocked/hidden when:
	- Custom/manual frequency (`custom` shows "Manual scheduling required" text instead)
	- Inactive agreements
	- Non-counted links
	- Feature flag disabled
	- Out-of-scope records
- Confirmation dialog appears on click with approved copy:
	- `This will update the Service Plan next due date to [date]. It will not create a job, schedule an appointment, create an invoice, collect payment, or renew the plan. Continue?`
- User must accept confirmation dialog to proceed with action.

Recorded stale-state protection:

- Server action implements optimistic concurrency guard: compares current `maintenance_agreements.next_due_date` to `baselineNextDueDate` passed from form
- If values do not match (agreement was updated externally after suggestion rendered), action fails safely with banner: `confirm_next_due_stale_state`
- User is redirected with clear failure signal instead of silent override
- Prevents race conditions in concurrent job completion + next-due confirmation scenarios

Recorded mutation contract:

- Updates only:
	- `maintenance_agreements.next_due_date` â†’ set to suggested date value
	- `maintenance_agreements.updated_by_user_id` â†’ set to current internal user ID
	- `updated_at` â†’ updated via normal DB timestamp behavior
- Does not mutate:
	- `maintenance_agreement_visits` link row (count_status remains `counted`)
	- `jobs` table (job record unchanged)
	- `service_cases` table (no records created/modified)
	- calendar events (no calendar behavior)
	- `internal_invoices` (no invoice creation)
	- `internal_invoice_payments` (no payment records)

Recorded scope validation:

- Internal user required via `requireInternalUser()`
- Feature gate: `isMaintenanceAgreementsEnabled()` must return true
- Entitlement check: `resolveOperationalMutationEntitlementAccess()` must authorize
- Account scope: agreement and job must belong to same `account_owner_user_id`
- Customer scope: agreement and job must be linked to same customer
- Link validation: link row must exist with `count_status = 'counted'` and `counts_toward_visit_balance = true`
- Status check: agreement must be `active`
- Frequency check: agreement must have interval-based frequency (not custom/manual)

Recorded preconditions/blocking rules:

| Condition | Blocking | Banner | Test |
|-----------|----------|--------|------|
| Valid state, baseline matches | âœ… Proceed | confirm_next_due_saved | âœ… |
| Stale baseline (current â‰  baseline) | âœ… Block | confirm_next_due_stale_state | âœ… |
| Custom/manual frequency | âœ… Block | confirm_next_due_custom_frequency | âœ… |
| Agreement not active | âœ… Block | confirm_next_due_agreement_inactive | âœ… |
| Link not counted or not counts_toward_visit_balance | âœ… Block | confirm_next_due_not_counted | âœ… |
| Feature flag disabled | âœ… Block | confirm_next_due_unavailable | âœ… |
| Out-of-scope (account/customer mismatch) | âœ… Block | (scope validation error) | âœ… |

Recorded revalidation paths:

- `/jobs/{jobId}` â€” refreshes job detail UI and suggestion block
- `/service-plans` â€” refreshes service plans drilldown if user navigates there
- `/customers/{customerId}` â€” refreshes customer profile if user navigates there

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (67/67 tests):
	- 6 new tests for confirm action (success, stale-state, frequency/status/link validation, feature flag)
	- 61 existing tests still passing (link/exposure/read-model/action suite)
- `npx.cmd tsc --noEmit` passed (no type errors)
- `git diff --check` passed (no blocking issues)
- Working tree clean after commit
- Commit `c30cbac` pushed to `origin/main`

Test scenarios validated:

1. **Success**: Valid interval frequency, matched baseline â†’ agreement.next_due_date updates to suggested date, updated_by_user_id populated, revalidation triggered âœ…
2. **Stale-state protection**: Current agreement.next_due_date â‰  baseline â†’ fails with stale_state banner, no update âœ…
3. **Custom frequency blocking**: frequency='custom' â†’ fails with custom_frequency banner, button not rendered âœ…
4. **Inactive agreement blocking**: statusâ‰ 'active' â†’ fails with agreement_inactive banner âœ…
5. **Non-counted link blocking**: count_statusâ‰ 'counted' or counts_toward_visit_balance=false â†’ fails with not_counted banner âœ…
6. **Feature flag enforcement**: flag disabled â†’ fails with unavailable banner âœ…

Browser smoke testing decision:

- Browser click-through testing deferred due to complexity of authenticated session setup
- Decision: Unit test coverage is sufficient (67/67 passing)
	- Stale-state guard validated by dedicated test
	- All preconditions and blocking rules unit-tested
	- Scope enforcement verified
	- Mutation contract verified (only agreement fields updated, no side effects)
	- Component structure validated
- Browser smoke should be performed later in staging with ready authenticated fixture

Boundaries preserved in Group 9A-11C-B:

- no automatic `next_due_date` advancement
- no recurrence engine
- no automatic job generation
- no calendar events
- no invoice/payment behavior
- no Stripe/QBO/SMS/customer portal behavior
- no renewal automation
- no schema changes
- no migrations
- no Supabase commands executed
- no production writes
- no feature flag changes
- no customer profile confirm action yet (parked)
- no `/service-plans` confirm action yet (parked)
- no seasonal-window confirm behavior yet (parked)

Implementation status statement:

- Confirm Next Due Date action is implemented on job detail only.
- Action is operator-confirmed (not automatic).
- Stale-state protection prevents race conditions.
- Narrow mutation contract isolates side effects.
- Customer profile and `/service-plans` confirm actions remain parked until job-detail V1 is proven in real usage.
- Seasonal-window confirm behavior remains parked until template/window schema is approved.

Watch items:

- Browser click-through validation should be performed later in staging or with ready authenticated fixture
- Seasonal-window confirm behavior remains parked for V2 or later
- Customer profile and `/service-plans` confirm surfaces remain parked for future implementation
- Multi-surface confirms deferred per user requirements

## Group 9A-13A Closeout Snapshot (service-plan prefill structured Work Item validation fix)

Group 9A-13A (Service Plan Work Items Prefill Structured Validation Fix) is implemented and pushed in commit `a116c1e`.

Recorded root cause:

- Service Plan default Work Items could be stored in legacy/default shapes (`item_name`, `description`, `pricebook_item_id`, `default_unit_price`) instead of canonical fields (`title`, `details`, `source_pricebook_item_id`, `expected_unit_price`).
- During `/jobs/new` prefill, these legacy/default shapes could degrade into blank/untitled Work Item behavior.
- Client-side submit gate could then block Service job creation with: `Add at least one structured Work Item before creating a Service job.`

Recorded implementation artifacts:

- Read-path normalization added in `lib/maintenance-agreements/read-model.ts` before prefill sanitization.
- Regression coverage added in `lib/maintenance-agreements/__tests__/read-model.test.ts` for legacy/default shape aliases.

Recorded fix behavior:

- Service Plan prefill now normalizes legacy/default Work Item keys into canonical structured Work Item fields before `sanitizeVisitScopeItems`.
- Valid legacy/default Work Item data survives into `/jobs/new` prefill and renders meaningful titles.
- `/jobs/new` can submit without manual Pricebook reselection when prefilled Service Plan Work Item data is valid.

Browser smoke validation recorded (sandbox/local):

- customer id: `8e3c6860-e4c3-4a93-83cb-2e91c49f883f`
- agreement id: `52851fbf-0e65-482d-868a-1c858521d128`
- created job id: `99c1acff-6d38-4aa9-ade0-954a50a14998`
- rendered Work Item title: `Legacy Compressor Diagnostic` (not `Untitled Work Item`)
- submit succeeded without manual Pricebook reselection
- persisted `visit_scope_items` included:
	- `title = Legacy Compressor Diagnostic`
	- `details = Validate compressor hard-start and capacitor tolerance`
	- `source_pricebook_item_id` populated
	- `expected_unit_price = 189`
- side-effect checks:
	- no invoice/payment rows created
	- agreement `next_due_date` remained `2026-06-15`
	- new maintenance-agreement link row remained `linked` and not counted

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__/read-model.test.ts lib/jobs/__tests__/new-job-defaults.test.ts` passed (`35/35` tests)
- `npx.cmd tsc --noEmit` passed
- `git diff --check` passed
- `git status --short` clean

Boundaries preserved in Group 9A-13A:

- no visit-counting changes
- no next-due-date changes
- no invoice/payment behavior changes
- no schema changes
- no migrations
- no feature flag changes
- no recurrence/job-generation changes
- no Supabase production writes

Watch item:

- A temporary sandbox auth user may remain due to sandbox cleanup delete error; this is sandbox cleanup scope only and not product behavior scope.

## Group 9A-13B-A Model Snapshot (next due idempotency before persistent confirm UI)

Group 9A-13B-A (Next Due Idempotency Model Docs) is a docs/model decision pass only. No implementation changes are included in this slice.

Audit verdict context:

- Group 9A-13B audit found Suggested Next Due and Confirm Next Due visibility is currently both banner-gated and counted-link-gated.
- Current gating avoids noisy persistent UI but does not provide durable idempotency if confirm becomes persistent.
- Recommended outcome is C: add durable idempotency marker before persistent confirm.

Core problem statement:

- Suggested Next Due currently depends on transient URL banner state.
- Persistent next-due context is desirable for usability.
- Persistent Confirm Next Due Date is unsafe without durable per-link confirmation tracking.
- The same counted link could be reused to recompute from newly advanced agreement `next_due_date` and offer another advancement.

Model decision:

- Add durable next-due confirmation metadata to `maintenance_agreement_visits`.
- The visit link is the correct idempotency surface because the counted visit is the business event causing the next-due write.

Proposed future fields on `maintenance_agreement_visits`:

- `next_due_confirmed_at` timestamp nullable
- `next_due_confirmed_by_user_id` uuid nullable
- `confirmed_next_due_date` date nullable
- `baseline_next_due_date` date nullable

Field meanings:

- `baseline_next_due_date` = agreement `next_due_date` value used when suggestion was confirmed
- `confirmed_next_due_date` = date written to `maintenance_agreements.next_due_date`
- `next_due_confirmed_at` = timestamp when this link confirmed the update
- `next_due_confirmed_by_user_id` = internal user who confirmed

Future confirm action rule:

- Confirm Next Due Date may update agreement `next_due_date` and visit-link confirmation metadata together.
- Treat this as one logical operation.
- If link already has `next_due_confirmed_at` or `confirmed_next_due_date`, action must not advance the date again.

Persistent UI rule:

- Counted visit may show persistent read-only next-due context after reload.
- Confirm button should render only for counted links that have not already confirmed next due.
- After confirmation, show read-only confirmation context instead of another confirm action.

Stale-state rule remains:

- Agreement `next_due_date` must still match `baseline_next_due_date` before confirm.
- If mismatch, fail safely and ask user to refresh/review latest suggestion.

V1 non-goals for this model pass:

- no automatic due-date advancement
- no recurring job generation
- no seasonal window implementation yet
- no invoice/payment behavior
- no customer portal/SMS/QBO
- no reversal/adjustment UI yet
- no full event-log/audit timeline beyond minimal link confirmation metadata

Recommended implementation sequence:

- 9A-13B-B: schema foundation for metadata columns, read-model support, and tests
- 9A-13B-C: update confirm action to write agreement plus link metadata safely
- 9A-13B-D: make read-only next-due context persistent and hide confirm after link confirmation
- Browser smoke only after full idempotency path is wired in sandbox

## Group 9A-13B-B Closeout Snapshot (next due confirmation metadata foundation)

Group 9A-13B-B (Next Due Confirmation Metadata Foundation) is implemented and pushed in commit `91d900a`.

Recorded migration artifact:

- File: `supabase/migrations/20260514120000_maintenance_agreement_visits_next_due_confirmation_metadata.sql`
- Adds four nullable metadata columns to `maintenance_agreement_visits`:
	- `next_due_confirmed_at` timestamptz nullable
	- `next_due_confirmed_by_user_id` uuid nullable, FK to `auth.users(id)` ON DELETE SET NULL
	- `confirmed_next_due_date` date nullable
	- `baseline_next_due_date` date nullable
- No existing rows backfilled.
- No count_status or agreement mutation changes in this slice.
- No delete policy changes.

Recorded read-model artifacts:

- `MaintenanceAgreementVisitLinkRow` type extended with four metadata fields.
- `normalizeMaintenanceAgreementVisitLinkRow` extended to normalize metadata fields safely to `string | null`.
- New export: `hasMaintenanceAgreementVisitConfirmedNextDue(link)` â€” returns confirmed boolean from `next_due_confirmed_at` or `confirmed_next_due_date`.
- Four metadata fields added to `select(...)` lists in:
	- `listMaintenanceAgreementVisitsForAgreement`
	- `listMaintenanceAgreementLinksForJob`
	- Drilldown link projection used by `listMaintenanceAgreementDrilldownForAccount`
- No UI behavior changes in this slice.
- No Confirm Next Due Date action behavior expanded.

Recorded test coverage:

- `MockAgreementVisitLink` type updated with four metadata fields.
- `makeAgreementVisitLink` default values set to null for all four metadata fields.
- Existing list-visits-for-agreement test verifies new fields are selected and returned as null.
- New test: missing metadata means unconfirmed (`hasMaintenanceAgreementVisitConfirmedNextDue` returns false).
- New test: populated metadata means confirmed (`hasMaintenanceAgreementVisitConfirmedNextDue` returns true).
- Existing count/used-visit projections verified unchanged.

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (70/70)
- `npx.cmd tsc --noEmit` passed
- `git diff --check` passed
- `git status --short` clean
- Commit `91d900a` pushed to `origin/main`

Boundaries preserved in Group 9A-13B-B:

- no UI behavior changes
- no Confirm Next Due Date action behavior changes
- no agreement mutation changes
- no count_status lifecycle changes
- no automatic due-date advancement
- no recurrence engine
- no invoice/payment/calendar behavior
- no feature flag changes
- no production migration apply
- no production writes

## Group 9A-13B-B1 Sandbox Migration Apply + Verification Closeout

Group 9A-13B-B1 (Sandbox Migration Apply + Verification) is complete.

Preflight:

- Branch: `main`
- Working tree: clean
- Linked sandbox ref: `kvpesjdukqwwlgpkzfjm` (CMTest)
- Production ref not targeted: `ornrnvxtwwtulohqwxop` (ComplianceMatters)

Migration applied to sandbox:

- `20260514120000_maintenance_agreement_visits_next_due_confirmation_metadata.sql`
- Confirmed in migration history: local and remote both show `20260514120000`

Post-apply data verification:

- Existing row count: 8
- Non-null count for all four new metadata fields: 0 (no backfill occurred)
- Sample existing rows: all four metadata fields are null
- No errors querying any of the four new columns

Supplemental Docker-backed schema verification (completed after Docker became available):

- `supabase db dump --linked --schema public` executed successfully
- All four metadata columns confirmed present and nullable in dump
- FK confirmed: `maintenance_agreement_visits_next_due_confirmed_by_user_id_fkey` â†’ `auth.users(id)` ON DELETE SET NULL
- RLS confirmed enabled: `ALTER TABLE public.maintenance_agreement_visits ENABLE ROW LEVEL SECURITY` present in dump
- Policies confirmed present:
	- `maintenance_agreement_visits_select_account_scope`
	- `maintenance_agreement_visits_insert_account_scope`
	- `maintenance_agreement_visits_update_account_scope`
- No DELETE policy found on `maintenance_agreement_visits`
- Temporary dump file removed before closeout

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (70/70)
- `npx.cmd tsc --noEmit` passed
- `git diff --check` passed
- `git status --short` clean
- No migration apply was run in the supplemental verification pass
- No data written in either verification pass
- Production migration not applied

## Group 9A-13B-C / 13B-C1 Closeout Snapshot (idempotent confirm write + browser smoke + display formatting fix)

Group 9A-13B-C (safe confirm write using link metadata idempotency truth) is implemented and pushed in commit `3e8c769`.

Group 9A-13B-C1 browser smoke validated idempotent confirm behavior on fixture records:

- `job_id = f6600de6-63d9-4551-94c1-a0b3a8db9a5c`
- `agreement_id = 454b3737-fa39-46be-8925-45131a571693`
- `link_row_id = 307cc7d6-5ef2-4d06-bf8c-25fa828b4d66`

Recorded behavior in this closeout:

- Confirm Next Due Date now writes both surfaces together on success:
	- `maintenance_agreements.next_due_date`
	- `maintenance_agreement_visits` next-due confirmation metadata fields
- Metadata written on success:
	- `baseline_next_due_date`
	- `confirmed_next_due_date`
	- `next_due_confirmed_at`
	- `next_due_confirmed_by_user_id`
- Link metadata is the idempotency truth for this action.
- A counted visit can confirm next due once.
- Repeat confirm from the same counted visit is blocked with banner `confirm_next_due_already_confirmed`.
- Existing stale-state guard remains intact.
- Confirm surface remains job-detail-only in this slice.
- No customer profile confirm surface.
- No `/service-plans` confirm surface.
- No persistent next-due UI expansion yet.

Recorded browser smoke outcome:

- First confirm redirected with `?banner=confirm_next_due_saved`.
- Agreement `next_due_date` moved from `2026-07-15` to `2026-08-15`.
- Link metadata captured expected values:
	- `confirmed_next_due_date = 2026-08-15`
	- `baseline_next_due_date = 2026-07-15`
	- `next_due_confirmed_at` populated
	- `next_due_confirmed_by_user_id` populated
- Link count flags remained unchanged:
	- `count_status = counted`
	- `counts_toward_visit_balance = true`
- Job remained `completed / invoice_required`.
- Invoices created remained `0`.
- Repeat confirm redirected with `?banner=confirm_next_due_already_confirmed`.

Display-only follow-up fix:

- Commit `fb621c7` fixed confirm-dialog date rendering for date-only values.
- Root cause: timezone shift risk when date-only values were interpreted via JavaScript Date parsing.
- Fix behavior: dialog now formats `YYYY-MM-DD` directly as `MM/DD/YYYY`.
- Example: stored `2026-08-15` displays as `08/15/2026`.
- Stored values and hidden form values remain `YYYY-MM-DD`.
- No date calculation changes.
- No server action behavior changes.

Validation recorded for 13B-C / 13B-C1 and display fix:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (71/71)
- `npx.cmd tsc --noEmit` passed
- `git diff --check` passed
- `git status --short` clean after push

Boundaries preserved in Group 9A-13B-C / 13B-C1:

- no automatic due-date advancement
- no recurrence engine
- no automatic job generation
- no invoice/payment behavior changes
- no customer portal/SMS/QBO behavior
- no customer profile confirm surface
- no `/service-plans` confirm surface
- no persistent next-due UI expansion yet
- no schema changes
- no migrations
- no Supabase commands
- no production writes
- no feature-flag changes

## Group 9A-13B-D1 / 13B-D2 Closeout Snapshot (persistent next-due context + banner/date display consistency)

Group 9A-13B-D1 (Persistent Next Due Context on Job Detail) is implemented and pushed in commit `ba18ff3`.

Recorded D1 behavior:

- Job detail next-due context is now derived from durable counted-link state, not transient banner state.
- Counted unconfirmed link:
	- shows `Suggested next due date`
	- shows `Confirm Next Due Date`
- Counted confirmed link:
	- shows read-only confirmed context
	- hides `Confirm Next Due Date`
- Confirmed read-only copy:
	- `Next due date already confirmed for this counted visit.`
	- `Confirmed: MM/DD/YYYY`
	- `Previous due date: MM/DD/YYYY`
- `Mark Visit Counted` behavior is preserved for eligible uncounted links.

Validation recorded for 13B-D1:

- `npx.cmd tsc --noEmit` passed
- `git diff --check` passed
- browser smoke passed for confirmed and unconfirmed counted-job states

Group 9A-13B-D2 (Confirm Next Due Banner Mapping + Date Display Consistency) is implemented and pushed in commit `b5f7bd8`.

Recorded D2 behavior:

- Added explicit banner mappings:
	- `confirm_next_due_saved`: `Service Plan next due date updated.`
	- `confirm_next_due_already_confirmed`: `This visit has already confirmed the Service Plan next due date.`
	- `confirm_next_due_stale_state`: `This suggestion is out of date. Refresh and review the latest next due date before confirming.`
	- `confirm_next_due_not_counted`: `This visit must be counted before confirming the next due date.`
	- `confirm_next_due_unavailable`: `Service Plan next due confirmation is currently unavailable.`
	- `confirm_next_due_update_failed`: `Could not update the Service Plan next due date. Please try again.`
- Unified job-detail Service Plan next-due display to `MM/DD/YYYY` using date-only parsing.
- Suggested panel and confirm dialog display now use date-only `MM/DD/YYYY` formatting.
- Stored values and hidden form values remain `YYYY-MM-DD`.
- No date calculation logic changed.
- No server action behavior changed.

Validation recorded for 13B-D2:

- `npx.cmd tsc --noEmit` passed
- `git diff --check` passed
- browser smoke confirmed `MM/DD/YYYY` display and confirm-next-due banner copy

Boundaries preserved in Group 9A-13B-D1 / 13B-D2:

- no automatic due-date advancement
- no recurrence engine
- no automatic job generation
- no invoice/payment behavior
- no customer portal/SMS/QBO
- no customer profile confirm surface
- no `/service-plans` confirm surface
- no schema changes
- no migrations
- no Supabase commands
- no production writes
- no feature-flag changes

## Group 9A-14B / 9A-14C Closeout Snapshot (service-plans navigation polish + customer-profile snapshot-first clarity)

Group 9A-14B (Service Plans Drilldown Navigation Polish) is complete and pushed in commit `f05bc29`.

Recorded 14B behavior:

- `/service-plans` remains read-only.
- Each Service Plan name now links to the focused agreement card on customer profile:
	- `/customers/{customerId}?maFocus={agreementId}#maintenance-agreement-{agreementId}`
- Added read-only `Manage on Customer` deep-link on each drilldown row.
- Customer profile agreement cards expose stable anchor ids (`maintenance-agreement-{agreementId}`).
- Focused agreement card receives subtle highlight styling when `maFocus` is present.
- `/service-plans` helper copy now explicitly directs edit/create-work-order/default-Work-Items actions to customer profile.
- No mutation controls were added to `/service-plans`.

Group 9A-14C (Service Plan Detail Snapshot on Customer Profile) is complete and pushed in commit `eefae0b`.

Recorded 14C behavior:

- Customer profile Maintenance Agreement / Service Plan cards now show a read-only `Plan Snapshot` before edit controls.
- Snapshot fields include:
	- plan name
	- status
	- frequency
	- start date
	- next due date
	- renewal date
	- primary location
	- visit links and used visits (where available)
- Added read-only `What's Included` section using default Work Items.
- Empty-state copy is now: `No default Work Items saved for this plan yet.`
- `Create Work Order` remains prominent.
- `Edit Details` remains available as secondary/collapsed control.

Validation recorded for 14B / 14C:

- `npx.cmd tsc --noEmit` passed
- `git diff --check` passed
- Browser smoke passed:
	- `/service-plans` opened
	- Service Plan deep-link navigated to focused customer agreement card
	- focused-card anchor/highlight worked
	- `Plan Snapshot` visible
	- `What's Included` visible
	- `Create Work Order` remained available
	- `Edit Details` remained collapsed/secondary
	- `/service-plans` remained read-only

Boundaries preserved in Group 9A-14B / 9A-14C:

- no persistence logic changes
- no server action changes
- no visit-counting behavior changes
- no next-due behavior changes
- no invoice/payment behavior changes
- no calendar/recurrence behavior changes
- no schema changes
- no migrations
- no Supabase commands
- no production writes
- no feature-flag changes

Service Plans / Maintenance Agreements status:

- Closed for now after 9A-14A, 9A-14B, and 9A-14C.
- Reopen only for real-world workflow bugs or strongly validated user feedback.
- Do not add more Service Plan capability in the next pass.

## Group 9A-8B Closeout Snapshot (service plans read-only drilldown page + ops link implemented in repo)

Group 9A-8B (Service Plans Read-Only Drilldown Page + Ops Link) is implemented and pushed.

Recorded implementation artifacts:

- New read-only route: `app/service-plans/page.tsx`
- Optional route loading state: `app/service-plans/loading.tsx`
- Ops link placement: `app/ops/page.tsx` (Service Plans summary card)
- Account-scoped drilldown helper: `listMaintenanceAgreementDrilldownForAccount` in `lib/maintenance-agreements/read-model.ts`
- Targeted test expansion: `lib/maintenance-agreements/__tests__/read-model.test.ts`

Recorded behavior:

- `/ops` Service Plans summary card now includes `View Service Plans` when feature-gated.
- `/ops` remains summary-only; full list read happens only on `/service-plans`.
- `/service-plans` is internal/account-scoped and read-only.
- `/service-plans` remains feature-gated behind `ENABLE_MAINTENANCE_AGREEMENTS`.
- Drilldown helper is account-scoped and capped.
- Page shows read-only plan rows with customer/location/status/type/frequency/next due/due state.
- Customer names link to existing customer detail pages.
- Filters exposed on `/service-plans`:
	- all
	- active
	- overdue
	- due today
	- due 1-7 days
	- due 8-30 days
	- not scheduled
	- inactive

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`34` tests).
- `npx.cmd tsc --noEmit` passed.
- `git diff --check` passed (no blocking errors).
- Browser smoke:
	- flag off: Ops hides Service Plans link; /service-plans redirects/fails closed
	- flag on: Ops link visible; /service-plans renders rows and customer links
	- all filter chips manually tested successfully
	- Ops continuity confirmed

Boundaries preserved in Group 9A-8B:

- no create/edit on drilldown page
- no Create Work Order action on drilldown page
- no job generation
- no due date advancement
- no visit-balance deduction
- no invoice/payment behavior
- no Stripe/QBO/SMS/customer portal behavior
- no heavier ops drilldown query

Watch item:

- Helper bucket logic remains covered by targeted tests alongside manual browser filter-chip validation.

## Group 9A-7B Closeout Snapshot (manual Create Work Order from Service Plan prefill V1 implemented in repo)

Group 9A-7B (Manual Create Work Order from Service Plan Prefill V1) is implemented and pushed in commit `3c186e5`.

Recorded implementation artifacts:

- Customer profile entry point: `app/customers/[id]/page.tsx`
- `/jobs/new` server-side resolver: `app/jobs/new/page.tsx`
- Form prefill wiring: `app/jobs/new/NewJobForm.tsx`
- Scoped prefill read model helper: `lib/maintenance-agreements/read-model.ts`
- Targeted resolver tests: `lib/maintenance-agreements/__tests__/read-model.test.ts`

Recorded behavior:

- Maintenance Agreement cards now expose a compact `Create Work Order` entry point when feature-gated.
- Link uses lightweight params only: `customer_id` and `maintenance_agreement_id`.
- No Work Item JSON is passed through URL params.
- `/jobs/new` resolves service-plan prefill server-side only when all of the following are true:
	- `ENABLE_MAINTENANCE_AGREEMENTS` is enabled
	- internal context is present
	- ids are valid UUIDs
	- account/customer scope matches
- `NewJobForm` receives safe prefill props and remains fully editable by operator:
	- customer preselection
	- primary location preselection when valid
	- service defaults
	- `service_case_kind = maintenance`
	- `service_visit_type = maintenance`
	- Reason for Visit from agreement default summary
	- sanitized default Work Items when valid
	- non-persisted agreement context banner (name + due date)
- Invalid/unavailable agreement prefill fails safely with a non-blocking warning.
- Submit path remains the existing normal create flow (`createJobFromForm`), creating a normal job/work order.
- Agreement record is not mutated by job creation.

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__ lib/jobs/__tests__/new-job-defaults.test.ts` passed (`4` files, `36` tests).
- `npx.cmd tsc --noEmit` passed.
- Browser smoke passed with `ENABLE_MAINTENANCE_AGREEMENTS=true`:
	- `Create Work Order` link visible on agreement card
	- `/jobs/new` opened with service-plan prefill banner
	- customer/location preselected
	- maintenance defaults present
	- reason/dispatch notes prefilled
	- normal job created via existing flow
	- agreement unchanged after submit
	- invalid agreement id failed safely
	- existing customer profile and `/jobs/new` still rendered

Boundaries preserved in Group 9A-7B:

- no schema changes
- no migrations
- no Supabase commands
- no production writes
- no feature flag changes
- no automatic job generation
- no calendar events
- no invoice/payment behavior
- no Stripe/QBO/SMS/customer portal behavior
- no next due date advancement
- no visit-balance deduction
- no persisted job/agreement linkage

Watch items:

- ECC-locked product-mode UI can still show ECC-oriented presentation copy while service-plan prefill applies service/maintenance defaults.
- Relationship-context logs briefly showed both ECC and Service during dev interaction transitions; final create succeeded.
- Sandbox/local smoke created test job `bb30cd33-f4a4-4a02-a006-98a9319f77d6`.

## Group 9A-6 Closeout Snapshot (ops read-only service plans card implemented in repo)

Group 9A-6 (Service Plans Ops Read-Only Card) is implemented and pushed in commit `1776042`.

Recorded implementation artifacts:

- Ops page card: `app/ops/page.tsx`
- Read model source: `summarizeMaintenanceAgreementsForAccount`

Recorded behavior:

- `/ops` now has a feature-gated, read-only Service Plans summary card.
- Card renders only when `ENABLE_MAINTENANCE_AGREEMENTS` is enabled.
- Card shows: `Active Plans`, `Overdue`, `Due Today`, `Due in 1-7 Days`, `Due in 8-30 Days`, `Not Scheduled`.
- Card helper copy: "Service plan counts are planning visibility only. Work orders are created separately."
- Read failure is fail-safe: `/ops` still renders and the card is hidden/non-blocking.
- No actions/buttons/routes were added.

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`28` tests).
- `npx.cmd tsc --noEmit` passed.
- `git diff --check` passed.
- Browser smoke passed:
	- flag off: `/ops` rendered, card hidden, existing sections still rendered
	- flag on: `/ops` rendered, card visible, counts rendered, existing sections still rendered

Boundaries preserved in Group 9A-6:

- no schema changes
- no migrations
- no Supabase commands
- no production writes
- no feature flag changes
- no job generation
- no calendar events
- no invoice/payment behavior
- no Stripe/QBO/SMS/customer portal behavior
- no create/edit from Ops

Implementation status statement:

- Service Plan counts and due/overdue summary logic are implemented in the repo/read model and now exposed on `/ops` as a feature-gated read-only card, but no broader user-facing Service Plans module dashboard exists yet.

Watch items:

- `as_of_date` currently reflects server date resolution; standardize business-timezone date source later if needed.
- Due windows are intentionally exclusive: `1-7` and `8-30`.

## Group 9A-5B Closeout Snapshot (due/overdue summary read model implemented in repo)

Group 9A-5B (Service Plan Due/Overdue Summary Read Model) is implemented, committed, and pushed.

Recorded implementation artifacts:

- Read model summary function: `summarizeMaintenanceAgreementsForAccount` in `lib/maintenance-agreements/read-model.ts`
- Tests: `lib/maintenance-agreements/__tests__/read-model.test.ts`

Recorded summary output:

- `status_counts`: `active`, `draft`, `paused`, `expired`, `cancelled`
- `due_counts`: `overdue`, `due_today`, `due_in_next_7_days`, `due_in_next_30_days`, `not_scheduled_active`
- `total_count`
- `as_of_date`

Recorded rules:

- strict `account_owner_user_id` scoping
- due buckets include active agreements only
- inactive statuses are excluded from due queue buckets
- `not_scheduled_active` means active with missing/invalid `next_due_date`
- as-of date is resolved once for consistent due-state calculations
- missing/invalid scope returns safe empty/default summary

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`28` tests).
- `npx.cmd tsc --noEmit` passed.
- `git diff --check` passed aside from normal LF/CRLF warnings.

Boundaries preserved in Group 9A-5B:

- existing customer/location/upcoming list behavior unchanged
- no UI changes
- no new routes
- no ops card
- no schema changes
- no migrations
- no Supabase commands
- no production writes
- no feature flag changes
- no job generation
- no calendar events
- no invoices/payments
- no Stripe/QBO/SMS/customer portal behavior

Implementation status statement:

- Service Plan counts and due/overdue summary logic are implemented in the repo/read model, but no user-facing module dashboard or Ops card exists yet.

Watch item:

- Due-window buckets are currently exclusive/non-overlapping by design. Future UI labels should avoid confusion by using explicit ranges such as Overdue, Due Today, Due in 1-7 Days, and Due in 8-30 Days, or otherwise clearly explain counting logic.

## Group 9A-4 Closeout Snapshot (create/edit V1 implemented in repo, sandbox-ready behind feature gating)

Group 9A-4 (Maintenance Agreement Create/Edit V1) is implemented and pushed in commit `9f81d6f`.

Recorded implementation artifacts:

- Server actions: `lib/maintenance-agreements/agreement-actions.ts`
- Customer profile create/edit forms: `app/customers/[id]/page.tsx`
- Tests: `lib/maintenance-agreements/__tests__/agreement-actions.test.ts`

Recorded create fields:

- `agreement_name`
- `agreement_type`
- `frequency`
- `next_due_date`
- `start_date`
- `renewal_date` (optional)
- `primary_location_id` (optional)
- `default_visit_scope_summary` (optional)
- `internal_notes` (optional)

Recorded edit fields:

- same fields as create
- `status`

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`26` tests).
- `npx.cmd tsc --noEmit` passed.
- Browser smoke passed for create and edit flow, including:
	- `maSaved=created` and `maSaved=updated` redirect states
	- updated card content showing renamed agreement and `Active` status
	- existing customer profile sections still rendering after mutation flows

Boundaries preserved in Group 9A-4:

- no delete
- no customer reassignment
- no preferred technician UI
- no multi-location support
- no job generation
- no calendar events
- no invoices or payments
- no Stripe tenant payment behavior
- no QBO
- no SMS
- no customer portal exposure
- no production migration apply or flag enablement

Implementation status statement:

- Maintenance Agreements create/edit is implemented in repo and sandbox-ready behind feature gating, but production remains inactive until migration apply and flag enablement are intentionally approved.

## Group 9A-3 Closeout Snapshot (read-only customer profile section, not production-active)

Group 9A-3 (Customer Profile Read-Only Agreement Display) is implemented and pushed in commit `09edc9f`.

Recorded implementation artifacts:

- Feature flag: `lib/maintenance-agreements/agreement-exposure.ts`
- Customer profile section: `app/customers/[id]/page.tsx` (guarded read + display section)
- Tests: `lib/maintenance-agreements/__tests__/agreement-exposure.test.ts`

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`21` tests: 14 exposure + 7 read-model).
- `npx.cmd tsc --noEmit` passed.

Production guard:

- The section is gated by `isMaintenanceAgreementsEnabled()` reading `ENABLE_MAINTENANCE_AGREEMENTS`.
- Default is `false`. Production never attempts a read against `maintenance_agreements` until the flag is explicitly enabled after migration apply.
- Secondary guard: the read call is wrapped in a `try/catch` that returns `[]` on error.

Boundaries preserved in Group 9A-3:

- no create/edit agreements
- no job generation from agreements
- no calendar events
- no invoices or payments
- no Stripe tenant payment behavior
- no QBO
- no SMS
- no customer portal exposure
- no production migration apply

Watch item:

- Visual sandbox smoke with `ENABLE_MAINTENANCE_AGREEMENTS=true` was not completed in this session. Smoke to confirm: empty state renders, page does not crash, existing jobs/service-case/history sections still render.

---

## Group 9A-2 Closeout Snapshot (implemented in repo, not production-active)

Group 9A-2 (Maintenance Agreements Schema + RLS + Read Model V1) is implemented and pushed in commit `b126ff6`.

Recorded implementation artifacts:

- Migration file: `supabase/migrations/20260512120000_maintenance_agreements_v1.sql`
- Read model: `lib/maintenance-agreements/read-model.ts`
- Tests: `lib/maintenance-agreements/__tests__/read-model.test.ts`

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__/read-model.test.ts` passed (`7` tests).
- `git diff --check` passed.
- `npx.cmd tsc --noEmit` passed.

Boundaries preserved in Group 9A-2:

- no job linkage
- no job generation
- no calendar events
- no invoices
- no payments
- no Stripe tenant payment behavior
- no QBO
- no SMS
- no portal
- no UI mutation flow
- no production migration apply

Environment activation rule:

- Maintenance Agreements V1 backend foundation is committed in repo, but it is not production-active until `20260512120000_maintenance_agreements_v1.sql` is intentionally applied through the appropriate environment process.

## Naming

Preferred future domain/table name:

- `maintenance_agreements`

Avoid:

- `service_contracts`

Reason: existing code and docs already use "service contract" language around service-case/job classification, including service case kind, service visit type, and job detail updates. That language is related but separate. Maintenance Agreements must not inherit that collision.

## Source-Of-Truth Boundaries

A Maintenance Agreement is:

- a customer-owned recurring service agreement
- optionally anchored to one primary location in V1
- a planner for future service visits / work orders
- a source for editable default visit notes and default Work Items / Visit Scope

A Maintenance Agreement is not:

- a Job
- a Service Case
- an Invoice
- a Payment
- a recurring billing subscription
- a Pricebook item

Actual visits remain normal Jobs. Actual visit work remains Work Items / Visit Scope on the Job. Invoice Charges remain billed truth. Payments remain collected truth only where implemented.

Pricebook may assist later with templates/defaults, but Pricebook must not become agreement truth.

V1 must avoid uncontrolled automatic job generation.

## V1 Location Scope

V1 supports at most one optional primary location:

- `primary_location_id` may be null.
- If present, it anchors the agreement to one customer location.
- Multi-location agreements are future scope.

Future multi-location support should use an explicit relationship such as a join table rather than overloading the V1 primary location field.

## Suggested Future Fields

The future `maintenance_agreements` model should evaluate these fields:

| Field | Purpose |
|---|---|
| `id` | Primary identifier. |
| `account_owner_user_id` | Tenant/account scope. |
| `customer_id` | Customer who owns the agreement. |
| `primary_location_id` | Optional V1 location anchor. |
| `agreement_name` | Human-readable agreement name. |
| `agreement_type` | `maintenance`, `service_plan`, `inspection`, or `other`. |
| `frequency` | `monthly`, `quarterly`, `semi_annual`, `annual`, or `custom`. |
| `next_due_date` | Planning date used for upcoming/overdue lists. |
| `preferred_technician_user_id` | Optional preferred/default internal technician. |
| `default_visit_scope_summary` | Optional default service notes / visit reason. |
| `default_visit_scope_items` | JSON default Work Items / Visit Scope template, default `[]`. |
| `status` | Lifecycle status. |
| `start_date` | Agreement start date. |
| `renewal_date` | Agreement renewal date. |
| `internal_notes` | Internal-only notes. |
| `created_by_user_id` | Creator/audit reference. |
| `updated_by_user_id` | Last updater/audit reference. |
| `created_at` | Creation timestamp. |
| `updated_at` | Update timestamp. |

The default visit scope fields are planning defaults only. When a Job is created from an agreement, copied Work Items must remain editable job-level operational scope.

## Lifecycle Statuses

Recommended V1 statuses:

| Status | Meaning |
|---|---|
| `draft` | Agreement is being prepared and should not appear in the active due queue. |
| `active` | Agreement is active and eligible for upcoming/overdue planning. |
| `paused` | Agreement is temporarily excluded from due planning. |
| `expired` | Agreement term ended and is retained for history. |
| `cancelled` | Agreement intentionally ended and is excluded from due planning. |

Only `active` agreements should drive the primary upcoming/overdue planning list in V1.

## V1 Workflow

1. Create agreement from the customer profile.
2. Optionally select one primary location.
3. Store default notes / visit scope template on the agreement.
4. Show upcoming and overdue agreements by `next_due_date`.
5. Operator manually creates a normal Job / Work Order from the agreement.
6. Job receives editable prefilled Work Items / Visit Scope.
7. Operator schedules and assigns the Job through the normal job/calendar flow.
8. Invoices and payments remain untouched.

The manual create step is the V1 control point. No background process should create Jobs from agreements.

## Relationship To Existing Surfaces

Customer profile:

- Primary management surface for agreements.
- Should show agreements owned by the customer.

Location profile:

- Shows agreements where `primary_location_id` matches the location.

Job / Work Order:

- Actual visit execution only.
- A Job created from an agreement remains a normal Job.
- Any agreement source link should be informational and must not change job lifecycle semantics.

Service Case:

- Continuity/problem tracking only.
- Not agreement truth.
- Existing `service_cases.case_kind = maintenance` may classify a service case, but it does not represent the agreement.

Calendar:

- Shows created Jobs and calendar blocks only.
- Due agreements belong in a planning list until an operator manually creates a Job.

Reports:

- Later due/overdue agreement reporting can summarize agreement status, next due dates, and coverage.

Pricebook:

- Future template/default assist only.
- Must not become the agreement source of truth.

Invoices:

- No automatic invoice creation.
- Invoice Charges remain billed truth downstream.

Payments:

- No payment execution or recurring billing in V1.
- Payments remain collected truth only where implemented.

## Explicit Non-Goals

V1 does not include:

- automatic job generation
- automatic invoices
- recurring billing engine
- tenant Stripe customer payment behavior
- QBO
- SMS
- customer portal
- service agreement payment collection
- agreement-as-service-case collapse
- agreement-as-job collapse
- broad scheduling engine rewrite
- multi-location agreement coverage
- Pricebook-as-agreement-truth

## Future Implementation Order

Recommended order:

1. Schema + RLS + read model only.
2. Customer profile read-only/list display.
3. Create/edit agreement UI.
4. Upcoming/overdue planning list.
5. Manual "Create Work Order from Agreement."
6. Later reporting.
7. Later Pricebook/default template assist.
8. Later billing/payment relationship only after separate design.

## Validation Expectations For Future Slices

Future implementation should include targeted validation for:

- same-account read/write scope and RLS behavior
- customer/location relationship integrity
- status filtering for due/overdue planning
- no automatic Job creation
- manual Job creation preserving normal Job semantics
- copied Work Items remaining editable on the Job
- no invoice/payment side effects
- no confusion with service case/job "service contract" classification paths

---

## Phase 5G-B2 Closeout â€” Customer Profile Billing Period Invoice Link/Unlink UI Wiring (May 27, 2026)

- Customer profile (pp/customers/[id]/page.tsx) wires UI-only controls inside each Maintenance Agreement card's Billing Periods block:
  - Link Existing Invoice form â†’ linkInternalInvoiceToBillingPeriodFromForm (Phase 5G-B1 server action). Visible only when the billing period is not cancelled AND has no internal_invoice_id.
  - Unlink Invoice form â†’ unlinkInternalInvoiceFromBillingPeriodFromForm (Phase 5G-B1 server action). Visible only when the billing period has an internal_invoice_id. Reason (status_reason) is required.
- Access/visibility gated to Owner/Admin/Billing via existing canManageInvoiceLifecycle signal already wired as canManageBillingPeriods. Dispatcher/Technician/non-financial roles see no link or unlink controls.
- Helper copy (verbatim):
  - Link: `"Linking connects this billing period to an existing invoice for visibility only. It does not generate, issue, send, or collect payment."`
  - Unlink: `"Unlinking preserves invoice and payment history. It only removes this billing-period relationship."`
- Six new query-param banners surfaced on the customer profile: illing_period_invoice_linked, illing_period_invoice_unlinked, illing_period_invoice_link_denied, illing_period_invoice_link_invalid, illing_period_invoice_link_conflict, illing_period_invoice_unlink_reason_required.
- Boundaries preserved (no new behavior added):
  - No invoice generation, no line-item creation, no issue/send/email of invoices.
  - No payment links, payment rows, allocation rows, or Stripe behavior changes.
  - No projection/read-path switch; invoice_summary and payment-display state remain derived from the existing read model.
  - No mutation of maintenance_agreement_visits, no 
ext_due_date changes, no service-plan operational blocking.
  - No portal/customer self-service, no autopay/subscription/auto-renewal.
- Tests: lib/customers/__tests__/customer-detail-page-wiring.test.ts extended (11 tests, all passing); lib/maintenance-agreements/__tests__/billing-period-actions.test.ts (16) and illing-period-read-model.test.ts (9) unchanged and still passing; full maintenance-agreements suite 105/105.

---

## Phase 5G-B3 Closeout - Billing Period Invoice Link/Unlink Sandbox Smoke (May 27, 2026)

- Status: Complete in CMTest sandbox (project ref kvpesjdukqwwlgpkzfjm).
- Safety guardrails held: no production access, no production mutation, no code changes, no schema changes, no commit during smoke.
- Fixture used:
  - Customer: ad18fa80-2817-476b-8fca-bdcf4ff3c3d6
  - Maintenance agreement: 454b3737-fa39-46be-8925-45131a571693
  - Billing period: 644d9e9d-4d8c-4064-9a0b-e614ca012363
  - Invoice: acd0e4ac-5235-4a29-bf3e-b2f42cb87c45
- UI smoke result:
  - Link Existing Invoice succeeded through customer-profile UI using existing server action wiring.
  - Unlink Invoice succeeded through customer-profile UI using existing server action wiring.
  - Final post-unlink billing-period state: internal_invoice_id = null, billing_period_status = pending_billing, status_reason = "Phase5G-B3 sandbox unlink smoke".
- Eligibility was confirmed for the link path:
  - Same account: true
  - Same customer: true
  - Invoice not void: true
  - Invoice not claimed after unlink: true
  - Invoice job linked to same maintenance agreement via maintenance_agreement_visits: true
- Runtime boundary confirmation:
  - Billing-period invoice relationship is visibility-only.
  - Unlink preserves invoice/payment history and clears only the billing-period relationship.
  - No invoice generation, no line-item creation, no issue/send/email/payment-link behavior.
  - No new payment rows, no new allocation rows (internal_invoice_payment_allocations), no Stripe/webhook behavior.
  - No projection/read-path switch.
  - No maintenance_agreement_visits mutation.
  - No next_due_date mutation.
- Side-effect counts remained unchanged:
  - internal_invoices = 22
  - internal_invoice_line_items = 28
  - internal_invoice_payments = 3
  - internal_invoice_payment_allocations = 3
  - maintenance_agreement_visits = 10
- Validation run passed:
  - customer-detail-page-wiring.test.ts: 11/11
  - billing-period-actions.test.ts + billing-period-read-model.test.ts: 25/25
  - maintenance-agreements suite: 105/105
  - npx.cmd tsc --noEmit
  - git diff --check
  - git status -sb clean/synced
- Next recommended phase: Phase 5G-B4 A-to-Z sandbox Stripe payment smoke using linked billing-period path.

---

## Phase 5G-B4E Finding - App-Level Dedupe Was Insufficient Under Live Concurrency (May 27, 2026)

- Baseline app-level dedupe commit:
	- 456dbb94064bf379518f44390318fe2f91270de4
	- fix(payments): dedupe stripe webhook payment identity
- Fresh live webhook smoke after B4D still produced duplicate payment truth.
- Root cause: app-level pre-insert identity lookup was race-prone under concurrent live delivery of `charge.succeeded` and `checkout.session.completed`; both handlers could pass lookup before either insert became visible.
- Observed failure shape:
	- Duplicate `internal_invoice_payments` recorded rows
	- Duplicate active `internal_invoice_payment_allocations` rows
	- Duplicate `payment_recorded` job events
	- Inflated paid total
- Historical duplicate sandbox evidence rows were intentionally preserved and not repaired in this phase.

## Phase 5G-B4F Fix - DB-Enforced Stripe Payment Identity Dedupe + Conflict Recovery (May 27, 2026)

- Fix commit:
	- 389fbfe
	- fix(payments): enforce stripe identity dedupe in db and webhook recovery
- Intent and behavior:
	- Preserve event-level `stripe_event_id` idempotency.
	- Enforce DB-level payment-identity uniqueness for recorded Stripe online payments.
	- On unique conflict, resolve the canonical payment row, enrich missing identity fields, and return safe no-op success.
	- Prevent duplicate payment rows under concurrent `charge.succeeded` and `checkout.session.completed` delivery.
	- Keep one active allocation row per canonical recorded payment.
	- Preserve failed-payment behavior.
- Migration for this phase was applied to sandbox before smoke validation.
- Production migration apply is intentionally separate and must be explicitly approved/recorded in its own production execution artifact.

## Phase 5G-B4G Linked Billing-Period Smoke - Passed (May 27, 2026)

- Fixture:
	- Invoice: `92858983-7ed7-40bf-abba-681757347420` / `INV-20260527-B05C4FF8`
	- Billing period: `2f6e1318-7f93-4213-b089-cb0cfb86275d`
	- Agreement: `454b3737-fa39-46be-8925-45131a571693`
	- Job: `105bfcbd-28c6-4bc0-ad6e-a3012a2d1fa9`
	- Checkout session: `cs_test_a1f9fJn51SHyVqjqo3YAmH3LW9oC2VeE9iaSl41dSO7n69YGYtKmNrqZdc`
	- Payment intent: `pi_3TbkfJ7itDepDR181dw3ipuJ`
	- Charge: `ch_3TbkfJ7itDepDR1812I2YJUc`
	- `charge.succeeded`: `evt_3TbkfJ7itDepDR181A4isyRF`
	- `checkout.session.completed`: `evt_1TbkfL7itDepDR18iSHzVc2G`
- Result:
	- Both webhook events delivered HTTP 200.
	- Exactly one recorded `internal_invoice_payments` row.
	- Exactly one active `internal_invoice_payment_allocations` row.
	- Exactly one `payment_recorded` job event.
	- Invoice UI showed `Paid`, `Paid $17.50`, `Balance $0.00`.
	- Billing period remained linked (`invoice_linked`).
	- `maintenance_agreement_visits` remained 5.
	- `next_due_date` remained `2026-09-15`.
	- No invoice generation from billing period.
	- No line-item generation from billing period.
	- No service-plan operational mutation.

## Additional Normal Invoice Regression Smoke - Passed (May 27, 2026)

- Fixture:
	- Job: `f6600de6-63d9-4551-94c1-a0b3a8db9a5c`
	- Invoice: `db473f15-e689-48c8-b5fe-5473c286489b` / `INV-20260527-44C5BD3E`
	- Checkout session: `cs_test_a1Ztci5TJIj4FGdlMjPcxvSOav4UUmt1YloB33E90zZhFk3Y0rkQy0LjEe`
	- Payment intent: `pi_3TbnvA7itDepDR181vsnUqou`
	- Charge: `py_3TbnvA7itDepDR181leExVTK`
	- `charge.succeeded`: `evt_3TbnvA7itDepDR181oH2H05y`
	- `checkout.session.completed`: `evt_1TbnvD7itDepDR18BRWaeldg`
- Result:
	- Both webhook events delivered HTTP 200.
	- Exactly one recorded `internal_invoice_payments` row.
	- Exactly one active `internal_invoice_payment_allocations` row.
	- Exactly one `payment_recorded` job event.
	- Invoice UI showed `Paid`, `Paid $17.50`, `Balance $0.00`.
