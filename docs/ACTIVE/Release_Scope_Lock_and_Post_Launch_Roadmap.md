# Compliance Matters — Release Scope Lock and Post-Launch Roadmap

Status: ACTIVE planning packet  
Mode: Documentation/planning only  
Authority: Subordinate to Active Spine and existing ACTIVE runbooks/roadmaps  
Date: 2026-05-08

## Payments / Deposits Reporting Foundation Closeout

- Status: CLOSED for current reporting foundation.
- Local payment-return/update issue was confirmed as local Stripe CLI webhook forwarding not running, not a core payment bug.
- With webhook forwarding running locally, Checkout payment confirmation works through verified webhook handling as designed.
- Checkout complete now uses `Payment submitted` copy, returns to invoice/job with refresh-aware payment-return state, and no longer exposes a separate refresh link.
- Webhook-confirmed `internal_invoice_payments` plus allocation truth remain the only source for invoice paid/balance updates.
- Deposits reporting foundation is complete: settlement schema foundation, settlement upsert uniqueness repair, production migration apply/verification, read-only Deposits report, payout/detail drilldown, summary/detail CSV exports, report dashboard discoverability for financial users, and owner-facing copy polish.
- Access posture is locked: Owner/Admin/Billing can discover and open Deposits; Technician/Dispatcher do not see the Deposits entry where role context is available and remain blocked on direct URL access.
- No sync controls are exposed in the UI, and reports/deposits adds no Stripe calls, payment links, invoice/payment/allocation mutation, settlement mutation, QBO behavior, refunds, disputes, or calculation changes.
- Remaining future gate is controlled production money-flow proof: one real/live paid invoice or existing paid production invoice, one scoped settlement sync, Stripe Dashboard gross/fee/net comparison, Deposits report/detail/CSV verification, and payout/bank deposit confirmation when available. This is a future evidence gate, not an unresolved blocker to the current reporting foundation.

## ECC/Test Workflow Maturity Closeout

- Status: CLOSED — implemented, smoked by owner, and ready as current ECC field-entry standard.
- Focused closeout: [ECC_Test_Workflow_Maturity_Closeout.md](./ECC_Test_Workflow_Maturity_Closeout.md).
- Completed current-scope maturity pass for Duct Leakage, Airflow, Refrigerant Charge, Completion Report, and the main ECC test hub/matrix.
- Current ECC test-entry standard is now field-first and mobile-friendly: clear test title, Exception first, reason required only when exception is selected, setup/context collapsed by default, one compact Results area, inline live calculated feedback, no duplicate dashboard/result cards, no side-by-side mobile field entry, and Complete Test returning to the job detail test section.
- Completion Report is now treated as a print-first report surface, with Print, Back, and Download controls preserved while workspace/test-entry clutter is suppressed.
- Main ECC test hub/matrix is simplified: redundant Test Queue button removed, Report renamed to Completion Report, Equipment preserved, and multi-system switching surfaced as direct chips.
- Guardrails remained intact: no schema/RLS changes, no payment/Stripe/QBO/SMS/provider changes, no invoice/payment/cert closeout truth changes, no ECC evaluator/formula changes, no customer portal behavior, no photo/attachment enforcement, and no broader service workflow change.
- Known model note: exception handling uses existing override/exception-compatible plumbing rather than a dedicated ECC exception truth model; a dedicated truth model remains future optional work only if field use requires deeper reporting/audit semantics.

## Phase 6J-E2 Closeout (Platform Application Fee Lane, Docs-Only)

- Platform application fee lane is closed for current intended scope.
- Phase A/B foundation is complete with default fee policy locked to `25` basis points (`0.25%`).
- Phase C checkout wiring is complete.
- Phase D shared PaymentIntent wiring is complete for saved-card/manual and scheduled-autopay submit path.
- Phase E/E2 sandbox smoke is complete:
- Checkout smoke: `1750` cents gross with `4` cents application fee.
- Saved-card/manual smoke: `1750` cents gross with `4` cents application fee.
- Release-scope truth lock remains unchanged: app payment truth remains gross customer payment truth.
- Platform fee remains Stripe/platform revenue only and is not a customer-facing surcharge line item.
- No invoice paid/balance distortion was introduced.
- Failed payments remain non-collected.
- No visit or next-due-date mutation was introduced.
- Deferred lanes remain unchanged: refunds/disputes deferred and ACH deferred. Customer payment success redirect polish is complete for the current Checkout return screen; webhook confirmation remains the source of payment truth.
- Next roadmap UX sequencing remains: invoice page UX cleanup next, customer page IA/UX cleanup follows.
- Safety constraints satisfied for this closeout: no production Stripe action and no schema change.

## Phase 6F-C Closeout (Manual Saved-Card Charge for Issued Invoice)

- Phase 6F implementation is closed in commit `f7fa23fca188029a9a6f38e152a83180b346606e` (`feat(payments): charge saved card manually for issued invoice`) with push complete and post-push clean tree.
- Delivered behavior: manual one-time saved-card charge control for eligible issued invoice workspace; explicitly not autopay and no subscription creation.
- Locked truth boundaries remain unchanged: manual attempt row (`tenant_saved_method_payment_attempts`) is workflow/audit truth; webhook-created `internal_invoice_payments` is collected-money truth; allocation follows payment truth.
- Fresh sandbox smoke proof: invoice `INV-20260528-1CFFCB88` (`7f79e75b-06b5-4924-bd0c-91b78740f2d7`), attempt `99949838-81f3-442a-9de1-4bc736b4c40b`, payment `3788c9ff-700d-43ab-8339-46e4cbf24ae3`, allocation `2b702b07-690a-4e4d-82f2-6f6ed6e40627`, charge `ch_3Tbxg47itDepDR180C1KhPco`, amount `$17.50`, webhook HTTP 200, UI post-state Paid / Balance `$0.00`.
- Release-scope guardrails verified: no `tenant_customer_autopay_consents` creation, no `maintenance_agreement_visits` mutation, no `maintenance_agreements.next_due_date` mutation, no Stripe Billing subscription behavior, and no ACH/bank-debit behavior.
- Validation closeout: TypeScript no-emit pass, targeted Vitest matrix pass (8 files, 100 tests), `git diff --check` pass, `_tmp_*` cleanup confirmed.

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

- Scope lock: audit/model/planning only. No implementation, migrations, scheduler jobs, Supabase mutation, Stripe calls, webhook behavior changes, or commit authorization.

Model/source-of-truth lock:
- Scheduler controls attempt orchestration only.
- Attempt table is workflow/audit truth only.
- Webhook-confirmed `internal_invoice_payments` remains collected-money truth.
- `internal_invoice_payment_allocations` remains allocation truth.
- Stripe remains processor/credential truth.
- No service visit mutation and no `next_due_date` mutation.
- Failed scheduled autopay yields attention, not collected money.

Eligibility lock:
- issued/non-void invoice with positive balance due.
- same account/customer/payment-profile/consent scope.
- linked billing period not cancelled (if linked).
- linked maintenance agreement active/autopay-eligible (if linked).
- active saved method and enabled valid consent.
- connected account ready and matching.
- no in-flight `scheduled_autopay` attempt for same invoice.
- respect consent max amount when configured.
- profile/method not stale/disconnected/invalid.
- revalidate invoice status/balance before submit.
- already-paid invoice blocks as `blocked_precondition`.

Scheduler trigger lock:
- first slice is manual/internal runner with dry-run + commit modes.
- no cron in first slice.
- issued invoices only; drafts excluded.
- due-today and overdue evaluated first.
- batched by `account_owner_user_id` with per-account failure isolation.

Attempt lifecycle/idempotency lock:
- `attempt_kind = scheduled_autopay`.
- statuses: `blocked_precondition`, `pending`, `submitted`, `succeeded`, `failed_declined`, `failed_requires_action`, `retry_scheduled`, `abandoned`.
- `eligible` remains non-persisted dry-run/read-model output only.
- idempotency key: `scheduled_autopay:account_owner_user_id:invoice_id:cycle_key:ordinal`.
- no duplicate pending/submitted/retry_scheduled attempt by invoice/kind.
- no duplicate Stripe PaymentIntent per attempt.
- amount/balance snapshot at create + revalidation before submit.

Stripe charge model lock:
- reuse shared manual saved-card charge path.
- scheduler entry calls shared service with `scheduled_autopay`.
- PaymentIntent metadata includes account/customer/invoice/attempt/billing_period/maintenance_agreement identifiers.
- only pre-webhook transition allowed: `submitted`.
- requires_action -> `failed_requires_action`; decline -> `failed_declined`.
- payment rows are webhook-only writes.

Retry/failure/attention lock:
- no automatic retry loop in first 6G implementation.
- failed statuses open attention.
- requires_action requires customer re-authentication.
- failures do not block service visits and do not mutate due-date progression.
- `failed_requires_action` pauses further scheduled submissions for same consent/agreement until resolved.
- manual retry precedes automated retry.

Reporting/security/dry-run/schema lock:
- attempt history is separate from payment register collected totals.
- collected totals remain driven by recorded payment truth only.
- consent/scheduler/retry actions restricted to Owner/Admin/Billing with server-side checks.
- dry-run is mandatory first slice and must emit evaluated/eligible/blocked/in-flight and snapshot flags with explicit no Stripe/no writes.
- no schema change required for 6G-B/6G-C base slices; keep `eligible` non-persisted; optional future additive fields only (`scheduler_run_id`, `cycle_key`, `last_blocked_reason_at`).

Risks and sequence lock:
- key risks: eligibility-submit race, duplicate attempts, requires_action loops, cross-tenant failure cascades, missing billing-period linkage, attention UX gaps.
- sequence: 6G-B read model dry-run -> 6G-C attempt creation only -> 6G-D submission via shared path -> 6G-E sandbox smoke -> 6G-F docs closeout -> 6H retry/attention expansion.

Execution confirmation:
- Docs-only model lock closeout; no implementation or data mutation occurred.

---

## 1) Executive Summary

This packet locks current owner-release scope and defines a practical post-launch order.

Current release posture is confirmed as:
- ECC/HERS-first go-to-market
- HVAC Service-ready foundation on the same shared platform engine
- no codebase split
- no customer portal in current release scope
- contractor external access remains the current external model
- no product-mode switch implementation required before owner-release

Completion quality across the owner-release stack is high and coherent. Recent notification sanity returned pass with no must-fix blockers. Remaining deferred items are intentional and runbook-gated where applicable.

True App / PWA V1 is now complete for controlled rollout use. Device setup combines install or add-to-phone guidance with per-device notifications in one setup surface, while login continuity, update-safe refresh, service-worker update-failure handling, Today/Ops first-action clarity, revenue workflow rail clarity, calendar mobile control compression, and admin Day 1 essentials are complete. Controlled rollout support/feedback remains direct-to-owner for now, and deferred lanes remain parked.

This packet therefore recommends:
- lock current owner-release scope as complete for current quality bar,
- keep deferred work deferred,
- use runbooks for controlled enablement only,
- start with Support V0 plus controlled onboarding,
- sequence post-launch roadmap in low-risk dependency order.

## Future Lane - Workflow Presets / Operational Flow Templates (Deferred)

Status: Deferred planning lane only (not current functionality).

Purpose:
- define future guided operational lifecycle flows for repeatable multi-step service processes without changing current truth ownership.

Example future paths:
- Install -> Permit -> ECC Test -> Final Inspection -> Closeout
- service-plan maintenance lifecycle
- multi-visit corrective workflows
- future cross-account ECC handoff lifecycle

Core principles (lock):
- milestone-driven, not rigid scheduler-driven
- jobs/events/history remain source-of-truth
- presets provide guidance and continuity, not hidden automation
- operators can pause, branch, override, or manually complete steps
- future completion posture must support internal, external, and linked-account paths

Explicit non-goals for first posture:
- no auto-dispatch engine
- no AI scheduling
- no forced workflow lock
- no hidden lifecycle mutation
- no marketplace/payment dependency
- no customer-facing workflow automation requirement

Future sequencing guidance:
1. Workflow preset foundation
2. External ECC completion mode
3. Internal linked ECC completion mode
4. Cross-account handoff lifecycle
5. Optional workflow-summary/read-model layer

Foundation dependencies already in place:
- job event/timeline foundation
- linked operational continuity groundwork
- maintenance/service-plan groundwork
- closeout operational projection posture
- payment/source-of-truth discipline

Deferred-until trigger:
- additional field usage,
- broader production/customer feedback,
- stabilized post-launch operational patterns.

Recent closeout status snapshot (May 2026):
- Time Clock / Team Time Tracking lane is complete for current intended scope (V1 through V1.5A).
- Completed Time Clock scope includes: account and per-user controls, consolidated internal-user list controls, employee `/time-clock` runtime actions, Ops Team Clock Status card, admin `/ops/admin/time-clock` review/correction center, correction controls for all admin entries with required reason and audit fields, rolling 7-Day review, and Report Center history/export.
- Source-of-truth boundary remains explicit: dedicated durable timekeeping table owns timecard truth; `job_events` remains narrative/timeline truth.
- Latest reporting/export closeout commit: `3f81c71`.
- Boundary confirmation: no delete/reset behavior, no payroll engine, no wage/overtime calculations, no GPS/geofencing, no job-costing behavior, no contractor/customer portal time tracking, and no QBO/payroll sync behavior were added.
- Closed and treated as complete for this pass: Dedicated Closeout Queue V1, Calendar Work Context/Includes display, Job Detail Command Center polish, External Billing one-click closeout UX, Internal Invoice Workspace V1, internal invoice send workflow clarity, premium internal invoice email template, internal invoice Print / Save PDF view, premium appointment scheduled email template, appointment email company header polish, Ops tenant logo polish, ECC subcool tolerance change to +/-3F, and Pricebook naming cleanup (`Diagnostic Fee` -> `Diagnostic`).
- Estimates Section 2K closeout is complete for this pass: proposal email delivery/customer approval lane is closed (provider-backed proposal email send smoke passed, public proposal-link approval smoke passed, internal approval-notification smoke passed, active-link regeneration fallback smoke passed, Customer Delivery deployed UI smoke passed, and local preview-mode smoke passed with `.tmp/email-outbox` output and no real email send). Token safety is verified (raw token/token_hash not persisted in events, communications, or notification payloads). Explicit non-actions remain: no SMS/text proposal delivery, no payment collection from proposal, no QBO behavior, no invoice issue/send behavior from proposal approval, no automatic job conversion, no automatic invoice conversion, no customer portal login dependency, no e-signature/legal artifact model, and no live SMS behavior.
- Confirmed boundaries remain intact: Invoice Charges remain billed truth, Work Items/Visit Scope remain operational work scope, external billing remains lightweight invoice-sent tracking, internal invoicing remains internal/admin only, payment truth is owned by `internal_invoice_payments` (manual plus Stripe webhook-confirmed rows), and Closeout Queue V1 continues to use existing closeout projection truth.
- Optional internal billing boundary is now explicit: operational work (jobs/work orders/service plans/maintenance visits/visit counts/next-due workflows) must not require internal invoice/payment attachment; internal billing/payment is optional by billing posture (`billing_mode`), tenant setup, and future service-plan billing configuration; external/off-platform tenants remain fully operational without internal payment rows; payment status may drive warnings/reporting but must not hard-block first-posture operations unless explicitly designed later; payment truth must not attach directly to `maintenance_agreement_visits`; and future Service Plan Billing Period posture must support internal invoice-backed, external/off-platform, manual, no-charge, waived, and not-billed-through-Compliance-Matters paths.
- Parked follow-up remains parked: Closeout Queue V2 waits until the owner uses V1 and gives feedback, contact recipient write/edit workflow remains deferred unless field use proves need, SMS/provider-powered messaging remains behind the existing gates, and the Payments V2 deferred register covers refunds, disputes, saved cards, partial payments, receipt messaging, public payment portal, platform application fees, ACH, and QBO sync.
- Financial Ledger / Payments Register V1 model lock is now documented in [Financial_Ledger_Payments_Register_V1_Model_Spec.md](./Financial_Ledger_Payments_Register_V1_Model_Spec.md): current `internal_invoice_payments` remains invoice-bound collected-payment truth, while future bookkeeping-ready work must introduce register/allocation semantics before recurring billing or deeper financial dashboards.
- Payments V2 / Service Plan Billing Foundation Phase 2 model lock is now documented in [Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md](./Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md): first Service Plan Billing posture is billing-period commercial truth linked to normal internal invoices and existing invoice payment truth, with automation/autopay/subscriptions deferred.
- Service Role Controls / Financial Access Controls V1A-2, V1A-3, and V1A-4 are now implemented in [Service_Role_Controls_and_Financial_Access_V1_Model_Spec.md](./Service_Role_Controls_and_Financial_Access_V1_Model_Spec.md): Billing / AR is now implemented as a valid internal role; sensitive financial authority is Owner/Admin/Billing; dispatcher/office, technician, contractor/portal users, inactive users, and unauthenticated users are blocked by default; and sensitive server-side financial actions are gated for manual invoice payment recording, tenant payment-link/checkout-session creation, invoice ledger CSV export, invoice draft create/update, invoice issue, invoice void, and invoice email send/resend.
- **Payments Register V1A/V1B are now implemented (commit `c9dc763`):**
   - V1A read-only register: `/reports/payments` with Owner/Admin/Billing gating, recorded/failed separation, method taxonomy (ACH hidden), filters, stat cards
   - V1B CSV export: `/reports/payments/export` with financial-export gating, filter preservation, status field for failed identification, proper escaping
   - Access gates use existing financial-access helper (`canExportFinancialData()`, `canViewFinancialRegister()`)
   - Register reads from `internal_invoice_payments` current truth only; no mutations, corrections, allocations, schema changes, Stripe/Supabase/prod changes
   - Remaining deferred: payment recording UI, corrections, allocations, dashboard financial cards, QBO sync, ACH, platform fees, recurring billing

