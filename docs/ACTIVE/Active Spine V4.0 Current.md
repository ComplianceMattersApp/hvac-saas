Compliance Matters Software — Spine v4.0 (Current Operational Source of Truth)

Status: ACTIVE SOURCE OF TRUTH
Purpose: Align future development, audits, and thread handoffs to the current, stabilized system state.

1. System Identity

Compliance Matters Software is an:

event-driven operational workflow system for compliance and service work, with scheduling, staffing, contractor collaboration, and audit-backed job resolution

It is not:

a simple job tracker
a static CRUD app
a calendar-only dispatch toy
a contractor portal-first system

It is:

lifecycle-driven
event-backed
operations-first
source-of-truth disciplined
additive by design
2. Core System Model (Locked)
2.1 Operational hierarchy

Ops Command Center
↓
Customer
↓
Location
↓
Service Case
↓
Job
↓
Portal / External Interaction

2.2 Meaning of each layer
Customer = owner of the work relationship
Location = physical service anchor
Service Case = problem container / continuity layer
Job = operational visit / work execution unit
Portal = external collaboration surface only, never canonical truth
2.3 Structural principle

Service Case = the problem
Job = a visit

A service case may contain multiple jobs.
A job may belong to a service case and may also reference a prior visit through parent_job_id.

3. Source-of-Truth Hierarchy (Locked)
3.1 Canonical truth layers
job_events → narrative / operational truth
ecc_test_runs → technical test truth
jobs.ops_status → operational projection
jobs → visit execution unit
service_cases → continuity container
3.2 Rules
UI does not own lifecycle truth
UI does not guess ECC resolution
all meaningful operational actions should become events
ops_status is a projection, not a freeform UI state
additive changes only unless explicitly approved
4. Lifecycle + Ops Model (Locked)
4.1 Job lifecycle

Jobs represent visits and move through operational lifecycle states without redefining the container model.

4.2 Ops projection

jobs.ops_status drives queues and operational visibility.

pending_office_review is a persisted ops state for office-owned ECC failed-job review, not a UI-derived overlay.

4.3 Queue philosophy

Ops queues are for current work visibility, not historical clutter.

4.4 Signal philosophy

Notifications are signals, not a second queue system.

Ops = action
Notifications = awareness

5. Event System (Locked)
5.1 Canonical event ledger

All meaningful operational activity is recorded in:

job_events
5.2 Examples
scheduling changes
contractor communication
correction submissions
retest requests
internal notes
attachment-added events
job pass/fail markers
follow-up / contact-attempt history where applicable
5.3 Event rule

If it materially affects operations, history, or accountability:

it should be an event

6. ECC / Test System (Locked)
6.1 ECC truth

Technical compliance/test results are canonical in:

ecc_test_runs
6.2 ECC resolution

Job ECC resolution is derived from completed test runs and projected into jobs.ops_status.

Refrigerant charge overall pass requires all active refrigerant-charge checks to pass, not just numeric subcool and superheat checks. Unless an approved charge exemption applies, overall pass also requires filter drier confirmation and applicable temperature qualification. UI surfaces must show non-numeric failure reasons from ecc_test_runs.computed.failures and must not imply that numeric check chips alone determine the final result.

6.3 UI discipline

ECC-specific actions and surfaces must only appear when ECC behavior actually applies.

Service jobs must not expose ECC-only workspace affordances.

7. Customer / Location / Snapshot Strategy (Locked)
7.1 Canonical entities
customers = canonical identity/contact
locations = canonical service address
7.2 Snapshot strategy

Jobs may carry convenience snapshot fields for operational display, but those fields are not canonical.

7.3 Sync-point rule

When canonical customer/location data changes, required job snapshot fields must be synced where relevant, with proper revalidation.

7.4 Current stable state

Location-edit sync and revalidation gaps identified during audit were corrected.
This area is now considered stabilized for current scope.

7.5 Customer visibility rule

/customers and /customers/[id] share one scoped visibility rule.

