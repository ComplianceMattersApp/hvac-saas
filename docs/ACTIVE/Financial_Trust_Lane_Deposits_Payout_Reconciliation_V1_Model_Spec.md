# Financial Trust Lane - Deposits / Payout Reconciliation V1 Model Spec

Status: ACTIVE MODEL LOCK
Owner lane: Financial Trust Lane / Deposits and Payout Reconciliation V1
Scope: docs/model only. No product code, schema, migrations, Stripe behavior, reports, env, RLS, payments, invoices, allocations, QBO behavior, production data, or customer-facing behavior is changed or authorized by this spec.

## Readiness Verdict

GO WITH LIMITATIONS.

Gross payment tracking is usable, but owner-grade bank deposit and Stripe payout reconciliation is missing.

Current payment reporting can show collected invoice payment truth from `internal_invoice_payments`. Failed payments are separated. Reversed rows are excluded from collected totals. The Payments Register CSV is useful for operational review, but it is not bookkeeping-complete because it does not include Stripe fee, net, balance transaction, payout, or arrival-date detail.

The current app cannot fully explain why a `$500.00` collected invoice payment becomes a `$490.00` bank deposit. Until this V1 layer is live and smoke-tested, Stripe Dashboard remains the fallback for bank deposit explanation.

## Cross-References

This model lock is subordinate to and should remain consistent with:

- [Active Spine V4.0 Current.md](./Active%20Spine%20V4.0%20Current.md)
- [Release_Scope_Lock_and_Post_Launch_Roadmap.md](./Release_Scope_Lock_and_Post_Launch_Roadmap.md)
- [Financial_Ledger_Payments_Register_V1_Model_Spec.md](./Financial_Ledger_Payments_Register_V1_Model_Spec.md)
- [Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md](./Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md)

Relevant inherited locks:

- `internal_invoice_payments` remains collected gross payment event truth.
- `internal_invoice_payment_allocations` remains payment-to-invoice allocation truth.
- Invoice paid/balance remains a projection from collected payment/allocation truth.
- Failed payment attempts are visibility/audit truth, not collected money.
- Platform/application fees are not customer-facing surcharge line items unless separately approved.
- QBO/general ledger behavior remains deferred and separate.

## Source-Of-Truth Boundaries

### Gross Payment Event Truth

`internal_invoice_payments` is gross payment event truth.

It answers:

- which tenant owns the payment event
- which invoice/job context the event belongs to
- gross amount collected or attempted
- method/status
- paid/attempt timestamp
- Stripe checkout/session/payment-intent/charge identifiers when available
- whether the event is recorded, failed, pending, or reversed

It does not answer:

- Stripe fee
- platform/application fee as settled
- net amount
- Stripe balance transaction identity
- payout identity
- payout arrival date
- bank deposit grouping

### Payment-To-Invoice Allocation Truth

`internal_invoice_payment_allocations` is payment-to-invoice allocation truth.

It answers:

- which collected payment applies to which invoice
- allocation amount
- allocation lifecycle
- whether the allocation counts toward invoice paid/balance

It must not become payout or deposit truth.

### Stripe Settlement Truth

`stripe_payment_settlements` is the proposed Stripe fee/net/payout reconciliation truth.

It answers:

- how a gross Stripe payment settled
- Stripe fee amount
- platform/application fee amount when represented in Stripe settlement data
- net amount
- Stripe balance transaction identity
- payout identity
- payout status
- payout arrival date
- unmatched Stripe settlement items that do not yet map to local payment rows

This layer is additive reporting truth only. It must not drive invoice paid/balance, payment allocation, QBO posting, refund execution, dispute execution, or customer collection behavior in V1.

## Missing Reconciliation Gap

Current local payment rows store enough Stripe references to identify many customer payments:

- Stripe checkout session id
- Stripe event id
- Stripe payment intent id
- Stripe charge id / processor charge reference
- Stripe charged timestamp
- connected account readiness fields on the business profile

Current local payment rows do not store:

- Stripe balance transaction id
- Stripe fee
- platform/application fee as settled
- net amount
- payout id
- payout status
- payout arrival date
- fee details
- reporting category
- available-on date
- payout grouping
- unmatched settlement items

Because these fields are missing, owner/bookkeeping reports can show gross money collected but cannot reconcile gross collected money to bank deposits.

## Proposed Schema Field Contract

Future additive migration proposal:

`supabase/migrations/20260610110000_stripe_payment_settlements_foundation.sql`

Proposed table:

`stripe_payment_settlements`

Required field contract:

- `id`
- `account_owner_user_id`
- `internal_invoice_payment_id` nullable only for unmatched Stripe items
- `stripe_connected_account_id`
- `stripe_charge_id`
- `stripe_payment_intent_id`
- `stripe_checkout_session_id`
- `stripe_balance_transaction_id`
- `stripe_payout_id`
- `source_object_type`
- `gross_amount_cents`
- `stripe_fee_cents`
- `platform_fee_cents`
- `net_amount_cents`
- `currency`
- `available_on`
- `payout_arrival_date`
- `payout_status`
- `reporting_category`
- `fee_details` as `jsonb`
- `sync_status`
- `sync_error`
- `synced_at`
- `created_at`
- `updated_at`

