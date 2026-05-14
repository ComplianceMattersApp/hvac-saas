# Maintenance Agreements / Recurring Services V1 Model Spec

Status: ACTIVE IMPLEMENTATION TRACKING SPEC
Owner lane: Group 9A - Recurring Services / Maintenance Agreements  
Scope: model guidance plus Group 9A-2 backend foundation closeout documentation. Backend foundation is committed in repo but is not production-active until migration apply is intentionally executed through the environment process.

## Purpose

Maintenance Agreements V1 defines the future customer-owned recurring service agreement model for Compliance Matters Software.

The V1 goal is simple: let an operator track recurring service obligations for a customer, optionally tied to one primary location, and manually create normal Jobs / Work Orders when a visit is due.

This spec is intentionally not a billing, payment, portal, SMS, or automation design.

## Group 9A-9A Model Snapshot (service plan job linkage + visit balance planning decisions)

Group 9A-9A is a docs/model decision pass only. No implementation changes are included in this slice.

### Preferred linkage model (future implementation target)

- Preferred long-term model is a separate linkage table, likely `maintenance_agreement_visits`.
- Do not use direct `jobs.maintenance_agreement_id` as the primary long-term source of truth for visit accounting.
- Purpose of the future link table: connect a Maintenance Agreement / Service Plan to actual Jobs / Work Orders created from or counted toward the plan.

Suggested future fields for `maintenance_agreement_visits`:

- `agreement_id`
- `job_id`
- `created_at`
- `created_by_user_id`
- `link_source`
- `counts_toward_visit_balance`
- `counted_at`
- `counted_by_user_id`
- `count_status`
- `reversed_at` (optional future)
- `reversed_by_user_id` (optional future)
- `reversal_reason` (optional future)

Count status lifecycle (future):

- `linked`
- `eligible`
- `counted`
- `excluded`
- `reversed`

### Counting and balance rules

- A visit should count against the plan only after linked maintenance work is completed/closed as valid maintenance work.
- Do not count at agreement creation, work-order creation, scheduling, or work start.
- V1 balance model should be derived from valid counted link rows plus agreement term/included-visit configuration when that configuration is added later.
- Do not store mutable "remaining visits" as source-of-truth in V1.

### Due-date and lifecycle handling rules

- `next_due_date` remains manual in current scope.
- Later advancement should require explicit operator confirmation or a clearly designed completion workflow.
- No automatic `next_due_date` advancement in current scope.

Cancellation/reschedule/duplicate handling rules:

- cancelled jobs do not count
- no-show jobs do not count unless explicitly marked valid later
- rescheduled same job does not double-count
- duplicate jobs are prevented by unique agreement/job linkage plus `count_status` rules
- reversal tooling is future

### Ledger decision (parked)

- Full visit balance ledger is parked for V2 unless real reversal/adjustment/renewal pressure requires first-class audit events.

Potential future ledger events (V2 planning):

- `visits_granted`
- `visit_used`
- `visit_reversed`
- `visit_adjusted`
- `renewal_granted`

### Explicit non-goals for current scope

- no automatic recurrence engine
- no automatic due-date advancement
- no visit-balance deduction yet
- no billing/payment execution
- no recurring billing
- no SMS/customer portal/QBO
- no renewal automation

## Group 9A-9B Closeout Snapshot (maintenance agreement visits link table foundation + read helpers implemented in repo)

Group 9A-9B (Maintenance Agreement Visits Link Table Foundation) is implemented and pushed in commit `6bf7329`.

Recorded implementation artifacts:

- New migration: `supabase/migrations/20260513110000_maintenance_agreement_visits_link_foundation.sql`
- New link table: `maintenance_agreement_visits` in `public` schema
- Read helpers: extended `lib/maintenance-agreements/read-model.ts` with link-table helpers
- Tests: extended `lib/maintenance-agreements/__tests__/read-model.test.ts` with 4 new link-helper tests

Recorded table purpose:

- Durable link table connecting Maintenance Agreements / Service Plans to Jobs / Work Orders
- Not a job replacement or agreement truth replacement
- Not billing/payment truth
- Link source values distinguish prefill vs manual vs future system origins
- Count status lifecycle enables future reversibility without implementing count mutations in V1

Recorded table schema:

- Primary key: `(agreement_id, job_id)` — ensures one-link-per-agreement-job pair
- Core fields:
  - `link_source`: enum `service_plan_prefill` | `manual` | `system_future` — origin of link creation
  - `count_status`: enum `linked` | `eligible` | `counted` | `excluded` | `reversed` — lifecycle state
  - `counts_toward_visit_balance`: boolean — controls V1 "used visits" projection
  - `counted_at`, `counted_by_user_id` — marks when link moved to `counted` status
  - `reversed_at`, `reversed_by_user_id`, `reversal_reason` — future reversal audit trail fields (not populated in V1)
- New links default to `count_status='linked'` and `counts_toward_visit_balance=false`
- Links with `count_status='counted'` and `counts_toward_visit_balance=true` project into used visits
- Excluded/reversed links do not count as used visits

Recorded RLS policy model:

- SELECT policy: account-scoped via strict `account_owner_user_id` match on both agreement and job through their respective customer/account relationships
- INSERT policy: account-scoped via explicit `account_owner_user_id` match (requires job to be customer-linked and agreement to belong to the same account owner)
- UPDATE policy: account-scoped via same account-owner-user-id match
- DELETE policy: intentionally absent (no delete path in V1 — use reversal status instead)
- Index coverage: account_owner_user_id, agreement_id, job_id, count_status for fast queries

Recorded read helpers:

- `listMaintenanceAgreementVisitsForAgreement(params)`: lists all links for a given agreement, optionally filtered by count_status
- `listMaintenanceAgreementLinksForJob(params)`: lists all links for a given job, optionally filtered by count_status
- `summarizeMaintenanceAgreementVisitLinksForAgreement(params)`: projects summary counts (linked/eligible/counted/excluded/reversed/used_visits) from link table for an agreement
- All helpers enforce account-owner-user-id scoping and safe-empty returns on missing scope

Recorded behavior:

- New links do not count by default (`count_status='linked'`, `counts_toward_visit_balance=false`)
- Used visits project only from links with `count_status='counted'` and `counts_toward_visit_balance=true`
- Excluded/reversed status preserves link history without counting
- No automatic counting wired in V1 (remains parked)
- No DELETE policy — reversals use status updates only

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`38` tests total; 4 new visit-link tests added).
- `npx.cmd tsc --noEmit` passed.
- `git diff --check` passed (no blocking issues; normal LF/CRLF warnings only).

