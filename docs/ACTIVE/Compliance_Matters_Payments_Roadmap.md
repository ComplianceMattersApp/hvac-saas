# Compliance Matters Software — Payments Roadmap

**Status:** ACTIVE IMPLEMENTATION DIRECTION (platform-subscription V1 live platform smoke complete; tenant customer payments V1 current scope implemented and locally/sandbox validated)
**Purpose:** Define the locked payment architecture and current-shipped V1 scope, while keeping deferred add-ons explicitly parked.

## Phase 6F-C Closeout (Manual Saved-Card Charge for Issued Invoice)

- Phase 6F implementation is closed in commit `f7fa23fca188029a9a6f38e152a83180b346606e` (`feat(payments): charge saved card manually for issued invoice`) and pushed to `origin/main`.
- Manual one-time saved-card charge now exists for eligible issued invoices and is explicitly not autopay and not Stripe subscription behavior.
- Locked truth layering remains: manual attempt row in `tenant_saved_method_payment_attempts` is workflow/audit truth; webhook-created `internal_invoice_payments` is collected-money truth; allocation is created only after payment truth.
- Fresh sandbox smoke evidence: invoice `INV-20260528-1CFFCB88` (`7f79e75b-06b5-4924-bd0c-91b78740f2d7`), attempt `99949838-81f3-442a-9de1-4bc736b4c40b`, payment `3788c9ff-700d-43ab-8339-46e4cbf24ae3`, allocation `2b702b07-690a-4e4d-82f2-6f6ed6e40627`, charge `ch_3Tbxg47itDepDR180C1KhPco`, amount `$17.50`, webhook HTTP 200, UI Paid / Balance `$0.00`.
- Guardrails confirmed: no `tenant_customer_autopay_consents` creation, no `maintenance_agreement_visits` mutation, no `maintenance_agreements.next_due_date` mutation, no Stripe Billing subscription behavior, no ACH/bank-debit behavior.
- Validation closeout: TypeScript no-emit pass, targeted Vitest matrix pass (8 files / 100 tests), `git diff --check` pass, `_tmp_*` cleanup confirmed, and implementation commit scope limited to intended code/tests only.

## Phase 6G-A Closeout (Scheduled Autopay Attempts Model/Audit Lock, Docs-Only)
### Phase 6G-E4 Closeout (Fresh Scheduled Autopay Submit Smoke, Docs-Only)

- Phase 6G-E4 passed after the 6G-E3 self-attempt revalidation fix in commit `c7329a8a9b19d392f6dd7196ca7145f86d62e713`.
- Sandbox-only smoke used owner `9e82acca-c271-41bc-89af-396f37c1990c`, customer `ad18fa80-2817-476b-8fca-bdcf4ff3c3d6`, invoice `63e28e1c-1be9-43bb-923d-940d80887cb2` (`INV-20260528-9D731258`), job `91e31a74-cc1b-4585-8dc3-6812351fbbdf`, consent `3c24c9e6-6f78-4fe4-8619-9094782827bb`, and fresh pending attempt `67dc6700-83d9-4dd0-8af1-d8ae931db14a`.
- 6G-B returned the invoice eligible, 6G-C created the fresh pending scheduled_autopay attempt, and 6G-D submitted it successfully with Stripe PaymentIntent `pi_3Tc6bF7itDepDR181kf2LE2p`, charge `ch_3Tc6bF7itDepDR181J27CvPs`, and webhook event `evt_3Tc6bF7itDepDR181B08QHZd`.
- Webhook truth created exactly one `internal_invoice_payments` row and exactly one `internal_invoice_payment_allocations` row; invoice projection became paid with balance `$0.00`.
- UI verification after refresh showed Issued / Paid / Paid `$17.50` / Balance `$0.00` with one recorded Stripe payment row.
- Guardrails held: submit helper did not directly create payment or allocation rows, did not mark invoice paid, did not mutate visits or `next_due_date`, did not create invoice issue/send/email or payment-link side effects, and no production access occurred.
- No code changed during the smoke; all requested validation commands passed.
- Recommended next lane after this closeout is Phase 6G-F docs closeout, then Phase 6H failed-payment retry and attention workflow expansion.

- Scope lock: audit/model/planning only. No code implementation, migrations, scheduler jobs, Supabase mutation, Stripe calls, webhook changes, or commit authorization.

Source-of-truth boundaries:
- Scheduler is attempt orchestration truth only.
- Attempt table is workflow/audit truth only.
- `internal_invoice_payments` remains webhook-confirmed collected-money truth.
- `internal_invoice_payment_allocations` remains allocation truth.
- Stripe remains processor/credential truth.
- No `maintenance_agreement_visits` mutation.
- No `next_due_date` mutation.
- Failed autopay creates attention, not collected money.

Eligibility rules:
- issued invoice only; not void; balance due > 0.
- same account/customer/payment-profile/consent scope.
- linked billing period, if present, not cancelled.
- linked maintenance agreement, if present, active/autopay-eligible.
- active saved payment method.
- enabled valid consent.
- connected account ready and matching.
- no in-flight scheduled_autopay attempt for same invoice.
- respect consent `max_amount_cents` when set.
- profile/method not stale/disconnected/invalid.
- re-check invoice status/balance before submit.
- already-paid invoice blocks as `blocked_precondition`.

Scheduler trigger model:
- first implementation is manual/internal runner.
- dry-run and commit modes.
- no cron in first slice.
- evaluate issued invoices only; exclude drafts.
- evaluate due-today and overdue issued invoices first.
- batch by `account_owner_user_id`.
- per-account failure isolation.

Attempt lifecycle/idempotency:
- `attempt_kind = scheduled_autopay`.
- persisted statuses: `blocked_precondition`, `pending`, `submitted`, `succeeded`, `failed_declined`, `failed_requires_action`, `retry_scheduled`, `abandoned`.
- `eligible` is dry-run/read-model output only, not persisted status.
- idempotency key: `scheduled_autopay:account_owner_user_id:invoice_id:cycle_key:ordinal`.
- no duplicate pending/submitted/retry_scheduled attempt for same invoice/kind.
- no duplicate Stripe PaymentIntent for same attempt.
- snapshot amount/balance at creation and revalidate before submit.

Stripe charge model:
- reuse shared saved-card charge path from manual charge.
- scheduler entry calls shared service with `scheduled_autopay` attempt kind.
- PaymentIntent metadata includes `account_owner_user_id`, `customer_id`, `invoice_id`, `attempt_id`, `billing_period_id`, `maintenance_agreement_id`.
- only pre-webhook transition allowed: `submitted`.
- `requires_action -> failed_requires_action` attention.
- declines -> `failed_declined` attention.
- payment rows created only by webhook handlers.

Retry/failure/attention:
- no auto-retry loop in first 6G implementation.
- failed_declined/failed_requires_action open attention.
- requires_action means customer re-authentication required.
- failed attempt does not block service visits.
- failed attempt does not mutate next_due_date.
- failed_requires_action pauses further scheduled submissions for consent/agreement until resolved.
- manual operator retry before automated retry.

Reporting/visibility:
- invoice workspace shows attempt history separately from recorded payments.
- customer profile shows autopay consent and latest attempt outcome.
- maintenance agreement card shows autopay attention summary.
- payments register does not mix failed attempts into collected totals.
- collected totals derive from recorded payment truth only.

Security/access:
- Owner/Admin/Billing only: consent enable/disable/pause/revoke, scheduler dry-run/commit-run, retry submission.
- Dispatcher/Technician read-only where allowed.
- server-side financial access checks required.

Dry-run:
- mandatory first implementation slice.
- output includes invoices evaluated, eligible count, blocked count by reason, in-flight attempts, consent/method/profile/readiness snapshot flags, proposed amount snapshots, and explicit no Stripe calls/no writes.
- commit mode is opt-in and separate.

Schema:
- no schema change required for 6G-B dry-run eligibility read model.
- no schema change strictly required for 6G-C attempt creation (`scheduled_autopay` + core statuses already exist).
- keep `eligible` non-persisted.
- optional future additive fields only: `scheduler_run_id`, `cycle_key`, `last_blocked_reason_at`.

Risks:
- race between eligibility and submit.
- duplicate attempts without strict idempotency.
- requires_action loop without pause gate.
- cross-tenant scheduler failure cascade.
- missing billing-period linkage for some invoices.
- attention UX gaps.

Recommended sequence:
1. 6G-B eligibility read model + dry-run tests only.
2. 6G-C scheduled_autopay attempt creation only, no Stripe submit.
3. 6G-D submit scheduled attempts via shared saved-card charge path.
4. 6G-E sandbox smoke.
5. 6G-F docs closeout.
6. 6H retry/attention expansion.

Execution confirmation:
- Docs-only model lock closeout; no implementation/data mutation occurred.

---

## 1. Core decision

Compliance Matters has **built payment architecture and shipped tenant customer invoice payments V1 for the current intended scope**.

### Locked rule
- the platform is **payment-ready by design**
- tenant customer invoice payments V1 current scope is **payment-active**
- payment add-ons beyond V1 current scope come later
- architecture must support future payment acceptance without requiring backwards redesign

---

## 2. System boundary

### Locked ownership model
- **Compliance Matters** = operational source of truth for payment visibility and workflow state
- **Stripe (future)** = payment rail for acceptance and money movement
- **QBO (optional future)** = accounting integration seam only

Financial Ledger / Payments Register V1 model lock:
- the bookkeeping-ready register/allocation model is defined in [Financial_Ledger_Payments_Register_V1_Model_Spec.md](./Financial_Ledger_Payments_Register_V1_Model_Spec.md)
- Payments V2 / Service Plan Billing Foundation Phase 2 model lock is defined in [Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md](./Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md)
- current `internal_invoice_payments` remains today's invoice-bound collected-payment truth
- future financial reporting must distinguish Payment Register Entry, Payment Allocation, Invoice Payment Projection, and Failed Payment Attempt
- Stripe is processor truth for Stripe transactions; Compliance Matters is tenant financial operating truth for all money received
- first Service Plan Billing posture is billing-period plus normal invoice linkage (no required auto-charge engine in first posture)

