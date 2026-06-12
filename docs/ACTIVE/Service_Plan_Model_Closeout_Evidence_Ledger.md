# Service Plan Model Closeout Evidence Ledger

Status: ACTIVE HISTORICAL EVIDENCE LEDGER
Scope: docs/evidence only. This file does not authorize product code, schema, migrations, Supabase commands, Stripe, QBO, SMS, portal, env, production, billing, payment, or automation changes.

## Purpose

This ledger is the historical evidence home for Group 9A Maintenance Agreements / Service Plans closeout proof.

Durable Maintenance Agreements / Recurring Services model truth remains in [Maintenance_Agreements_V1_Model_Spec.md](./Maintenance_Agreements_V1_Model_Spec.md), including lifecycle/status truth, visit and next-due boundaries, recurring-service V1 workflow, explicit non-goals, production-activation gates, and service-plan billing/payment separation.

Payment and service-plan billing evidence remains cross-linked through [Domain_Model_Closeout_Evidence_Ledger.md](./Domain_Model_Closeout_Evidence_Ledger.md) and [Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md](./Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md).

## Cleanup Rule

Future cleanup may shorten Group 9A closeout snapshots in the Maintenance Agreements spec only when the durable model contract remains clear in that spec and the implementation proof is represented here or in a linked closeout doc.

Do not move or blur these model truths out of the Maintenance Agreements spec:

- Maintenance agreements/service plans are customer-owned recurring-service obligations.
- Actual visits remain normal Jobs / Work Orders.
- `maintenance_agreement_visits` is the service-plan-to-job linkage and visit-counting surface.
- Visit counting and next-due confirmation are explicit operator actions, not automatic side effects.
- Service-plan billing/payment behavior stays separate from operational service-plan workflow.
- Production activation remains gated by intentional migration apply and feature-flag/environment process.

## Evidence Ownership Map

| Group 9A area | Historical evidence home | Durable contract owner |
| --- | --- | --- |
| Schema/RLS/read model foundation | This ledger | Maintenance Agreements model spec |
| Customer profile read-only/create-edit flows | This ledger | Maintenance Agreements model spec |
| Due/overdue summary and Ops/read-only drilldown | This ledger | Maintenance Agreements model spec |
| Manual Create Work Order from Service Plan | This ledger | Maintenance Agreements model spec |
| Visit link table, link creation, counting, and next-due confirmation | This ledger | Maintenance Agreements model spec |
| Service Plan command-center cleanup | This ledger plus [Service_Plans_Command_Center_Cleanup_Closeout.md](./Service_Plans_Command_Center_Cleanup_Closeout.md) | Maintenance Agreements model spec |
| Service-plan billing/payment closeouts | Domain model evidence ledger and Payments V2 spec | Payments V2 spec plus Maintenance Agreements model spec for operational boundaries |

## Group 9A-2: Schema / RLS / Read Model Foundation

Preserved evidence:

- Maintenance Agreements V1 backend foundation was implemented in repo behind production activation gates.
- Migration `20260512120000_maintenance_agreements_v1.sql` introduced the initial Maintenance Agreements schema.
- Read-model coverage was added under `lib/maintenance-agreements/read-model.ts` with targeted tests.
- Validation recorded targeted Vitest coverage, TypeScript no-emit, and `git diff --check`.

Durable model truth retained in the Maintenance spec:

- Backend foundation is not production-active until migration apply is intentionally executed through the environment process.
- No job linkage, job generation, calendar events, invoices, payments, Stripe tenant payment behavior, QBO, SMS, portal, or UI mutation flow was introduced in this foundation slice.

## Group 9A-3: Customer Profile Read-Only Section

Preserved evidence:

- Customer profile gained a feature-gated read-only Maintenance Agreements / Service Plans section.
- Exposure was guarded through the Maintenance Agreements feature flag with fail-safe read behavior.
- Validation recorded targeted maintenance agreement tests and TypeScript no-emit.

Durable model truth retained in the Maintenance spec:

- Production does not attempt Maintenance Agreement reads until migration apply and feature enablement are intentionally approved.
- Read-only customer visibility does not create/edit agreements, generate jobs, mutate calendars, create invoices/payments, or expose customer portal behavior.

## Group 9A-4: Create / Edit V1

Preserved evidence:

- Customer profile create/edit flows for Maintenance Agreements V1 were implemented in repo and sandbox-ready behind feature gating.
- Create/edit fields included agreement name, type, frequency, next due date, start date, renewal date, primary location, default visit scope summary, internal notes, and status on edit.
- Validation recorded targeted action tests, TypeScript no-emit, browser smoke for create/update redirect states, and existing customer profile continuity.

Durable model truth retained in the Maintenance spec:

- Create/edit does not include delete, customer reassignment, preferred technician UI, multi-location coverage, job generation, calendar events, invoices/payments, Stripe tenant payment behavior, QBO, SMS, customer portal exposure, or production migration/flag enablement.

## Group 9A-5B: Due / Overdue Summary Read Model

Preserved evidence:

- `summarizeMaintenanceAgreementsForAccount` was added as the due/overdue summary read model.
- Summary output included status counts, due buckets, total count, and as-of date.
- Validation recorded targeted maintenance agreement read-model tests, TypeScript no-emit, and `git diff --check`.

Durable model truth retained in the Maintenance spec:

- Due buckets are account-scoped, active-agreement-only, and safe-empty on missing/invalid scope.
- Due-window buckets are intentionally exclusive and should be labeled clearly in UI.
- Summary logic introduced no UI, routes, schema, migrations, production writes, feature flag changes, job generation, calendar events, invoices, payments, Stripe/QBO/SMS, or portal behavior.

## Group 9A-6: Ops Read-Only Service Plans Card

Preserved evidence:

- `/ops` gained a feature-gated, read-only Service Plans summary card backed by the maintenance agreement read model.
- Browser smoke covered flag-off hidden behavior and flag-on visible counts.
- Validation recorded targeted maintenance agreement tests, TypeScript no-emit, and `git diff --check`.

Durable model truth retained in the Maintenance spec:

- Ops card is summary-only and fail-safe.
- It does not create/edit service plans, generate jobs, create calendar events, mutate invoices/payments, or expose Stripe/QBO/SMS/customer portal behavior.

## Group 9A-7B: Manual Create Work Order From Service Plan

Preserved evidence:

- Customer profile Maintenance Agreement cards gained a compact manual `Create Work Order` entry point.
- `/jobs/new` resolves service-plan prefill server-side when feature flag, internal context, UUID shape, account scope, and customer scope are valid.
- Prefill includes customer/location, service/maintenance defaults, reason/dispatch notes, editable default Work Items, and an agreement context banner.
- Browser smoke confirmed normal job creation through the existing flow and agreement unchanged after submit.

Durable model truth retained in the Maintenance spec:

- Manual create is the V1 control point.
- Service-plan prefill creates a normal Job / Work Order; it does not auto-generate jobs, mutate agreement truth, advance next due date, deduct visit balance, create persisted job/agreement linkage in this slice, or create invoice/payment behavior.

## Group 9A-8B: `/service-plans` Read-Only Drilldown

Preserved evidence:

- `/service-plans` was added as an internal/account-scoped, feature-gated, read-only drilldown page with filters.
- `/ops` links to the drilldown page through the Service Plans summary card.
- Validation recorded targeted read-model tests, TypeScript no-emit, `git diff --check`, and browser smoke for flag-off and flag-on states.

Durable model truth retained in the Maintenance spec:

- `/service-plans` remains read-only and does not create/edit service plans, create work orders, generate jobs, advance due dates, deduct visit balance, or mutate invoice/payment behavior.

## Group 9A-9A: Service Plan Job Linkage / Visit Balance Model

Preserved evidence:

- Group 9A-9A was a docs/model decision pass with no implementation changes.
- It selected a separate link-table model, later implemented as `maintenance_agreement_visits`, instead of making `jobs.maintenance_agreement_id` the long-term source of truth.

Durable model truth retained in the Maintenance spec:

- Visit balance should derive from valid counted link rows and agreement term/included-visit configuration when available.
- Do not store mutable remaining visits as V1 source-of-truth.
- `next_due_date` remains manual/current-scope operational truth until explicit operator-confirmed behavior is designed.
- Cancelled/no-show/duplicate/rescheduled handling must avoid double-counting.

## Group 9A-9B: Visits Link Table Foundation

Preserved evidence:

- `maintenance_agreement_visits` link table foundation and read helpers were implemented in repo.
- Migration `20260513110000_maintenance_agreement_visits_link_foundation.sql` introduced the link table.
- Read helpers list links by agreement/job and summarize link counts.
- Validation recorded targeted maintenance agreement tests, TypeScript no-emit, and `git diff --check`.

