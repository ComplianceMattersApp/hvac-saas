# Financial Ledger / Payments Register V1 Model Spec

Status: ACTIVE MODEL LOCK
Owner lane: Financial Ledger / Payments Register V1
Scope: docs/model only. No schema, migration, Supabase, Stripe, QBO, env, production, recurring billing, platform fee, or ACH UI work is authorized by this spec.

## Documentation Authority Note

This spec owns durable Financial Ledger / Payments Register source-of-truth contracts, invariants, and payment/register boundaries. Phase closeout proof and duplicated smoke evidence belong in [Domain_Model_Closeout_Evidence_Ledger.md](./Domain_Model_Closeout_Evidence_Ledger.md), with roadmap/deferred sequencing owned by roadmap docs.

Duplicated closeout sections may be shortened against the evidence ledger when the durable model contract remains clear in this spec. Do not remove payment invariants, allocation truth, failed-payment handling, or invoice paid/balance projection contracts from this spec.

## July 2026 Runtime Consumer Note

This model remains authoritative for payment truth. Current runtime consumers now include signed invoice-specific guest Stripe payment, manual/off-platform payment recording, Stripe webhook dual-write, QBO downstream sync, internal payment-received email, internal contractor financial history, and the strictly contractor-billed portal invoice center. These consumers do not change the invariants below: only recorded payment/allocation truth counts; communication and portal views are projections; QBO is downstream; failed/pending/reversed rows are not collected money. Older deferred lists in phase-closeout prose are historical to those phases and do not override this current posture.

## Financial Trust Lane Settlement Boundary Note

- Deposits / Payout Reconciliation V1 is documented in [Financial_Trust_Lane_Deposits_Payout_Reconciliation_V1_Model_Spec.md](./Financial_Trust_Lane_Deposits_Payout_Reconciliation_V1_Model_Spec.md).
- Payments Register remains gross payment event truth over `internal_invoice_payments`.
- `stripe_payment_settlements` is a separate additive settlement layer for Stripe fee/net/payout reconciliation and must not count toward collected totals or mutate invoice paid/balance.
- Payments / Bank Deposits reporting foundation is active for current scope: production settlement migrations are applied, Owner/Admin/Billing users have controlled preview/commit settlement refresh plus report/detail/CSV access, and Dispatcher/Technician/portal/cross-account access remains hidden or blocked. The report explains each invoice payment and each real Stripe payout as customer payments minus proven fees/deductions equals expected bank deposit. It is a support schedule for balancing books; the bank or connected accounting feed remains proof of what arrived.
- Local Checkout testing note: invoice payment confirmation requires Stripe CLI forwarding with `stripe listen --forward-to localhost:3000/api/stripe/webhook`; `.env.local STRIPE_WEBHOOK_SECRET` must match the listener `whsec_...`, and the dev server must be restarted after changing `.env.local`.
- Checkout complete page copy now presents `Payment submitted` and returns users through refresh-aware invoice/job links, but webhook confirmation remains the only writer of Stripe-collected payment truth.

## Phase 6J-A Note (Platform Application Fee Foundation)

- A foundation helper now locks default platform application fee math to `50` basis points (`0.50%`) with explicit skip guards and rounding behavior.
- Platform application fee policy was updated from 25 basis points (0.25%) to 50 basis points (0.50%). Source-of-truth boundaries remain unchanged: app payment truth remains gross customer payment truth, platform application fee remains Stripe/platform revenue only, no customer-facing surcharge line item is introduced, and invoice paid/balance truth is not distorted.
- This model note does not authorize payment register mutation, allocation mutation, invoice truth mutation, or Stripe create-call mutation in this phase.
- Register truth boundaries remain unchanged: collected-money truth is still webhook-confirmed `internal_invoice_payments`; allocation truth remains `internal_invoice_payment_allocations`; failed rows remain non-collected.

## Phase 6J-E2 Note (Platform Application Fee Wiring + Smoke Closeout)