Recommended constraints and indexes:

- additive-only table creation
- account-scoped ownership via `account_owner_user_id`
- `internal_invoice_payment_id` foreign key to `internal_invoice_payments`, nullable for unmatched Stripe items
- unique scoped identity on `(stripe_connected_account_id, stripe_balance_transaction_id)` where balance transaction id is present
- index `(account_owner_user_id, stripe_payout_id)`
- index `(account_owner_user_id, available_on)`
- index `(account_owner_user_id, payout_arrival_date)`
- index `(account_owner_user_id, sync_status)`
- RLS select scoped to the current internal account owner
- service/admin-only writes in first implementation posture

Required non-regression rule:

No migration may alter existing invoice, payment, allocation, QBO, Stripe webhook, checkout, saved-card, scheduled-autopay, or report read paths unless a later phase explicitly approves that change.

## Sync / Helper Behavior

V1 sync helper should be server-side only.

Likely future helper:

`lib/business/stripe-payment-settlements.ts`

Core behavior:

- Given an `internal_invoice_payment_id` or Stripe charge id, load the gross payment context.
- Require connected-account context.
- Fetch Stripe Charge in the connected account context.
- Resolve or fetch the Stripe Balance Transaction.
- Store gross, Stripe fee, platform/application fee where available, net, currency, available date, reporting category, fee details, and balance transaction id.
- Attach payout id, payout status, and payout arrival date when payout information is available.
- Upsert idempotently.
- Allow safe retry.
- Store sync failures in settlement truth only.
- Return counts or result states such as `synced`, `skipped`, `unmatched`, and `failed`.

Hard behavior locks:

- no invoice paid/balance mutation
- no `internal_invoice_payments` mutation except future optional reference enrichment if explicitly approved later
- no `internal_invoice_payment_allocations` mutation
- no payment collection behavior change
- no refund or dispute mutation workflow
- no QBO/general-ledger behavior
- no customer notification behavior
- no cron in first slice

Stripe objects likely needed:

- Charge
- PaymentIntent where needed for identity/backfill
- Balance Transaction
- Payout
- fee details attached to the balance transaction

## Manual / Internal Sync Runner Shape

First sync path should be manual/internal, not cron.

Likely future surfaces:

- internal operator action or internal admin page
- account-owner scoped
- date range input
- optional payment id or charge id input
- dry-run and commit mode if practical

Runner output should report:

- synced count
- skipped count
- unmatched count
- failed count
- skipped reason summary
- failed reason summary

Runner must not expose owner-facing controls until the sync behavior is tested and safe.

## Deposits Report Shape

Future route:

`/reports/deposits`

Access:

- structural Owner
- Admin
- Billing

Report posture:

- read-only reconciliation
- grouped by Stripe payout/deposit
- does not mutate invoice paid/balance
- does not mutate payment rows
- does not mutate allocation rows
- does not create QBO/general-ledger entries
- does not execute refunds, disputes, or adjustments

Summary cards:

- Gross Collected
- Stripe Fees
- Platform Fees
- Net Deposits
- Pending Payouts
- Adjustments / Unmatched

Table columns:

- payout date
- payout id
- gross amount
- Stripe fees
- platform fees
- net amount
- payout status
- arrival date
- count of payments
- unmatched count

Safe report copy:

Deposit reconciliation explains Stripe settlement and bank deposit timing. Invoice paid/balance remains controlled by payment webhook and allocation truth.

## Deposit Detail Shape

Future detail route may be:

`/reports/deposits/[payoutId]`

Detail view should show included settlement rows:

- payment id
- invoice number
- customer
- job/test reference
- job title
- gross amount
- Stripe fee
- platform fee
- net amount
- currency
- charge id
- payment intent id
- balance transaction id
- payment date
- available date
- payout date
- payout status
- payout arrival date
- unmatched marker
- notes/reference from payment row where available

Unmatched Stripe items must be visible as unmatched, not hidden or forced into invoice/payment truth.

## CSV Export Shape

V1 should include two exports:

1. Deposit Summary CSV
2. Deposit Detail CSV

Deposit Summary CSV fields:

- payout id
- payout status
- payout arrival date
- payout available/created date where applicable
- gross amount
- Stripe fees
- platform fees
- net amount
- currency
- payment count
- unmatched count
- sync status summary

Deposit Detail CSV fields:

- payout id
- payout status
- payout arrival date
- available date
- payment id
- invoice number
- customer
- job reference
- job title
- gross amount
- Stripe fee
- platform fee
- net amount
- currency
- charge id
- payment intent id
- checkout session id
- balance transaction id
- reporting category
- notes/reference
- unmatched marker
- sync status
- sync error where present

CSV export must be bookkeeping-oriented and must include stable Stripe identifiers.

## Access Control

Owner-facing report access should use the existing financial authority posture:

- structural Owner allowed
- Admin allowed
- Billing allowed
- dispatcher/office blocked unless separately granted later
- technician blocked
- contractor/portal users blocked
- inactive users blocked
- unauthenticated users blocked

