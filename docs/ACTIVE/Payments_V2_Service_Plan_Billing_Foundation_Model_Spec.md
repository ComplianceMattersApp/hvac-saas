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

Phase 5C closeout (Service Plan Billing Period Schema Foundation, schema/tests/docs only):

- Phase 5C schema foundation is complete as an additive migration: `20260526150000_maintenance_agreement_billing_periods_foundation.sql`.
- Added table: `maintenance_agreement_billing_periods` (product/UI language remains Service Plan Billing Period).
- Locked first-posture fields, lifecycle statuses, billing posture values, coverage-window constraints, nonnegative amount constraints, and currency format constraints are implemented.
- Duplicate coverage-window prevention is implemented per account/agreement/start/end.
- Optional internal invoice claim uniqueness is implemented when `internal_invoice_id` is present.
- Same-account integrity is enforced via trigger/function checks across maintenance agreement, optional customer, and optional internal invoice scope.
- Account-scoped RLS is implemented with SELECT/INSERT/UPDATE policies and no DELETE policy.
- No forbidden first-posture fields were added (no payment/allocation/visit-count/next-due/Stripe/QBO/payment-status-truth fields).
- Validation completed: focused schema foundation test, maintenance-agreements suite, relevant payment allocation/internal invoice tests, `npx.cmd tsc --noEmit`, and `git diff --check`.
- Local migration validation completed via `supabase db reset --local --no-seed --yes`.
- No UI, invoice generation, payment behavior, allocation projection/read-path switch, Stripe checkout/webhook behavior, or service-plan operational behavior changed in this phase.
- Billing periods remain non-blocking for jobs/work orders/visits/visit counting/next-due workflows.
- Sandbox and production migration apply remain separate and are not part of Phase 5C closeout.

Phase 5C-2 closeout (Production Dormant Billing Period Migration Apply, production schema verification only):
- Migration `20260526150000_maintenance_agreement_billing_periods_foundation.sql` applied to production (`ornrnvxtwwtulohqwxop`) on 2026-05-26.
- Linked ref returned to CMTest sandbox `kvpesjdukqwwlgpkzfjm` after apply.
- Table `public.maintenance_agreement_billing_periods` verified in production: all 20 required columns present, no forbidden fields.
- All constraints/indexes confirmed: PK, 6 FK constraints, 5 check constraints, unique coverage window, partial unique `ma_billing_periods_internal_invoice_unique_idx` — no identifier truncation.
- RLS enabled; SELECT/INSERT/UPDATE policies present; no DELETE policy.
- `maintenance_agreement_billing_periods_set_updated_at` and `maintenance_agreement_billing_periods_assert_scope` triggers present; `assert_maintenance_agreement_billing_period_scope` function present.
- Row count is `0`. No billing period rows created, no invoice generation, no backfill.
- No UI, payment, Stripe, allocation, projection, or service-plan operational behavior changed.
- Phase 5C is fully closed across repo, sandbox, and production. Next slice is Phase 5D read-model planning/foundation.

Phase 5D-B closeout (Service Plan Billing Period Read-Model Helper Foundation):
- Added read-only helper module `lib/maintenance-agreements/billing-period-read-model.ts` with account/agreement/customer list helpers and pure coverage/posture/lifecycle/amount/payment-state derivation.
- Invoice-backed rows derive payment display state from current internal invoice truth and recorded payments only; pending/failed/reversed rows surface `payment_attention` without inflating paid totals.
- The helper does not query payment allocation tables directly and does not expose forbidden payment, allocation, visit, next-due, or blocking fields.
- No UI, billing-period mutation, invoice generation/linking action, payment behavior change, allocation read-path switch, or service-plan operational blocking was introduced.
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
- Phase 5F-B3 sandbox UI smoke is complete on sandbox ref `kvpesjdukqwwlgpkzfjm` using customer `ad18fa80-2817-476b-8fca-bdcf4ff3c3d6` and maintenance agreement `454b3737-fa39-46be-8925-45131a571693`.
- Customer-profile create, edit, and cancel workflow passed in sandbox; cancelled billing period remained visible as history.
- Exact same-window reuse after cancellation was blocked by current model/schema behavior and is treated as a future model decision, not a smoke failure.
- Adjacent replacement billing period creation succeeded.
- Billing period cancellation remains status-based and non-destructive; no delete behavior was introduced.
- Billing periods remain non-operational and do not block work orders, visits, visit counting, or `next_due_date`.
- No invoice generation/linking, no internal-invoice payment creation, no allocation creation, no Stripe/webhook behavior, no `maintenance_agreement_visits` mutation, and no `next_due_date` mutation occurred in this smoke.
- Forbidden billing labels/actions stayed absent in the tested customer-profile UI.
- Commit `d751b23` fixed async server-client resolution in billing-period actions and added regression coverage to prevent unresolved-client auth access regressions.

