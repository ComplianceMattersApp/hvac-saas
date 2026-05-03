Compliance Matters Software — Spine v4.0 (Current Operational Source of Truth)

Status: ACTIVE SOURCE OF TRUTH
Purpose: Align future development, audits, and thread handoffs to the current, stabilized system state.

Current Program Status Note (May 2026)

- Performance/responsiveness intervention batch is complete for the current pass and is now treated as closed for this pass.
- Internal /jobs/[id] responsiveness hardening is complete for the current pass:
  - route loading/context preservation improvements were shipped
  - secondary sections were deferred from parent render where safe:
    - internal attachments
    - follow-up/customer-attempt history
    - service-chain detail/history body
    - add-assignee selector/form
    - timeline/shared/internal narrative bodies
  - customer-attempt summary reads were slimmed
  - parent read fanout was parallelized after scoped boundary and main job load
- Contact action responsiveness hardening is complete for the current pass:
  - contact-attempt calendar revalidation dedupe shipped
  - local timing diagnostics remain available behind `CONTACT_ATTEMPT_TIMING_DEBUG` and `JOB_DETAIL_TIMING_DEBUG`
  - contact buttons no longer remain stuck on "Recording..."
  - pending feedback is action-specific for contact quick actions
  - No Answer and Sent Text return near the contact section after redirect instead of snapping to the top
  - server-confirmed truth behavior remains unchanged (event writes, redirects, banner, attempt count, `tab=ops` continuity)
- Practical baseline after this pass has improved materially (warm job-detail paths observed around ~1.5-2.0s and improved contact-action core paths around ~1.1-1.4s on improved runs), while cold-load variance can still be slower.
- Performance remains an active launch-readiness backlog and does not own the entire roadmap unless a specific speed issue is actively damaging usability.
- Planned pre-launch spine order is now resumed; controlled tester onboarding remains intentionally held until readiness work is acceptably complete and supportable.

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

Visit Scope = the operational scope for this visit under the job layer.
It exists to define what work belongs to this trip without changing the locked container model:
service_cases remain continuity truth,
jobs remain visit execution truth,
invoice line items remain downstream billed/commercial truth.

Invoice line items must not become the primary operational work-definition surface.

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

Completed production-shipped ECC/test cleanup: refrigerant charge now supports a Photo Taken attestation path as an evidence-method statement only. It does not require or verify uploaded photo proof, does not claim numeric readings were entered/passed, and keeps computed_pass = null until manual/admin review or override where applicable. Existing numeric and manual override paths remain intact. Duct leakage override suggestions now include Asbestos while preserving custom/manual reason behavior.

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

7.7.1 Production contractor intake hotfix closeout (resolved)

Confirmed incident (production):

- A contractor submitted a new work request for 4137 Amberwood Cir, Pleasanton.
- The request showed an error/disappeared and did not durably save.

Confirmed production read-only findings:

- No matching durable row existed for the failed request in `contractor_intake_submissions`, `jobs`, `customers`, `locations`, `job_events`, or `notifications`.
- Additional 24-hour production sweep showed this failed path aligned with the only contractor/company login activity in that window; no additional silent failures were found.

Resolved root cause and production hotfix:

- Root cause: contractor `/jobs/new` form path did not post `state`, while server-side contractor proposal validation requires `address_line1`, `city`, `state`, and `zip`.
- Hotfix: contractor intake form now posts state and contractor address required behavior is aligned with server validation.
- Contractor validation/error handling remains explicit and fail-safe.
- Post-insert contractor side-effect failures do not erase a successfully saved contractor intake submission.

Closeout confirmations:

- Contractor intake boundary is unchanged:
  - contractor submissions remain proposed intake data
  - contractors do not receive scheduling/lifecycle authority
  - internal users retain finalization authority
- No production data repair was possible for the failed Amberwood row because it never persisted.
- Contractor was asked to resend; a new production contractor submission was successfully created after fix.
- No payment, Stripe, QBO, support-access, RLS model, or tenant-boundary behavior changed.

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

Milestone 1 closeout status:
Service model buildout is now closed for milestone-1 scope.

Milestone-1 Service model buildout includes:
- Service Contract V1 baseline
- relationship-aware internal intake V1
- Visit Scope as the job-owned operational scope layer
- ECC optional vs Service required Visit Scope behavior
- ECC companion-scope promotion into real Service jobs
- promoted-companion read-only visibility on internal scan surfaces
- Service intake title ownership clarified:
  - Service Step 5 now uses an explicit **Job Title** concept for the visit headline.
  - Visit Scope remains the detailed operational work layer for the trip.
  - If Job Title is left blank and exactly one work item exists, the first work item may provide the derived title fallback.
  - `service_visit_reason` aligns to the title layer rather than relying on an older fuzzy summary concept.
  - This preserves the locked distinction:
    - Job Title = short visit headline
    - Visit Scope / work items = exact work on this trip
- milestone-1 write-path reliability cleanup for the live `jobs.updated_at` mismatch

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

Mixed-visit guardrail:
ECC Test and Service remain the only top-level actionable workflow families.
Do not create a hybrid third family.

Approved mixed-visit direction:
an ECC-first visit may carry same-visit companion service scope while the work remains part of the same trip,
but companion scope must promote into a real Service job once it becomes its own lifecycle thread
(for example: separate scheduling, separate assignment, return-trip work, or separate follow-up continuity).

8.6.1 Service workflow refinement - Waiting State V1 (implemented)

Status:
Service Waiting State V1 is implemented as a no-schema service workflow refinement.

Scope boundary (V1):
- waiting state is job-level V1, not service-case-level global blocker orchestration
- existing fields are reused:
  - `jobs.ops_status`
  - `jobs.pending_info_reason`
  - `jobs.on_hold_reason`
  - `jobs.action_required_by`
  - `jobs.follow_up_date`
  - `jobs.next_action_note`
- `job_events` remains audit/narrative truth for waiting-state change history

Supported waiting types (V1):
- Waiting on part
- Waiting on customer approval
- Estimate needed
- Waiting on access
- Waiting on information
- Other

Persistence rule (V1):
- waiting reasons persist in existing pending/on-hold reason fields using readable prefixed text (for example: `Waiting on part: condenser fan motor`)
- legacy unprefixed reasons remain tolerated through fallback-safe parsing

Create-next interaction rule (V1):
- creating a next service visit does not auto-clear the source job waiting state
- explicit/manual release remains required for audit safety
- event context remains the traceable service narrative path in `job_events`

Product intent:
This closes a real in-between service-state gap that common field apps often miss, while preserving locked truth boundaries.

Deferred-later service workflow items:
- parts inventory
- purchase orders/vendor tracking
- service-case-level blocker orchestration
- Visit Scope copy-forward
- estimate automation
- explicit create-next-plus-release option / auto-release on next-visit creation

8.7 Visit Scope -> Invoice Bridge (A1-A5, production-promoted)

Status:
The A1-A5 Visit Scope -> invoice bridge baseline is production-promoted on main.

Production behavior now locked:
- Visit Scope items use durable IDs for downstream selection/provenance.
- Internal invoice line provenance supports Visit Scope sourcing via:
  - `source_kind = visit_scope`
  - `source_visit_scope_item_id`
- Draft internal invoice panels can build line items from selected Visit Scope items.
- Visit Scope-sourced draft invoice lines start at `quantity = 1.00` and `unit_price = 0.00`, then require operator review/edit before issue.
- Service intake requires at least one structured Visit Scope item; summary-only Service scope is rejected.
- ECC intake keeps lightweight optional scope behavior and does not auto-seed blank structured rows.
- ECC companion scope remains allowed under the existing promotion-to-Service rule when work becomes its own lifecycle thread.
- Contractor intake remains requested/proposed work submission only; contractor canonical scope authority is unchanged.
- Issued/void invoice records remain immutable and do not expose draft build controls.

Explicit non-changes in this promotion:
- No payment execution behavior changes.
- No Stripe behavior changes.
- No QBO behavior changes.
- No Pricebook seed behavior changes.
- No service lifecycle or `jobs.ops_status` redesign.

Truth-boundary reminder (unchanged):
- Visit Scope = operational work definition.
- Invoice line item = frozen billed/commercial snapshot.
- Pricebook item = reusable mutable catalog/default definition.
- Payment = collected-truth layer only where materially implemented.

8.8 Service Workflow Refinement V1 Baseline (completed)

Status:
Service Workflow Refinement V1 is complete and closed at the current baseline.

### Service Case Reconciliation V1
- Centralized `reconcileServiceCaseStatusAfterJobChange` helper is implemented and wired into all relevant write paths.
- Write paths covered: closeout actions (mark service complete, mark invoice sent), Create Next Service Visit.
- Logic: active linked visit keeps/reopens case open; all-terminal linked visits resolve case; Create Next Service Visit can reopen a resolved case.
- `job_events` write for reconciliation events is intentionally deferred to a later service-narrative pass.
- No schema changes; no migrations; no Supabase commands; no production data actions were part of this implementation.

### Interrupt/Waiting State V1
- Pending Info (clear: Mark Info Received), On Hold (clear: Resume Job), Waiting (clear: Mark Ready to Continue) are the three interrupt/waiting states.
- Supported waiting reasons (V1): Waiting on part, Waiting on customer approval, Estimate needed, Waiting on access, Waiting on information, Other.
- Waiting state is job-level V1 only; no service-case-level global blocker orchestration.
- No auto-clear on Create Next Service Visit; release remains explicit/manual.
- Existing fields reused: `jobs.ops_status`, `jobs.pending_info_reason`, `jobs.on_hold_reason`, `jobs.action_required_by`, `jobs.follow_up_date`, `jobs.next_action_note`.

### Create Next Service Visit
- Internal users can create a next visit under the same service case from a job detail page.
- Supports diagnostic → waiting → next-visit workflow patterns.
- No auto-release of source job waiting state on next-visit creation.
- No parts inventory, no estimate automation, no Visit Scope copy-forward.

### Reporting cleanup (V1 baseline)
- Dashboard and report drilldown alignment is complete.
- Open Service Cases = open/interrupted continuity cases.
- Active Repeat Visits = cases with 2+ linked visits and at least 1 active.
- Unassigned Open Visits → Jobs Report drilldown.
- Jobs Report assignment filter: All / Unassigned / specific user.
- Jobs Report contractor-null fallback: `contractor_id = null` same-account customer-owned jobs are now included in Jobs Report scope; cross-account null-contractor jobs remain excluded; the specific-contractor filter remains contractor-only for safety.
- Service Cases Report Latest Visit display is display-only clarity polish; no model change.
- Remaining report work is visual/card polish only; data alignment is complete for this baseline.

Explicit non-changes in this baseline:
- No schema changes, migrations, or Supabase commands.
- No production data actions.
- No payment execution behavior changes.
- No Stripe, QBO, or ECC/retest behavior changes.
- No contractor authority changes.
- No assignment or scheduling behavior changes.
- No Visit Scope copy-forward behavior added.
- No parts inventory or estimate automation introduced.
- No service-case lifecycle code changed outside the reconciliation helper.
- No job creation behavior changed.

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
unified-surface drag/drop scheduling in day/week views (no technician-column primary calendar; assignment/no-tech remains metadata)
10.3 What is not missing

