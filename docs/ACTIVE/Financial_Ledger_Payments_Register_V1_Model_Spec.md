# Financial Ledger / Payments Register V1 Model Spec

Status: ACTIVE MODEL LOCK
Owner lane: Financial Ledger / Payments Register V1
Scope: docs/model only. No schema, migration, Supabase, Stripe, QBO, env, production, recurring billing, platform fee, or ACH UI work is authorized by this spec.

## Phase 6J-A Note (Platform Application Fee Foundation)

- A foundation helper now locks default platform application fee math to `25` basis points (`0.25%`) with explicit skip guards and rounding behavior.
- This model note does not authorize payment register mutation, allocation mutation, invoice truth mutation, or Stripe create-call mutation in this phase.
- Register truth boundaries remain unchanged: collected-money truth is still webhook-confirmed `internal_invoice_payments`; allocation truth remains `internal_invoice_payment_allocations`; failed rows remain non-collected.

## Phase 6J-E2 Note (Platform Application Fee Wiring + Smoke Closeout)

- Phase A/B foundation is complete with default fee policy locked to `25` basis points (`0.25%`).
- Phase C wiring is complete for invoice Checkout application fee.
- Phase D wiring is complete for shared saved-card/manual plus scheduled-autopay PaymentIntent submit path.
- Phase E/E2 sandbox smoke is complete for current intended scope:
- Checkout path: `1750` cents gross charge with `4` cents application fee.
- Saved-card/manual path: `1750` cents gross charge with `4` cents application fee.
- Register model lock remains unchanged: platform application fee is Stripe/platform revenue only and does not create customer-facing surcharge line items.
- Collected-money projection lock remains unchanged: invoice paid/balance truth remains gross-payment-derived with no paid/balance distortion.
- Failed-payment lock remains unchanged: failed rows remain non-collected and must not inflate collected totals.
- Operational lock remains unchanged: no visit mutation and no next-due-date mutation.
- Deferred lock remains unchanged: refunds/disputes deferred, ACH deferred, customer payment success redirect polish deferred.
- Current UX sequencing note: invoice page UX cleanup is next lane; customer page IA/UX cleanup follows.
- Closeout constraints remain satisfied: no production Stripe action and no schema change.

## Phase 6F-C Closeout (Manual Saved-Card Charge for Issued Invoice)

- Closed implementation commit: `f7fa23fca188029a9a6f38e152a83180b346606e` (`feat(payments): charge saved card manually for issued invoice`), pushed with `HEAD == origin/main` and clean tree.
- Manual saved-card charge for issued invoices is now implemented as one-time internal action and remains explicitly outside autopay/subscription scope.
- Register-truth lock is preserved: `tenant_saved_method_payment_attempts` rows are workflow/audit truth only; webhook-created `internal_invoice_payments` rows are collected-money truth; allocation row creation occurs after payment truth exists.
- Attempt resolution now links to payment truth via internal payment id after webhook-confirmed success.
- Fresh sandbox smoke proof: invoice `INV-20260528-1CFFCB88` (`7f79e75b-06b5-4924-bd0c-91b78740f2d7`), attempt `99949838-81f3-442a-9de1-4bc736b4c40b`, payment `3788c9ff-700d-43ab-8339-46e4cbf24ae3`, allocation `2b702b07-690a-4e4d-82f2-6f6ed6e40627`, charge `ch_3Tbxg47itDepDR180C1KhPco`, amount `$17.50`, webhook HTTP 200, and UI Paid / Balance `$0.00`.
- Verified non-actions: no `tenant_customer_autopay_consents` row creation, no maintenance-visit or next-due mutations, no Stripe Billing subscription behavior, and no ACH/bank-debit behavior.
- Validation proof: `npx.cmd tsc --noEmit` passed; targeted Vitest matrix passed (8 files, 100 tests); `git diff --check` passed; temp `_tmp_*` files removed; no docs/migrations/env/secrets were included in implementation commit.

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

### Phase 6I-A Closeout (Failed Payment Alert + Reconciliation Queue Model Lock, Docs-Only)