Service Role Controls / Financial Access Controls V1A dependency:
- V1A-2, V1A-3, and V1A-4 are implemented in [Service_Role_Controls_and_Financial_Access_V1_Model_Spec.md](./Service_Role_Controls_and_Financial_Access_V1_Model_Spec.md)
- Billing / AR is now a valid internal role in app role model/parsers/UI
- sensitive financial authority now allows structural owner, admin, and billing
- sensitive financial authority blocks by default: dispatcher/office, technician, contractor/portal users, inactive users, and unauthenticated users
- currently protected server-side actions include manual internal invoice payment recording, tenant payment-link/checkout-session creation, invoice ledger CSV export, invoice draft create/update, invoice issue, invoice void, and invoice email send/resend
- Billing / AR is not Admin and does not inherit team/admin settings authority
- access-control prerequisite for Billing Register resume is satisfied; Billing Register V1 may resume in the next implementation lane and must use the existing financial-access helper/server-side gates
- Billing Register UI/actions are still deferred in this pass and remain next-lane implementation work

### Meaning
The app must be built now so that:
- payment tracking works without processor dependency
- future Stripe integration can plug in cleanly
- future QBO sync can remain optional
- accounting adoption is never required for core usage

---

## 3. QBO rule (locked)

QuickBooks Online must **not** be the required foundation for payment architecture.

### QBO is:
- optional
- downstream
- accounting-oriented
- a future sync/integration seam

### QBO is not:
- the required merchant/payment setup
- the core payment rail
- the foundation for contractor payment acceptance
- a prerequisite for core product use

---

## 4. Stripe rule (locked)

Stripe is the preferred future payment rail.

### Meaning
When real payment acceptance is introduced later:
- customer payment execution should be processor-led
- processor-specific logic should fit a Stripe-first path
- contractor payout/onboarding complexity should be handled at the payment-rail layer, not forced into accounting logic

### Current implementation rule
Platform subscription billing for account onboarding is implemented as Stripe Platform Subscription V1 and has passed live production smoke for platform account subscriptions.  
Tenant customer invoice payments V1 current scope is implemented in connected-account direct-charge model and validated in local/sandbox closeout.
Future payment add-ons remain deferred to avoid scope expansion.

Alignment note:
- operational entitlement mutation guard rollout for active internal operational mutation paths is production-promoted on `main` at commit `bf38eca` (89 test files, 1057 tests, TSC_OK, production smoke confirmed)
- that rollout blocks expired, null-ended, and missing-entitlement accounts from server-side operational mutations while still allowing active, valid-trial, and internal/comped accounts
- that rollout did not introduce tenant customer/work payment execution, QBO behavior, schema migrations, or Supabase data changes
- setup/recovery/admin availability remains intentionally accessible and does not change the deferred tenant payment-execution roadmap

---

## 5. Current product truth

### Live behavior right now
Tenant customer invoice payments V1 current scope is **implemented**.

Current implemented repo truth now includes:
- a real internal invoice domain for internal-invoicing mode
- job-linked invoice workflow and billed-truth invoice records
- invoice communication tracking/history
- billed-truth invoice reporting through the internal Report Center
- job-level closeout and invoice-action tracking still used where appropriate for operational follow-up
- dashboard invoice visibility and invoice-report drill paths where honest

Collected-payment truth is now materially implemented in repo for issued internal invoices:
- collected-payment rows are owned by `internal_invoice_payments`
- collected-payment visibility is implemented in the internal invoice ledger and CSV export

### Payments V2 / Deferred Invoice Payment Features

These are intentionally parked as future work and are not active Payments V1 blockers.

Deferred Payments V2 register:
- refunds
- disputes / chargebacks
- partial payments
- saved cards
- ACH
- receipt email automation
- receipt SMS automation
- public customer payment portal
- platform application fees
- QBO sync

Current support posture:
- refunds, disputes, and related exceptions are handled directly in Stripe or via manual support for now
- Compliance Matters remains invoice/payment truth for recorded payments
- QBO remains downstream/last-last and must not override Compliance Matters truth
- no customer portal or public payment self-service exists in V1
- no saved cards, partial payments, ACH, or refund tooling exists in V1

Phase 4A closeout (Allocation Compatibility Foundation):
- Implemented as compatibility-only foundation in commit `a0a2d23`.
- No allocation schema/table was introduced.
- No allocation rows are written.
- Existing invoice-bound paid/balance projection now routes through allocation-compatible helper semantics only.
- Recorded-only collected-payment truth is preserved; failed and reversed rows remain non-collected.
- Payments register and invoice ledger totals remain unchanged in this slice.
- No Service Plan billing period, `maintenance_agreement_visits`, checkout/webhook behavior, payment recording behavior, portal, QBO, ACH, refunds/disputes, saved cards/autopay, or partial payments changes were introduced.

Phase 4B lock (Allocation Schema Model Lock, docs/model only):
- First allocation table name is locked: `internal_invoice_payment_allocations`.
- First source key is locked: `source_internal_invoice_payment_id` -> `internal_invoice_payments.id`.
- First target is invoice only: `target_invoice_id`.
- Deferred future expansion only: service-plan billing period target columns (including `target_service_plan_billing_period_id`) and customer-credit targets.
- First posture lock: one source payment maps to one invoice allocation (unique `source_internal_invoice_payment_id`), no multi-invoice split, no overpayment/credit behavior, no partial-payment expansion beyond existing behavior.
- Allocation statuses lock: `active`, `inactive`, `reversed`, `voided`.
- Counting lock: only `active` allocations count toward invoice collected totals; `inactive`/`reversed`/`voided` do not count.
- If `counts_toward_collected_totals` is stored later, it must be constrained to status-derived truth (or omitted).

Phase 4C boundary lock (implementation shape):
- Additive table + RLS + indexes + tests only.
- No UI.
- No read-path/projection switch.
- No payment-recording changes.
- No Stripe/webhook changes.
- No Service Plan billing behavior changes.

Phase 4C closeout (Explicit Invoice Payment Allocation Table Foundation):
- Implemented as additive schema-only foundation in migration `20260526130000_internal_invoice_payment_allocations_foundation.sql`.
- Added table `internal_invoice_payment_allocations` with first-posture source/target contract (`source_internal_invoice_payment_id` -> `internal_invoice_payments.id`, invoice-only `target_invoice_id`) and unique one-source-to-one-allocation posture.
- Added status lock in schema: `active`, `inactive`, `reversed`, `voided`.
- Did not add `counts_toward_collected_totals`; countability remains status-derived (`active` only) for future allocation-aware reads.
- Added account-scoped RLS SELECT/INSERT/UPDATE and intentionally no DELETE policy.
- Added write-time source/target/account consistency enforcement for first-posture alignment.
- No allocation rows are written yet by runtime payment flows.
- No backfill performed.
- No read-path/projection switch; existing invoice-bound payment truth and paid/balance projection remain unchanged.
- No UI, payment-recording flow, Stripe checkout/webhook behavior, Service Plan billing behavior, portal, QBO, ACH, refunds/disputes, saved cards/autopay, partial payments, receipt automation, platform fee execution, or service-plan automation changes were introduced.

Phase 4D closeout (Allocation Population / Backfill / Write Strategy, docs/model only):
- Allocation rows are locked to future one-to-one population from `internal_invoice_payments`.
- Allocation idempotency key is locked to `source_internal_invoice_payment_id`.
- First mapping lock: `recorded -> active`, `pending/failed -> inactive`, `reversed -> reversed`.
- `allocated_amount_cents` must preserve source `amount_cents` exactly, including signed/zero parity.
- `target_invoice_id` must equal source payment `invoice_id`.
- Failed/reversed source rows should still have allocation rows for lifecycle completeness, but they remain non-counting.
- Invoice projection stays on compatibility helper semantics until allocation parity is proven.
- No read-path/projection switch is allowed yet.
- Backfill posture is locked to idempotent + retryable behavior.
- Runtime allocation writers are locked to centralized helper posture.
- Manual payment and Stripe webhook dual-write are locked as separate implementation slices.
- Historical backfill is locked to run only after runtime write strategy is locked.
- Production dormant schema migration planning/apply requires explicit approval before any runtime writer ships.

Locked safer implementation sequence:
1. Phase 4E: production dormant migration planning/apply, explicit approval only.
2. Phase 4F: centralized allocation write helper foundation, not wired.
3. Phase 4G: manual payment dual-write.
4. Phase 4H: Stripe webhook dual-write.
5. Phase 4I: historical backfill + parity checks.
6. Later phase: allocation read-path switch only after parity gate passes.

Phase 4E closeout (Production Dormant Allocation Migration Catch-up, docs/model only):
- Completed production dormant schema catch-up on production ref `ornrnvxtwwtulohqwxop`.
- Applied migrations in production order:
	- `20260526110000_internal_invoice_payments_reversal_audit_foundation.sql`
	- `20260526130000_internal_invoice_payment_allocations_foundation.sql`
- Verified reversal audit schema in production (`internal_invoice_payments`): `reversed_at`, `reversed_by_user_id`, `reversal_reason`, and reversal index.
- Verified allocation schema in production (`internal_invoice_payment_allocations`): required columns, constraints, indexes, RLS, SELECT/INSERT/UPDATE policies, no DELETE policy, and scope assertion trigger/function.
- Verified forbidden/deferred columns absent: `counts_toward_collected_totals`, `target_service_plan_billing_period_id`, and customer-credit target fields.
- Verified allocation row count is `0`.
- No backfill was run.
- No runtime allocation writers exist yet.
- No projection/read-path switch occurred.
- No payment recording, manual payment behavior, Stripe webhook/checkout behavior, UI, Service Plan Billing behavior, QBO, ACH, refunds/disputes, saved cards/autopay, partial payments, receipt automation, platform fee execution, customer portal, or service-plan automation behavior changed in this phase.

