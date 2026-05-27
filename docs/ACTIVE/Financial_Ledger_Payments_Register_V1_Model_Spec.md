# Financial Ledger / Payments Register V1 Model Spec

Status: ACTIVE MODEL LOCK
Owner lane: Financial Ledger / Payments Register V1
Scope: docs/model only. No schema, migration, Supabase, Stripe, QBO, env, production, recurring billing, platform fee, or ACH UI work is authorized by this spec.

Implementation gate status:

- Service Role Controls / Financial Access Controls V1A-2, V1A-3, and V1A-4 are implemented and documented in [Service_Role_Controls_and_Financial_Access_V1_Model_Spec.md](./Service_Role_Controls_and_Financial_Access_V1_Model_Spec.md).
- **Payments Register V1A (Read-Only Register) is now implemented:**
  - `/reports/payments` read-only page displays register rows from `internal_invoice_payments`
  - Access gated to Owner/Admin/Billing only (Dispatcher/Technician blocked by default)
  - Recorded payments separated from failed attempts in UI with status field
  - Method taxonomy preserved: online_stripe, card, check, cash, digital, other (ACH hidden/mapped to 'other')
  - Filter panel: status, method, date range, text search
  - Stat cards: visible rows, recorded count, failed count, recorded total amount
  - Commit: `c9dc763`
- **Payments Register V1B (CSV Export) is now implemented:**
  - Filtered CSV export at `/reports/payments/export`
  - Exports current register rows with all filters preserved (status, method, date range, search)
  - Access gated with `canExportFinancialData()` (Owner/Admin/Billing only)
  - CSV includes: Paid Date, Amount, Status, Method, Customer, Invoice, Job Reference, Job Title, Reference, Notes
  - Failed attempts clearly marked by status field in export
  - Method taxonomy preserved (no ACH exposure)
  - Proper CSV escaping for special characters (quotes, commas, newlines)
  - Commit: `c9dc763`

Current financial access model for sensitive financial actions:
  - Proper CSV escaping for special characters (quotes, commas, newlines)
  - Commit: `c9dc763`
- **Payments Register V1C (Customer Profile Payment History) is now implemented:**
  - Customer profile payment history section on `/customers/{id}` page
  - Access gated with `canViewFinancialRegister()` (Owner/Admin/Billing only; Dispatcher/Technician/Contractor/Portal users blocked by default)
  - Section is read-only (no payment recording/corrections/allocations mutations)
  - Reads from `internal_invoice_payments` current truth only (scoped to account + customer)
  - Recorded payments, failed attempts, and other statuses visually separated by status section
  - Per-payment row shows: amount, status, method, paid date, invoice #, job title (linked), reference, notes
  - Empty state: "No recorded payments or failed attempts for this customer yet."
  - Footer link: "Open Payments Register →" with customer name pre-filtered search
  - Method taxonomy preserved (ACH hidden/mapped to 'other')
  - Browser smoke passed for card render, recorded row visibility, open-register filtered navigation, recorded/failed section separation, and preserved full-register CSV export availability
  - Commit: `55dab8c`
- Financial access-control prerequisite for Payments Register V1 is fully satisfied and leveraged.
- Payments Register UI/actions remain read-only in this pass; recording/corrections/allocations remain deferred in future phases.
- Payment correction, allocation, financial dashboard cards, QBO sync, ACH, platform fees, and recurring billing remain deferred.
- **Payments Register Mutation / Correction Foundation (Phase 3A) is now implemented:**
  - Additive reversal audit fields added to `internal_invoice_payments`: `reversed_at`, `reversed_by_user_id`, `reversal_reason`
  - Manual/off-platform `recorded` rows can be reversed by authorized financial users with required reason
  - Stripe/online rows are read-only in this correction flow (no refund/dispute/provider API behavior)
  - Failed and already-reversed rows are blocked from reversal
  - Reversal is non-destructive: original payment row is preserved and marked `reversed` with audit metadata
  - Invoice paid/balance and collected totals continue counting only `recorded` rows (reversed excluded)
  - Browser/UI posture: reverse action appears only on eligible off-platform recorded rows; failed/stripe rows do not expose reversal mutation affordance
  - Commit target for this closeout remains pending until final approval