- Phase A/B foundation is complete with default fee policy locked to `50` basis points (`0.50%`).
- Phase C wiring is complete for invoice Checkout application fee.
- Phase D wiring is complete for shared saved-card/manual plus scheduled-autopay PaymentIntent submit path.
- Phase E/E2 sandbox smoke is complete for current intended scope:
- Checkout path: `1750` cents gross charge with `9` cents application fee.
- Saved-card/manual path: `1750` cents gross charge with `9` cents application fee.
- Register model lock remains unchanged: platform application fee is Stripe/platform revenue only and does not create customer-facing surcharge line items.
- Collected-money projection lock remains unchanged: invoice paid/balance truth remains gross-payment-derived with no paid/balance distortion.
- Failed-payment lock remains unchanged: failed rows remain non-collected and must not inflate collected totals.
- Operational lock remains unchanged: no visit mutation and no next-due-date mutation.
- Deferred lock remains unchanged: refunds/disputes deferred and ACH deferred. Customer payment success redirect polish is complete for the current Checkout return screen; webhook confirmation remains payment truth.
- Current UX sequencing note: invoice page UX cleanup is next lane; customer page IA/UX cleanup follows.
- Closeout constraints remain satisfied: no production Stripe action and no schema change.

## Payment / Autopay Closeout Evidence Summary

Historical closeout proof for Phase 6F-C manual saved-card charge, Phase 6G scheduled-autopay attempt smoke, Phase 6H failed-autopay attention/retry, and Phase 6I failed-payment reconciliation visibility is preserved in [Domain_Model_Closeout_Evidence_Ledger.md](./Domain_Model_Closeout_Evidence_Ledger.md).

This spec keeps the durable Financial Ledger / Payments Register contracts:

- `internal_invoice_payments` remains collected-money/payment-event truth.
- `internal_invoice_payment_allocations` remains allocation truth.
- `tenant_saved_method_payment_attempts` remains workflow/attempt/attention truth, not collected-money truth.
- Failed payment rows are non-collected and inactive allocations do not count toward paid/balance.
- Invoice paid/balance projection remains derived from collected payment truth and valid allocation/projection logic.
- Stripe remains processor/payment-method truth and must not directly redefine invoice paid/balance state.
- Payment flows must not mutate maintenance visits or `maintenance_agreements.next_due_date`.
## Purpose

Financial Ledger / Payments Register V1 defines the bookkeeping-ready payment tracking model for Compliance Matters Software before recurring maintenance billing, deeper financial dashboards, QBO sync, or advanced payment workflows are built.

This lane exists because tenant payment tracking must become tenant financial operating truth, not only job closeout support. Jobs and invoices can show whether work has been closed and billed, but tenants also need one app-level place to understand money received, failed payment signals, customer balances, and future allocations across invoices or recurring billing periods.

Related model lock:

- Service Plan Billing Foundation Phase 2 is documented in [Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md](./Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md).
- First Service Plan Billing posture is billing-period commercial truth linked to normal internal invoices and existing invoice payment truth.
- Auto-charge/autopay/subscription execution remains deferred unless explicitly reopened.

Locked principle:

- Stripe is processor truth for Stripe transactions.
- Compliance Matters is tenant financial operating truth for all money received.

This spec does not approve implementation. It locks the model so later implementation slices do not trap payment truth inside an invoice/job-only structure.

## Current State

Current collected-payment truth for issued internal invoices is `internal_invoice_payments`.

Current behavior:

- `internal_invoice_payments` stores payment rows for issued internal invoices.
- Manual/off-platform payment recording exists for issued invoices.
- Stripe webhook handlers write successful online payment rows.
- Stripe failed attempts can be stored as failed, non-balance-changing rows.
- Checkout Session creation and invoice email payment-link generation do not record collected payment.
- Invoice paid/balance projection is derived from payment rows where `payment_status = recorded`.
- Failed, pending, reversed, or other non-recorded states do not contribute to paid/balance totals.
- Invoice report and CSV export already surface amount paid, balance due, payment status, last payment, and payment count from current invoice-bound payment truth.

Known limitations:

- `internal_invoice_payments` is invoice/job-bound.
- It does not support customer-level unapplied payments.
- It does not support one payment allocated to multiple invoices.
- It does not support allocation to future service-plan billing periods.
- It has no explicit payment source field.
- Manual payment date is not a first-class user-entered field.
- Payment rows do not carry direct `customer_id`.
- Failed attempts need cleaner visual/report separation from collected money.
- There is no dedicated Payments Register report.
- It is good enough for today's invoice-bound payment truth, but not sufficient as the long-term financial register.

## Source-Of-Truth Model

Financial/payment truth should be split into these concepts.

### Payment Register Entry

A Payment Register Entry represents one payment-related event for a tenant customer.

For collected payments, it is one money-received event. For failed Stripe attempts, it is a payment attempt signal, not collected money.

The register is the tenant financial operating view across:

- Stripe online payments
- manually recorded card payments
- checks
- cash
- digital payments
- other off-platform payment methods
- future imported or synced payment records

### Payment Allocation

A Payment Allocation connects a Payment Register Entry to the thing it pays.