- Scope lock: docs/audit/model only. No code changes, migrations, sandbox/production mutation, Stripe actions, read-model implementation, alert-card implementation, or queue implementation.
- Preflight lock: branch is clean and synced (`HEAD == origin/main`) at `10aa8983645b59f46f3a5a969f79298b9694b756`; latest commit on branch is `polish(tests): standardize mobile ECC console layout`.
- History/docs reconciliation: commit grep for `docs(payments): close failed autopay retry smoke` is empty, but failed-autopay retry closeout is clearly reflected in ACTIVE docs (6H-B/6H-C/6H-D/6H-E6 sections).

Failed-payment attention definition (V1 open):
- `tenant_saved_method_payment_attempts.attempt_kind = scheduled_autopay`.
- `attempt_status` in `failed_declined`, `failed_requires_action`, or meaningful `blocked_precondition`.
- not resolved by `resolved_internal_invoice_payment_id`.
- not terminal closed by `succeeded` or `abandoned`.
- queue relevance should prefer invoice still issued/non-void with positive balance due.

Visibility rule:
- Failed payments must not occur silently.
- Invoice-level attention already exists, but account-level/operator-level failed-payment visibility is required before production-grade autopay rollout.

Source-of-truth lock (unchanged):
- `tenant_saved_method_payment_attempts` = attempt/attention truth.
- `internal_invoice_payments` = payment-event truth.
- `internal_invoice_payment_allocations` = allocation truth.
- Stripe = processor/payment-method truth.
- invoice paid/balance = projection from collected payment truth only.
- visits and `maintenance_agreements.next_due_date` remain operational truth and are not payment-mutated.
- failed payment rows are non-collected truth.
- inactive allocations do not count toward paid balance.

Recommended V1 alert surface:
- Owner/Admin/Billing-only failed-payment attention card on Ops or admin/dashboard surface.
- show open failed-payment count and category/severity breakout when practical.
- link to dedicated reconciliation queue.
- rationale: Ops/admin is daily operational control plane; Payments Register remains payment-event truth but not attempt-attention truth.

Recommended V1 reconciliation queue shape:
- separate from Payments Register.
- read-model-backed from attempt truth with invoice/payment enrichment.
- row fields: customer, invoice number, balance due, failure category, failure reason, last attempt time, retry eligibility, recommended action, invoice workspace link.
- V1 actions: open invoice workspace, open customer, copy failure context; retry remains invoice-workspace action.
- `mark acknowledged/reviewed` remains deferred unless explicitly approved later.

Deferred items:
- failed-payment email notifications.
- failed-payment SMS notifications.
- portal update-card flow.
- customer self-service retry.
- automated retry scheduling/policies.
- successful retry-settlement smoke unless safely executable through sanctioned saved-card flows.
- `payment_intent.payment_failed` routing unless explicitly approved in this phase.

Known risks/blockers:
- scheduled-autopay close semantics are not fully explicit in current write paths; read model closure expects `resolved_internal_invoice_payment_id` or terminal status.
- current webhook resolver appears scoped to `manual_saved_method` attempts; scheduled-autopay resolution should be made explicit before queue close/resolution actions.
- `payment_intent.payment_failed` is not currently routed; failure truth currently relies on `charge.failed`.
- latest `HEAD` differs from expected failed-autopay docs-closeout commit message; docs/history reconciliation should be explicitly recorded when closing 6I-A.

Proposed implementation sequence:
- 6I-B: failed-payment reconciliation read model.
- 6I-C: Owner/Admin/Billing alert card.
- 6I-D: reconciliation queue UI.
- 6I-E: sandbox smoke + docs closeout.

### Phase 6I-E Closeout (Failed Payment Reconciliation Visibility, Docs-Only)