- **Allocation Compatibility Foundation (Phase 4A) is now implemented as a compatibility layer (`a0a2d23`):**
  - Added compatibility helper semantics only; no allocation schema/table exists yet
  - No allocation rows are persisted/written
  - Invoice paid/balance projection now derives through allocation-compatible helper mapping from existing invoice-bound payment rows
  - Recorded-only collected truth is preserved; failed and reversed rows remain excluded from collected totals
  - Stripe webhook-origin rows and manual/off-platform rows keep existing projection behavior
  - No changes to payment recording flows, Stripe checkout/webhook behavior, Service Plan billing periods, `maintenance_agreement_visits`, customer portal, QBO, ACH, refunds/disputes, saved cards/autopay, or partial payments
- **Allocation Schema Model Lock (Phase 4B, docs/model only) is now locked:**
  - First explicit table name is `internal_invoice_payment_allocations`
  - First source key is `source_internal_invoice_payment_id` referencing `internal_invoice_payments.id`
  - First target is invoice-only via `target_invoice_id`
  - `target_service_plan_billing_period_id` and customer-credit target columns are deferred (future expansion only)
  - First posture is one source payment to one invoice allocation, enforced by unique `source_internal_invoice_payment_id`
  - First statuses are locked to `active`, `inactive`, `reversed`, `voided`
  - Only `active` allocations count toward invoice collected totals; `inactive`/`reversed`/`voided` do not count
  - If a future column like `counts_toward_collected_totals` is stored, it must not become independent financial truth; it must be omitted or constrained to remain status-consistent
  - Phase 4C boundary is additive table + RLS + indexes + tests only, with no UI, no projection switch, no payment-recording changes, no Stripe/webhook changes, and no Service Plan billing behavior changes
- **Allocation Table Foundation (Phase 4C) is now implemented as additive schema only (`20260526130000`):**
  - Added table `internal_invoice_payment_allocations` with first-posture columns and invoice-only target (`target_invoice_id`)
  - Enforced one-allocation-per-source-payment via unique `source_internal_invoice_payment_id`
  - Enforced first-posture statuses: `active`, `inactive`, `reversed`, `voided`
  - Did not add `counts_toward_collected_totals`; countability remains status-derived (`active` only) for future allocation-aware reads
  - Added account-scoped RLS SELECT/INSERT/UPDATE policies; no DELETE policy
  - Added source/target/account consistency enforcement at write time for source payment and target invoice alignment
  - No backfill and no runtime write-path adoption yet (manual/off-platform and Stripe webhook payment recording flows unchanged)
  - No read-path/projection switch in this phase; existing invoice-bound collected truth remains authoritative
  - No UI, Stripe checkout/webhook behavior, Service Plan billing behavior, portal, QBO, ACH, refunds/disputes, saved cards/autopay, partial payments, receipt automation, or platform fee execution changes
- **Allocation Population / Backfill / Write Strategy (Phase 4D, docs/model only) is now locked:**
  - Allocation rows are future-populated one-to-one from `internal_invoice_payments`
  - Allocation idempotency key is `source_internal_invoice_payment_id`
  - First mapping lock: `recorded -> active`, `pending/failed -> inactive`, `reversed -> reversed`
  - `allocated_amount_cents` preserves source `amount_cents` exactly, including signed/zero parity
  - `target_invoice_id` must equal source payment `invoice_id`
  - Failed/reversed source rows should still have allocation rows for lifecycle completeness, but remain non-counting
  - Projection remains on compatibility helper semantics until parity is proven
  - No read-path/projection switch is allowed yet
  - Backfill must be idempotent and retryable
  - Runtime allocation writers must be centralized
  - Manual payment and Stripe webhook dual-write are locked as separate implementation slices
  - Historical backfill is locked to run after runtime write strategy is implemented/locked
  - Production dormant schema migration planning/apply requires explicit approval before any runtime writer ships
  - Locked safer implementation sequence:
    1. Phase 4E: production dormant migration planning/apply, explicit approval only
    2. Phase 4F: centralized allocation write helper foundation, not wired
    3. Phase 4G: manual payment dual-write
    4. Phase 4H: Stripe webhook dual-write
    5. Phase 4I: historical backfill plus parity checks
    6. Later phase: allocation read-path switch only after parity gate passes
