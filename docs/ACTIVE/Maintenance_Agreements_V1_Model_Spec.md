# Maintenance Agreements / Recurring Services V1 Model Spec

Status: ACTIVE IMPLEMENTATION TRACKING SPEC
Owner lane: Group 9A - Recurring Services / Maintenance Agreements  
Scope: model guidance plus Group 9A-2 backend foundation closeout documentation. Backend foundation is committed in repo but is not production-active until migration apply is intentionally executed through the environment process.

## Documentation Authority Note

This spec owns durable Maintenance Agreements / Recurring Services source-of-truth contracts, lifecycle/status rules, service-plan operational boundaries, and recurring-service model decisions. Group 9A implementation and closeout evidence belongs in [Service_Plan_Model_Closeout_Evidence_Ledger.md](./Service_Plan_Model_Closeout_Evidence_Ledger.md). Duplicated payment/service-plan billing smoke evidence belongs in [Domain_Model_Closeout_Evidence_Ledger.md](./Domain_Model_Closeout_Evidence_Ledger.md), with durable payment/billing contracts owned by [Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md](./Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md) and roadmap/deferred sequencing owned by roadmap docs.

Duplicated closeout sections may be shortened against the evidence ledger when the durable model contract remains clear in this spec. Do not remove service-plan lifecycle truth, visit/next-due operational boundaries, source-of-truth boundaries, or production-activation safety notes from this spec.

## Service Plan / Payment Closeout Evidence Summary

Historical closeout proof for the Service Plans command-center cleanup, Phase 6F-C manual saved-card charge, Phase 6G scheduled-autopay attempt smoke, Phase 6H failed-autopay attention/retry, and Phase 6I failed-payment reconciliation visibility is preserved in [Domain_Model_Closeout_Evidence_Ledger.md](./Domain_Model_Closeout_Evidence_Ledger.md). Full Service Plans command-center cleanup detail remains in [Service_Plans_Command_Center_Cleanup_Closeout.md](./Service_Plans_Command_Center_Cleanup_Closeout.md).

This spec keeps the durable Maintenance Agreements / Recurring Services contracts:

- Maintenance agreements/service plans remain the recurring-service lifecycle owner.
- Service-plan visits and next-due operational truth must not be payment-mutated.
- Service-plan billing integration must preserve the boundary between recurring-service operations and invoice/payment truth.
- Service plan UI changes do not alter billing logic, visit generation, payment/invoice truth, Stripe/webhook behavior, customer portal behavior, schema/migrations, or role/capability rules unless an owner spec explicitly unlocks that work.
- Production activation remains gated by intentional environment process and applicable migration/feature-flag controls.

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

Deferred future-lane cross-reference:
- Workflow Presets / Operational Flow Templates is a deferred planning lane for future milestone-guided operational continuity across repeatable multi-step flows.
- It does not change current maintenance agreement/source-of-truth/payment boundaries in this spec and does not authorize scheduler automation or hidden lifecycle mutation.
- Canonical sequencing/governance for that lane is maintained in `Release_Scope_Lock_and_Post_Launch_Roadmap.md` and mirrored in the Active Spine.

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
	- preconditions: issued invoice, non-void invoice, positive balance due, non-cancelled billing period, same-account customer/payment-method context, connected-account readiness, active saved method, and valid saved-method reuse authorization captured by the setup flow or an explicit one-time/manual-charge authorization record
	- charge initiation creates payment-attempt record
	- webhook remains sole collected-money truth
	- Stripe idempotency key basis = account + invoice + attempt ordinal
- Scheduled autopay lock:
	- deferred until manual saved-method charge posture is proven; scheduled autopay still requires maintenance-agreement-scoped tenant_customer_autopay_consents
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
	- `tenant_stripe_customers`
	- `tenant_customer_payment_methods`
	- `tenant_saved_payment_method_setups`
	- `tenant_customer_autopay_consents`
	- `tenant_saved_method_payment_attempts`
	- `tenant_stripe_event_receipts`
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

