# Financial Trust Lane - Deposits / Payout Reconciliation V1 Model Spec

Status: ACTIVE MODEL LOCK
Owner lane: Financial Trust Lane / Deposits and Payout Reconciliation V1
Scope: docs/model only. No product code, schema, migrations, Stripe behavior, reports, env, RLS, payments, invoices, allocations, QBO behavior, production data, or customer-facing behavior is changed or authorized by this spec.

## Final Closeout - Payments / Deposits Reporting Foundation

Status: CLOSED FOR CURRENT FOUNDATION.

Closed/confirmed:

- Local invoice payment return/update issue was diagnosed as local Stripe CLI webhook forwarding not running, not a core payment bug.
- With local Stripe CLI forwarding running, Checkout payment confirmation works as designed through webhook confirmation.
- Local Checkout testing requires `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
- Local `.env.local STRIPE_WEBHOOK_SECRET` must match the listener `whsec_...`, and the dev server must be restarted after changing `.env.local`.
- Production webhooks are handled by Stripe delivery to deployed `/api/stripe/webhook`; the local listener note is only for local development.
- Checkout complete now uses owner-friendly `Payment submitted` language.
- `Return to invoice` and `Back to job` carry refresh/payment-return state.
- The separate refresh link was removed because the main return actions now carry the useful refresh context.
- Webhook-confirmed payment truth remains the only source for invoice paid/balance updates.
- Settlement table foundation and settlement upsert uniqueness repair are complete.
- Sandbox settlement sync proved the gross, Stripe fee, and net settlement path without mutating invoice/payment/allocation truth.
- Production migrations for the settlement foundation and upsert uniqueness repair were applied and verified.
- `stripe_payment_settlements` exists in production with RLS and SELECT-only app policy posture verified.
- PostgREST visibility for the settlement table was verified.
- Deposits report, deposit detail, and summary/detail CSV exports exist.
- Reports dashboard exposes a visible `Deposits` card for financial users.
- Owner/Admin/Billing can discover and open Deposits.
- Technician/Dispatcher users do not see the Deposits report entry where role context is available and remain blocked on direct access.
- Unauthorized direct access redirects cleanly to the reports dashboard with a not-authorized banner.
- Deposits page copy is owner-facing and explains Stripe fees, net deposits, payout timing, and CSV exports without implying invoice truth changes.
- Date filters, apply/reset filters, summary CSV, and detail CSV passed production smoke.
- No sync controls are exposed in the UI.
- No Stripe API calls are made from report/deposit pages or exports.
- No invoice, payment, allocation, or settlement mutation path was added from reports/deposits.
- Settlement rows explain Stripe fee/net/payout timing only; they do not change invoice paid/balance truth.

Remaining future gate, not a blocker to this foundation closeout:

- A controlled production money-flow smoke remains a later explicit gate: one real/live paid invoice or existing paid production invoice, one settlement sync, Stripe Dashboard gross/fee/net comparison, Deposits report/detail/CSV verification, and payout/bank deposit confirmation when available.
- That future smoke must remain controlled and explicit. It is not part of this closeout and does not authorize production sync controls, broad tenant sync, payment links, charges, refunds, disputes, or invoice/payment/allocation mutation.

## Phase H-1A Note - Settlement Upsert Uniqueness Repair

Sandbox Phase H-1 smoke found a settlement persistence blocker:

- Dry-run correctly classified a known Stripe payment candidate as eligible.
- Commit-mode sync failed with `settlement_upsert_failed` and a conflict-target inference error.
- Root cause: helper upsert conflict target (`stripe_connected_account_id,stripe_balance_transaction_id`) could not be satisfied by the existing partial unique index posture.

Repair migration added:

`supabase/migrations/20260610123000_repair_stripe_payment_settlements_upsert_unique.sql`

Repair intent:

- Replace partial unique index `stripe_payment_settlements_balance_txn_unique` with a full unique index on `(stripe_connected_account_id, stripe_balance_transaction_id)`.
- Preserve the intended uniqueness semantics while enabling PostgREST upsert conflict inference.
- Keep no app INSERT/UPDATE/DELETE policy posture.
- Keep settlement math unchanged.
- Keep invoice/payment/allocation truth untouched.

Operational boundary note:

- No production apply is authorized in this note.
- Phase H-1 sandbox smoke must be rerun after this repair migration is applied in sandbox.

## Phase G Closeout - Deposits CSV Exports

Phase G added read-only bookkeeping CSV exports:

`app/reports/deposits/export/summary/route.ts`

`app/reports/deposits/export/detail/route.ts`

Read model and CSV builder support remains in:

`lib/reports/deposits-ledger.ts`

Focused tests:

- `lib/reports/__tests__/deposits-export.test.ts`
- `lib/reports/__tests__/deposits-ledger.test.ts`
- `lib/reports/__tests__/deposits-page-wiring.test.ts`
- `lib/reports/__tests__/deposit-detail-page-wiring.test.ts`

Locked result:

- Summary CSV route is `/reports/deposits/export/summary`.
- Detail CSV route is `/reports/deposits/export/detail`.
- `/reports/deposits` exposes read-only summary and detail export links that preserve date, payout status, and sync status filters.
- Deposit detail exposes a read-only detail export link scoped by `payout_group_id`.
- Export responses are `text/csv`, `no-store`, and use stable date-stamped filenames.
- Export access uses existing financial export authority posture.
- Structural Owner, Admin, and Billing are allowed.
- Dispatcher, technician, contractor/portal users, inactive internal users, and unauthenticated users are blocked.
- Summary CSV includes payout id, payout label, payout status, payout arrival date, available date/date range, gross collected, fees and adjustments, net deposit, currency, payment count, unmatched count, failed sync count, pending sync count, needs-review marker, and sync status summary.
- Detail CSV includes payout id/status/arrival date, available date, payment id, invoice number, customer, job reference/title, gross amount, fees and adjustments, Stripe fee, platform/application fee, net amount, currency, settlement kind, reporting category, charge id, payment intent id, checkout session id, balance transaction id, notes/reference, unmatched marker, sync status, and sync error.
- Unmatched rows remain included and marked.
- Mixed-currency output preserves row currency and flags mixed groups conservatively.
- Fees & Adjustments total is included.
- Stripe fee and platform/application fee remain separate detail fields.
- Platform/application fees are not guessed.
- Stripe Dashboard fallback remains visible until full smoke confirms report/export parity.

Non-wiring confirmation:

- No sync button/control is added.
- No manual/internal sync UI is added.
- No Stripe API calls are added.
- No settlement sync helper is invoked.
- No cron/scheduled job is added.
- No webhook invokes export routes/read models.
- No checkout/session/payment-link behavior changes.
- No Payments Register behavior changes.
- No invoice action behavior changes.
- No invoice paid/balance mutation is added.
- No payment row mutation is added.
- No allocation row mutation is added.
- No QBO/general-ledger behavior is added.
- No refund/dispute/payment/correction action is added.
- No main nav/sidebar/report-center link is added beyond the already scoped `/reports/deposits` and deposit detail surfaces.

## Phase F Closeout - Deposit Detail Read-Only Drilldown

Phase F added a read-only deposit/payout detail route:

`app/reports/deposits/[payoutId]/page.tsx`

Read model support remains in:

`lib/reports/deposits-ledger.ts`

Focused tests:

- `lib/reports/__tests__/deposit-detail-page-wiring.test.ts`
- `lib/reports/__tests__/deposits-ledger.test.ts`

Locked result:

- Detail route is `/reports/deposits/[payoutId]`.
- Summary table rows in `/reports/deposits` link to the detail route.
- Real Stripe payout groups use the real `stripe_payout_id` in the route.
- Synthetic groups are safely encoded and supported, including `pending:no-payout` and `unmatched`.
- Detail lookup is account-scoped by `account_owner_user_id`.
- Detail view reads `stripe_payment_settlements` and enriches with local payment, invoice, customer, and job context where available.
- Missing local context does not hide settlement rows.
- Unmatched rows remain visible and marked for review.
- Pending/no-payout group is clearly labeled as not yet implying a bank deposit.
- Not-found state does not reveal whether a payout id exists in another tenant.
- Summary cards use `Gross Collected`, `Fees & Adjustments`, `Net Deposit`, `Payments`, and `Unmatched / Needs Review`.

Non-wiring confirmation:

- No CSV/export route is added.
- No sync button/control is added.
- No manual/internal sync UI is added.
- No Stripe API calls are added.
- No settlement sync helper is invoked.
- No refund/dispute/payment/correction action is added.
- No cron/scheduled job is added.
- No webhook invokes the detail route/read model.
- No checkout/session/payment-link behavior changes.
- No Payments Register behavior changes.
- No invoice action behavior changes.
- No main nav/sidebar/report-center link is added beyond direct payout row links from `/reports/deposits`.
- Stripe Dashboard fallback copy remains visible.

Source-of-truth preservation:

- `internal_invoice_payments` remains gross payment event truth.
- `internal_invoice_payment_allocations` remains payment-to-invoice allocation truth.
- `stripe_payment_settlements` remains Stripe fee/net/payout settlement truth only.
- Deposit detail does not mutate invoice paid/balance.
- Deposit detail does not mutate payment rows.
- Deposit detail does not mutate allocation rows.
- Deposit detail does not introduce QBO/general-ledger behavior.
- Deposit detail does not count settlement rows toward collected payment totals.

## Phase E-B Closeout - Read-Only Deposits Report Page

Phase E-B added the first read-only owner-facing deposits reconciliation surface:

`app/reports/deposits/page.tsx`

Focused page wiring test:

`lib/reports/__tests__/deposits-page-wiring.test.ts`

Locked result:

- Route is `/reports/deposits`.
- Route is direct-URL accessible only in this phase.
- No main navigation, report-center tab, sidebar, or admin navigation link is added.
- Page uses Phase E-A read model `getDepositsLedgerSummary`.
- Page is server-side gated with the same Owner/Admin/Billing financial authority posture used by the Payments Register.
- Dispatcher/technician/contractor/unauthenticated users remain blocked by the existing internal/financial gate posture.
- Filters are GET/search-param only: date from, date to, payout status, and sync status.
- Summary cards use the owner-facing rollup labels: `Gross Collected`, `Fees & Adjustments`, `Net Deposits`, `Pending Payouts`, and `Unmatched / Needs Review`.
- Payout/deposit table groups existing settlement rows by payout/deposit group from the read model.
- Empty state says no settlement data is synced yet and keeps Stripe Dashboard as fallback.
- Mixed-currency warning is conservative and avoids presenting combined totals as authoritative.
- Needs-review rows remain visible with labels such as `Needs Review`, `Unmatched`, `Pending Sync`, and `Sync Failed`.

Non-wiring confirmation:

- No CSV/export route is added.
- No deposit detail route is added.
- No sync button/control is added.
- No manual/internal sync UI is added.
- No Stripe API calls are added.
- No sync helper is invoked.
- No cron/scheduled job is added.
- No webhook invokes this page/read model.
- No checkout/session/payment-link behavior changes.
- No Payments Register behavior changes.
- No invoice action behavior changes.
- Stripe Dashboard fallback copy remains visible until settlement sync/report/export/smoke phases are complete.

Source-of-truth preservation:

- `internal_invoice_payments` remains gross payment event truth.
- `internal_invoice_payment_allocations` remains payment-to-invoice allocation truth.
- `stripe_payment_settlements` remains Stripe fee/net/payout settlement truth only.
- Deposits page does not mutate invoice paid/balance.
- Deposits page does not mutate payment rows.
- Deposits page does not mutate allocation rows.
- Deposits page does not introduce QBO/general-ledger behavior.
- Deposits page does not count settlement rows toward collected payment totals.

## Phase E-A Closeout - Deposits Read Model Foundation

Phase E-A added a read-only deposits reconciliation read model:

`lib/reports/deposits-ledger.ts`

Test coverage:

`lib/reports/__tests__/deposits-ledger.test.ts`

Locked result:

- Read model entrypoint is `getDepositsLedgerSummary`.
- Pure view-model builder is `buildDepositsLedgerViewModel`.
- Reads only `stripe_payment_settlements`.
- Account scope by `account_owner_user_id` is required.
- Optional filters support date range, payout status, and sync status.
- Date filtering prefers `payout_arrival_date` when present and falls back to `available_on`.
- Payout rows group by `stripe_payout_id` when present.
- No-payout rows group into `pending:no-payout`.
- Unmatched/needs-review rows group into `unmatched`.
- Mixed-currency results are flagged and owner-facing combined totals are not silently merged across currencies.

Owner-facing rollup posture:

- `Gross Collected` sums synced payment-kind settlement rows only.
- `Fees & Adjustments` is a display/read-model rollup from stored settlement fields only.
- `Net Deposits` sums stored net settlement amounts for included synced settlement rows.
- `Pending Payouts` surfaces synced net amounts that do not yet have paid/complete payout status or payout identity.
- `Unmatched / Needs Review` includes unmatched local payment links, unmatched settlement kind/status, failed sync rows, and synced rows missing key balance transaction data.
- Platform/application fees remain separate stored fields where proven and are never inferred from gross/net deltas.
- Needs-review rows stay visible but do not inflate owner-facing collected/net totals.

Non-wiring confirmation:

- No `/reports/deposits` route is added.
- No deposit detail route is added.
- No UI/page/nav link is added.
- No CSV/export is added.
- No Stripe API calls are added.
- No sync trigger is added.
- No cron/scheduled job invokes the read model.
- No webhook invokes the read model.
- No checkout/session/payment-link path changes.
- No Payments Register behavior changes.
- No invoice action behavior changes.
- Stripe Dashboard remains fallback until report/export/smoke phases are complete.

Source-of-truth preservation:

- `internal_invoice_payments` remains gross payment event truth.
- `internal_invoice_payment_allocations` remains payment-to-invoice allocation truth.
- `stripe_payment_settlements` remains Stripe fee/net/payout settlement truth only.
- Deposits read model does not mutate invoice paid/balance.
- Deposits read model does not mutate payment rows.
- Deposits read model does not mutate allocation rows.
- Deposits read model does not introduce QBO/general-ledger behavior.
- Deposits read model does not count toward collected payment totals.

## Phase D Closeout - Manual / Internal Settlement Sync Runner

Phase D added a dormant internal/manual sync runner:

`lib/actions/stripe-settlement-sync-actions.ts`

Test coverage:

`lib/actions/__tests__/stripe-settlement-sync-actions.test.ts`

Locked result:

- Runner entrypoint is `syncStripePaymentSettlementsForAccount`.
- Form wrapper entrypoint is `syncStripePaymentSettlementsForAccountFromForm`.
- Execution requires authenticated internal financial authority scoped to the requested account owner.
- Explicit `accountOwnerUserId` scope is required.
- Date range is required.
- Optional local payment id and Stripe charge id filters are supported.
- Dry-run is the default posture.
- Dry-run does not call Stripe and does not write settlement rows.
- Commit mode must be explicit through the form wrapper.
- Commit mode delegates Stripe reads and settlement writes to the Phase C helper only.
- Candidate selection is scoped to `internal_invoice_payments` for one account/date range.
- Candidate rows are classified locally as eligible or skipped before helper execution.
- Skips include non-Stripe payment, non-recorded payment, missing charge id, outside date range, missing connected account, connected account not ready, already synced, and dry-run only.
- Per-row helper failure does not abort the remaining batch.
- Returned details are intentionally limited to local payment id, invoice number when cheaply available, charge id, status/code/reason, and settlement id.

Non-wiring confirmation:

- No owner-facing Deposits report is added.
- No `/reports/deposits` route is added.
- No deposit detail route is added.
- No CSV/export is added.
- No cron/scheduled job invokes the runner.
- No webhook invokes the runner.
- No checkout/session/payment-link path invokes the runner.
- No Payments Register behavior is changed.
- No invoice action behavior is changed.
- Stripe Dashboard remains fallback until report/export/smoke phases are complete.

Source-of-truth preservation:

- `internal_invoice_payments` remains gross payment event truth.
- `internal_invoice_payment_allocations` remains payment-to-invoice allocation truth.
- `stripe_payment_settlements` remains Stripe fee/net/payout settlement truth only.
- Runner does not mutate invoice paid/balance.
- Runner does not mutate payment rows.
- Runner does not mutate allocation rows.
- Runner does not introduce QBO/general-ledger behavior.
- Settlement rows do not count toward collected payment totals.

## Phase C Closeout - Stripe Settlement Sync Helper

Phase C added a dormant server-side helper:

`lib/business/stripe-payment-settlements.ts`

Test coverage:

`lib/business/__tests__/stripe-payment-settlements.test.ts`

Locked result:

- Helper entrypoint is `syncStripePaymentSettlementForPayment`.
- Helper is payment-row-driven for one known `internal_invoice_payments` row.
- Helper fetches Stripe Charge, Balance Transaction, and optional Payout in tenant connected-account context using `stripeAccount`.
- Helper upserts one `stripe_payment_settlements` row by `(stripe_connected_account_id, stripe_balance_transaction_id)`.
- Helper records gross, Stripe fee, net, currency, availability date, reporting category, fee details, payout id/status/arrival date when available.
- Helper sets `settlement_kind = payment` for successful charge settlement.
- Helper does not infer or guess platform/application fee values; `platform_fee_cents` remains `0` unless a later phase adds reliable Stripe evidence.
- Helper returns structured `synced`, `skipped`, or `failed` results with code, reason, settlement id, and platform-fee proof posture.
- Helper safely skips manual/off-platform rows, missing charge ids, missing/not-ready connected accounts, and non-recorded payment statuses.
- Helper failure is settlement-sync-only and does not change original payment truth.

Non-wiring confirmation:

- No UI route invokes this helper.
- No report invokes this helper.
- No cron/scheduled job invokes this helper.
- No webhook invokes this helper.
- No checkout/session/payment-link path invokes this helper.
- No Payments Register path invokes this helper.
- No invoice action invokes this helper.
- No owner-facing behavior is exposed by this phase.
- Stripe Dashboard remains fallback until later manual/internal sync, report, CSV, and smoke phases are complete.

Source-of-truth preservation:

- `internal_invoice_payments` remains gross payment event truth.
- `internal_invoice_payment_allocations` remains payment-to-invoice allocation truth.
- `stripe_payment_settlements` remains Stripe fee/net/payout settlement truth only.
- Settlement sync does not mutate invoice paid/balance.
- Settlement sync does not mutate payment rows.
- Settlement sync does not mutate allocation rows.
- Settlement rows do not count toward collected payment totals.

## Phase B Closeout - Stripe Payment Settlements Schema Foundation

Phase B created dormant additive settlement schema foundation in migration:

`supabase/migrations/20260610110000_stripe_payment_settlements_foundation.sql`

Created table:

`public.stripe_payment_settlements`

Locked result:

- `stripe_payment_settlements` is additive Stripe fee/net/payout reconciliation truth only.
- `internal_invoice_payments` remains gross payment event truth.
- `internal_invoice_payment_allocations` remains payment-to-invoice allocation truth.
- Invoice paid/balance projection is unchanged.
- Payments Register behavior is unchanged.
- Stripe checkout/session behavior is unchanged.
- Stripe webhook behavior is unchanged.
- QBO/general-ledger behavior is unchanged.
- Refund/dispute/adjustment mutation workflows remain deferred.
- No backfill rows are created by the migration.
- No settlement rows are written by this phase.
- Owner-facing Deposits report remains gated until sync/report phases and sandbox smoke are complete.

Schema posture:

- Account-scoped owner identity uses `account_owner_user_id uuid NOT NULL REFERENCES auth.users(id)`.
- Local payment linkage uses nullable `internal_invoice_payment_id` so unmatched Stripe settlement items can remain visible without being forced into invoice/payment truth.
- Settlement kind is constrained to `payment`, `refund`, `dispute`, `adjustment`, `application_fee`, `payout_adjustment`, and `unmatched`.
- Sync status is constrained to `pending`, `synced`, `skipped`, `unmatched`, and `failed`.
- Currency is constrained to lowercase three-letter ISO-style values.
- Balance transaction identity is idempotent through the repaired full unique index on `(stripe_connected_account_id, stripe_balance_transaction_id)`.
- RLS is enabled with account-scoped SELECT for authenticated internal users.
- No DELETE policy exists.
- No app INSERT/UPDATE policies exist in this first posture; future sync writes must be explicit server-side service/admin paths.

Validation for closeout:

- focused schema migration test added at `lib/business/__tests__/stripe-payment-settlements-schema-foundation.test.ts`
- required validation commands for this phase: focused schema test, relevant payment/register/allocation regression tests if touched by harness, `npx.cmd tsc --noEmit`, and `git diff --check`

## Readiness Verdict

FOUNDATION CLOSED; FUTURE MONEY-FLOW GATE REMAINS.

Gross payment tracking remains usable and webhook-confirmed. Owner-facing Deposits reporting foundation now exists for Stripe fee, net, payout timing, detail drilldown, and CSV export over settlement truth.

Current Payments Register reporting continues to show collected invoice payment truth from `internal_invoice_payments`. Failed payments are separated. Reversed rows are excluded from collected totals. Deposits reporting is the separate read-only settlement layer for Stripe fee/net/payout explanation.

The current app can explain synced Stripe settlement rows in owner-facing terms. Stripe Dashboard remains the operational comparison source for controlled money-flow smoke and for any future sync-failed or bank-confirmation investigation.

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
- Fees & Adjustments
- Net Deposits
- Pending Payouts
- Unmatched / Needs Review

Owner-facing deposit dashboards should favor a simple gross-to-net explanation:
Gross Collected minus Fees & Adjustments equals Net Deposits.

The underlying settlement table may retain separate Stripe fee, platform/application fee, fee detail, settlement kind, and reporting category fields for audit, detail drilldown, and CSV export. The combined Fees & Adjustments value is derived display truth only. It does not alter settlement truth, payment truth, invoice truth, allocation truth, or collected totals.

Fees & Adjustments may include only proven Stripe fees, proven platform/application fees, and proven adjustment/refund/dispute/payout adjustment amounts already represented in settlement data. Platform/application fee must never be guessed.

Table columns:

- payout date
- payout id
- gross amount
- fees & adjustments
- Stripe fees, available in drilldown/export where proven
- platform/application fees, available in drilldown/export where proven
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
- total fees & adjustments
- Stripe fee
- platform/application fee where proven
- adjustment amount where applicable
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

Detail views preserve the fee and adjustment breakdown behind the owner-facing rollup. Platform/application fee remains a proven settlement field only and must never be inferred.

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
- total fees & adjustments
- Stripe fees
- platform/application fees where proven
- adjustment amount
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
- total fees & adjustments
- Stripe fee
- platform/application fee where proven
- adjustment amount
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

Exports must preserve the breakdown behind the owner-facing Fees & Adjustments rollup, including total fees and adjustments, Stripe fee, platform/application fee where proven, adjustment amount or unmatched marker where applicable, and net amount.

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

## Production / Future Money-Flow Gate

The Deposits reporting foundation is production-applied and smoke-tested for safe empty/report/export behavior. The following items are no longer blockers for report discoverability:

- additive settlement schema is reviewed and applied safely
- RLS/account scoping is validated
- connected account readiness is complete for the target tenant
- settlement sync succeeds in sandbox
- failed/unmatched sync states are visible
- no invoice paid/balance mutation occurs from settlement sync
- no payment/allocation mutation occurs from settlement sync
- no QBO/general-ledger behavior is introduced

Future controlled production money-flow smoke remains separately gated:

- one real/live paid invoice or existing paid production invoice
- one explicit settlement sync for the scoped payment/account only
- trace invoice gross payment to balance transaction, fees, net, payout identity/status, and arrival date where available
- compare Deposits report/detail/CSV against Stripe Dashboard gross, fees, and net
- confirm payout/bank deposit when available
- confirm again that settlement sync does not mutate invoice/payment/allocation truth

This future gate is not an unresolved blocker to the foundation closeout. It is the next evidence step before treating a live money-flow sample as reconciled end to end.

## End-to-End Money Movement Verification Gate

Owner-facing deposit reconciliation foundation is complete. A live money-flow sample is not complete until this gate passes.

This gate verifies reporting accuracy and actual tenant payout correctness. It must prove the full chain from issued invoice to Stripe connected-account charge, local gross payment truth, settlement sync, payout status, and bank deposit confirmation when available.

Required state labels:

- Invoice Paid
- Settlement Synced
- Payout Pending
- Payout Paid
- Bank Confirmed

Required smoke proof:

1. Issued invoice is paid through Stripe.
2. Stripe charge is created in the tenant connected-account context.
3. Webhook records gross payment truth in Compliance Matters.
4. Invoice paid/balance updates only from existing webhook/payment truth.
5. Payments Register shows the gross collected payment.
6. Settlement sync captures balance transaction, fees, net, payout id, payout status, and arrival date.
7. Deposits report matches Stripe Dashboard.
8. Deposit Detail links payout back to invoice/customer/job/payment.
9. CSV export matches Stripe Dashboard.
10. Tenant payout status is paid, or pending with accurate arrival date.
11. When available, tenant bank deposit matches the reported net payout.
12. Settlement sync does not mutate invoice/payment/allocation truth.

Gate outcome rules:

- `Invoice Paid` means the invoice paid/balance projection changed only through existing webhook/payment/allocation truth.
- `Settlement Synced` means Stripe balance transaction, fees, net, and payout metadata were captured into settlement truth.
- `Payout Pending` means Stripe payout is not paid yet, but payout id/status and expected arrival date match Stripe Dashboard.
- `Payout Paid` means Stripe payout status is paid and report/CSV/detail agree with Stripe Dashboard.
- `Bank Confirmed` means the tenant bank deposit, when available, matches the reported net payout.
- If bank confirmation is not yet available, owner-facing completion remains gated unless the release decision explicitly accepts `Payout Pending` or `Payout Paid` as a temporary operational state with Stripe Dashboard fallback.

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

### Phase E-A - Deposits Read Model Foundation

Add read-only deposits reconciliation read model.

Acceptance:

- reads only settlement truth
- account/date scoped
- grouped payout summaries produced
- Gross Collected / Fees & Adjustments / Net Deposits rollup produced
- unmatched/needs-review rows visible
- no route/UI/CSV/export
- no Stripe calls or sync trigger
- no mutations

### Phase E - Read-Only Deposits Report

Add `/reports/deposits`.

Acceptance:

- Owner/Admin/Billing access only
- grouped payout summary
- gross/fees-and-adjustments/net/pending/unmatched summary
- Stripe Dashboard fallback copy visible
- no nav link until explicitly released
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
- gross/fees-and-adjustments/net included
- Stripe fee and platform/application fee breakdown included where proven
- unmatched/sync status included

### Phase H - Sandbox / Live Smoke

Run controlled smoke only after previous phases are complete.

Smoke checklist:

1. Create issued invoice.
2. Pay through Stripe connected account.
3. Verify Stripe charge is created in the tenant connected-account context.
4. Verify webhook records gross payment truth in Compliance Matters.
5. Verify `Invoice Paid`: invoice paid/balance updates only from existing webhook/payment truth.
6. Verify Payments Register shows the gross collected payment.
7. Run settlement sync.
8. Verify `Settlement Synced`: settlement row includes balance transaction, fees, net, payout id, payout status, and arrival date where available.
9. Verify Deposits report gross/fee/net/payout data matches Stripe Dashboard.
10. Verify Deposit Detail links payout back to invoice/customer/job/payment.
11. Export CSV and compare to Stripe Dashboard.
12. Verify `Payout Pending` or `Payout Paid`: tenant payout status is paid, or pending with accurate arrival date.
13. Verify `Bank Confirmed` when available: tenant bank deposit matches reported net payout.
14. Confirm no settlement sync mutation of invoice/payment/allocation truth.

## Acceptance Criteria For V1

A tenant owner can reconcile a collected Stripe payment to a bank deposit.

Minimum proof:

- App shows gross invoice payment amount.
- App shows owner-facing Fees & Adjustments as the combined proven rollup.
- Detail and CSV views show Stripe fee.
- Detail and CSV views show platform/application fee when represented in settlement data.
- Detail and CSV views show adjustment amount or unmatched marker where applicable.
- App shows net amount.
- App shows balance transaction id.
- App shows payout id.
- App shows payout status.
- App shows payout arrival date.
- App links settlement back to invoice/customer/job/payment context.
- App exports the same reconciliation in CSV.
- Invoice paid/balance remains unchanged by settlement reporting.

Example target explanation:

`$500.00` Gross Collected minus `$10.00` Fees & Adjustments equals `$490.00` Net Deposits, tied to Stripe balance transaction and payout identity.

## Non-Implementation Confirmation

This Phase A document is docs-only.

It does not change product code, schema, migrations, Stripe behavior, reports, env, RLS, payments, invoices, allocations, or QBO behavior.

Stripe Dashboard remains the operational comparison source for controlled money-flow smoke, sync-failed investigation, and payout/bank confirmation when needed.