- **Production Dormant Allocation Migration Catch-up (Phase 4E) is now complete:**
  - Production schema catch-up completed on ref `ornrnvxtwwtulohqwxop`
  - Applied in order: `20260526110000_internal_invoice_payments_reversal_audit_foundation.sql`, then `20260526130000_internal_invoice_payment_allocations_foundation.sql`
  - Verified in production on `internal_invoice_payments`: `reversed_at`, `reversed_by_user_id`, `reversal_reason`, and reversal index
  - Verified in production on `internal_invoice_payment_allocations`: required columns, PK/FK/check/unique constraints, required indexes, RLS enabled, SELECT/INSERT/UPDATE policies present, no DELETE policy, and scope assertion trigger/function present
  - Verified forbidden/deferred columns absent: `counts_toward_collected_totals`, `target_service_plan_billing_period_id`, and customer-credit target fields
  - Allocation row count verified at `0`; no backfill was run
  - Runtime boundaries unchanged: no allocation writers, no projection/read-path switch, and no payment/manual/Stripe/webhook/checkout/UI/Service Plan Billing/QBO/ACH/refunds/disputes/saved cards/autopay/partial payments/receipt automation/platform-fee/customer-portal/service-plan-automation behavior changes
- **Centralized Allocation Write Helper Foundation (Phase 4F) is now complete:**
  - Added centralized helper foundation to create/update one persisted allocation row from one `internal_invoice_payments` row
  - Helper uses `source_internal_invoice_payment_id` idempotency and invoice-only target posture
  - Helper mapping follows locked Phase 4D rules: `recorded -> active`, `pending/failed -> inactive`, `reversed -> reversed`
  - Helper preserves source `amount_cents` exactly, including signed/zero parity
  - Helper is not wired into runtime payment flows yet
  - No manual payment dual-write yet
  - No Stripe webhook dual-write yet
  - No historical backfill
  - No projection/read-path switch
  - No UI/payment/manual/Stripe/webhook/checkout/Service Plan Billing/QBO/ACH/refunds/disputes/saved cards/autopay/partial payments/receipt automation/platform-fee/customer-portal/service-plan-automation behavior changes in this phase
  - Next slice remains Phase 4G manual payment dual-write, or a narrow Phase 4G-A helper smoke/parity pass if needed before runtime wiring
- **Manual Payment Dual-Write (Phase 4G) is now complete (manual/off-platform scope only):**
  - Manual/off-platform recorded payment action now invokes centralized allocation upsert to create/update allocation rows keyed by `source_internal_invoice_payment_id`
  - Manual payment reversal action now invokes centralized allocation upsert post-reversal to transition allocation status to `reversed`
  - Payment row remains authoritative; allocation dual-write failures are non-blocking for manual payment record/reversal success
  - No allocation deletes and no duplicate allocation rows introduced in this slice
  - No Stripe webhook dual-write yet (deferred to Phase 4H)
  - No historical backfill
  - No read-path/projection switch; invoice paid/balance remains compatibility-helper/payment-row derived
  - No UI, Stripe checkout/webhook, Service Plan Billing Period, QBO, ACH, refunds/disputes, saved cards/autopay, partial payments, receipt automation, platform-fee, customer-portal, or service-plan-automation behavior changes in this phase
