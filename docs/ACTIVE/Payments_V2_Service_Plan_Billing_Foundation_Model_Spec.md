# Payments V2 / Service Plan Billing Foundation Model Spec

Status: ACTIVE MODEL LOCK (Phase 2 + Phase 3A closeout)
Owner lane: Payments V2 / Service Plan Billing Foundation
Scope: docs/model only. No product code, schema, migrations, Supabase commands, Stripe behavior changes, checkout/session changes, env/flag changes, UI build, or provider integrations are authorized by this spec.

## Purpose

Lock the minimum safe data/model posture so future implementation slices can add Service Plan Billing without breaking existing invoice/payment truth.

## Optional Internal Billing Guardrail (May 2026)

- Operational work must remain allowed without internal invoice/payment attachment: jobs, work orders, service plans, maintenance visits, visit counts, and next-due workflows must not require internal invoice or payment rows.
- Internal invoicing/payment is optional by billing posture (`billing_mode`), tenant setup, and future service-plan billing configuration.
- External-billing/off-platform tenants must still perform and track work even when no internal payment row exists.
- Future Service Plan Billing Periods must support multiple postures: internal invoice-backed, external/off-platform, manual, no-charge, waived, and not-billed-through-Compliance-Matters.
- Payment status may inform billing/reporting warnings, but must not hard-block operational workflows in first posture unless a later explicit design authorizes that behavior.
- Payment truth remains financial truth only and must not attach directly to `maintenance_agreement_visits`.
- Payment must not be required to create, schedule, complete, count, or confirm service-plan work.

Phase 2 correction lock:

- First Service Plan Billing V1 does not require an automatic recurring charge engine.
- First posture is billing-period modeling plus normal internal invoices paid through existing invoice-payment infrastructure.
- Auto-charge, autopay, saved cards, Stripe subscriptions, and automatic renewal remain deferred unless explicitly reopened.

Phase 3A closeout lock:

- Payments Register Mutation / Correction Foundation is now implemented as a minimal additive slice.
- `internal_invoice_payments` now carries additive reversal audit metadata (`reversed_at`, `reversed_by_user_id`, `reversal_reason`).
- Manual/off-platform `recorded` payment rows can be reversed by authorized financial users only, with required reason.
- Stripe/online payment rows remain read-only for this correction flow; no refund/dispute/provider API behavior was added.
- Reversed rows are historical (non-destructive), remain visible for audit, and do not count toward collected totals or invoice paid/balance projection.
- Failed and already-reversed rows are blocked from reversal.
- Authority lock remains Owner/Admin/Billing allowed; Dispatcher/Technician/Contractor/Portal/Public blocked by default.
- Deferred register remains unchanged: allocations, service plan billing periods behavior implementation, customer portal, QBO, ACH, refunds/disputes, saved cards/autopay, partial payments, receipt automation, and platform fee execution remain deferred.

Phase 4A closeout lock (Allocation Compatibility Foundation):

- Phase 4A is complete as a compatibility-only foundation (`a0a2d23`), not allocation persistence.
- No allocation schema/table exists yet.
- No allocation rows are written yet.
- Invoice paid/balance projection now routes through allocation-compatible helper semantics using existing `internal_invoice_payments` rows only.
- Recorded-only collected truth is preserved; failed and reversed rows remain non-collected and excluded from collected totals.
- Stripe webhook row behavior and manual/off-platform row behavior remain unchanged in this slice.
- No Service Plan Billing Period behavior, `maintenance_agreement_visits`, payment recording flow, checkout/webhook behavior, portal, QBO, ACH, refunds/disputes, saved cards/autopay, or partial payments behavior changed.

Phase 4B lock (Allocation Schema Model Lock, docs/model only):