The system does not require a new calendar engine or a calendar rebuild.

10.4 What remains as UX-only
optional drag/drop micro-polish beyond the current unified scheduling baseline
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

Completed production-shipped notifications/proposal cleanup: proposal notifications now clear from unread awareness when proposals are accepted/rejected/finalized; notification cards retain identifying context; contractor follow-up comments and internal approval/adjudication notes are preserved; contractor-visible vs internal-only note boundaries remain intact.

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

Internal notification read boundaries remain internal-only.

Contractors do not receive direct read access to internal notifications through this awareness layer.

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

### 11.5.1 Notification family classification lock

Internal notification families must keep **new job/proposal arrival** distinct from **contractor follow-up updates**.

Locked rules:

- `contractor_intake_proposal_submitted` belongs to **New job notifications**, not **Contractor updates**.
- New proposal / new contractor-submitted intake arrival is a **new work-awareness signal**, not a follow-up update signal.
- **Contractor updates** are follow-up contractor-originated changes on an already-existing proposal/job context.

Examples of Contractor updates:
- contractor note added
- contractor files/photos uploaded
- contractor correction submission received
- contractor scheduling update received
- contractor addendum/comment added

Notification copy rule:
- Contractor update cards should use **event-type-driven wording** as the primary message.
- Do not use raw note/comment text as the primary headline for contractor updates.
- Raw submitted text, if shown at all, should remain secondary preview context only.

Meaning:
- New proposal arrival must read as a new-job/new-proposal awareness signal.
- Contractor updates must read as change/update signals.
- Notifications remain signals, not a second queue system.

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

16.3 Operational Entitlement Mutation Guard Rollout (Production-Promoted)

Operational entitlement mutation guard rollout is complete through Slice 16C and is promoted on `main` at commit `bf38eca`. Full validation passed: 89 test files, 1057 tests, TSC_OK. Production smoke confirmed.

Completed guarded internal operational mutation families:

- internal job creation / intake
- job ops / scheduling / contact
- closeout / completion
- internal invoices / invoice lines / manual payment tracking
- notes
- calendar block events
- contractor report preview / send
- attachments
- equipment / systems
- ECC test-run / test-data mutations
- staffing / assignment / contractor relink
- remaining job-detail operational mutations
- contractor intake adjudication
- customer / profile mutations
- contractor directory / admin mutations
- Pricebook mutations

Locked server-side entitlement result:

- active entitlement is allowed
- valid trial with future `trial_ends_at` is allowed
- internal / comped accounts are allowed
- expired trial is blocked before operational mutation writes / side effects
- trial with null `trial_ends_at` is blocked before operational mutation writes / side effects
- missing entitlement row is blocked before operational mutation writes / side effects

Intentional accessibility that remains outside internal operational entitlement gating:

- company profile
- team setup
- internal user / admin invite flows
- password recovery / billing / setup recovery paths
- notification read-state mutations

External contractor onboarding / invite acceptance remains outside internal operational entitlement gating.

`createJob` remains a low-level helper only. Active entrypoints that call it are guarded. Do not add new active callers unless the caller applies the operational entitlement gate first.

`lib/actions/intake-actions.ts` remains dormant legacy create flow and should be treated as a later cleanup / retirement candidate rather than an active mutation lane.

Rollout boundary confirmations:

- no Stripe tenant customer payment execution was introduced
- no QBO behavior was introduced
- no schema migration or Supabase data change was part of this rollout
- tenant customer / work payment execution remains deferred
- two additional test-only mock repairs were committed during main validation (`job-ops-waiting-state.test.ts`, `service-case-reconciliation-wiring.test.ts`); no product behavior change was introduced by those repairs

17. What Is Deferred (Intentional, Not Missing)

These are not currently failures of the spine. They are future/business-layer modules.

customer-facing estimate lifecycle, communication, and conversion flows beyond the current internal baseline
maintenance / agreement systems
additional dispatch UX micro-polish beyond the current unified drag/drop baseline
deeper notification prioritization/escalation layers
broader role model refinement
future branding/settings/business-profile formalization
App-store/mobile native distribution remains intentionally deferred for current launch scope; web product launch readiness is the priority baseline.

Note:
Payment P1 foundation is closed at the current baseline.
Tenant customer invoice payment execution and live Pay Now/Charge Card flows remain deferred.
Stripe Platform Subscription V1 is implemented and live-smoke confirmed for platform account onboarding.
Operational entitlement mutation gating for active internal operational mutation paths is complete and production-promoted on `main` (commit `bf38eca`). Dormant legacy intake cleanup remains a later candidate.
See Section 19 for current payment-ready status.

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

18.3.1 First Owner Onboarding / Account Provisioning V1 (Implemented — Complete)

For V1 launch readiness, standard company/account onboarding now supports public self-serve signup at `/signup`, while invite-only platform-admin/operator provisioning remains active for controlled/manual fallback and special-case onboarding.

**Implementation status: V1 complete.** Implemented across four slices:
- `lib/business/first-owner-provisioning.ts` — idempotent provisioning helper; dry-run / apply modes
- `scripts/provision-first-owner.ts` — operator script; requires explicit allow flags, and hosted `.supabase.co` targets require both allow flags for dry-run and apply
- `lib/auth/first-owner-routing.ts` — first-owner marker detection and `/ops/admin` routing seam
- `app/set-password/page.tsx` — updated to route first-owner acceptance to `/ops/admin`

Confirmed V1 sequence:
- operator runs provisioning script (dry-run first, then apply with explicit allow flags)
- provisioning confirms/creates: auth user, profile, owner-anchored `internal_users` row, `internal_business_profiles`, `platform_account_entitlements`
- provisioning now also evaluates Pricebook starter seeding through the seed helper:
  - dry-run surfaces structured `pricebookSeeding` preview output
  - apply seeds missing starter rows idempotently by `seed_key`
- first-owner marker is durably written to user metadata before invite send
- first owner receives invite
- first owner accepts invite and sets password via `/set-password?mode=invite`
- routing seam detects first-owner marker; fails closed if DB anchor rows are missing
- first owner lands in Admin Center readiness setup flow at `/ops/admin`

Confirmed Self-Serve Onboarding V1 sequence (public path):
- unauthenticated user opens `/signup`
- signup submit reuses `lib/business/first-owner-provisioning.ts` and shared invite orchestration in `lib/business/first-owner-invite.ts`
- fresh email path sends secure setup/invite email and completes `/set-password` -> login flow
- duplicate/existing email behavior is intentionally neutral in public responses and does not expose account-existence details
- tenant anchor boundary remains `account_owner_user_id` and no RLS model change was introduced

Operator flag note: because hosted Supabase projects use `.supabase.co`, the provisioning script classifies them as production-like remote targets. `ALLOW_FIRST_OWNER_PROVISIONING=true` enables the tool; `ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true` acts as the required explicit remote-target confirmation for hosted Supabase projects (including sandbox). Operators must verify the intended project before running apply. Dry-run should always be run first.

Public self-serve signup is now part of the active V1 onboarding baseline for standard account creation.

Operator first-owner provisioning remains active as a controlled/manual fallback path, and internal/comped owner provisioning remains operator-controlled (not public).

Initial signup-page first-impression polish is complete and acceptable for current baseline; deeper public-brand/marketing polish remains deferred.

This direction preserves controlled onboarding quality, protects `account_owner_user_id` tenant boundaries, and keeps tenant operational identity separate from global product brand identity.

If Compliance Matters is later packaged as an app, login still uses the same server-side account provisioning/auth model; app shell packaging does not replace tenant onboarding or account ownership setup.

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

19. Payments Module (P1 Foundation Complete + Platform Subscription V1 Live Platform Smoke Confirmed)

19.1 Current truth (locked)

Payment P1 foundation is complete.

Tenant customer invoice payment execution remains deferred to a later phase.

Current implementation truth:
- payments are currently tracking-only
- payment P1 foundation is closed at the current baseline
- Stripe Platform Subscription V1 is implemented and live-smoke confirmed in production for platform account onboarding
- live confirmation includes live Stripe Product/Price, deployed live env, live webhook processing at `/api/stripe/webhook`, successful non-owner checkout completion, billing-customer linkage, active subscription sync, populated period end, and billing portal availability
- flat account subscription with unlimited users is the V1/live launch billing decision; active user count remains visible and per-seat enforcement is deferred
- internal/comped owner protection is complete through comped-safe `platform_account_entitlements` rows (`internal_comped_v1`, no Stripe linkage, unlimited users)
- platform subscription sync writes only to `platform_account_entitlements`
- live processor-based tenant customer payment acceptance is not yet enabled
- the platform remains payment-ready by design but not yet payment-active for tenant invoice execution

19.2 Core payment direction (locked)

Payment P1 foundation is now complete.
Future payment execution will follow the direction defined in this section, without forcing redesign of the current architecture.

Locked rule:
- the platform is payment-ready by design
- the platform is not yet payment-active
- architecture supports future live payments without requiring redesign

19.3 Ownership model (locked)

- Compliance Matters = operational source of truth for payment visibility, payment-related workflow state, and operational tracking
- Stripe =
  - implemented rail for platform account subscription onboarding (V1 live platform smoke complete)
  - future preferred rail for tenant customer payment acceptance and money movement
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
- platform subscription onboarding V1 is implemented (admin checkout, portal access, webhook entitlement sync)
- do not treat this as tenant customer invoice payment execution
- tenant Pay Now/Charge Card/invoice checkout/refunds/disputes/payout execution remains deferred
- keep Stripe implementation additive so future tenant execution can be introduced without structural rework

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

Phase P1 — Payment-ready foundation (closed; complete enough at current baseline)

Includes:
- payment domain model
- payment-related fields
- processor-agnostic architecture
- event-ready payment transitions
- UI wording boundaries
- future Stripe seam
- optional future QBO sync seam
- support for a later configurable platform fee

Completed slices in this phase:

1. Platform Account Entitlement / Usage Foundation V1
- Implemented as platform-account entitlement truth only (`public.platform_account_entitlements`) with account-owner scope, read-side resolver support, and read-only admin visibility in company profile.
- This slice is intentionally separate from tenant billed truth (`internal_invoices` / `internal_invoice_line_items`) and from collected-payment truth.
- Missing entitlement row resolves to safe default trial entitlement context; real DB/query errors do not silently grant access and must throw.
- Active seat count is derived live from `internal_users` and is not stored on the entitlement row.
- Stripe placeholder fields in this slice are inert schema scaffolding only.

2. Manual Payment Ledger V1
- Implemented as manual/off-platform collected-payment truth only (`public.internal_invoice_payments`) with account-owner scope, read-side resolver support, and minimal internal job-detail UI integration.
- Payment recording is for issued internal invoices only; draft and void invoices cannot receive payments.
- One invoice may have multiple payment rows; balance due is derived from invoice total minus recorded payments.
- Payment status values are: recorded, pending, failed, reversed. Only "recorded" status counts toward collected totals.
- Payment records are immutable; no payment deletion or status mutation exists.
- Internal invoices remain billed truth; payment recording does not mutate invoice totals or line items.
- Payment recording writes `payment_recorded` events to `job_events` with full metadata for auditability.
- Real DB/query errors throw; missing payment rows resolve to zero collected totals.
- Stripe and QBO fields are inert schema scaffolding only; no processor execution exists.
- This slice is intentionally separate from platform entitlement truth and remains payment-ready by design.