Phase 4F closeout (Centralized Allocation Write Helper Foundation, helper/tests only):
- Centralized allocation write helper foundation is complete.
- Added helper foundation to create/update one persisted allocation row from one `internal_invoice_payments` row.
- Helper uses `source_internal_invoice_payment_id` as idempotency key and keeps invoice-only target posture.
- Implemented locked mapping: `recorded -> active`, `pending/failed -> inactive`, `reversed -> reversed`.
- Helper preserves source `amount_cents` exactly, including signed/zero parity.
- Helper is not wired into runtime payment flows yet.
- No manual payment dual-write yet.
- No Stripe webhook dual-write yet.
- No historical backfill.
- No projection/read-path switch.
- No UI behavior change.
- No payment/manual/Stripe/webhook/checkout/Service Plan Billing/QBO/ACH/refunds/disputes/saved cards/autopay/partial payments/receipt automation/platform-fee/customer-portal/service-plan-automation behavior changes in this phase.
- Next slice remains Phase 4G manual payment dual-write, or Phase 4G-A helper smoke/parity if needed before runtime wiring.

Phase 4G closeout (Manual Payment Dual-Write, manual/off-platform only):
- Manual/off-platform payment dual-write is complete for manual payment recording and manual payment reversal actions only.
- Manual `recorded` payment rows now invoke centralized allocation upsert and create/update allocation rows with source-payment idempotency.
- Manual reversal now invokes centralized allocation upsert post-reversal and updates allocation status to `reversed` for the same source payment.
- Payment row remains authoritative; allocation helper failures are non-blocking for manual payment record/reversal success.
- No allocation deletes and no duplicate allocation rows introduced in this slice.
- Stripe webhook dual-write remains deferred to Phase 4H.
- Historical backfill remains deferred.
- Projection/read path remains unchanged (compatibility helper from payment-row truth).
- No UI, Stripe checkout/webhook, Service Plan Billing Period, QBO, ACH, refunds/disputes, saved cards/autopay, partial payments, receipt automation, platform fee execution, customer portal, or service-plan automation behavior changes in this phase.

Phase 4H closeout (Stripe Webhook Dual-Write, Stripe webhook scope only):
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

Phase 4I-B closeout (Sandbox Historical Allocation Backfill + Parity Verification, docs-only):
- Phase 4I-B sandbox historical allocation backfill is complete.
- Sandbox ref: `kvpesjdukqwwlgpkzfjm`.
- Production ref `ornrnvxtwwtulohqwxop` was not queried or mutated.
- Supabase CLI temp state was mixed; data mutation was executed through explicit sandbox URL/ref gate rather than CLI state.
- Preflight baseline:
	- payment rows: 3
	- allocation rows: 0
	- missing allocation rows: 3
	- statuses: recorded 2, reversed 1
	- no unexpected statuses
	- no required-field gaps
	- no missing invoice/account/job mismatch
	- no duplicate allocation sources
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
	- no projection switch
	- no UI/report behavior changes
	- no manual payment behavior changes
	- no Stripe webhook behavior changes
	- no production mutation
- Validation snapshot:
	- payment allocation + internal invoice payment tests: 38 passed
	- payments register + invoice ledger tests: 15 passed
	- `npx.cmd tsc --noEmit` passed
	- branch clean/synced

Phase 4I-C closeout (Production Historical Allocation Backfill Preflight + No-Op Decision, docs-only):
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

Phase 5B closeout (Service Plan Billing Period Model Lock, docs/model only):
- Table/terminology lock:
	- database table name: `maintenance_agreement_billing_periods`
	- product/UI language: Service Plan Billing Period
	- rationale: aligns with `maintenance_agreements` while preserving service-plan language
- Source-of-truth boundaries lock:
	- Maintenance Agreement = recurring service obligation truth
	- Maintenance Agreement Visit = operational visit/link/counting truth
	- Billing Period = commercial coverage-window truth
	- Internal Invoice = billed commercial truth
	- Internal Invoice Payment = collected money truth
	- Payment Allocation = payment-to-invoice relationship truth
	- paid/unpaid billing state is derived and cannot become operational truth
- First posture lock:
	- billing periods are commercial coverage records
	- billing period may optionally link to one normal internal invoice
	- first implementation links only to existing normal job-scoped internal invoices
	- first schema slice does not expand `internal_invoices` beyond required `job_id`
	- no auto-create invoices in foundation slice
	- invoice/payment linkage not required for billing-period existence
- Required fields lock:
	- `id`, `account_owner_user_id`, `maintenance_agreement_id`, optional denormalized `customer_id`
	- `coverage_start_date`, `coverage_end_date`, `billing_due_date`, `billing_cadence`
	- `amount_due_cents`, `currency`, `billing_posture`, `billing_period_status`
	- nullable `internal_invoice_id`
	- external/off-platform reference fields
	- no-charge/waiver/not-billed reason fields
	- created/updated audit fields
- Forbidden first-posture fields lock:
	- payment IDs, allocation IDs, maintenance_agreement_visit IDs, visit-count fields
	- next_due_date mutation fields, operational blocking flags
	- direct Stripe/subscription IDs, QBO IDs
- Lifecycle statuses lock:
	- `draft`, `pending_billing`, `invoice_linked`, `externally_billed`, `no_charge`, `waived`, `not_billed`, `cancelled`
- Billing posture values lock:
	- `internal_invoice`, `external_off_platform`, `manual`, `no_charge`, `waived`, `not_billed_through_compliance_matters`
- Derived payment display state lock (read-model only):
	- `not_invoice_backed`, `invoice_draft`, `unpaid`, `partially_paid`, `paid`, `invoice_void`, `payment_attention`
	- derives from linked invoice/payment truth and does not block operational work
- Invoice linkage rules lock:
	- billing period may link to one internal invoice
	- same account/customer scope required
	- prefer service-plan-originated/job-related invoice when available
	- first posture disallows multiple billing periods claiming same invoice
	- payment allocations remain invoice-targeted and do not directly target billing periods yet
- External/off-platform/no-charge guardrails lock:
	- external/off-platform/manual billing does not create fake CM payment rows
	- no-charge/waived/not-billed postures are never treated as collected money
	- external references/notes/status metadata allowed
	- operational work remains allowed without internal billing
- Operational guardrails lock:
	- jobs/work orders/visits do not require billing periods
	- visit counting does not require invoice/payment
	- billing period status does not mutate `maintenance_agreement_visits`
	- payment status does not advance `next_due_date`
	- unpaid status may inform warnings/reporting only
	- non-internal-billing tenants remain supported
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
- Implemented additive migration `20260526150000_maintenance_agreement_billing_periods_foundation.sql`.
- Added `maintenance_agreement_billing_periods` as first-posture Service Plan Billing Period schema with locked status/posture/coverage/amount/currency constraints.
- Added first-posture uniqueness guards: one coverage window per account/agreement/start/end and optional one-claim-per-internal-invoice when invoice link is present.
- Added same-account integrity trigger/function enforcing maintenance agreement account, optional customer-to-agreement match, and optional internal-invoice account/customer consistency where available.
- Added account-scoped RLS policies for SELECT/INSERT/UPDATE with no DELETE policy.
- Added focused schema foundation contract tests; related maintenance-agreements and payment allocation/internal-invoice test suites remained green.
- Local migration validation succeeded via local reset/apply chain.
- No UI, no invoice generation, no payment behavior, no allocation projection/read-path switch, no Stripe checkout/webhook behavior, and no service-plan operational behavior changes were introduced.
- Billing periods remain non-blocking for jobs/work orders/visits/visit counting/next-due workflows.
- Sandbox/production migration apply remains separate and was not executed in this phase.

Phase 5C-2 closeout (Production Dormant Billing Period Migration Apply):
- Migration `20260526150000_maintenance_agreement_billing_periods_foundation.sql` applied to production (`ornrnvxtwwtulohqwxop`) on 2026-05-26.
- Linked ref returned to CMTest sandbox `kvpesjdukqwwlgpkzfjm` after apply.
- Table `public.maintenance_agreement_billing_periods` verified in production: all 20 required columns present, no forbidden fields, all constraints/indexes/RLS/policies/triggers/functions confirmed.
- Row count is `0`. No billing period rows created, no invoice generation, no backfill.
- No UI, payment, Stripe, allocation, projection, or service-plan operational behavior changed.
- Phase 5C is fully closed across repo, sandbox, and production. Next slice is Phase 5D read-model planning/foundation.

Phase 5D-B closeout (Service Plan Billing Period Read-Model Helper Foundation):
- Added read-only billing-period helper module with account/agreement/customer list functions and pure derivation helpers for coverage, posture, lifecycle, and amount labels.
- Invoice-backed rows now derive payment display state from internal invoice truth and recorded payments only; `payment_attention` does not change paid totals.
- The helper does not query payment allocation rows directly and omits forbidden payment, allocation, visit, next-due, and blocking fields.
- No UI, invoice generation/linking action, payment behavior, allocation read-path switch, or service-plan operational behavior changed.
- Phase 5D-B is complete; next slice remains Phase 5D-C.

Phase 5E-B closeout (Customer Profile Read-Only Billing Period Visibility):
- Customer-profile-only read-only Billing Periods visibility was added inside each internal Maintenance Agreement card on `app/customers/[id]/page.tsx`.
- Billing periods remain display-only: no billing-period mutations, no invoice generation/linking, no payment/Stripe/allocation/projection behavior changes, and no service-work blocking.
- Billing periods remain non-blocking for work orders, visits, next due date, and visit counting.
- Phase 5E-B is complete; next slice remains Phase 5E-C.

Phase 5F-A2 closeout (Billing Period Manual Mutation Model Lock):
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
- Billing period customer-profile create/edit/cancel workflow passed; cancelled row remained visible as history.
- Exact same-window reuse after cancellation is still blocked by current model/schema behavior and remains a future model decision item.
- Adjacent replacement billing period creation succeeded.
- No invoice generation/linking, no internal invoice payment creation, no allocation creation, no Stripe/webhook behavior, no `maintenance_agreement_visits` mutation, and no `next_due_date` mutation occurred.
- Billing periods remain non-operational for service execution and do not block work orders, visits, visit counting, or next due behavior.
- Forbidden payment/invoice/autopay/subscription action labels remained absent in the customer-profile billing UI smoke.
- Commit `d751b23` resolved async billing-period action client handling and added regression coverage.

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
- Phase 5G-B1 is complete as server-action-only implementation; no UI was added.
- Added link/unlink server actions in `lib/maintenance-agreements/billing-period-actions.ts` (`linkInternalInvoiceToBillingPeriodFromForm`, `unlinkInternalInvoiceFromBillingPeriodFromForm`).
- Financial authority enforcement is active for Owner/Admin/Billing only (active internal user + account scope); dispatcher/technician/non-financial roles are denied.
- Manual link eligibility enforcement is active for required ids, same-account scope, non-cancelled/unlinked periods, non-void/unclaimed invoices, invoice-customer alignment where scoped, and required invoice-job linkage to the same maintenance agreement via `maintenance_agreement_visits`.
- Manual unlink/correction enforcement is active for required reason and currently-linked period requirement; unlink is non-destructive.
- Success state transitions are active:
	- link sets `internal_invoice_id` and `billing_period_status = invoice_linked`
	- unlink clears `internal_invoice_id`, sets `billing_period_status = pending_billing`, and stores `status_reason`
	- both paths revalidate/redirect customer profile with explicit banners for success/denial/invalid/conflict