- First allocation table name is locked to `internal_invoice_payment_allocations`.
- First source is locked to `source_internal_invoice_payment_id` referencing `internal_invoice_payments.id`.
- First target is invoice-only with `target_invoice_id`; do not add `target_service_plan_billing_period_id` yet.
- Customer-credit targets are future-only and remain deferred.
- First posture is one source payment to one invoice allocation, with a unique constraint on `source_internal_invoice_payment_id`.
- First posture explicitly excludes multi-invoice split behavior, overpayment/credit behavior, and partial-payment expansion beyond existing invoice payment behavior.
- Allocation statuses locked for first implementation posture: `active`, `inactive`, `reversed`, `voided`.
- Counting rule lock: only `active` allocations count toward invoice collected totals; `inactive`/`reversed`/`voided` do not count.
- If `counts_toward_collected_totals` is stored in future schema, it must not be independent financial truth; either omit it or enforce consistency from status with a check constraint.
- Phase 4C implementation boundary is additive table + RLS + indexes + tests only; no UI, no read-path/projection switch, no payment-recording changes, no Stripe/webhook changes, and no Service Plan Billing Period behavior changes.

Phase 4C closeout lock (Explicit Invoice Payment Allocation Table Foundation):

- Phase 4C is complete as an additive schema foundation with migration `20260526130000_internal_invoice_payment_allocations_foundation.sql`.
- New table `internal_invoice_payment_allocations` is now present with first-posture invoice-only target (`target_invoice_id`) and one-source-to-one-allocation constraint (`source_internal_invoice_payment_id` unique).
- First allocation statuses are implemented as `active`, `inactive`, `reversed`, `voided`.
- Counting posture remains status-derived only: future countability is `allocation_status = 'active'`; no `counts_toward_collected_totals` field was added.
- Strong source/target/account consistency is enforced in migration through FK constraints, account-scoped RLS policies, and write-time source/target scope assertion.
- No backfill was performed.
- No allocation rows are written yet by runtime payment flows in this phase.
- No read-path/projection switch was implemented; existing invoice-bound payment truth and projection behavior remain unchanged.
- No UI, payment-recording flow, Stripe checkout/webhook behavior, Service Plan Billing Period behavior, portal, QBO, ACH, refunds/disputes, saved cards/autopay, partial payments, receipt automation, platform fee execution, or service-plan automation behavior changed in this phase.

Phase 4D closeout lock (Allocation Population / Backfill / Write Strategy, docs/model only):

- Allocation population posture is locked to one-to-one rows derived from `internal_invoice_payments`.
- Allocation idempotency key is locked to `source_internal_invoice_payment_id`.
- Status mapping is locked for first population posture: `recorded -> active`, `pending/failed -> inactive`, `reversed -> reversed`.
- `allocated_amount_cents` must preserve source `amount_cents` exactly, including signed/zero parity.
- `target_invoice_id` must equal source payment `invoice_id`.
- Failed and reversed source payments should have allocation rows for lifecycle completeness, but they must remain non-counting for collected totals.
- Projection must remain on compatibility helper semantics until allocation parity is proven.
- No read-path/projection switch is allowed yet.
- Historical backfill posture is locked to idempotent and retryable behavior.
- Runtime allocation writers must be centralized in one helper contract.
- Manual payment dual-write and Stripe webhook dual-write must ship as separate implementation slices.
- Historical backfill must run only after runtime write strategy is locked.
- Production dormant schema migration planning/apply requires explicit approval before any runtime allocation writer ships.

Safer implementation sequence lock:

1. Phase 4E: production dormant migration planning/apply, explicit approval only.
2. Phase 4F: centralized allocation write helper foundation, not wired.
3. Phase 4G: manual payment dual-write.
4. Phase 4H: Stripe webhook dual-write.
5. Phase 4I: historical backfill plus parity checks.
6. Later phase: allocation read-path switch only after parity gate passes.

Phase 4E closeout lock (Production Dormant Allocation Migration Catch-up, docs/model only):

- Phase 4E production dormant schema catch-up is complete.
- Production ref was explicitly confirmed as `ornrnvxtwwtulohqwxop`.
- Applied migrations in production order:
	- `20260526110000_internal_invoice_payments_reversal_audit_foundation.sql`
	- `20260526130000_internal_invoice_payment_allocations_foundation.sql`