- **Payments Register V1C (Customer Profile Payment History) is now implemented and browser smoke passed (commit `55dab8c`):**
   - V1C customer profile payment history: `/customers/{id}` Payment History card section (read-only)
   - Access remains Owner/Admin/Billing only via existing financial-access helper; Dispatcher/Technician/Contractor/Portal users are blocked by default
   - Reads from `internal_invoice_payments` scoped to account + customer (current truth only)
   - Recorded payments, failed attempts, and other statuses remain visibly separated for authorized users
   - Per-payment details: amount (bold), status+method badges (colored), date, invoice #, job link, reference, notes
   - Open Payments Register link is confirmed to open full `/reports/payments` with customer filter
   - Full register recorded/failed separation and CSV export remain available
   - ACH remains hidden/mapped to `other`
   - No mutations, corrections, allocations, profile CSV export, schema changes, Stripe/Supabase/prod changes
   - Remaining deferred: register-based payment recording/corrections, payment allocations, broader financial dashboard cards, QBO, ACH, platform fees, recurring billing, customer portal payment history

- **Payments Reversal / Correction Foundation (Phase 3A) is now implemented in current sandbox closeout (commit pending):**
   - Additive schema only: `internal_invoice_payments` now includes `reversed_at`, `reversed_by_user_id`, and `reversal_reason`
   - Manual/off-platform recorded rows can be reversed by authorized financial users only (Owner/Admin/Billing) with required reason
   - Failed and already-reversed rows are blocked from reversal
   - Stripe/online rows are read-only in this correction flow; no refund/dispute/provider API behavior was added
   - Reversal is non-destructive: original rows are preserved and status/audit fields are updated
   - Invoice paid/balance and register collected totals remain recorded-only; reversed rows do not count as collected money
   - Deferred register remains unchanged: allocations, service-plan billing periods execution, customer portal, QBO, ACH, refunds/disputes, saved cards/autopay, partial payments, receipt automation, platform-fee execution
- **Allocation Compatibility Foundation (Phase 4A) is now implemented as compatibility-only (`a0a2d23`):**
   - No allocation schema/table exists yet and no allocation rows are persisted
   - Existing invoice-bound projection now routes through allocation-compatible helper semantics only
   - Recorded rows remain collected truth; failed and reversed rows remain excluded from collected totals
   - Reports safety confirmed in this slice: register and invoice-ledger collected totals remain unchanged
   - No payment recording behavior, Stripe checkout/webhook behavior, Service Plan billing period behavior, `maintenance_agreement_visits`, portal, QBO, ACH, refunds/disputes, saved cards/autopay, or partial payments behavior changed
- **Allocation Schema Model Lock (Phase 4B, docs/model only) is now locked:**
   - First explicit table name: `internal_invoice_payment_allocations`
   - First source key: `source_internal_invoice_payment_id` referencing `internal_invoice_payments.id`
   - First target key: invoice-only `target_invoice_id`
   - `target_service_plan_billing_period_id` and customer-credit target columns remain future expansion only
   - First posture enforces one source payment to one invoice allocation via unique `source_internal_invoice_payment_id`
   - First allocation statuses are locked: `active`, `inactive`, `reversed`, `voided`
   - Counting lock: only `active` allocations count toward invoice collected totals
   - If a future `counts_toward_collected_totals` field exists, it must be omitted or constrained to status consistency (not independent truth)
- **Phase 4C boundary lock (next implementation slice):**
   - Additive table + RLS + indexes + tests only
   - No UI, no read-path/projection switch, no payment-recording changes
   - No Stripe checkout/webhook behavior changes
   - No Service Plan billing behavior changes
- **Phase 4C closeout (Explicit Invoice Payment Allocation Table Foundation) is complete (`20260526130000`):**
   - Additive table `internal_invoice_payment_allocations` is now present with invoice-only target and one-source-to-one-allocation uniqueness
   - Statuses are constrained to `active`, `inactive`, `reversed`, `voided`
   - `counts_toward_collected_totals` was intentionally not added; future countability remains status-derived (`active` only)
   - Account-scoped RLS SELECT/INSERT/UPDATE policies are in place; no DELETE policy
   - Source-payment and target-invoice account/scope alignment is enforced at write time for first-posture integrity
   - No backfill and no runtime allocation-row writes in this slice
   - No projection/read-path switch; invoice-bound payment truth remains unchanged
   - No UI/payment recording/Stripe checkout/webhook/Service Plan billing behavior changes were introduced
- **Phase 4D closeout (Allocation Population / Backfill / Write Strategy, docs/model only) is now locked:**
    - Allocation rows are locked to future one-to-one population from `internal_invoice_payments`
    - Allocation idempotency key is locked to `source_internal_invoice_payment_id`
    - Locked mapping: `recorded -> active`, `pending/failed -> inactive`, `reversed -> reversed`
    - `allocated_amount_cents` must preserve source `amount_cents` exactly, including signed/zero parity
    - `target_invoice_id` must equal source payment `invoice_id`
    - Failed/reversed source rows should still have allocation rows for lifecycle completeness, but remain non-counting
    - Projection remains on compatibility helper semantics until parity is proven
    - No projection/read-path switch is allowed yet
    - Backfill posture is locked to idempotent/retryable behavior
    - Runtime allocation writers are locked to centralized helper posture
    - Manual payment dual-write and Stripe webhook dual-write are locked as separate implementation slices
    - Historical backfill is locked to run after runtime write strategy is implemented/locked
    - Production dormant schema migration planning/apply requires explicit approval before any runtime writer ships
    - Locked safer implementation sequence:
       1. Phase 4E: production dormant migration planning/apply, explicit approval only
       2. Phase 4F: centralized allocation write helper foundation, not wired
       3. Phase 4G: manual payment dual-write
       4. Phase 4H: Stripe webhook dual-write
       5. Phase 4I: historical backfill plus parity checks
       6. Later phase: allocation read-path switch only after parity gate passes
- **Phase 4E closeout (Production Dormant Allocation Migration Catch-up) is complete:**
   - Production dormant schema catch-up completed on ref `ornrnvxtwwtulohqwxop`
   - Applied in production order:
      - `20260526110000_internal_invoice_payments_reversal_audit_foundation.sql`
      - `20260526130000_internal_invoice_payment_allocations_foundation.sql`
   - Verified reversal audit schema in production: `reversed_at`, `reversed_by_user_id`, `reversal_reason`, and reversal index on `internal_invoice_payments`
   - Verified allocation schema in production: required table/columns/constraints/indexes, RLS enabled, SELECT/INSERT/UPDATE policies present, no DELETE policy, and scope assertion trigger/function present
   - Verified forbidden/deferred columns absent: `counts_toward_collected_totals`, `target_service_plan_billing_period_id`, and customer-credit target fields
   - Verified allocation row count is `0`; no backfill was run
   - Runtime boundaries unchanged: no allocation writers, no projection/read-path switch, no payment recording/manual payment/Stripe checkout/webhook/UI behavior changes, and no Service Plan Billing/QBO/ACH/refunds/disputes/saved cards/autopay/partial payments/receipt automation/platform-fee/customer-portal/service-plan-automation behavior changes
- **Phase 4F closeout (Centralized Allocation Write Helper Foundation) is complete:**
   - Added centralized helper foundation to create/update one persisted allocation row from one `internal_invoice_payments` row
   - Helper uses `source_internal_invoice_payment_id` idempotency and invoice-only target posture
   - Implemented mapping remains locked: `recorded -> active`, `pending/failed -> inactive`, `reversed -> reversed`
   - Helper preserves source `amount_cents` exactly, including signed/zero parity
   - Helper is not wired into runtime payment flows yet
   - No manual payment dual-write yet
   - No Stripe webhook dual-write yet
   - No historical backfill
   - No projection/read-path switch
   - No UI/payment/manual/Stripe/webhook/checkout/Service Plan Billing/QBO/ACH/refunds/disputes/saved cards/autopay/partial payments/receipt automation/platform-fee/customer-portal/service-plan-automation behavior changes in this phase
   - Next slice remains Phase 4G manual payment dual-write, or a narrow Phase 4G-A helper smoke/parity pass if needed before runtime wiring
- **Phase 4G closeout (Manual Payment Dual-Write) is complete (manual/off-platform scope only):**
   - Manual/off-platform payment recording now invokes centralized allocation upsert and creates/updates allocation rows keyed by `source_internal_invoice_payment_id`
   - Manual payment reversal now invokes centralized allocation upsert after payment row reversal and transitions allocation status to `reversed`
   - Payment row remains authoritative; allocation dual-write failures are non-blocking for manual payment record/reversal success
   - No allocation deletes and no duplicate allocation rows introduced in this slice
   - Stripe webhook dual-write remains deferred to Phase 4H
   - Historical backfill remains deferred
   - No projection/read-path switch; invoice projection remains compatibility-helper/payment-row derived
   - No UI/Stripe checkout/webhook/Service Plan Billing/QBO/ACH/refunds/disputes/saved cards/autopay/partial payments/receipt automation/platform-fee/customer-portal/service-plan-automation behavior changes in this phase
- **Phase 4H closeout (Stripe Webhook Dual-Write) is complete (Stripe webhook scope only):**
   - Phase 4H Stripe webhook dual-write is complete
   - Successful Stripe tenant invoice payment rows now invoke centralized allocation helper and create/update `active` allocation rows
   - Failed Stripe tenant invoice payment rows now invoke centralized allocation helper and create/update `inactive` allocation rows
   - Idempotent/replayed Stripe events now attempt allocation upsert against resolved existing payment row without changing existing Stripe payment idempotency behavior
   - Allocation helper failure is non-blocking after payment-row success; payment row remains authoritative
   - Existing Stripe event routing and duplicate protection remain unchanged
   - Projection/read path remains unchanged and still does not read persisted allocations
   - Historical backfill remains deferred
   - No UI behavior changed
   - No Service Plan Billing Period/QBO/ACH/refunds-disputes/saved-cards-autopay/partial payments/receipt automation/platform-fee/customer-portal/service-plan-automation behavior was added
- **Phase 4I-B closeout (Sandbox Historical Allocation Backfill + Parity Verification) is complete (docs-only):**
   - Phase 4I-B sandbox historical allocation backfill is complete
   - Sandbox ref: `kvpesjdukqwwlgpkzfjm`
   - Production ref `ornrnvxtwwtulohqwxop` was not queried or mutated
   - Supabase CLI temp state was mixed; data mutation was executed through explicit sandbox URL/ref gate instead of CLI state
   - Preflight: payment rows 3, allocation rows 0, missing allocation rows 3, statuses recorded 2/reversed 1, no unexpected statuses, no required-field gaps, no missing invoice/account/job mismatch, no duplicate allocation sources
   - Backfill: attempted rows 3, returned rows 3, allocation statuses active 2/reversed 1
   - Post-backfill parity: payment rows 3, allocation rows 3, missing allocation rows 0, status mapping mismatches 0, payload mismatches 0, duplicate allocation sources 0, per-invoice parity mismatches 0
   - Global parity: recorded payment cents 10134, active allocation cents 10134, global parity matches true, reversed allocations active count 0
   - Runtime boundaries preserved: no projection/read-path switch, no UI/report behavior changes, no manual payment behavior changes, no Stripe webhook behavior changes, no production mutation
   - Validation snapshot: payment allocation + internal invoice payment tests 38 passed; payments register + invoice ledger tests 15 passed; `npx.cmd tsc --noEmit` passed; branch clean/synced
- **Phase 4I-C closeout (Production Historical Allocation Backfill Preflight + No-Op Decision) is complete (docs-only):**
   - Phase 4I-C production historical allocation backfill preflight is complete
   - Production ref confirmed: `ornrnvxtwwtulohqwxop`
   - Trusted production read access confirmed
   - SELECT-only audit was performed with `mutation_performed=false`
   - Preflight metrics: payment rows 0, allocation rows 0, missing allocation rows 0, payment status breakdown `{}`, unexpected statuses `[]`, required field gaps 0, missing invoice 0, account mismatch 0, job mismatch 0, duplicate allocation sources 0, status mapping mismatches 0, payload mismatches 0, per-invoice parity mismatches 0, global recorded payment cents 0, global active allocation cents 0, global parity matches true, reversed allocations active by mistake 0
   - Production backfill is not needed because there are no production payment rows
   - No projection/read-path switch has occurred
   - Payment row truth remains authoritative
   - Allocation table remains ready for future rows through manual and Stripe dual-write