Phase 6B closeout (Manual Generate Draft Invoice from Billing Period, server-action only):
- Phase 6B is complete as server-action foundation only with no UI changes in this slice.
- Added `generateDraftInvoiceFromBillingPeriodFromForm` in `lib/maintenance-agreements/billing-period-actions.ts`.
- Access enforcement remains Owner/Admin/Billing only through existing financial authority gating; Dispatcher/Technician are denied.
- Generation eligibility enforcement is active:
	- billing period must be in account scope
	- billing period must be non-cancelled and currently unlinked (`internal_invoice_id` null)
	- billing posture must be `internal_invoice`
	- amount due must be positive (`amount_due_cents > 0`)
	- anchor job must be same-account and customer-aligned where customer scope exists
	- anchor job must already be linked to the same maintenance agreement via `maintenance_agreement_visits`
	- anchor job must not already have an active non-void invoice
- Draft invoice creation behavior is active and bounded:
	- creates standard job-scoped `internal_invoices` record (`job_id` retained)
	- created invoice status is `draft`
	- no issue/send/email/payment-link flow is triggered
- Controlled line-item creation is active:
	- exactly one service-plan billing line is inserted
	- amount derives from `billing_period.amount_due_cents`
	- description is deterministic from billing cadence + coverage window
	- line-item provenance remains within existing allowed invoice line-item model (`source_kind = manual`)
- Link behavior is active:
	- on success, billing period is updated to `internal_invoice_id = generated_invoice_id` and `billing_period_status = invoice_linked`
	- conditional update guard (`internal_invoice_id is null`) is used to reduce duplicate-link races
	- no mutation of `maintenance_agreement_visits` or `next_due_date`
- Idempotency/audit decision:
	- no migration was added in Phase 6B
	- first-slice idempotency is handled by existing link-state and active-invoice guards plus conditional link update
	- dedicated generation audit table remains deferred as a future additive model (`service_plan_invoice_generation_audit`)
- Runtime boundaries remain preserved:
	- no payment or allocation rows
	- no Stripe/saved-card/autopay/scheduler behavior
	- no visit or next-due lifecycle mutation

Phase 6C closeout (Billing Period Draft Invoice Sandbox UI Smoke):
- Phase 6C is complete in sandbox ref `kvpesjdukqwwlgpkzfjm`; production ref `ornrnvxtwwtulohqwxop` was not active.
- Real customer-profile UI path was used; no manual DB mutation was used.
- Fixture:
	- customer `ad18fa80-2817-476b-8fca-bdcf4ff3c3d6`
	- agreement `454b3737-fa39-46be-8925-45131a571693`
	- billing period `0ee5a88a-2fb0-43ba-84c6-81ad8cc4f779`
	- verified anchor job `3c8d43ad-729c-4e39-a8e6-1d471a3aa692`
	- visit link `36265267-fbdb-4402-b1c7-c3e7aae3f746`
- Baseline before action:
	- billing period started unlinked (`internal_invoice_id = null`) and `pending_billing`
	- amount `1950`, cadence `monthly`, coverage `2026-12-01` to `2026-12-31`
	- anchor active non-void invoice count `0`
	- agreement visit count `5`
	- agreement `next_due_date = 2026-09-15`
- UI smoke result:
	- eligible billing period rendered `Generate Draft Invoice`
	- verified anchor job id entered through UI and submit succeeded
	- success banner rendered with draft-only/no issue-send-email-charge-payment-link semantics
- Generated invoice:
	- `e2f20d3d-7f3c-4035-b44b-4f167d9d3d98` / `INV-20260528-C655AA85`
	- `job_id = 3c8d43ad-729c-4e39-a8e6-1d471a3aa692`
	- status `draft`, `source_type = job`, total `1950`
	- `issued_at = null`, `sent_at = null`, `payment_link_url = null`, `stripe_payment_intent_id = null`
- Generated line item:
	- `e0552fed-a8ec-48c6-b368-b91a8f176601`
	- quantity `1`, unit price `$19.50`, line total `$19.50`
	- `Service Plan Billing Period (monthly): 12/01/2026-12/31/2026`