Manual/internal sync controls should be more restrictive at first:

- internal/operator-only or Admin-only until smoke-tested
- account scoped
- no cross-account access
- no customer/portal visibility

Settlement row reads must remain account scoped. Settlement writes should be service/admin-only in first posture.

## Production Gates

Do not expose Deposits / Payout Reconciliation as owner-facing production truth until:

- additive settlement schema is reviewed and applied safely
- RLS/account scoping is validated
- connected account readiness is complete for the target tenant
- settlement sync succeeds in sandbox
- at least one successful payment can be traced from invoice gross payment to balance transaction to payout
- CSV export matches Stripe Dashboard for at least one payout
- failed/unmatched sync states are visible
- no invoice paid/balance mutation occurs from settlement sync
- no payment/allocation mutation occurs from settlement sync
- no QBO/general-ledger behavior is introduced
- support/operator runbook exists for Stripe Dashboard fallback and sync-failed handling
- rollback plan is clear: hide report/sync controls while preserving settlement rows

## Explicit Non-Actions

This model lock does not authorize:

- product code changes
- schema changes
- migrations
- RLS changes
- Supabase commands
- Stripe API calls
- Stripe webhook behavior changes
- Stripe checkout/session behavior changes
- invoice mutation
- invoice paid/balance mutation
- payment row mutation
- payment allocation mutation
- QBO sync/export/general-ledger behavior
- refund execution
- dispute execution
- adjustment mutation workflow
- customer notification behavior
- cron/scheduled jobs
- owner-facing report launch
- production data mutation
- env or secret changes

Refunds, disputes, reversals, corrections, and adjustments remain future modeling/reporting concerns unless explicitly reopened. V1 may report Stripe settlement items that are already present in Stripe, but it must not create refund/dispute workflows.

## Implementation Phase Plan

### Phase A - Docs / Model Lock

Create this ACTIVE model spec.

Acceptance:

- readiness verdict is locked as GO WITH LIMITATIONS
- source-of-truth boundaries are explicit
- non-actions are explicit
- no code/schema/env behavior changes

### Phase B - Schema Foundation

Add `stripe_payment_settlements` as an additive table.

Acceptance:

- table is account scoped
- payment id is nullable only for unmatched Stripe items
- settlement identity is idempotent
- RLS is account scoped
- existing payment/invoice/allocation read paths are unchanged

### Phase C - Stripe Settlement Sync Helper

Add server-side helper to fetch charge, balance transaction, and payout data in connected-account context.

Acceptance:

- gross/fee/net/payout fields persist
- helper is idempotent
- helper is safe to retry
- helper is non-blocking relative to existing payment truth
- no invoice/payment/allocation mutation

### Phase D - Manual / Internal Sync Runner

Add internal manual sync path.

Acceptance:

- account scope required
- date range supported
- synced/skipped/unmatched/failed counts shown
- no cron
- no owner-facing control until validated

### Phase E - Read-Only Deposits Report

Add `/reports/deposits`.

Acceptance:

- Owner/Admin/Billing access only
- grouped payout summary
- gross/fee/net/pending/unmatched summary
- no mutations

### Phase F - Deposit Detail

Add payout detail drilldown.

Acceptance:

- included payment rows visible
- invoice/customer/job context visible
- charge/payment-intent/balance-transaction identities visible
- unmatched rows visible

### Phase G - CSV Exports

Add Deposit Summary CSV and Deposit Detail CSV.

Acceptance:

- bookkeeping fields included
- Stripe identifiers included
- gross/fee/net included
- unmatched/sync status included

### Phase H - Sandbox / Live Smoke

Run controlled smoke only after previous phases are complete.

Smoke checklist:

1. Create issued invoice.
2. Pay through Stripe connected account.
3. Verify invoice paid/balance updates from existing webhook only.
4. Verify Payments Register gross payment.
5. Run settlement sync.
6. Verify settlement row.
7. Verify Deposits report gross/fee/net.
8. Verify detail drilldown.
9. Export CSV and compare to Stripe Dashboard.
10. Confirm no invoice/payment/allocation truth distortion.

## Acceptance Criteria For V1

A tenant owner can reconcile a collected Stripe payment to a bank deposit.

Minimum proof:

- App shows gross invoice payment amount.
- App shows Stripe fee.
- App shows platform/application fee when represented in settlement data.
- App shows net amount.
- App shows balance transaction id.
- App shows payout id.
- App shows payout status.
- App shows payout arrival date.
- App links settlement back to invoice/customer/job/payment context.
- App exports the same reconciliation in CSV.
- Invoice paid/balance remains unchanged by settlement reporting.

Example target explanation:

`$500.00` gross collected payment minus `$10.00` combined Stripe/platform settlement costs equals `$490.00` net deposited, tied to Stripe balance transaction and payout identity.

## Non-Implementation Confirmation

This Phase A document is docs-only.

It does not change product code, schema, migrations, Stripe behavior, reports, env, RLS, payments, invoices, allocations, or QBO behavior.

Stripe Dashboard remains the operational fallback for fee/net/payout explanation until the V1 settlement layer is implemented, smoke-tested, and explicitly released.