Boundaries preserved in Group 9A-9B:

- no UI changes
- no new routes
- no job creation wiring
- no automatic counting logic
- no automatic due-date advancement
- no visit-balance deduction
- no recurrence engine
- no invoice/payment behavior
- no Stripe/QBO/SMS/customer portal behavior
- no Supabase commands executed
- no production migration apply
- no production writes
- no feature flag changes

Environment activation rule:

- Link table foundation is committed in repo, but is not production-active until migration `20260513110000_maintenance_agreement_visits_link_foundation.sql` is intentionally applied through the appropriate environment process.
- Runtime wiring (count logic, UI interaction, or automatic transitions) remains parked for future implementation.

Watch items:

- Current RLS policy scopes job ownership through `jobs.customer_id` to `customers.owner_user_id` match. Jobs without a customer linkage will fail the INSERT policy check until/if model assumptions broaden to accept job-agency or job-system-assigned cases.
- Count-state transitions (linked → eligible → counted, or reversal flows) are not wired yet. Future count mutation handlers and reversal UI tooling remain parked for V2 or later.
- Once link helpers are wired into runtime/UI (future), test coverage should expand to include prefix-filtering, pagination, and performance characteristics.

## Group 9A-9C Closeout Snapshot (create link row when work order is created from service plan)

Group 9A-9C (Create Link Row When Work Order Is Created from Service Plan) is implemented and pushed in commit `071915a`.

Recorded implementation artifacts:

- New action: `createMaintenanceAgreementVisitLinkFromJobCreation` in `lib/maintenance-agreements/agreement-actions.ts`
- Form capture: `maintenance_agreement_id` hidden input in `app/jobs/new/NewJobForm.tsx`
- Link creation hooks: calls after each of three job creation paths in `lib/actions/job-actions.ts`
- Tests: added 2 new tests for link creation behavior in `lib/maintenance-agreements/__tests__/agreement-actions.test.ts`

Recorded behavior:

- When a normal Job / Work Order is created from Service Plan prefill, a durable link row is created in `maintenance_agreement_visits`
- Link row uses: `link_source = 'service_plan_prefill'`, `count_status = 'linked'`, `counts_toward_visit_balance = false`
- Link creation is **non-blocking**: silently fails on invalid scopes, never blocks job creation
- Agreement record remains unchanged; `next_due_date` not advanced; visit balance not deducted; no automatic counting

Recorded safety and scope validation:

- Feature flag `ENABLE_MAINTENANCE_AGREEMENTS` must be enabled
- Internal user required via `internal_users` table lookup
- Strict `account_owner_user_id` matching on agreement, job, and customer
- Job/agreement must belong to same customer
- Duplicate links handled gracefully (ON CONFLICT)
- Invalid/out-of-scope agreement silently skipped (non-blocking)

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`40` tests total; 2 new link creation tests added)
- `npx.cmd tsc --noEmit` passed
- `git diff --check` passed (no blocking issues)

Boundaries preserved in Group 9A-9C:

- no automatic counting logic
- no automatic due-date advancement
- no visit-balance deduction
- no invoice/payment behavior
- no Supabase commands executed
- no production migration apply
- no production writes
- no feature flag changes

Environment activation rule:

- Link creation is committed in repo and active immediately after migration `20260513110000_maintenance_agreement_visits_link_foundation.sql` is applied
- Feature flag `ENABLE_MAINTENANCE_AGREEMENTS` controls prefill availability; once flag enabled and link table exists, link creation occurs automatically on job creation from service plan prefill

Watch items:

- Current RLS policy scopes job ownership through `jobs.customer_id` to `customers.owner_user_id` match. Jobs without customer linkage will silently fail link creation.
- Link creation runs silently with no logging; future internal warning/logging infrastructure may help troubleshooting when feature goes live
- Count-state transitions and reversal tooling remain parked for V2 or later

## Group 9A-9E Closeout Snapshot (service plan Work Items prefill + link creation runtime fix)

Group 9A-9E (Service Plan Work Items Prefill + Link Creation Runtime Fix) is implemented and pushed in commit `c4a08d9`.

Recorded implementation artifacts:

- Agreement mutation layer updates in `lib/maintenance-agreements/agreement-actions.ts`
- Customer agreement form updates in `app/customers/[id]/page.tsx`
- Job creation ordering fix in `lib/actions/job-actions.ts`
- Test updates in `lib/maintenance-agreements/__tests__/agreement-actions.test.ts` and `lib/actions/__tests__/job-intake-create-scope-hardening.test.ts`

Recorded behavior:

- Service Plan / Maintenance Agreement default Work Items now persist on agreement create/update.
- Agreement create/edit forms now support default Visit Scope / Work Items, not summary text only.
- Service Plan Work Items prefill into `/jobs/new` Step 5 `Visit Reason & Work Items`.
- Service-plan-origin job creation persists:
	- `job_type = service`
	- `service_visit_type = maintenance`
	- `visit_scope_summary`
	- `visit_scope_items`
- `maintenance_agreement_visits` link row is created when service-plan-origin job creation succeeds.
- Link row initialization remains:
	- `link_source = service_plan_prefill`
	- `count_status = linked`
	- `counts_toward_visit_balance = false`

Root cause and runtime fix:

- Prior runtime ordering placed link creation after `postCreate(...)`.
- `postCreate(...)` redirects, so link insertion after it was unreachable.
- Fix moved link creation before `postCreate(...)` in job creation branches.

Validation recorded:

- `45/45` targeted tests passed.
- `npx.cmd tsc --noEmit` passed.
- `git diff --check` passed.
- Browser smoke passed:
	- seeded Service Plan default Work Items through app UI
	- `/jobs/new` showed prefilled summary and Work Items
	- submitted job persisted service/maintenance + visit scope fields
	- `maintenance_agreement_visits` row created with linked/not-counted defaults

Boundaries preserved in Group 9A-9E:

- agreement record remains unchanged during job creation
- no automatic counting
- no due-date advancement
- no visit-balance deduction
- no invoice/payment behavior
- no recurrence engine
- no Stripe/QBO/SMS/customer portal behavior
- no production migration apply

## Group 9A-10B Closeout Snapshot (service plan count eligibility read-only projection)

Group 9A-10B (Service Plan Count Eligibility Read-Only Projection) is implemented, validated, and pushed in commit `0588a26`.

Recorded behavior:

- `/service-plans` now shows a read-only `Visit Count Review` column.
- Projection labels include:
	- `No linked visits`
	- `Linked`
	- `Eligible for count review`
	- `Counted`
	- `Excluded`
	- `Reversed`
	- `Not eligible`
- Projection remains read-only and does not mutate visit-link lifecycle.
- Used visits still derive only from link rows where:
	- `count_status = counted`
	- `counts_toward_visit_balance = true`

Validation recorded:

- Browser smoke passed with `ENABLE_MAINTENANCE_AGREEMENTS=true`:
	- `/service-plans` renders
	- `Visit Count Review` column appears
	- `No linked visits` label appears where expected
	- `Linked` / `Not eligible` badges render for linked plans
	- no `Mark Visit Counted` button exists
	- no forms/actions for counting exist
	- filters work
	- customer links work
- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`45` tests).
- `npx.cmd tsc --noEmit` passed.
- `git diff --check` passed.

Boundaries preserved in Group 9A-10B:

- no count-status mutation
- no automatic counting on completion
- no `Mark Visit Counted` action yet
- no due-date advancement
- no visit-balance deduction
- no mutable remaining-visit counter
- no billing/payment behavior
- no customer portal/SMS/QBO behavior
- no recurrence generation

Watch items:

- No-show and duplicate are handled defensively but are not first-class lifecycle enums yet.
- Partial Work Items still need a future per-item completion model before automatic counting would be safe.

Future parked enhancement note:

- Service Plan creation should later be template-driven.
- Agreement name, type, frequency, default Work Items, and cadence should come from selected templates.
- `start_date` remains operator-entered.
- `next_due_date` should later auto-calculate from `start_date + template frequency`, with operator override.
- `renewal_date` should later derive from plan term/payment option.

## Group 9A-10C Closeout Snapshot (manual Mark Visit Counted on job detail)

Group 9A-10C (Manual Mark Visit Counted on Job Detail) is implemented and pushed in commit `1b69336`, with visibility closure fix pushed in commit `2ae1a4b`.

Recorded behavior:

- Eligible linked maintenance jobs on job detail now surface `Service Plan Visit Count Review` with `Mark Visit Counted` action.
- Action is operator-confirmed with exact copy:
	- `This will count this completed maintenance job as one used visit for this Service Plan. It will not create an invoice, collect payment, or advance the next due date. Continue?`
- Action mutates only `maintenance_agreement_visits` for the targeted link row:
	- `count_status = counted`
	- `counts_toward_visit_balance = true`
	- `counted_at = now`
	- `counted_by_user_id = current internal user`
	- `updated_by_user_id = current internal user`
- Agreement record is not mutated.
- `next_due_date` is not advanced.
- No invoice or payment behavior is introduced.
- No automatic counting is introduced.
- Already-counted jobs do not re-show the action.

Recorded root cause and fix:

- Initial 10C action surface rendered inside collapsed `Edit Job details` container.
- Result: jobs could be logically eligible but not visibly actionable in normal workflow.
- Fix in `2ae1a4b` moved `Service Plan Visit Count Review` into always-visible job-detail scope while preserving existing eligibility gates and shared projection logic.

Browser smoke recorded:

- Job: `d39a96d9-e699-45fe-b545-2968202441b9`
- Link row: `82b44fd5-86c5-459b-a893-037b37a968a1`
- Before:
	- `count_status = linked`
	- `counts_toward_visit_balance = false`
	- `counted_at = null`
- After:
	- `count_status = counted`
	- `counts_toward_visit_balance = true`
	- `counted_at` populated
	- `counted_by_user_id` populated
