# Compliance Matters — Release Scope Lock and Post-Launch Roadmap

Status: ACTIVE planning packet  
Mode: Documentation/planning only  
Authority: Subordinate to Active Spine and existing ACTIVE runbooks/roadmaps  
Date: 2026-05-08

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

This packet therefore recommends:
- lock current owner-release scope as complete for current quality bar,
- keep deferred work deferred,
- use runbooks for controlled enablement only,
- start with Support V0 plus controlled onboarding,
- sequence post-launch roadmap in low-risk dependency order.

Recent closeout status snapshot (May 2026):
- Time Clock / Team Time Tracking lane is complete for current intended scope (V1 through V1.5A).
- Completed Time Clock scope includes: account and per-user controls, consolidated internal-user list controls, employee `/time-clock` runtime actions, Ops Team Clock Status card, admin `/ops/admin/time-clock` review/correction center, correction controls for all admin entries with required reason and audit fields, rolling 7-Day review, and Report Center history/export.
- Source-of-truth boundary remains explicit: dedicated durable timekeeping table owns timecard truth; `job_events` remains narrative/timeline truth.
- Latest reporting/export closeout commit: `3f81c71`.
- Boundary confirmation: no delete/reset behavior, no payroll engine, no wage/overtime calculations, no GPS/geofencing, no job-costing behavior, no contractor/customer portal time tracking, and no QBO/payroll sync behavior were added.
- Closed and treated as complete for this pass: Dedicated Closeout Queue V1, Calendar Work Context/Includes display, Job Detail Command Center polish, External Billing one-click closeout UX, Internal Invoice Workspace V1, internal invoice send workflow clarity, premium internal invoice email template, internal invoice Print / Save PDF view, premium appointment scheduled email template, appointment email company header polish, Ops tenant logo polish, ECC subcool tolerance change to +/-3F, and Pricebook naming cleanup (`Diagnostic Fee` -> `Diagnostic`).
- Estimates Section 2K closeout is complete for this pass: proposal email delivery/customer approval lane is closed (provider-backed proposal email send smoke passed, public proposal-link approval smoke passed, internal approval-notification smoke passed, active-link regeneration fallback smoke passed, Customer Delivery deployed UI smoke passed, and local preview-mode smoke passed with `.tmp/email-outbox` output and no real email send). Token safety is verified (raw token/token_hash not persisted in events, communications, or notification payloads). Explicit non-actions remain: no SMS/text proposal delivery, no payment collection from proposal, no QBO behavior, no invoice issue/send behavior from proposal approval, no automatic job conversion, no automatic invoice conversion, no customer portal login dependency, no e-signature/legal artifact model, and no live SMS behavior.
- Confirmed boundaries remain intact: Invoice Charges remain billed truth, Work Items/Visit Scope remain operational work scope, external billing remains lightweight invoice-sent tracking, internal invoicing remains internal/admin only, payment truth is owned by `internal_invoice_payments` (manual plus Stripe webhook-confirmed rows), and Closeout Queue V1 continues to use existing closeout projection truth.
- Parked follow-up remains parked: Closeout Queue V2 waits until the owner uses V1 and gives feedback, contact recipient write/edit workflow remains deferred unless field use proves need, SMS/provider-powered messaging remains behind the existing gates, and the Payments V2 deferred register covers refunds, disputes, saved cards, partial payments, receipt messaging, public payment portal, platform application fees, ACH, and QBO sync.
- Financial Ledger / Payments Register V1 model lock is now documented in [Financial_Ledger_Payments_Register_V1_Model_Spec.md](./Financial_Ledger_Payments_Register_V1_Model_Spec.md): current `internal_invoice_payments` remains invoice-bound collected-payment truth, while future bookkeeping-ready work must introduce register/allocation semantics before recurring billing or deeper financial dashboards.
- Service Role Controls / Financial Access Controls V1A-2 and V1A-3 are now implemented in [Service_Role_Controls_and_Financial_Access_V1_Model_Spec.md](./Service_Role_Controls_and_Financial_Access_V1_Model_Spec.md): Billing / AR is now implemented as a valid internal role; sensitive financial authority is Owner/Admin/Billing; and existing sensitive financial actions are server-gated.
- Billing Register / Payments Register implementation remains paused until existing financial controls are accepted and no additional invoice-lifecycle gate is required for V1. Billing Register UI, payment register mutations, payment correction tools, broad financial dashboards, and recurring billing remain blocked until that resume gate is accepted.

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
| Mobile/PWA baseline | Complete baseline | Installability baseline and route/access smoke documented; offline/native packaging remains deferred. |
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
4. Tenant customer payment execution (online checkout/payment rail at tenant invoice layer; later Stripe-first invoice acceptance, separate from platform subscription billing).
5. QBO integration (last-last, optional downstream accounting sync/export only).
6. Recurring services / maintenance agreements (customer-owned agreement V1; Group 9A-2 backend foundation committed in `b126ff6`; Group 9A-3 read-only customer profile section committed in `09edc9f`; Group 9A-4 customer profile create/edit V1 committed in `9f81d6f`; Group 9A-5B due/overdue summary read model committed with `summarizeMaintenanceAgreementsForAccount` in `lib/maintenance-agreements/read-model.ts`; Group 9A-6 feature-gated read-only ops Service Plans card committed in `1776042` (`app/ops/page.tsx`), fail-safe and non-blocking on read error; Group 9A-7B manual Create Work Order from Service Plan prefill V1 committed in `3c186e5` with compact customer-card entry point, lightweight params only (`customer_id`, `maintenance_agreement_id`), server-side scoped prefill resolver on `/jobs/new`, editable service-maintenance defaults, and non-blocking invalid/unavailable fallback; Group 9A-8B read-only Service Plans drilldown route plus ops link implemented and pushed with internal/account-scoped `/service-plans`, feature-gated visibility, account-scoped capped drilldown helper, and no heavier `/ops` drilldown query; Group 9A-9A docs/model decisions now record preferred future linkage via `maintenance_agreement_visits`, completed-valid-work counting gate, derived V1 visit-balance projection, manual `next_due_date` posture, and V2-ledger parking; Group 9A-9B link-table foundation implemented and pushed in commit `6bf7329` with new `maintenance_agreement_visits` table in migration `20260513110000_maintenance_agreement_visits_link_foundation.sql`, durable link structure with `(agreement_id, job_id)` uniqueness, link_source enum (service_plan_prefill/manual/system_future), count_status lifecycle (linked/eligible/counted/excluded/reversed), READ helpers (`listMaintenanceAgreementVisitsForAgreement`, `listMaintenanceAgreementLinksForJob`, `summarizeMaintenanceAgreementVisitLinksForAgreement`), account-scoped RLS policies (SELECT/INSERT/UPDATE only; no DELETE), and 4 new vitest-passed link-helper tests; feature gated by `ENABLE_MAINTENANCE_AGREEMENTS` (default `false`); no automatic job generation; no persisted job/agreement linkage wired; no automatic counting; no due-date or balance-deduction logic; production remains inactive until migration apply and flag enablement are intentionally approved; Group 9A-9C link-row creation when job is created from service plan implemented and pushed in commit `071915a` with automatic link creation after job succeeds (`createMaintenanceAgreementVisitLinkFromJobCreation` action in `lib/maintenance-agreements/agreement-actions.ts`), link_source='service_plan_prefill', count_status='linked', counts_toward_visit_balance=false, non-blocking failure on invalid scopes, strict account/agreement/job scope validation, and 2 new vitest-passed link creation tests; Group 9A-9E service-plan Work Items prefill + runtime link-order fix implemented and pushed in commit `c4a08d9` with agreement default Work Items persistence, `/jobs/new` Step 5 Work Item prefill, service/maintenance job persistence for service-plan-origin jobs, and link creation moved before `postCreate(...)` redirect so link rows are no longer unreachable at runtime; Group 9A-10B count eligibility read-only projection implemented and pushed in commit `0588a26`; Group 9A-10C manual `Mark Visit Counted` on eligible linked job detail implemented and pushed in commit `1b69336` with always-visible placement fix in `2ae1a4b`; manual action updates only link row count fields, does not mutate agreement, does not advance `next_due_date`, and adds no invoice/payment behavior; Service Plan counts and due/overdue summary logic are implemented in the repo/read model and exposed on `/ops` as a read-only card, internal read-only drilldown is available on `/service-plans`, manual work-order prefill from customer agreements is implemented on `/jobs/new`, automatic link creation from job creation is active, and link-table foundation with read helpers plus controlled manual counting is ready for future reversal wiring; see [Maintenance_Agreements_V1_Model_Spec.md](./Maintenance_Agreements_V1_Model_Spec.md)).
7. Customer portal (requires separate customer/location-scoped external visibility design).
8. Service worker/offline/native app-store packaging.
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
   - cross-account HVAC/ECC fixture smoke (no fixture/account context switch available)
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
   - Cross-account browser switching (single session only)
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
| Tenant customer payment execution (invoice payment acceptance) | 5 | Payment-ready foundation is present, but live tenant customer payment execution is intentionally deferred. | Explicit approval to pull forward tenant execution phase with processor-backed controls. |
| SMS/Twilio provider-powered messaging | 5 | Current posture is explicitly non-sending; provider-powered SMS remains deferred behind compliance/provider readiness gates. | Consent/suppression/readiness gates complete, provider/legal review complete, explicit activation decision made. |
| Product mode/tier/add-on/per-seat expansion (admin mutation, tier enforcement, full mode-aware surfaces) | 4 | Baseline product-mode foundation exists; broader packaging/enforcement and full mode-aware behavior are intentionally future slices. | Future Product Mode and packaging roadmap slices explicitly approved. |
| Customer portal | 4 | Out of current release scope; requires a separate customer/location visibility and authority model. | Explicit reopen decision with dedicated portal design and scope approval. |
| QBO integration | 5 | QBO remains optional downstream and intentionally last-last, not source-of-truth or launch-critical. | Later explicit downstream accounting integration decision after core payment lanes mature. |
| PWA/native/offline/app-store packaging | 4 | Installability baseline is complete, but offline/native packaging is intentionally deferred. | Later roadmap slot after core operational/commercial lanes stabilize. |
| Service Plans V2/expansion | 3 | Service Plans lane is closed for now; additional capability is intentionally blocked unless field evidence justifies reopen. | Real workflow bugs or strongly validated field feedback to reopen scope. |
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
   - Tenant customer payment execution remains deferred and separately gated
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
6. Tenant customer payment execution.
7. QBO integration last-last (optional downstream accounting sync/export only).
8. Product-mode configuration layer (settings/visibility/presets).
9. Customer portal only if explicitly reopened.
10. Native/offline/app-store packaging later.

Ordering rationale:
- support safety first,
- controlled adoption second,
- operational/commercial expansion next,
- accounting sync and broader packaging last.

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

5. First-owner provisioning gates
   - Risk: uncontrolled apply/invite use outside runbook.
   - Mitigation: keep provisioning operator-controlled with dry-run/apply discipline.

6. Support Console gates
   - Risk: pressure to bypass runbook and enable quickly.
   - Mitigation: no-go unless all governance/migration/grant/smoke/audit gates pass.

7. Estimates gates
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
| 9C | Tenant Customer Payments / Stripe Customer Payment Execution | Current V1 intended scope complete; Payments V2 deferred register parked |
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