- 6I-B is complete: account-level failed-payment reconciliation read model is implemented and validated as read-only projection.
- 6I-C is complete: Ops failed-payment alert card is implemented for financial-authority visibility (Owner/Admin/Billing).
- 6I-D is complete: dedicated Failed Payment Reconciliation Queue route `/reports/failed-payments` is implemented and linked from Ops alert surface.
- 6I-E smoke is complete after correcting account context to the fixture owner account (Service Account).
- Proven visibility chain: failed-payment item appears in account-level read model -> Ops failed-payment alert is visible -> alert links to `/reports/failed-payments` -> queue displays failed-payment items -> queue links to invoice workspace -> invoice workspace shows detailed failed scheduled-autopay attention.
- Smoke evidence on fixture account: queue rendered open failed payments `2`, balance at risk `$35.00`, and two declined rows for invoice `INV-20260529-DDC200B6`; queue drill-in opened `/jobs/1a52288c-78ae-4e79-9472-d00ed928f32f/invoice` and showed issued/unpaid state plus Failed Scheduled Autopay Attention items.
- Read-only boundaries remain locked for alert and queue: no retry action on alert/queue, no acknowledge/review/resolve queue actions, no customer email/SMS, no portal update-card flow, and no customer self-service retry in this slice.
- Retry remains invoice-workspace-only behavior.
- Source-of-truth remains unchanged: `tenant_saved_method_payment_attempts` = attempt/attention truth; `internal_invoice_payments` = payment-event truth; `internal_invoice_payment_allocations` = allocation truth; Stripe = processor/payment-method truth; Payments Register remains payment-event history/reporting truth; Failed Payment Reconciliation Queue is unresolved attempt/attention visibility.
- Invoice paid/balance remains collected-payment projection only; failed payment rows are non-collected truth; inactive allocations do not count toward paid balance.
- Operational truth boundaries remain unchanged: visits and `maintenance_agreements.next_due_date` are not payment-mutated.
- No schema changes, no Stripe behavior changes, no production enablement change, and no payment/allocation truth mutation outside existing webhook behavior.

### Phase 6G-E4 Closeout (Fresh Scheduled Autopay Submit Smoke, Docs-Only)

- Phase 6G-E4 passed after the 6G-E3 self-attempt revalidation fix in commit `c7329a8a9b19d392f6dd7196ca7145f86d62e713`.
- Sandbox-only smoke used owner `9e82acca-c271-41bc-89af-396f37c1990c`, customer `ad18fa80-2817-476b-8fca-bdcf4ff3c3d6`, invoice `63e28e1c-1be9-43bb-923d-940d80887cb2` (`INV-20260528-9D731258`), job `91e31a74-cc1b-4585-8dc3-6812351fbbdf`, consent `3c24c9e6-6f78-4fe4-8619-9094782827bb`, and fresh pending attempt `67dc6700-83d9-4dd0-8af1-d8ae931db14a`.
- 6G-B returned the invoice eligible, 6G-C created the fresh pending scheduled_autopay attempt, and 6G-D submitted it successfully with Stripe PaymentIntent `pi_3Tc6bF7itDepDR181kf2LE2p`, charge `ch_3Tc6bF7itDepDR181J27CvPs`, and webhook event `evt_3Tc6bF7itDepDR181B08QHZd`.
- Webhook truth created exactly one `internal_invoice_payments` row and exactly one `internal_invoice_payment_allocations` row; invoice projection became paid with balance `$0.00`.
- UI verification after refresh showed Issued / Paid / Paid `$17.50` / Balance `$0.00` with one recorded Stripe payment row.
- Guardrails held: submit helper did not directly create payment or allocation rows, did not mark invoice paid, did not mutate visits or `next_due_date`, did not create invoice issue/send/email or payment-link side effects, and no production access occurred.
- No code changed during the smoke; all requested validation commands passed.
- Recommended next lane after this closeout is Phase 6G-F docs closeout, then Phase 6H failed-payment retry and attention workflow expansion.

- Scope lock: audit/model/planning only. No implementation, no migrations, no scheduler jobs, no Supabase mutation, no Stripe calls, no webhook behavior changes, and no commit authorization in this phase.

Source-of-truth lock:
- Scheduler = attempt orchestration truth only.
- Attempt table = workflow/audit truth only.
- `internal_invoice_payments` (webhook-confirmed) = collected-money truth.
- `internal_invoice_payment_allocations` = allocation truth.
- Stripe = processor/credential truth.
- No `maintenance_agreement_visits` mutation.
- No `next_due_date` mutation.
- Failed autopay = attention, not collected money.

Eligibility lock:
- issued and non-void invoice; balance due > 0.
- same account/customer/payment-profile/consent scope.
- linked billing period, if present, not cancelled.
- linked maintenance agreement, if present, active/autopay-eligible.
- active saved method + enabled valid consent.
- connected account ready and matching.
- no in-flight `scheduled_autopay` attempt for same invoice.
- enforce consent `max_amount_cents` when set.
- profile/method not stale/disconnected/invalid.
- re-check status/balance before submit.
- already-paid invoice blocks as `blocked_precondition`.