- No invoice/payment/Stripe/allocation/projection/operational boundary regressions were introduced:
	- no invoice generation
	- no invoice line-item generation
	- no invoice issue/send/email behavior
	- no payment-link creation
	- no payment row or allocation row mutation
	- no Stripe behavior change
	- no projection/read-path switch
	- no `maintenance_agreement_visits` mutation
	- no `next_due_date` behavior change
- Validation snapshot: focused billing-period action tests passed, billing-period read-model tests passed, maintenance-agreements suite passed, `npx.cmd tsc --noEmit` passed, and `git diff --check` passed.

Phase 6A closeout (Service Plan Automated Billing + Stripe-Saved Payment Method Audit, docs/model only):
- Phase 6A is complete as docs/model lock only; no implementation changes are included in this slice.
- Audit result: Service Plan Billing Foundation V1 remains valid and stable for manual billing-period operations, but automated billing requires additive model work for generated invoices, saved payment methods, explicit autopay consent, manual saved-card charge, scheduled attempts, and failure/retry handling.
- Locked source-of-truth boundaries:
	- Maintenance Agreement = recurring service obligation truth
	- Billing Period = commercial coverage-window truth
	- Internal Invoice = billed commercial truth
	- Internal Invoice Payment = collected/failed payment event truth when materially recorded
	- Payment Allocation = invoice-targeted allocation truth
	- Stripe = processor/payment method/money movement truth
	- Compliance Matters Autopay Setting = future instruction/consent/audit truth
	- Visits and `next_due_date` remain operational truth and must not auto-mutate from payment outcomes
- Invoice generation model lock:
	- one billing period -> at most one active generated invoice in first posture
	- keep invoice model job-scoped in Phase 6B (`internal_invoices.job_id` remains required)
	- generation requires explicit operator-selected anchor job linked to the same maintenance agreement via `maintenance_agreement_visits`
	- first posture is manual Generate Draft Invoice only
	- no auto-send, no auto-charge, no scheduler, no saved-card logic in first generation slice
	- deterministic single service-plan billing line item from billing period amount and cadence/window template
	- explicit taxability/pricebook mapping required
	- duplicate prevention requires relationship-state guard plus generation idempotency/audit keying by account + billing period + generation kind
- Stripe-saved payment method model lock:
	- no PAN/CVC/raw credential storage in Compliance Matters
	- Stripe holds method vault and money movement truth
	- Compliance Matters stores reference/audit metadata only (customer/method ids, safe display metadata, consent metadata)
	- SetupIntent-first in connected-account context
	- customer payment profile scope = tenant account + tenant customer
	- multiple saved methods allowed with one default
	- stale/disconnected connected-account profile blocks attempts
- Autopay consent model lock:
	- autopay disabled by default
	- scoped per maintenance agreement
	- explicit consent evidence required (version, timestamp, source, actor/channel)
	- saved method != autopay consent
	- state lifecycle remains distinct (`enabled`, `disabled`, `paused`, `revoked`)
- Manual charge saved-card model lock:
	- manual charge precedes scheduled autopay
	- requires issued non-void invoice with positive balance due, same-account customer/payment-method context, connected-account readiness, active saved method, and valid saved-method reuse authorization captured by the setup flow or an explicit one-time/manual-charge authorization record
	- creates payment-attempt row only; webhook remains money-truth writer
	- charge idempotency key uses account + invoice + attempt ordinal
- Scheduled autopay model lock:
	- deferred until manual saved-card charge is proven; scheduled autopay still requires maintenance-agreement-scoped tenant_customer_autopay_consents
	- scheduler enqueues attempts only and never marks invoice paid directly
	- scheduler must skip invalid contexts (draft/void/cancelled-context, missing consent, stale profile, disconnected Stripe, in-flight attempt)
- Failed payment/retry model lock:
	- failures create attention state, not collected money
	- failures never mutate visits or `next_due_date`
	- `requires_action` pauses autopay until customer re-authenticates
	- retry policy is explicit, bounded, and non-looping
- Required future schema/model candidates:
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
	3. Phase 6C sandbox smoke for generated invoice
	4. Phase 6D saved method + consent schema/model lock
	5. Phase 6E saved method setup flow
	6. Phase 6F manual Charge Saved Payment Method
	7. Phase 6G scheduled autopay attempt orchestration
	8. Phase 6H failed payment retry/attention flow
	9. Phase 6I production enablement checklist

Phase 6B closeout (Manual Generate Draft Invoice from Billing Period, server-action only):
- Phase 6B is complete as server-action foundation only; no UI changes are included in this slice.
- Added `generateDraftInvoiceFromBillingPeriodFromForm` in `lib/maintenance-agreements/billing-period-actions.ts`.
- Access remains Owner/Admin/Billing only via existing financial authority gates.
- Eligibility checks are active for period/account/posture/amount/anchor-job scope and required agreement linkage through `maintenance_agreement_visits`.
- Zero-amount generation is blocked in this slice (`amount_due_cents > 0` required).
- Draft invoice creation now supports manual operator generation from billing period using the existing job-scoped invoice model:
	- invoice status starts `draft`
	- `job_id` remains required and is sourced from operator-selected anchor job
	- one deterministic service-plan billing line item is inserted using billing-period amount
- Billing period link behavior is active after successful invoice creation:
	- sets `internal_invoice_id`
	- sets `billing_period_status = invoice_linked`
	- uses conditional null-link guard to reduce race-condition duplicate claims
- Idempotency/audit decision in this phase:
	- no migration added
	- first-slice duplicate prevention relies on link-state guard, active-invoice guard on anchor job, and conditional link update
	- dedicated `service_plan_invoice_generation_audit` table remains future/deferred
- Runtime boundaries preserved:
	- no issue/send/email
	- no payment-link creation
	- no payment/allocation rows
	- no Stripe/saved-card/autopay/scheduler behavior
	- no visit or `next_due_date` mutation

Phase 6C closeout (Billing Period Draft Invoice Sandbox UI Smoke):
- Complete in sandbox ref `kvpesjdukqwwlgpkzfjm`; production ref `ornrnvxtwwtulohqwxop` was not active.
- Execution used the real customer-profile UI flow; no manual DB mutation was used.
- Fixture and verification scope:
	- customer `ad18fa80-2817-476b-8fca-bdcf4ff3c3d6`
	- agreement `454b3737-fa39-46be-8925-45131a571693`
	- billing period `0ee5a88a-2fb0-43ba-84c6-81ad8cc4f779`
	- verified anchor job `3c8d43ad-729c-4e39-a8e6-1d471a3aa692`
	- verified visit link `36265267-fbdb-4402-b1c7-c3e7aae3f746`
- Baseline before action:
	- period unlinked (`internal_invoice_id = null`), `pending_billing`, amount `1950`, cadence `monthly`, coverage `2026-12-01` to `2026-12-31`
	- anchor active non-void invoice count `0`
	- agreement visit count `5`
	- agreement `next_due_date = 2026-09-15`
- UI smoke result:
	- eligible period rendered `Generate Draft Invoice`
	- anchor job entered in UI and submit succeeded
	- success banner confirmed draft-only generation with no issue/send/email/charge/payment-link behavior
- Generated invoice:
	- id `e2f20d3d-7f3c-4035-b44b-4f167d9d3d98`, number `INV-20260528-C655AA85`
	- job `3c8d43ad-729c-4e39-a8e6-1d471a3aa692`
	- status `draft`, `source_type = job`, total `1950`
	- `issued_at = null`, `sent_at = null`, `payment_link_url = null`, `stripe_payment_intent_id = null`
- Generated line item:
	- id `e0552fed-a8ec-48c6-b368-b91a8f176601`
	- quantity `1`, unit price `$19.50`, line total `$19.50`
	- description `Service Plan Billing Period (monthly): 12/01/2026-12/31/2026`
- Billing period post-state:
	- `internal_invoice_id = e2f20d3d-7f3c-4035-b44b-4f167d9d3d98`
	- `billing_period_status = invoice_linked`
- Duplicate guard verification:
	- generate control no longer rendered after link
	- linked state showed invoice reference and `Unlink Invoice`
	- no synthetic duplicate submit
	- invoice count moved `0 -> 1` only; line-item count moved `0 -> 1` only
- No-side-effect verification:
	- no new `internal_invoice_payments` rows
	- no new `internal_invoice_payment_allocations` rows
	- no Stripe behavior and no payment link
	- no `maintenance_agreement_visits` mutation; visit count remained `5`
	- no `next_due_date` mutation; remained `2026-09-15`
	- invoice workspace showed Draft, 1 charge, $19.50, Unpaid, no paid/payment-link state
- Validation passed:
	- `billing-period-actions.test.ts` `22/22`
	- `billing-period-read-model.test.ts` `9/9`
	- maintenance-agreements suite `111/111`
	- `customer-detail-page-wiring.test.ts` `12/12`
	- `internal-invoice-scope-hardening.test.ts` `56/56`
	- `financial-access.test.ts` `9/9`
	- `npx.cmd tsc --noEmit` passed
	- `git diff --check` clean
- Phase 6B-UI / 6C-prep commit recorded: `5ecbba727caae8ae7586617e164c3ff37eab1600`.
- Phase 6C is now closed. Next lane is Phase 6D (saved-method + autopay consent schema/model lock).