3. Collected Payment Reporting / Invoice Ledger Visibility V1
- Implemented as reporting/visibility only on the internal invoice ledger and CSV export surfaces.
- Internal invoice ledger rows now expose collected-payment visibility fields: Amount Paid, Balance Due, Payment Status, Last Payment, and Payment Count.
- CSV export now includes collected-payment columns: Amount Paid, Balance Due, Payment Status, Last Payment Date, and Payment Count.
- Collected totals derive from `public.internal_invoice_payments`; only "recorded" status counts toward collected totals.
- Balance due remains read-side derived from invoice total minus recorded payments; this does not mutate invoice totals or invoice line items.
- Last Payment / Last Payment Date is rendered using clean report-date formatting (not raw ISO timestamp output).
- External-billing behavior remains honest/non-fabricated and does not invent internal invoice/payment reporting.
- This slice did not introduce payment execution, Stripe checkout, QBO sync, portal payment UX, dashboard payment analytics expansion, or refund/dispute execution.

4. Final Closeout-Quality Test Fidelity Polish
- Collected-payment report tests now assert production report read-model outputs directly (`listInvoiceLedgerRows` and `buildInvoiceLedgerCsv`) instead of duplicated local aggregation logic.
- Coverage confirms production payment-column mapping (Amount Paid, Balance Due, Payment Status, Last Payment Date, Payment Count), recorded-only counting behavior, and CSV column order/value projection.
- This closeout polish did not change payment runtime behavior; it improved closeout confidence against regression in production mapping paths.

Does not include:
- live customer checkout
- contractor payout onboarding
- saved cards
- live refunds/disputes
- processor-led payment execution

Phase P2 — Customer payment acceptance (later planning phase; not immediate implementation)

Recommended first live scope:
- customer pays invoice online
- transaction outcome writes back into Compliance Matters
- payment state updates automatically
- simple Stripe-first processor path
- no payout complexity unless explicitly required

Separate future track (not part of tenant invoice/payment tracking phases above):
- Platform subscription billing execution remains a platform-billing roadmap item and must not be conflated with tenant internal invoice billed/collected tracking truth.

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
5. Payment P1 foundation closeout
6. Out-of-box readiness / business identity / settings packaging closeout
7. Pricebook V1 continuation (active product track)
8. Smaller service-model revisions / service workflow refinement

Current position:
- Service model buildout is closed for milestone-1 scope.
- Billing / invoice workflow is complete enough to move forward for milestone-2 scope.
- Reporting / analytics is now substantially complete for the current milestone-3 scope.
- Payment P1 foundation is closed at the current baseline.
- Pricebook V1 is no longer fully deferred and is the active product-track continuation area.
- Pricebook V3 rollout/verification is closed for current scope after this docs closeout.
- Next product focus remains smaller service-model revisions / service workflow refinement.
- Estimates/quoting V1A-V1J is implemented to the current guarded internal baseline.
- Estimates/quoting is not production-live yet: estimate migrations are sandbox-only, production estimate migrations are not applied, production `ENABLE_ESTIMATES` remains disabled, and production `ENABLE_ESTIMATE_EMAIL_SEND` remains disabled.
- V1E internal-only status transitions are complete: `draft -> sent`, `sent -> approved|declined|expired|cancelled`, and `draft -> cancelled`.
- V1E transition events write `previous_status` and `next_status`; status timestamps are set on transition.
- V1E keeps line editing draft-only and hides line-edit controls after `sent`.
- V1F internal-only hardening/operator polish is complete: status transition confirmation wording is clearer, terminal actions use stronger confirmation copy, status panels more clearly describe editable vs terminal states, activity feed labels are more readable, and `/ops?notice=estimates_unavailable` now surfaces a small internal-safe notice.
- V1F also makes the current non-goals explicit in the operator workflow: `sent` does not send email/PDF, and `approved` does not create a job, invoice, payment, conversion, or customer approval record.
- V1G internal-only presentation and print-readiness polish is complete on estimate detail: scan hierarchy/readability is improved for estimate number, status, customer/location context, totals, and line-item presentation; print-friendly browser layout is added for internal estimate document review; explicit commercial boundary wording is reinforced; and read-only placeholders for future send/communication history are present without live behavior.
- V1H internal-only estimate communication/send-attempt foundation is complete: migration `20260502120000_estimate_communications_v1h.sql` is applied to sandbox only, fail-closed `ENABLE_ESTIMATE_EMAIL_SEND` is implemented, blocked attempts are recorded when email send is disabled, draft/sent detail includes send-attempt UI, communication history reads from `estimate_communications`, activity readability includes `estimate_send_attempted`, and terminal estimate statuses do not expose send action.
- V1I decision artifact is complete as planning-only (no implementation changes): Option B comes first (generated document/PDF strategy planning before real provider send), and Option A comes later (sandbox-only real email provider enablement after document/wording go/no-go gates are satisfied).
- V1I go/no-go gates for future sandbox-only email enablement are documented: approved document wording, approved branding/header/footer, recipient confirmation UX review, communication history wording approval, sandbox-only send smoke plan, and validated fail-closed rollback behavior.
- V1I go/no-go gates for future PDF generation/storage are documented: canonical content model, freeze/version semantics, generation trigger, internal access boundaries, retention/storage policy, and no portal/public exposure.
- V1J internal-only document-template/readiness slice is complete (commit `ad5d735`): canonical document view model/helper is implemented, centralized disclaimer package is implemented, revision semantics planning constants are defined (freeze at send-attempt creation, immutable historical revisions, post-freeze edits require new revision), estimate detail readiness section is wired to the shared document helper, print/readiness wording uses the shared document model, no persistent revision storage is introduced, and no new schema/migration was required.
- V1J did not add real outbound production estimate email, PDF generation/storage, persistent revision storage, customer approval/e-signature, customer portal estimate visibility, public estimate links/tokens, contractor visibility/authority, estimate-to-job conversion, estimate-to-invoice conversion, payment/deposit, Stripe tenant payment behavior, QBO behavior, or production estimate enablement.
- Source-of-truth boundaries remain locked: `estimate_events` = lifecycle/operator audit truth, `estimate_communications` = send-attempt/communication truth, Estimate = proposed commercial scope, Visit Scope = operational work scope, Invoice = billed commercial scope, Payment = collected truth only where implemented, Pricebook = reusable catalog/default pricing truth.
- Scope vs Line Items / Work Items terminology alignment Slice 1 is complete (wording/helper-copy pass only):
  - user-facing terminology now distinguishes:
    - Reason for Visit / Dispatch Notes = free-form dispatch/intake context explaining why the visit exists
    - Work Items = structured operational Visit Scope
    - Invoice Charges = billed commercial view
    - Pricebook Service / Charge = reusable catalog item
  - internal/source-of-truth model remains unchanged:
    - Visit Scope remains the operational work-definition layer under jobs
    - invoice line items remain billed/commercial truth
    - estimate lines remain proposed commercial truth
    - Pricebook remains reusable catalog/default pricing truth
  - no schema, behavior, migration, feature flag, Pricebook seed/backfill, Estimate, invoice, payment, support-access, or contractor-authority behavior changed
  - browser smoke and validation passed across internal `/jobs/new`, service `/jobs/[id]`, invoice panel/build-from-work-items wording, contractor `/portal/jobs`, and contractor `/jobs/new` request flow