V1 may implement one payment to one invoice first, but the model must not block:

- one payment allocated to multiple invoices
- one payment allocated to a future service-plan billing period
- one payment held as future customer credit
- later adjustments or write-offs

Invoice paid/balance must derive from successful allocations, not from manually mutating invoice paid status.

### Invoice Payment Projection

Invoice Payment Projection is a read-side calculation.

For an invoice, projection derives:

- amount paid
- balance due
- unpaid / partially paid / paid state
- last payment date
- payment count

The projection must be derived from successful payment allocations or, during compatibility with current V1 invoice-bound rows, from equivalent successful invoice payment rows.

Projection is not itself payment truth.

### Failed Payment Attempt

A Failed Payment Attempt is a payment signal, not collected money.

Failed attempts should be stored for audit, support, and dashboard attention, but must be excluded from:

- amount paid
- balance due reduction
- collected payment totals
- payments received metrics

Failed attempts should be visually separated from collected payments.

### Adjustment / Credit / Write-Off

Adjustments, customer credits, and write-offs are not V1 payment collection behavior, but the allocation model must leave room for them.

Future model decisions should distinguish:

- customer credit
- invoice adjustment
- write-off
- refund/reversal
- payment correction

These must not be faked as ordinary collected payments.

### Refund / Reversal

Refunds, disputes, chargebacks, and reversals are deferred.

The model reserves statuses and future concepts for them, but V1 implementation should not expose refund/dispute tooling until explicitly designed.

### Recurring Billing Period

Recurring Billing Period is future.

Maintenance/service-plan billing must connect through billing periods and payment allocations. Money must not attach directly to visit links or visit-count rows.

## Payment Register Entry Model

Conceptual fields:

- `id`
- `account_owner_user_id`
- `customer_id`
- `source`: `webhook`, `manual`, `import`, `future_sync`
- `method`: `online_stripe`, `card`, `check`, `cash`, `digital`, `other`
- `status`: `recorded`, `failed`, `voided`, `reversed`, `refunded`
- `amount`
- `currency`
- `payment_date`
- `recorded_at`
- `recorded_by_user_id`
- `reference`
- `memo`
- `notes`

Processor fields where applicable:

- `stripe_connected_account_id`
- `stripe_checkout_session_id`
- `stripe_payment_intent_id`
- `stripe_charge_id`
- `stripe_event_id`
- `failure_code`
- `failure_reason`

Status posture:

- `recorded`: successful collected money.
- `failed`: payment attempt failed; not collected money.
- `voided`: future/manual correction status.
- `reversed`: future reversal status.
- `refunded`: future refund status.

Only `recorded` entries with successful allocations should reduce balances or contribute to payments received totals.

## Payment Allocation Model

Conceptual fields:

- `source_internal_invoice_payment_id`
- `target_invoice_id`
- `allocated_amount`
- `allocation_status`
- `created_at`
- `created_by_user_id`

V1 implementation posture:

- One payment to one invoice first is acceptable.
- Unique `source_internal_invoice_payment_id` enforces one source payment to one allocation row in first posture.
- First target is invoice only.
- Statuses are locked to `active`, `inactive`, `reversed`, `voided`.
- Only `active` allocations count in future allocation-backed collected totals.
- Invoice paid/balance derives from successful allocations.
- Manual invoice paid-state mutation is not payment truth.
- Stripe-collected payment rows must still be webhook-only.

Future expansion (explicitly deferred):

- service-plan billing period target columns (including `target_service_plan_billing_period_id`)
- customer credit target columns
- multi-invoice split allocations
- overpayment/credit carry-forward behavior
- partial-payment expansion beyond existing invoice-payment behavior

## Manual Payment Requirements

Manual payments are for off-platform money received only.

Manual entries should require:

- customer
- amount
- payment date
- method
- source = `manual`
- status = `recorded`
- reference or memo
- recorded_by
- recorded_at
- allocation target, invoice first

Manual payment method selection must not include `online_stripe`.

Manual payment recording must not be used to mark Stripe payments paid. If money was collected by Stripe, the payment register entry must originate from verified webhook handling.

## Stripe Payment Requirements

Stripe payment register entries must be created only by verified webhook handling.

Checkout Session creation must not record collected payment.

Invoice email payment-link generation must not record collected payment.

Stripe rows should use:

- source = `webhook`
- method = `online_stripe`
- status = `recorded` or `failed`
- connected account context
- Stripe Checkout Session id where available
- Stripe Payment Intent id where available
- Stripe Charge id where available
- Stripe Event id as idempotency identity
- failure code/reason for failed attempts where available
- invoice/customer/job allocation metadata