Phase 6D-C closeout (Saved Payment Method + Autopay Consent Schema/Model Lock, docs/model only):
- Phase 6D-C is complete as docs/model lock only. No implementation, migration, Stripe API call, sandbox mutation, production touch, or webhook behavior change is included.
- Locked additive schema surfaces:
	- `tenant_stripe_customers`
	- `tenant_customer_payment_methods`
	- `tenant_saved_payment_method_setups`
	- `tenant_customer_autopay_consents`
	- `tenant_saved_method_payment_attempts`
	- `tenant_stripe_event_receipts`
- `account_owner_user_id` must use the same account-owner column type already used by existing production tenant-owned tables; this lane does not lock a divergent text-vs-UUID type.
- Card-first saved-method posture is locked:
	- first implementation remains card-first
	- ACH/bank attributes remain future/deferred display-safe metadata only
	- no ACH/bank-debit behavior is activated in this phase
- Hard storage boundary remains locked:
	- Compliance Matters may store safe references/display metadata only
	- Compliance Matters must never store full card number, CVC, raw bank/card credentials, Stripe secrets, client secrets, or reusable payment credentials
- Consent boundary remains locked:
	- saved method present does not imply autopay enabled
	- autopay enabled requires explicit maintenance-agreement-scoped consent
	- consent lifecycle remains distinct: `disabled`, `enabled`, `paused`, `revoked`, `stale_or_invalid`
- Attempt/payment-truth boundary remains locked:
	- `tenant_saved_method_payment_attempts` is workflow/audit truth
	- attempt status may reflect submission/result correlation
	- invoice paid state and collected money truth remain only in `internal_invoice_payments` and allocation truth after webhook confirmation
	- manual charge actions and schedulers must never directly mark invoices paid
- Event identity posture:
	- `tenant_stripe_event_receipts` is the additive event-receipt surface for setup lifecycle, payment-method lifecycle, off-session attempt outcomes, duplicate handling, and connected-account-context verification
- Operational boundaries remain preserved:
	- no visit mutation
	- no `next_due_date` mutation
	- no Stripe Billing Subscriptions for tenant recurring billing now
- Phase 6D-C is closed. Next lane is Phase 6E (saved payment method setup flow).

### Phase 6E-C Closeout

- Phase 6E-C — Saved Card Setup Flow / Stripe Checkout Setup Mode
- Status: complete in sandbox and committed/pushed to origin/main. Commit: `ee5c5ea4ceef7427e501b650f67eed1555b21642`
- Implemented behavior: customer profile now supports a saved-card setup flow using Stripe Checkout setup mode; Stripe owns card/payment credential collection and storage; Compliance Matters stores only Stripe references and display-safe metadata; setup writes to `tenant_stripe_customers`, `tenant_saved_payment_method_setups`, `tenant_customer_payment_methods`, and `tenant_stripe_event_receipts`; setup rows persist `stripe_checkout_session_id`, `stripe_setup_intent_id`, and `stripe_payment_method_id`; saved-card display uses safe metadata only (`brand`, `last4`, `expiration`, `status/default flag`)
- Sandbox smoke evidence: the setup flow completed through customer profile and Stripe Checkout; the setup row succeeded; the checkout session ID persisted correctly after constraint/redirect corrections; the payment method row was created with display-safe metadata; the webhook receipt processed; the customer returned to the customer profile with a success banner; no full card number, CVC, client secret, raw token, or credential material was stored or displayed
- Important correction captured: a runtime issue rejected valid Stripe Checkout Session IDs like `cs_test_...` because of an overly strict DB constraint; migration `20260527120000_fix_checkout_session_id_constraint.sql` fixed that constraint; redirect handling was corrected so the server-action redirect is not swallowed by `try/catch`; final smoke confirmed `stripe_checkout_session_id` is persisted end-to-end
- Boundaries preserved: no autopay enablement; no card charge attempt; no Stripe PaymentIntent money movement; no Stripe Billing Subscriptions; no `internal_invoice_payments` rows created; no `internal_invoice_payment_allocations` rows created; no invoice paid/balance mutation; no invoice issue/send/email/payment-link behavior; no `tenant_customer_autopay_consents` row created or enabled; no `tenant_saved_method_payment_attempts` row created; no `maintenance_agreement_visits` mutation; no `maintenance_agreements.next_due_date` mutation; no customer portal behavior added
- Validation recorded: Vitest matrix passed 113/113 across 9 files; `npx.cmd tsc --noEmit` passed; `git diff --check` passed; commit was pushed and remote-synced
- Next phase: Phase 6F — Manual Charge Saved Payment Method for an issued invoice. 6F must use attempt rows before calling Stripe and keep webhook-confirmed `internal_invoice_payments` as the collected-money truth; scheduled autopay remains deferred

Platform subscription onboarding status (separate from tenant payment execution):
- Stripe Platform Subscription V1 is implemented and live-smoke confirmed for platform account onboarding.
- Implemented slices include: admin-only checkout route, admin-only billing portal route, webhook entitlement sync route, and minimal admin/company-profile status/actions.
- Live confirmation includes: live Stripe Product/Price, Vercel production env, deployed webhook endpoint, successful live checkout completion on a normal non-owner test account, webhook `200` handling, billing-customer linkage, active subscription sync, populated period end, and billing portal availability.
- Sync target is limited to `platform_account_entitlements`.
- Live launch billing decision remains flat account subscription for unlimited/comped accounts, and V1C finite-seat enforcement is now implemented for internal seat-increase mutations only (`createInternalUserFromForm`, `inviteInternalUserFromForm`, `activateInternalUserFromForm`) when `seat_limit` is finite and at capacity.
- Unlimited/comped allowance remains unchanged (`seat_limit = null` and `internal_comped_v1` accounts are not blocked).
- V1D-A closeout: platform checkout initial seat quantity is now derived as `max(activeInternalSeatCount, 1)` for new checkout sessions, using active internal seat truth via existing entitlement resolution.
- V1D-B closeout: post-mutation platform Stripe seat quantity reconciliation is now implemented as best-effort after successful internal-user seat mutations (`create`, `invite`, `activate`, `deactivate`, `delete`) using active-seat truth with minimum `1` behavior.
- V1D-B reconciliation skips for internal/comped accounts and accounts with no linked Stripe subscription, and only updates Stripe when exactly one matching subscription item exists for `STRIPE_PRICE_ID`.
- V1D-B reconciliation uses `proration_behavior: "none"` and does not roll back local internal-user mutations on Stripe failure.
- Billing portal quantity editing remains deferred.
- Internal/comped owner protection is complete through `internal_comped_v1` detection and comped-safe entitlement rows with no Stripe linkage.
	- This does not alter tenant customer payment boundaries: the Payments V2 register below remains deferred.

---

### Tenant Customer Payments V1A-1 (Foundation)

**Status**: V1A-1 schema foundation and helpers implemented (not live UI yet).

- V1A-1 foundation: Stripe webhook idempotency fields added to `internal_invoice_payments` table
- Fields added: `stripe_checkout_session_id`, `stripe_event_id` (UNIQUE), `stripe_payment_intent_id`, `stripe_charged_at`
- Payment method added: `card_stripe_online` to payment methods enum alongside existing manual/off-platform methods
- Helpers implemented: `isStripeEventAlreadyRecorded()` for idempotency, `validateInvoiceEligibleForOnlinePayment()` for eligibility, `buildStripePaymentReference()` for charge normalization
- All existing manual payment recording and balance derivation logic preserved and tested
- Architecture locked: Checkout Session over Payment Link, issued invoices only, full balance only, no customer portal
- Webhook idempotency using Stripe `event.id` as unique key (prevents double-crediting on webhook retry)
- No live Checkout UI yet; no customer-facing payment link creation; no Stripe API calls; all changes schema/test/helper-only
- Next slice (V1A-2): Webhook receiver for `charge.succeeded` and `charge.failed` events

Locked direction:
- billed truth and payment/collection truth remain separate
- invoice reporting does not imply live payment execution
- payment architecture should still be built so later payment truth can be added without rework

Not supported now:
- live card collection
- ACH collection
- saved payment methods
- refunds through processor
- contractor payout onboarding
- chargeback/dispute tooling
- processor-driven customer checkout

---

### Tenant Customer Payments V1A-2 (Webhook Receiver)

**Status**: V1A-2 webhook receiver for charge events implemented (not live UI yet).

- V1A-2 webhook handlers: `recordTenantInvoicePaymentFromStripeCharge()` for `charge.succeeded` events, `recordTenantInvoicePaymentFailureFromStripeCharge()` for `charge.failed` events
- Webhook integration: Extended `app/api/stripe/webhook/route.ts` to route charge events based on metadata presence
  - Charge events with `metadata.invoice_id` routed to tenant invoice payment handlers
  - Charge events without `invoice_id` safely ignored (platform subscription charges, no tenant action needed)
- Idempotency enforcement: Checks `stripe_event_id` UNIQUE constraint before recording, prevents duplicate payment on webhook replay
- Validation logic: Metadata validation (`account_owner_user_id`, `invoice_id`), invoice validation (exists, belongs to owner, status='issued'), amount validation (positive, ≤ balance_due_cents)
- Payment recording: Inserts row with `payment_status='recorded'`, `payment_method='card_stripe_online'`, all Stripe reference fields (`stripe_checkout_session_id`, `stripe_event_id`, `stripe_payment_intent_id`, `stripe_charged_at`)
- Failure recording: Inserts row with `payment_status='failed'` (does NOT count toward collected balance), logs failure_reason from charge
- Audit logging: Job events (`payment_recorded`) logged with full metadata for audit trail, failure reasons included for debugging
- Test coverage: 7 unit tests covering metadata validation, idempotency, charge eligibility, contract verification
- Platform billing preserved: Existing subscription webhook behavior unchanged, charge events without invoice_id pass through safely
- No live Checkout UI yet; no customer-facing payment link creation; no Stripe API calls for charges
- Next slice (V1A-3): Checkout Session creation UI for tenant customers to initiate payment

V1A-3A correction lock (charge type):
- V1 tenant customer payments must use Stripe Connect direct charges in connected-account context.
- Current V1A-2 webhook routing remains valid for idempotent charge recording, but must add connected-account ownership verification before production use:
	- Verify event/account context maps to the expected connected account for the tenant owner.
	- Reject charge events where connected-account context does not match tenant ownership.