- Reversal audit schema was verified in production: `reversed_at`, `reversed_by_user_id`, `reversal_reason`, and owner/reversed-at index.
- `internal_invoice_payment_allocations` was verified in production with required columns, constraints, indexes, RLS policies, and scope assertion trigger/function.
- Forbidden/deferred columns remain absent (`counts_toward_collected_totals`, `target_service_plan_billing_period_id`, and customer-credit target fields).
- Allocation row count is `0` in production.
- No backfill was run.
- No runtime allocation writers exist yet.
- No read-path/projection switch was made.
- No payment recording, Stripe webhook/checkout, UI, Service Plan Billing, QBO, ACH, refunds/disputes, saved cards/autopay, partial payments, receipt automation, platform fee execution, customer portal, or service-plan automation behavior changed in this phase.

Phase 4F closeout lock (Centralized Allocation Write Helper Foundation, helper/tests only):

- Phase 4F centralized allocation write helper foundation is complete.
- A centralized helper now exists to create/update one persisted allocation row from one `internal_invoice_payments` row using `source_internal_invoice_payment_id` idempotency.
- Helper mapping is implemented as locked in Phase 4D: `recorded -> active`, `pending/failed -> inactive`, `reversed -> reversed`.
- Helper preserves source `amount_cents` exactly, including signed/zero parity, and uses invoice-only target posture (`target_invoice_id = payment.invoice_id`).
- Helper is not wired into runtime payment flows yet.
- No manual payment dual-write exists yet.
- No Stripe webhook dual-write exists yet.
- No historical backfill was run.
- No read-path/projection switch was made.
- No UI behavior changed.
- No payment recording, Stripe webhook/checkout, Service Plan Billing, QBO, ACH, refunds/disputes, saved cards/autopay, partial payments, receipt automation, platform fee execution, customer portal, or service-plan automation behavior changed in this phase.
- Next slice remains Phase 4G manual payment dual-write, or a narrow Phase 4G-A helper smoke/parity check if needed before runtime wiring.

Phase 4G closeout lock (Manual Payment Dual-Write, manual/off-platform only):

- Phase 4G manual payment dual-write is complete for manual/off-platform payment actions only.
- Manual/off-platform recorded payment rows now invoke centralized allocation upsert and create/update allocation rows with `source_internal_invoice_payment_id` idempotency.
- Manual payment reversal now invokes centralized allocation upsert after payment row reversal and updates allocation status to `reversed` for the same source payment.
- Payment row remains authoritative; allocation write failures are non-blocking for manual payment record/reversal success.
- No allocation deletes are performed in this slice.
- No Stripe webhook dual-write was added; Stripe dual-write remains deferred to Phase 4H.
- No historical backfill was run.
- No read-path/projection switch was made; invoice paid/balance projection remains on compatibility helper/payment-row truth.
- No UI behavior change.
- No Stripe checkout/webhook behavior changes.
- No Service Plan Billing Period, QBO, ACH, refunds/disputes, saved cards/autopay, partial payments, receipt automation, platform fee execution, customer portal, or service-plan automation behavior changes.

Phase 4H closeout lock (Stripe Webhook Dual-Write, Stripe webhook scope only):

- Phase 4H Stripe webhook dual-write is complete.
- Successful Stripe tenant invoice payment rows now invoke the centralized allocation helper and create/update `active` allocation rows.
- Failed Stripe tenant invoice payment rows now invoke the centralized allocation helper and create/update `inactive` allocation rows.
- Idempotent/replayed Stripe events now attempt allocation upsert against the resolved existing payment row without changing existing Stripe payment idempotency behavior.
- Allocation helper failure is non-blocking after payment-row success; payment row remains authoritative.
- Existing Stripe event routing and duplicate protection remain unchanged.
- Projection/read path remains unchanged and still does not read persisted allocations.
- Historical backfill remains deferred.
- No UI behavior changed.
- No Service Plan Billing Period, QBO, ACH, refunds/disputes, saved cards/autopay, partial payments, receipt automation, platform fee execution, customer portal, or service-plan automation behavior was added.