Scheduler trigger lock:
- first slice manual/internal runner with dry-run and commit modes.
- no cron in first slice.
- evaluate issued invoices only; exclude drafts.
- evaluate due-today and overdue first.
- batch by `account_owner_user_id` with per-account failure isolation.

Attempt lifecycle/idempotency lock:
- `attempt_kind = scheduled_autopay`.
- persisted statuses: `blocked_precondition`, `pending`, `submitted`, `succeeded`, `failed_declined`, `failed_requires_action`, `retry_scheduled`, `abandoned`.
- `eligible` remains dry-run/read-model output only (non-persisted).
- key format: `scheduled_autopay:account_owner_user_id:invoice_id:cycle_key:ordinal`.
- no duplicate pending/submitted/retry_scheduled per invoice/kind.
- no duplicate Stripe PaymentIntent per attempt.
- snapshot amount/balance at create and revalidate before submit.

Stripe charge model lock:
- reuse manual saved-card shared path.
- scheduler entry calls shared service with `scheduled_autopay` kind.
- PaymentIntent metadata: `account_owner_user_id`, `customer_id`, `invoice_id`, `attempt_id`, `billing_period_id`, `maintenance_agreement_id`.
- only pre-webhook transition allowed is `submitted`.
- `requires_action` -> `failed_requires_action`; declines -> `failed_declined`.
- payment rows are webhook-created only.

Retry/failure/attention lock:
- no auto-retry loop in first 6G implementation.
- `failed_declined` and `failed_requires_action` open attention.
- `requires_action` means customer re-authentication needed.
- failures do not block service visits and do not mutate `next_due_date`.
- `failed_requires_action` pauses further scheduled submissions for consent/agreement until resolved.
- manual operator retry precedes automated retry.

Reporting/visibility lock:
- attempt history remains separate from recorded payments.
- payments register must not blend failed attempts into collected totals.
- collected totals continue to derive from recorded payment truth only.

Security/access lock:
- Owner/Admin/Billing only for consent mutation, scheduler dry-run/commit-run, and retry submission.
- Dispatcher/Technician are read-only where allowed.
- server-side financial-access checks are required.

Dry-run lock:
- mandatory first implementation slice.
- report: invoices evaluated, eligible count, blocked count by reason, in-flight attempts, consent/method/profile/readiness flags, proposed amount snapshots, explicit no Stripe calls/no writes.
- commit mode is opt-in and separate.

Schema lock:
- no schema change required for 6G-B dry-run eligibility read model.
- no schema change strictly required for 6G-C attempt creation (`scheduled_autopay` and core statuses already exist).
- keep `eligible` non-persisted.
- optional future additive fields only: `scheduler_run_id`, `cycle_key`, `last_blocked_reason_at`.

Risks and blockers:
- race between eligibility and submit.
- duplicate attempts without strict idempotency.
- requires_action loop without pause gate.
- cross-tenant scheduler failure cascade.
- missing billing-period linkage for some invoices.
- attention UX gaps.

Recommended sequence:
1. 6G-B eligibility read model + dry-run tests only.
2. 6G-C scheduled attempt creation only.
3. 6G-D scheduled attempt submission through shared saved-card path.
4. 6G-E sandbox smoke.
5. 6G-F docs closeout.
6. 6H retry/attention expansion.

Execution confirmation:
- This is docs-only model lock; no implementation or data mutation occurred.

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
    - preconditions: issued invoice, non-void invoice, positive balance due, non-cancelled billing period, same-account customer/payment-method context, connected-account readiness, active saved method, and valid saved-method reuse authorization captured by the setup flow or an explicit one-time/manual-charge authorization record
    - charge initiation creates payment-attempt record
    - webhook remains sole collected-money truth
    - Stripe idempotency key basis = account + invoice + attempt ordinal
  - Scheduled autopay lock:
    - deferred until manual saved-method charge posture is proven; scheduled autopay still requires maintenance-agreement-scoped tenant_customer_autopay_consents
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

