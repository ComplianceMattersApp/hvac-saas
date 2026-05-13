# Maintenance Agreements / Recurring Services V1 Model Spec

Status: ACTIVE IMPLEMENTATION TRACKING SPEC
Owner lane: Group 9A - Recurring Services / Maintenance Agreements  
Scope: model guidance plus Group 9A-2 backend foundation closeout documentation. Backend foundation is committed in repo but is not production-active until migration apply is intentionally executed through the environment process.

## Purpose

Maintenance Agreements V1 defines the future customer-owned recurring service agreement model for Compliance Matters Software.

The V1 goal is simple: let an operator track recurring service obligations for a customer, optionally tied to one primary location, and manually create normal Jobs / Work Orders when a visit is due.

This spec is intentionally not a billing, payment, portal, SMS, or automation design.

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
- Browser smoke passed:
	- flag off: `/ops` hides Service Plans link and `/service-plans` fails closed/redirects
	- flag on: `/ops` link visible and `/service-plans` renders rows/customer links
	- inactive filter verified
	- `/ops` continuity confirmed

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

- Full manual click-through of every filter chip was not performed in browser smoke; helper bucket logic is covered by tests.

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