- **Phase 5B closeout (Service Plan Billing Period Model Lock) is complete (docs/model only):**
   - Table/terminology lock: database table name is `maintenance_agreement_billing_periods`; product/UI language remains Service Plan Billing Period
   - Source-of-truth lock: Maintenance Agreement (recurring obligation), Maintenance Agreement Visit (operational visit/link/counting), Billing Period (commercial coverage window), Internal Invoice (billed commercial truth), Internal Invoice Payment (collected money truth), Payment Allocation (payment-to-invoice relationship truth)
   - Derived state lock: paid/unpaid billing state remains read-model/display truth only and never becomes operational truth
   - First posture lock: billing period may optionally link to one normal internal invoice; first slice links only to existing normal job-scoped internal invoices; no `internal_invoices` expansion beyond required `job_id`; no auto-create invoices in foundation slice
   - Optionality lock: invoice/payment linkage is optional and never required for billing-period existence or operational workflow
   - Required field lock: `id`, `account_owner_user_id`, `maintenance_agreement_id`, optional denormalized `customer_id`, `coverage_start_date`, `coverage_end_date`, `billing_due_date`, `billing_cadence`, `amount_due_cents`, `currency`, `billing_posture`, `billing_period_status`, nullable `internal_invoice_id`, external/off-platform reference fields, no-charge/waiver/not-billed reason fields, created/updated audit fields
   - Forbidden field lock in first posture: payment IDs, allocation IDs, maintenance-agreement-visit IDs, visit-count fields, next-due mutation fields, operational blocking flags, direct Stripe/subscription IDs, QBO IDs
   - Lifecycle status lock: `draft`, `pending_billing`, `invoice_linked`, `externally_billed`, `no_charge`, `waived`, `not_billed`, `cancelled`
   - Billing posture lock: `internal_invoice`, `external_off_platform`, `manual`, `no_charge`, `waived`, `not_billed_through_compliance_matters`
   - Derived payment display states lock: `not_invoice_backed`, `invoice_draft`, `unpaid`, `partially_paid`, `paid`, `invoice_void`, `payment_attention`; derived only from linked invoice/payment truth where applicable
   - Invoice linkage rules lock: same account/customer scope required, prefer service-plan-originated/job-related invoice when available, first posture disallows multiple billing periods claiming same invoice
   - Allocation targeting lock: payment allocations remain invoice-targeted and do not directly target billing periods in first posture
   - External/no-charge guardrails lock: external/off-platform/manual never create fake CM payment rows; no-charge/waived/not-billed are never treated as collected money; external references/notes/status metadata allowed
   - Operational guardrails lock: jobs/work orders/visits do not require billing period; visit counting does not require invoice/payment; billing period status does not mutate `maintenance_agreement_visits`; payment status does not advance `next_due_date`; unpaid may inform warnings/reporting only; non-internal-billing tenants remain supported
   - Phase 5C acceptance criteria lock: additive table only, strict RLS/account scope, same-account agreement/customer/invoice checks, and no UI/invoice generation/payment behavior changes/projection switch/service-plan visit-count behavior changes
- **Phase 5C closeout (Service Plan Billing Period Schema Foundation) is complete (schema/tests/docs only):**
   - Implemented additive migration: `20260526150000_maintenance_agreement_billing_periods_foundation.sql`
   - Added table: `maintenance_agreement_billing_periods` with locked first-posture fields/statuses/postures and no forbidden financial/visit/next-due/Stripe/QBO fields
   - Added required schema guards: coverage-end >= coverage-start, nonnegative amount, lowercase 3-letter currency constraint
   - Added uniqueness guards: one coverage-window row per account/agreement/start/end and optional one billing-period claim per internal invoice
   - Added same-account integrity trigger/function for agreement/customer/invoice consistency where available
   - Added account-scoped RLS SELECT/INSERT/UPDATE policies and no DELETE policy
   - Validation completed: focused schema test, maintenance-agreements suite, relevant payment allocation/internal invoice tests, TypeScript noEmit, and git diff check
   - Local migration reset/apply validation succeeded; sandbox/production apply remains separate and was not executed in this phase
   - Runtime boundaries preserved: no UI, no invoice generation, no payment behavior changes, no allocation projection/read-path switch, no Stripe checkout/webhook behavior changes, and no service-plan operational behavior changes
   - Billing periods remain non-blocking for jobs/visits/work orders/visit counting/next-due workflows
- **Phase 5C-2 closeout (Production Dormant Billing Period Migration Apply) is complete:**
   - Migration `20260526150000_maintenance_agreement_billing_periods_foundation.sql` applied to production (`ornrnvxtwwtulohqwxop`) on 2026-05-26
   - Linked ref returned to CMTest sandbox `kvpesjdukqwwlgpkzfjm` after apply
   - Table `public.maintenance_agreement_billing_periods` verified in production: all 20 required columns, no forbidden fields, all constraints/indexes/RLS/policies/triggers/functions confirmed
   - Row count `0`; no billing period rows created, no invoice generation, no backfill
   - No UI, payment, Stripe, allocation, projection, or service-plan operational behavior changed
   - Phase 5C fully closed across repo, sandbox, and production; next slice is Phase 5D read-model planning/foundation

- **Phase 5D-B closeout (Service Plan Billing Period Read-Model Helper Foundation) is complete:**
   - Added read-only helper module `lib/maintenance-agreements/billing-period-read-model.ts` for account/agreement/customer list helpers and pure label/state derivation
   - Invoice-backed rows derive payment display state from current internal invoice truth and recorded payments only; `payment_attention` does not inflate paid totals
   - The helper does not query payment allocation rows directly and keeps forbidden payment/allocation/visit/next-due/blocking fields out of the read model
   - No UI, mutation, invoice generation/linking action, payment behavior change, allocation read-path switch, or service-plan blocking was introduced
   - Phase 5D-B is complete; next slice remains Phase 5D-C

- **Phase 5E-B closeout (Customer Profile Read-Only Billing Period Visibility) is complete:**
   - Customer-profile-only read-only Billing Periods visibility was added inside each internal Maintenance Agreement card on `app/customers/[id]/page.tsx`
   - Billing periods remain display-only: no billing-period mutations, no invoice generation/linking, no payment/Stripe/allocation/projection behavior changes, and no service-work blocking
   - Billing periods remain non-blocking for work orders, visits, next due date, and visit counting
   - Phase 5E-B is complete; next slice remains Phase 5E-C

- **Phase 5F-A2 closeout (Billing Period Manual Mutation Model Lock) is complete (docs/model only):**
   - Manual billing-period mutation starts customer-profile-only inside existing Maintenance Agreement cards
   - Mutation authority is locked to Owner/Admin/Billing financial authority; read visibility remains broader/internal under existing Maintenance Agreement visibility
   - First mutation slice is locked to create/edit/cancel only; no delete. Cancellation uses `billing_period_status = cancelled`
   - Required manual-mutation fields are locked to coverage start/end, billing cadence, amount, currency, billing posture, and lifecycle status, with account/customer/agreement derived from scoped context
   - Coverage-window validation is locked to valid dates, end date >= start date, exact duplicate window rejection, overlap rejection for non-cancelled rows, and cancelled rows not blocking future windows
   - No invoice generation/linking, payment rows, allocation rows, Stripe calls, projection/read-path changes, or work-blocking behavior are introduced by the first mutation slice
   - Phase 5F-A2 is a model lock only; implementation remains deferred to the future mutation slice

**Phase 5F-B1 closeout (Manual Billing Period Server Actions Foundation) is complete (server-actions only):**
   - Manual billing-period server actions are complete; no UI was added in this slice
   - Mutation authority is enforced to Owner/Admin/Billing through the active internal-user and financial-access gate
   - Create/edit/cancel actions validate customer-profile/agreement scope, required coverage fields, posture/status rules, duplicate/overlap windows, and cancel-by-status-only behavior
   - Delete remains forbidden; cancellation remains the only end-state and uses `billing_period_status = cancelled`
   - No invoice generation/linking, payment rows, allocation rows, Stripe calls, projection/read-path changes, or service-plan operational blocking were introduced
   - Validation snapshot: billing-period action tests passed, billing-period read-model tests passed, maintenance-agreements suite passed, financial-access suite passed, `npx.cmd tsc --noEmit` passed, and `git diff --check` passed

- **Phase 5F-B2 closeout (Customer Profile Billing Period UI Wiring) is complete (customer-profile UI only):**
   - Customer-profile billing-period mutation UI wiring is complete inside existing Maintenance Agreement cards
   - Mutation controls are customer-profile-only and use the already-tested server actions for create, edit, and cancel
   - Owner/Admin/Billing controls are shown only when the clean financial-access signal is available; read-only viewers remain read-only
   - Delete is not exposed
   - No invoice generation/linking, payment rows, allocation rows, Stripe calls, projection/read-path changes, or service-plan operational blocking were introduced
   - Browser smoke was attempted, but the available session was not authorized for the target customer profile, so the smoke path remained blocked by access rather than implementation

- **Phase 5F-B3 closeout (Sandbox Billing Period UI Smoke) is complete (sandbox UI + read-only verification):**
   - Sandbox target confirmed: `kvpesjdukqwwlgpkzfjm`; tested customer `ad18fa80-2817-476b-8fca-bdcf4ff3c3d6`; maintenance agreement `454b3737-fa39-46be-8925-45131a571693`
   - Customer-profile create/edit/cancel workflow passed; cancellation remained status-based and row remained visible as history
   - Exact same-window reuse after cancellation remained blocked by current model/schema behavior and is treated as a future model decision (not a smoke failure)
   - Adjacent replacement billing period creation succeeded
   - No invoice generation/linking, no payment rows, no allocation rows, no Stripe/webhook behavior, no `maintenance_agreement_visits` mutation, and no `next_due_date` mutation occurred
   - Billing periods remain non-operational and non-blocking for work orders, visits, visit counting, and next due behavior
   - Commit `d751b23` fixed async server-client resolution in billing-period actions and added regression coverage

- **Phase 5G-A2 closeout (Billing Period Invoice Linkage Model Lock) is complete (docs/model only):**
   - First invoice relationship posture is manual link to an existing internal invoice
   - Invoice generation from billing periods is deferred
   - Invoice schema expansion is deferred
   - Billing-period invoice line-item generation is deferred
   - Linking is relationship-only in first posture: no payment rows, no allocation rows, no Stripe calls, no payment link creation, no invoice issue/send behavior, and no invoice email behavior
   - Billing-period paid state remains derived display from existing invoice/payment truth only
   - Billing periods remain non-operational and non-blocking for work execution
   - Manual link eligibility is locked to Owner/Admin/Billing authority, same-account scope, non-cancelled billing period, unlinked billing period (`internal_invoice_id` null), non-void invoice, unclaimed invoice, customer-scope alignment where invoice customer scope exists, and required invoice-job linkage to the same maintenance agreement via `maintenance_agreement_visits`
   - Manual unlink/correction posture is locked to Owner/Admin/Billing authority, required reason, non-destructive behavior, no invoice/payment/allocation mutation, clearing `internal_invoice_id` only, and returning billing-period lifecycle status to `pending_billing` unless later model approval changes this
   - Prior invoice/payment history must remain visible and unchanged after unlink
   - Status/display lock: link sets `invoice_linked`; paid/partial/unpaid remains derived from invoice/payment truth; voided linked invoice surfaces `invoice_void` display state; invoice webhook/payment events must not auto-mutate billing-period lifecycle in first posture
   - Explicit deferrals remain: invoice generation, non-job invoice model expansion, billing-period invoice line items, automatic invoice issue/send, automatic payment-link creation, Stripe checkout from billing periods, billing-period-targeted allocations, portal/self-service, autopay/subscriptions, and QBO/ACH/refunds/disputes/saved cards/partial payments/receipt automation/platform-fee execution

- **Phase 5G-B1 closeout (Billing Period Manual Invoice Link/Unlink Server Actions) is complete (server-actions only):**
   - Added server-action wrappers in `lib/maintenance-agreements/billing-period-actions.ts`: `linkInternalInvoiceToBillingPeriodFromForm` and `unlinkInternalInvoiceFromBillingPeriodFromForm`
   - No UI changes were introduced in this slice
   - Access is enforced to active internal Owner/Admin/Billing only via existing internal-user + financial-authority checks; dispatcher/technician/non-financial roles are denied
   - Manual link eligibility is enforced for required ids, same-account scope, non-cancelled and currently-unlinked billing periods, non-void and currently-unclaimed invoices, invoice customer alignment where invoice customer scope exists, and required invoice-job linkage to the same maintenance agreement via `maintenance_agreement_visits`
   - Manual unlink/correction is enforced for required reason and currently-linked period requirement; unlink is non-destructive
   - State transitions are active: link sets `internal_invoice_id` and `billing_period_status = invoice_linked`; unlink clears `internal_invoice_id`, sets `billing_period_status = pending_billing`, and stores `status_reason`
   - Both actions set `updated_by_user_id`, revalidate customer profile path, and redirect with explicit query-param banners: `billing_period_invoice_linked`, `billing_period_invoice_unlinked`, `billing_period_invoice_link_denied`, `billing_period_invoice_link_invalid`, `billing_period_invoice_link_conflict`, `billing_period_invoice_unlink_reason_required`
   - Runtime boundaries are preserved: no invoice generation, no invoice line-item generation, no invoice issue/send/email behavior, no payment-link creation, no payment/allocation row mutation, no Stripe behavior change, no projection/read-path switch, no `maintenance_agreement_visits` mutation, and no `next_due_date` behavior change
   - Validation snapshot: focused billing-period action tests passed, billing-period read-model tests passed, maintenance-agreements suite passed, `npx.cmd tsc --noEmit` passed, and `git diff --check` passed

- **Phase 6A closeout (Service Plan Automated Billing + Stripe-Saved Payment Method Audit) is complete (docs/model only):**
    - Phase 6A records model-lock audit outcomes only; no runtime/code/schema mutations are included in this closeout
    - Audit confirms Service Plan Billing Foundation V1 is stable for manual billing-period operations and identifies additive requirements for generated invoices, Stripe-saved methods, consent, manual saved-method charge, scheduled attempts, and retry attention handling
    - Locked source-of-truth boundaries are explicit:
       - Maintenance Agreement = recurring service obligation truth
       - Billing Period = commercial coverage-window truth
       - Internal Invoice = billed commercial truth
       - Internal Invoice Payment = collected/failed payment event truth when materially recorded
       - Payment Allocation = invoice-targeted allocation truth
       - Stripe = processor/payment method/money movement truth
       - Compliance Matters Autopay Setting = future instruction/consent/audit truth
       - operational surfaces (`maintenance_agreement_visits`, `next_due_date`) remain non-automated by payment outcomes
    - Invoice generation model lock:
       - one billing period -> at most one active generated invoice in first posture
       - first generation posture remains manual Generate Draft Invoice only
       - `internal_invoices` stays job-scoped in first implementation (`job_id` still required)
       - generation requires explicit operator-selected anchor job linked through `maintenance_agreement_visits`
       - no auto-send, no auto-charge, no scheduler in generation slice
       - deterministic service-plan line-item generation with explicit taxability/pricebook mapping and idempotent generation audit keying
    - Stripe-saved method model lock:
       - no PAN/CVC/raw credential storage in Compliance Matters
       - SetupIntent-first in connected-account context
       - profile scope is tenant account + tenant customer
       - multiple methods with one default allowed
       - disconnected/stale profile blocks attempts
    - Autopay consent model lock:
       - default off
       - agreement-scoped consent with version/time/source/actor/channel evidence
       - saved method does not imply consent
       - lifecycle states remain distinct (`enabled`, `disabled`, `paused`, `revoked`)
    - Manual charge saved-method lock:
       - precedes scheduled autopay
       - requires issued non-void invoice with positive balance due + same-account customer/payment-method context + connected-account readiness + active saved method + valid saved-method reuse authorization captured by the setup flow or an explicit one-time/manual-charge authorization record
       - attempt row creation only; webhook remains money-truth writer
    - Scheduled autopay lock:
       - deferred until manual charge posture proves stable; scheduled autopay still requires maintenance-agreement-scoped tenant_customer_autopay_consents
       - scheduler enqueues attempts only and must never directly mark invoices paid
       - invalid contexts are skipped explicitly
    - Failed payment/retry lock:
       - failures are attention signals, not collected money
       - failures do not mutate visits or `next_due_date`
       - `requires_action` pauses automation until customer re-auth
       - retries are explicit/bounded (no infinite loops)
   - Required future schema/model candidates: `service_plan_invoice_generation_audit`, `tenant_stripe_customers`, `tenant_customer_payment_methods`, `tenant_saved_payment_method_setups`, `tenant_customer_autopay_consents`, `tenant_saved_method_payment_attempts`, `tenant_stripe_event_receipts`, and deferred `scheduled_billing_jobs`
    - Recommended sequence lock: 6A docs/model lock -> 6B generated draft invoice -> 6C sandbox smoke -> 6D schema/model lock for saved method/consent -> 6E setup flow -> 6F manual charge -> 6G scheduled attempts -> 6H failed retry/attention -> 6I production enablement checklist