Durable model truth retained in the Maintenance spec:

- Link table connects Maintenance Agreements / Service Plans to Jobs / Work Orders.
- It is not job truth, agreement truth, billing truth, or payment truth.
- New links default to linked/not-counted.
- Used visits project only from `count_status = counted` with `counts_toward_visit_balance = true`.
- No DELETE policy is intended in V1; reversal/status semantics preserve history.
- Link table activation depends on intentional migration apply.

## Group 9A-9C: Link Row Creation From Service Plan Job Creation

Preserved evidence:

- Service-plan-origin job creation was wired to create a `maintenance_agreement_visits` link row.
- Link creation is non-blocking and handles duplicates gracefully.
- Validation recorded targeted maintenance agreement tests, TypeScript no-emit, and `git diff --check`.

Durable model truth retained in the Maintenance spec:

- Link rows use `link_source = service_plan_prefill`, `count_status = linked`, and `counts_toward_visit_balance = false`.
- Agreement record is not mutated, next due date is not advanced, visit balance is not deducted, and no automatic counting occurs.

## Group 9A-9E: Work Items Prefill And Link Creation Runtime Fix

Preserved evidence:

- Default Work Items now persist on agreement create/update and prefill into `/jobs/new`.
- Job creation ordering was fixed so link creation occurs before redirecting post-create behavior.
- Browser smoke confirmed seeded default Work Items, prefilled job intake, persisted service/maintenance visit scope fields, and linked/not-counted visit link creation.

Durable model truth retained in the Maintenance spec:

- Service-plan-origin jobs remain normal jobs with editable job-level Work Items.
- Agreement record remains unchanged during job creation.
- No automatic counting, due-date advancement, visit-balance deduction, recurrence engine, invoice/payment behavior, Stripe/QBO/SMS, or customer portal behavior was introduced.

## Group 9A-10B: Count Eligibility Read-Only Projection

Preserved evidence:

- `/service-plans` gained read-only Visit Count Review projection labels and count review visibility.
- Browser smoke confirmed the column, labels, filters, customer links, and absence of mutation controls.
- Validation recorded targeted maintenance agreement tests, TypeScript no-emit, and `git diff --check`.

Durable model truth retained in the Maintenance spec:

- Projection remains read-only.
- Used visits derive only from counted links with `counts_toward_visit_balance = true`.
- No count-status mutation, automatic counting, Mark Visit Counted action, due-date advancement, visit-balance deduction, mutable remaining-visit counter, billing/payment behavior, recurrence generation, SMS/QBO/portal behavior, or customer portal behavior was introduced.

## Group 9A-10C: Manual Mark Visit Counted

Preserved evidence:

- Eligible linked maintenance jobs on job detail gained operator-confirmed `Mark Visit Counted` behavior.
- Visibility was moved from a collapsed edit container into always-visible job-detail scope after an initial placement issue.
- Browser smoke confirmed linked/not-counted to counted transition, projected service-plan status update, unchanged agreement next due date, and no invoice/payment side effects.
- Validation recorded targeted maintenance agreement and job-detail entitlement tests, TypeScript no-emit, and `git diff --check`.

Durable model truth retained in the Maintenance spec:

- Mark Visit Counted mutates only the targeted `maintenance_agreement_visits` link row.
- It sets counted state, used-visit flag, counted timestamp, counted user, and updater.
- It does not mutate the agreement record, advance next due date, create invoices/payments, introduce automatic counting, generate recurrence, create portal/SMS/QBO behavior, or use mutable remaining-visit counters.

## Group 9A-11A: Due-Window And Next-Due Model

Preserved evidence:

- Group 9A-11A was a docs/model decision pass with no implementation changes.
- It established "Simple first. Helpful next. Automation last." as the guiding product principle.

Durable model truth retained in the Maintenance spec:

- Counting a visit must not automatically advance `maintenance_agreements.next_due_date`.
- Future next-due writes must be explicit and operator-confirmed.
- Interval suggestions use cadence-preserving roll-forward logic.
- Seasonal service-window behavior remains future/template-driven.
- Custom/manual frequency does not render a confirm action.
- Invoice/payment, recurrence, automatic job generation, renewal automation, portal/SMS/QBO, and template/window schema implementation were non-goals.