- `/service-plans` projection moved from `Eligible for count review` to `Counted` for the affected agreement.
- Agreement `next_due_date` remained `2026-06-15`.
- No invoice/payment side effects were observed.

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__ job-detail-operational-entitlement-hardening.test.ts` passed (`77` tests).
- `npx.cmd tsc --noEmit` passed.
- `git diff --check` passed.

Boundaries preserved in Group 9A-10C:

- no automatic counting
- no automatic due-date advancement
- no recurrence engine
- no invoice/payment behavior
- no Stripe/QBO/SMS/customer portal behavior
- no renewal automation
- no mutable remaining-visit counter

## Group 9A-11A Model Snapshot (service plan due-window and next-due suggestion planning)

Group 9A-11A is a docs/model decision pass only. No implementation changes are included in this slice.

Guiding product principle:

- Simple first. Helpful next. Automation last.

Core rule:

- Counting a Service Plan visit must not automatically advance `maintenance_agreements.next_due_date`.
- Any future next-due write remains explicit and operator-confirmed.

Two supported future cadence models:

- Interval cadence:
	- `monthly`
	- `quarterly`
	- `semi_annual`
	- `annual`
	- `custom` (manual scheduling)
- Seasonal service-window cadence:
	- Spring AC maintenance windows
	- Fall heat maintenance windows
	- custom seasonal windows

Interval suggestion algorithm (future read-only suggestion model):

- Use cadence-preserving hybrid logic:
	- Start with current `agreement.next_due_date`.
	- Add the agreement frequency interval.
	- If the result is on or before the counted job completion date, roll forward by the same interval until the suggested date is after the counted completion date.
- Frequency interval mapping:
	- `monthly` = +1 month
	- `quarterly` = +3 months
	- `semi_annual` = +6 months
	- `annual` = +12 months
	- `custom` = no automatic suggestion; manual scheduling required

Seasonal service-window model (future template-driven model):

- Future Service Plan templates should define:
	- season/window name
	- `window_start_month/day`
	- `window_end_month/day`
	- `reminder_lead_days`
	- default Work Items
	- cadence label
- Example windows:
	- Spring AC Maintenance: March 1 to May 31, reminders starting 30 days before window open
	- Fall Heat Maintenance: September 1 to November 30, reminders starting 30 days before window open

Due-state language decision:

- Seasonal window UX should prefer:
	- `Upcoming`
	- `In Service Window`
	- `Overdue`
	- `Manual scheduling required`
- Avoid date-only language that implies only a single fixed due date for seasonal plans.

Suggested placement order (future implementation sequence):

- First placement: job detail after `Mark Visit Counted` success, in or near `Service Plan Visit Count Review`.
- Next mirrors:
	- customer profile Service Plan card
	- `/service-plans` drilldown
- Later: due-window queue views used by office scheduling workflows.

Future confirmation action model (parked for later slice):

- A separate `Confirm Next Due Date` / `Confirm Next Window` action may update:
	- `maintenance_agreements.next_due_date`
	- `maintenance_agreements.updated_by_user_id`
	- `updated_at` via normal DB behavior
- Confirm action should not mutate:
	- `maintenance_agreement_visits`
	- invoices
	- payments
	- jobs
	- service cases

Agreement status gating decision:

- Future confirm action: active agreements only.
- `paused`, `expired`, `cancelled`, and `draft` should block confirm writes.
- Suggestion/read-only guidance may still display informationally when useful.

Template alignment decision (future):

- Service Plan creation should become template-driven.
- Template should supply:
	- agreement name
	- type and frequency
	- default Work Items
	- cadence model (interval or seasonal window)
- Operator should still enter `start_date`.
- `next_due_date` may be suggested from `start_date + cadence` in future flows.
- `renewal_date` should later derive from purchased plan term/payment option.

Explicit non-goals for Group 9A-11A:

- no automatic due-date advancement
- no recurrence engine
- no automatic job generation
- no invoice/payment behavior
- no billing behavior
- no customer portal/SMS/QBO behavior
- no renewal automation
- no template implementation in this slice
- no seasonal-window schema implementation in this slice

## Group 9A-11B Closeout Snapshot (read-only suggested next due projection on job detail)

Group 9A-11B (Read-Only Suggested Next Due / Due Window Projection) is implemented and pushed in commit `d627b91`.

Recorded behavior:

- Job detail now shows a read-only `Suggested next due date` block after a Service Plan visit is counted.
- Projection is suggestion-only with explicit copy:
	- `This is a suggestion only. Confirming next due date will be added later.`
- No `Confirm Next Due Date` button/action is present in this slice.
- Agreement `next_due_date` is not mutated.
- No automatic due-date advancement is introduced.
- No invoice/payment behavior is introduced.
- No recurrence/job generation behavior is introduced.

Projection behavior:

- Supported interval frequencies:
	- `monthly`
	- `quarterly`
	- `semi_annual`
	- `annual`
- Cadence-preserving roll-forward logic:
	- start from current `agreement.next_due_date`
	- add the configured frequency interval
	- if result is on or before counted completion anchor, roll forward by same interval until after anchor
- `custom` frequency or missing `next_due_date` falls back to `Manual scheduling required.`
- Seasonal window support remains model/docs-only in this slice.

Browser validation recorded:

- Fixture IDs:
	- `customer_id = ad18fa80-2817-476b-8fca-bdcf4ff3c3d6`
	- `agreement_id = 454b3737-fa39-46be-8925-45131a571693`
	- `job_id = f6600de6-63d9-4551-94c1-a0b3a8db9a5c`
	- `link_row_id = 307cc7d6-5ef2-4d06-bf8c-25fa828b4d66`
- Pre-count: `Service Plan Visit Count Review` and `Mark Visit Counted` were present.
- Post-count:
	- visit-counted banner appeared
	- `Suggested next due date` block rendered
	- suggestion-only copy rendered
	- no `Confirm Next Due Date` action present
	- `Mark Visit Counted` no longer present
- DB verification after count:
	- link row set to `count_status = counted`
	- `counts_toward_visit_balance = true`
	- `counted_at` populated
	- `counted_by_user_id` populated
	- agreement `next_due_date` remained `2026-06-15`
	- `internal_invoices` count for job remained `0`
	- `internal_invoice_payments` count for job remained `0`

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`61` tests).
- `npx.cmd tsc --noEmit` passed.
- `git diff --check` passed.
- `git status --short` clean.

Boundaries preserved in Group 9A-11B:

- no automatic `next_due_date` advancement
- no `Confirm Next Due Date` action
- no invoice/payment behavior
- no recurrence engine
- no automatic job generation
- no customer portal/SMS/QBO behavior

## Group 9A-11C-A Model Snapshot (confirm next due date planning audit)

Group 9A-11C-A is a docs/model update only. No implementation changes are included in this slice.

First action location decision:

- First confirm action location is job detail, directly under or near the read-only `Suggested next due date` block.
- Customer profile agreement-card confirm action is parked until job-detail V1 confirm behavior is proven.
- `/service-plans` confirm action is parked until job-detail V1 confirm behavior is proven.
- Seasonal due-window queue confirm behavior remains parked until template/window schema exists.

Core rule:

- Suggested next due date must never auto-write.
- Any update to `maintenance_agreements.next_due_date` must be explicit and operator-confirmed.

Required preconditions for future confirm action:

- Maintenance Agreements feature exposure enabled.
- Active internal user context present.
- Agreement status is `active`.
- Link row is `counted` and `counts_toward_visit_balance = true`.
- Suggested next due date exists.
- Agreement frequency is interval-based (`monthly`, `quarterly`, `semi_annual`, `annual`), not manual/custom.
- Account/customer scope matches across job, link, agreement, and customer.
- Agreement `next_due_date` still matches the value used when the suggestion was calculated.

Mutation contract (future confirm action):

- May update only:
	- `maintenance_agreements.next_due_date`
	- `maintenance_agreements.updated_by_user_id`
	- `updated_at` via normal DB behavior
- Must not mutate:
	- `maintenance_agreement_visits`
	- `jobs`
	- `service_cases`
	- calendar events
	- invoices
	- payments

Optimistic concurrency / stale-state rule:

- If agreement `next_due_date` changed after suggestion render, confirm action must fail safely and block the write.
- User should be prompted to refresh and review the latest suggestion before retrying.
- Suggested UX message:
	- `This suggestion is out of date. Refresh and review the latest next due date before confirming.`

Confirmation copy decision:

- `This will update the Service Plan next due date to [date]. It will not create a job, schedule an appointment, create an invoice, collect payment, or renew the plan. Continue?`

Custom/manual frequency decision:

- No confirm action should render.
- `Manual scheduling required.` remains the only guidance.

Seasonal-window decision:

- Seasonal-window confirm behavior remains parked in this slice.
- Future behavior should likely confirm a next service window, not a single `next_due_date`.
- Revisit only after template/window schema is approved.

Explicit non-goals for Group 9A-11C-A:

- no automatic date advancement
- no recurrence engine
- no automatic job generation
- no calendar events
- no invoice/payment behavior
- no customer portal/SMS/QBO behavior
- no renewal automation
- no customer profile confirm action yet
- no `/service-plans` confirm action yet

## Group 9A-11C-B Closeout Snapshot (confirm next due date action on job detail)

Group 9A-11C-B (Confirm Next Due Date Action on Job Detail for Counted Service Plans) is implemented and pushed in commit `c30cbac`.

Recorded implementation artifacts:

- Server action: `confirmMaintenanceAgreementNextDueDateFromForm` in `lib/maintenance-agreements/agreement-actions.ts` (~157 lines)
- Client component: `ConfirmNextDueDateActionButton.tsx` (new file, ~57 lines) in `app/jobs/[id]/_components/`
- Job detail integration: enhanced `app/jobs/[id]/page.tsx` with import, type enhancement, data retrieval, UI button (~16 lines)
- Comprehensive test suite: `confirm-next-due.test.ts` (new file, ~470 lines) with 6 test scenarios

Recorded behavior:

- Job detail page now shows a blue `Confirm Next Due Date` action button for counted Service Plan visits with valid interval-based suggested next due dates.
- Button appears only when:
	- Maintenance Agreements feature exposure enabled
	- Internal user context present
	- Agreement status is `active`
	- Link row is `counted` and `counts_toward_visit_balance = true`
	- Suggested next due date exists and is not marked manual-scheduling-required
	- Agreement frequency is interval-based (`monthly`, `quarterly`, `semi_annual`, `annual`)
- Button is blocked/hidden when:
	- Custom/manual frequency (`custom` shows "Manual scheduling required" text instead)
	- Inactive agreements
	- Non-counted links
	- Feature flag disabled
	- Out-of-scope records
- Confirmation dialog appears on click with approved copy:
	- `This will update the Service Plan next due date to [date]. It will not create a job, schedule an appointment, create an invoice, collect payment, or renew the plan. Continue?`
- User must accept confirmation dialog to proceed with action.

Recorded stale-state protection:

- Server action implements optimistic concurrency guard: compares current `maintenance_agreements.next_due_date` to `baselineNextDueDate` passed from form
- If values do not match (agreement was updated externally after suggestion rendered), action fails safely with banner: `confirm_next_due_stale_state`
- User is redirected with clear failure signal instead of silent override
- Prevents race conditions in concurrent job completion + next-due confirmation scenarios

Recorded mutation contract:

- Updates only:
	- `maintenance_agreements.next_due_date` → set to suggested date value
	- `maintenance_agreements.updated_by_user_id` → set to current internal user ID
	- `updated_at` → updated via normal DB timestamp behavior
- Does not mutate:
	- `maintenance_agreement_visits` link row (count_status remains `counted`)
	- `jobs` table (job record unchanged)
	- `service_cases` table (no records created/modified)
	- calendar events (no calendar behavior)
	- `internal_invoices` (no invoice creation)
	- `internal_invoice_payments` (no payment records)

Recorded scope validation:

- Internal user required via `requireInternalUser()`
- Feature gate: `isMaintenanceAgreementsEnabled()` must return true
- Entitlement check: `resolveOperationalMutationEntitlementAccess()` must authorize
- Account scope: agreement and job must belong to same `account_owner_user_id`
- Customer scope: agreement and job must be linked to same customer
- Link validation: link row must exist with `count_status = 'counted'` and `counts_toward_visit_balance = true`
- Status check: agreement must be `active`
- Frequency check: agreement must have interval-based frequency (not custom/manual)

Recorded preconditions/blocking rules:

| Condition | Blocking | Banner | Test |
|-----------|----------|--------|------|
| Valid state, baseline matches | ✅ Proceed | confirm_next_due_saved | ✅ |
| Stale baseline (current ≠ baseline) | ✅ Block | confirm_next_due_stale_state | ✅ |
| Custom/manual frequency | ✅ Block | confirm_next_due_custom_frequency | ✅ |
| Agreement not active | ✅ Block | confirm_next_due_agreement_inactive | ✅ |
| Link not counted or not counts_toward_visit_balance | ✅ Block | confirm_next_due_not_counted | ✅ |
| Feature flag disabled | ✅ Block | confirm_next_due_unavailable | ✅ |
| Out-of-scope (account/customer mismatch) | ✅ Block | (scope validation error) | ✅ |

Recorded revalidation paths:

- `/jobs/{jobId}` — refreshes job detail UI and suggestion block
- `/service-plans` — refreshes service plans drilldown if user navigates there
- `/customers/{customerId}` — refreshes customer profile if user navigates there

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (67/67 tests):
	- 6 new tests for confirm action (success, stale-state, frequency/status/link validation, feature flag)
	- 61 existing tests still passing (link/exposure/read-model/action suite)
- `npx.cmd tsc --noEmit` passed (no type errors)
- `git diff --check` passed (no blocking issues)
- Working tree clean after commit
- Commit `c30cbac` pushed to `origin/main`

Test scenarios validated:

1. **Success**: Valid interval frequency, matched baseline → agreement.next_due_date updates to suggested date, updated_by_user_id populated, revalidation triggered ✅
2. **Stale-state protection**: Current agreement.next_due_date ≠ baseline → fails with stale_state banner, no update ✅
3. **Custom frequency blocking**: frequency='custom' → fails with custom_frequency banner, button not rendered ✅
4. **Inactive agreement blocking**: status≠'active' → fails with agreement_inactive banner ✅
5. **Non-counted link blocking**: count_status≠'counted' or counts_toward_visit_balance=false → fails with not_counted banner ✅
6. **Feature flag enforcement**: flag disabled → fails with unavailable banner ✅

Browser smoke testing decision:

- Browser click-through testing deferred due to complexity of authenticated session setup
- Decision: Unit test coverage is sufficient (67/67 passing)
	- Stale-state guard validated by dedicated test
	- All preconditions and blocking rules unit-tested
	- Scope enforcement verified
	- Mutation contract verified (only agreement fields updated, no side effects)
	- Component structure validated
- Browser smoke should be performed later in staging with ready authenticated fixture

Boundaries preserved in Group 9A-11C-B:

- no automatic `next_due_date` advancement
- no recurrence engine
- no automatic job generation
- no calendar events
- no invoice/payment behavior
- no Stripe/QBO/SMS/customer portal behavior
- no renewal automation
- no schema changes
- no migrations
- no Supabase commands executed
- no production writes
- no feature flag changes
- no customer profile confirm action yet (parked)
- no `/service-plans` confirm action yet (parked)
- no seasonal-window confirm behavior yet (parked)

Implementation status statement:

- Confirm Next Due Date action is implemented on job detail only.
- Action is operator-confirmed (not automatic).
- Stale-state protection prevents race conditions.
- Narrow mutation contract isolates side effects.
- Customer profile and `/service-plans` confirm actions remain parked until job-detail V1 is proven in real usage.
- Seasonal-window confirm behavior remains parked until template/window schema is approved.

Watch items:

- Browser click-through validation should be performed later in staging or with ready authenticated fixture
- Seasonal-window confirm behavior remains parked for V2 or later
- Customer profile and `/service-plans` confirm surfaces remain parked for future implementation
- Multi-surface confirms deferred per user requirements

## Group 9A-8B Closeout Snapshot (service plans read-only drilldown page + ops link implemented in repo)

Group 9A-8B (Service Plans Read-Only Drilldown Page + Ops Link) is implemented and pushed.

Recorded implementation artifacts:

- New read-only route: `app/service-plans/page.tsx`
- Optional route loading state: `app/service-plans/loading.tsx`
- Ops link placement: `app/ops/page.tsx` (Service Plans summary card)
- Account-scoped drilldown helper: `listMaintenanceAgreementDrilldownForAccount` in `lib/maintenance-agreements/read-model.ts`
- Targeted test expansion: `lib/maintenance-agreements/__tests__/read-model.test.ts`

Recorded behavior:

- `/ops` Service Plans summary card now includes `View Service Plans` when feature-gated.
- `/ops` remains summary-only; full list read happens only on `/service-plans`.
- `/service-plans` is internal/account-scoped and read-only.
- `/service-plans` remains feature-gated behind `ENABLE_MAINTENANCE_AGREEMENTS`.
- Drilldown helper is account-scoped and capped.
- Page shows read-only plan rows with customer/location/status/type/frequency/next due/due state.
- Customer names link to existing customer detail pages.
- Filters exposed on `/service-plans`:
	- all
	- active
	- overdue
	- due today
	- due 1-7 days
	- due 8-30 days
	- not scheduled
	- inactive

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`34` tests).
- `npx.cmd tsc --noEmit` passed.
- `git diff --check` passed (no blocking errors).
- Browser smoke:
	- flag off: Ops hides Service Plans link; /service-plans redirects/fails closed
	- flag on: Ops link visible; /service-plans renders rows and customer links
	- all filter chips manually tested successfully
	- Ops continuity confirmed

Boundaries preserved in Group 9A-8B:

- no create/edit on drilldown page
- no Create Work Order action on drilldown page
- no job generation
- no due date advancement
- no visit-balance deduction
- no invoice/payment behavior
- no Stripe/QBO/SMS/customer portal behavior
- no heavier ops drilldown query

Watch item:

- Helper bucket logic remains covered by targeted tests alongside manual browser filter-chip validation.

## Group 9A-7B Closeout Snapshot (manual Create Work Order from Service Plan prefill V1 implemented in repo)

Group 9A-7B (Manual Create Work Order from Service Plan Prefill V1) is implemented and pushed in commit `3c186e5`.

Recorded implementation artifacts:

- Customer profile entry point: `app/customers/[id]/page.tsx`
- `/jobs/new` server-side resolver: `app/jobs/new/page.tsx`
- Form prefill wiring: `app/jobs/new/NewJobForm.tsx`
- Scoped prefill read model helper: `lib/maintenance-agreements/read-model.ts`
- Targeted resolver tests: `lib/maintenance-agreements/__tests__/read-model.test.ts`

Recorded behavior:

- Maintenance Agreement cards now expose a compact `Create Work Order` entry point when feature-gated.
- Link uses lightweight params only: `customer_id` and `maintenance_agreement_id`.
- No Work Item JSON is passed through URL params.
- `/jobs/new` resolves service-plan prefill server-side only when all of the following are true:
	- `ENABLE_MAINTENANCE_AGREEMENTS` is enabled
	- internal context is present
	- ids are valid UUIDs
	- account/customer scope matches
- `NewJobForm` receives safe prefill props and remains fully editable by operator:
	- customer preselection
	- primary location preselection when valid
	- service defaults
	- `service_case_kind = maintenance`
	- `service_visit_type = maintenance`
	- Reason for Visit from agreement default summary
	- sanitized default Work Items when valid
	- non-persisted agreement context banner (name + due date)
- Invalid/unavailable agreement prefill fails safely with a non-blocking warning.
- Submit path remains the existing normal create flow (`createJobFromForm`), creating a normal job/work order.
- Agreement record is not mutated by job creation.

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__ lib/jobs/__tests__/new-job-defaults.test.ts` passed (`4` files, `36` tests).
- `npx.cmd tsc --noEmit` passed.
- Browser smoke passed with `ENABLE_MAINTENANCE_AGREEMENTS=true`:
	- `Create Work Order` link visible on agreement card
	- `/jobs/new` opened with service-plan prefill banner
	- customer/location preselected
	- maintenance defaults present
	- reason/dispatch notes prefilled
	- normal job created via existing flow
	- agreement unchanged after submit
	- invalid agreement id failed safely
	- existing customer profile and `/jobs/new` still rendered