- **Phase 6C closeout (Billing Period Draft Invoice sandbox UI smoke) is now complete:**
  - Execution environment: sandbox ref `kvpesjdukqwwlgpkzfjm`; production ref `ornrnvxtwwtulohqwxop` was not active
  - Path used: real customer-profile UI generate control (no synthetic submit; no manual DB mutation)
  - Verified fixture scope:
    - customer `ad18fa80-2817-476b-8fca-bdcf4ff3c3d6`
    - agreement `454b3737-fa39-46be-8925-45131a571693`
    - billing period `0ee5a88a-2fb0-43ba-84c6-81ad8cc4f779`
    - anchor job `3c8d43ad-729c-4e39-a8e6-1d471a3aa692`
    - visit link `36265267-fbdb-4402-b1c7-c3e7aae3f746`
  - Baseline before submit:
    - billing period unlinked (`internal_invoice_id = null`) and `pending_billing`
    - amount `1950` cents, cadence `monthly`, coverage `2026-12-01` to `2026-12-31`
    - anchor active non-void invoice count `0`
    - agreement visit count `5`
    - agreement `next_due_date = 2026-09-15`
  - UI result:
    - Generate Draft Invoice rendered for eligible period
    - submit succeeded with success banner affirming draft-only/no issue-send-email-charge-payment-link behavior
  - Generated invoice verification:
    - invoice id `e2f20d3d-7f3c-4035-b44b-4f167d9d3d98`, number `INV-20260528-C655AA85`
    - `job_id = 3c8d43ad-729c-4e39-a8e6-1d471a3aa692`
    - status `draft`, `source_type = job`, total `1950`
    - `issued_at = null`, `sent_at = null`, `payment_link_url = null`, `stripe_payment_intent_id = null`
  - Generated line item verification:
    - line id `e0552fed-a8ec-48c6-b368-b91a8f176601`
    - quantity `1`, unit price `$19.50`, line total `$19.50`
    - deterministic description `Service Plan Billing Period (monthly): 12/01/2026-12/31/2026`
  - Billing-period post-state:
    - `internal_invoice_id = e2f20d3d-7f3c-4035-b44b-4f167d9d3d98`
    - `billing_period_status = invoice_linked`
  - Duplicate guard verification:
    - generate control no longer rendered for linked period
    - linked state showed invoice reference and `Unlink Invoice`
    - no forced duplicate submit
    - invoice count moved `0 -> 1` only; line-item count moved `0 -> 1` only
  - No-side-effect verification:
    - no new `internal_invoice_payments` rows
    - no new `internal_invoice_payment_allocations` rows
    - no Stripe behavior and no payment link
    - no `maintenance_agreement_visits` mutation (count remained `5`)
    - no `next_due_date` mutation (remained `2026-09-15`)
    - invoice workspace showed Draft, 1 charge, $19.50, Unpaid, with no paid/payment-link state
  - Validation remained green:
    - `billing-period-actions.test.ts` `22/22`
    - `billing-period-read-model.test.ts` `9/9`
    - maintenance-agreements suite `111/111`
    - `customer-detail-page-wiring.test.ts` `12/12`
    - `internal-invoice-scope-hardening.test.ts` `56/56`
    - `financial-access.test.ts` `9/9`
    - `npx.cmd tsc --noEmit` passed
    - `git diff --check` clean
  - Phase 6B-UI / 6C-prep implementation commit recorded: `5ecbba727caae8ae7586617e164c3ff37eab1600`
  - Phase 6C is now closed; next lane is Phase 6D (Stripe saved-method + autopay consent schema/model lock)