## Group 9A-11B: Read-Only Suggested Next Due Projection

Preserved evidence:

- Job detail gained read-only suggested next due projection after a Service Plan visit is counted.
- Browser validation confirmed suggestion copy, no confirm action in that slice, counted link state, unchanged agreement next due date, and no invoice/payment rows.
- Validation recorded targeted maintenance agreement tests, TypeScript no-emit, and `git diff --check`.

Durable model truth retained in the Maintenance spec:

- Suggestion is read-only.
- Agreement `next_due_date` is not mutated.
- No automatic advancement, confirm action, invoice/payment behavior, recurrence engine, automatic job generation, SMS/QBO/customer portal behavior, or seasonal-window implementation was introduced.

## Group 9A-11C-A: Confirm Next Due Planning

Preserved evidence:

- Group 9A-11C-A was a docs/model update only with no implementation changes.
- It selected job detail as the first confirm-action location and parked customer profile, `/service-plans`, and seasonal-window confirm surfaces.

Durable model truth retained in the Maintenance spec:

- Suggested next due date must never auto-write.
- Confirm action requires active agreement, counted link, interval frequency, matching account/customer scope, suggested date availability, and stale-state protection.
- Future confirm action may update only `maintenance_agreements.next_due_date`, updater, and normal timestamp behavior.
- It must not mutate visit links, jobs, service cases, calendar events, invoices, or payments in that planning contract.

## Group 9A-11C-B: Confirm Next Due Action

Preserved evidence:

- Job detail gained an operator-confirmed `Confirm Next Due Date` action for counted Service Plan visits with valid interval suggestions.
- Server action includes optimistic concurrency guard and redirects with explicit banners.
- Validation recorded a comprehensive unit test suite, TypeScript no-emit, and `git diff --check`.

Durable model truth retained in the Maintenance spec:

- Confirm action is job-detail-only in this phase.
- It updates only agreement next due fields and does not mutate visit links, jobs, service cases, calendar events, invoices, or payments.
- It blocks stale baseline, custom/manual frequency, inactive agreement, non-counted link, disabled feature flag, and out-of-scope records.
- Customer profile confirm, `/service-plans` confirm, and seasonal-window confirm remain parked.

## Group 9A-13A: Work Item Validation Fix

Preserved evidence:

- Service Plan prefill now normalizes legacy/default Work Item shapes into canonical structured Work Item fields before job-intake sanitization.
- Browser smoke confirmed legacy/default Work Item data rendered meaningful titles and submitted successfully without manual Pricebook reselection.
- Validation recorded targeted read-model and job default tests, TypeScript no-emit, and `git diff --check`.

Durable model truth retained in the Maintenance spec:

- Prefilled Service Plan Work Items remain editable job-level operational scope.
- The fix did not change visit counting, next due date, invoice/payment behavior, schema, migrations, feature flags, recurrence/job generation, or production writes.

## Group 9A-13B-A: Next Due Idempotency Model

Preserved evidence:

- Group 9A-13B-A was a docs/model decision pass with no implementation changes.
- It identified durable per-link confirmation metadata as required before persistent confirm UI would be safe.

Durable model truth retained in the Maintenance spec:

- Visit link is the idempotency surface because the counted visit is the business event causing next-due write.
- Confirm Next Due may update agreement next due and link confirmation metadata together as one logical operation.
- A counted link must not advance the date more than once.
- Persistent UI should show read-only confirmed context after confirmation.

## Group 9A-13B-B / B1: Metadata Foundation And Sandbox Migration

Preserved evidence:

- Metadata foundation added nullable next-due confirmation fields to `maintenance_agreement_visits`.
- Read-model types, normalization, selectors, and confirmation helper were updated.
- Sandbox migration apply and verification confirmed metadata columns, FK, RLS, policies, null backfill posture, and no production migration apply.
- Validation recorded targeted maintenance agreement tests, TypeScript no-emit, `git diff --check`, and clean status.

Durable model truth retained in the Maintenance spec:

- Metadata fields are nullable, do not backfill existing rows, and do not change count status or agreement mutation behavior by themselves.
- No UI behavior changes, confirm action behavior changes, agreement mutation changes, count-status lifecycle changes, automatic due-date advancement, recurrence engine, invoice/payment/calendar behavior, feature flag changes, production migration apply, or production writes were introduced.

## Group 9A-13B-C / C1: Idempotent Confirm Write