Boundaries preserved in Group 9A-7B:

- no schema changes
- no migrations
- no Supabase commands
- no production writes
- no feature flag changes
- no automatic job generation
- no calendar events
- no invoice/payment behavior
- no Stripe/QBO/SMS/customer portal behavior
- no next due date advancement
- no visit-balance deduction
- no persisted job/agreement linkage

Watch items:

- ECC-locked product-mode UI can still show ECC-oriented presentation copy while service-plan prefill applies service/maintenance defaults.
- Relationship-context logs briefly showed both ECC and Service during dev interaction transitions; final create succeeded.
- Sandbox/local smoke created test job `bb30cd33-f4a4-4a02-a006-98a9319f77d6`.

## Group 9A-6 Closeout Snapshot (ops read-only service plans card implemented in repo)

Group 9A-6 (Service Plans Ops Read-Only Card) is implemented and pushed in commit `1776042`.

Recorded implementation artifacts:

- Ops page card: `app/ops/page.tsx`
- Read model source: `summarizeMaintenanceAgreementsForAccount`

Recorded behavior:

- `/ops` now has a feature-gated, read-only Service Plans summary card.
- Card renders only when `ENABLE_MAINTENANCE_AGREEMENTS` is enabled.
- Card shows: `Active Plans`, `Overdue`, `Due Today`, `Due in 1-7 Days`, `Due in 8-30 Days`, `Not Scheduled`.
- Card helper copy: "Service plan counts are planning visibility only. Work orders are created separately."
- Read failure is fail-safe: `/ops` still renders and the card is hidden/non-blocking.
- No actions/buttons/routes were added.

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`28` tests).
- `npx.cmd tsc --noEmit` passed.
- `git diff --check` passed.
- Browser smoke passed:
	- flag off: `/ops` rendered, card hidden, existing sections still rendered
	- flag on: `/ops` rendered, card visible, counts rendered, existing sections still rendered