- **Phase 6D-C closeout (Saved Payment Method + Autopay Consent schema/model lock) is now complete (docs/model only):**
  - No implementation, migration, Stripe API call, sandbox mutation, production touch, or webhook behavior change occurred in this phase
  - Locked additive schema surfaces:
    - `tenant_stripe_customers`
    - `tenant_customer_payment_methods`
    - `tenant_saved_payment_method_setups`
    - `tenant_customer_autopay_consents`
    - `tenant_saved_method_payment_attempts`
    - `tenant_stripe_event_receipts`
  - `account_owner_user_id` lock: use the same account-owner column type already used by existing production tenant-owned tables; do not introduce text-vs-UUID drift
  - Saved-method storage lock:
    - first implementation remains card-first
    - ACH/bank attributes remain future/deferred display-safe metadata only; no ACH/bank-debit behavior is activated
    - Compliance Matters stores only safe references/display metadata and never stores full card number, CVC, raw bank/card credentials, Stripe secrets, client secrets, or reusable payment credentials
  - Consent lock:
    - saved method present does not imply autopay enabled
    - autopay enabled requires explicit maintenance-agreement-scoped consent
    - consent lifecycle remains distinct: `disabled`, `enabled`, `paused`, `revoked`, `stale_or_invalid`
  - Attempt/payment-truth boundary lock:
    - `tenant_saved_method_payment_attempts` is workflow/audit truth
    - attempt status may reflect submission/result correlation
    - invoice paid state and collected money truth remain only in `internal_invoice_payments` and allocation truth after webhook confirmation
    - manual charge actions and schedulers must never directly mark invoices paid
  - Event identity lock:
    - `tenant_stripe_event_receipts` is the additive event-receipt surface for setup outcomes, payment-method lifecycle events, off-session attempt outcomes, duplicate handling, and connected-account-context verification
    - existing payment-row event identity remains valid for collected-money truth but is not sufficient alone for setup/method/attempt lifecycle tracking
  - Failure/attention and operational locks:
    - decline and `requires_action` outcomes create attention/workflow state, not collected money
    - no `maintenance_agreement_visits` mutation
    - no `next_due_date` mutation
    - no Stripe Billing Subscriptions for tenant recurring billing now
  - Next lane after this docs-only lock is Phase 6E (saved payment method setup flow)

  ### Phase 6E-C Closeout

  - Phase 6E-C — Saved Card Setup Flow / Stripe Checkout Setup Mode
  - Status: complete in sandbox and committed/pushed to origin/main. Commit: `ee5c5ea4ceef7427e501b650f67eed1555b21642`
  - Implemented behavior: customer profile now supports a saved-card setup flow using Stripe Checkout setup mode; Stripe owns card/payment credential collection and storage; Compliance Matters stores only Stripe references and display-safe metadata; setup writes to `tenant_stripe_customers`, `tenant_saved_payment_method_setups`, `tenant_customer_payment_methods`, and `tenant_stripe_event_receipts`; setup rows persist `stripe_checkout_session_id`, `stripe_setup_intent_id`, and `stripe_payment_method_id`; saved-card display uses safe metadata only (`brand`, `last4`, `expiration`, `status/default flag`)
  - Sandbox smoke evidence: the setup flow completed through customer profile and Stripe Checkout; the setup row succeeded; the checkout session ID persisted correctly after constraint/redirect corrections; the payment method row was created with display-safe metadata; the webhook receipt processed; the customer returned to the customer profile with a success banner; no full card number, CVC, client secret, raw token, or credential material was stored or displayed
  - Important correction captured: a runtime issue rejected valid Stripe Checkout Session IDs like `cs_test_...` because of an overly strict DB constraint; migration `20260527120000_fix_checkout_session_id_constraint.sql` fixed that constraint; redirect handling was corrected so the server-action redirect is not swallowed by `try/catch`; final smoke confirmed `stripe_checkout_session_id` is persisted end-to-end
  - Boundaries preserved: no autopay enablement; no card charge attempt; no Stripe PaymentIntent money movement; no Stripe Billing Subscriptions; no `internal_invoice_payments` rows created; no `internal_invoice_payment_allocations` rows created; no invoice paid/balance mutation; no invoice issue/send/email/payment-link behavior; no `tenant_customer_autopay_consents` row created or enabled; no `tenant_saved_method_payment_attempts` row created; no `maintenance_agreement_visits` mutation; no `maintenance_agreements.next_due_date` mutation; no customer portal behavior added
  - Validation recorded: Vitest matrix passed 113/113 across 9 files; `npx.cmd tsc --noEmit` passed; `git diff --check` passed; commit was pushed and remote-synced
  - Next phase: Phase 6F — Manual Charge Saved Payment Method for an issued invoice. 6F must use attempt rows before calling Stripe and keep webhook-confirmed `internal_invoice_payments` as the collected-money truth; scheduled autopay remains deferred

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
