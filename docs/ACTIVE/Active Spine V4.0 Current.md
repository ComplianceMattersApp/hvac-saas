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

7.9 Internal/admin `/jobs/new` relationship-aware extension (V1)

Internal/admin `/jobs/new` now includes a relationship-aware decision step after customer/location resolution and after internal Job Type selection.

This is an extension of the existing guided intake model, not a replacement intake model.

V1 relationship step options:
- Open Active Job
- Create Follow-Up Visit
- Continue as New Case

Locked V1 rules:
- The relationship step is internal-only and does not alter contractor intake boundaries in 7.7.
- Job Type must be selected before relationship review.
- Relationship candidates must be scoped by selected `job_type`; ECC and Service must not be blended in actionable relationship decisions.
- Existing customer + new location remains part of location resolution, not the relationship decision step.
- Open Active Job must show only true active/current work candidates, not generic unresolved history.
- `need_to_schedule` does not belong in Open Active Job.
- Open Active Job candidate lists should suppress older chain ancestors in favor of the current operative record.
- Create Follow-Up Visit in V1 anchors to an existing job and reuses/ensures `service_case_id` continuity.
- V1 follow-up does not repurpose `parent_job_id`, because `parent_job_id` remains tied to direct visit lineage and existing retest-chain semantics elsewhere in the system.
- Continue as New Case preserves the existing root-job create path.

Implementation note:
This V1 solves relationship-aware intake and service-case continuity.
It does not yet establish full follow-up lineage semantics such as “this visit happened because of Job A” as a first-class generalized model beyond the selected anchor and shared service case.

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

8.6 Service Contract V1 (Locked)

This first Service pass formalizes Service Case and Service Visit classification for later Billing/Reporting support.

This pass does not start Billing workflows or Reporting workflows.

Service Case v1 contract:
service_cases own complaint continuity and case-level resolution ownership.
Required case fields: problem_summary, case_kind (reactive|callback|warranty|maintenance), status, resolved_by_job_id, resolved_at, resolution_summary.

Service Visit v1 contract:
jobs remain the visit execution unit for Service.
Required visit fields: service_visit_type (diagnostic|repair|return_visit|callback|maintenance), service_visit_reason, service_visit_outcome (resolved|follow_up_required|no_issue_found).

Linkage guardrail:
For linked visit chains, parent_job_id lineage must stay inside one service_case_id.
Cross-case parent/child linkage is invalid.

Truth-boundary guardrail:
These classifications do not change source-of-truth ownership:
job_events remains narrative truth.
jobs.ops_status remains operational projection.
ecc_test_runs remains ECC technical truth.

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

10.7 Calendar historical visibility rule

Calendar is a system-of-record scheduling surface, not an active-queue-only surface.

Closed or cancelled jobs must remain visible on the calendar as historical records when they still belong to the scheduled calendar dataset.

This historical visibility rule applies across all calendar views (day / week / month / list) because they consume the same canonical scheduled calendar dataset.

These records must not disappear from calendar merely because lifecycle or ops state changed.

Removal from calendar should happen only through true record-exclusion rules such as:
- archival behavior that intentionally removes the record from active calendar visibility
- deletion / soft-delete behavior where the record is no longer part of the visible calendar dataset
- other explicitly approved full-record visibility rules

Guardrail:
Do not treat closed status alone as a reason to drop a job from calendar history.
Do not treat cancelled status alone as a reason to drop a job from calendar history.
Calendar may visually distinguish historical records, but should preserve them as record-of-truth scheduling history unless a stronger record-removal rule applies.

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

11.5 Awareness-filter rule

Internal notifications should surface awareness-worthy inbound or action-needed signals, not every event written to audit history.

Examples of awareness-worthy internal notifications:
- contractor notes/comments received
- contractor attachments uploaded
- correction submissions
- retest-ready requests
- new intake / new job alerts
- other inbound signals that require review or response

Outbound office-originated actions may remain canonical in `job_events` and other audit/history layers without appearing in the internal notifications awareness feed.

