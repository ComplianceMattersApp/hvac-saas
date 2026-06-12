# Maintenance Agreements / Recurring Services V1 Model Spec

Status: ACTIVE IMPLEMENTATION TRACKING SPEC
Owner lane: Group 9A - Recurring Services / Maintenance Agreements  
Scope: model guidance plus Group 9A-2 backend foundation closeout documentation. Backend foundation is committed in repo but is not production-active until migration apply is intentionally executed through the environment process.

## Documentation Authority Note

This spec owns durable Maintenance Agreements / Recurring Services source-of-truth contracts, lifecycle/status rules, service-plan operational boundaries, and recurring-service model decisions. Group 9A implementation and closeout evidence belongs in [Service_Plan_Model_Closeout_Evidence_Ledger.md](./Service_Plan_Model_Closeout_Evidence_Ledger.md). Duplicated payment/service-plan billing smoke evidence belongs in [Domain_Model_Closeout_Evidence_Ledger.md](./Domain_Model_Closeout_Evidence_Ledger.md), with durable payment/billing contracts owned by [Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md](./Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md) and roadmap/deferred sequencing owned by roadmap docs.

Duplicated closeout sections may be shortened against the evidence ledger when the durable model contract remains clear in this spec. Do not remove service-plan lifecycle truth, visit/next-due operational boundaries, source-of-truth boundaries, or production-activation safety notes from this spec.

## Service Plan / Payment Closeout Evidence Summary

Historical closeout proof for the Service Plans command-center cleanup, Phase 6F-C manual saved-card charge, Phase 6G scheduled-autopay attempt smoke, Phase 6H failed-autopay attention/retry, and Phase 6I failed-payment reconciliation visibility is preserved in [Domain_Model_Closeout_Evidence_Ledger.md](./Domain_Model_Closeout_Evidence_Ledger.md). Full Service Plans command-center cleanup detail remains in [Service_Plans_Command_Center_Cleanup_Closeout.md](./Service_Plans_Command_Center_Cleanup_Closeout.md).

This spec keeps the durable Maintenance Agreements / Recurring Services contracts:

- Maintenance agreements/service plans remain the recurring-service lifecycle owner.
- Service-plan visits and next-due operational truth must not be payment-mutated.
- Service-plan billing integration must preserve the boundary between recurring-service operations and invoice/payment truth.
- Service plan UI changes do not alter billing logic, visit generation, payment/invoice truth, Stripe/webhook behavior, customer portal behavior, schema/migrations, or role/capability rules unless an owner spec explicitly unlocks that work.
- Production activation remains gated by intentional environment process and applicable migration/feature-flag controls.

## Purpose

Maintenance Agreements V1 defines the future customer-owned recurring service agreement model for Compliance Matters Software.

The V1 goal is simple: let an operator track recurring service obligations for a customer, optionally tied to one primary location, and manually create normal Jobs / Work Orders when a visit is due.

This spec is intentionally not a billing, payment, portal, SMS, or automation design.

Financial/payment model boundary:

- Future recurring maintenance/service-plan billing must follow the Financial Ledger / Payments Register V1 model lock in [Financial_Ledger_Payments_Register_V1_Model_Spec.md](./Financial_Ledger_Payments_Register_V1_Model_Spec.md).
- Service Plan Billing Foundation Phase 2 model lock is documented in [Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md](./Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md).
- Recurring billing must connect through billing periods and payment allocations.
- First Service Plan Billing posture is billing-period plus normal internal invoice linkage, with customer payment through existing invoice payment infrastructure.
- Internal invoice/payment linkage is optional and must not be required for operational workflow progression.
- Jobs/work orders, service-plan visit creation/scheduling/completion, visit counting, and next-due confirmation must remain operationally available without internal payment attachment.
- External-billing/off-platform postures must remain first-class supported paths for work tracking.
- Future Service Plan Billing Period posture must allow internal invoice-backed, external/off-platform, manual, no-charge, waived, and not-billed-through-Compliance-Matters paths.
- Payment status can drive warnings/reporting context, but must not hard-block service-plan operational workflow in current posture unless explicitly reopened later.
- Money must not attach directly to service visit links, visit count rows, or `maintenance_agreement_visits`.