Phase 4I-B closeout lock (Sandbox Historical Allocation Backfill + Parity Verification, docs-only):

- Phase 4I-B sandbox historical allocation backfill is complete.
- Sandbox ref: `kvpesjdukqwwlgpkzfjm`.
- Production ref `ornrnvxtwwtulohqwxop` was not queried or mutated.
- Supabase CLI temp state was mixed; data mutation was executed through explicit sandbox URL/ref gate rather than CLI state.
- Preflight baseline:
	- payment rows: 3
	- allocation rows: 0
	- missing allocation rows: 3
	- statuses: recorded 2, reversed 1
	- no unexpected statuses, no required-field gaps, no missing invoice/account/job mismatch, no duplicate allocation sources
- Backfill results:
	- attempted rows: 3
	- returned rows: 3
	- allocation statuses: active 2, reversed 1
- Post-backfill parity:
	- payment rows: 3
	- allocation rows: 3
	- missing allocation rows: 0
	- status mapping mismatches: 0
	- payload mismatches: 0
	- duplicate allocation sources: 0
	- per-invoice parity mismatches: 0
	- global recorded payment cents: 10134
	- global active allocation cents: 10134
	- global parity matches: true
	- reversed allocations active count: 0
- Runtime boundaries preserved:
	- no projection/read-path switch
	- no UI/report behavior changes
	- no manual payment behavior changes
	- no Stripe webhook behavior changes
	- no production mutation
- Validation snapshot:
	- payment allocation + internal invoice payment tests: 38 passed
	- payments register + invoice ledger tests: 15 passed
	- `npx.cmd tsc --noEmit` passed
	- branch clean/synced

Phase 4I-C closeout lock (Production Historical Allocation Backfill Preflight + No-Op Decision, docs-only):

- Phase 4I-C production historical allocation backfill preflight is complete.
- Production ref confirmed: `ornrnvxtwwtulohqwxop`.
- Trusted production read access confirmed.
- SELECT-only audit was performed.
- `mutation_performed=false`.
- Preflight result:
	- production payment row count: 0
	- production allocation row count: 0
	- missing allocation row count: 0
	- payment status breakdown: {}
	- unexpected statuses: []
	- required field gaps: 0
	- missing invoice count: 0
	- account mismatch count: 0
	- job mismatch count: 0
	- duplicate allocation sources: 0
	- status mapping mismatches: 0
	- payload mismatches: 0
	- per-invoice parity mismatch count: 0
	- global recorded payment cents: 0
	- global active allocation cents: 0
	- global parity matches: true
	- reversed allocations active by mistake: 0
- Production backfill is not needed because there are no production payment rows.
- No projection/read-path switch has occurred.
- Payment row truth remains authoritative.
- Allocation table remains ready for future rows through manual and Stripe dual-write.

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
	- maintenance_agreement_visit IDs
	- visit-count fields
	- next_due_date mutation fields
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

## Scope Boundaries (Locked)

This model lock does not authorize implementation of:

- QBO sync/export behavior
- SMS payment notifications
- ACH rails
- refunds/disputes tooling
- saved cards/autopay
- partial payments
- receipt automation
- customer public payment portal/self-service
- advanced service-plan automation
- platform-fee execution behavior

## Source-Of-Truth Map (Locked)

- Invoice = billed commercial truth.
- Payment = collected money truth.
- Payment Register Entry = durable financial row/event truth.
- Payment Allocation = relationship truth that applies collected money to invoice, billing period, or future obligation.
- Service Plan / Maintenance Agreement = customer-owned recurring service obligation truth.
- Maintenance agreement visits = visit/link/counting truth.
- Service Plan Billing Period = commercial coverage-window truth.

Separation rules:

- Visit usage and money paid are related but separate.
- Payment must not become visit-count truth.
- Visit count must not imply payment.
- Payment alone must not advance agreement next due date.
- Money must not be attached directly to maintenance_agreement_visits rows.