- Customer approval, customer/contractor portal authority, estimate email/PDF, conversion, and payment behaviors remain deferred.
- V1J validation status: automated checks passed (`npx vitest run lib/estimates` = `123/123`, `npx tsc --noEmit` = `TSC_OK`); sent/approved estimate detail smoke passed; draft-detail smoke is now completed/closed using sandbox draft `EST-20260502-9D58499B` (`/estimates/43aeaa8e-e60e-47d4-8c26-2570600b24df`) and confirmed document readiness rendering, boundary disclaimers, draft manual-line editing, draft pricebook picker availability, blocked send-panel copy, communication history rendering, and absence of email/PDF/customer approval/public link/conversion/payment/customer portal/contractor controls.
- Production readiness hardening guard is complete and committed: `createEstimateDraft` in `lib/estimates/estimate-actions.ts` now returns `{ success: false, error: "Estimates are currently unavailable." }` as the first statement when `ENABLE_ESTIMATES` is false or unset, running before `createClient`/auth/DB work. This was the sole identified pre-production code blocker from the readiness audit.
- Production readiness hardening validation: `npx vitest run lib/estimates` = `127/127`, `npx tsc --noEmit` = `TSC_OK`. Tests confirm: flag-off returns unavailable, no Supabase insert occurs, no estimate_events insert occurs, flag-on valid create still passes. No migrations, Supabase commands, production data actions, email sends, feature flag enables, RLS/policy changes, PDF/storage/customer/public/payment/conversion behavior were introduced.
- Production readiness hardening runbook is documented at `docs/ACTIVE/Estimates_Production_Enablement_Runbook.md`.
- Next estimate direction: proceed only to sandbox-only provider transport enablement after documented go/no-go gates. Do not enable production estimate email sending without an explicit rollout plan.
- Stripe customer/work payment execution follows service/invoice/estimate workflow readiness unless explicitly pulled forward.
- Stripe Platform Subscription V1 remains platform/app usage billing only and must not be conflated with tenant customer/work payment execution.
- Current Pricebook baseline status:
  - production-complete baseline from prior work includes Pricebook admin surface, starter catalog rows, controlled Category/Unit Label values, and server-side controlled-value validation
  - production-promoted C1B/C1C is now complete on `main` (merge commit `e208555`) with production migration applied: `20260427153000_internal_invoice_line_items_pricebook_provenance_v1.sql`
  - C1B/C1C production schema now includes nullable invoice-line provenance/snapshot fields: `source_kind`, `source_pricebook_item_id`, `category_snapshot`, `unit_label_snapshot`
  - C1B/C1C production-promoted behavior includes server-side Pricebook-to-invoice-line frozen snapshot mapping and draft invoice picker wiring; manual line flow remains intact; issued/void invoice immutability remains intact
  - inactive and negative/default-credit items are blocked/deferred from new draft picker selection
  - production smoke is confirmed for Pricebook C1B/C1C with no payment-execution language drift observed
  - production already includes Pricebook seed identity foundation (`seed_key`, `starter_version`) from migration `20260427170000_pricebook_seed_identity_v1`
  - D2C-3 seed helper is production-promoted and matches the original V1 starter definitions
  - D2C-4 first-owner provisioning integration is production-promoted and now surfaces structured `pricebookSeeding` output in dry-run/apply paths
  - production dry-run smoke confirmed `mode = dry_run`, `pricebookSeeding` preview present, `inserted_count = 12`, `skipped_count = 0`, `errors = []`, and `inviteSent = false`
  - V2A/V2B are production-promoted on `main` (commits `7bf9867` and `51ce27c`)
  - Starter Kit V2 seed definitions are implemented in code with 23 rows (`active = 21`, `inactive/deferred = 2`)
  - Starter Kit V3 is production-promoted on `main` (commits `28cc757`, `b31d433`) and is now the default first-owner starter catalog
  - Starter Kit V3 catalog has 97 rows (`active = 91`, `inactive/deferred = 6`)
  - Starter Kit V3 includes modern refrigerants: `R-410A`, `R-454B`, `R-32`
  - first-owner provisioning now defaults to Starter Kit `v3` when selector is omitted
  - explicit selectors remain supported for `v1`, `v2`, and `v3`
  - invalid starter kit selector values are rejected before provisioning execution
  - dry-run output now includes selected starter kit metadata (`starter_kit_version`, `seed_count`, `active_seed_count`, `inactive_seed_count`)
  - no schema migration, Supabase command, provisioning apply action, payment behavior change, or production data action was part of V2A/V2B/V3 promotion
  - D3B controlled-options refinement is production-promoted on `main` via merge commit `58dcb31` (change commit `3084906`):
    - controlled options were refined in code/test only (`lib/business/pricebook-options.ts`, `lib/business/__tests__/pricebook-options.test.ts`)
    - added categories: `Electrical`, `Compliance Docs`
    - added unit labels: `trip`, `doc`
    - removed Pricebook controlled unit label: `cfm` (CFM remains valid in ECC/airflow test contexts)
    - no schema migration, Supabase command, or DB write action was part of this promotion
  - Starter Kit V2 content was not implemented by D3B (it was implemented later in V2A/V2B)
  - no invoice/payment/Stripe/QBO/Visit Scope/service-workflow behavior changed by D2C-3/D2C-4
  - no invoice/payment/Stripe/QBO/Visit Scope/service-workflow behavior changed by D3B
  - V2C-1/V2C-2/V2C-3 existing-account Starter Kit V2 backfill tooling is production-promoted on `main` (commit `4ead046`):
    - V2C-1: dry-run planner helper (`planExistingAccountStarterKitBackfill`) is production-promoted
    - V2C-2: apply helper (`applyExistingAccountStarterKitBackfill`) is production-promoted; requires explicit `confirmApply: true`; collision-blocking is on by default
    - V2C-3: operator CLI wrapper (`scripts/backfill-pricebook-starter-kit.ts`) is production-promoted; dry-run is the default mode; apply requires explicit `--apply` flag; `--allow-collisions` required to override collision blocking
    - backfill is single-account only; no batch or auto-discovery mode exists
    - insert-only; existing rows are never updated; customized rows are never mutated
    - hosted/production-like targets require both `ALLOW_FIRST_OWNER_PROVISIONING=true` and `ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true` before dry-run or apply
    - controlled production existing-account Starter Kit V3 backfill verification is complete for live owner account `93dd810e-3c0c-4b69-9dae-edfa0e481dbb` on host `ornrnvxtwwtulohqwxop.supabase.co`
    - production verified terminal dry-run state for that owner account is: `would_insert_count = 0`, `would_skip_existing_seed_key_count = 96`, `would_skip_existing_equivalent_count = 1`, `possible_collision_count = 0`, `errors = []`
    - production owner-account Pricebook count is verified at `108` rows (`12` baseline + `96` inserted) and existing V1 `R-410A` remains non-duplicated (`Refrigerant R-410A (per lb)` count = `1`)
    - production verification was read-only and confirmed post-apply terminal state; no schema/code/file change, migration, provisioning apply action, Supabase CLI command, push, or commit occurred during final verification
    - security follow-up: previously exposed legacy production service-role key was rotated, new Supabase secret key is in use, Vercel `SUPABASE_SERVICE_ROLE_KEY` was updated as sensitive, production was redeployed and smoke tested, and terminal sessions were closed
    - deferred hardening remains: migrate away from legacy JWT anon/service_role API-key usage before disabling JWT-based API keys
    - backfill remains operator-controlled and dry-run-first; existing-account backfill was intentionally not run during V3 default adoption
    - Pricebook remains catalog/default pricing truth, not operational truth
    - historical invoices and invoice snapshots are not touched by backfill
    - admin UI backfill controls remain future work
    - batch backfill remains future work
    - automatic backfill remains prohibited
  - no invoice/payment/Stripe/QBO/Visit Scope/service-workflow behavior changed by V2C-1/V2C-2/V2C-3
  - Pricebook/Admin Polish P1 is production-promoted on `main` (commit `aecb735`):
    - admin Pricebook UI clarity now emphasizes Starter, Custom, Active, Inactive, and Deferred placeholder status for normal operator workflows
    - V1/V2 seed-version terminology is intentionally hidden from normal admin-facing labels
    - `starter_version` and `seed_key` remain internal/tooling detail and were not removed from backend/operator behavior
    - no admin backfill apply button/control exists; existing-account backfill remains operator-run tooling and is not automatic from admin UI
    - Pricebook remains reusable catalog/default pricing truth, not operational truth
  - no invoice/payment/Stripe/QBO/Visit Scope/service-workflow behavior changed by Pricebook/Admin Polish P1
  - Pricebook/Admin Polish P2 is production-promoted on `main` (commit `a97c764`):
    - catalog management usability improved: add item form is clearer with helper copy explaining reusable catalog purpose and future-selection behavior
    - edit fields clarity improved: disclosure control is labeled "Edit fields" with better form layout and spacing
    - price and unit display now grouped together in a single table column for easier scanning
    - activate/deactivate controls now have color-coded buttons (red for deactivating, green for activating) with helpful tooltips and helper text clarifying behavior:
      - deactivation prevents future selection and does not mutate historical invoice lines
      - activation enables the item in future selections
    - empty state messaging clarified with actionable guidance
    - P1 clarity fully preserved: Starter, Custom, Active, Inactive, and Deferred placeholder status remain emphasized for normal operators
    - V1/V2 terminology remains intentionally hidden from normal admin-facing labels and page content
    - follow-up cleanup was promoted in `987af81` and removed internal-facing/backfill implementation language from the normal admin page
    - no admin backfill button/control was added; operator-run tooling boundary remains intact
    - Pricebook remains reusable catalog/default pricing truth, not operational truth
  - no invoice/payment/Stripe/QBO/Visit Scope/service-workflow behavior changed by Pricebook/Admin Polish P2
  - no business logic, seed definitions, or backfill behavior changed by Pricebook/Admin Polish P2
  - safe-equivalent existing-account backfill tooling is production-promoted on `main` (commit `41d5dae`):
    - exact active legacy/different-seed-key equivalents are safely skipped when signature matches (`item_name`, `category`, `unit_label`, `item_type`)
    - unsafe/ambiguous collisions remain blocking by default
    - existing rows are never updated or mutated by backfill
  - controlled sandbox existing-account V3 backfill was completed successfully for account owner `6e93b2f7-1509-4a39-87e5-6558497f2157`:
    - pre-apply dry-run confirmed: `would_insert_count = 96`, `would_skip_existing_equivalent_count = 1`, `possible_collision_count = 0`, `errors = []`
    - apply result confirmed: `inserted_count = 96`, `skipped_existing_equivalent_count = 1`, `possible_collision_count = 0`, `errors = []`
    - post-apply dry-run confirmed terminal state: `would_insert_count = 0`, `would_skip_existing_seed_key_count = 96`, `would_skip_existing_equivalent_count = 1`, `possible_collision_count = 0`, `errors = []`
    - existing V1 `R-410A` row was not duplicated
    - sandbox admin UI now shows `109` Pricebook items
  - Pricebook/Admin Polish P3 is production-promoted on `main` (commit `4446af3`):
    - admin Pricebook catalog now supports search and category navigation on the normal admin page
    - combined filtering is available across status/source plus search/category
    - clear-filters behavior, filtered count summary, and filtered empty-state guidance are now present
    - normal admin page still does not expose V1/V2/V3 implementation labels and does not include backfill controls
  - existing-account backfill remains operator-controlled and dry-run-first; no automatic or batch backfill behavior exists
  - no production data was touched for existing-account V3 backfill closeout
  - Pricebook remains reusable catalog/default pricing truth, not operational truth
  - no invoice/payment/Stripe/QBO/Visit Scope/service-workflow behavior changed by safe-equivalent tooling or Pricebook/Admin Polish P3
- Launch-readiness polish catch-up is complete for current scope:
  - Service/Visit Scope clarity pass is complete, including clearer Service Details vs Visit Scope guidance and clearer Job Title fallback copy.
  - Invoice job-detail TLC pass is complete, including scanability improvements and explicit truth language that payments are tracking-only entries (no card charge execution).
  - Internal invoice draft prefill fallback hardening is complete where source fields exist, without overwriting existing drafts.
  - Address state capture/wiring is complete on relevant intake/finalization paths, including contractor intake proposal state persistence and downstream billing-state prefill support where captured.
  - Internal invoice void recovery/replacement behavior is complete: voided invoices remain historical, do not satisfy billed-truth closeout, and replacement draft flow exists as the active billing path.
  - Invoice report wording polish is complete: Send Status and Payment Count labels are now the launch wording targets.
  - Completed production-shipped cleanup batch (notifications/calendar/UI/ECC) is now part of the current baseline:
    - proposal unread-awareness cleanup, proposal/notification card identity restoration, and proposal-note boundary preservation are complete
    - calendar details/identity/no-tech visibility/filtering/inspector-default behavior cleanup is complete
    - unified calendar drag/drop behavior is complete without introducing technician-assignment ownership changes
    - date-display formatting polish, login password show/hide toggle, and aging counters on Failed/Need Info surfaces are complete
    - ECC refrigerant Photo Taken attestation path and Asbestos duct-leakage override suggestion are complete with existing truth boundaries preserved
  - These polish slices did not introduce payment execution, Stripe checkout, card charge flows, refunds/disputes, payouts, QBO sync, or RLS model changes.
- Out-of-box readiness / business identity / settings packaging now has Admin Readiness / Setup Checklist V1 complete at the current baseline:
  - readiness is a read-only derived packaging layer over existing tenant/account data (no new truth table)
  - setup-progress completion is gated by user-reviewed timestamps on `internal_business_profiles.profile_reviewed_at` and `internal_business_profiles.team_reviewed_at`, not merely by provisioned foundation rows
  - newly provisioned standard accounts now show `0 of 5 complete` on first login until admins review company profile and team setup
  - required readiness criteria currently include company name, support email, support phone, billing mode, and at least one active internal user after the relevant review steps are completed
  - optional readiness criteria currently include company logo, contractor directory, and platform account status visibility
  - this does not introduce a broad tenant settings system and does not alter onboarding implementation boundaries
  - closeout status: this roadmap area is complete enough to close at the current baseline with Admin Readiness V1 and First Owner Provisioning V1 implemented
  - public `/signup` self-serve onboarding is implemented and functionally smoked for fresh-email onboarding
  - duplicate/existing-email public messaging remains intentionally neutral
  - operator first-owner runbook path remains active/manual fallback, including internal/comped owner provisioning
  - `/ops/admin/internal-users` normal launch UI no longer exposes the Link existing auth user panel; Invite teammate, team setup confirmation, and team member management remain the normal admin surface
  - Stripe Platform Subscription V1 for platform onboarding is implemented and live-smoke confirmed for the platform-account subscription slice