- **Phase 6B closeout (Manual Generate Draft Invoice from Billing Period) is complete (server-action only):**
   - Added server action `generateDraftInvoiceFromBillingPeriodFromForm` in `lib/maintenance-agreements/billing-period-actions.ts`
   - Access remains Owner/Admin/Billing only; Dispatcher/Technician denied via existing financial authority checks
   - Eligibility gates enforced: same-account billing period, non-cancelled, currently unlinked, `internal_invoice` posture, positive amount due, same-account/customer anchor job, and required existing anchor-job link through `maintenance_agreement_visits`
   - Zero-amount generation is blocked in this phase (`amount_due_cents > 0`)
   - Generated invoice uses existing job-scoped invoice contract (`job_id` retained), starts as `draft`, and adds one deterministic service-plan billing line item from period amount and coverage-window/cadence description
   - On success, billing period is linked back (`internal_invoice_id`) and moved to `invoice_linked` status
   - Duplicate prevention in first slice uses existing guards (period-link precondition, anchor active-invoice check, and conditional null-link update) without adding new schema
   - No migration was added in Phase 6B; `service_plan_invoice_generation_audit` remains deferred

- **Phase 6C closeout (Billing Period Draft Invoice sandbox UI smoke) is complete:**
   - Complete in sandbox ref `kvpesjdukqwwlgpkzfjm`; production ref `ornrnvxtwwtulohqwxop` was not active
   - Real customer-profile UI path was used; no manual DB mutation was used
   - Verified fixture:
      - customer `ad18fa80-2817-476b-8fca-bdcf4ff3c3d6`
      - agreement `454b3737-fa39-46be-8925-45131a571693`
      - billing period `0ee5a88a-2fb0-43ba-84c6-81ad8cc4f779`
      - anchor job `3c8d43ad-729c-4e39-a8e6-1d471a3aa692`
      - visit link `36265267-fbdb-4402-b1c7-c3e7aae3f746`
   - Baseline before submit:
      - billing period `internal_invoice_id = null`, status `pending_billing`, amount `1950`, cadence `monthly`, coverage `2026-12-01` to `2026-12-31`
      - anchor active non-void invoice count `0`
      - agreement visit count `5`
      - agreement `next_due_date = 2026-09-15`
   - UI smoke passed:
      - eligible period rendered `Generate Draft Invoice`
      - verified anchor id entered via UI; submit succeeded
      - success banner confirmed draft generation with no issue/send/email/charge/payment-link behavior
   - Generated invoice verified:
      - id `e2f20d3d-7f3c-4035-b44b-4f167d9d3d98`, number `INV-20260528-C655AA85`
      - job `3c8d43ad-729c-4e39-a8e6-1d471a3aa692`
      - status `draft`, `source_type = job`, total `1950`
      - `issued_at = null`, `sent_at = null`, `payment_link_url = null`, `stripe_payment_intent_id = null`
   - Generated line item verified:
      - id `e0552fed-a8ec-48c6-b368-b91a8f176601`
      - quantity `1`, unit price `$19.50`, line total `$19.50`
      - description `Service Plan Billing Period (monthly): 12/01/2026-12/31/2026`
   - Billing period post-state:
      - `internal_invoice_id = e2f20d3d-7f3c-4035-b44b-4f167d9d3d98`
      - `billing_period_status = invoice_linked`
   - Duplicate guard verified:
      - generate control no longer rendered after link
      - linked state showed invoice reference and `Unlink Invoice`
      - no synthetic duplicate submit was performed
      - invoice count moved `0 -> 1` only; line-item count moved `0 -> 1` only
   - No-side-effect verification passed:
      - no new `internal_invoice_payments` rows
      - no new `internal_invoice_payment_allocations` rows
      - no Stripe behavior and no payment link
      - no `maintenance_agreement_visits` mutation (count remained `5`)
      - no `next_due_date` mutation (remained `2026-09-15`)
      - invoice workspace showed Draft, 1 charge, $19.50, Unpaid, with no paid/payment-link state
   - Validation passed post-smoke:
      - `billing-period-actions.test.ts` `22/22`
      - `billing-period-read-model.test.ts` `9/9`
      - maintenance-agreements suite `111/111`
      - `customer-detail-page-wiring.test.ts` `12/12`
      - `internal-invoice-scope-hardening.test.ts` `56/56`
      - `financial-access.test.ts` `9/9`
      - `npx.cmd tsc --noEmit` passed
      - `git diff --check` clean
   - Recorded implementation commit for 6B-UI/6C-prep: `5ecbba727caae8ae7586617e164c3ff37eab1600`
   - Phase 6C is now closed; next lane is Phase 6D (Stripe saved-method + autopay consent schema/model lock)

- **Phase 6D-C closeout (Saved Payment Method + Autopay Consent schema/model lock) is complete (docs/model only):**
   - No implementation, migration, Stripe API call, sandbox mutation, production touch, or webhook behavior change occurred in this phase
   - Locked additive schema surfaces: `tenant_stripe_customers`, `tenant_customer_payment_methods`, `tenant_saved_payment_method_setups`, `tenant_customer_autopay_consents`, `tenant_saved_method_payment_attempts`, and `tenant_stripe_event_receipts`
   - `account_owner_user_id` type is intentionally locked only as the same account-owner column type already used by existing production tenant-owned tables; this phase does not introduce text-vs-UUID drift
   - Saved-method posture remains card-first; ACH/bank attributes are future/deferred display-safe metadata only and do not activate ACH/bank-debit behavior
   - Compliance Matters safe-storage boundary remains locked: no full card number, CVC, raw bank/card credentials, Stripe secrets, client secrets, or reusable payment credentials may be stored
   - Saved method present does not imply autopay enabled; autopay enabled requires explicit maintenance-agreement-scoped consent
   - `tenant_saved_method_payment_attempts` is workflow/audit truth; attempt status may reflect submission/result correlation only
   - Invoice paid state and collected money truth remain only in `internal_invoice_payments` and payment allocations after webhook confirmation; manual charge actions and schedulers must never directly mark invoices paid
   - `tenant_stripe_event_receipts` is the additive event-receipt surface for setup outcomes, payment-method lifecycle events, off-session attempt outcomes, duplicate handling, and connected-account-context verification
   - Boundaries remain preserved: no visit mutation, no `next_due_date` mutation, and no Stripe Billing Subscriptions for tenant recurring billing now
   - Phase 6D-C is now closed; next lane is Phase 6E (saved payment method setup flow)

   ### Phase 6E-C Closeout

   - Phase 6E-C — Saved Card Setup Flow / Stripe Checkout Setup Mode
   - Status: complete in sandbox and committed/pushed to origin/main. Commit: `ee5c5ea4ceef7427e501b650f67eed1555b21642`
   - Implemented behavior: customer profile now supports a saved-card setup flow using Stripe Checkout setup mode; Stripe owns card/payment credential collection and storage; Compliance Matters stores only Stripe references and display-safe metadata; setup writes to `tenant_stripe_customers`, `tenant_saved_payment_method_setups`, `tenant_customer_payment_methods`, and `tenant_stripe_event_receipts`; setup rows persist `stripe_checkout_session_id`, `stripe_setup_intent_id`, and `stripe_payment_method_id`; saved-card display uses safe metadata only (`brand`, `last4`, `expiration`, `status/default flag`)
   - Sandbox smoke evidence: the setup flow completed through customer profile and Stripe Checkout; the setup row succeeded; the checkout session ID persisted correctly after constraint/redirect corrections; the payment method row was created with display-safe metadata; the webhook receipt processed; the customer returned to the customer profile with a success banner; no full card number, CVC, client secret, raw token, or credential material was stored or displayed
   - Important correction captured: a runtime issue rejected valid Stripe Checkout Session IDs like `cs_test_...` because of an overly strict DB constraint; migration `20260527120000_fix_checkout_session_id_constraint.sql` fixed that constraint; redirect handling was corrected so the server-action redirect is not swallowed by `try/catch`; final smoke confirmed `stripe_checkout_session_id` is persisted end-to-end
   - Boundaries preserved: no autopay enablement; no card charge attempt; no Stripe PaymentIntent money movement; no Stripe Billing Subscriptions; no `internal_invoice_payments` rows created; no `internal_invoice_payment_allocations` rows created; no invoice paid/balance mutation; no invoice issue/send/email/payment-link behavior; no `tenant_customer_autopay_consents` row created or enabled; no `tenant_saved_method_payment_attempts` row created; no `maintenance_agreement_visits` mutation; no `maintenance_agreements.next_due_date` mutation; no customer portal behavior added
   - Validation recorded: Vitest matrix passed 113/113 across 9 files; `npx.cmd tsc --noEmit` passed; `git diff --check` passed; commit was pushed and remote-synced
   - Next phase: Phase 6F — Manual Charge Saved Payment Method for an issued invoice. 6F must use attempt rows before calling Stripe and keep webhook-confirmed `internal_invoice_payments` as the collected-money truth; scheduled autopay remains deferred
   - Boundaries preserved: no invoice issue/send/email, no payment-link/Stripe/saved-card/autopay/scheduler behavior, no payment/allocation rows, no `maintenance_agreement_visits` mutation, and no `next_due_date` mutation

Customer/location relationship handling polish closeout (May 2026):
- Completed for current release scope as a polish/hardening lane, not a new CRM module.
- Completed behavior/copy alignment:
   - `/jobs/new` lightweight relationship intake using customer/service location first
   - optional `Different site/access contact?`
   - optional `Different billing/paperwork recipient?`
   - no `Request came from` intake model
   - customer-facing labels include `Customer & Service Location` and `New Customer`
- Completed display alignment:
   - job detail relationship cards now avoid duplicate/default cards and render only meaningful relationship context
   - Billing Contact is billing/paperwork context only
- Completed closeout wording alignment:
   - `External Billing Complete` wording is active where invoice-sent projection completion is represented
- Confirmed non-goals remained unchanged in this lane:
   - no invoice automation or invoice-routing automation
   - no payment execution behavior change
   - no schema/model expansion for account-type/default-closeout metadata

Field bus closeout documentation note (May 2026):
- Active documentation now records completed passes for:
   - New Job Alert lifecycle cleanup
   - Owner Console company-name fallback correction
   - Equipment/CHEERS visibility and furnace label-helper clarity
   - login signup surface/copy polish
   - `/jobs/new` top-of-flow Create New Customer shortcut
   - `/ops/call-list` dedicated full page and polish
   - schedule update permit-field preservation in `updateJobScheduleFromForm`

Push Notifications V1 closeout (May 2026):
- Web push delivery is now active and field-proven in production (commit 5a4d732, deployed to dpl_6m3kDYv7sgHgy1ecdGa3tLJpZrSh)
- Supported events: `internal_job_assigned`, `internal_note_tag`
- Device enrollment is per-browser/device; users explicitly enable push separately on each device
- Feature flag: `ENABLE_WEB_PUSH=true`; rollback is ENABLE_WEB_PUSH=false + redeploy
- In-app notifications remain the primary delivery channel; web push is secondary/best-effort
- RLS was not weakened; SMS/email/Twilio remain inactive
- See `docs/ACTIVE/PWA_Push_Outside_App_Alerts_Planning_Audit.md` for complete V1 closeout details and production runbook

ECC verification expansion closeout note (May 2026):
- Active documentation now records completed ECC verification expansion passes for:
   - mini split/ductless applicability clarification and preserved labeling
   - Fan Efficacy / Watt Verification V1
   - Air Filter Device Verification V1
   - All New selected-test baseline expansion
   - AHRI Matched System Verification V1 (office-side verification)
   - Local Mechanical Exhaust Verification V1 with Field Capture vs HVI/AHAM Directory Research separation
   - New Construction per-run editable Duct Leakage and Air Flow targets
   - QII / ENV-22 Insulation Verification V1
   - ECC workspace/test-screen polish
   - ECC report-scope hygiene and redundant Equipment Reference removal
   - failed ECC invoice closeout queue behavior restoration in closeout projection
- Boundaries remain locked:
   - no schema/migration/RLS/auth/contractor-authority redesign
   - no billing or payment execution behavior expansion
   - `ecc_test_runs` remains ECC verification truth and `jobs.ops_status` remains operational projection
   - AHRI/QII remain non-gating in current scope unless explicitly designed later

Maintenance agreements read-only projection closeout note (May 2026):
- Group 9A-10B is complete in commit `0588a26` and documented as read-only Visit Count Review visibility on `/service-plans`.
- Recorded projection labels include: `No linked visits`, `Linked`, `Eligible for count review`, `Counted`, `Excluded`, `Reversed`, `Not eligible`.
- Group 9A-10C is complete in commit `1b69336` with visibility closure fix in commit `2ae1a4b`: `Mark Visit Counted` now appears on eligible linked job detail in always-visible scope (not inside collapsed Edit Job details).
- `Mark Visit Counted` is manual/operator-confirmed, mutates only the target `maintenance_agreement_visits` row (`count_status=counted`, `counts_toward_visit_balance=true`, counted audit fields), does not mutate agreement, does not advance `next_due_date`, and introduces no invoice/payment behavior.
- Group 9A-11B is complete in commit `d627b91`: counted-job detail now renders a read-only `Suggested next due date` projection block.
- 9A-11B projection is suggestion-only (explicit copy), introduces no `Confirm Next Due Date` action, does not mutate agreement `next_due_date`, does not auto-advance cadence, and adds no invoice/payment behavior.
- 9A-11B projection supports interval frequencies (`monthly`, `quarterly`, `semi_annual`, `annual`) with cadence-preserving roll-forward from existing `next_due_date`; `custom`/missing date falls back to `Manual scheduling required.`
- Group 9A-11C-A Confirm Next Due Date planning audit is documented as docs/model-only (no implementation changes in this slice).
- 9A-11C-A sets first confirm placement to job detail under/near the suggestion block; customer profile and `/service-plans` confirm surfaces remain parked until job-detail V1 is proven.
- 9A-11C-A locks the core rule that suggested next due date never auto-writes and any `next_due_date` change must be explicit and operator-confirmed.
- 9A-11C-A preconditions for future confirm write include: active internal user, active agreement, counted/counts-toward link row, interval suggestion availability, strict account/customer scope match, and stale-state guard requiring unchanged baseline `next_due_date`.
- 9A-11C-A write contract is narrow: update agreement `next_due_date` + `updated_by_user_id` only (normal `updated_at`), with no link/job/service-case/calendar/invoice/payment mutation.
- 9A-11C-A keeps seasonal-window confirm behavior parked until template/window schema approval and keeps custom/manual as no-confirm/manual-scheduling guidance.
- Group 9A-11C-B Confirm Next Due Date action on job detail is now complete in commit `c30cbac` and implements job-detail-first explicit operator-confirmed confirm action for counted Service Plans with interval-based suggested due dates.
- 9A-11C-B adds blue `Confirm Next Due Date` action button on job detail for: active agreements, counted links with `counts_toward_visit_balance=true`, interval frequencies, and feature-flag enabled.
- 9A-11C-B action is blocked/hidden for: custom/manual frequencies (shows manual-scheduling guidance instead), inactive agreements, non-counted links, stale baseline (optimistic concurrency guard), disabled feature flag, out-of-scope records.
- 9A-11C-B confirmation copy is explicit and non-prescriptive: "This will update the Service Plan next due date to [date]. It will not create a job, schedule an appointment, create an invoice, collect payment, or renew the plan. Continue?"
- 9A-11C-B implements stale-state protection with optimistic concurrency guard: compares current `maintenance_agreements.next_due_date` to `baselineNextDueDate` from form; fails with `confirm_next_due_stale_state` banner if values diverge.
- 9A-11C-B mutation contract is narrow: updates only `maintenance_agreements.next_due_date` (to suggested value) and `updated_by_user_id` (to current internal user); does not mutate links/jobs/service cases or create calendar/invoice/payment records.
- 9A-11C-B revalidates affected surfaces on success: `/jobs/{jobId}`, `/service-plans`, `/customers/{customerId}`.
- 9A-11C-B validation recorded: 67/67 unit tests passing (6 new confirm scenarios + 61 existing suite tests), tsc clean, git diff clean, working tree clean, commit pushed to origin/main.
- 9A-11C-B browser smoke deferred with justification: unit test coverage sufficient (stale-state guard, precondition validation, mutation contract verification tested); browser click-through smoke should be performed later in staging with ready authenticated fixture.
- 9A-11C-B keeps customer profile and `/service-plans` confirm actions parked until job-detail V1 is proven in real usage.
- 9A-11C-B keeps seasonal-window confirm behavior parked until template/window schema approval.
- Group 9A-13A Service Plan Work Items Prefill Structured Validation Fix is complete in commit `a116c1e` and browser-smoke validated in sandbox/local workflow.
- 9A-13A root cause: legacy/default Service Plan Work Item shapes (`item_name`, `description`, `pricebook_item_id`, `default_unit_price`) could degrade `/jobs/new` prefill into blank/Untitled Work Item behavior and trigger structured Work Item submit blocking.
- 9A-13A fix: normalize legacy/default Work Item shapes in Service Plan prefill read path before sanitization so valid legacy/default data survives into canonical Work Item fields.
- 9A-13A browser smoke evidence recorded:
   - customer `8e3c6860-e4c3-4a93-83cb-2e91c49f883f`
   - agreement `52851fbf-0e65-482d-868a-1c858521d128`
   - created job `99c1acff-6d38-4aa9-ade0-954a50a14998`
   - rendered Work Item title `Legacy Compressor Diagnostic` (not Untitled)
   - submit succeeded without manual Pricebook reselection
   - persisted canonical `visit_scope_items` with populated source pricebook id and expected unit price `189`
   - no invoice/payment rows created
   - agreement `next_due_date` unchanged at `2026-06-15`
   - new link row remained `linked` and not counted