Internal users may search and view customers within their account-visible scope.

Contractor users may search and view only customers within their own contractor-visible scope.

Customer list and customer detail must follow the same scope rule so a contractor-visible customer in /customers does not dead-end at /customers/[id].

Customer search/index remains read-only; this rule does not expand customer mutation authority for contractors.

7.6 Customer edit boundary

/customers/[id]/edit is a customer/billing edit surface only.

Canonical service-address editing belongs to the Location domain.

Customer edit must not guess, imply, or mutate a canonical "primary" location unless the target location is made explicit.

7.7 Shared intake lock (/jobs/new)

`/jobs/new` is a shared intake surface for internal users and constrained contractor submission.

Create-time lifecycle/status rules are server-enforced:

- Create-time `status` is always intake-safe and server-forced to `open`; posted status values are ignored.
- Contractor intake is server-normalized to unscheduled:
  - `scheduled_date = null`
  - `window_start = null`
  - `window_end = null`
  - `ops_status = need_to_schedule`

Posted existing entity references must be validated before create:

- `customer_id` must belong to canonical owner scope.
- `location_id` must belong to canonical owner scope.
- `location_id` must belong to the resolved/posted customer before job creation.

Invalid posted customer/location pairings must not create jobs and must fail safely through intake error handling.

Internal intake may create or link canonical customer/location records through this shared flow, using reuse-first linking behavior.

7.8 Internal/admin `/jobs/new` flow lock (Phase 2)

Internal/admin `/jobs/new` is a guided workflow, not a flat admin form.

Locked internal sequence:

- Customer/location resolution first.
- Then job setup/details.
- Then scheduling/billing.
- Then optional details.
- Then a concise human-facing final confidence check.

Internal customer resolution behavior is locked to reuse-first guidance:

- Live customer finder is name-first friendly.
- Results include address context for recognition, with phone/email as supporting signals.
- Create-new customer remains a fallback path and must not be the default entry state.

The confidence layer is intentional for internal intake, but must stay concise and human-facing (not technical/debug-style wording).

This internal/admin guided-flow lock does not alter or reopen contractor intake proposal architecture; contractor intake boundaries in 7.7 remain in force.

8. Service Case Container Model (Locked)
8.1 Container rule

service_cases are additive and do not replace job operational truth.

8.2 Relationship rule
service_case_id = container membership
parent_job_id = direct visit-to-visit lineage
8.3 Failure resolution

Locked ECC failed-job model:

Original ECC failed job remains historically failed.
Any true revisit/retest is a new child job in the same chain/service case and becomes the active operational unit.
Once a child revisit exists, the failed parent drops from active failed visibility but remains historically failed in chain history.
Any "we fixed it" signal (portal, phone, text, email, photos) normalizes to pending_office_review.

Internal review from pending_office_review has exactly three outcomes:
approve by evidence
reject review / need more proof
revisit required

Approve by evidence:
original failed parent remains historically failed
ops_status moves to paperwork_required
resolution_source = correction_review
approval must be event-backed (for example: failure_resolved_by_correction_review)
closeout path is cert only
no new invoice if no revisit occurred

Reject review / need more proof:
job returns from pending_office_review to failed
rejection must be event-backed

Revisit required:
child retest job is created immediately (no intermediate limbo state)

Passed child retest behavior:
child owns successful revisit outcome and closeout
parent does not get rewritten into successful truth

Closeout matrix:
failed visit unresolved = invoice only
evidence-approved original parent = cert only
passed child retest = invoice + cert

Child retest inheritance rule:
inherit customer, location, contractor, service case, parent linkage, and core context
do not carry forward prior failed test result as child authoritative truth
prior failed result may be shown later as comparison/reference context

8.4 Narrative visibility on /jobs/[id]

The /jobs/[id] Timeline, Shared Notes, and Internal Notes sections may intentionally aggregate narrative entries across the direct retest/job chain (current job plus parent/child lineage via parent_job_id).