Example:
- `contractor_report_sent` remains part of audit truth/history
- `contractor_report_sent` should not appear as an internal awareness notification

11.6 Ops dashboard signal surface

The `/ops` dashboard contains one signal surface only.

Do not render separate internal/admin notice bars on `/ops`.

The `/ops` signal surface must show only current office-attention signals that affect what Ops should review or act on next.

Examples include:
- contractor notes/comments
- contractor attachment uploads
- contractor correction submissions
- retest-ready requests
- new contractor-created jobs / review-needed jobs
- contractor-provided schedule updates when they affect follow-up

Do not surface on the `/ops` dashboard:
- internal/admin notice feeds
- email-delivery/bookkeeping notices
- outbound office actions
- audit/history-only events that do not require present attention

Canonical audit/history may still exist in `job_events` and related ledgers without appearing in the `/ops` dashboard signal surface.

During transitional implementation, contractor-response signal wording/classification may be resolved at the read/surface layer without requiring immediate write-path redesign, as long as the dashboard remains a single action-needed signal surface.

11.7 Internal email awareness boundary

Internal email alerts should represent new external/inbound awareness, not echoes of internal office actions.

Rule:
- Internal users should receive new-job alert emails for contractor-originated new job submissions.
- Internal users should not receive new-job alert emails for jobs created internally by office/internal users.

Meaning:
- contractor-created intake/new-job activity may trigger internal awareness email
- internal office-created jobs remain canonical operational history, but should not generate redundant internal alert email to the same office workflow by default

Guardrail:
Do not use internal email alerts as a mirror of all job creation activity.
Use them only where the office is being informed of externally-originated work requiring awareness/review.

11.8 Contractor response classification boundary

Contractor response concepts must remain semantically distinct across narrative truth and internal awareness where safely implemented.

Locked rules:
- Plain contractor notes remain `contractor_note`.
- Contractor correction/review submissions remain `contractor_correction_submission` in canonical event history and must not be flattened into generic contractor-note awareness.
- Upload-only contractor submissions may remain on the transitional `contractor_note` path until downstream response-tracking and awareness readers are updated together to support a separate upload concept safely.

Meaning:
- correction submission is a distinct contractor response type
- it should remain distinct in both `job_events` and internal awareness/notification handling
- upload separation is deferred intentionally to avoid drifting downstream response behavior

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

13.5 Contractor proposal visibility / collaboration rule

Contractor intake proposals that remain in proposal-state review must stay visible to the submitting contractor in the portal as plain-language **Under Review** until internal review/finalization resolves them.

This visibility exists for continuity and trust only. It does not grant contractors scheduling authority, lifecycle control, or canonical record ownership.

Locked proposal-state rules:
- Proposal-state submissions may surface in contractor portal waiting/read models even before final canonical job finalization.
- Proposal detail is a contractor-safe, read-only under-review surface for the original submission context.
- The original submitted note remains immutable on the proposal record.
- Contractors may append pending-only follow-up comments as additive proposal addenda while the proposal remains under review.
- Proposal addenda do not overwrite the original submission.
- Original proposal files are represented using proposal attachment persistence, but contractor-facing receipt semantics must depend only on successfully persisted proposal attachment rows.
- Proposal attachment handling is authoritative: if proposal attachment persistence fails, proposal submission must fail safely rather than silently succeeding with partial file loss.

Boundary rule:
- Proposal-state portal visibility and collaboration are trust/continuity features only.
- They do not expand contractor authority to edit canonical customer/location/job records, schedule work, or control lifecycle.

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
maintenance / agreement systems
optional drag-and-drop dispatch UX
deeper notification prioritization/escalation layers
broader role model refinement
future branding/settings/business-profile formalization

Note:
Payments are no longer treated as a purely deferred untouched module.
The platform is now entering an active payment-foundation phase as defined in Section 19 below.

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

18.4 Equipment Domain — Canonical Role Vocabulary and Field Contract

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