- Billing period post-state:
	- `internal_invoice_id = e2f20d3d-7f3c-4035-b44b-4f167d9d3d98`
	- `billing_period_status = invoice_linked`
- Duplicate guard verification:
	- generate control no longer rendered after link
	- linked state exposed invoice reference and `Unlink Invoice`
	- no synthetic duplicate submit was performed
	- invoice count `0 -> 1` only and line-item count `0 -> 1` only
- No-side-effect verification:
	- no new `internal_invoice_payments` rows
	- no new `internal_invoice_payment_allocations` rows
	- no Stripe behavior and no payment link
	- no `maintenance_agreement_visits` mutation (count remained `5`)
	- agreement `next_due_date` remained `2026-09-15`
	- invoice workspace rendered Draft, 1 charge, $19.50, Unpaid, with no paid/payment-link state
- Validation after smoke remained green:
	- `billing-period-actions.test.ts` `22/22`
	- `billing-period-read-model.test.ts` `9/9`
	- maintenance-agreements suite `111/111`
	- `customer-detail-page-wiring.test.ts` `12/12`
	- `internal-invoice-scope-hardening.test.ts` `56/56`
	- `financial-access.test.ts` `9/9`
	- `npx.cmd tsc --noEmit` passed
	- `git diff --check` clean
- Phase 6B-UI / 6C-prep commit: `5ecbba727caae8ae7586617e164c3ff37eab1600`.
- Phase 6C is closed. Next lane is Phase 6D (Stripe saved-method + autopay consent schema/model lock).

Phase 6D-C closeout (Saved Payment Method + Autopay Consent Schema/Model Lock, docs/model only):
- Phase 6D-C records model-lock decisions only. No implementation, migration, Stripe API call, sandbox mutation, production touch, or webhook behavior change occurred in this closeout.
- Locked additive schema surfaces:
	- `tenant_stripe_customers`
	- `tenant_customer_payment_methods`
	- `tenant_saved_payment_method_setups`
	- `tenant_customer_autopay_consents`
	- `tenant_saved_method_payment_attempts`
	- `tenant_stripe_event_receipts`
- `account_owner_user_id` lock:
	- use the same account-owner column type already used by existing production tenant-owned tables
	- do not introduce text-vs-UUID drift
- Saved-method and consent ownership lock:
	- Stripe owns connected-account customer/payment-method records, setup/authentication, and processor truth
	- Compliance Matters owns maintenance-agreement consent, setup workflow/audit records, attempt workflow/audit records, and post-webhook internal payment truth
- Saved method posture:
	- first implementation remains card-first
	- ACH/bank attributes are future/deferred display-safe metadata only and do not activate ACH/bank-debit behavior
	- safe metadata only: connected account id, Stripe customer id, Stripe payment method id, brand, last4, exp month/year, safe display status
	- never store full card number, CVC, raw bank/card credentials, Stripe secrets, client secrets, or reusable payment credentials
- Consent posture:
	- saved method present does not imply autopay enabled
	- autopay requires explicit maintenance-agreement-scoped consent
	- consent lifecycle states are distinct: `disabled`, `enabled`, `paused`, `revoked`, `stale_or_invalid`
	- payment-method change or connected-account change may invalidate/pause consent and require fresh consent
- Attempt/payment truth boundary:
	- `tenant_saved_method_payment_attempts` is workflow/audit truth
	- attempt status may reflect submission/result correlation
	- invoice paid state and collected money truth remain only in `internal_invoice_payments` plus payment-allocation truth after webhook confirmation
	- manual charge actions and schedulers must never directly mark invoices paid
- Event identity posture:
	- `tenant_stripe_event_receipts` is the additive event-receipt surface for setup lifecycle, payment-method attach/update/detach handling, off-session attempt outcomes, duplicate handling, and connected-account-context verification