Deferred future-lane cross-reference:
- Workflow Presets / Operational Flow Templates is a deferred planning lane for future milestone-guided operational continuity across repeatable multi-step flows.
- It does not change current maintenance agreement/source-of-truth/payment boundaries in this spec and does not authorize scheduler automation or hidden lifecycle mutation.
- Canonical sequencing/governance for that lane is maintained in `Release_Scope_Lock_and_Post_Launch_Roadmap.md` and mirrored in the Active Spine.

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
	- `maintenance_agreement_visit` IDs
	- visit-count fields
	- `next_due_date` mutation fields
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

## Pre-Group-9A Billing / Payment Boundary Summary

Detailed Phase 5C through Phase 6E implementation proof, production dormant migration evidence, sandbox smoke, test records, and saved-card setup evidence are preserved in [Domain_Model_Closeout_Evidence_Ledger.md](./Domain_Model_Closeout_Evidence_Ledger.md). Durable payment, allocation, saved-method, and service-plan billing contracts are owned by [Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md](./Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md) and [Financial_Ledger_Payments_Register_V1_Model_Spec.md](./Financial_Ledger_Payments_Register_V1_Model_Spec.md).

This Maintenance spec keeps the operational service-plan boundaries that must remain visible here.

### Billing Period Foundation And Dormant Activation

- `maintenance_agreement_billing_periods` is the Service Plan Billing Period table and commercial coverage-window surface.
- Billing periods are not visit truth, job truth, invoice truth, payment truth, allocation truth, or operational blocking truth.
- Required first-posture fields include account, maintenance agreement, optional customer, coverage window, due date, cadence, amount/currency, billing posture, lifecycle status, optional linked internal invoice, external/off-platform reference fields, no-charge/waiver/not-billed reason fields, and audit fields.
- Forbidden first-posture fields remain payment IDs, allocation IDs, visit IDs, visit-count fields, `next_due_date` mutation fields, operational blocking flags, direct Stripe/subscription IDs, and QBO IDs.
- Billing-period lifecycle statuses remain `draft`, `pending_billing`, `invoice_linked`, `externally_billed`, `no_charge`, `waived`, `not_billed`, and `cancelled`.
- Billing posture values remain `internal_invoice`, `external_off_platform`, `manual`, `no_charge`, `waived`, and `not_billed_through_compliance_matters`.
- Billing-period schema foundation is additive and dormant until intentionally applied/enabled through environment process. Production dormant migration proof is preserved in the domain evidence ledger.

### Read Model And Visibility Boundaries

- Billing period paid/unpaid display state is derived read truth only and cannot become operational truth.
- Invoice-backed rows derive payment state from linked internal invoice/payment truth only.
- Pending, failed, reversed, void, or attention states may surface warning context without changing paid math.
- Billing-period read models must not directly read or write payment allocations as operational service-plan truth.
- Customer-profile billing period visibility is display-only unless using explicit financial-authority mutation controls.
- Billing periods remain non-blocking for work orders, visits, visit counting, next due date, and service-plan operational progression.

### Manual Billing Period Mutation

- Manual billing-period mutation starts customer-profile-only inside existing Maintenance Agreement cards.
- Mutation authority is Owner/Admin/Billing financial authority; read visibility may remain broader/internal under existing Maintenance Agreement visibility.
- First mutation posture supports create/edit/cancel only. Delete remains forbidden.
- Cancellation is non-destructive and uses `billing_period_status = cancelled`.
- Required manual-mutation fields are coverage start/end, billing cadence, amount, currency, billing posture, and lifecycle status, with account/customer/agreement derived from scoped context.
- Posture-specific validation remains locked: internal invoice/manual postures require amount-positive draft/pending states, external-off-platform supports externally billed state, no-charge normalizes to zero/no-charge, waived requires reason, and not-billed-through-Compliance-Matters normalizes to not-billed with reason.
- Coverage windows require valid dates, end date >= start date, duplicate/overlap protection for non-cancelled rows, and cancelled rows not blocking future windows unless a later model changes that rule.
- Edits are limited to non-linked rows.
- Manual billing-period mutation does not generate invoices, write payment rows, write allocation rows, call Stripe, switch payment projections/read paths, mutate service-plan visits, mutate `next_due_date`, or block service work.

### Invoice Link / Unlink Relationship

