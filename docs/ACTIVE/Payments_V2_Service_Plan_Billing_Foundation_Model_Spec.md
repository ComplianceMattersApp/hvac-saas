# Payments V2 / Service Plan Billing Foundation Model Spec

Status: ACTIVE MODEL LOCK (Phase 2 + Phase 3A closeout)
Owner lane: Payments V2 / Service Plan Billing Foundation
Scope: docs/model only. No product code, schema, migrations, Supabase commands, Stripe behavior changes, checkout/session changes, env/flag changes, UI build, or provider integrations are authorized by this spec.

## Phase 6F-C Closeout (Manual Saved-Card Charge for Issued Invoice)

- Closed implementation commit: `f7fa23fca188029a9a6f38e152a83180b346606e` (`feat(payments): charge saved card manually for issued invoice`), pushed to `origin/main` with clean working tree.
- Manual one-time saved-card charge is implemented for eligible issued invoices only.
- Source-of-truth lock is preserved: manual attempt row in `tenant_saved_method_payment_attempts` is workflow/audit truth; webhook-created `internal_invoice_payments` is collected-money truth; allocation row is written only after payment truth exists.
- Stripe charge path is connected-account PaymentIntent with saved customer/payment method context; this is explicitly not autopay and does not create subscriptions.
- Attempt resolution links to created payment truth (`resolved_internal_invoice_payment_id`) after webhook success.
- Fresh sandbox smoke proof: invoice `INV-20260528-1CFFCB88` (`7f79e75b-06b5-4924-bd0c-91b78740f2d7`), attempt `99949838-81f3-442a-9de1-4bc736b4c40b`, payment `3788c9ff-700d-43ab-8339-46e4cbf24ae3`, allocation `2b702b07-690a-4e4d-82f2-6f6ed6e40627`, Stripe charge `ch_3Tbxg47itDepDR180C1KhPco`, amount `$17.50`, Stripe webhooks HTTP 200, UI post-state Paid / Balance `$0.00`.
- Non-action guardrails verified: no `tenant_customer_autopay_consents` creation, no `maintenance_agreement_visits` mutation, no `maintenance_agreements.next_due_date` mutation, no Stripe Billing subscription behavior, and no ACH/bank-debit behavior.
- Validation proof: `npx.cmd tsc --noEmit` passed; targeted Vitest matrix passed (8 files, 100 tests); `git diff --check` passed; `_tmp_*` artifacts removed; commit included only intended implementation/test files and no docs/migrations/env/secrets.

## Phase 6G-A Closeout (Scheduled Autopay Attempts Model/Audit Lock, Docs-Only)
### Phase 6H-A Closeout (Failed Autopay Retry / Attention Workflow Model Lock, Docs-Only)

- Phase 6H-A audit/model lock is complete as read-only analysis with no code, schema, docs-outside-scope, sandbox data, production data, Stripe charge, or UI mutation.
- Canonical attempt states remain unchanged: `pending`, `submitted`, `succeeded`, `failed_declined`, `failed_requires_action`, `blocked_precondition`, `retry_scheduled`, `abandoned`.
- Submit-path lock: declines map to `failed_declined`; authentication-required maps to `failed_requires_action`; readiness/scope/invoice/precondition failures remain `blocked_precondition`; stale amount snapshot blocks submit; duplicate in-flight remains blocked; 6G-E3 self-in-flight exception remains narrow/safe.
- Webhook lock: `charge.failed` is currently routed; `payment_intent.payment_failed` is not currently routed; failed webhook rows are non-collected `internal_invoice_payments` truth; failed allocations stay non-counting (`inactive`); saved-method attempt failure resolution remains webhook-linked where identity is present.
- Current surfaces: Payments Register separates recorded vs failed rows; Customer Payment History separates Failed Attempts; invoice workspace has manual saved-card failure banners, but no scheduled-autopay-specific attention read model yet.
- Retry/attention policy recommendation (V1): manual-first retry, no automatic infinite retry, `failed_requires_action` pauses further scheduled submissions for same consent/agreement/customer path until operator resolution, `failed_declined` opens attention and allows manual retry only after revalidation, and failed autopay does not block service visits by default.
- Schema/read-model recommendation: use existing attempt table fields first (`retry_count`, `next_retry_at`, `requires_action_type`, `blocked_reason_code`, `failure_code`, `failure_message`, resolved fields) plus a derived attention read model before any additive schema.
- Customer communication remains deferred: failed-payment email/SMS, portal/self-service card-update + retry flows, retry reminders, and notification automation.
- Locked sequence after this closeout: 6H-B read model/attention projection only, 6H-C invoice workspace read-only attention UI, 6H-D manual retry action with strict guards, 6H-E sandbox failed-path smoke, 6H-F docs closeout/production readiness gate.
### Phase 6H-B Closeout (Failed Autopay Attention Read Model / Projection Only)