- Operational boundaries remain locked:
	- no `maintenance_agreement_visits` mutation
	- no `next_due_date` mutation
	- no Stripe Billing Subscriptions for tenant recurring billing now
- Phase 6D-C is now closed as docs/model lock only. Next lane is Phase 6E (saved payment method setup flow).

### Phase 6E-C Closeout

- Phase 6E-C — Saved Card Setup Flow / Stripe Checkout Setup Mode
- Status: complete in sandbox and committed/pushed to origin/main. Commit: `ee5c5ea4ceef7427e501b650f67eed1555b21642`
- Implemented behavior: customer profile now supports a saved-card setup flow using Stripe Checkout setup mode; Stripe owns card/payment credential collection and storage; Compliance Matters stores only Stripe references and display-safe metadata; setup writes to `tenant_stripe_customers`, `tenant_saved_payment_method_setups`, `tenant_customer_payment_methods`, and `tenant_stripe_event_receipts`; setup rows persist `stripe_checkout_session_id`, `stripe_setup_intent_id`, and `stripe_payment_method_id`; saved-card display uses safe metadata only (`brand`, `last4`, `expiration`, `status/default flag`)
- Sandbox smoke evidence: the setup flow completed through customer profile and Stripe Checkout; the setup row succeeded; the checkout session ID persisted correctly after constraint/redirect corrections; the payment method row was created with display-safe metadata; the webhook receipt processed; the customer returned to the customer profile with a success banner; no full card number, CVC, client secret, raw token, or credential material was stored or displayed
- Important correction captured: a runtime issue rejected valid Stripe Checkout Session IDs like `cs_test_...` because of an overly strict DB constraint; migration `20260527120000_fix_checkout_session_id_constraint.sql` fixed that constraint; redirect handling was corrected so the server-action redirect is not swallowed by `try/catch`; final smoke confirmed `stripe_checkout_session_id` is persisted end-to-end
- Boundaries preserved: no autopay enablement; no card charge attempt; no Stripe PaymentIntent money movement; no Stripe Billing Subscriptions; no `internal_invoice_payments` rows created; no `internal_invoice_payment_allocations` rows created; no invoice paid/balance mutation; no invoice issue/send/email/payment-link behavior; no `tenant_customer_autopay_consents` row created or enabled; no `tenant_saved_method_payment_attempts` row created; no `maintenance_agreement_visits` mutation; no `maintenance_agreements.next_due_date` mutation; no customer portal behavior added
- Validation recorded: Vitest matrix passed 113/113 across 9 files; `npx.cmd tsc --noEmit` passed; `git diff --check` passed; commit was pushed and remote-synced
- Next phase: Phase 6F — Manual Charge Saved Payment Method for an issued invoice. 6F must use attempt rows before calling Stripe and keep webhook-confirmed `internal_invoice_payments` as the collected-money truth; scheduled autopay remains deferred

## Group 9A Model Summary

Detailed Group 9A implementation history, commit/test records, fixture smoke, sandbox verification, and UI closeout proof are preserved in [Service_Plan_Model_Closeout_Evidence_Ledger.md](./Service_Plan_Model_Closeout_Evidence_Ledger.md). This spec keeps the durable service-plan model contracts.

### Foundation And Activation

- Maintenance Agreements V1 backend foundation exists in repo but becomes production-active only after intentional migration apply and feature-flag/environment approval.
- The customer profile read surface is feature-gated and fail-safe; production must not read Maintenance Agreements tables until migration apply and feature enablement are approved.
- Customer profile create/edit V1 supports agreement name, type, frequency, next due date, start date, optional renewal date, optional primary location, default visit scope/default Work Items, internal notes, and status on edit.
- Create/edit V1 does not include delete, customer reassignment, preferred technician UI, multi-location coverage, automatic job generation, calendar events, invoices/payments, Stripe tenant payment behavior, QBO, SMS, portal exposure, or production migration/flag enablement.

### Due / Overdue Read Models And Read-Only Surfaces