- Pre-launch priority ordering update:
  - Stripe Platform Subscription V1 for new account users/platform onboarding is implemented and live-smoke confirmed for the platform-account subscription slice.
  - Live rollout prerequisites for that slice are complete: live keys, live webhook endpoint, and final live-mode smoke.
  - This priority remains separate from tenant customer invoice payment execution.
  - Tenant customer invoice payment execution remains deferred unless explicitly pulled forward.
  - Live Pay Now/Charge Card/checkout/refunds/disputes/payout execution remains deferred.
- Completed RLS / permission hardening slices for the current stabilized baseline now include customer/location internal account-owner reconciliation, notifications internal-awareness write-path hardening, targeted internal same-account job/service-case mutation boundary hardening, internal same-account job-detail operational mutation boundary hardening, internal same-account pending-info release / re-evaluate mutation boundary hardening, internal same-account service closeout mutation boundary hardening, internal same-account contractor report preview/send boundary hardening, internal job attachments / attachment-storage account-scope hardening, internal job attachments read/download account-scope boundary hardening, internal ECC test-run account-scope hardening, internal job_equipment / job_systems account-scope hardening, internal same-account lifecycle/scheduling mutation boundary hardening, contractor CRUD mutation boundary hardening, staffing / job assignment mutation boundary hardening, job contractor relink mutation boundary hardening, customer standalone mutation boundary hardening, legacy job-detail entrypoint mutation boundary hardening, internal invoice mutation boundary hardening, internal notification read-state mutation boundary hardening, internal user/admin identity mutation boundary hardening, dispatch calendar account-scope read boundary hardening, contractor intake adjudication mutation boundary hardening, dispatch calendar block mutation boundary hardening, admin job terminal mutation boundary hardening, contractor portal intake proposal visibility and collaboration boundary hardening, customer profile upsert mutation boundary hardening, contractor admin edge mutation boundary hardening, contractor invite acceptance membership boundary hardening, and internal business profile mutation boundary hardening:
  - jobs and service_cases were already ahead on account-owner-aware internal read scope
  - customers and locations are now reconciled to that same internal account-owner model for internal same-account teammates
  - validated passed for customer list, customer detail, internal `/jobs/new` guided lookup, and location detail for non-owner internal teammates
  - customer/location visibility no longer depends primarily on admin/manual scope reconstruction for those internal reads
  - targeted internal job-detail mutation surfaces no longer rely on `user is internal` alone for the hardened paths
  - same-account scope is now explicitly asserted before the targeted internal operational mutations proceed
  - cross-account internal mutation is denied on the targeted hardened paths
  - the completed targeted mutation-boundary slice covers visit scope mutation and service contract / linked service-case mutation
  - internal same-account job-detail operational mutation boundary hardening is also complete
  - targeted internal `/jobs/[id]` ops-lane mutations no longer rely on `user is internal` alone for the hardened paths
  - same-account scope is now explicitly asserted before the targeted ops-lane mutations proceed
  - cross-account internal mutation is denied on the targeted ops-lane hardened paths
  - the completed targeted ops-lane mutation-boundary slice covers resolve failure by correction review, mark certs complete, mark invoice complete, update job ops details, update job ops state, mark field complete, and customer contact attempt logging
  - this was a targeted internal job-detail operational mutation-boundary slice, not a full jobs/service_cases/job_events permission-model rewrite
  - internal same-account pending-info release / re-evaluate mutation boundary hardening is also complete
  - targeted internal `/jobs/[id]` release / re-evaluate form entrypoints no longer rely on `user is internal` alone for the hardened paths
  - same-account scope is now explicitly asserted before the targeted release/re-evaluate mutations proceed
  - cross-account internal mutation is denied on the targeted release/re-evaluate hardened paths
  - the completed targeted release/re-evaluate mutation-boundary slice covers `releasePendingInfoAndRecomputeFromForm` and `releaseAndReevaluateFromForm`
  - this was a targeted release/re-evaluate ops-lane mutation-boundary slice, not a full jobs/job_events permission-model rewrite
  - internal same-account service closeout mutation boundary hardening is also complete
  - targeted internal `/jobs/[id]` service closeout actions no longer rely on internal-user membership alone for the hardened paths
  - same-account scope is now explicitly asserted before the targeted service closeout mutations proceed
  - cross-account internal mutation is denied on the targeted service closeout hardened paths
  - the completed targeted service closeout mutation-boundary slice covers `markServiceComplete` and `markInvoiceSent`
  - denied targeted service closeout paths do not write `jobs`, `service_cases`, or `job_events`
  - contractor authority was not expanded in this targeted service closeout slice
  - this was a targeted service closeout mutation-boundary slice, not a full jobs/service_cases/job_events permission-model rewrite
  - internal same-account contractor report preview/send boundary hardening is also complete
  - targeted internal contractor report preview/send paths no longer rely on internal-user membership alone for the hardened paths
  - same-account scope is now explicitly asserted before the targeted contractor report actions proceed
  - cross-account internal access is denied on the targeted contractor report paths
  - the completed targeted contractor-report boundary slice covers `generateContractorReportPreview` and `sendContractorReport`
  - denied targeted contractor-report paths do not write `jobs` or `job_events`
  - denied targeted contractor-report paths do not enqueue or send contractor-report notifications/emails
  - contractor authority was not expanded in this targeted contractor-report slice
  - this was a targeted contractor-report boundary hardening slice, not a full jobs/job_events permission-model rewrite
  - targeted internal attachment flows no longer rely on broad internal access alone for the hardened paths
  - same-account scope is now explicitly asserted before targeted internal attachment/storage mutations proceed
  - cross-account internal attachment/storage access is denied on the targeted hardened paths
  - the completed targeted attachment/account-scope slice covers upload-token issuance, finalize upload, discard upload, and share-to-contractor
  - matching attachment/storage policy reconciliation was completed for this seam
  - this was a targeted internal attachment/account-scope slice, not a full attachment subsystem rewrite
  - internal job attachments read/download account-scope boundary hardening is also complete
  - the internal attachments read/download page no longer relies on internal auth plus implicit row filtering alone for the hardened path
  - one explicit same-account internal scoped-job preflight is now asserted before any attachment row read proceeds on the internal attachments page
  - one explicit same-account internal scoped-job preflight is now asserted before signed URL generation proceeds on the internal attachments page
  - cross-account internal access is denied before attachment row read on the targeted read/download path
  - cross-account internal access is denied before signed URL generation on the targeted read/download path
  - non-internal access is denied before attachment row read on the targeted read/download path
  - non-internal access is denied before signed URL generation on the targeted read/download path
  - the completed targeted internal attachment read/download boundary slice covers the `app/jobs/[id]/attachments/page.tsx` route
  - contractor redirect behavior to portal remains intact
  - this was a targeted internal attachment read/download route-boundary slice, not a full attachment subsystem rewrite and not the end of broader RLS hardening
  - targeted ECC test-run mutation paths no longer rely on broad internal access alone for the hardened paths
  - same-account scope is now explicitly asserted before targeted ECC mutations proceed
  - cross-account internal ECC mutation is denied on the targeted hardened paths
  - the completed targeted ECC truth/account-scope slice covers override update, add test run, delete test run, and a representative ECC test-save path
  - matching `ecc_test_runs` policy reconciliation was completed for this seam
  - this was a targeted ECC truth/account-scope slice, not a full ECC subsystem rewrite or full ECC permission-model completion
  - targeted internal equipment/system mutation paths no longer rely on broad internal access alone for the hardened paths
  - same-account scope is now explicitly asserted before the targeted equipment/system mutations proceed
  - cross-account internal equipment/system mutation is denied on the targeted hardened paths
  - the completed targeted equipment/system account-scope slice covers add equipment, update equipment, delete equipment, and coupled system creation, reuse, and orphan delete behavior inside those flows
  - matching `job_equipment` / `job_systems` policy reconciliation was completed for this seam
  - this was a targeted equipment/system account-scope slice, not a full equipment/system domain rewrite or full equipment/system permission-model completion
  - internal same-account lifecycle/scheduling mutation boundary hardening is also complete
  - targeted lifecycle/scheduling actions no longer rely on internal-user membership alone for the hardened paths
  - same-account scope is now explicitly asserted before targeted lifecycle/scheduling mutations proceed
  - cross-account internal mutation is denied on the targeted lifecycle/scheduling hardened paths
  - the completed targeted lifecycle/scheduling mutation-boundary slice covers `advanceJobStatusFromForm`, `revertOnTheWayFromForm`, and `updateJobScheduleFromForm`
  - denied targeted lifecycle/scheduling paths do not write `jobs` or `job_events`
  - denied targeted schedule paths do not enqueue or send customer/contractor scheduling emails
  - contractor authority was not expanded in this targeted lifecycle/scheduling slice
  - this was a targeted lifecycle/scheduling mutation-boundary slice, not a full jobs/job_events permission-model rewrite and not the end of broader RLS hardening
  - contractor CRUD mutation boundary hardening is also complete
  - targeted contractor mutation paths no longer rely on incomplete or inconsistent app-layer owner checks for the hardened paths
  - same-account internal scope is now explicitly asserted before targeted contractor mutations proceed
  - cross-account internal mutation is denied on the targeted contractor mutation paths
  - the completed targeted contractor CRUD mutation-boundary slice covers `updateContractorFromForm` and legacy `createContractorFromForm`
  - denied targeted contractor CRUD paths do not write contractor records
  - contractor authority was not expanded in this targeted contractor CRUD slice
  - this was a targeted contractor CRUD mutation-boundary slice, not a full contractor subsystem rewrite and not the end of broader RLS hardening
  - staffing / job assignment mutation boundary hardening is also complete
  - targeted staffing mutation paths no longer rely on internal-user membership plus plain job existence checks alone for the hardened paths
  - same-account internal scope is now explicitly asserted before targeted staffing mutations proceed
  - cross-account internal mutation is denied on the targeted staffing mutation paths
  - the completed targeted staffing / job assignment mutation-boundary slice covers `assignJobAssigneeFromForm`, `setPrimaryJobAssigneeFromForm`, and `removeJobAssigneeFromForm`
  - denied targeted staffing paths do not write `job_assignments`
  - denied targeted staffing paths do not write staffing-related `job_events`
  - assignable-user validation now runs inside actor account scope for the hardened staffing paths
  - matching `job_assignments` account-scope reconciliation was completed for this seam
  - contractor authority was not expanded in this targeted staffing slice
  - this was a targeted staffing / job assignment mutation-boundary slice, not a full staffing subsystem rewrite and not the end of broader RLS hardening
  - job contractor relink mutation boundary hardening is also complete
  - the targeted contractor relink path no longer relies on internal-user membership plus plain job read/update flow alone for the hardened path
  - same-account scope is now explicitly asserted before the targeted contractor relink mutation proceeds
  - cross-account internal mutation is denied on the targeted contractor relink path
  - the completed targeted job contractor relink mutation-boundary slice covers `updateJobContractorFromForm`
  - denied targeted contractor relink paths do not write `jobs`
  - denied targeted contractor relink paths do not write `job_events`
  - forged cross-account `contractor_id` targets are denied before write on the hardened path
  - contractor authority was not expanded in this targeted contractor relink slice
  - this was a targeted job contractor relink mutation-boundary slice, not a full jobs/job_events permission-model rewrite and not the end of broader RLS hardening
  - customer standalone mutation boundary hardening is also complete
  - targeted customer standalone mutation paths no longer rely on internal-membership checks plus direct row mutation alone for the hardened paths
  - same-account customer scope is now explicitly asserted before the targeted customer standalone mutations proceed
  - cross-account internal mutation is denied on the targeted customer standalone paths
  - the completed targeted customer standalone mutation-boundary slice covers `archiveCustomerFromForm` and `updateCustomerNotesFromForm`
  - denied targeted customer standalone paths do not write `customers`
  - contractor authority was not expanded in this targeted customer standalone slice
  - this was a targeted customer standalone mutation-boundary slice, not a full customer subsystem rewrite and not the end of broader RLS hardening
  - contractor authority was not expanded, and this was not a full jobs/service_cases RLS rewrite
  - contractor customer/location visibility remains constrained, read-only, and job-derived
  - notifications remain account-owner-scoped for internal awareness
  - the generic `42501 -> service-role` fallback was removed from the internal awareness notification write path
  - contractor-originated or mixed-context internal awareness notifications now use one explicit, policy-aligned write contract
  - internal notification read boundaries remain internal-only; contractors still do not get direct read access to internal notifications
  - Report Center account-scope read/export boundary hardening is also complete
  - targeted Report Center read/export surfaces now assert explicit account-scoped data boundaries for the hardened report paths
  - report jobs/KPI paths now scope job reads by account contractor IDs where applicable
  - service case continuity report paths now scope service case reads by account customer IDs where applicable
  - closeout follow-up report paths now apply the account-owner scope that was already accepted but not fully used
  - dashboard report read model now scopes both jobs and internal invoice reads to the account boundary
  - targeted CSV/export report paths were included in this Report Center boundary pass
  - empty account-scope lists now use sentinel-safe behavior to prevent accidental fetch-all outcomes on hardened report reads
  - focused seam coverage was added for same-account allow, cross-account exclusion/deny, empty scope behavior, and invoice billing-mode honesty
  - targeted seam tests passed: 15/15
  - full suite passed: 284/284
  - TypeScript build passed with `npx tsc --noEmit`
  - browser smoke test passed after implementation
  - this was a targeted Report Center read/export boundary hardening slice, not a Report Center redesign, not a KPI logic redesign, not a billing expansion, not payment execution work, not QBO work, not a broad RLS rewrite, and not the end of broader RLS / permission hardening
  - reporting truth boundaries remain locked: `jobs` / `jobs.ops_status` = operational truth/projection, `service_cases` = continuity truth, `job_events` = audit/activity truth, `internal_invoices` = billed truth for internal-invoicing mode, and `payments` = collected truth only when materially implemented
  - external-billing companies must not be treated as if internal invoice/payment records exist
  - reporting remains owner-family split and must not collapse operational, billed, and collected truth
  - internal job-detail read boundary hardening for `app/jobs/[id]/page.tsx` is also complete
  - the main internal job detail page now asserts an explicit same-account internal scoped-job preflight before main job-detail read assembly
  - the main internal job detail page now asserts an explicit same-account internal scoped-job preflight before attachment signed URL generation performed from that page
  - cross-account internal access is denied before job-detail read assembly on the targeted path
  - cross-account internal access is denied before main-page attachment signed URL generation on the targeted path
  - denied signed URL paths do not call signed URL generation
  - contractor enumeration used by the internal job detail page is scoped to the current internal account owner
  - existing contractor/login redirect behavior was preserved
  - existing mutation behavior was not changed
  - focused seam tests were added for same-account allow, cross-account deny, non-internal behavior preservation, signed URL deny-before-call behavior, and contractor enumeration scoping
  - targeted seam tests passed: 7/7
  - full suite passed: 291/291
  - TypeScript build passed with `npx tsc --noEmit`
  - browser smoke test passed after implementation
  - this was a targeted internal job-detail read-boundary slice, not a `/jobs/[id]` UI redesign, not a job-detail mutation rewrite, not an attachment subsystem rewrite, not a Report Center change, not a billing expansion, not payment execution work, not QBO work, not a role redesign, not a support-access model, not a broad RLS rewrite, and not the end of broader RLS / permission hardening
  - jobs / jobs.ops_status remain operational truth / operational projection
  - service_cases remain continuity truth
  - job_events remain audit/activity truth
  - internal_invoices remain billed truth for internal-invoicing mode
  - payments remain collected truth only when materially implemented
  - contractor authority was not expanded
  - reporting and billing boundaries remain unchanged
  - no role redesign, support-access model, payment work, billing work, broader notifications UX/polish work, or broad portal/contractor authority expansion was part of these slices