- First invoice relationship posture is manual link to an existing internal invoice.
- Billing-period invoice generation, non-job invoice model expansion, generated line items, automatic issue/send, automatic payment-link creation, Stripe checkout from billing periods, billing-period-targeted allocations, autopay/subscriptions, QBO, ACH, refunds, disputes, saved cards, partial payments, receipt automation, and platform-fee execution remain deferred unless explicitly reopened by owner specs.
- Manual link eligibility requires Owner/Admin/Billing authority, same-account billing period and invoice scope, non-cancelled/unlinked billing period, non-void and unclaimed invoice, invoice-customer alignment where customer scope exists, and invoice job linkage to the same maintenance agreement through `maintenance_agreement_visits`.
- Manual unlink/correction is non-destructive, requires a reason, clears only `internal_invoice_id`, and returns the billing period to `pending_billing` unless a later approved model changes this rule.
- Linking sets billing-period status to `invoice_linked`.
- Paid/partial/unpaid remains derived from invoice/payment truth.
- Voided linked invoice should surface `invoice_void` display state without auto-mutating billing/payment truth.
- Invoice webhook/payment events must not auto-mutate billing-period lifecycle in first posture.
- Link/unlink actions must not generate invoices, create invoice line items, issue/send/email invoices, create payment links, mutate payment/allocation rows, call Stripe, switch projections/read paths, mutate `maintenance_agreement_visits`, or mutate `next_due_date`.

### Generated Draft Invoice Guardrails

- Generated draft invoice posture is bounded to explicit financial-authority action from an eligible billing period.
- Eligibility requires same-account billing period, non-cancelled and currently unlinked period, `internal_invoice` posture, positive amount due, same-account/customer-aligned anchor job, anchor job linked to the same maintenance agreement via `maintenance_agreement_visits`, and no active non-void invoice already on the anchor job.
- First generated invoice posture keeps `internal_invoices` job-scoped and does not expand away from required `job_id`.
- Generated invoice is draft-only and must not trigger issue/send/email/payment-link behavior.
- One controlled service-plan billing line may be created from billing period amount/cadence/coverage window with allowed existing invoice line-item provenance.
- Link-state and active-invoice guards provide first-slice idempotency; dedicated generation audit remains future additive model work.
- Generated draft invoice action must not create payment rows, allocation rows, Stripe/saved-card/autopay/scheduler behavior, visit mutation, or `next_due_date` mutation.
- Phase 6C generated draft invoice sandbox smoke evidence is preserved in the domain evidence ledger.

### Saved Method / Autopay Boundary

- Full recurring-service automation requires separate lanes for generated invoices, Stripe-saved payment methods, explicit autopay consent, manual charge saved payment method, scheduled autopay attempts, and failed-payment/retry/attention workflow.
- Maintenance Agreement remains recurring service obligation truth.
- Billing Period remains commercial coverage-window truth.
- Internal Invoice remains billed commercial truth.
- Internal Invoice Payment remains collected/failed payment event truth where materially recorded.
- Payment Allocation remains invoice-targeted allocation truth.
- Stripe remains processor/payment-method/money-movement truth.
- Autopay consent remains instruction/consent/audit truth, not implied by saved card presence.
- Visits and `next_due_date` are operational truth and must never auto-mutate from payment success, payment failure, saved-card setup, or autopay state.
- Compliance Matters must never store full card number, CVC, raw bank/card credentials, Stripe secrets, client secrets, or reusable payment credentials.
- Compliance Matters may store only safe Stripe references/metadata and workflow/audit records.
- Saved method present does not imply autopay enabled.
- Autopay requires explicit maintenance-agreement-scoped consent, disabled by default, with distinct lifecycle states such as enabled, disabled, paused, revoked, and stale/invalid.
- `tenant_saved_method_payment_attempts` is workflow/audit truth; manual charge actions and schedulers must never directly mark invoices paid.
- Webhook-confirmed internal invoice payment plus allocation truth remains the only collected-money source.
- Saved-card setup evidence from Phase 6E-C is preserved in the domain evidence ledger.
## Group 9A Model Summary

Detailed Group 9A implementation history, commit/test records, fixture smoke, sandbox verification, and UI closeout proof are preserved in [Service_Plan_Model_Closeout_Evidence_Ledger.md](./Service_Plan_Model_Closeout_Evidence_Ledger.md). This spec keeps the durable service-plan model contracts.

### Foundation And Activation