V1A-2A completion update (connected-account verification gate):
- Webhook route now forwards Stripe connected-account event context (`event.account`) into tenant invoice charge handlers.
- Tenant invoice charge handlers now require connected-account readiness and exact connected-account id match with `internal_business_profiles.stripe_connected_account_id` before recording.
- Missing/mismatched/unready connected-account context is acknowledged safely (no local payment record) with warning logs for diagnostics.
- Platform subscription charge events without `invoice_id` remain ignored.
- Checkout Session creation and customer payment UI remain deferred; no live tenant payment activation in this slice.

Locked direction:
- Webhook handlers use same idempotency and validation pattern as platform billing
- Charge metadata drives routing decision between platform and tenant invoice workflows
- Failed payments recorded separately with status='failed' to preserve audit trail without affecting balance
- Job event logging provides operational visibility into all payment attempts

Not supported now:
- Payment success/failure UI feedback to customer
- Automatic retry on transient failures
- Partial charge handling
- Webhook filtering by processor type
- Multiple concurrent payment attempts

---

### Tenant Customer Payments V1A-3 (Checkout Session Creation UI)

**Status**: V1A-3 helper and UI are implemented in platform-account context; V1A-3A correction now locks Connect direct-charge model before production tenant payment use.

- V1A-3 helper: `createTenantInvoiceCheckoutSession()` creates Stripe Checkout Session for issued invoices with balance due
  - Validates invoice exists, is issued, and has balance > 0
  - Returns session ID and checkout URL for customer redirect
  - Does NOT insert payment row locally; payment truth recorded only on webhook receipt
  - Includes metadata for webhook routing: `account_owner_user_id`, `invoice_id`, `job_id`, `invoice_number`
- V1A-3 server action: `createInvoicePaymentCheckoutSessionFromForm()` wraps helper with auth and scoping
  - Verifies internal user auth via `requireInternalUser()`
  - Verifies job scope via `loadScopedInternalJobForMutation()`
  - Instantiates Stripe client from `STRIPE_SECRET_KEY`
  - Redirects to Stripe checkout URL on success
  - Redirects to invoice page with error banner on validation failure (4 banner types: invoice not found, not issued, no balance, ineligible)
- V1A-3 UI integration: Green-themed "STRIPE-HOSTED PAYMENT" button in issued invoice workspace
  - Placed above existing manual payment recording form
  - Form action: `createInvoicePaymentCheckoutSessionFromForm`
  - Disabled when: invoice not issued OR balance due ≤ 0
  - Description: "Creates a Stripe-hosted payment page for this invoice balance. Payment is recorded after Stripe confirms it."
  - Button text: "Create Customer Payment Link"
  - Loading state: "Creating..."
- Eligibility validation: Invokes `validateInvoiceEligibleForOnlinePayment()` to verify:
  - Invoice status = 'issued' (not draft, void, or paid)
  - Balance due > 0 (no overpayment or zero-balance invoices)
  - Returns detailed reason for ineligibility if validation fails
- Payment summary resolution: Calls `resolveInvoiceCollectedPaymentSummary()` to derive current balance from collected payments
- Test coverage: 5 unit tests covering:
  1. Successful Checkout Session creation with correct Stripe API params
  2. Rejection of missing invoices
  3. Rejection of ineligible invoices (draft, void, or invalid state)
  4. No local database insert during session creation (webhook-only pattern verified)
  5. Correct metadata inclusion for webhook routing
- No live payment execution: Checkout Session creation only; actual charge happens at customer Stripe checkout, then webhook records payment
- Next slice (V1A-4): Customer-facing payment link distribution and outcome feedback (future planning)

V1A-3A correction lock (source-of-truth):
- The current helper creates Checkout Sessions without connected-account request context.
- For V1 tenant funds-flow, Checkout Session creation must execute in connected-account context (direct charge model), not platform destination/on_behalf_of model.
- Until that correction slice is complete, current V1A-3 implementation is not the approved production tenant-customer payment path.

Locked direction:
- Helper pattern follows established `createTenantInvoiceCheckoutSession` architecture from platform billing
- Server action uses job-scope gating consistent with internal invoice mutation actions
- UI integrates cleanly into existing invoice workspace without disrupting manual payment workflow
- Metadata-driven webhook routing allows Stripe events to reach correct handler without code changes
- No local payment insert ensures webhook remains sole source of truth for payment recording

Not supported now:
- Customer portal / saved payment methods
- Partial payments (full balance only)
- Refunds / disputes through processor
- Automatic retry on checkout failures
- Payment success/failure email to customer
- Payout/contract payment execution
- Multiple concurrent checkouts per invoice

---

### Tenant Customer Payments V1A-3A-1 (Connected Account Schema + Readiness Foundation)

**Status**: V1A-3A-1 schema/readiness foundation implemented (no onboarding or live payment activation).

- Additive schema fields added to `internal_business_profiles` for tenant connected-account readiness:
	- `stripe_connected_account_id`
	- `stripe_connect_onboarding_status` (default `not_started`)
	- `stripe_charges_enabled` (default `false`)
	- `stripe_payouts_enabled` (default `false`)
	- `stripe_details_submitted` (default `false`)
	- `stripe_connect_disabled_reason`
	- `stripe_connect_last_synced_at`
- Helper added: `resolveTenantStripeConnectReadiness()` for read-only readiness state and `isTenantStripePaymentReady()` for final gate.
- Ready gate requires: connected account id present, charges enabled, payouts enabled, details submitted, and onboarding status complete-equivalent.
- Direct-charge model preserved: tenant invoice payments remain locked to connected-account direct-charge context.
- V1A-2A follow-up remains required: webhook path must add hard connected-account ownership verification before live activation.

Not supported in V1A-3A-1:
- No Stripe OAuth onboarding flow
- No Checkout Session creation changes
- No live tenant customer payment activation
- No QBO
- No customer portal
- No refunds/disputes/saved cards/partial payments

### Tenant Customer Payments V1A-3A-2 (Stripe Connect Onboarding + Readiness Sync)

**Status**: V1A-3A-2 onboarding/readiness sync implemented for internal admin company profile controls.

- Added tenant Connect onboarding helper path:
	- Reuses existing `internal_business_profiles.stripe_connected_account_id` when present.
	- Creates Stripe Connect account only when missing.
	- Stores newly created connected account id in `internal_business_profiles`.
	- Creates Stripe-hosted account onboarding link for internal admin handoff.
- Added readiness sync helper path:
	- Retrieves Stripe connected account.
	- Updates `stripe_charges_enabled`, `stripe_payouts_enabled`, `stripe_details_submitted`, `stripe_connect_onboarding_status`, `stripe_connect_disabled_reason`, `stripe_connect_last_synced_at`.
	- Uses existing readiness gate rules (`resolveTenantStripeConnectReadiness` + `isTenantStripePaymentReady`) for final ready state.
- Added account-owner/admin-scoped internal actions:
	- Start/continue Stripe Connect onboarding.
	- Refresh Stripe readiness status.
- Added minimal internal admin company profile UI:
	- Readiness summary card and status fields.
	- Button: Connect Stripe Account or Continue Stripe Setup.
	- Button: Refresh Stripe Status.
	- Not-ready explanation and ready confirmation: "Online invoice payments ready".

Not introduced in V1A-3A-2:
- No invoice Checkout Session creation changes
- No live payment link UI
- No customer portal
- No QBO
- No refunds/disputes/saved cards/partial payments
- No change to platform seat billing behavior
- No change to manual payment recording workflow

### Tenant Customer Payments V1A-3D-1 (Direct-Charge Checkout Session Helper)

**Status**: V1A-3D-1 helper-only backend slice implemented (no UI/live-link rollout).

- Added helper: `createTenantInvoiceCheckoutSession`.
- Helper requires account owner, job id, and invoice id context.
- Helper loads invoice + payment summary and blocks when:
	- invoice is not `issued`
	- balance due is not positive
	- tenant Stripe Connect readiness is not ready
- Helper enforces connected-account-ready gate:
	- connected account id present
	- charges enabled
	- payouts enabled
	- details submitted
	- onboarding complete-equivalent
- Helper creates Checkout Session in connected-account request context:
	- `stripe.checkout.sessions.create(payload, { stripeAccount: connectedAccountId })`
	- `mode: "payment"`
	- full balance only (`unit_amount = balanceDueCents`)
	- metadata includes `account_owner_user_id`, `invoice_id`, `job_id`, `invoice_number`
	- success/cancel URLs return to invoice workspace route
- Helper returns session id and URL only.

Not introduced in V1A-3D-1:
- No UI/payment-link button
- No payment row insert during session creation
- No invoice paid-state mutation during session creation
- No customer portal
- No QBO
- No refunds/disputes/saved cards/partial payments
- No platform-account checkout session usage for tenant invoice charge creation

### Tenant Customer Payments V1A-3D-2 (Checkout Session Server Action Wrapper)

**Status**: V1A-3D-2 server action wrapper implemented (wrapper-only, no UI).

- Added internal server action wrapper: `createTenantInvoiceCheckoutSessionFromForm`.
- Action behavior:
	- requires authenticated internal user
	- enforces same account-owner scoped job mutation boundary
	- enforces operational entitlement gate and internal invoicing billing mode
	- resolves scoped invoice context and blocks account/invoice mismatch
	- calls `createTenantInvoiceCheckoutSession` with account owner, job, invoice context
	- returns typed success payload when `no_redirect=1` for action-level workflows/tests
	- otherwise redirects with safe success banner and Checkout Session id/url in return state
- Action blocked-state mapping:
	- not issued invoice -> `internal_invoice_payment_requires_issued`
	- no balance due -> `internal_invoice_payment_no_balance_due`
	- Stripe setup not ready -> `internal_invoice_payment_connect_not_ready`
	- forbidden/account mismatch -> `not_authorized`
- Preserves webhook-only payment truth:
	- action does not insert `internal_invoice_payments`
	- action does not mark invoices paid

Not introduced in V1A-3D-2:
- No invoice workspace UI button
- No customer portal
- No QBO
- No refunds/disputes/saved cards/partial payments
- No platform seat billing behavior changes
- No manual/off-platform payment recording behavior changes