- Completed billing hardening slices for the current stabilized baseline include:
  - the external-billing split-brain closeout fix: the supported `Mark Invoice Sent -> Closed` path writes the lightweight billed-truth marker before supported closeout
  - billing-truth read-side normalization: internal-invoicing closeout/report/dashboard/ops readers derive billed truth from the internal invoice domain, while external-billing readers preserve lightweight job-level invoice-action meaning
  - invoice-required counter/label normalization: invoice-required metrics and messaging derive from billing-aware invoice-needed truth rather than raw `jobs.ops_status = invoice_required`
  - external-billing secondary-field unification: `data_entry_completed_at` is aligned across supported lightweight external-billing completion paths, while `invoice_number` remains owned by the explicit data-entry path and is not invented by lightweight action buttons
- These completed slices do not broaden payment execution, do not change internal-invoicing billed truth ownership, and do not change roadmap order.
- Formal closeout review completed for the RLS / permission hardening milestone against live repo evidence and the active hardening ledger.
- Required live access-surface families were reviewed across internal mutations, reads, attachments/signing, ECC flows, equipment/system, lifecycle/scheduling, contractor/customer/location surfaces, invoicing, report exports, notification read-state, identity/admin, dispatch/calendar, intake/adjudication/portal collaboration, server route handlers, and dormant app-local action cleanup.
- Targeted seam hardening coverage is confirmed complete for the milestone-defined families.
- App-local orphan cleanup is confirmed complete for the dormant job-detail action file removal.
- No concrete remaining live permission seam was proven in the closeout review.
- Broad global normalization of all admin-client/service-role usage remains intentionally deferred outside this milestone closeout scope.
- Broad global completion of every notification/email side-effect path remains intentionally deferred outside this milestone closeout scope.
- This milestone is now formally closed at the targeted seam-hardening level.
- This closeout does not imply role redesign, support-access redesign, payment execution work, billing expansion, UI redesign, or a broad cross-domain RLS rewrite.
- Payment P1 foundation is closed at the current baseline under the locked direction in Section 19.
- Payment execution remains deferred; payment readiness is by design to support future adoption without forced redesign.

Reporting / analytics milestone baseline now includes:
- Report Center as the internal reporting home
- Dashboard as the default Report Center landing surface
- Jobs Report as the visit-level operational ledger
- Service Cases Report as the continuity/service-case ledger
- Closeout Report as the visit-owned closeout/follow-up ledger
- Invoices Report as the billed-truth invoice ledger
- export support through report-family ledgers, with dashboard export following honest underlying report surfaces
- lightweight dashboard view controls
- KPI foundation and KPI reference/validation support retained as internal scaffolding
- KPI Reference removed from normal Report Center navigation while remaining accessible by direct URL
- `/reports` routing to Dashboard by default, with Jobs Report moved to `/reports/jobs` and compatibility handling preserved for prior filtered jobs-report links

Reporting / analytics baseline is complete enough for the current milestone; remaining work is minor polish/hardening only.

The next natural roadmap area is:
- Pricebook V1 post-promotion refinement from the current production-complete C1B/C1C baseline
- Estimates/quoting V1A-V1J is implemented as internal-only guarded baseline; production rollout remains deferred

Pre-launch enablement priority track (separate from product-track sequencing):
- Stripe enablement for new account users/platform onboarding is elevated for pre-launch readiness.
- Live smoke is now confirmed complete for that platform-account subscription slice.
- This does not move tenant customer invoice payment execution into current scope.

Roadmap guardrail for this next area:
- Payment P1 foundation is already closed at the current baseline.
- Payments remain payment-ready by design, not payment-active.
- Platform account subscription billing execution is live for the onboarding slice; tenant Stripe/customer payment execution remains deferred unless explicitly pulled forward.
- This does not imply QBO dependency.

Current clarification:
- RLS / permission hardening milestone is formally closed at the targeted seam-hardening level
- payment P1 foundation closeout is complete at the current baseline
- out-of-box readiness / business identity / settings packaging closeout is complete at the current baseline
- the active product-track roadmap area is Pricebook V1 continuation (with C1B/C1C production-complete, production-promoted, and production-smoke confirmed)
- estimates/quoting V1A-V1J is implemented for guarded internal baseline and remains intentionally non-production-live
- V1I is documented as decision/planning artifact only (Option B first; Option A later after gates) and does not change current production-disabled posture
- Work Items terminology alignment is complete and already documented; Job/Visit Scope/Work Items wording now matches the current model across validated internal and contractor-facing surfaces.
- Internal `/jobs/[id]` responsiveness batch is complete for this pass with deferred secondary sections now in place for:
  - attachments
  - follow-up/customer-attempt history
  - service-chain detail body/history
  - add-assignee selector/form
- Contact-attempt path cleanup is complete for this pass:
  - redundant unconditional calendar revalidation was removed
  - job revalidation and return-to revalidation behavior remains preserved
  - contact-attempt writes, follow-up updates, banner behavior, and `tab=ops` continuity remain preserved
- Local diagnostic timing instrumentation exists and is intentionally env-gated:
  - `CONTACT_ATTEMPT_TIMING_DEBUG`
  - `JOB_DETAIL_TIMING_DEBUG`
  - these flags are benchmarking diagnostics only and should remain disabled unless intentionally profiling
- Measured responsiveness improvement from this batch (representative):
  - `serviceCaseServiceChainReads`: about `5966ms` -> about `291ms`
  - post-contact total job-detail render: about `21826ms` -> about `4510ms`
  - `assignmentDisplayMapAssignableUsers`: about `716-947ms` -> about `256-362ms`
  - post-contact render follow-up: about `4510-4529ms` -> about `3911ms`
  - warm render follow-up: about `3451ms` -> about `2999ms`
- Remaining speed concern is still open:
  - high-frequency contact actions (Called / Sent Text / No Answer) can still feel around `3-5s`
  - target UX remains: immediate feedback under `200ms`, typical settle around `1-2s`, under `3s` acceptable
- Next speed work should continue as measured slices (not broad refactors), with likely near-term targets:
  - customer-attempt summary reads
  - timeline/events dependency reads
  - contact-action settle path and granular refresh/revalidation mapping
  - further parent render slimming on `/jobs/[id]`