Webhook processing must verify tenant/account ownership context before recording payment truth.

## Failed Payment Handling

Locked rule: failed payment attempts are useful financial/payment signals, but they are not collected money.

Failed attempts should be:

- stored for audit and support
- visually separated from collected payments
- excluded from paid/balance totals
- excluded from payments received metrics
- visible in dashboards as failed payment signals
- tied to Stripe identifiers and failure reason when available

The UI should not list failed attempts in a way that makes them look like received money.

## Payment Method Taxonomy

Tenant-facing V1 payment methods:

- Online / Stripe (`online_stripe`)
- Card (`card`)
- Check (`check`)
- Cash (`cash`)
- Digital (`digital`)
- Other (`other`)

Digital examples:

- Zelle
- Venmo
- Cash App
- PayPal
- bank app transfer

ACH is deferred and must remain hidden until ACH is actually supported/enabled.

Implementation mapping from current rows may be needed later:

- current `card_stripe_online` maps to tenant-facing `online_stripe`
- current `card_off_platform` maps to `card`
- current `bank_transfer` maps to `digital`
- current `cash`, `check`, and `other` map directly
- current `ach_off_platform` must not remain tenant-facing in V1 UI

## UI Surfaces

Future tenant surfaces:

- Invoice page payment summary/history
- Separate failed attempts list
- Record off-platform payment form
- Customer profile payment history
- Customer profile open balance
- Dedicated Payments Register page/report
- Exportable Payments Register CSV

Dashboard cards:

- payments received this month
- open invoices
- overdue invoices, once due dates/terms exist
- recent payments
- failed payment attempts
- payments by method

Owner/support visibility later:

- Stripe readiness
- tenants using online payments
- failed payment signals
- webhook/payment exceptions
- payment readiness problems

Owner/support visibility should remain read-only support context. It must not create payment links, refresh Stripe state unless explicitly designed, expose raw Stripe identifiers broadly, or mutate tenant financial truth.

## Recurring Plan Billing Connection

Recurring maintenance/service-plan billing must connect through billing periods and payment allocations.

Do not attach money directly to:

- service visit links
- visit count rows
- `maintenance_agreement_visits`

Future recurring billing should have:

- service plan enrollment
- billing period
- amount due
- payment allocation
- payment status
- Stripe subscription or manual payment source

Maintenance agreement visit counting remains operational entitlement/usage context. It is not payment truth.

## Deferred Items

Deferred until separately designed and approved:

- ACH
- QBO sync
- refunds/disputes tooling
- platform fees
- saved cards
- full accounting/general ledger
- tax automation
- customer portal self-service
- recurring billing execution
- automatic service-plan renewal billing
- deposits/progress billing unless separately designed

## Proposed Implementation Sequence

A. Model lock doc.

B. Taxonomy cleanup / hide ACH.

C. Read-only payment register from current `internal_invoice_payments`.

D. Manual payment field cleanup: payment date, source, method.

E. Invoice payment history plus failed-attempt separation.

F. Customer profile payment history (completed in V1C).

G. Dedicated Payments Register plus CSV.

H. Dashboard cards.

I. Allocation foundation.

J. Recurring billing-period model.

K. Stripe subscription recurring plans.

Each slice should preserve webhook-only truth for Stripe-collected payments and avoid QBO, ACH, platform fee, refund/dispute, saved-card, portal, or recurring billing behavior unless explicitly reopened.

## Documentation Cross-References

Related active docs:

- [PROJECT_TRUTH.md](../PROJECT_TRUTH.md)
- [Compliance_Matters_Payments_Roadmap.md](./Compliance_Matters_Payments_Roadmap.md)
- [Compliance_Matters_Business_Layer_Roadmap.md](./Compliance_Matters_Business_Layer_Roadmap.md)
- [Release_Scope_Lock_and_Post_Launch_Roadmap.md](./Release_Scope_Lock_and_Post_Launch_Roadmap.md)
- [Compliance_Matters_Prelaunch_Confirmation_Checklist.md](./Compliance_Matters_Prelaunch_Confirmation_Checklist.md)
- [Maintenance_Agreements_V1_Model_Spec.md](./Maintenance_Agreements_V1_Model_Spec.md)

## Non-Implementation Boundary

This model spec created no implementation approval by itself.

No code changes, schema changes, migrations, Supabase commands, Stripe API calls, env/secret changes, production changes, QBO work, recurring billing implementation, platform fee implementation, or ACH UI are authorized by this spec.