- `summarizeMaintenanceAgreementsForAccount` is the due/overdue summary read model.
- Summary output includes status counts, due counts, total count, and as-of date.
- Due buckets are account-scoped, include active agreements only, exclude inactive statuses, and treat missing/invalid `next_due_date` as `not_scheduled_active`.
- Due-window buckets are intentionally exclusive; UI labels should use explicit ranges such as Overdue, Due Today, Due in 1-7 Days, and Due in 8-30 Days.
- `/ops` Service Plans card and `/service-plans` drilldown are feature-gated, internal/account-scoped, read-only visibility surfaces.
- `/service-plans` does not create/edit service plans, create work orders, generate jobs, advance due dates, deduct visit balance, or mutate invoice/payment behavior.

### Manual Create Work Order From Service Plan

- Customer profile Maintenance Agreement cards expose a manual `Create Work Order` entry point when feature-gated.
- `/jobs/new` resolves service-plan prefill server-side only when feature flag, internal context, UUID shape, account scope, and customer scope are valid.
- Prefill may include customer/location, service/maintenance defaults, reason/dispatch notes, editable default Work Items, and an agreement context banner.
- The submit path remains normal job creation. A service-plan-origin job is still a normal Job / Work Order.
- Agreement record is not mutated by job creation.
- Manual create does not automatically generate jobs, create calendar events, advance `next_due_date`, deduct visit balance, create invoices/payments, or expose Stripe/QBO/SMS/customer portal behavior.

### Visit Link Table And Count Status Lifecycle

- `maintenance_agreement_visits` is the durable link table connecting Maintenance Agreements / Service Plans to Jobs / Work Orders.
- Do not use direct `jobs.maintenance_agreement_id` as the primary long-term visit-accounting source of truth.
- The link table is not job truth, agreement truth, billing truth, or payment truth.
- Link source values distinguish service-plan prefill, manual, and future system origins.
- Count status lifecycle supports `linked`, `eligible`, `counted`, `excluded`, and `reversed`.
- New service-plan-origin job links default to `link_source = service_plan_prefill`, `count_status = linked`, and `counts_toward_visit_balance = false`.
- Used visits project only from links with `count_status = counted` and `counts_toward_visit_balance = true`.
- Excluded and reversed links preserve history without counting.
- No DELETE policy is intended in V1; reversal/status semantics preserve link history.
- Link creation is non-blocking and duplicate-safe; invalid or out-of-scope agreement prefill must not block normal job creation.
- Jobs without customer linkage may fail or skip service-plan link creation until the model explicitly broadens beyond customer/account scope.

### Work Items Prefill And Validation

- Service Plan / Maintenance Agreement default Work Items persist on agreement create/update and prefill into `/jobs/new`.
- Service-plan-origin job creation persists normal job-level service/maintenance visit scope fields.
- Prefilled Service Plan Work Items remain editable job-level operational scope.
- Service Plan prefill normalizes legacy/default Work Item shapes into canonical structured Work Item fields before job-intake sanitization.
- Valid legacy/default Work Item data should survive prefill and allow job creation without manual Pricebook reselection.
- Work Items prefill does not change visit counting, next due date, invoice/payment behavior, schema, migrations, feature flags, recurrence/job generation, or production writes.

### Count Eligibility And Manual Mark Visit Counted

- `/service-plans` may show read-only Visit Count Review projection labels such as No linked visits, Linked, Eligible for count review, Counted, Excluded, Reversed, and Not eligible.
- Projection remains read-only and does not mutate visit-link lifecycle.
- Eligible linked maintenance jobs on job detail may surface `Service Plan Visit Count Review` with operator-confirmed `Mark Visit Counted`.
- `Mark Visit Counted` mutates only the targeted `maintenance_agreement_visits` link row:
  - `count_status = counted`
  - `counts_toward_visit_balance = true`
  - `counted_at`
  - `counted_by_user_id`
  - updater metadata
- Agreement record is not mutated.
- `next_due_date` is not advanced.
- No invoice/payment behavior, automatic counting, recurrence, QBO/SMS/customer portal behavior, renewal automation, or mutable remaining-visit counter is introduced by marking a visit counted.