- Phase 6H-B is complete in commit `e2690e2e36c0e40b2797d73bac8985693b18f381` (`feat(payments): add failed autopay attention read model`).
- Added server-side read-only projection module `lib/business/failed-autopay-attention-read-model.ts` with focused tests in `lib/business/__tests__/failed-autopay-attention-read-model.test.ts`.
- Projection scope is account-owned failed scheduled-autopay attention only (`failed_declined`, `failed_requires_action`, meaningful `blocked_precondition`) with counts by status/category and operator-facing recommended action.
- Truth boundaries remain locked: `tenant_saved_method_payment_attempts` = attempt/attention truth; `internal_invoice_payments` = payment-event truth; `internal_invoice_payment_allocations` = allocation truth; Stripe = processor/payment-method truth; visits and `maintenance_agreements.next_due_date` remain operational truth and are not payment-mutated.
- No Stripe behavior change, no schema change, no production enablement change, and no payment/allocation/invoice/visit/next_due writes outside existing webhook payment truth behavior.

### Phase 6H-C Closeout (Invoice Workspace Read-Only Failed-Autopay Attention UI)

- Phase 6H-C is complete in commit `5b383e842a62d0cc95f7b1d90ca3865b735f5e87` (`feat(payments): show failed autopay attention on invoice workspace`).
- Invoice workspace now loads the failed-autopay attention read model server-side and renders a read-only "Failed Scheduled Autopay Attention" panel for internal operator visibility.
- Panel surfaces open attention items, category, attempt status, timestamp, recommended operator action, and safe context metadata; no retry action is exposed.
- This remains visibility-only: no Stripe calls, no payment/allocation/invoice mutations, no visit/next_due mutation, and no customer email/SMS/portal update-card flow launch in this slice.
- Deferred lanes remain locked: 6H-D manual retry action, 6H-E failed/`requires_action` sandbox smoke, and customer communication/self-service update-card flows.

### Phase 6H-D Closeout (Manual Retry for Failed Scheduled Autopay)

- Phase 6H-D is complete in commit `c3ea465987ac138822b01c914839c6ec62a696fa`.
- Added manual retry helper/action/UI affordance for retry-eligible failed scheduled-autopay attention through the sanctioned invoice-workspace action path.
- Retry action behavior is guardrailed: it creates a new retry attempt in `tenant_saved_method_payment_attempts` and does not directly write `internal_invoice_payments`, does not directly write `internal_invoice_payment_allocations`, and does not directly mutate invoice paid/balance state.
- Source-of-truth lock remains unchanged: `tenant_saved_method_payment_attempts` = attempt/attention truth; `internal_invoice_payments` = payment-event truth; `internal_invoice_payment_allocations` = allocation truth; Stripe = processor/payment-method truth.
- Operational boundaries remain unchanged: no direct `maintenance_agreement_visits` mutation and no direct `maintenance_agreements.next_due_date` mutation.
- Successful retry-settlement smoke remains optional/future and should only run when a valid saved-card path can be safely exercised through sanctioned flows.

### Phase 6H-E Closeout (Declined-Path Manual Retry Smoke, Sandbox-Only)