When chain-scoped narrative is shown, page copy should explicitly state chain scope and should not imply current-job-only history.

8.5 Retest chain clarity

Parent/child chain history must preserve failed-parent historical truth while allowing the active child revisit job to carry current operational and closeout ownership.

In /ops, active queue visibility is chain-owned, not ancestor-stacked.

Only one active operative record from a linked chain should be visible in the working queue at a time.

Current live ECC failed/retest rule:
if a failed-family record has no active retest child, it may remain the visible active queue record
if a failed-family record has an active retest child, that ancestor must be suppressed from active queue visibility
the visible active queue record should be the current operative leaf in the chain, not older failed ancestors

This is a queue-visibility ownership rule only.
Do not alter parent/child linkage.
Do not alter audit/history visibility.

This same active-chain ownership principle should apply as service chains / linked visits expand further.
Once a newer operative linked record exists, older linked ancestors must not remain as duplicate active queue items.

9. Staffing / Assignment System (Locked)
9.1 Source of truth

Assignments are owned by:

job_assignments
9.2 Supported model
multiple technicians per job
primary designation
assignment history preservation
internal-user eligibility rules
9.3 Human layer

Identity display must flow through the safe human-layer adapter, not raw user joins.

9.4 Principle

Role = permission
Assignment = workload

These are separate concepts.

10. Scheduling / Calendar Reality (Locked Clarification)
10.1 Current verdict

Scheduling engine is functionally complete.
Calendar system is real.
Remaining work is UX polish, not core-system completion.

10.2 What is complete
real schedule fields:
scheduled_date
window_start
window_end
scheduling / rescheduling / unscheduling backend flow
calendar route and real rendered calendar views
day / week / month / list views
assignment-aware scheduling
schedule-linked ops visibility
schedule-related event logging
technician-aware calendar filtering
unschedule capability exposed in UI
10.3 What is not missing

The system does not require a new calendar engine or a calendar rebuild.

10.4 What remains as UX-only
optional drag-and-drop scheduling
optional further visual/operator refinements
optional additional filter/speed affordances
10.5 Product rule

Do not classify calendar/dispatch as “missing” unless discussing a specific UX enhancement not yet exposed.

10.6 Calendar status display rule

Calendar status dot/label is a deliberate hybrid presentation rule.

Use jobs.status for lifecycle/historical markers:
cancelled
on_the_way (displayed as On My Way)
in_progress

Otherwise derive display from jobs.ops_status for operational projection.

This rule is presentation-only and does not change source-of-truth ownership:
jobs.status remains lifecycle/historical truth
jobs.ops_status remains operational projection

11. Notifications / Signals (Locked v1)
11.1 Current state

Notifications are now complete as a v1 internal visibility layer.

11.2 Includes
notification ledger/backend
read/unread state
internal notifications page
mark-as-read behavior
Ops header integration
unread badge
quiet preview surface
11.3 Signal rule

Unread notifications should represent active awareness signals.
Read items should not visually compete with active work.

11.4 Discipline

Do not turn notifications into another queue or urgency stack.

Notifications are awareness signals only and do not own ECC failed-job pending_office_review workflow decisions.

12. Ops Workspace Principles (Locked)
12.1 Page philosophy

Ops pages should optimize for:

immediate clarity
next action recognition
readable history without burying high-value context
12.2 Information priority

High-value operational information should surface high:

notes
failure reason
schedule state
assignment context
12.3 Redundancy rule

Avoid duplicate instructional text when the status and reason already communicate the meaning.

12.4 Right-rail rule

Secondary/history/supporting information belongs in supporting zones when it improves scanability.

13. Contractor / External Interaction (Locked)
13.1 Contractors can
view assigned work
view contractor-safe reports
submit corrections / notes / retest-ready requests
upload attachments
view customer outreach attempts (customer_attempt events) in the portal timeline when internal staff are contacting the customer about that job
13.2 Contractors cannot
own lifecycle
schedule work
close jobs
access internal-only data
mutate canonical operations state directly
13.3 Ownership principle