- 9A-13A validation recorded: targeted tests 35/35 passing, tsc clean, git diff clean, and working tree clean.
- 9A-13A boundaries preserved: no visit-counting changes, no next-due-date changes, no invoice/payment behavior changes, no schema/migration/flag changes, and no recurrence/job-generation changes.
- 9A-13A watch item: temporary sandbox auth user cleanup may remain due to sandbox delete error; this is sandbox cleanup scope only and not product behavior scope.
- Group 9A-13B-A Next Due Idempotency Model Docs is documented as docs/model-only and records recommended outcome C from the audit: add durable idempotency marker before persistent confirm.
- 9A-13B-A core problem: current Suggested Next Due/Confirm visibility is transient-banner-gated plus counted-link-gated; persistent confirm without durable per-link next-due confirmation metadata can allow repeated due-date advancement from the same counted visit.
- 9A-13B-A model decision: place durable idempotency metadata on `maintenance_agreement_visits`, since the counted visit link is the business event causing next-due mutation.
- 9A-13B-A proposed future metadata fields:
   - `next_due_confirmed_at` timestamp nullable
   - `next_due_confirmed_by_user_id` uuid nullable
   - `confirmed_next_due_date` date nullable
   - `baseline_next_due_date` date nullable
- 9A-13B-A future confirm rule: confirm may write agreement `next_due_date` plus link confirmation metadata together as one logical operation; if link already has confirmation metadata, action must not advance again.
- 9A-13B-A persistent UI rule: counted links may show persistent read-only next-due context after reload; confirm action renders only for counted links without next-due confirmation metadata; post-confirm state is read-only confirmation context.
- 9A-13B-A stale-state rule remains required: agreement `next_due_date` must match `baseline_next_due_date` before write or fail safely with refresh/review guidance.
- 9A-13B-A recommended sequence: 13B-B schema/read-model/tests, 13B-C safe confirm write of agreement plus link metadata, 13B-D persistent read-only context and post-confirm action suppression, then browser smoke in sandbox.
- 9A-13B-A non-goals preserved: no automatic due-date advancement, no recurring job generation, no seasonal-window implementation, no invoice/payment behavior, no portal/SMS/QBO behavior, no reversal/adjustment UI, and no broad event-log expansion in this slice.
- Group 9A-13B-B Next Due Confirmation Metadata Foundation is implemented and pushed in commit `91d900a` with sandbox migration applied in 9A-13B-B1.
- 9A-13B-B migration: `20260514120000_maintenance_agreement_visits_next_due_confirmation_metadata.sql` adds four nullable metadata columns to `maintenance_agreement_visits`:
  - `next_due_confirmed_at` timestamptz nullable
  - `next_due_confirmed_by_user_id` uuid nullable, FK to `auth.users(id)` ON DELETE SET NULL
  - `confirmed_next_due_date` date nullable
  - `baseline_next_due_date` date nullable
- 9A-13B-B read model: type and normalizer extended with four metadata fields; `hasMaintenanceAgreementVisitConfirmedNextDue(link)` exported; fields added to all relevant visit-link `select(...)` lists.
- 9A-13B-B tests: 70/70 passed including confirmed/unconfirmed metadata helper tests with no count/used-visit projection changes.
- 9A-13B-B boundaries: no UI changes, no confirm action expansion, no agreement mutation, no count_status lifecycle changes, no feature-flag changes, no production migration apply, no production writes.
- 9A-13B-B1 sandbox verification result: sandbox ref `kvpesjdukqwwlgpkzfjm`; production ref `ornrnvxtwwtulohqwxop` not targeted; migration `20260514120000` applied and confirmed in history.
- 9A-13B-B1 Docker-backed schema dump confirmed: all four columns exist and are nullable; FK `maintenance_agreement_visits_next_due_confirmed_by_user_id_fkey` references `auth.users(id)` ON DELETE SET NULL; RLS enabled; `select_account_scope`, `insert_account_scope`, `update_account_scope` policies present; no DELETE policy exists.
- 9A-13B-B1 data verification: 8 existing rows; all four new metadata fields remain null across all rows; no backfill occurred; no production writes in either pass.
- Group 9A-13B-C Safe Confirm Write (agreement next due + link confirmation metadata) is complete in commit `3e8c769`.
- 9A-13B-C now writes agreement `next_due_date` and link metadata together (`baseline_next_due_date`, `confirmed_next_due_date`, `next_due_confirmed_at`, `next_due_confirmed_by_user_id`), with link metadata serving as idempotency truth.
- 9A-13B-C idempotency lock: a counted visit confirms once; repeat confirm from the same counted link is blocked with `confirm_next_due_already_confirmed`.
- 9A-13B-C stale-state guard remains active and confirm remains job-detail-only (no customer profile confirm, no `/service-plans` confirm, no persistent next-due expansion yet).
- Group 9A-13B-C1 browser smoke validated idempotent behavior on fixture `job_id=f6600de6-63d9-4551-94c1-a0b3a8db9a5c` / `agreement_id=454b3737-fa39-46be-8925-45131a571693` / `link_row_id=307cc7d6-5ef2-4d06-bf8c-25fa828b4d66`.
- 9A-13B-C1 first confirm produced `confirm_next_due_saved`, moved agreement `next_due_date` `2026-07-15` -> `2026-08-15`, populated all four link metadata fields, and preserved side-effect boundaries (`count_status=counted`, `counts_toward_visit_balance=true`, job `completed/invoice_required`, invoices `0`).
- 9A-13B-C1 repeat confirm produced `confirm_next_due_already_confirmed`.
- Display-only follow-up fix is complete in commit `fb621c7`: confirm dialog now formats date-only `YYYY-MM-DD` directly to `MM/DD/YYYY` (example `2026-08-15` -> `08/15/2026`) without timezone shifting.
- Display fix boundaries: no storage changes, no hidden-form value changes, no date-calculation changes, and no server action behavior changes.
- Validation recorded for 13B-C/C1 + display fix: `npx.cmd vitest run lib/maintenance-agreements/__tests__` 71/71 passed, `npx.cmd tsc --noEmit` clean, `git diff --check` clean, `git status --short` clean after push.
- Group 9A-13B-D1 Persistent Next Due Context on Job Detail is complete in commit `ba18ff3`.
- 9A-13B-D1 now derives next-due context from durable counted-link state (not transient banner state): counted unconfirmed links show suggestion + confirm action; counted confirmed links show read-only confirmed context and hide confirm action.
- 9A-13B-D1 confirmed read-only copy is recorded as:
   - `Next due date already confirmed for this counted visit.`
   - `Confirmed: MM/DD/YYYY`
   - `Previous due date: MM/DD/YYYY`
- 9A-13B-D1 preserves `Mark Visit Counted` behavior for eligible uncounted links; no server action/schema/persistence/feature-flag changes.
- 9A-13B-D1 validation recorded: `npx.cmd tsc --noEmit` clean, `git diff --check` clean, browser smoke passed for confirmed and unconfirmed counted-job states.
- Group 9A-13B-D2 Confirm Next Due Banner Mapping + Date Display Consistency is complete in commit `b5f7bd8`.
- 9A-13B-D2 adds explicit banner mappings for:
   - `confirm_next_due_saved`: `Service Plan next due date updated.`
   - `confirm_next_due_already_confirmed`: `This visit has already confirmed the Service Plan next due date.`
   - `confirm_next_due_stale_state`: `This suggestion is out of date. Refresh and review the latest next due date before confirming.`
   - `confirm_next_due_not_counted`: `This visit must be counted before confirming the next due date.`
   - `confirm_next_due_unavailable`: `Service Plan next due confirmation is currently unavailable.`
   - `confirm_next_due_update_failed`: `Could not update the Service Plan next due date. Please try again.`
- 9A-13B-D2 unifies job-detail Service Plan next-due display to `MM/DD/YYYY` using date-only parsing while keeping stored/hidden values `YYYY-MM-DD`.
- 9A-13B-D2 introduces no date-calculation logic changes and no server action behavior changes.
- 9A-13B-D2 validation recorded: `npx.cmd tsc --noEmit` clean, `git diff --check` clean, browser smoke confirmed `MM/DD/YYYY` display and banner messages.
- Group 9A-11A Service Plan Due Window / Next Due Model is documented as planning-only (no implementation) with two future cadence tracks: interval cadence and seasonal service-window cadence.
- 9A-11A preserves the locked rule that counting does not auto-advance `next_due_date`; future flow is suggestion-first, with any write path parked behind explicit operator confirmation.
- Boundaries remain explicit: no automatic counting, no due-date advancement, and no visit-balance deduction.
- Group 9A-14B Service Plans Drilldown Navigation Polish is complete in commit `f05bc29`.
- 9A-14B keeps `/service-plans` read-only while adding focused customer-profile deep-links (`/customers/{customerId}?maFocus={agreementId}#maintenance-agreement-{agreementId}`), `Manage on Customer` row links, stable customer-card anchors, focused-card highlight styling, and helper copy clarifying customer-profile ownership of edit/create-work-order/default-Work-Items actions.
- Group 9A-14C Service Plan Detail Snapshot on Customer Profile is complete in commit `eefae0b`.
- 9A-14C adds summary-first read-only card context (`Plan Snapshot` plus `What's Included` with empty-state copy `No default Work Items saved for this plan yet.`) before edit controls.
- 9A-14C preserves interaction hierarchy: `Create Work Order` remains prominent and `Edit Details` remains available but secondary/collapsed.
- 9A-14B/14C validation recorded: `npx.cmd tsc --noEmit` clean, `git diff --check` clean, browser smoke passed for drilldown deep-link focus/highlight, snapshot/included-items visibility, action placement, and `/service-plans` read-only behavior.
- Service Plans / Maintenance Agreements status: closed for now after 9A-14A, 9A-14B, and 9A-14C; reopen only for real-world workflow bugs or strongly validated user feedback.
- Scope guardrail for next pass: do not add more Service Plan capability unless explicitly reopened.

- 9A-15A Service Plan Templates / Locked Package Model is complete in commit `a8ca9b0`.
- 9A-15A records template management, create-from-template prefill, provenance snapshot, duplicate-template flow, template package lock metadata, strict create-time package values, server-side locked-field update enforcement, and read-only locked-package rendering.
- 9A-15A boundaries remain closed: no automatic jobs, no recurrence engine, no invoice/payment/autopay changes, no visit-count mutation, no next-due mutation, no portal/SMS/QBO changes, and manual Service Plan creation remains preserved.

Execution companion note: for practical first-customer support posture and expansion-lane classification guardrails, see `docs/ACTIVE/Owner_Led_Go_Live_Readiness_Addendum.md`.

---

## 2) Current Owner-Release Completion Status

### 2.1 Completion matrix (current owner-release quality)

| Area | Status | Evidence summary |
|---|---|---|
| Core Ops | Complete for owner-release | Ops command center, queue projection discipline, event-backed signals, and operational reporting are documented and stabilized in ACTIVE spine/checklist docs. |
| Job lifecycle | Complete for owner-release | Lifecycle remains resolver/event driven with locked source-of-truth boundaries; queue semantics and retest chain rules are documented as stable. |
| ECC/HERS testing truth | Complete for owner-release | ECC truth remains in ecc_test_runs with ops projection via jobs.ops_status; no UI-owned lifecycle/test truth. |
| Service cases | Complete for current continuity layer | Service case as continuity container is active; service case continuity model is present and stable in active docs. |
| Customer profile continuity V1 | Complete for V1 | Canonical customer/location strategy and sync-point model are documented and active; continuity is established at V1 level. |
| Contractor portal | Complete for owner-release scope | Contractor-focused external surface is active with correction/retest flow and status-safe wording boundaries. |
| Calendar/scheduling | Complete for owner-release | Calendar polish and guardrails complete for current scope; scheduling remains projection/display discipline aligned. |
| Notifications | Complete (PASS) | Final sanity pass: pass, no must-fix issues; optional hardening remains future/non-blocking. |
| Reports / decision surfaces | Complete for owner-release | Report center and invoice/payment tracking honesty alignment documented and stabilized. |
| Admin/setup | Complete for owner-release | Admin and setup polish complete; owner/operator readiness runbook path exists. |
| Invoice/payment truth and honesty | Complete for current scope | Tenant customer payments V1 current scope is implemented: connected-account direct-charge checkout path, webhook-only payment truth persistence, invoice paid projection, duplicate protection, and honest Payments V2 deferred-feature boundaries. |
| Support Case / Call Log V1 | Complete / production-smoke-passed | Support Case V1 implemented and production-smoke-passed (May 2026). Owner/support-internal only. Mutates only `support_cases` and `support_case_notes`. No impersonation. No tenant mutation. See `docs/ACTIVE/Support_Case_Call_Log_V1_Model_Spec.md`. |
| Product-mode matrix documentation | Complete | Matrix documented as shared-engine, presentation/configuration direction without pre-release switching requirement. |
| Mobile/PWA baseline | Complete baseline | Installability baseline and route/access smoke documented. |
| True App Package / Device-App Experience | Complete for controlled rollout | Current intended release is complete at the current quality bar; true app/device-app acceptance is complete for controlled tester use, and deferred/future items remain parked in Section 4.1 unless explicitly reopened. |
| First-owner/operator readiness runbook | Complete as controlled runbook | First-owner provisioning runbook is active with strict guardrails, dry-run/apply gates, and verification checklist. |

### 2.2 Completion interpretation

Owner-release completion means stable, honest, and supportable for current market posture, not that every future module is enabled.

---

## 3) Locked Release Scope List

The following is now locked as in-scope for owner-release quality:

1. Operations-first platform with event-backed operational truth.
2. ECC/HERS-first external posture with contractor-focused collaboration.
3. HVAC Service-ready foundation on same engine (not separate product codebase).
4. Shared source-of-truth model:
   - job_events for narrative/operational history,
   - ecc_test_runs for ECC truth,
   - jobs.ops_status as projection,
   - service_cases as continuity container,
   - jobs as visit/execution unit.