- 6H-E cleanup/stabilization is complete: E2/E3/E4 restored clean fixture baseline and consent/method coherence through sanctioned helpers with no code/docs/schema commits in that cleanup lane.
- 6H-E5 is complete in commit `d5dd4f918b0178157dbcb54edd5f9203a9b943e3` with sanctioned billing-anchor job path (`linkBillingAnchorJobFromForm`) and no invoice/payment/allocation/Stripe/visit/next_due side effects.
- 6H-E5B is complete in commit `b12e1cc6e934d2d4c0203104d3e393387890619c`, hard-blocking cancelled/canceled/closed/void/voided/archived/soft-deleted jobs as billing anchors.
- 6H-E6 declined-path smoke is complete and validated for customer `ad18fa80-2817-476b-8fca-bdcf4ff3c3d6`, billing period `c89c4c36-a842-40e2-9b20-745dce4b959c`, job `1a52288c-78ae-4e79-9472-d00ed928f32f`, invoice `INV-20260529-DDC200B6` (`3d5edb10-8695-42ab-a133-54bd64e4a2a0`).
- Scheduled attempt `6d9120a4-d571-41a0-8ad3-b5172ac39275` ended `failed_declined` with failure "Your card was declined."; sanctioned manual retry created attempt `980c90c2-745f-470f-aa86-e2ba5b30fbc0` with `retry_count = 1` and `failed_declined`.
- Stripe listener captured `charge.failed` and `payment_intent.payment_failed`; webhook POSTs returned HTTP 200.
- Post-smoke truth was correct and non-silent: one failed `internal_invoice_payments` row (non-collected payment-event truth), one inactive `internal_invoice_payment_allocations` row (non-counting allocation truth), canonical invoice summary unpaid, paid amount `0`, balance `1750`.
- Invoice paid/balance projection remains derived from recorded collected payment truth only; failed payment rows are non-collected and inactive allocations do not count toward paid balance.
- Declined retry remained unpaid and visible in attention surfaces; no direct invoice paid mutation and no direct payment/allocation writes from retry action occurred.
- Customer email/SMS/portal update-card flows remain deferred.
- Next required visibility lane before production-grade scheduled autopay rollout: Failed Payment Alert + Reconciliation Queue, because failed payments must not occur silently.

### Phase 6G-E4 Closeout (Fresh Scheduled Autopay Submit Smoke, Docs-Only)

- Phase 6G-E4 passed after the 6G-E3 self-attempt revalidation fix in commit `c7329a8a9b19d392f6dd7196ca7145f86d62e713`.
- Sandbox-only smoke used owner `9e82acca-c271-41bc-89af-396f37c1990c`, customer `ad18fa80-2817-476b-8fca-bdcf4ff3c3d6`, invoice `63e28e1c-1be9-43bb-923d-940d80887cb2` (`INV-20260528-9D731258`), job `91e31a74-cc1b-4585-8dc3-6812351fbbdf`, consent `3c24c9e6-6f78-4fe4-8619-9094782827bb`, and fresh pending attempt `67dc6700-83d9-4dd0-8af1-d8ae931db14a`.
- 6G-B returned the invoice eligible, 6G-C created the fresh pending scheduled_autopay attempt, and 6G-D submitted it successfully with Stripe PaymentIntent `pi_3Tc6bF7itDepDR181kf2LE2p`, charge `ch_3Tc6bF7itDepDR181J27CvPs`, and webhook event `evt_3Tc6bF7itDepDR181B08QHZd`.
- Webhook truth created exactly one `internal_invoice_payments` row and exactly one `internal_invoice_payment_allocations` row; invoice projection became paid with balance `$0.00`.
- UI verification after refresh showed Issued / Paid / Paid `$17.50` / Balance `$0.00` with one recorded Stripe payment row.
- Guardrails held: submit helper did not directly create payment or allocation rows, did not mark invoice paid, did not mutate visits or `next_due_date`, did not create invoice issue/send/email or payment-link side effects, and no production access occurred.
- No code changed during the smoke; all requested validation commands passed.
- Recommended next lane after this closeout is Phase 6G-F docs closeout, then Phase 6H failed-payment retry and attention workflow expansion.

- Scope lock: audit/model/planning only. No implementation, no migrations, no scheduler jobs, no Supabase mutation, no Stripe calls, no webhook behavior changes, and no commits are authorized by this closeout.