- Maintenance Agreements V1 backend foundation exists in repo but becomes production-active only after intentional migration apply and feature-flag/environment approval.
- The customer profile read surface is feature-gated and fail-safe; production must not read Maintenance Agreements tables until migration apply and feature enablement are approved.
- Customer profile create/edit V1 supports agreement name, type, frequency, next due date, start date, optional renewal date, optional primary location, default visit scope/default Work Items, internal notes, and status on edit.
- Create/edit V1 does not include delete, customer reassignment, preferred technician UI, multi-location coverage, automatic job generation, calendar events, invoices/payments, Stripe tenant payment behavior, QBO, SMS, portal exposure, or production migration/flag enablement.

### Due / Overdue Read Models And Read-Only Surfaces

- `summarizeMaintenanceAgreementsForAccount` is the due/overdue summary read model.
- Summary output includes status counts, due counts, total count, and as-of date.
- Due buckets are account-scoped, include active agreements only, exclude inactive statuses, and treat missing/invalid `next_due_date` as `not_scheduled_active`.
- Due-window buckets are intentionally exclusive; UI labels should use explicit ranges such as Overdue, Due Today, Due in 1-7 Days, and Due in 8-30 Days.
- `/ops` Service Plans card and `/service-plans` drilldown are feature-gated, internal/account-scoped, read-only visibility surfaces.
- `/service-plans` does not create/edit service plans, create work orders, generate jobs, advance due dates, deduct visit balance, or mutate invoice/payment behavior.

### Manual Create Work Order From Service Plan

- Customer profile Maintenance Agreement cards expose a manual `Create Work Order` entry point when feature-gated.
- `/jobs/new` resolves service-plan prefill server-side only when feature flag, internal context, UUID shape, account scope, and customer scope are valid.
- Prefill may include customer/location, service/maintenance defaults, reason/dispatch notes, editable default Work Items, and an agreement context banner.
- The submit path remains normal job creation. A service-plan-origin job is still a normal Job / Work Order.
- Agreement record is not mutated by job creation.
- Manual create does not automatically generate jobs, create calendar events, advance `next_due_date`, deduct visit balance, create invoices/payments, or expose Stripe/QBO/SMS/customer portal behavior.

### Visit Link Table And Count Status Lifecycle

- `maintenance_agreement_visits` is the durable link table connecting Maintenance Agreements / Service Plans to Jobs / Work Orders.
- Do not use direct `jobs.maintenance_agreement_id` as the primary long-term visit-accounting source of truth.
- The link table is not job truth, agreement truth, billing truth, or payment truth.
- Link source values distinguish service-plan prefill, manual, and future system origins.
- Count status lifecycle supports `linked`, `eligible`, `counted`, `excluded`, and `reversed`.
- New service-plan-origin job links default to `link_source = service_plan_prefill`, `count_status = linked`, and `counts_toward_visit_balance = false`.
- Used visits project only from links with `count_status = counted` and `counts_toward_visit_balance = true`.
- Excluded and reversed links preserve history without counting.
- No DELETE policy is intended in V1; reversal/status semantics preserve link history.
- Link creation is non-blocking and duplicate-safe; invalid or out-of-scope agreement prefill must not block normal job creation.
- Jobs without customer linkage may fail or skip service-plan link creation until the model explicitly broadens beyond customer/account scope.

### Work Items Prefill And Validation

- Service Plan / Maintenance Agreement default Work Items persist on agreement create/update and prefill into `/jobs/new`.
- Service-plan-origin job creation persists normal job-level service/maintenance visit scope fields.
- Prefilled Service Plan Work Items remain editable job-level operational scope.
- Service Plan prefill normalizes legacy/default Work Item shapes into canonical structured Work Item fields before job-intake sanitization.
- Valid legacy/default Work Item data should survive prefill and allow job creation without manual Pricebook reselection.
- Work Items prefill does not change visit counting, next due date, invoice/payment behavior, schema, migrations, feature flags, recurrence/job generation, or production writes.

### Count Eligibility And Manual Mark Visit Counted

- `/service-plans` may show read-only Visit Count Review projection labels such as No linked visits, Linked, Eligible for count review, Counted, Excluded, Reversed, and Not eligible.
- Projection remains read-only and does not mutate visit-link lifecycle.
- Eligible linked maintenance jobs on job detail may surface `Service Plan Visit Count Review` with operator-confirmed `Mark Visit Counted`.
- `Mark Visit Counted` mutates only the targeted `maintenance_agreement_visits` link row:
  - `count_status = counted`
  - `counts_toward_visit_balance = true`
  - `counted_at`
  - `counted_by_user_id`
  - updater metadata