## Compatibility Lock (Current Truth)

- Current internal_invoice_payments remains today invoice-bound collected-payment truth.
- Existing invoice paid/balance projection behavior must remain trustworthy during additive model evolution.
- Existing manual/off-platform plus Stripe-webhook payment recording posture remains valid.

## 1) Payment Register Entry Model Lock

A Payment Register Entry represents one durable payment event (collected or attempted) for one tenant/customer context.

It must answer:

- who paid (payer identity as available)
- which tenant/account owns the payment
- which customer the payment context belongs to
- collected/attempted amount and currency
- when payment was paid/attempted
- when payment was recorded
- method/source
- manual/off-platform or Stripe-webhook origin
- lifecycle status
- external processor references
- who/what recorded it
- immutable audit trail fields
- whether the row contributes to collected totals

Status posture lock:

- recorded = collected money
- failed = attempt only (non-collected)
- reversed/refunded/disputed/corrected/voided = non-destructive lifecycle states with audit continuity

Count-to-totals lock:

- Only active collected states count toward collected totals.
- Failed rows never count toward collected totals.

## 2) Payment Allocation Model Lock

Allocation is the relationship that applies money from a payment/register entry to a commercial target.

It must answer:

- source payment/register entry
- target id (invoice in first posture)
- allocated amount
- whether allocation contributes to invoice paid/balance projection
- allocation lifecycle (active, inactive, reversed, voided)
- allocation audit fields

First posture lock:

- Existing one-invoice payment behavior is representable as one payment-to-one-invoice allocation.
- First source key is `source_internal_invoice_payment_id` with uniqueness to enforce one source payment to one allocation row.
- First target key is `target_invoice_id` only.
- Multi-invoice split, service-plan-billing-period target linkage, overpayment carry-forward, partial allocation expansion, and credit-wallet behavior remain deferred.
- Allocation adoption must be additive and must not regress current invoice paid/balance projection.
- Allocation statuses are locked to `active`, `inactive`, `reversed`, and `voided` in first posture.
- Only `active` allocations count toward invoice collected totals in future allocation-backed reads.

## 3) Invoice Payment Projection Model Lock

Invoice paid/balance is a read model derived from valid collected payment truth.

Must remain true:

- Only collected/recorded/active payment truth counts toward paid totals.
- Failed attempts do not count.
- Reversed/corrected/voided/refunded states do not inflate paid totals.
- Future allocation-aware projection must preserve current V1 invoice behavior until explicitly migrated.
- Existing invoice payment UI/reporting must remain trustworthy.

## 4) Failed Payment Attempt Model Lock

Failed payment attempts are audit/visibility records, not collected money.

Must remain true:

- Failed attempts do not change invoice paid/balance.
- Failed attempts may appear in register/report surfaces as non-collected rows.
- Failed attempts are retained for audit/support visibility.
- No automatic retry behavior is introduced by this phase.

## 5) Payment Correction / Reversal Model Lock

Correction/reversal behavior must preserve ledger history.

Must remain true:

- No destructive delete of financial records.
- Corrections/reversals preserve durable audit history.
- Corrected/reversed amounts must not overstate collected totals.
- Refund/dispute execution and Stripe refund API integration remain deferred.
- Manual support or Stripe Dashboard handling is acceptable until explicitly reopened.

## 6) Service Plan Billing Period Model Lock

Service Plan Billing Period represents one commercial coverage window tied to one maintenance agreement.

It must answer:

- parent maintenance agreement
- coverage start/end dates
- amount due
- cadence semantics
- due date
- invoice linkage presence
- linked invoice id (if created)
- billing-period lifecycle state
- derived paid state from invoice/payment truth
- explicit separation from visit-count state

Recommended first posture:

- Billing period = commercial coverage truth.
- Billing period does not count visits.
- Billing period does not auto-advance agreement next_due_date.
- Billing-period paid state derives from linked invoice/payment truth.
- First implementation may be manual issue of a normal internal invoice for the period.
- No auto-charge/autopay.

