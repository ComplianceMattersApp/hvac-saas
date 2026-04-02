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

The /jobs/[id] Timeline, Shared Notes, and Internal Notes sections may intentionally aggregate narrative entries across the direct job chain (current job plus parent/child lineage via parent_job_id).

When chain-scoped narrative is shown, page copy should explicitly state chain scope and should not imply current-job-only history.

8.5 Retest chain clarity

Parent/child chain history must preserve failed-parent historical truth while allowing the active child revisit job to carry current operational and closeout ownership.

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
company profile / internal business identity implementation
future branding/settings/business-profile formalization
18. What Is Unresolved / Next Design Item
18.1 Company profile / internal business identity

Current behavior implies an internal-company fallback when no contractor is selected, but this is not yet modeled explicitly.

This remains the next important unresolved model decision.

Questions still to answer:

display-only profile vs canonical entity
fallback semantics
future reporting / invoicing implications
whether schema is required
18.2 Rule

Do not implement company fallback behavior further until the model is explicitly defined.

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

2. retest_needed clarification

The locked ECC failed-job model is centered on failed -> pending_office_review -> approve/reject/revisit.
retest_needed must only exist if a valid setter exists; otherwise it must be removed from the system.

Compliance Matters Software is a stabilized, event-driven operational system for compliance and service workflows, with complete scheduling and staffing foundations, strong auditability, and future-ready business-layer expansion.