Preserved evidence:

- Confirm Next Due Date was updated to write agreement next due and visit-link confirmation metadata together.
- Browser smoke validated first confirm, metadata capture, unchanged count flags, no invoice creation, and repeat confirm blocked by already-confirmed banner.
- A follow-up display fix formatted date-only values safely as `MM/DD/YYYY` without changing stored values or hidden form values.
- Validation recorded targeted maintenance agreement tests, TypeScript no-emit, and `git diff --check`.

Durable model truth retained in the Maintenance spec:

- Link metadata is idempotency truth.
- A counted visit can confirm next due once.
- Existing stale-state guard remains intact.
- Confirm surface remains job-detail-only.
- No automatic due-date advancement, recurrence, automatic job generation, invoice/payment behavior, SMS/QBO/portal behavior, customer profile confirm, `/service-plans` confirm, persistent UI expansion, schema changes, migrations, production writes, or feature flag changes were introduced.

## Group 9A-13B-D1 / D2: Persistent Next-Due Context

Preserved evidence:

- Job detail next-due context became durable counted-link state, not transient banner state.
- Confirmed and unconfirmed counted-link states render different read-only/action contexts.
- Banner mappings and date-only display formatting were unified.
- Validation recorded TypeScript no-emit, `git diff --check`, and browser smoke for confirmed/unconfirmed counted-job states.

Durable model truth retained in the Maintenance spec:

- Counted unconfirmed links may show suggested next due plus confirm action.
- Counted confirmed links show read-only confirmed context and hide confirm action.
- Stored values and hidden form values remain `YYYY-MM-DD`.
- No date calculation, server action behavior, automatic due-date advancement, recurrence, automatic job generation, invoice/payment behavior, SMS/QBO/portal behavior, customer profile confirm, `/service-plans` confirm, schema, migration, production write, or feature flag behavior changed.

## Group 9A-14B / 14C: Navigation And Customer Snapshot Polish

Preserved evidence:

- `/service-plans` remained read-only and added deep links to focused customer agreement cards.
- Customer profile Service Plan cards gained a read-only Plan Snapshot and What's Included section before edit controls.
- Browser smoke confirmed service-plan deep links, anchor/focus behavior, Plan Snapshot visibility, What's Included visibility, Create Work Order availability, collapsed secondary Edit Details, and read-only `/service-plans`.
- Validation recorded TypeScript no-emit and `git diff --check`.

Durable model truth retained in the Maintenance spec:

- `/service-plans` is a read-only operational surface.
- Customer profile remains the management surface for create/edit/work-order/default-work actions.
- No persistence logic, server action, visit-counting behavior, next-due behavior, invoice/payment behavior, calendar/recurrence behavior, schema, migrations, production writes, or feature flag behavior changed.
- Service Plans / Maintenance Agreements were closed for field-feedback after this pass unless real workflow bugs or validated feedback reopen the lane.

## Group 9A-15A: Templates / Locked Package Model

Preserved evidence:

- Service Plan Templates foundation, template management, customer create-from-template prefill, template provenance snapshot, duplicate template flow, package lock metadata, strict package values, server-side locked-field enforcement, and customer read-only locked package rendering were completed.

Durable model truth retained in the Maintenance spec:

- Template package lock behavior does not introduce automatic jobs, recurrence engine, invoice/payment/autopay changes, visit-count mutation, next-due mutation, portal/SMS/QBO behavior, or removal of manual Service Plan creation.

## Later Cleanup Candidates

After this ledger is accepted, the Maintenance Agreements model spec can safely shorten Group 9A closeout snapshots by replacing implementation-heavy sections with concise summaries and backlinks here.

Strong first candidates:

- Group 9A-2 through 9A-8B foundational implementation evidence.
- Group 9A-9B through 9A-10C implementation/test/smoke details while keeping visit-link and counting contracts.
- Group 9A-11B and 9A-11C-B fixture/test detail while keeping next-due read/write contracts.
- Group 9A-13B-B1 sandbox migration verification detail while keeping metadata and activation truth.
- Group 9A-14B/14C UI polish closeout detail.

Keep in the model spec:

- Source-of-truth boundaries.
- Lifecycle statuses.
- V1 workflow and non-goals.
- Visit linkage and count-status lifecycle.
- Manual count and next-due confirmation mutation contracts.
- Feature-gate and production-activation safety rules.
- Billing/payment separation.