19. Payments Module (Active Implementation Direction)

19.1 Current truth (locked)

Payments are not complete.

Any earlier assumption that payments could be treated as complete was for comparison/gap-analysis only and must not be treated as implementation truth.

Current implementation truth:
- payments are currently tracking-only
- payment architecture is an active implementation phase
- live processor-based payment acceptance is not yet enabled
- this area must be built correctly now so future rollout is additive, not corrective

19.2 Core payment direction (locked)

Compliance Matters will build the payment foundation now without enabling full live payment execution yet.

Locked rule:
- the platform is payment-ready by design
- the platform is not yet payment-active
- architecture must support future live payments without forcing redesign later

19.3 Ownership model (locked)

- Compliance Matters = operational source of truth for payment visibility, payment-related workflow state, and operational tracking
- Stripe (future) = preferred payment rail for payment acceptance and money movement
- QBO (optional future) = accounting integration seam only

Meaning:
- operational payment state
- accounting sync
- payment execution

are separate layers and must remain separate in the architecture.

19.4 QBO rule (locked)

QuickBooks Online must not be the required foundation for payment architecture.

QBO is:
- optional
- downstream
- accounting-oriented
- a future sync/integration seam

QBO is not:
- the required basis for payment acceptance
- the payment rail
- the required merchant setup
- a prerequisite for core product usage

19.5 Stripe rule (locked)

Stripe is the preferred future payment rail.

Meaning:
- future customer payment execution should follow a Stripe-first path
- processor-backed payment handling must not depend on QBO adoption
- future contractor payout/onboarding complexity should live at the payment-rail layer, not in accounting logic

Current implementation rule:
- do not build full Stripe execution yet
- build the platform so Stripe can be introduced later without structural rework

19.6 Current live behavior

Supported now:
- payment tracking
- payment status visibility
- amount due / amount paid visibility where implemented
- manual/external payment reference tracking where needed
- operational awareness of payment state

Not yet supported:
- live card acceptance
- ACH acceptance
- saved payment methods
- processor-led refunds
- dispute/chargeback handling
- contractor payout onboarding
- customer self-serve payment checkout

19.7 Payment foundation requirements (build now)

19.7.1 Data-model rule

The payment domain must be built now so the system can support later payment acceptance without rework.

The architecture should be able to represent:
- payment status
- amount due
- amount paid
- balance due
- payment method type
- processor name
- processor reference
- recorded/paid date
- refund status
- refund amount
- failure/error note
- sync status

This does not require all execution flows to exist now, but the structure must anticipate them.

19.7.2 Processor abstraction rule

Payment tracking must remain processor-agnostic at the domain level.

Locked rule:
- do not hardcode payment logic around QBO-specific objects
- do not hardcode accounting-only assumptions into payment flows
- do not lock the model to one-off manual patterns that would block future Stripe rollout

The payment layer must allow:
- manual/off-platform recorded payments now
- Stripe execution later
- optional QBO sync later

19.7.3 Event rule

Payment-related operational changes should be event-capable from the start.

Examples:
- `invoice_sent`
- `payment_recorded`
- `payment_partially_paid`
- `payment_marked_paid`
- `payment_marked_failed`
- `refund_recorded`
- `payment_sync_failed`

Locked rule:
If payment state materially affects operations, history, or accountability, it should be event-backed.

19.7.4 UI rule

Current UI must reflect tracking truth only.

Allowed current language:
- Payment Status
- Amount Paid
- Balance Due
- Payment Recorded
- External Payment Reference

Disallowed current language until live processing exists:
- Pay Now
- Collect Card
- Charge Card
- Process Refund
- Card on File

The UI must not imply live processor-backed payment functionality before it is actually implemented.

19.8 Platform-fee rule (locked)

Future Stripe-based payment acceptance should support a small configurable platform fee.

Meaning:
- the architecture should allow the platform to retain a modest fee later
- the fee should help sustain the platform
- the fee must be configurable, not hardcoded as an aggressive monetization model