### Due-Window And Suggested Next Due Model

- Guiding principle: simple first, helpful next, automation last.
- Counting a Service Plan visit must not automatically advance `maintenance_agreements.next_due_date`.
- Any next-due write must be explicit and operator-confirmed.
- Interval suggestions use cadence-preserving roll-forward logic:
  - start from current `agreement.next_due_date`
  - add the configured frequency interval
  - if result is on or before the counted completion anchor, roll forward by the same interval until after the anchor
- Supported interval frequencies are `monthly`, `quarterly`, `semi_annual`, and `annual`.
- `custom` frequency or missing `next_due_date` falls back to manual scheduling guidance.
- Seasonal service-window behavior remains future/template-driven and should prefer service-window language rather than implying a single fixed date.
- Suggested next due context is read-only until an explicit confirm action is available.
- Read-only suggested next due projection does not mutate the agreement, create invoices/payments, create recurrence, generate jobs, or expose customer portal/SMS/QBO behavior.

### Confirm Next Due Action And Idempotency

- First confirm action location is job detail.
- Customer profile confirm, `/service-plans` confirm, and seasonal-window confirm remain parked until job-detail V1 behavior is proven and required schema/model support exists.
- `Confirm Next Due Date` is operator-confirmed and may render only for counted Service Plan visits with valid interval-based suggested next due dates.
- Preconditions include feature exposure, internal user context, active agreement, counted link with `counts_toward_visit_balance = true`, available suggested date, interval frequency, same account/customer scope, and stale-state protection.
- Confirmation copy must make clear that confirming next due date does not create a job, schedule an appointment, create an invoice, collect payment, or renew the plan.
- Initial confirm action may update only agreement next due fields and must not mutate visit links, jobs, service cases, calendar events, invoices, or payments.
- Persistent confirm requires durable link metadata idempotency:
  - `baseline_next_due_date`
  - `confirmed_next_due_date`
  - `next_due_confirmed_at`
  - `next_due_confirmed_by_user_id`
- A counted visit can confirm next due once.
- Link metadata is the idempotency truth for persistent confirm behavior.
- Confirm write updates agreement next due and link confirmation metadata together as one logical operation.
- If a link already has confirmation metadata, confirm must not advance the date again.
- Agreement `next_due_date` must still match the baseline used to calculate the suggestion; stale baseline must fail safely and ask the user to refresh/review the latest suggestion.
- Stored date values and hidden form values remain `YYYY-MM-DD`; display may use date-only `MM/DD/YYYY` formatting.

### Service Plans Navigation, Customer Snapshot, And Templates

- `/service-plans` remains read-only and may deep-link to focused agreement cards on customer profile.
- Customer profile remains the management surface for create/edit/work-order/default-work actions.
- Customer profile Service Plan cards may show read-only Plan Snapshot and What's Included sections before edit controls.
- Service Plans / Maintenance Agreements are closed for field-feedback unless real workflow bugs or validated feedback reopen the lane.
- Service Plan Templates foundation, template management, customer create-from-template prefill, template provenance snapshot, duplicate template flow, package lock metadata, strict package values, server-side locked-field enforcement, and customer read-only locked package rendering are complete model capabilities.
- Template package lock behavior does not introduce automatic jobs, recurrence engine, invoice/payment/autopay changes, visit-count mutation, next-due mutation, portal/SMS/QBO behavior, or removal of manual Service Plan creation.
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

## Service-Plan Billing Period Evidence Summary

Historical closeout proof for Phase 5G billing-period invoice link/unlink UI wiring, sandbox smoke, payment identity dedupe/conflict recovery, linked billing-period smoke, and normal invoice regression smoke is preserved in [Domain_Model_Closeout_Evidence_Ledger.md](./Domain_Model_Closeout_Evidence_Ledger.md).

Durable maintenance agreement and service-plan lifecycle contracts remain in this spec. Durable billing-period and service-plan invoice relationship contracts remain in [Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md](./Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md).
