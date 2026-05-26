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