Scheduled autopay source-of-truth boundaries:
- Scheduler is attempt orchestration truth only.
- Attempt table (`tenant_saved_method_payment_attempts`) is workflow/audit truth only.
- Webhook-confirmed `internal_invoice_payments` remains collected-money truth.
- `internal_invoice_payment_allocations` remains allocation truth.
- Stripe remains processor/credential truth.
- Scheduled autopay must not mutate `maintenance_agreement_visits`.
- Scheduled autopay must not mutate `maintenance_agreements.next_due_date`.
- Failed scheduled autopay creates attention, not collected money.

Eligibility lock:
- Issued invoice only.
- Not void.
- Balance due greater than zero.
- Same account/customer/payment-profile/consent scope.
- Linked billing period, if present, must not be cancelled.
- Linked maintenance agreement, if present, must be active/autopay-eligible.
- Active saved payment method required.
- Enabled valid consent required.
- Connected account must be ready and matching.
- No in-flight `scheduled_autopay` attempt for the same invoice.
- Respect `max_amount_cents` on consent when set.
- Payment profile/method must not be stale/disconnected/invalid.
- Re-check invoice status and balance before submit.
- Already-paid invoice blocks as `blocked_precondition`.

Scheduler trigger lock:
- First slice is manual/internal runner.
- Two modes: dry-run and commit.
- No cron in first slice.
- Evaluate issued invoices only.
- Exclude draft invoices.
- Evaluate due-today and overdue issued invoices first.
- Batch by `account_owner_user_id`.
- Per-account failure isolation is required.

Attempt lifecycle and idempotency lock:
- `attempt_kind = scheduled_autopay`.
- Persisted statuses: `blocked_precondition`, `pending`, `submitted`, `succeeded`, `failed_declined`, `failed_requires_action`, `retry_scheduled`, `abandoned`.
- `eligible` is dry-run/read-model output only and is not a persisted status.
- Idempotency key format: `scheduled_autopay:account_owner_user_id:invoice_id:cycle_key:ordinal`.
- No duplicate pending/submitted/retry_scheduled attempt for the same invoice/kind.
- No duplicate Stripe PaymentIntent for the same attempt.
- Snapshot amount/balance at attempt creation and revalidate before submit.

Stripe charge model lock:
- Reuse shared saved-card charge path from manual charge.
- Scheduler-specific entry calls shared service with `scheduled_autopay` attempt kind.
- PaymentIntent metadata must include `account_owner_user_id`, `customer_id`, `invoice_id`, `attempt_id`, `billing_period_id`, `maintenance_agreement_id`.
- Only pre-webhook transition allowed is `submitted`.
- `requires_action` maps to `failed_requires_action` attention.
- Declines map to `failed_declined` attention.
- Payment rows are created only by webhook handlers.

Retry/failure/attention lock:
- No automatic retry loop in first 6G implementation.
- `failed_declined` and `failed_requires_action` open attention.
- `requires_action` means customer re-authentication is required.
- Failed attempt does not block service visits.
- Failed attempt does not mutate `next_due_date`.
- `failed_requires_action` pauses further scheduled submissions for that consent/agreement until resolved.
- Manual operator retry precedes automated retry.

Reporting/visibility lock:
- Invoice workspace shows attempt history separately from recorded payments.
- Customer profile shows autopay consent state and latest attempt outcome.
- Maintenance agreement card shows autopay attention summary.
- Payments register must not mix failed attempts into collected totals.
- Collected totals derive from recorded payment truth only.

Security/access lock:
- Owner/Admin/Billing only for enable/disable/pause/revoke consent.
- Owner/Admin/Billing only for scheduler dry-run/commit-run.
- Owner/Admin/Billing only for retry submission.
- Dispatcher/Technician are read-only where visibility is allowed.
- Server-side financial-access checks are required.

Dry-run lock:
- Mandatory first implementation slice.
- Dry-run output must include: invoices evaluated, eligible count, blocked count by reason, in-flight attempts, consent/method/profile/readiness snapshot flags, proposed amount snapshots, and explicit no Stripe calls/no writes.
- Commit mode must be opt-in and separate from dry-run.