- Agreement record is not mutated.
- `next_due_date` is not advanced.
- No invoice/payment behavior, automatic counting, recurrence, QBO/SMS/customer portal behavior, renewal automation, or mutable remaining-visit counter is introduced by marking a visit counted.

### Due-Window And Suggested Next Due Model

- Guiding principle: simple first, helpful next, automation last.
- Counting a Service Plan visit must not automatically advance `maintenance_agreements.next_due_date`.
- Any next-due write must be explicit and operator-confirmed.
- Interval suggestions use cadence-preserving roll-forward logic:
  - start from current `agreement.next_due_date`
  - add the configured frequency interval
  - if result is on or before the counted completion anchor, roll forward by the same interval until after the anchor
- Supported interval frequencies are `monthly`, `quarterly`, `semi_annual`, and `annual`.
- `custom` frequency or missing `next_due_date` falls back to manual scheduling guidance.
- Seasonal service-window behavior remains future/template-driven and should prefer service-window language rather than implying a single fixed date.
- Suggested next due context is read-only until an explicit confirm action is available.
- Read-only suggested next due projection does not mutate the agreement, create invoices/payments, create recurrence, generate jobs, or expose customer portal/SMS/QBO behavior.

### Confirm Next Due Action And Idempotency

- First confirm action location is job detail.
- Customer profile confirm, `/service-plans` confirm, and seasonal-window confirm remain parked until job-detail V1 behavior is proven and required schema/model support exists.
- `Confirm Next Due Date` is operator-confirmed and may render only for counted Service Plan visits with valid interval-based suggested next due dates.
- Preconditions include feature exposure, internal user context, active agreement, counted link with `counts_toward_visit_balance = true`, available suggested date, interval frequency, same account/customer scope, and stale-state protection.
- Confirmation copy must make clear that confirming next due date does not create a job, schedule an appointment, create an invoice, collect payment, or renew the plan.
- Initial confirm action may update only agreement next due fields and must not mutate visit links, jobs, service cases, calendar events, invoices, or payments.
- Persistent confirm requires durable link metadata idempotency:
  - `baseline_next_due_date`
  - `confirmed_next_due_date`
  - `next_due_confirmed_at`
  - `next_due_confirmed_by_user_id`
- A counted visit can confirm next due once.
- Link metadata is the idempotency truth for persistent confirm behavior.
- Confirm write updates agreement next due and link confirmation metadata together as one logical operation.
- If a link already has confirmation metadata, confirm must not advance the date again.
- Agreement `next_due_date` must still match the baseline used to calculate the suggestion; stale baseline must fail safely and ask the user to refresh/review the latest suggestion.
- Stored date values and hidden form values remain `YYYY-MM-DD`; display may use date-only `MM/DD/YYYY` formatting.

### Service Plans Navigation, Customer Snapshot, And Templates

- `/service-plans` remains read-only and may deep-link to focused agreement cards on customer profile.
- Customer profile remains the management surface for create/edit/work-order/default-work actions.
- Customer profile Service Plan cards may show read-only Plan Snapshot and What's Included sections before edit controls.
- Service Plans / Maintenance Agreements are closed for field-feedback unless real workflow bugs or validated feedback reopen the lane.
- Service Plan Templates foundation, template management, customer create-from-template prefill, template provenance snapshot, duplicate template flow, package lock metadata, strict package values, server-side locked-field enforcement, and customer read-only locked package rendering are complete model capabilities.
- Template package lock behavior does not introduce automatic jobs, recurrence engine, invoice/payment/autopay changes, visit-count mutation, next-due mutation, portal/SMS/QBO behavior, or removal of manual Service Plan creation.
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

---

## Service-Plan Billing Period Evidence Summary

Historical closeout proof for Phase 5G billing-period invoice link/unlink UI wiring, sandbox smoke, payment identity dedupe/conflict recovery, linked billing-period smoke, and normal invoice regression smoke is preserved in [Domain_Model_Closeout_Evidence_Ledger.md](./Domain_Model_Closeout_Evidence_Ledger.md).

Durable maintenance agreement and service-plan lifecycle contracts remain in this spec. Durable billing-period and service-plan invoice relationship contracts remain in [Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md](./Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md).