Internal users own canonical records.
Contractors interact through constrained portal paths only.

For ECC failed jobs under pending_office_review, internal users own the review queue/actions.
Contractor-facing portal state should be plain-language "under review," and contractors may continue adding notes/photos while review is pending.

13.4 Contractor intake boundary

/jobs/new is a shared intake surface.

Internal users may create intake records directly.

Contractor users may also submit constrained intake / call-list jobs through /jobs/new.

This intake path does not grant contractors scheduling authority or lifecycle control.

Internal users remain the owners of downstream review, scheduling, and lifecycle decisions after intake submission.

Contractor-submitted customer/contact/location values are proposed intake data, not final canonical identity authority.

Intended canonical finalization model after contractor submission:

existing customer + existing location
existing customer + new location
new customer + new location

Implementation lock (finalized):

Contractor intake authority is now locked as follows:

- Contractor submissions without an explicit canonical `customer_id` + `location_id` pairing persist as contractor intake proposals for internal review/finalization.
- In this proposal path, contractor-originated intake does not directly create canonical customer/location records.
- Internal finalization resolves proposal data into canonical records through:
  - existing customer + existing location
  - existing customer + new location
  - new customer + new location
- Internal intake remains permitted to create/link canonical customer/location records directly through shared intake rules.
- Contractor intake boundaries do not grant contractors lifecycle or scheduling authority.

14. Repo / Environment Guardrails (Locked)
14.1 Project trees

The root repo is authoritative.
Duplicate/nested mirror tree drift has been identified and cleaned up.

14.2 Environment mapping

Production and sandbox/test Supabase environments must be explicitly distinguished.

14.3 Required rule

Before any migration operation, confirm the linked Supabase project intentionally matches the target environment.

14.4 Branch discipline
sandbox branch = build/test/validate
main = shipped production code
15. Migration Discipline (Locked Operating Rule)
15.1 Production principle

Do not blindly run db push against production when migration history and live schema may differ.

15.2 Reconciliation principle

Migration truth requires reconciliation between:

repo migration files
live production schema
schema_migrations history
15.3 Manual hotfix rule

If equivalent SQL is manually applied in production, the matching migration history must later be reconciled explicitly.

15.4 Current state

Production migration history for the current known migration set has been reconciled to match live schema reality.

15.5 Ongoing rule

Production migration operations must be deliberate, environment-verified, and history-aware.

16. What Is Complete
16.1 Core platform
lifecycle engine
ops command center
customer / location / job model
service case additive container layer
ECC test system
contractor portal
event-driven operational narrative
staffing / assignments
calendar / scheduling engine
notification visibility v1
source-of-truth stabilization
repo/tree reconciliation
migration stabilization process and guardrails
16.2 Interpretation

The core operational platform is complete enough to be considered a real working system, not a partial prototype.

17. What Is Deferred (Intentional, Not Missing)

These are not currently failures of the spine. They are future/business-layer modules.

advanced reporting / analytics layer
price book / quoting
invoicing automation beyond current workflow
maintenance / agreement systems
optional drag-and-drop dispatch UX
deeper notification prioritization/escalation layers
broader role model refinement
future branding/settings/business-profile formalization
18. Internal Business Identity vs Product Brand Identity (Locked)
18.1 Internal Business Identity (tenant operational identity)

Internal Business Identity is account-owner-scoped operational identity from internal_business_profiles.

Owner scope anchor:

account_owner_user_id

Operational identity fields:

display_name
support_email
support_phone
logo_url

Operational surfaces must resolve tenant identity through the internal business identity resolver boundary in the business profile layer.

UI/action/email callers in operational flows must not carry local hardcoded tenant fallback literals.

18.2 Product Brand Identity (global platform identity)

Product Brand Identity remains global platform identity for shell/auth/default infrastructure surfaces.

Examples include:

app shell metadata
manifest
auth page branding copy
global email/platform branding defaults

Do not blur tenant operational identity into global product branding rules unless explicitly approved as a separate branding initiative.

18.3 Boundary rule

internal users remain human identities
contractors remain external business partners
tenant operational identity is resolved from internal_business_profiles
global product brand identity remains separately owned

This model does not yet own:

full billing / invoicing
broad tenant settings
business administration workflows
role / permission semantics
do not overload user profiles to represent company identity
keep the initial implementation narrow and identity-focused only

18.3 Equipment Domain — Canonical Role Vocabulary and Field Contract

The job_equipment table uses equipment_role as the single canonical classification field.

**Canonical stored vocabulary:**

| Stored value | Physical meaning | Field group |
|---|---|---|
| outdoor_unit | Outdoor AC condenser | Cooling |
| indoor_unit | Indoor coil | Cooling |
| air_handler | Air handler | Cooling |
| heat_pump | Heat pump outdoor unit | Cooling |
| package_unit | Package unit (any fuel type) | Cooling |
| mini_split_outdoor | Mini-split outdoor unit | Cooling (design deferred) |
| mini_split_head | Mini-split indoor head | Cooling (design deferred) |
| furnace | Furnace (any fuel type) | Heating-only |
| other | Unknown / specialist | Permissive |

**Intake mapping:** The /jobs/new intake form uses detailed component sub-types (condenser_ac, furnace_gas, air_handler_electric, heat_pump_outdoor, package_gas_electric, package_heat_pump, coil) that are mapped to canonical values before persistence. The mapping is owned by lib/utils/equipment-domain.ts.

**Field contract by role:**

- Furnace (heating-only): valid fields are heating_capacity_kbtu, heating_efficiency_percent, heating_output_btu. tonnage and refrigerant_type must be NULL.
- Cooling roles (all others except furnace and other): valid fields are tonnage and refrigerant_type. All heating_* fields must be NULL.
- Other: all numeric fields are optional with no role-based filtering.

**Enforcement:** lib/utils/equipment-domain.ts exports mapToCanonicalRole() and sanitizeEquipmentFields(). Every write path (intake create, post-create add, post-create edit) uses these helpers. Filtering logic is not duplicated.

**Stability:** equipment_role is currently editable for correction. Changing role re-sanitizes incompatible fields server-side. Full immutability is a future option, not currently locked.

**Out of scope:** component_type column is not part of this contract. Mini-split full treatment is deferred.

19. Current Product Assessment
19.1 Honest state

Compliance Matters is now a:

stabilized, event-driven operational workflow system with working scheduling, staffing, contractor collaboration, and internal signals

19.2 Most accurate summary

The platform is no longer waiting on a missing core system.

It is now in:

refinement, extension, and business-layer planning

20. Usage Rule for Future Threads

When starting future work:

Use this spine as the current operational truth.
Distinguish clearly between:
core engine completeness
UX polish
deferred future modules
unresolved model decisions
Do not relabel a UX gap as a missing backend system.
Do not introduce new source-of-truth layers without explicit approval.
Preserve additive architecture and environment discipline.
21. One-Line Definition

UPDDATES:
1. on_the_way rule

on_the_way is a field lifecycle state only and must never be written to ops_status.

2. retest_needed closure

retest_needed is not an active production target state in the current ECC model.

Current ECC retest flow is governed by:
- failed parent historical truth
- pending_office_review internal review stage where applicable
- retest child job creation for revisit/retest work
- paperwork_required/invoice_required/closed closeout progression as resolver-driven outcomes

Implementation rule:
- New writes must not set jobs.ops_status to retest_needed.
- Existing historical retest_needed rows may be read for compatibility during transition cleanup.
- Active behavioral model should treat retest_needed as legacy compatibility-only, not a forward state.

Compliance Matters Software is a stabilized, event-driven operational system for compliance and service workflows, with complete scheduling and staffing foundations, strong auditability, and future-ready business-layer expansion.