5. Internal ops action ownership in queues/workspaces, with notifications as awareness (not queue replacement).
6. Customer/location continuity V1 behavior and snapshot sync-point strategy.
7. Reports/decision surfaces and invoice/payment-tracking honesty at current non-execution boundary.
8. Admin/setup and first-owner/operator controlled readiness path.
9. Mobile/PWA baseline installable web posture.
10. True App Package / Device-App Experience closeout lane.

Release scope lock statements:
- No codebase split.
- No product-mode switch implementation required before owner-release.
- No customer portal in current release scope.
- Contractor external access remains current external model.

---

## 4) Deferred and Parked Items

The following remain intentionally deferred/parked (not blockers for owner-release):

1. Estimates production enablement expansion beyond internal-only baseline (runbook-gated; internal-only production enablement is now completed).
2. Support Console production enablement (runbook-gated; full `ENABLE_SUPPORT_CONSOLE` console with impersonation-lite, support grants, and support access sessions is still disabled and runbook-gated). Note: Support Case / Call Log V1 owner/support-internal record layer is now implemented and production-smoke-passed separately — see completion matrix above.
3. First-owner provisioning apply/invites outside controlled runbook operation.
4. Payments V2 add-ons (refunds/disputes, saved cards/autopay expansion, partial payments, receipt messaging, public payment portal, platform fees follow-up, ACH, QBO sync).
5. QBO integration (last-last, optional downstream accounting sync/export only).
6. Recurring services / maintenance agreements (customer-owned agreement V1; Group 9A-2 backend foundation committed in `b126ff6`; Group 9A-3 read-only customer profile section committed in `09edc9f`; Group 9A-4 customer profile create/edit V1 committed in `9f81d6f`; Group 9A-5B due/overdue summary read model committed with `summarizeMaintenanceAgreementsForAccount` in `lib/maintenance-agreements/read-model.ts`; Group 9A-6 feature-gated read-only ops Service Plans card committed in `1776042` (`app/ops/page.tsx`), fail-safe and non-blocking on read error; Group 9A-7B manual Create Work Order from Service Plan prefill V1 committed in `3c186e5` with compact customer-card entry point, lightweight params only (`customer_id`, `maintenance_agreement_id`), server-side scoped prefill resolver on `/jobs/new`, editable service-maintenance defaults, and non-blocking invalid/unavailable fallback; Group 9A-8B read-only Service Plans drilldown route plus ops link implemented and pushed with internal/account-scoped `/service-plans`, feature-gated visibility, account-scoped capped drilldown helper, and no heavier `/ops` drilldown query; Group 9A-9A docs/model decisions now record preferred future linkage via `maintenance_agreement_visits`, completed-valid-work counting gate, derived V1 visit-balance projection, manual `next_due_date` posture, and V2-ledger parking; Group 9A-9B link-table foundation implemented and pushed in commit `6bf7329` with new `maintenance_agreement_visits` table in migration `20260513110000_maintenance_agreement_visits_link_foundation.sql`, durable link structure with `(agreement_id, job_id)` uniqueness, link_source enum (service_plan_prefill/manual/system_future), count_status lifecycle (linked/eligible/counted/excluded/reversed), READ helpers (`listMaintenanceAgreementVisitsForAgreement`, `listMaintenanceAgreementLinksForJob`, `summarizeMaintenanceAgreementVisitLinksForAgreement`), account-scoped RLS policies (SELECT/INSERT/UPDATE only; no DELETE), and 4 new vitest-passed link-helper tests; feature gated by `ENABLE_MAINTENANCE_AGREEMENTS` (default `false`); no automatic job generation; no persisted job/agreement linkage wired; no automatic counting; no due-date or balance-deduction logic; production remains inactive until migration apply and flag enablement are intentionally approved; Group 9A-9C link-row creation when job is created from service plan implemented and pushed in commit `071915a` with automatic link creation after job succeeds (`createMaintenanceAgreementVisitLinkFromJobCreation` action in `lib/maintenance-agreements/agreement-actions.ts`), link_source='service_plan_prefill', count_status='linked', counts_toward_visit_balance=false, non-blocking failure on invalid scopes, strict account/agreement/job scope validation, and 2 new vitest-passed link creation tests; Group 9A-9E service-plan Work Items prefill + runtime link-order fix implemented and pushed in commit `c4a08d9` with agreement default Work Items persistence, `/jobs/new` Step 5 Work Item prefill, service/maintenance job persistence for service-plan-origin jobs, and link creation moved before `postCreate(...)` redirect so link rows are no longer unreachable at runtime; Group 9A-10B count eligibility read-only projection implemented and pushed in commit `0588a26`; Group 9A-10C manual `Mark Visit Counted` on eligible linked job detail implemented and pushed in commit `1b69336` with always-visible placement fix in `2ae1a4b`; manual action updates only link row count fields, does not mutate agreement, does not advance `next_due_date`, and adds no invoice/payment behavior; Service Plan counts and due/overdue summary logic are implemented in the repo/read model and exposed on `/ops` as a read-only card, internal read-only drilldown is available on `/service-plans`, manual work-order prefill from customer agreements is implemented on `/jobs/new`, automatic link creation from job creation is active, and link-table foundation with read helpers plus controlled manual counting is ready for future reversal wiring; see [Maintenance_Agreements_V1_Model_Spec.md](./Maintenance_Agreements_V1_Model_Spec.md)).
7. Customer portal (requires separate customer/location-scoped external visibility design).
8. Native-store distribution and expanded offline packaging beyond the current app/device closeout lane.
9. Product-mode configuration next slices (admin mutation/edit UI, signup capture, tier/add-on enforcement, and full mode-aware navigation/report/starter-kit behavior).
10. Mode-aware navigation rendering.
11. Mode-aware starter kits.
12. Mode-aware report presets.
13. Additional ECC test expansion beyond current accepted scope (current accepted scope includes AHRI, Local Mechanical Exhaust, QII, Fan Efficacy, and Air Filter Device verification).
14. Full case-level timeline / case_events expansion.
15. Notification test expansion / badge optimization hardening.
16. Broad performance campaign unless daily use surfaces specific real issues.
17. Calendar-filtering TypeScript watch item only, until the unrelated `work_context_label` fixture gap is resolved in the test suite.
18. Relationship Exceptions Report / Billing and Access Exceptions Report (future reporting lane).
19. Relationship/account-type taxonomy model (Homeowner, Property Management, Landlord, Home Warranty, Commercial).
20. Default closeout-method model and related invoice delivery-proof metadata (`sent_to`, `sent_at`, `channel`, external invoice id).
21. Billing Contact automation into job defaults or invoice defaults.
22. Claim/authorization model for home-warranty style workflows.

Deferred means intentionally sequenced later, not ignored.

Product Mode V2 boundary note:

- Product mode should live in dedicated account-level settings (likely `account_settings`).
- `product_mode` values are `hybrid`, `hvac_service`, `ecc_hers`.
- First implementation keeps `product_mode` nullable for safe rollout.
- Resolver order should be: real account setting, temporary Slice 1 override, signal fallback, safe default.
- Product mode controls workflow relevance/defaults only.
- Product mode must not control billing/payments, RLS/security, source-of-truth ownership, contractor authority, report datasets/calculations, tier/add-on enforcement, or feature flags.
- Admin mutation/edit UI, signup capture, tier/add-on enforcement, and full navigation/report rewrites remain later.

Product Mode V2 Slice 1 and ECC naming Phase 1 closeout note:

- Product Mode V2 Slice 1 is implemented in commit `c42f4a2`.
- ECC Naming Phase 1 is implemented in commit `6680ba8`.
- Implemented V2 Slice 1 behavior:
   - resolver now reads real `account_settings.product_mode` first
   - fallback order remains: real setting -> temporary Slice 1 override -> signal fallback -> safe default
   - mapping remains: `hybrid` -> ECC default, `ecc_hers` -> ECC default, `hvac_service` -> Service default
   - contractor mode unchanged
   - draft `jobType` still wins
   - ECC and Service remain selectable
- Implemented ECC naming Phase 1 behavior:
   - visible user-facing/product copy now prefers "ECC" where this phase applied
   - internal value `ecc_hers` remains intentionally unchanged
   - `ProductMode` type remains intentionally unchanged
   - `account_settings.product_mode` constraint remains intentionally unchanged
   - resolver logic remains unchanged by naming cleanup
   - internal enum/data migration remains deferred to a future Phase 2
- Explicit non-actions:
   - no production migration applied
   - no Supabase db push run
   - no backfill or provisioning
   - no implication that product_mode is editable in admin yet
   - no implication that signup mode capture exists yet

Product Mode V2 sandbox migration apply closeout note:

- Guarded initial attempt correctly stopped when production ref `ornrnvxtwwtulohqwxop` was detected, with no writes.
- Corrected pass relinked to sandbox ref `kvpesjdukqwwlgpkzfjm`.
- Branch/worktree state was `main` with clean status.
- Before apply, migration `20260509120000_account_settings_product_mode_v1.sql` was pending only in sandbox.
- Dependency preflight checks passed:
   - `public.set_updated_at` exists
   - `public.current_internal_account_owner_id` exists
   - `public.account_settings` did not already exist in conflicting shape
- Sandbox apply commands executed:
   - `supabase db push --linked --dry-run`
   - `supabase db push --linked`
- Post-apply verification passed:
   - `public.account_settings` exists
   - expected columns exist
   - PK/check/FKs present
   - RLS enabled
   - SELECT policy `account_settings_select_account_scope` exists and is scoped by `current_internal_account_owner_id()`
   - trigger `account_settings_set_updated_at` exists and uses `set_updated_at`
   - migration list shows local/remote applied for `20260509120000`
- Browser smoke passed for `/jobs/new` load and default toggling behavior:
   - owner/hybrid current account defaults ECC
   - Service remains manually selectable
   - switching back to ECC works
- Intentionally skipped checks:
   - optional allowed-values mutation test (extra mutation risk avoidance)
   - cross-account HVAC/ECC fixture smoke (future strategic app-to-app handoff lane; non-blocking for current intended release)
- Production remained untouched:
   - no production migration
   - no production db push
   - no production writes
   - no env/feature-flag/provisioning actions

Product Mode V2 sandbox row validation closeout note:

- Sandbox Supabase ref confirmed: `kvpesjdukqwwlgpkzfjm`.
- Production ref `ornrnvxtwwtulohqwxop` remained untouched.
- Branch: `main`, git status: clean.
- Read-only discovery identified 2 usable test fixtures (Hybrid fixture, ECC fixture).
- Controlled upsert: `INSERT INTO public.account_settings (account_owner_user_id, product_mode) VALUES (...) ON CONFLICT (...) DO UPDATE ...` for 2 explicit account UUIDs.
- Mutation result: 2 rows inserted with correct values ('hybrid', 'ecc_hers') on 2026-05-10 05:02:58 UTC.
- Post-mutation verification passed:
   - exactly 2 rows exist with expected values
   - Hybrid fixture: product_mode = 'hybrid' ✓
   - ECC fixture: product_mode = 'ecc_hers' ✓
   - resolver correctly prioritizes explicit rows
   - rowless accounts still use signal fallback ✓
- Browser smoke (partial): `/jobs/new` loaded, form rendered without errors, job family section correctly gated behind customer selection.
- Skipped checks (documented scope limitations):
   - HVAC Service fixture smoke (no HVAC fixture account in sandbox)
   - Cross-account browser switching (future strategic app-to-app handoff lane; non-blocking for current intended release)
   - Contractor-session smoke (no contractor auth available)
   - Full job-family default verification (requires customer selection workflow; partial validation only)
   - Draft jobType persistence (requires full job creation; deferred)
- Production verification: no migration, no db push, no writes, no env/flag/provisioning changes.
- Rollback readiness: pre-mutation state preserved; DELETE/UPDATE procedures documented if needed.
- Validation verdict: Resolver chain works correctly; schema/RLS/trigger stable; `/jobs/new` renders without errors; sandbox-only mutation controlled and verifiable; production untouched; no regressions detected.

Product Mode Provisioning Capture Planning note:

- Product mode capture should be phased, with First Owner Provisioning as the first implementation surface (before public signup capture).
- Phase 1 (First Owner Provisioning): script should require `--product-mode hvac_service|ecc_hers|hybrid` and write to account_settings during apply. Missing/invalid values should block apply only (not user/account functionality).
- Phase 2 (Public signup): `/signup` will eventually support two paths (HVAC Service, ECC). Hybrid remains manual/internal/sales-assisted only. Customer-facing "ECC" maps to internal `ecc_hers` until future rename/migration.
- Phase 3 (Admin configuration): read-only display first; edit UI later and guarded.
- Separation: product_mode controls workflow relevance/defaults only; plan_tier controls package level; entitlements/add-ons control feature availability; billing_mode controls invoice workflow; feature_flags control rollout safety. These remain independent.
- Safety: missing product_mode continues to fall back safely (signal-based defaults); missing product_mode must not block login/signup/invites/reports.
- Future: Production account_settings migration must be applied before production provisioning/signup writes product_mode values. Sandbox validation complete; production migration and validation remain future work.
- Angkor Heating and Air: should later be assigned hvac_service during approved onboarding/provisioning, but no onboarding/provisioning/invites happen now.
- Non-actions in Phase 1: no tier/add-on enforcement, no signup payment/trial flow changes, no feature-flag enables, no automatic contractor portal hiding, no report dataset changes.
- See `docs/ACTIVE/Product_Mode_Signup_Spec.md` section 6.5 for full provisioning capture planning details.
- See `docs/ACTIVE/First_Owner_Provisioning_Runbook.md` section 11 for future Phase 1 implementation planning.

Product Mode Provisioning Capture Slice 1 closeout note:

- First Owner Provisioning script now supports `--product-mode hvac_service|ecc_hers|hybrid`.
- Apply mode requires valid `--product-mode` and blocks when missing/invalid.
- Apply path writes `account_settings.product_mode` after owner identity resolution and before invite orchestration.
- Dry-run remains non-mutating and reports apply-readiness plus create/patch/confirm preview for account_settings capture.
- Separation preserved: product mode remains independent from entitlement preset (`internal_comped` does not imply `hybrid`; `standard` does not imply `hvac_service`).
- Boundaries unchanged: no signup capture, no admin edit UI, no tier/add-on enforcement, no mode-aware navigation/report/starter-kit rewrite, no billing/payment/contractor-authority/Estimates/Support behavior changes.

Product Mode Surface Hints V0 closeout note:

- Product Mode Surface Hints V0 is implemented as a surgical presentation-only pass.
- HVAC Service first-impression copy is slightly more service/work-order oriented on approved shell, admin, and `/jobs/new` surfaces.
- ECC/HERS and Hybrid preserve current contractor/ECC relevance; Hybrid remains All-in-One with owner access unchanged.
- Product mode remains workflow-relevance/defaults only and does not control security/RLS, roles, entitlements, report datasets/calculations, billing/payments, or contractor authority.
- No hard route blocking, no manual ECC/Service selector removal, and no broad navigation rewrite were introduced.

HVAC Service Surface Cleanup V1 closeout note:

- HVAC Service Surface Cleanup V1 is implemented as a surgical presentation-only pass.
- HVAC Service mode now de-emphasizes ECC/compliance-first breadcrumbs and keeps service/work-order language primary on approved admin and `/jobs/new` surfaces.
- HVAC Service Admin now moves contractor/intake cards out of the primary people grid into a secondary collapsed optional collaboration section.
- No functionality was deleted; contractor/subcontractor collaboration tools remain reachable by direct routes and from the optional section.
- ECC/HERS and Hybrid visibility behavior remains unchanged.
- No permissions/security/RLS/contractor-authority/billing/report/data behavior changed.

Owner Signup Visibility V1 closeout note:

- Owner Signup Visibility V1 is implemented with best-effort observability only.
- Self-serve signup now attempts a non-blocking platform-owner notification after successful provisioning, product-mode validation (for product-specific paths), and invite orchestration attempt.
- Notification delivery failure is warning-only and does not block signup submitted/neutral behavior.
- New read-only route `/ops/owner-console` is guarded by explicit platform-owner allowlist env authority.
- Authority is not derived from `product_mode`, tenant admin role, entitlement status, billing mode, or company attributes.
- Allowlist envs: `PLATFORM_OWNER_EMAILS` and optional `PLATFORM_OWNER_USER_IDS`; guard fails closed when allowlist envs are empty/missing.
- Notification recipient envs: `PLATFORM_OWNER_SIGNUP_NOTIFY_EMAIL` fallback to first valid address in `PLATFORM_OWNER_EMAILS`.
- Scope boundaries preserved: not Support Console, no impersonation, no support-side mutation, no tenant edit/mutation actions, no billing/Stripe admin actions, no product-mode editing, no security/RLS changes, and no billing/payment/QBO behavior changes.
- Hybrid customer mode remains a tenant workflow choice only and does not grant platform-wide visibility.

Product Mode V2 production migration execution closeout note:

- Production migration scope executed: `supabase/migrations/20260509120000_account_settings_product_mode_v1.sql` only.
- Production ref: `ornrnvxtwwtulohqwxop`.
- Isolated worktree: `C:/Users/eddie/hvac-saas-productmode-dryrun`.
- Final pre-apply dry-run targeted only `20260509120000`.
- Apply completed successfully (exit code `0`).
- Post-apply verification passed:
   - `public.account_settings` exists
   - expected columns exist (`account_owner_user_id`, `product_mode`, `product_mode_updated_at`, `product_mode_updated_by_user_id`, `created_at`, `updated_at`)
   - PK/FKs/check/RLS/policy/trigger verified (`account_settings_select_account_scope`, `account_settings_set_updated_at`)
   - row count is `0`
   - migration history shows `20260509120000` applied
- No-write smoke passed:
   - `/jobs/new` loads for internal user
   - existing default/manual ECC and Service selection remains stable
   - `/estimates` behavior unchanged
   - Support/People & Access workspace unchanged
   - no admin product-mode edit UI
   - no signup product-mode capture
   - contractor admin/access flows unchanged
- Warnings/watch items:
   - expected benign idempotent trigger/policy drop notices during apply
   - intermittent `net::ERR_ABORTED` navigation requests observed; destination pages still loaded and smoke checks passed
   - Supabase CLI update notice observed
- Boundaries preserved:
   - no `account_settings` rows created
   - no backfill
   - no owner Hybrid row write
   - no customer account product-mode rows
   - no signup capture
   - no admin edit UI
   - no tier/add-on enforcement
   - no navigation/report/starter-kit behavior changes
   - no billing/payments changes
   - no contractor authority changes
   - no Estimates behavior changes
   - no Support Console behavior changes
   - no Vercel/env flag changes

### 4.1 Remaining Work Register (Current)

This register captures only still-open lanes. Completed lanes listed in this document remain closed and are not reopened by this section.

Category key:
- `0` Current closeout lane
- `1` Active monitoring
- `2` Runbook-gated
- `3` Field-feedback gated
- `4` Future expansion
- `5` Deferred until provider/payment/setup

| Lane | Category | Why parked/deferred | Unlock condition |
|---|---:|---|---|
| Support V0 manual support operations | 1 | V0 is the intentional launch posture and stays manual while support load is still manageable. | Ongoing monitoring of support volume, response-time, and escalation quality. |
| Support V1 read-only Support Console | 2 | Console remains controlled and dormant by default to minimize operational/security risk during early adoption. | Runbook-approved enablement window and gate checks pass. |
| Support V2 in-app Report Issue intake | 4 | Planned intake expansion is intentionally later so V0/V1 are proven first. | Post-launch prioritization after validated support workflow need. |
| Estimates full customer-facing flow (public/customer conversion/payment-facing expansion) | 2 | Internal baseline exists, but external/customer-facing expansion remains incomplete and intentionally gated behind runbook/design decisions. Future Good / Better / Best proposals must follow `docs/ACTIVE/Estimate_Multi_Option_Proposal_Model_Spec.md`. | Explicit expansion decision plus runbook/design approval beyond internal-only scope. |
| SMS/Twilio provider-powered messaging | 5 | Current posture is explicitly non-sending; provider-powered SMS remains deferred behind compliance/provider readiness gates. | Consent/suppression/readiness gates complete, provider/legal review complete, explicit activation decision made. |
| Product mode/tier/add-on/per-seat expansion (admin mutation, tier enforcement, full mode-aware surfaces) | 4 | Baseline product-mode foundation exists; broader packaging/enforcement and full mode-aware behavior are intentionally future slices. | Future Product Mode and packaging roadmap slices explicitly approved. |
| Customer portal | 4 | Out of current release scope; requires a separate customer/location visibility and authority model. | Explicit reopen decision with dedicated portal design and scope approval. |
| QBO integration | 5 | QBO remains optional downstream and intentionally last-last, not source-of-truth or launch-critical. | Later explicit downstream accounting integration decision after core payment lanes mature. |
| True App Package / Device-App Experience | 1 | Installability and controlled-rollout device setup are complete; no further expansion is required for current intended release. | Reopen only if measured rollout feedback proves a specific device-app issue or if owner approval expands scope beyond the current web/PWA posture. |
| Service Plans V2/expansion | 3 | `/service-plans` command-center cleanup is complete; lane remains field-feedback gated. Remaining future items: customer-side Service Plans tab cleanup only if explicitly opened next, Service Plan revenue/book-value audit, billing/autopay/generated invoice expansion only under existing Payments V2 / Service Plan Billing model locks, and contextual/favorite Default Visit Work picker only after field evidence. | Real workflow bugs, strongly validated field feedback, or explicit owner-approved reopen. |
| Performance measured follow-up backlog | 1 | Broad campaign is intentionally parked; only measured regressions should trigger further work. | Measured evidence on real daily-use surfaces with benchmark-backed follow-up slices. |
| Pre-launch hardening checklist items | 2 | Hardening items are intentionally staged for controlled pre-launch execution rather than ad-hoc implementation. | Pre-launch checklist/runbook execution window and sign-off. |
| Tech dispatch notifications follow-up hardening | 3 | Core notifications/push lanes are complete; remaining work is future hardening and should be field-signal driven. | Field feedback indicates quality gaps or clear hardening opportunities; existing push quality remains monitored. |
| Contact recipient write/edit workflow | 3 | Recipient write/edit remains intentionally deferred unless field usage proves real operational need. | Repeated field demand with validated workflow need and bounded design proposal. |
| Closeout Queue V2 | 3 | V1 is complete and intentionally held as the active lane while real usage feedback is collected. | Owner field feedback after V1 daily use indicates prioritized V2 improvements. |

---

## 5) Runbook-Gated / Controlled Enablement Items

The following are explicitly runbook-gated and must remain controlled:

1. Estimates production enablement
   - Controlled by Estimates production enablement runbook
   - Internal-only boundaries; feature flags and migration gates required
   - Estimates V1A production migration execution is complete for `20260501140000_estimates_v1a_schema_domain.sql` using isolated single-migration worktree strategy from commit `a200a17`
   - Production ref for execution: `ornrnvxtwwtulohqwxop`; dry-run + explicit approval gates were completed before apply
   - Isolated artifact included `20260501120000_support_access_v1a_foundation.sql` and `20260501140000_estimates_v1a_schema_domain.sql`, and excluded `20260502120000_estimate_communications_v1h.sql` and `20260509120000_account_settings_product_mode_v1.sql`
   - Post-apply verification passed: estimates tables/columns/constraints/FKs/checks/indexes/policies verified; RLS enabled on all three estimates tables; row counts `0`
   - Non-invasive production route smoke (`/`, `/ops`, `/estimates`, `/portal`) returned login-gated pages; no public/unauthenticated estimates surface observed
   - Boundaries preserved: no estimate records/emails/PDFs, no customer/public/contractor estimate exposure, no env/flag/code/provisioning changes, no Estimate Communications or Product Mode migration apply
   - Estimate Communications V1H production migration execution is complete for `20260502120000_estimate_communications_v1h.sql` using isolated single-migration worktree strategy from commit `e5a8e8e`
   - V1H isolated artifact included `20260501120000`, `20260501140000`, `20260502120000` and excluded `20260509120000`; dry-run confirmed only V1H targeted; explicit approval received before apply
   - V1H post-apply verification passed: `public.estimate_communications` exists; RLS enabled; all 13 columns, 8 constraints, 2 indexes, 2 policies verified; row count `0`; `20260502120000` applied and `20260509120000` absent from production history
   - Internal-only feature enablement execution completed: `ENABLE_ESTIMATES=true` enabled in Vercel Production only, successful production redeploy, and alias confirmed at `https://hvac-saas-xi.vercel.app`
   - Post-enable unauthenticated checks passed: `/estimates` and `/estimates/new` remained login-gated
   - Authenticated internal production smoke passed: `/estimates` and `/estimates/new` load; smart customer picker (commit `235d0ce`) works in production; location field enables/scopes after customer selection
   - Estimate New Customer Assist V1 is complete for `/estimates/new`: internal users can open inline `+ Add Customer`, create/reuse customer + service location in-flow, and auto-select the resolved canonical ids before saving draft estimates
   - Estimate New Customer Assist V1 keeps the existing smart customer picker unchanged for existing customers; inline fields include customer name, phone, optional email, address, optional address line 2, city, state, and ZIP; customer/location remain canonical in `customers`/`locations`; and no estimate exists until `Create Draft Estimate` is clicked
   - V1 boundaries preserved: no schema/migration/Supabase command/production data actions; no job/service_case/estimate_event/payment/exposure changes; no use of full `createJobFromForm`
   - Authenticated local closeout smoke passed for the assist path: `+ Add Customer` opened, `Cancel` closed, saving selected both customer and location automatically, draft creation redirected to estimate detail, detail showed the expected customer/location, `npx.cmd tsc --noEmit` passed, targeted Vitest passed (`54/54`) in `estimate-actions.test.ts`, and browser smoke found/fixed the location auto-select issue in commit `56a5fcc`
   - Controlled smoke estimate created in production: `8796f8fc-04fb-4c53-bb05-15ab98ab31b4` (`EST-20260510-414FB343`) as `Draft`, with one manual line item (`Production smoke manual line item`, qty `1`, unit `$123.45`) and total `$123.45`
   - Enablement boundaries preserved: `ENABLE_ESTIMATE_EMAIL_SEND` remained unset/false; no outbound email/PDF/public links/contractor-customer exposure/conversion/payment/Stripe-tenant/QBO/Product Mode/Support Console changes
   - Warning/watch item: intermittent `net::ERR_ABORTED` browser-log events during navigation/action transitions; required smoke outcomes persisted successfully
   - Job-context Estimate Entry Wiring V1 is complete on the guarded internal baseline (commit `92df487`): job detail workspace now shows a `Create Estimate` CTA when estimates are enabled and required context is present; `/estimates/new` parses and validates multi-param prefill context; `NewEstimateForm` initializes from prefill; pure helper module `lib/estimates/estimate-new-entry.ts` added; `143/143` tests, TSC clean, all browser smokes passed; no schema/migration/flag/email/PDF/conversion/payment/contractor/portal changes; Group 6 status: Monitoring / controlled-user ready for internal Estimates
   - Estimate Internal Quote Readiness Checklist V1 is complete as internal-only hardening: estimate detail now provides a read-only quote readiness checklist from existing estimate/customer/location/line/total data and recipient email-on-file readiness, with no customer-facing/public/send-enable changes.
   - Estimate Print / Save as PDF View V1 is complete as internal-only hardening: authenticated internal users now have an estimate print route (`/estimates/[id]/print`) and detail CTA (`Print / Save PDF`) for manual browser Print / Save as PDF quote output using existing estimate/customer/location/business branding data only, with explicit proposal-boundary wording and no public links/tokenized sharing/portal visibility/email enablement/approval/conversion/payment/Stripe/QBO/SMS/schema changes.
   - Estimate Multi-Option Proposal Model Lock is documented in `docs/ACTIVE/Estimate_Multi_Option_Proposal_Model_Spec.md`: future Good / Better / Best support must use one parent Estimate / Proposal with child Option Packages, with no schema/UI/runtime behavior authorized by the docs lock.
   - Estimate Multi-Option Schema Foundation V1 adds dormant additive option package schema only (`estimate_options`, `estimate_option_line_items`) and preserves all current internal-only estimates boundaries; no UI/action/print/send/approval/conversion/payment/portal/QBO/SMS behavior is enabled.
2. Support Console production enablement
   - Controlled by Support Console runbook
   - V1 read-only, account-scoped, no impersonation, no tenant mutation
   - Support V1A foundation production migration readiness is closed at **ready after listed inputs** for `20260501120000_support_access_v1a_foundation.sql` only
   - Normal `db push` from current repo state is unsafe because later pending migrations exist; future execution should use an isolated single-migration artifact/worktree
   - Schema apply alone must remain dormant: `ENABLE_SUPPORT_CONSOLE` false/unset, no support seeding, no grants/sessions, no bundled Estimates/Product Mode apply
   - Support V1A production migration execution is complete for `20260501120000_support_access_v1a_foundation.sql` using isolated single-migration worktree strategy from commit `ab1fb34`
   - Production ref for execution: `ornrnvxtwwtulohqwxop`; dry-run + explicit approval gates were completed before apply
   - Post-apply production verification passed: support schema objects/indexes/constraints exist, RLS enabled, no support-table policies, no grants for PUBLIC/anon/authenticated, and zero support rows
   - Boundaries preserved: `ENABLE_SUPPORT_CONSOLE` remained false/unset; no support seeding/sessions/grants; no Estimates/Estimate Communications/Product Mode migration applied
   - Product Mode production migration execution is complete for `20260509120000_account_settings_product_mode_v1.sql` on production ref `ornrnvxtwwtulohqwxop`, using isolated worktree `C:/Users/eddie/hvac-saas-productmode-dryrun`, with final dry-run targeting only `20260509120000` before apply.
3. First Owner Provisioning
   - Controlled by first-owner provisioning runbook
   - Dry-run first, guarded apply, environment verification gates
4. Platform subscription billing/Stripe where applicable
   - Platform account subscription slice is live-smoke confirmed
   - Tenant customer payment execution V1 is implemented for current scope; only Payments V2 add-ons remain deferred
5. Any production flag enablement
   - Must remain evidence-backed, gate-approved, and rollback-ready

---

## 6) New-User Support Model (V0 / V1 / V2)

### Support V0 (launch/manual support)

Purpose: launch-safe manual support without additional platform risk.

Components:
1. Support contact channel:
   - support email
   - support phone
2. Admin setup checklist for first deployments.
3. Issue reporting template (minimum required fields: account, route, timestamp, user role, expected vs actual).
4. White-glove manual help by internal team.
5. Strict boundaries:
   - no impersonation,
   - no support-side mutation,
   - no Support Console required.

Definition of done for V0:
- documented contact process,
- documented triage flow,
- documented escalation owner,
- documented response-time targets,
- reusable issue intake template available.

### Support V1 (read-only support console)

Purpose: reduce support friction while preserving strict safety boundaries.

Requirements:
1. Runbook-gated production enablement only.
2. Read-only access model only.
3. Account-scoped grant model.
4. No impersonation.
5. No tenant mutation.
6. Complete audit trail for start/view/end support session events.

Enablement condition:
- only when V0 load/latency justifies operational need and runbook gates are green.

### Support V2 (in-app support intake)

Purpose: improve signal quality and reduce back-and-forth for issue capture.

Scope:
1. In-app Report Issue entry point.
2. Auto-captured route/page context.
3. Structured issue metadata (role, account, browser/device basics, timestamp).
4. Optional screenshot/upload extension later.
5. Routing to support queue/email.
6. Same safety boundary: no mutation unless explicitly designed/approved later.

Implementation note:
- V2 intake augments support workflow; it does not imply support write authority.

---

## 7) Post-Launch Roadmap Order (Recommended)