Schema lock:
- No schema change required for 6G-B dry-run eligibility read model.
- No schema change strictly required for 6G-C attempt creation (`scheduled_autopay` kind and core statuses already exist).
- Keep `eligible` as non-persisted dry-run classification.
- Optional future additive fields only: `scheduler_run_id`, `cycle_key`, `last_blocked_reason_at`.

Risks/blockers:
- Race between eligibility and submit.
- Duplicate attempts without strict idempotency.
- `requires_action` loop without pause gate.
- Cross-tenant scheduler failure cascade.
- Missing billing-period linkage for some invoices.
- Attention UX gaps.

Recommended implementation sequence:
1. 6G-B eligibility read model plus dry-run tests only.
2. 6G-C `scheduled_autopay` attempt row creation only, no Stripe submit.
3. 6G-D submit scheduled attempts through shared saved-card charge path.
4. 6G-E sandbox smoke on one eligible issued invoice with enabled consent.
5. 6G-F docs closeout.
6. 6H retry/attention expansion.

Execution confirmation:
- This closeout is docs-only model lock; no implementation or data mutation occurred in this phase.

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

Phase 6A closeout (Service Plan Automated Billing + Stripe-Saved Payment Method Audit, docs/model only):
- Service Plan Billing Foundation V1 is complete, but full recurring-service automation requires a dedicated lane for:
	- generated invoices from billing periods
	- Stripe-saved payment methods
	- explicit autopay consent
	- manual charge saved payment method
	- scheduled autopay attempts
	- failed-payment/retry/attention workflow
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
	- first implementation keeps `internal_invoices` job-scoped and does not remove required `job_id` in Phase 6B
	- generated invoice requires explicit operator-selected anchor job linked to the same maintenance agreement via `maintenance_agreement_visits`
	- first version generates draft invoice only
	- no auto-send, no auto-charge, no scheduled job, and no saved-card logic in first generation slice
	- one controlled service-plan billing line item only
	- amount source = `billing_period.amount_due_cents`
	- description source = deterministic coverage-window/cadence template
	- taxability and pricebook mapping must be explicit, not inferred
	- duplicate prevention requires both link-state blocking (`billing_period.internal_invoice_id` already set) and generation audit/idempotency keying by account + billing period + generation kind
	- voided invoice must surface through derived display only (no automatic lifecycle rewrite)
	- cancelled billing period blocks new generation
	- generation may transition billing period lifecycle to `invoice_linked` only after successful invoice link
- Stripe-saved payment method model lock:
	- Compliance Matters must never store full card number, CVC, raw bank/card data, payment credentials, or any card-vault equivalent
	- Stripe stores payment method and money movement
	- Compliance Matters stores only safe references/metadata (`connected account id`, `Stripe customer id`, `Stripe payment method id`, display-safe card metadata, consent status, relationship refs, audit timestamps/actors)
	- SetupIntent-first saved-method flow in connected-account context
	- Stripe customer profile posture = per tenant account + tenant customer
	- multiple service plans for the same customer may share one Stripe customer/payment profile
	- multiple payment methods may exist with one default marker
	- connected-account disconnect/change marks profile stale and blocks charge attempts
- Autopay consent model lock:
	- autopay disabled by default
	- consent scoped per maintenance agreement
	- store consent version/timestamp/source/actor/capture channel/evidence reference
	- customer consent path is preferred
	- tenant-captured authorization is future-only unless explicitly modeled with source flag + stronger audit
	- saved card present does not imply autopay enabled
	- autopay lifecycle states are distinct (`enabled`, `disabled`, `paused`, `revoked`)
	- disable/revoke are state transitions, never hard deletes
- Manual charge saved-payment-method lock:
	- manual `Charge Saved Payment Method` comes before scheduled autopay
	- preconditions: issued invoice, non-void invoice, positive balance due, non-cancelled billing period, same-account customer/payment-method context, connected-account readiness, active saved method, and valid saved-method reuse authorization captured by the setup flow or an explicit one-time/manual-charge authorization record
	- charge initiation creates payment-attempt record
	- webhook remains sole collected-money truth
	- Stripe idempotency key basis = account + invoice + attempt ordinal