- Guardrails for performance work remain locked:
  - do not chase speed by weakening truth
  - no optimistic final status/action state without explicit approval
  - do not trim revalidation without dependency mapping
  - do not touch invoice/billing/payment performance paths casually; require a separate billing-safe audit
  - use audit -> small slice -> benchmark -> commit -> docs update
  - use Codex for higher-risk dependency mapping and diff review
  - use VS Agent for surgical implementation
  - keep ChatGPT sequencing guardrails/prompts/review
- customer/location internal account-owner reconciliation is complete inside that milestone
- notifications internal-awareness write-path hardening is also complete inside that milestone
- targeted internal same-account job/service-case mutation boundary hardening is also complete inside that milestone
- internal same-account job-detail operational mutation boundary hardening is also complete inside that milestone
- internal same-account pending-info release / re-evaluate mutation boundary hardening is also complete inside that milestone
- internal same-account service closeout mutation boundary hardening is also complete inside that milestone
- internal same-account contractor report preview/send boundary hardening is also complete inside that milestone
- internal job attachments / attachment-storage account-scope hardening is also complete inside that milestone
- internal job attachments read/download account-scope boundary hardening is also complete inside that milestone
- internal ECC test-run account-scope hardening is also complete inside that milestone
- internal job_equipment / job_systems account-scope hardening is also complete inside that milestone
- internal same-account lifecycle/scheduling mutation boundary hardening is also complete inside that milestone
- contractor CRUD mutation boundary hardening is also complete inside that milestone
- staffing / job assignment mutation boundary hardening is also complete inside that milestone
- job contractor relink mutation boundary hardening is also complete inside that milestone
- customer standalone mutation boundary hardening is also complete inside that milestone
- legacy job-detail entrypoint mutation boundary hardening is also complete inside that milestone
- internal invoice mutation boundary hardening is also complete inside that milestone
- internal notification read-state mutation boundary hardening is also complete inside that milestone
- internal user/admin identity mutation boundary hardening is also complete inside that milestone
- dispatch calendar account-scope read boundary hardening is also complete inside that milestone
- contractor intake adjudication mutation boundary hardening is also complete inside that milestone
- dispatch calendar block mutation boundary hardening is also complete inside that milestone
- admin job terminal mutation boundary hardening is also complete inside that milestone
- contractor portal intake proposal visibility and collaboration boundary hardening is also complete inside that milestone
- customer profile upsert mutation boundary hardening is also complete inside that milestone
- contractor admin edge mutation boundary hardening is also complete inside that milestone
- contractor invite acceptance membership boundary hardening is also complete inside that milestone
- internal business profile mutation boundary hardening is also complete inside that milestone
- internal intake create mutation boundary hardening is also complete inside that milestone
- internal job-detail customer / notes / data-entry mutation boundary confirmation hardening is also complete inside that milestone
- internal ECC save / save-complete mutation boundary confirmation hardening is also complete inside that milestone
- targeted legacy job-detail mutation entrypoints no longer rely on missing or incomplete server-side actor/scope enforcement on the hardened paths
- same-account scope is now explicitly asserted before the targeted legacy job-detail mutations proceed
- cross-account internal access is denied before write on the targeted legacy job-detail paths
- non-internal access is denied before write on the targeted legacy job-detail paths
- denied targeted legacy job-detail paths do not write `jobs` or `job_events`
- the generic low-level `updateJob` helper was safely reduced to internal-only/non-exported usage
- this was a targeted legacy job-detail mutation-boundary slice, not a full jobs/job_events permission-model rewrite and not the end of broader RLS hardening
- these completions are limited to targeted internal mutation-boundary slices (including the `/jobs/[id]` ops-lane job-detail slice, targeted release/re-evaluate slice, targeted service closeout slice, and targeted contractor-report preview/send slice), attachment/account-scope hardening, ECC truth/account-scope hardening, and equipment/system account-scope hardening, not a full jobs/service_cases/job_events, attachment, ECC, or equipment/system permission-model rewrite
- targeted lifecycle/scheduling mutation-boundary hardening now also covers `advanceJobStatusFromForm`, `revertOnTheWayFromForm`, and `updateJobScheduleFromForm` with same-account assertion and cross-account denial before mutation
- targeted contractor CRUD mutation-boundary hardening now also covers `updateContractorFromForm` and legacy `createContractorFromForm` with same-account assertion and cross-account denial before mutation
- targeted staffing / job assignment mutation-boundary hardening now also covers `assignJobAssigneeFromForm`, `setPrimaryJobAssigneeFromForm`, and `removeJobAssigneeFromForm` with same-account assertion and cross-account denial before mutation
- targeted job contractor relink mutation-boundary hardening now also covers `updateJobContractorFromForm` with same-account assertion, cross-account denial, and forged cross-account `contractor_id` denial before mutation
- targeted customer standalone mutation-boundary hardening now also covers `archiveCustomerFromForm` and `updateCustomerNotesFromForm` with same-account customer assertion and cross-account denial before mutation
- targeted internal invoice mutation-boundary hardening now also covers `createInternalInvoiceDraftFromForm`, `saveInternalInvoiceDraftFromForm`, `issueInternalInvoiceFromForm`, `voidInternalInvoiceFromForm`, `addInternalInvoiceLineItemFromForm`, `updateInternalInvoiceLineItemFromForm`, `removeInternalInvoiceLineItemFromForm`, and `sendInternalInvoiceEmailFromForm` with same-account scoped-job preflight assertion and cross-account/non-internal denial before mutation or side effects
- denied targeted internal invoice paths do not write `internal_invoices`, `internal_invoice_line_items`, `jobs`, `job_events`, or `notifications`, and do not send invoice email side effects
- targeted internal notification read-state mutation-boundary hardening now also covers `listInternalNotifications`, `markNotificationAsRead`, `markAllNotificationsAsRead`, and `getInternalUnreadNotificationCount` with explicit same-account internal notification scope assertion and cross-account/non-internal denial/exclusion on targeted notification read-state paths
- denied targeted notification read-state mark paths do not write `notifications` when access is denied
- targeted internal identity/admin mutation-boundary hardening now also covers `createInternalUserFromForm`, `updateInternalUserRoleFromForm`, `activateInternalUserFromForm`, `deactivateInternalUserFromForm`, `inviteInternalUserFromForm`, `deleteInternalUserFromForm`, `updateInternalUserProfileFromForm`, `resendInternalInviteFromForm`, `sendPasswordResetFromForm`, `resendContractorInviteFromForm`, and `inviteContractorUserFromForm` with explicit same-account target preflight assertion and cross-account/non-internal denial before mutation or side effects
- denied targeted internal identity/admin paths do not write `internal_users` and do not trigger `inviteUserByEmail`, `resetPasswordForEmail`, or `inviteContractor` side effects when access is denied
- targeted dispatch calendar read-boundary hardening now also covers the central dispatch dataset path in `calendar-actions.ts` with explicit same-account scope assertion before dataset assembly and cross-account exclusion on returned jobs, downstream `job_events`, and downstream assignment expansion
- non-internal access is denied before dispatch calendar dataset assembly proceeds on the hardened path
- this was a targeted dispatch calendar read-boundary slice, not a calendar UI redesign, not a calendar block mutation pass, and not the end of broader RLS hardening
- targeted dispatch calendar block mutation-boundary hardening now also covers `createCalendarBlockEventFromForm`, `updateCalendarBlockEventFromForm`, and `deleteCalendarBlockEventFromForm` with one explicit same-account internal mutation boundary before targeted calendar block writes proceed
- cross-account and non-internal access are denied before write on the targeted calendar block mutation paths
- denied targeted calendar block mutation paths do not write `calendar_events`
- this was a targeted calendar block mutation-boundary slice, not a calendar UI redesign, not a dispatch dataset rewrite, and not the end of broader RLS hardening
- targeted admin terminal job mutation-boundary hardening now also covers `archiveJobFromForm` and `cancelJobFromForm` with one explicit admin + same-account scoped-job preflight before the targeted terminal job write phases proceed
- cross-account admin, non-admin internal, and non-internal access are denied before write on the targeted admin terminal job mutation paths
- denied targeted archive paths do not write `jobs`
- denied targeted cancel paths do not write `jobs` or `job_events`
- this was a targeted admin terminal job mutation-boundary slice, not a general jobs/job_events permission-model rewrite, and not the end of broader RLS hardening
- contractor portal intake proposal visibility and collaboration boundary hardening is also complete
- live contractor-facing proposal list/detail/comment paths no longer rely on page-local contractor filtering plus elevated admin reads/writes alone for the hardened paths
- one explicit contractor-scoped proposal access boundary is now asserted before targeted elevated proposal visibility/collaboration flows proceed
- cross-contractor access is denied before targeted elevated read/write on the hardened proposal paths
- non-contractor access is denied before targeted elevated read/write on the hardened proposal paths
- denied targeted proposal paths do not proceed into elevated proposal row reads
- denied targeted proposal paths do not proceed into elevated proposal comment reads/writes
- denied targeted proposal paths do not proceed into elevated proposal attachment reads
- the hardened contractor portal proposal paths cover proposal list visibility, proposal detail visibility, and the contractor proposal addendum/comment collaboration path
- this was a targeted contractor portal proposal visibility/collaboration boundary slice, not a contractor portal UX redesign, not a contractor intake adjudication redesign, and not the end of broader RLS hardening
- customer profile upsert mutation boundary hardening is also complete
- `upsertCustomerProfileFromForm` no longer relies on internal-only access plus downstream update flow alone for the hardened path
- one explicit same-account customer mutation preflight is now asserted before canonical customer write or downstream job snapshot sync proceeds on the targeted upsert path
- cross-account internal access is denied before write on the targeted upsert path
- non-internal access is denied before write on the targeted upsert path
- denied targeted upsert paths do not write `customers`
- denied targeted upsert paths do not write downstream `jobs` snapshot fields
- this was a targeted customer profile upsert mutation-boundary slice, not a broader customer subsystem rewrite, not a snapshot-model rewrite, and not the end of broader RLS hardening
- contractor admin edge mutation boundary hardening is also complete
- the remaining live contractor admin edge mutation entrypoints no longer rely on partial or incomplete admin/owner checks alone for the hardened paths
- one explicit same-account contractor mutation preflight is now asserted before targeted contractor admin edge writes proceed
- cross-account internal/admin access is denied before write on the targeted edge paths
- non-internal access is denied before write on the targeted edge paths
- denied targeted edge paths do not write contractor records
- the hardened contractor admin edge entrypoints cover `updateContractorNameAndEmailFromForm` and `createQuickContractorFromForm`
- this was a targeted contractor admin edge mutation-boundary slice, not a contractor subsystem rewrite, not a contractor invite redesign, and not the end of broader RLS hardening
- contractor invite acceptance membership boundary hardening is also complete
- the live contractor invite acceptance membership path no longer relies on elevated invite/membership reads-writes plus fallback-by-email behavior alone for the hardened path
- one explicit scoped acceptance preflight is now asserted before contractor membership creation or invite-acceptance mutation proceeds on the targeted acceptance path
- preferred acceptance resolution is auth-user-first where available
- legacy fallback-by-email is now constrained to deterministic single-scope acceptance only
- ambiguous invite scope is denied before write on the hardened acceptance path
- invalid or unsafe cross-scope acceptance is denied before write on the hardened acceptance path
- denied targeted acceptance paths do not write `contractor_users`
- denied targeted acceptance paths do not write `contractor_invites`
- the hardened targeted acceptance path covers `ensureContractorMembershipFromInvite` and the live set-password acceptance handoff behavior that uses that path
- this was a targeted contractor invite acceptance membership-boundary slice, not a broader auth redesign, not a contractor invite issuance/resend redesign, and not the end of broader RLS hardening
- internal business profile mutation boundary hardening is also complete
- the live internal business profile save path no longer relies on elevated profile/storage mutation flow alone for the hardened path
- one explicit scoped business-profile mutation preflight is now asserted before profile upsert or storage mutation proceeds on the targeted path
- cross-account or invalid-scope access is denied before write on the targeted path
- non-admin/non-internal access is denied before write on the targeted path
- denied targeted business-profile paths do not write `internal_business_profiles`
- denied targeted business-profile paths do not perform storage upload/remove mutations
- the hardened targeted business-profile path covers `saveInternalBusinessProfileFromForm` and the live admin company-profile form path that uses it
- this was a targeted internal business profile mutation-boundary slice, not a broader business-identity redesign, not tenant-settings expansion, and not the end of broader RLS hardening
- internal intake create mutation boundary hardening is also complete
- `createJobFromForm` no longer relies on broad downstream create flow alone for internal intake creation on the hardened path
- one explicit owner-scoped internal intake create preflight is now asserted before canonical create/link mutation or downstream side effect proceeds on the targeted intake-create path
- cross-account or invalid-scope internal access is denied before write on the targeted intake-create path
- non-internal access is denied before write on the targeted intake-create path
- contractor-authorized intake behavior was preserved without authority expansion
- denied targeted intake-create paths do not write `customers`, `locations`, `jobs`, or `job_events`
- denied targeted intake-create paths do not trigger downstream notifications/emails tied to the blocked create flow
- this was a targeted internal intake create mutation-boundary slice, not a `/jobs/new` redesign, not a contractor intake redesign, and not the end of broader RLS hardening
- internal job-detail customer / notes / data-entry mutation boundary confirmation hardening is also complete
- the remaining live internal `/jobs/[id]` customer / notes / data-entry mutation entrypoints now have explicit seam-proof coverage on the hardened path
- the targeted confirmed entrypoints are `updateJobCustomerFromForm`, `addPublicNoteFromForm`, `addInternalNoteFromForm`, and `completeDataEntryFromForm`
- those targeted entrypoints were confirmed to already route through the shared same-account internal scoped-job boundary on the hardened path
- same-account internal allow is now explicitly proven for that targeted cluster
- cross-account internal deny is now explicitly proven for that targeted cluster
- non-internal deny is now explicitly proven for that targeted cluster
- denied targeted cluster paths do not write `jobs` or `job_events`
- denied `completeDataEntryFromForm` paths do not advance downstream ops-projection-changing behavior on the blocked path
- this was a targeted internal job-detail customer / notes / data-entry seam-proof confirmation slice, not a `/jobs/[id]` redesign, not an ECC redesign, and not the end of broader RLS hardening
- internal ECC save / save-complete mutation boundary confirmation hardening is also complete
- the remaining live internal `/jobs/[id]/tests` ECC save / save-complete mutation entrypoints now have explicit seam-proof coverage on the hardened path
- the targeted confirmed entrypoints are `saveRefrigerantChargeDataFromForm`, `saveAirflowDataFromForm`, `completeEccTestRunFromForm`, `saveAndCompleteDuctLeakageFromForm`, `saveAndCompleteAirflowFromForm`, and `saveAndCompleteRefrigerantChargeFromForm`
- those targeted entrypoints were confirmed to already route through the shared same-account internal ECC scoped boundary on the hardened path
- same-account internal allow is now explicitly proven for that targeted ECC cluster
- cross-account internal deny is now explicitly proven for that targeted ECC cluster
- non-internal deny is now explicitly proven for that targeted ECC cluster
- denied targeted ECC cluster paths do not write `ecc_test_runs`
- denied `completeEccTestRunFromForm` paths do not advance downstream ops-projection-changing behavior on the blocked path
- denied `completeEccTestRunFromForm` paths do not advance retest-resolution/job-event behavior where reachable on the blocked path
- this was a targeted internal ECC save / save-complete seam-proof confirmation slice, not an ECC redesign, not a `/jobs/[id]/tests` redesign, and not the end of broader RLS hardening
- targeted contractor intake adjudication mutation-boundary hardening now also covers `finalizeContractorIntakeSubmissionFromForm`, `rejectContractorIntakeSubmissionFromForm`, and `markContractorIntakeSubmissionAsDuplicateFromForm` with one explicit same-account adjudication preflight before targeted write phases proceed
- cross-account and non-internal access are denied before write on the targeted contractor intake adjudication paths
- denied targeted contractor intake adjudication paths do not write `contractor_intake_submissions`, `customers`, `locations`, `jobs`, or `job_events`
- this was a targeted contractor intake adjudication mutation-boundary slice, not a contractor intake UX redesign, not a contractor portal redesign, and not the end of broader RLS hardening
- this completion does not mean payment execution is live, and does not mean checkout/processor behavior was added
- this completion does not mean the full broader invoice/billing permission model is finished across every possible path
- this completion does not mean the full broader notification/messaging permission model is finished across every possible path
- this completion does not mean the full broader internal identity/admin permission model is finished across every possible path
- this completion does not mean the full broader calendar/dispatch permission model is finished across every possible path
- this completion does not mean the full broader contractor intake/intake-review permission model is finished across every possible path
- this completion does not mean contractor portal UX redesign was done
- this completion does not mean contractor intake adjudication redesign was done
- this completion does not mean contractor portal redesign was done
- this completion does not mean contractor invite redesign was done
- this completion does not mean contractor invite issuance/resend redesign was done
- this completion does not mean customer/location redesign was done
- this completion does not mean snapshot-model rewrite was done
- this completion does not mean the full broader auth/identity lifecycle model is finished across every possible path
- this completion does not mean business-identity redesign was done
- this completion does not mean tenant-settings expansion was done
- this completion does not mean the full broader intake permission model is finished across every possible path
- this completion does not mean `/jobs/new` workflow redesign was done
- this completion does not mean `/jobs/[id]` workflow redesign was done
- this completion does not mean `/jobs/[id]/tests` workflow redesign was done
- this completion does not mean ECC redesign was done
- this completion does not mean the full broader ECC workflow/permission model is finished across every possible path
- this completion does not mean every possible future jobs/job_events operational mutation hardening item is complete; broader/global security normalization remains deferred future work outside the closed targeted RLS / permission hardening milestone
- the targeted RLS / permission hardening milestone is formally closed at the seam-hardening level; broader/global security normalization remains deferred future work
- this completion does not mean every possible future jobs/job_events operational mutation hardening item is complete; broader/global security normalization remains deferred future work outside the closed targeted RLS / permission hardening milestone
- the targeted RLS / permission hardening milestone is formally closed at the seam-hardening level; broader/global security normalization remains deferred future work
- this completion does not mean the full broader contractor permission model is finished across every possible path
- this completion does not mean the full broader staffing permission model is finished across every possible path
- this completion does not mean the full broader customer permission model is finished across every possible path
- this completion does not mean every possible future jobs/job_events operational mutation hardening item is complete; broader/global security normalization remains deferred future work outside the closed targeted RLS / permission hardening milestone
- the targeted RLS / permission hardening milestone is formally closed at the seam-hardening level; broader/global security normalization remains deferred future work