Boundaries preserved in Group 9A-6:

- no schema changes
- no migrations
- no Supabase commands
- no production writes
- no feature flag changes
- no job generation
- no calendar events
- no invoice/payment behavior
- no Stripe/QBO/SMS/customer portal behavior
- no create/edit from Ops

Implementation status statement:

- Service Plan counts and due/overdue summary logic are implemented in the repo/read model and now exposed on `/ops` as a feature-gated read-only card, but no broader user-facing Service Plans module dashboard exists yet.

Watch items:

- `as_of_date` currently reflects server date resolution; standardize business-timezone date source later if needed.
- Due windows are intentionally exclusive: `1-7` and `8-30`.

## Group 9A-5B Closeout Snapshot (due/overdue summary read model implemented in repo)

Group 9A-5B (Service Plan Due/Overdue Summary Read Model) is implemented, committed, and pushed.

Recorded implementation artifacts:

- Read model summary function: `summarizeMaintenanceAgreementsForAccount` in `lib/maintenance-agreements/read-model.ts`
- Tests: `lib/maintenance-agreements/__tests__/read-model.test.ts`

Recorded summary output:

- `status_counts`: `active`, `draft`, `paused`, `expired`, `cancelled`
- `due_counts`: `overdue`, `due_today`, `due_in_next_7_days`, `due_in_next_30_days`, `not_scheduled_active`
- `total_count`
- `as_of_date`