- **Stripe Webhook Dual-Write (Phase 4H) is now complete (Stripe webhook scope only):**
  - Successful Stripe tenant invoice payment rows now invoke centralized allocation helper and create/update `active` allocation rows
  - Failed Stripe tenant invoice payment rows now invoke centralized allocation helper and create/update `inactive` allocation rows
  - Idempotent/replayed Stripe events now attempt allocation upsert against resolved existing payment row without changing Stripe payment idempotency behavior
  - Allocation helper failure is non-blocking after payment-row success; payment row remains authoritative
  - Existing Stripe event routing and duplicate protection remain unchanged
  - Projection/read path remains unchanged and still does not read persisted allocations
  - Historical backfill remains deferred
  - No UI behavior changed
  - No Service Plan Billing Period, QBO, ACH, refunds/disputes, saved cards/autopay, partial payments, receipt automation, platform-fee, customer-portal, or service-plan-automation behavior was added
- **Sandbox Historical Allocation Backfill + Parity Verification (Phase 4I-B) is now complete (docs-only):**
  - Sandbox ref: `kvpesjdukqwwlgpkzfjm`
  - Production ref `ornrnvxtwwtulohqwxop` was not queried or mutated
  - Supabase CLI temp state was mixed; data mutation ran through explicit sandbox URL/ref gate instead of CLI state
  - Preflight: payment rows 3, allocation rows 0, missing allocation rows 3, statuses recorded 2/reversed 1, no unexpected statuses, no required-field gaps, no missing invoice/account/job mismatch, no duplicate allocation sources
  - Backfill: attempted rows 3, returned rows 3, allocation statuses active 2/reversed 1
  - Post-backfill parity: payment rows 3, allocation rows 3, missing allocation rows 0, status mapping mismatches 0, payload mismatches 0, duplicate allocation sources 0, per-invoice parity mismatches 0
  - Global parity: recorded payment cents 10134, active allocation cents 10134, global parity matches true, reversed allocations active count 0
  - Runtime boundaries preserved: no projection/read-path switch, no UI/report behavior changes, no manual payment behavior changes, no Stripe webhook behavior changes, no production mutation
  - Validation snapshot: payment allocation + internal invoice payment tests 38 passed; payments register + invoice ledger tests 15 passed; `npx.cmd tsc --noEmit` passed; branch clean/synced
- **Production Historical Allocation Backfill Preflight + No-Op Decision (Phase 4I-C) is now complete (docs-only):**
  - Production ref confirmed: `ornrnvxtwwtulohqwxop`
  - Trusted production read access confirmed
  - SELECT-only audit performed with `mutation_performed=false`
  - Preflight metrics: payment rows 0, allocation rows 0, missing allocation rows 0, payment status breakdown `{}`, unexpected statuses `[]`, required field gaps 0, missing invoice 0, account mismatch 0, job mismatch 0, duplicate allocation sources 0, status mapping mismatches 0, payload mismatches 0, per-invoice parity mismatches 0, global recorded payment cents 0, global active allocation cents 0, global parity matches true, reversed allocations active by mistake 0
  - Production backfill is not needed because there are no production payment rows
  - No projection/read-path switch occurred
  - Payment row truth remains authoritative
  - Allocation table remains ready for future rows through manual and Stripe dual-write
