# Financial Ledger / Payments Register V1 Model Spec

Status: ACTIVE MODEL LOCK
Owner lane: Financial Ledger / Payments Register V1
Scope: docs/model only. No schema, migration, Supabase, Stripe, QBO, env, production, recurring billing, platform fee, or ACH UI work is authorized by this spec.

Implementation gate status:

- Service Role Controls / Financial Access Controls V1A-2, V1A-3, and V1A-4 are implemented and documented in [Service_Role_Controls_and_Financial_Access_V1_Model_Spec.md](./Service_Role_Controls_and_Financial_Access_V1_Model_Spec.md).
- Financial access-control prerequisite for Billing Register resume is satisfied.
- Billing Register V1 may resume in the next implementation lane under Owner/Admin/Billing authority using existing financial-access helper/server-side gates.
- Billing Register UI/actions remain deferred in this pass and are not implemented by this docs closeout.

Current financial access model for sensitive financial actions:

- authorized: structural owner, admin, billing
- blocked by default: dispatcher/office, technician, contractor/portal users, inactive users, unauthenticated users
- currently gated server-side actions: manual internal invoice payment recording, tenant customer payment-link/checkout-session creation, invoice ledger CSV export, invoice draft create/update, invoice issue, invoice void, and invoice email send/resend

Role authority posture (implemented):

- allowed: structural owner, admin, billing
- blocked by default: dispatcher/office, technician, contractor/portal users, inactive users, unauthenticated users
- Billing / AR has financial authority but is not Admin and does not inherit team/admin settings authority
- admin-only authority remains separate; Billing / AR is not Admin and does not manage admin settings/team access by default

## Purpose

Financial Ledger / Payments Register V1 defines the bookkeeping-ready payment tracking model for Compliance Matters Software before recurring maintenance billing, deeper financial dashboards, QBO sync, or advanced payment workflows are built.

This lane exists because tenant payment tracking must become tenant financial operating truth, not only job closeout support. Jobs and invoices can show whether work has been closed and billed, but tenants also need one app-level place to understand money received, failed payment signals, customer balances, and future allocations across invoices or recurring billing periods.

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

- `payment_register_entry_id`
- `allocation_target_type`
- `allocation_target_id`
- `allocated_amount`
- `allocation_status`
- `created_at`
- `created_by_user_id`

Allowed target types:

- `invoice`
- `future_service_plan_billing_period`
- `future_customer_credit`

V1 implementation posture:

- One payment to one invoice first is acceptable.
- The model must not block future multi-allocation.
- Invoice paid/balance derives from successful allocations.
- Manual invoice paid-state mutation is not payment truth.
- Stripe-collected payment rows must still be webhook-only.

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

F. Customer profile payment history.

G. Dedicated Payments Register plus CSV.

H. Dashboard cards.

I. Allocation foundation.

J. Recurring billing-period model.

K. Stripe subscription recurring plans.

Each slice should preserve webhook-only truth for Stripe-collected payments and avoid QBO, ACH, platform fee, refund/dispute, saved-card, portal, or recurring billing behavior unless explicitly reopened.

## Documentation Cross-References

Related active docs:

- [Active Spine V4.0 Current.md](./Active%20Spine%20V4.0%20Current.md)
- [Compliance_Matters_Payments_Roadmap.md](./Compliance_Matters_Payments_Roadmap.md)
- [Compliance_Matters_Business_Layer_Roadmap.md](./Compliance_Matters_Business_Layer_Roadmap.md)
- [Release_Scope_Lock_and_Post_Launch_Roadmap.md](./Release_Scope_Lock_and_Post_Launch_Roadmap.md)
- [Compliance_Matters_Prelaunch_Confirmation_Checklist.md](./Compliance_Matters_Prelaunch_Confirmation_Checklist.md)
- [Maintenance_Agreements_V1_Model_Spec.md](./Maintenance_Agreements_V1_Model_Spec.md)

## Non-Implementation Boundary

This model spec created no implementation approval by itself.

No code changes, schema changes, migrations, Supabase commands, Stripe API calls, env/secret changes, production changes, QBO work, recurring billing implementation, platform fee implementation, or ACH UI are authorized by this spec.