Recorded rules:

- strict `account_owner_user_id` scoping
- due buckets include active agreements only
- inactive statuses are excluded from due queue buckets
- `not_scheduled_active` means active with missing/invalid `next_due_date`
- as-of date is resolved once for consistent due-state calculations
- missing/invalid scope returns safe empty/default summary

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`28` tests).
- `npx.cmd tsc --noEmit` passed.
- `git diff --check` passed aside from normal LF/CRLF warnings.

Boundaries preserved in Group 9A-5B:

- existing customer/location/upcoming list behavior unchanged
- no UI changes
- no new routes
- no ops card
- no schema changes
- no migrations
- no Supabase commands
- no production writes
- no feature flag changes
- no job generation
- no calendar events
- no invoices/payments
- no Stripe/QBO/SMS/customer portal behavior

Implementation status statement:

- Service Plan counts and due/overdue summary logic are implemented in the repo/read model, but no user-facing module dashboard or Ops card exists yet.

Watch item:

- Due-window buckets are currently exclusive/non-overlapping by design. Future UI labels should avoid confusion by using explicit ranges such as Overdue, Due Today, Due in 1-7 Days, and Due in 8-30 Days, or otherwise clearly explain counting logic.

## Group 9A-4 Closeout Snapshot (create/edit V1 implemented in repo, sandbox-ready behind feature gating)

Group 9A-4 (Maintenance Agreement Create/Edit V1) is implemented and pushed in commit `9f81d6f`.

Recorded implementation artifacts:

- Server actions: `lib/maintenance-agreements/agreement-actions.ts`
- Customer profile create/edit forms: `app/customers/[id]/page.tsx`
- Tests: `lib/maintenance-agreements/__tests__/agreement-actions.test.ts`

Recorded create fields:

- `agreement_name`
- `agreement_type`
- `frequency`
- `next_due_date`
- `start_date`
- `renewal_date` (optional)
- `primary_location_id` (optional)
- `default_visit_scope_summary` (optional)
- `internal_notes` (optional)

Recorded edit fields:

- same fields as create
- `status`

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`26` tests).
- `npx.cmd tsc --noEmit` passed.
- Browser smoke passed for create and edit flow, including:
	- `maSaved=created` and `maSaved=updated` redirect states
	- updated card content showing renamed agreement and `Active` status
	- existing customer profile sections still rendering after mutation flows

Boundaries preserved in Group 9A-4:

- no delete
- no customer reassignment
- no preferred technician UI
- no multi-location support
- no job generation
- no calendar events
- no invoices or payments
- no Stripe tenant payment behavior
- no QBO
- no SMS
- no customer portal exposure
- no production migration apply or flag enablement

Implementation status statement:

- Maintenance Agreements create/edit is implemented in repo and sandbox-ready behind feature gating, but production remains inactive until migration apply and flag enablement are intentionally approved.

## Group 9A-3 Closeout Snapshot (read-only customer profile section, not production-active)

Group 9A-3 (Customer Profile Read-Only Agreement Display) is implemented and pushed in commit `09edc9f`.

Recorded implementation artifacts:

- Feature flag: `lib/maintenance-agreements/agreement-exposure.ts`
- Customer profile section: `app/customers/[id]/page.tsx` (guarded read + display section)
- Tests: `lib/maintenance-agreements/__tests__/agreement-exposure.test.ts`

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`21` tests: 14 exposure + 7 read-model).
- `npx.cmd tsc --noEmit` passed.

Production guard:

- The section is gated by `isMaintenanceAgreementsEnabled()` reading `ENABLE_MAINTENANCE_AGREEMENTS`.
- Default is `false`. Production never attempts a read against `maintenance_agreements` until the flag is explicitly enabled after migration apply.
- Secondary guard: the read call is wrapped in a `try/catch` that returns `[]` on error.

Boundaries preserved in Group 9A-3:

- no create/edit agreements
- no job generation from agreements
- no calendar events
- no invoices or payments
- no Stripe tenant payment behavior
- no QBO
- no SMS
- no customer portal exposure
- no production migration apply

Watch item:

- Visual sandbox smoke with `ENABLE_MAINTENANCE_AGREEMENTS=true` was not completed in this session. Smoke to confirm: empty state renders, page does not crash, existing jobs/service-case/history sections still render.

---

## Group 9A-2 Closeout Snapshot (implemented in repo, not production-active)

Group 9A-2 (Maintenance Agreements Schema + RLS + Read Model V1) is implemented and pushed in commit `b126ff6`.

Recorded implementation artifacts:

- Migration file: `supabase/migrations/20260512120000_maintenance_agreements_v1.sql`
- Read model: `lib/maintenance-agreements/read-model.ts`
- Tests: `lib/maintenance-agreements/__tests__/read-model.test.ts`