Recommended order after owner-release:

1. Support V0 documentation/readiness closeout — **complete.** See `docs/ACTIVE/Support_V0_Operational_Readiness_Pack.md` for the full pack (contact SOP, intake template, severity matrix, escalation tree, engineering handoff template, daily review checklist, launch-week cadence, boundaries, and tester onboarding acceptance checklist).
2. Controlled first tester onboarding.
3. Read-only Support Console V1 only if/when support load justifies it.
4. Estimates production enablement (internal-only runbook execution).
5. Recurring services / maintenance agreements (customer-owned agreement V1; manual prep only; no automatic job generation).
6. Payments V2 add-ons triage (refunds/disputes, ACH, customer portal payments, advanced saved-card/autopay behaviors).
7. QBO integration last-last (optional downstream accounting sync/export only).
8. Product-mode configuration layer (settings/visibility/presets).
9. Customer portal only if explicitly reopened.
10. Invoice Add-ons / Field Charge Guided Workflow Audit (policy lock: preserve intended job-scoped Field Billing invoice/collection workflow; constrain only global/back-office authority drift).
11. Customer Communication Polish V1.
12. Owner Visibility / Business Pulse V2 follow-ups (field-feedback gated only).

Ordering rationale:
- support safety first,
- controlled adoption second,
- operational/commercial expansion next,
- accounting sync and broader packaging last.

### 7.1 Roadmap to Completion (Realigned June 2026)

This is the current execution roadmap after evidence-based alignment with implemented behavior.

1. Stabilize production operations and docs truth.
   - Keep Section 4.1 as the single open-lane register.
   - Keep completed lanes out of deferred lists.
2. Execute controlled pre-launch hardening.
   - Run pre-launch hardening checklist in a scheduled window.
   - Track only measured regressions; avoid broad speculative rewrites.
3. Continue controlled onboarding.
   - First-owner provisioning remains disciplined dry-run/apply operation.
   - Expand tester/operator usage gradually with support-response monitoring.
4. Pull next lane by operational signal, not by assumption.
   - Owner Visibility / Business Pulse V1 is closed for current pass after Role-Aware Today Pulse V1.
   - Score update for Owner Visibility / Business Pulse: `7.1/10` -> `8.0/10`.
   - Role-aware `/today` behavior now locks to: Owner/Admin = Business Pulse, Billing = Money Attention, Office/Dispatcher = Ops Pressure, Tech = no company-wide business/money pulse.
   - Financial visibility remains role-gated; no payment/source-of-truth/Stripe behavior changed; mobile `/jobs/[id]` Field Mode was untouched.
   - Next active candidate is Invoice Add-ons / Field Charge Guided Workflow Audit.
   - Field Billing policy lock: `field_billing_enabled` remains intentionally allowed for the existing job-scoped field invoice/collection workflow and is not treated as a rollback target.
   - Field Billing Enabled remains non-global authority: no automatic final non-card verification, no refund/void/export/platform-admin powers, and no company-wide Billing/Admin expansion.
   - Confirm Payment boundary remains locked: field-reported non-card entries are pending workflow truth until authorized verification creates final payment truth.
   - Future capability hardening in this lane should address global/back-office authority drift only, without removing intended field invoice/collection workflow abilities.
   - Customer Communication Polish V1 stays immediately after invoice add-ons / field charge audit.
   - Remaining Owner Pulse improvements are field-feedback-gated V2 only: money-at-risk clarity refinements, scope/range explanation when Today/Ops/Reports counts differ, return/callback pressure when lane matures, owner trend/completion views, and service-plan revenue/book-value clarity.
   - Keep Support V1 read-only console, estimates customer-facing expansion, Service Plans V2 improvements, and other deferred lanes parked unless owner evidence explicitly reorders them.
   - Payment execution is already in place for current V1 scope; future payment work is Payments V2 add-ons only.
6. Keep long-tail items parked unless explicitly reopened.
   - Customer portal broad scope, QBO last-last, product-mode expansion, and SMS provider sending remain future decisions.
   - Deferred lanes remain parked unless explicitly reopened: native app-store wrapper, deeper offline, SMS/Twilio, QBO, customer portal, full support-system buildout, deeper Payments V2, and Service Plan billing/autopay/generated invoice expansion.

---

## 8) Remaining Risks and Unknowns

1. Support operational process readiness
   - Risk: ad-hoc support variance without clear intake/escalation discipline.
   - Mitigation: Support V0 SOP artifacts are now documented in `docs/ACTIVE/Support_V0_Operational_Readiness_Pack.md`.

2. Product-mode buyer-story drift
   - Risk: ECC/HERS and Service narratives blur in UX or roadmap language.
   - Mitigation: continue using product-mode matrix as planning guardrail until mode settings are implemented.

3. Daily-use performance variance
   - Risk: backend/network variance causes intermittent latency spikes.
   - Mitigation: measured, surgical performance follow-up only when user-visible issues appear.

4. Deferred payment expectations
   - Risk: users infer unsupported payment add-ons from invoice/payment surfaces.
   - Mitigation: preserve strict wording honesty for current V1 behavior and point deferred add-ons to the Payments V2 register (refunds, disputes, saved cards, partial payments, receipt messaging, public portal, platform fees, ACH, QBO sync).

5. App/device closeout execution drift
   - Risk: app/device closeout is mistaken as deferred because of older packaging wording.
   - Mitigation: treat True App Package / Device-App Experience as the active closeout lane and keep deferred/future register decisions in Section 4.1 as canonical.

6. First-owner provisioning gates
   - Risk: uncontrolled apply/invite use outside runbook.
   - Mitigation: keep provisioning operator-controlled with dry-run/apply discipline.

7. Support Console gates
   - Risk: pressure to bypass runbook and enable quickly.
   - Mitigation: no-go unless all governance/migration/grant/smoke/audit gates pass.

8. Estimates gates
   - Risk: enablement pressure before migration/flag/smoke controls are satisfied.
   - Mitigation: runbook-first, internal-only boundaries, immediate rollback readiness.

---

## 9) Recommended Documentation Update Approach

Recommendation: both.

1. Create this dedicated release packet doc (this file) as the canonical lock/scope/roadmap artifact for current owner-release decisioning.
2. Keep existing foundational docs as source authority and update them only for small cross-reference continuity when needed.

Why both:
- Existing docs remain deep domain/runbook authorities.
- A dedicated packet gives leadership/support/release stakeholders one concise decision surface for current scope lock and post-launch order.

Cross-reference recommendation (future docs-only slice):
- Add a one-line pointer from prelaunch checklist and active spine status note to this packet.
- Add a one-line pointer to [Competitive_Packaging_and_Tier_Spec.md](./Competitive_Packaging_and_Tier_Spec.md) for mode-vs-tier-vs-add-on packaging separation guidance.

---

## 10) Documentation Prompt History

The following prompt was used for the Support V0 Operational Readiness Pack slice (complete):

"Create a docs-only Support V0 Operational Readiness Pack in docs/ACTIVE with no code changes. Include:
1) support contact SOP,
2) intake/triage template,
3) severity matrix (S1-S4),
4) response-time targets,
5) escalation tree,
6) handoff template to engineering,
7) daily support review checklist,
8) launch-week support staffing cadence,
9) boundaries (no impersonation, no support mutation),
10) acceptance checklist for controlled first tester onboarding.
Keep runbook-gated items unchanged. No schema/migration/Supabase/feature-flag changes."

Result: `docs/ACTIVE/Support_V0_Operational_Readiness_Pack.md` created. 

---

## 11) Explicit Confirmation of Non-Implementation

This packet was produced as documentation/planning audit only.

Explicitly not performed in this slice:
- no product code changes,
- no schema changes,
- no migrations,
- no Supabase commands,
- no data writes,
- no feature-flag changes,
- no onboarding/provisioning/apply/invite execution,
- no estimates production enablement,
- no support console production enablement,
- no tenant payment execution,
- no QBO work,
- no customer portal work,
- no source-of-truth rewrite.

---

## 12) Product Mode Signup Links V1 Closeout

Product Mode Signup Links V1 is implemented as a surgical signup-entry follow-up.

- `/signup/service` maps to `hvac_service`.
- `/signup/ecc` maps to `ecc_hers`.
- `/signup` is now a product-choice landing page with SERVICE and ECC cards.
- Hybrid / All-in-One remains manual/operator-only; no public Hybrid signup path was added.
- Product-mode capture uses the existing first-owner provisioning path and writes `account_settings.product_mode` after owner creation.
- No tier/add-on enforcement, billing/payment/QBO behavior, security/RLS authority, contractor authority, report dataset/calculation behavior, Product Mode schema, or First Owner Provisioning command behavior changed.

Product Choice Signup Landing V1 closeout note:

- Public `/signup` now presents a product-choice landing with two clear card paths: SERVICE and ECC.
- SERVICE card routes to `/signup/service` and keeps existing HVAC Service signup behavior.
- ECC card routes to `/signup/ecc` and keeps existing ECC signup behavior.
- Hybrid remains manual/operator-only and is not exposed as a public signup route.
- No tier/add-on, billing/payment/QBO, security/RLS, or contractor-authority behavior changed.

Owner Console UI Polish + Admin Link V1 closeout note:

- `/ops/owner-console` now defaults to a Current view that keeps headline counts focused on active/trial/grace accounts.
- Inactive/cancelled accounts remain visible through separate read-only filters (`Inactive / Cancelled` and `All`).
- Readability polish was applied to the owner table (column priority, truncation, UUID de-emphasis) with no mutation controls added.
- `/ops/admin` includes an `Owner Console` link card only for explicit platform-owner allowlist actors.
- Access and visibility remain allowlist-based only (`PLATFORM_OWNER_EMAILS`, optional `PLATFORM_OWNER_USER_IDS`) and are not granted by product mode, tenant admin role, billing mode, entitlement status, or profile metadata.
- Scope boundaries remain unchanged: no impersonation, no support-console enablement, no tenant mutation actions, and no security/RLS behavior changes.

Owner Console Hidden Test Accounts V1 closeout note:

- Known internal/test accounts are suppressed from default Owner Console headline counts and the Current view via `PLATFORM_OWNER_HIDDEN_ACCOUNT_EMAILS` env var (comma-separated, case-insensitive).
- A new read-only `Hidden / Test` filter view exposes these accounts for inspection without affecting normal operating metrics.
- No data deletion, archive, Stripe cleanup, auth deletion, Support Console activation, impersonation, or tenant mutation was performed.
- Logic lives entirely in `lib/business/platform-owner-dashboard.ts`; page wires the env-parsed set through filter and summarize at render time.
- 25/25 tests passing; TSC clean.

Owner Console Internal Account Separation + Display Polish V2 closeout note:

- Platform/internal owner accounts are now separated from customer counts via env-configured display classification (`PLATFORM_OWNER_INTERNAL_ACCOUNT_EMAILS`) and a read-only `Platform / Internal` view.
- Hidden/test accounts remain suppressed from default customer counts via env-configured filtering (`PLATFORM_OWNER_HIDDEN_ACCOUNT_EMAILS`) and remain inspectable in `Hidden / Test` and `All` views.
- Product mode and billing mode now render with friendly display labels; null product mode renders as `Platform / Internal` for internal rows or `Not Set` for customer rows.
- Owner Console table/readability polish is V2 complete (priority columns, cleaner status/date presentation, de-emphasized technical IDs), while remaining read-only and platform-owner-only.
- No product_mode mutation, database cleanup, Stripe cleanup, Support Console activation, impersonation, or tenant mutation occurred.

---

---

## 13) Controlled Onboarding Readiness — Group Closeout Summary (May 2026)

The following implementation groups have been closed as of May 2026.

### Group 1 — Sandbox / Production Mirror Audit (CLOSED)

- Production SQL verification confirmed expected migrations applied.
- Key production tables exist and are structurally correct.
- RLS is enabled on protected tables.
- `calendar_events` SELECT/INSERT/UPDATE/DELETE policies are present.
- Support Console foundation schema is applied in production but remains operationally dormant (`ENABLE_SUPPORT_CONSOLE` unset/false; no seeding, no grants, no sessions).
- Sandbox and production are mirrored enough for sandbox-first controlled validation, with light production smoke still required after deploys.
- Data parity between sandbox and production is intentionally not required.

### Group 2 — Signup Front Door / Product Choice (CLOSED)

- `/signup` shows SERVICE and ECC product-choice cards.
- `/signup/service` maps to internal `hvac_service`.
- `/signup/ecc` maps to internal `ecc_hers`.
- Hybrid / All-in-One remains manual/operator-assisted only; no public Hybrid signup path exists.
- Signup behavior, provisioning paths, and product-mode capture boundaries are documented in `docs/ACTIVE/Product_Mode_Signup_Spec.md`.

### Group 3 — First HVAC Service User Onboarding (CLOSED / MONITORING)

- First HVAC Service user has signed up and appears in the Owner Console.
- No active blocker is known.
- Any future user feedback should be classified through Support V0 style intake before becoming build work.
- See `docs/ACTIVE/Support_V0_Operational_Readiness_Pack.md` for intake and triage discipline.

### Group 4 — Owner Console / Test Accounts (CLOSED)

- Known old production test accounts are hidden from default Owner Console counts and table views via `PLATFORM_OWNER_HIDDEN_ACCOUNT_EMAILS` env-configured display filtering.
- No accounts were deleted or archived; no Stripe-linked history was touched.
- Owner Console remains read-only and platform-owner-only.
- A `Hidden / Test` filter view provides inspection access to suppressed accounts without polluting operating metrics.

### Remaining Roadmap (Groups 6–9)

Active planned groups in priority sequence:

| Group | Name | Status |
|---|---|---|
| 6 | Estimates / Quoting Completion | Next planned |
| 7 | Product Mode / Packaging Completion | Planned |
| 7A | Pricing / Tiers / Seat Alignment | Planned — see `docs/ACTIVE/Competitive_Packaging_and_Tier_Spec.md` |
| 8 | Support / Owner Operations | Planned |
| 9A | Recurring Services / Maintenance Agreements | Group 9A-2/3/4/5B/6/7B/8B/9A/9B/9C/9E/10B/10C closeout is documented, including manual `Mark Visit Counted` implementation (`1b69336`) and always-visible placement fix (`2ae1a4b`); boundaries remain no automatic counting/no due-date advancement/no invoice-payment behavior; production remains gated by intentional migration/flag enablement - see [Maintenance_Agreements_V1_Model_Spec.md](./Maintenance_Agreements_V1_Model_Spec.md) |
| 9B | SMS / On-My-Way Messaging | Planned |
| 9C | Tenant Customer Payments / Stripe Customer Payment Execution | Current V1 intended scope complete; Payments / Deposits reporting foundation closed; future controlled production money-flow smoke remains a gated evidence step; Payments V2 deferred register parked |
| 9D | Customer Portal | Planned |
| 9E | QBO / Accounting Sync | Last-last; optional downstream only |

Group 5 (Production Migration / Enablement Gates) is closed inline through migration execution closeout notes above.

### Going-Forward Execution Discipline

- Choose one lane.
- Audit/plan first.
- Implement surgically.
- Validate (TSC, targeted tests, browser smoke).
- Commit and push.
- Update docs at closeout.
- Do not jump lanes unless there is a real blocker, dependency, risk, or owner decision to park.

---

## Source References Reviewed for This Packet

- docs/ACTIVE/Active Spine V4.0 Current.md
- docs/ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md
- docs/ACTIVE/Compliance_Matters_Prelaunch_Confirmation_Checklist.md
- docs/ACTIVE/First_Owner_Provisioning_Runbook.md
- docs/ACTIVE/Support_Console_Production_Enablement_Runbook.md
- docs/ACTIVE/Estimates_Production_Enablement_Runbook.md
- docs/ACTIVE/Compliance_Matters_Payments_Roadmap.md
- docs/ACTIVE/source-of-truth-strategy.md

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