## 7) Service Plan Invoice Relationship Model Lock

Relationship lock:

- One billing period may link to one normal internal invoice in first posture.
- Invoice remains billed truth.
- Payment remains collected truth.
- Billing period remains coverage/cycle truth.
- Visit count remains operational usage truth.

Operational guardrails:

- Do not attach money to maintenance_agreement_visits.
- Do not make paid billing periods auto-mutate visit balance.
- Do not hard-block visit creation for unpaid periods in first posture; warning/status posture only unless explicitly approved later.

## 8) Platform Application Fee Placeholder Lock

Platform application fee is placeholder-only in this phase.

Must remain true:

- Future-only; no implementation now.
- Conservative early idea may be around 0.25% but not hardcoded and not approved by this spec.
- Do not add application_fee_amount now.
- Do not alter Stripe checkout/session behavior now.

Future data/config/reporting considerations (model only):

- fee policy configuration surface (percent or flat+percent)
- tenant/account-level fee policy versioning and effective date
- fee ownership posture (tenant-absorbed vs customer-facing)
- fee display/copy/legal/tax treatment decisions
- refund/dispute fee reversal posture
- owner reporting needs (gross, fee, net)

Required owner decisions before implementation:

- percent vs flat+percent
- tenant absorbed vs customer-facing
- display/copy requirements
- terms/legal/tax treatment
- refund/dispute behavior
- owner reporting expectations

## 9) Reporting / Read Model Expectations Lock

Reporting expectations:

- Payments Register separates collected payments from failed attempts.
- Invoice ledger remains stable and trustworthy.
- Customer payment history remains readable and role-gated.
- Future Service Plan billing read models show billing period status plus linked invoice/payment status.
- QBO export/sync remains optional downstream and last-last.
- Customer public payment portal/self-service is a future consumer only and is not in this phase.

## Deferred List (Explicit)

Deferred until separately approved:

- payment execution automation and recurring auto-charge engines
- autopay/saved cards/subscriptions
- partial payments and split allocations beyond first posture
- refunds/disputes tooling and provider API execution
- ACH rails and ACH UX exposure
- receipt automation
- customer portal payment self-service
- QBO sync/export implementation
- platform application-fee execution
- automatic next_due_date advancement linked to payment outcomes

## Owner Decisions Needed Before Implementation

Before implementation starts, owner should explicitly decide:

1. Billing-period lifecycle states and transitions (including overdue/waived/cancelled semantics).
2. First-period invoice issuance trigger posture (manual issue first vs limited assisted flow).
3. Allocation introduction strategy is now resolved: first explicit table is `internal_invoice_payment_allocations` with invoice-only target and one-source-to-one-allocation posture.
4. Correction/reversal operator workflow posture and minimum audit requirements.
5. Platform-fee policy and disclosure posture (if/when reopened).
6. Unpaid billing-period operational posture (warning-only first is recommended).

## Recommended Sequence After This Lock

- Phase 3: Payments Register Mutation / Correction Foundation (additive, no projection regression).
- Phase 4: Allocation Foundation and allocation-aware projection compatibility layer.
- Phase 5: Service Plan Billing Period read/write foundation with manual invoice linkage.
- Later: automation/autopay/portal/QBO/advanced payment rails only if explicitly reopened.

## Acceptance Criteria For Next Implementation Phase (Phase 3)

Phase 3 is ready to start only when:

- this model lock is accepted as canonical for payment register/allocation/billing-period semantics
- no source-of-truth conflicts remain across active docs
- projection compatibility guardrail is explicit (no invoice paid/balance trust regression)
- correction/reversal semantics are accepted as non-destructive
- deferred list remains explicit and unchanged

## Non-Implementation Confirmation

This spec is docs/model-only and does not perform or authorize:

- code changes outside documentation
- schema/migration changes
- Supabase command execution
- Stripe checkout/session/payment-rail behavior changes
- env/flag/provider/production changes