- Scheduled autopay model lock:
	- deferred until manual saved-method charge posture is proven; scheduled autopay still requires maintenance-agreement-scoped tenant_customer_autopay_consents
	- scheduler evaluates due issued invoices and enqueues attempts only
	- scheduler never marks invoices paid
	- scheduler must skip draft/void/cancelled-context invoices, missing consent, stale profile, disconnected Stripe, or in-flight attempt
- Failed payment/retry model lock:
	- failed payment creates attention state, not collected money
	- failed payment must not mutate visits or `next_due_date`
	- `requires_action` failures pause autopay until customer re-authenticates
	- retry policy must be explicit and bounded
	- infinite retry loops are forbidden
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
- Phase 6B is complete as server-action foundation only; no UI wiring is included in this slice.
- Added `generateDraftInvoiceFromBillingPeriodFromForm` in `lib/maintenance-agreements/billing-period-actions.ts`.
- Access lock is enforced through existing financial authority rules: Owner/Admin/Billing allowed; Dispatcher/Technician denied.
- Eligibility enforcement is active:
	- billing period must exist in same account scope
	- billing period must not be `cancelled`
	- billing period must not already have `internal_invoice_id`
	- billing posture must be `internal_invoice`
	- amount due must be positive (`amount_due_cents > 0`)
	- anchor job must exist in same account scope
	- anchor job customer must match maintenance-agreement customer where scoped
	- anchor job must already be linked to the same maintenance agreement through `maintenance_agreement_visits`
	- anchor job must not already have an active non-void invoice
- Draft invoice creation behavior is active:
	- creates a normal `internal_invoices` row with required `job_id` preserved
	- invoice starts in `draft` status
	- `source_type` remains `job`
	- no issue/send/email/payment-link behavior is triggered
- Controlled line-item behavior is active:
	- one deterministic service-plan billing line item is inserted
	- amount is sourced from `billing_period.amount_due_cents`
	- description is deterministic from cadence + coverage window (`MM/DD/YYYY-MM/DD/YYYY`)
	- line provenance remains compatible with current invoice line-item constraints (`source_kind = manual`)
- Billing period link behavior is active:
	- after successful invoice + line creation, billing period updates to `internal_invoice_id = <generated invoice id>` and `billing_period_status = invoice_linked`
	- link update is guarded with `.is("internal_invoice_id", null)` to reduce duplicate-link races
	- no visit-counting or `next_due_date` mutations occur
- Idempotency/audit decision for Phase 6B:
	- no schema migration was added in this slice
	- first-slice duplicate protection uses existing relationship guards (`internal_invoice_id` null precondition + conditional link update), plus active-invoice check on anchor job and existing `internal_invoices` active-unique posture
	- dedicated generation audit table remains a future additive candidate (`service_plan_invoice_generation_audit`) and is deferred
- Runtime boundaries preserved:
	- no payment row creation
	- no allocation row creation
	- no Stripe behavior
	- no saved-card/autopay/scheduler behavior
	- no `maintenance_agreement_visits` mutation
	- no `next_due_date` mutation

Phase 6C closeout (Billing Period Draft Invoice Sandbox UI Smoke):
- Phase 6C is complete in sandbox ref `kvpesjdukqwwlgpkzfjm`.
- Production ref `ornrnvxtwwtulohqwxop` was not active for this run.
- Real customer-profile UI path was used; no manual DB mutation was used.
- Fixture scope:
	- customer `ad18fa80-2817-476b-8fca-bdcf4ff3c3d6`
	- agreement `454b3737-fa39-46be-8925-45131a571693`
	- billing period `0ee5a88a-2fb0-43ba-84c6-81ad8cc4f779`
	- verified anchor job `3c8d43ad-729c-4e39-a8e6-1d471a3aa692`
	- verified visit link `36265267-fbdb-4402-b1c7-c3e7aae3f746`
- Baseline confirmed before submit:
	- billing period unlinked (`internal_invoice_id = null`), status `pending_billing`, amount `1950`, cadence `monthly`, coverage `2026-12-01` to `2026-12-31`
	- anchor active non-void invoice count `0`
	- agreement visit count `5`
	- agreement `next_due_date = 2026-09-15`