- **Service Plan Billing Period Model Lock (Phase 5B) is now complete (docs/model only):**
  - Table/terminology: database table name is locked to `maintenance_agreement_billing_periods`; product/UI language remains Service Plan Billing Period
  - Source-of-truth boundaries: Maintenance Agreement = recurring obligation truth; Maintenance Agreement Visit = operational visit/link/counting truth; Billing Period = commercial coverage-window truth; Internal Invoice = billed commercial truth; Internal Invoice Payment = collected money truth; Payment Allocation = payment-to-invoice relationship truth; paid/unpaid billing state remains derived read-model only
  - First posture: billing periods are commercial coverage records; may optionally link to one normal internal invoice; first implementation links only to existing normal job-scoped invoices; no `internal_invoices` expansion beyond required `job_id`; no invoice auto-generation; invoice/payment linkage optional
  - Required fields lock: `id`, `account_owner_user_id`, `maintenance_agreement_id`, optional denormalized `customer_id`, `coverage_start_date`, `coverage_end_date`, `billing_due_date`, `billing_cadence`, `amount_due_cents`, `currency`, `billing_posture`, `billing_period_status`, nullable `internal_invoice_id`, external/off-platform reference fields, no-charge/waiver/not-billed reason fields, created/updated audit fields
  - Forbidden first-posture fields: payment IDs, allocation IDs, maintenance-agreement-visit IDs, visit-count fields, next-due mutation fields, operational blocking flags, direct Stripe/subscription IDs, QBO IDs
  - Lifecycle statuses lock: `draft`, `pending_billing`, `invoice_linked`, `externally_billed`, `no_charge`, `waived`, `not_billed`, `cancelled`
  - Billing posture values lock: `internal_invoice`, `external_off_platform`, `manual`, `no_charge`, `waived`, `not_billed_through_compliance_matters`
  - Derived payment display state lock (read-model only): `not_invoice_backed`, `invoice_draft`, `unpaid`, `partially_paid`, `paid`, `invoice_void`, `payment_attention`; this derives from invoice/payment truth where applicable and does not block operations
  - Invoice linkage rules: billing period may link to one internal invoice; linkage must be same account/customer scope; should prefer service-plan-originated/job-related invoice when available; first posture disallows multiple billing periods claiming same invoice; payment allocations remain invoice-targeted (no direct billing-period allocation target)
  - External/off-platform/manual/no-charge guardrails: never create fake CM payment rows; no-charge/waived/not-billed never treated as collected money; external references/notes/status metadata allowed; operational work remains allowed without internal billing
  - Operational guardrails: jobs/work orders/visits do not require billing period; visit counting does not require invoice/payment; billing period status does not mutate `maintenance_agreement_visits`; payment status does not advance `next_due_date`; unpaid state may inform warnings/reporting only; non-internal-billing tenants remain supported
  - Phase 5C acceptance criteria lock: additive table only; RLS/account scope; same-account agreement/customer/invoice checks; no UI; no invoice generation; no payment behavior changes; no projection/read-path switch; no service-plan visit/count behavior changes

- **Phase 6A closeout (Service Plan Automated Billing + Stripe-Saved Payment Method Audit) is now complete (docs/model only):**
  - Service Plan Billing Foundation V1 is complete, but full recurring-service automation requires a dedicated lane for generated invoices, Stripe-saved payment methods, explicit autopay consent, manual charge saved payment method, scheduled autopay attempts, and failed-payment/retry/attention workflow
  - Locked source-of-truth boundaries remain explicit:
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
    - keep `internal_invoices` job-scoped; do not remove required `job_id` in Phase 6B
    - generated invoice requires explicit operator-selected anchor job linked to the same maintenance agreement via `maintenance_agreement_visits`
    - first generation posture is draft-only with no auto-send, no auto-charge, no scheduled job, and no saved-card logic
    - one controlled service-plan billing line item only
    - amount source = `billing_period.amount_due_cents`; description source = deterministic coverage-window/cadence template
    - taxability and pricebook mapping must be explicit, not inferred
    - duplicate prevention requires both link-state block (`billing_period.internal_invoice_id` already set) and generation idempotency/audit keyed by account + billing period + generation kind
    - voided invoice surfaces through derived display only; no automatic billing-period lifecycle rewrite
    - cancelled billing period blocks new generation
    - lifecycle transition to `invoice_linked` occurs only after successful link
  - Stripe-saved payment method model lock:
    - Compliance Matters must never store full card number, CVC, raw bank/card data, or payment credentials
    - Stripe stores payment method and money movement; Compliance Matters stores safe references/metadata only
    - SetupIntent-first saved-method flow in connected-account context
    - Stripe customer profile scope = tenant account + tenant customer
    - multiple service plans for one customer may share the same Stripe customer/payment profile
    - multiple saved methods may exist with one default marker
    - connected-account disconnect/change marks payment profile stale and blocks charge attempts
  - Autopay consent model lock:
    - autopay disabled by default
    - consent scoped per maintenance agreement
    - persist consent version/timestamp/source/actor/capture channel/evidence reference
    - customer consent path is preferred
    - tenant-captured authorization remains future-only unless explicitly modeled with source flag + stronger audit
    - saved card present does not imply autopay enabled
    - autopay lifecycle states are distinct (`enabled`, `disabled`, `paused`, `revoked`)
    - disable/revoke are state transitions, never hard deletes
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
    - failed payment must not mutate visits or `next_due_date`
    - `requires_action` failures pause autopay until customer re-authenticates
    - retry policy is explicit and bounded; infinite retries are forbidden
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