This stays aligned to the current roadmap order already in the spine while accurately marking reporting as no longer the active incomplete milestone.

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

3. Customer Support / Remote Assistance (V1A/V1B/V1C)

Current confirmed state:
- V1A support-access foundation is implemented, committed, and pushed on `main`.
- V1A includes:
  - `support_users`
  - `support_account_grants`
  - `support_access_sessions`
  - `support_access_audit_events`
  - support access resolver + support audit helper
  - DB-level session/grant/account consistency invariant
- V1A migration is applied to sandbox only.
- Production support-access migration/apply remains intentionally deferred.
- V1C feature exposure guard is implemented and fail-closed: `ENABLE_SUPPORT_CONSOLE` must be explicitly enabled to expose support console routes/actions.
- Production `ENABLE_SUPPORT_CONSOLE` remains intentionally unset/false.
- No production support access is live.

V1B status:
- V1B support console shell is implemented, committed, and sandbox-smoked.
- Sandbox smoke confirmed denied/start/end audit behavior (`access_denied`, `session_started`, `session_ended`).
- Support Console hardening slice H1-H5 is implemented:
  - active `support_user` is required before support console page-shell render
  - non-support admins are redirected back to `/ops/admin/users` with a support-user-required notice
  - start/end action entry points enforce active `support_user` parity
  - support session start requires human-entered reason; reason is stored in audit metadata (`operator_reason`)
  - scoped account load writes `account_viewed` audit event with short-window dedupe
  - notice handling is polished for support console unavailable and support-user-required flows on `/ops/admin/users`

Locked support boundaries:
- support sessions are read-only only
- support access requires explicit `support_user` + active grant + active session
- support sessions are account-owner scoped
- audit events are required
- support start reason is required for audit quality
- no impersonation/login-as-customer behavior
- no tenant job/customer/invoice browsing surface yet
- no support mutation behavior yet
- no support-side operational writes
- no customer-facing support actions
- no broad tenant browsing expansion

Parked/deferred production enablement decision:
- Support V1 architecture is complete enough to park; this is not unfinished architecture.
- Production enablement is intentionally deferred pending better timing and explicit rollout need.
- Do not proceed now with production support migration apply, production support seeding, or production feature-flag enablement.
- H1-H5 hardening implementation does not change deferment: production migration apply, production feature flag enablement, production support-user/grant setup, controlled smoke, and rollback rehearsal remain explicit later approvals.
- Execution-controlled runbook is documented at `docs/ACTIVE/Support_Console_Production_Enablement_Runbook.md` and must be committed before any production support-console action.

Keep-ready rollout checklist (later, explicit approval only):
- production migration approval
- production `support_user` seed
- one read_only grant
- explicit `ENABLE_SUPPORT_CONSOLE` enablement
- controlled smoke
- rollback by disabling `ENABLE_SUPPORT_CONSOLE`

Deferred-later support rollout items:
- production rollout decision remains explicit and deferred
- production migration timing remains explicit and deferred
- production feature exposure / route visibility decision remains open
- tenant/customer-facing support grant visibility remains later
- read-only account overview remains later
- support mutation remains a much later explicit decision, if ever

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

Compliance Matters Software is a stabilized, event-driven operational system for compliance and service workflows, with complete scheduling and staffing foundations, strong auditability, completed payment-ready foundation, deferred live payment execution, and future-ready business-layer expansion.

23. Supporting document:
For detailed payment implementation direction, use:
`docs/ACTIVE/Compliance_Matters_Payments_Roadmap.md`

This roadmap is subordinate to the Active Spine. If code or planning detail conflicts with the spine, the spine wins.