Current implementation rule:
- support the ability to add a platform fee later
- do not assume heavy fee extraction at launch
- do not make payment monetization the centerpiece of the current build

19.9 Roadmap phases

Phase P0 — Tracking only (current live state)

Includes:
- payment visibility
- payment status tracking
- operational payment awareness
- manual/external reference support

Phase P1 — Payment-ready foundation (current active build phase)

Includes:
- payment domain model
- payment-related fields
- processor-agnostic architecture
- event-ready payment transitions
- UI wording boundaries
- future Stripe seam
- optional future QBO sync seam
- support for a later configurable platform fee

Does not include:
- live customer checkout
- contractor payout onboarding
- saved cards
- live refunds/disputes
- processor-led payment execution

Phase P2 — Customer payment acceptance (later)

Recommended first live scope:
- customer pays invoice online
- transaction outcome writes back into Compliance Matters
- payment state updates automatically
- simple Stripe-first processor path
- no payout complexity unless explicitly required

Phase P3 — Contractor/platform payout layer (later)

Only after customer payment acceptance is stable.

Includes:
- contractor onboarding
- payout rules
- recipient ownership logic
- refund/dispute responsibility
- optional platform fee activation if desired

Phase P4 — Optional QBO sync (later)

Accounting convenience only.

Possible scope:
- invoice sync
- payment sync
- reconciliation support
- bookkeeping-friendly exports/mappings

Locked boundary:
- QBO sync must remain optional and downstream

19.10 Launch rule (locked)

Lack of live payment acceptance does not automatically block launch.

Reason:
- payment tracking still supports operations
- the system can still manage invoice/payment visibility
- payment execution is a later convenience/collection layer
- current focus is building the architecture correctly so rollout later is clean

19.11 Non-negotiables

- do not require QBO for payment architecture
- do not couple payment readiness to accounting adoption
- do not imply live payment acceptance before it exists
- do not hardcode around QBO-specific payment structures
- do not overbuild payout complexity too early
- do support a future small configurable platform fee
- do keep payment execution additive to the operational core, not disruptive to it

20. Current Product Assessment

20.1 Honest state

Compliance Matters is now a:

stabilized, event-driven operational workflow system with working scheduling, staffing, contractor collaboration, and internal signals

20.2 Most accurate summary

The platform is no longer waiting on a missing core system.

It is now in:

refinement, extension, and business-layer planning

20.3 Current roadmap checkpoint

Roadmap order remains:

1. Service model buildout
2. Billing / invoice workflow
3. Reporting / analytics
4. RLS completion / permission hardening
5. Monthly usage / payment model
6. Out-of-box readiness / business identity / settings packaging
7. Smaller service-model revisions after the above

Current position:
- Service model buildout has been materially advanced and has a working V1 foundation.
- Payment architecture/foundation is now also an active implementation area under the locked direction in Section 19.
- This does not mean full payment acceptance is live; it means payment readiness is now being intentionally built to prevent later rework.

Service model buildout completed in the current thread:
- Service Contract V1 spine lock
- Service Contract V1 schema/domain pass
- Existing-flow wiring for service fields
- Service intake vocabulary cleanup
- Intake de-duplication of Job Title vs Visit Reason
- Internal relationship-aware intake step V1
- Open Active Job query tightening and mode cleanup
- Job-type-aware relationship scoping (ECC vs Service separation)
- Submit-side hardening for Open Active Job type enforcement

20.4 Current locked clarifications

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

21. Usage Rule for Future Threads

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

22. One-Line Definition

Compliance Matters Software is a stabilized, event-driven operational system for compliance and service workflows, with complete scheduling and staffing foundations, strong auditability, active payment-foundation planning, and future-ready business-layer expansion.

23. Supporting document:
For detailed payment implementation direction, use:
`docs/ACTIVE/Compliance_Matters_Payments_Roadmap.md`

This roadmap is subordinate to the Active Spine. If code or planning detail conflicts with the spine, the spine wins.