- UI smoke result:
	- `Generate Draft Invoice` control rendered for eligible billing period
	- anchor job id entered through UI and submit succeeded
	- success banner rendered with explicit draft-only/no-issue-send-email-charge-payment-link copy
- Generated invoice evidence:
	- invoice id `e2f20d3d-7f3c-4035-b44b-4f167d9d3d98`
	- invoice number `INV-20260528-C655AA85`
	- `job_id = 3c8d43ad-729c-4e39-a8e6-1d471a3aa692`
	- status `draft`, `source_type = job`, total `1950`
	- `issued_at = null`, `sent_at = null`, `payment_link_url = null`, `stripe_payment_intent_id = null`
- Generated line item evidence:
	- line item id `e0552fed-a8ec-48c6-b368-b91a8f176601`
	- quantity `1`, unit price `$19.50`, line total `$19.50`
	- description `Service Plan Billing Period (monthly): 12/01/2026-12/31/2026`
- Billing period post-state:
	- `internal_invoice_id = e2f20d3d-7f3c-4035-b44b-4f167d9d3d98`
	- `billing_period_status = invoice_linked`
- Duplicate guard evidence:
	- generate control no longer rendered after link
	- linked state showed invoice reference and `Unlink Invoice`
	- no synthetic duplicate submit was performed
	- invoice count moved `0 -> 1` only; line-item count moved `0 -> 1` only
- No-side-effect verification:
	- no new `internal_invoice_payments` rows
	- no new `internal_invoice_payment_allocations` rows
	- no Stripe behavior and no payment link
	- no `maintenance_agreement_visits` mutation; visit count remained `5`
	- `next_due_date` remained `2026-09-15`
	- invoice workspace showed Draft, 1 charge, $19.50, Unpaid, and no paid/payment-link state
- Validation remained green after smoke:
	- `billing-period-actions.test.ts` `22/22`
	- `billing-period-read-model.test.ts` `9/9`
	- maintenance-agreements suite `111/111`
	- `customer-detail-page-wiring.test.ts` `12/12`
	- `internal-invoice-scope-hardening.test.ts` `56/56`
	- `financial-access.test.ts` `9/9`
	- `npx.cmd tsc --noEmit` passed
	- `git diff --check` clean
- Phase 6B-UI / 6C-prep implementation commit: `5ecbba727caae8ae7586617e164c3ff37eab1600`.
- Phase 6C is now closed. Next lane is Phase 6D (Stripe saved-method + autopay consent schema/model lock).

Phase 6D-C closeout (Saved Payment Method + Autopay Consent Schema/Model Lock, docs/model only):
- Phase 6D-C is a docs/model-only closeout. No implementation, migration, Stripe API call, sandbox mutation, production touch, or webhook behavior change is included in this phase.
- Locked additive schema surfaces:
	- `tenant_stripe_customers`
	- `tenant_customer_payment_methods`
	- `tenant_saved_payment_method_setups`
	- `tenant_customer_autopay_consents`
	- `tenant_saved_method_payment_attempts`
	- `tenant_stripe_event_receipts`
- Account-scope field lock:
	- `account_owner_user_id` must use the same account-owner column type already used by existing production tenant-owned tables
	- do not introduce text-vs-UUID drift in this lane
- Stripe vs Compliance Matters ownership remains explicit:
	- Stripe owns SetupIntent/Checkout setup mode, connected-account customer/payment-method objects, credential storage, authentication, PaymentIntent processing, and processor truth
	- Compliance Matters owns maintenance agreements, billing periods, internal invoices, consent, setup workflow records, attempt workflow records, internal payment truth, allocations, and later attention/retry workflow
- Saved-method model lock:
	- Compliance Matters stores only safe references and display-safe metadata (`stripe_connected_account_id`, Stripe customer id, Stripe payment method id, brand, last4, exp month/year, safe display status)
	- first implementation is card-first
	- ACH/bank fields are future/deferred display-safe metadata only; no ACH/bank-debit behavior is activated in this lock
	- Compliance Matters must never store full card number, CVC, raw bank/card credentials, Stripe secrets, client secrets, reusable raw tokens, or other reusable payment credentials