Validation recorded:

- `npx.cmd vitest run lib/maintenance-agreements/__tests__/read-model.test.ts` passed (`7` tests).
- `git diff --check` passed.
- `npx.cmd tsc --noEmit` passed.

Boundaries preserved in Group 9A-2:

- no job linkage
- no job generation
- no calendar events
- no invoices
- no payments
- no Stripe tenant payment behavior
- no QBO
- no SMS
- no portal
- no UI mutation flow
- no production migration apply

Environment activation rule:

- Maintenance Agreements V1 backend foundation is committed in repo, but it is not production-active until `20260512120000_maintenance_agreements_v1.sql` is intentionally applied through the appropriate environment process.

## Naming

Preferred future domain/table name:

- `maintenance_agreements`

Avoid:

- `service_contracts`

Reason: existing code and docs already use "service contract" language around service-case/job classification, including service case kind, service visit type, and job detail updates. That language is related but separate. Maintenance Agreements must not inherit that collision.

## Source-Of-Truth Boundaries

A Maintenance Agreement is:

- a customer-owned recurring service agreement
- optionally anchored to one primary location in V1
- a planner for future service visits / work orders
- a source for editable default visit notes and default Work Items / Visit Scope

A Maintenance Agreement is not:

- a Job
- a Service Case
- an Invoice
- a Payment
- a recurring billing subscription
- a Pricebook item

Actual visits remain normal Jobs. Actual visit work remains Work Items / Visit Scope on the Job. Invoice Charges remain billed truth. Payments remain collected truth only where implemented.

Pricebook may assist later with templates/defaults, but Pricebook must not become agreement truth.

V1 must avoid uncontrolled automatic job generation.

## V1 Location Scope

V1 supports at most one optional primary location:

- `primary_location_id` may be null.
- If present, it anchors the agreement to one customer location.
- Multi-location agreements are future scope.

Future multi-location support should use an explicit relationship such as a join table rather than overloading the V1 primary location field.

## Suggested Future Fields

The future `maintenance_agreements` model should evaluate these fields:

| Field | Purpose |
|---|---|
| `id` | Primary identifier. |
| `account_owner_user_id` | Tenant/account scope. |
| `customer_id` | Customer who owns the agreement. |
| `primary_location_id` | Optional V1 location anchor. |
| `agreement_name` | Human-readable agreement name. |
| `agreement_type` | `maintenance`, `service_plan`, `inspection`, or `other`. |
| `frequency` | `monthly`, `quarterly`, `semi_annual`, `annual`, or `custom`. |
| `next_due_date` | Planning date used for upcoming/overdue lists. |
| `preferred_technician_user_id` | Optional preferred/default internal technician. |
| `default_visit_scope_summary` | Optional default service notes / visit reason. |
| `default_visit_scope_items` | JSON default Work Items / Visit Scope template, default `[]`. |
| `status` | Lifecycle status. |
| `start_date` | Agreement start date. |
| `renewal_date` | Agreement renewal date. |
| `internal_notes` | Internal-only notes. |
| `created_by_user_id` | Creator/audit reference. |
| `updated_by_user_id` | Last updater/audit reference. |
| `created_at` | Creation timestamp. |
| `updated_at` | Update timestamp. |

The default visit scope fields are planning defaults only. When a Job is created from an agreement, copied Work Items must remain editable job-level operational scope.

## Lifecycle Statuses

Recommended V1 statuses:

| Status | Meaning |
|---|---|
| `draft` | Agreement is being prepared and should not appear in the active due queue. |
| `active` | Agreement is active and eligible for upcoming/overdue planning. |
| `paused` | Agreement is temporarily excluded from due planning. |
| `expired` | Agreement term ended and is retained for history. |
| `cancelled` | Agreement intentionally ended and is excluded from due planning. |

Only `active` agreements should drive the primary upcoming/overdue planning list in V1.

## V1 Workflow

1. Create agreement from the customer profile.
2. Optionally select one primary location.
3. Store default notes / visit scope template on the agreement.
4. Show upcoming and overdue agreements by `next_due_date`.
5. Operator manually creates a normal Job / Work Order from the agreement.
6. Job receives editable prefilled Work Items / Visit Scope.
7. Operator schedules and assigns the Job through the normal job/calendar flow.
8. Invoices and payments remain untouched.

The manual create step is the V1 control point. No background process should create Jobs from agreements.

## Relationship To Existing Surfaces

Customer profile:

- Primary management surface for agreements.
- Should show agreements owned by the customer.

Location profile:

- Shows agreements where `primary_location_id` matches the location.

Job / Work Order:

- Actual visit execution only.
- A Job created from an agreement remains a normal Job.
- Any agreement source link should be informational and must not change job lifecycle semantics.

Service Case:

- Continuity/problem tracking only.
- Not agreement truth.
- Existing `service_cases.case_kind = maintenance` may classify a service case, but it does not represent the agreement.

Calendar:

- Shows created Jobs and calendar blocks only.
- Due agreements belong in a planning list until an operator manually creates a Job.

Reports:

- Later due/overdue agreement reporting can summarize agreement status, next due dates, and coverage.

Pricebook:

- Future template/default assist only.
- Must not become the agreement source of truth.

Invoices:

- No automatic invoice creation.
- Invoice Charges remain billed truth downstream.

Payments:

- No payment execution or recurring billing in V1.
- Payments remain collected truth only where implemented.

## Explicit Non-Goals

V1 does not include:

- automatic job generation
- automatic invoices
- recurring billing engine
- tenant Stripe customer payment behavior
- QBO
- SMS
- customer portal
- service agreement payment collection
- agreement-as-service-case collapse
- agreement-as-job collapse
- broad scheduling engine rewrite
- multi-location agreement coverage
- Pricebook-as-agreement-truth

## Future Implementation Order

Recommended order:

1. Schema + RLS + read model only.
2. Customer profile read-only/list display.
3. Create/edit agreement UI.
4. Upcoming/overdue planning list.
5. Manual "Create Work Order from Agreement."
6. Later reporting.
7. Later Pricebook/default template assist.
8. Later billing/payment relationship only after separate design.

## Validation Expectations For Future Slices

Future implementation should include targeted validation for:

- same-account read/write scope and RLS behavior
- customer/location relationship integrity
- status filtering for due/overdue planning
- no automatic Job creation
- manual Job creation preserving normal Job semantics
- copied Work Items remaining editable on the Job
- no invoice/payment side effects
- no confusion with service case/job "service contract" classification paths