- **Phase 6B closeout (Manual Generate Draft Invoice from Billing Period) is now complete (server-action only):**
  - Added `generateDraftInvoiceFromBillingPeriodFromForm` in `lib/maintenance-agreements/billing-period-actions.ts`
  - Access remains Owner/Admin/Billing only via existing financial authority gating; Dispatcher/Technician denied
  - Eligibility enforcement is active:
    - billing period exists in same account
    - billing period is non-cancelled and currently unlinked (`internal_invoice_id` null)
    - billing posture is `internal_invoice`
    - `amount_due_cents` must be positive (> 0); zero-amount generation is blocked in this slice
    - operator-provided anchor job exists in same account/customer scope
    - anchor job is already linked to same maintenance agreement through `maintenance_agreement_visits`
    - anchor job has no active non-void invoice
  - Draft invoice creation behavior:
    - creates normal job-scoped `internal_invoices` row (`job_id` preserved)
    - invoice starts `draft`
    - one deterministic service-plan billing line item is inserted (`source_kind = manual`)
    - line amount derives from billing period amount; description is deterministic from cadence + coverage window
  - Billing-period link behavior:
    - on success updates billing period to `internal_invoice_id = generated_invoice_id` and `billing_period_status = invoice_linked`
    - conditional link guard (`internal_invoice_id is null`) prevents duplicate relationship claims in race windows
  - Idempotency/audit decision for this slice:
    - no migration added in Phase 6B
    - first-slice duplicate protection uses existing link-state guard + anchor active-invoice guard + conditional link update
    - dedicated `service_plan_invoice_generation_audit` table remains deferred
  - Forbidden side effects remain preserved:
    - no invoice issue/send/email
    - no payment-link/Stripe/saved-card/autopay/scheduler behavior
    - no payment rows
    - no allocation rows
    - no `maintenance_agreement_visits` mutation
    - no `next_due_date` mutation

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

- [Active Spine V4.0 Current.md](./Active%20Spine%20V4.0%20Current.md)
- [Compliance_Matters_Payments_Roadmap.md](./Compliance_Matters_Payments_Roadmap.md)
- [Compliance_Matters_Business_Layer_Roadmap.md](./Compliance_Matters_Business_Layer_Roadmap.md)
- [Release_Scope_Lock_and_Post_Launch_Roadmap.md](./Release_Scope_Lock_and_Post_Launch_Roadmap.md)
- [Compliance_Matters_Prelaunch_Confirmation_Checklist.md](./Compliance_Matters_Prelaunch_Confirmation_Checklist.md)
- [Maintenance_Agreements_V1_Model_Spec.md](./Maintenance_Agreements_V1_Model_Spec.md)

## Non-Implementation Boundary

This model spec created no implementation approval by itself.

No code changes, schema changes, migrations, Supabase commands, Stripe API calls, env/secret changes, production changes, QBO work, recurring billing implementation, platform fee implementation, or ACH UI are authorized by this spec.