### Tenant Customer Payments V1A-3E (Invoice Workspace Payment Link UI)

**Status**: V1A-3E invoice workspace payment link UI implemented (internal users only).

- Added invoice workspace UI in `app/jobs/[id]/invoice/page.tsx`.
- UI behavior:
	- shows only for issued invoices with balance due > 0
	- shows setup-required guidance when Stripe Connect is not ready
	- links safely to company profile Stripe setup
	- renders `Create Customer Payment Link` only when Connect readiness is ready
	- uses `createTenantInvoiceCheckoutSessionFromForm` with `no_redirect=1` so the returned Checkout URL can be displayed/copied on page
- Success behavior:
	- displays returned Checkout Session URL for copy/share
	- does not redirect the customer
	- does not insert `internal_invoice_payments`
	- does not mark the invoice paid
- Manual payment tracking remains visible and unchanged.
- Webhook remains the collected-payment source of truth.

Not introduced in V1A-3E:
- No customer portal
- No email sending
- No SMS
- No stored PDF/payment attachment
- No refunds/disputes/saved cards/partial payments
- No QBO
- No production Stripe/Supabase/env changes

### Tenant Customer Payments V1A-3F (Issued Invoice Email Includes Eligible Pay Link)

**Status**: V1A-3F implemented (server-side invoice send flow).

- Updated internal invoice send action `sendInternalInvoiceEmailFromForm` in `lib/actions/internal-invoice-actions.ts`.
- Email behavior:
	- attempts Checkout Session URL generation server-side during invoice send via `createTenantInvoiceCheckoutSession`
	- injects `Pay Invoice` link into HTML/text email only when Checkout Session is successfully created
	- uses copy: "You can pay this invoice securely online using the button below."
	- includes Stripe processing disclosure line in email
- Eligibility is inherited from existing checkout helper and send-context gates:
	- invoice exists
	- invoice status is issued
	- balance due > 0
	- tenant Stripe Connect readiness is ready
	- internal invoicing mode + operational entitlement access already enforced by send context
- Failure/ineligible behavior:
	- send continues without online payment link when helper reports ineligible/not-ready states
	- invoice send workflow, notification row lifecycle, and job events remain intact
- Payment truth preserved:
	- send flow does not insert `internal_invoice_payments`
	- send flow does not mark invoices paid
	- webhook remains collected-payment truth

Not introduced in V1A-3F:
- No customer portal
- No QBO
- No refunds/disputes/saved cards/partial payments
- No platform seat billing behavior changes
- No production Stripe/Supabase/env changes

---

## 5.5 Payments Register V1A/V1B (Read-Only Register & CSV Export)

**Status**: V1A (read-only register) and V1B (CSV export) implemented (commit `c9dc763`).

### V1A — Read-Only Payments Register Page

- Implemented `/reports/payments` page at Report Center navigation.
- Access gated with `requireFinancialRegisterAccessOrRedirect()`: Owner/Admin/Billing only; Dispatcher/Technician/Contractors/Portal users blocked by default.
- Register reads from `internal_invoice_payments` current truth only (no new query/mutation logic).
- UI sections:
  - Stat cards: Visible rows, Recorded count, Failed count, Recorded total amount
  - Filter panel: Status (Recorded/Failed/Pending/Reversed), Method (online_stripe/card/check/cash/digital/other), Date range (from/to), Text search (invoice/customer/job/reference/notes)
  - Recorded payments table: Paid Date, Amount, Status, Method, Customer (link to `/customers/{id}`), Invoice (link to invoice), Job Reference (link to `/jobs/{id}`), Reference, Notes
  - Failed attempts table: Same columns as recorded for clear separation/identification
  - Other states table: Pending, Reversed, and other non-recorded statuses
- Method taxonomy preserved:
  - online_stripe, card, check, cash, digital, other
  - ACH hidden and mapped to 'other' per V1 model
- Failed attempts clearly separated by status field and table section so failed rows never appear as collected money.
- All rows include navigation links where available (customer, invoice, job).

### V1B — Filtered CSV Export

- Implemented `/reports/payments/export` GET endpoint for filtered CSV download.
- Access gated with `canExportFinancialData()`: Owner/Admin/Billing only; returns 401 redirect for unauthorized users.
- Export preserves all active filters: status, method, date range, text search query.
- CSV structure:
  - Headers: Paid Date, Amount, Status, Method, Customer, Invoice, Job Reference, Job Title, Reference, Notes
  - Data rows include all filtered register rows with proper escaping (quotes, commas, newlines)
  - Status field included for failed attempt identification
  - Method field includes normalized taxonomy (no ACH exposure)
- Response headers:
  - `Content-Type: text/csv;charset=utf-8`
  - `Content-Disposition: attachment;filename="payments-register-{date}.csv"`
  - `Cache-Control: no-cache, no-store, must-revalidate`

Not introduced in V1A/V1B:
- No payment recording UI or server actions
- No corrections, allocations, or adjustments
- No customer payment history rollup
- No dashboard financial cards
- No QBO integration
- No ACH (remains hidden)
- No platform fees
- No recurring billing execution
- No schema/migration changes
- No Supabase RLS policy changes


## 6. Payment foundation requirements (build now)

### 6.1 Data model rule
- No Supabase RLS policy changes
- No Stripe webhook changes
- No production changes

## 5.6 Payments Register V1C (Customer Profile Payment History)

**Status**: V1C (customer profile payment history) implemented and browser smoke passed (commit `55dab8c`).

### V1C — Customer Profile Payment History Section

- Implemented on `/customers/{id}` page with Payment History card section.
- Access gated with `canViewFinancialRegister()`: Owner/Admin/Billing only; Dispatcher/Technician/Contractors/Portal users blocked by default (server-side enforced).
- Payment history reads from `internal_invoice_payments` scoped to account + customer (current truth only).
- Section is read-only in V1C (no payment-recording/correction/allocation mutations).
- Recorded payments section: emerald divider, status/method badges.
- Failed attempts section: red divider, status/method badges.
- Other statuses section: gray divider (Pending, Reversed, etc.).
- Per-payment row: amount (bold), status + method badges, paid date, invoice #, job title (linked), reference, notes.
- Empty state: "No recorded payments or failed attempts for this customer yet."
- Footer link: "Open Payments Register →" with customer name pre-filtered search.
- Method taxonomy preserved (ACH hidden/mapped to 'other').
- Browser smoke passed: card renders correctly, recorded payment row appears, open-register link resolves with customer filter, full register recorded/failed sections remain separated, and CSV export remains available on the full register.

Not introduced in V1C:
- No payment recording UI or server actions
- No corrections, allocations, or adjustments
- No CSV export from customer profile (full register export already exists)
- No dashboard financial cards
- No QBO integration
- No ACH (remains hidden)
- No platform fees
- No recurring billing execution
- No schema/migration changes
- No Supabase RLS policy changes
- No Stripe webhook changes
- No production changes
- No customer portal payment history (internal profile only)

---

## 6. Payment foundation requirements (build now)

### 6.1 Data model rule
Build the payment domain now, even if live payment execution is deferred.

The payment layer must be able to support future:
- online payment acceptance
- partial payments
- external transaction references
- refunds / reversals
- sync status
- processor identification
- accounting sync without QBO dependency

### Minimum domain expectations
The system should be able to represent:
- payment status
- amount due
- amount paid
- balance due
- payment method type
- processor reference
- processor name
- recorded/paid date
- refund status
- refund amount
- failure/error note
- sync state

This does **not** require all live processor workflows now, but the architecture must anticipate them.

### 6.2 Processor abstraction rule
Payment tracking must not assume QBO objects or QBO-specific payment structure.

The model should remain generic enough that:
- Stripe can become the live processor later
- QBO can optionally receive synced accounting/payment records later
- manual/off-platform payment recording can still coexist

### 6.3 Event rule
Payment-related operational changes should be event-capable from the start.

Examples:
- `invoice_sent`
- `invoice_resent`
- `invoice_delivery_failed`
- `payment_recorded`
- `payment_partially_paid`
- `payment_marked_paid`
- `payment_marked_failed`
- `refund_recorded`
- `payment_sync_failed`

**Locked rule:** If payment state materially affects operations, history, or accountability, it should be event-backed.

### 6.4 UI rule
Current UI must reflect tracking truth only.

Allowed current language:
- Payment Status
- Amount Paid
- Balance Due
- Payment Recorded
- External Payment Reference

Disallowed current language unless real processing exists:
- Pay Now
- Collect Card
- Charge Card
- Process Refund
- Card on File

The UI must not imply live payment execution before it truly exists.

---

## 7. Platform fee rule (locked)

Future Stripe-based payment acceptance should support a **small configurable platform fee**.

### Meaning
- the architecture should allow the platform to retain a modest fee later
- the fee should help sustain the platform
- the fee must be configurable, not hardcoded as a fixed aggressive monetization model

### Current implementation rule
- support the ability to add a platform fee later
- keep it low by default
- do not assume heavy fee extraction at launch
- do not make payment monetization the centerpiece of the current build

---

## 8. Roadmap phases

### Phase P0 — Tracking only (active)
Current live state.

Includes:
- operationally oriented job closeout and lightweight invoice-action tracking
- job-level invoice reference / invoice-complete markers
- billing-aware closeout visibility

### Phase P1 — Payment-ready foundation (closed)
This phase is complete enough to close at the current stabilized baseline.

Clarification:
P1 is the phase that introduced the real invoice/payment-domain seam and has now shipped its baseline foundation work, including manual collected-payment truth for issued internal invoices.

Includes:
- payment domain model
- payment-related fields
- event-ready payment transitions
- processor-agnostic architecture
- optional external reference storage
- clear ownership and UI wording boundaries
- invoice communication seam for Milestone 2 billing rollout, including draft-review clarity, issue/send, resend, and honest communication tracking/history
- invoice-owned communication tracking fields such as sent, resent, failed, recipient, last sent at, and delivery/error note when available
- truthful attempt tracking for invoice delivery without implying guaranteed delivery confirmation
- future Stripe seam
- optional future QBO sync seam
- support for a later configurable platform fee

Completed P1 foundation work (V1):