- Consent lock:
	- saved method present does not mean autopay enabled
	- autopay enabled requires explicit maintenance-agreement-scoped consent
	- consent lifecycle remains distinct: `disabled`, `enabled`, `paused`, `revoked`, `stale_or_invalid`
	- payment-method change or connected-account change can invalidate/pause consent; no silent carry-forward across merchant-context change
- Attempt/payment-truth boundary lock:
	- `tenant_saved_method_payment_attempts` is workflow/audit truth for manual saved-method and scheduled autopay attempts
	- attempt status may reflect submission/result correlation
	- invoice paid state and collected money truth remain only in `internal_invoice_payments` and allocation truth after webhook confirmation
	- manual charge actions and schedulers must never directly mark invoices paid
- Event-identity lock:
	- current payment-row event identity is not sufficient for setup/method/attempt lifecycle tracking
	- `tenant_stripe_event_receipts` is the additive event-receipt surface for setup success/failure, payment-method lifecycle events, off-session attempt outcomes, duplicate handling, and connected-account-context verification
- Failure/attention lock:
	- decline and `requires_action` outcomes create attention/workflow state, not collected money
	- no visit mutation and no `next_due_date` mutation are allowed from setup or payment outcomes
	- Stripe Billing Subscriptions remain out of scope for tenant recurring billing in this phase
- Next implementation lane after this docs-only closeout is Phase 6E (saved payment method setup flow).

### Phase 6E-C Closeout

- Phase 6E-C — Saved Card Setup Flow / Stripe Checkout Setup Mode
- Status: complete in sandbox and committed/pushed to origin/main. Commit: `ee5c5ea4ceef7427e501b650f67eed1555b21642`
- Implemented behavior: customer profile now supports a saved-card setup flow using Stripe Checkout setup mode; Stripe owns card/payment credential collection and storage; Compliance Matters stores only Stripe references and display-safe metadata; setup writes to `tenant_stripe_customers`, `tenant_saved_payment_method_setups`, `tenant_customer_payment_methods`, and `tenant_stripe_event_receipts`; setup rows persist `stripe_checkout_session_id`, `stripe_setup_intent_id`, and `stripe_payment_method_id`; saved-card display uses safe metadata only (`brand`, `last4`, `expiration`, `status/default flag`)
- Sandbox smoke evidence: the setup flow completed through customer profile and Stripe Checkout; the setup row succeeded; the checkout session ID persisted correctly after constraint/redirect corrections; the payment method row was created with display-safe metadata; the webhook receipt processed; the customer returned to the customer profile with a success banner; no full card number, CVC, client secret, raw token, or credential material was stored or displayed
- Important correction captured: a runtime issue rejected valid Stripe Checkout Session IDs like `cs_test_...` because of an overly strict DB constraint; migration `20260527120000_fix_checkout_session_id_constraint.sql` fixed that constraint; redirect handling was corrected so the server-action redirect is not swallowed by `try/catch`; final smoke confirmed `stripe_checkout_session_id` is persisted end-to-end
- Boundaries preserved: no autopay enablement; no card charge attempt; no Stripe PaymentIntent money movement; no Stripe Billing Subscriptions; no `internal_invoice_payments` rows created; no `internal_invoice_payment_allocations` rows created; no invoice paid/balance mutation; no invoice issue/send/email/payment-link behavior; no `tenant_customer_autopay_consents` row created or enabled; no `tenant_saved_method_payment_attempts` row created; no `maintenance_agreement_visits` mutation; no `maintenance_agreements.next_due_date` mutation; no customer portal behavior added
- Validation recorded: Vitest matrix passed 113/113 across 9 files; `npx.cmd tsc --noEmit` passed; `git diff --check` passed; commit was pushed and remote-synced
- Next phase: Phase 6F — Manual Charge Saved Payment Method for an issued invoice. 6F must use attempt rows before calling Stripe and keep webhook-confirmed `internal_invoice_payments` as the collected-money truth; scheduled autopay remains deferred

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