Phase 5G-A2 closeout (Billing Period Invoice Linkage Model Lock, docs/model only):
- First invoice relationship posture is manual link to an existing internal invoice.
- Invoice generation from billing periods is deferred.
- Invoice schema expansion is deferred.
- Billing-period invoice line-item generation is deferred.
- Linking remains relationship-only in first posture: no payment rows, no allocation rows, no Stripe calls, no payment link creation, no invoice issue/send behavior, and no invoice email behavior.
- Billing-period paid state remains derived display from existing invoice/payment truth only.
- Billing periods remain non-operational and non-blocking for work execution.
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
- Added manual link/unlink server-action wrappers in `lib/maintenance-agreements/billing-period-actions.ts`:
	- `linkInternalInvoiceToBillingPeriodFromForm`
	- `unlinkInternalInvoiceFromBillingPeriodFromForm`
- Access is enforced to active internal Owner/Admin/Billing only through existing internal-user and financial-authority gating; dispatcher/technician/non-financial roles are denied.
- Manual link eligibility enforcement is active:
	- required `billing_period_id` and `internal_invoice_id`
	- same-account scope checks for billing period, maintenance agreement, and invoice
	- cancelled billing periods are rejected
	- already-linked billing periods are rejected
	- void invoices are rejected
	- invoices already claimed by another billing period are rejected
	- invoice customer must match the maintenance-agreement customer where invoice customer scope exists
	- invoice job must already be linked to the same maintenance agreement via `maintenance_agreement_visits`
- Manual unlink/correction enforcement is active:
	- required `billing_period_id` and `status_reason`
	- period must currently have `internal_invoice_id`
	- unlink is non-destructive and clears `internal_invoice_id` only
	- unlink sets `billing_period_status = pending_billing` and persists `status_reason`
- Success behavior is active:
	- link sets `internal_invoice_id` and `billing_period_status = invoice_linked`
	- both link and unlink set `updated_by_user_id`
	- customer profile path is revalidated and redirected with query-param banners (`billing_period_invoice_linked`, `billing_period_invoice_unlinked`)
	- denial/invalid/conflict banners are surfaced (`billing_period_invoice_link_denied`, `billing_period_invoice_link_invalid`, `billing_period_invoice_link_conflict`, `billing_period_invoice_unlink_reason_required`)
- Runtime boundaries are preserved:
	- no invoice generation
	- no invoice line-item generation
	- no invoice issue/send/email behavior
	- no payment-link creation
	- no payment/allocation row mutation
	- no Stripe behavior change
	- no projection/read-path switch
	- no `maintenance_agreement_visits` mutation
	- no `next_due_date` behavior change
- Validation snapshot: focused billing-period action tests passed, billing-period read-model tests passed, maintenance-agreements suite passed, `npx.cmd tsc --noEmit` passed, and `git diff --check` passed.

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

---

## Phase 5G-B2 Closeout — Customer Profile Billing Period Invoice Link/Unlink UI Wiring (May 27, 2026)

- Customer profile (pp/customers/[id]/page.tsx) wires UI-only controls inside each Maintenance Agreement card's Billing Periods block:
  - Link Existing Invoice form → linkInternalInvoiceToBillingPeriodFromForm (Phase 5G-B1 server action). Visible only when the billing period is not cancelled AND has no internal_invoice_id.
  - Unlink Invoice form → unlinkInternalInvoiceFromBillingPeriodFromForm (Phase 5G-B1 server action). Visible only when the billing period has an internal_invoice_id. Reason (status_reason) is required.
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