**Platform Account Entitlement / Usage Foundation**
- Implemented platform entitlement truth is account-owner-scoped and separate from:
	- tenant billed truth (`internal_invoices` / `internal_invoice_line_items`)
	- collected-payment truth (now materially implemented for issued internal invoices)
- This completed slice did not introduce a `payments` table.
- This completed slice did not introduce live processor execution, checkout, card collection, refund/dispute handling, or QBO-dependent flows.

**Manual Payment Ledger V1**
- Implemented collected-payment truth for manual/off-platform payment recording on issued internal invoices.
- New `internal_invoice_payments` table with account-owner scope and RLS:
	- Records manual payments (cash, check, ACH, bank transfer, card off-platform, other).
	- One invoice may have multiple payment rows.
	- Balance due derived from invoice total minus recorded payments.
	- Payment status: recorded, pending, failed, reversed (only "recorded" counts toward collected total).
	- Payment records are immutable.
	- Stripe and QBO fields are inert schema scaffolding only.
- New read-side resolver for collected payment summary and payment row queries.
- New server action for manual payment recording with validation:
	- Issued invoice requirement (draft and void invoices cannot receive payments).
	- Overpayment prevention (server-side balance check).
	- Account-scoped preflight and RLS verification.
- Minimal internal job-detail UI integration:
	- Payment status chips and historical payment ledger display.
	- Payment recording form for authorized users.
	- `payment_recorded` events written with full metadata to `job_events`.
- Internal invoices remain billed truth; payment recording does not mutate invoice totals or line items.
- No live processor execution exists. This implementation is manual/off-platform only.
- Stripe and QBO remain optional future seams, not active in this phase.

**Collected Payment Reporting / Invoice Ledger Visibility V1**
- Implemented collected-payment visibility in the internal invoice ledger report and CSV export.
- Internal invoice ledger now shows: Amount Paid, Balance Due, Payment Status, Last Payment, Payment Count.
- CSV export now includes: Amount Paid, Balance Due, Payment Status, Last Payment Date, Payment Count.
- Collected-payment truth is read from `internal_invoice_payments`; only `payment_status = recorded` contributes to collected totals.
- Balance due remains read-side derived from invoice total minus recorded payments and does not mutate billed-truth invoice totals or line items.
- Last Payment Date now renders as a clean report date (not a raw ISO timestamp).
- This is reporting/visibility only and does not introduce payment execution, Stripe checkout, QBO sync, or portal payment UX.
- Report wording polish closeout is complete for current launch-readiness scope:
	- Comm State label changed to Send Status
	- Payments label changed to Payment Count
	- CSV wording aligned where applicable
	- no calculations or payment-state logic changed

**Invoice workflow polish catch-up (completed, non-execution)**
- Invoice job-detail TLC pass is complete:
	- panel scanability and section wording improved
	- invoice truth anchor clarified
	- payment truth remains `internal_invoice_payments` with manual and Stripe webhook-confirmed rows
- Internal invoice draft prefill fallback hardening is complete where source fields exist, without overwriting existing drafts.
- Internal invoice void recovery/replacement behavior is complete:
	- voided invoices remain historical
	- voided invoices do not satisfy billed-truth closeout
	- replacement draft flow exists for same-job continuity
	- no live payment execution was introduced

**Final closeout-quality test fidelity polish**
- Collected-payment report tests now validate production report read-model behavior directly (`listInvoiceLedgerRows` and `buildInvoiceLedgerCsv`) instead of duplicated local aggregation logic.
- Closeout test coverage now directly guards production payment-column mapping and CSV projection behavior.

Locked clarification:
Invoice send/resend/tracking in this phase is allowed only as a billing communication seam attached to the invoice record. It is not live payment execution, not Stripe checkout, not card/ACH collection, not refund/dispute handling, not contractor payout flow, and not QBO-led billing.

Invoice email content/design polish may continue later as refinement work, but that refinement does not change the payment-ready architecture or convert this seam into payment execution.

Does **not** include:
- customer checkout
- processor onboarding
- contractor payouts
- saved cards
- refunds through processor

### Phase P2 — Stripe customer/work payment execution (tenant invoice acceptance, current scope closed)
Current intended Payments V1 scope is implemented and validated.

Locked carry-forward clarification:
- Dashboard payment/cash-performance analytics expansion remains deferred.
- Tenant customer/work payment execution V1 current scope is implemented.
- Platform subscription billing for account onboarding is implemented in V1 and live-smoke confirmed in production.
- This platform-billing slice remains separate from tenant internal invoice/customer-work payment execution.

### P2 architecture decision (V1)
- Tenant customer payment execution V1 means processor-backed customer payment acceptance for issued tenant internal invoices.
- It is separate from platform subscription billing.
- Platform subscription billing charges the tenant account for Compliance Matters access and syncs entitlement truth.
- Tenant customer payment execution collects end-customer money against tenant-issued internal invoices and syncs collected-payment truth.
- Internal invoices remain billed truth.
- `internal_invoice_payments` remains collected-payment truth.
- Stripe is the payment rail / processor, not the operational source of truth.
- Manual/off-platform payment recording remains first-class and must coexist with Stripe-sourced payment rows.
- QBO remains optional downstream only.

### Recommended V1 scope
- issued internal invoices only
- one invoice to many payment rows
- Stripe-hosted processor flow later
- idempotent webhook writeback
- success/failure/pending outcome handling
- payment rows store processor references, amount applied, outcome status, paid timestamp, and failure reason/code where available
- reporting aggregates manual and Stripe-collected payments through the same collected-payment model

### Suggested states
- payment row states: pending, recorded, failed, reversed
- derived invoice states: unpaid, partially_paid, paid, payment_attention

### Event-backed outcomes
- `payment_recorded`
- `payment_partially_paid`
- `payment_marked_paid`
- `payment_marked_failed`
- `payment_sync_failed`

Launch-status update:
- Stripe Platform Subscription V1 for new account users/platform onboarding is implemented and live-smoke confirmed in production.
- This work no longer sits in pending live-environment readiness; live keys, live webhook, and final smoke are complete for the platform-account subscription slice.
- Tenant customer invoice/work-payment execution V1 current scope is now in scope and closed for this phase.
- Deferred in this lane: refunds/disputes/saved cards/partial payments/receipt messaging/public portal/platform application fees/QBO sync.

Recommended first scope for tenant customer/work payments:
- customer pays invoice online
- transaction outcome writes back to Compliance Matters
- invoice payment status and balance due update automatically
- partial and full payment outcomes are supported
- minimal processor-led implementation
- no contractor payout complexity unless explicitly required

Deferred-later scope within/after P2:
- refunds/disputes handling remains later
- processor payment-failure recovery workflows remain later
- optional small configurable platform fee remains a future capability
- QBO remains optional/downstream only and must not gate tenant payment execution

### Phase P3 — Contractor/platform payout layer (later)
Only after customer payment acceptance is stable.

Includes:
- contractor payment onboarding
- payout ownership model
- payout visibility
- refund/dispute responsibility rules
- merchant-of-record / recipient logic
- optional platform fee logic if desired

### Phase P2A / 3A — Payment Reversal / Correction Foundation (closed)

Status: implemented in current sandbox closeout and validated.

Includes:
- additive reversal audit fields on `internal_invoice_payments` (`reversed_at`, `reversed_by_user_id`, `reversal_reason`)
- server-side reversal mutation for manual/off-platform `recorded` rows only
- required reversal reason and durable audit metadata capture
- authority gate reuse: Owner/Admin/Billing allowed; Dispatcher/Technician/Contractor/Portal/Public blocked by default
- failed/already-reversed rows blocked from reversal
- Stripe/online rows blocked from reversal in this flow with explicit safe copy (no refund/dispute/provider API behavior)
- non-destructive correction posture (no payment-row deletes)
- projection safety preserved: reversed rows do not count toward invoice paid/balance or collected totals

Explicit non-goals preserved in this phase:
- no allocation engine
- no service-plan billing-period execution behavior
- no customer portal payment self-service
- no QBO sync/export behavior
- no ACH enablement
- no refunds/disputes execution
- no saved cards/autopay
- no partial-payment expansion
- no receipt automation
- no platform-fee execution

### Phase P4 — Optional QBO sync (later)
Accounting convenience only.

Possible scope:
- invoice sync
- payment sync
- reconciliation support
- bookkeeping-friendly exports or mappings

**Locked boundary:**
- QBO sync must remain optional and downstream
- this must never become required for core usage
- this must never be the only path to payment acceptance
- QBO must not override Compliance Matters invoice truth or collected-payment truth
- one-way Compliance Matters to QBO is the safest first shape; broad two-way sync stays deferred

### QBO parking decision
- QBO remains last-last.
- QBO is optional downstream accounting sync/export only.
- QBO is not required for launch.
- QBO is not required for core product use.
- QBO is not required before tenant Stripe customer payments.
- QBO is not the payment rail.
- QBO is not the invoice source of truth.
- QBO is not the customer source of truth.
- QBO is not the operational lifecycle/source-of-truth system.
- QBO must not override Compliance Matters invoice or payment truth.

---

## 9. Product launch rule

### Locked launch rule
Lack of live payment acceptance does **not** block launch by itself.

Why:
- current product can still operate with payment tracking
- invoice/payment status can still be managed operationally
- payment acceptance is a convenience and revenue-collection expansion layer, not a core workflow backbone requirement

---

## 10. Strategic takeaway

Compliance Matters should launch and grow as:

**operations-first software with optional future accounting integration and later Stripe-based payment acceptance**

Not as:
- a QBO-dependent app
- a bookkeeping-led platform
- a payment-first system before operational maturity is in place

---

## 11. Non-negotiables

- Do not require QBO for core product use
- Do not couple payment acceptance to accounting adoption
- Do not let payment features distort the operational source-of-truth model
- Do not expand into payout complexity until customer payment acceptance is stable
- Keep payments additive, not disruptive

---

### 12. One-line definition

Compliance Matters is **payment-ready by design with tenant customer payments V1 current scope active**: operational payment truth lives in the platform, Stripe Platform Subscription V1 is implemented and live-smoke confirmed for platform account onboarding, tenant customer invoice checkout uses connected-account direct-charge with webhook-only payment truth writeback, and refunds/disputes/saved cards/partial payments/public portal/platform application fees/QBO sync remain deferred.

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
