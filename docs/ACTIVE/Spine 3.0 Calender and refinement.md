Compliance Matters Software — Calendar / Dispatch Architecture Spec

Status: LOCKED FOR DESIGN
Phase: Spine 3.0 — Calendar + Refinement
Purpose: define the Calendar / Dispatch layer as a projection of the existing operational system, not a separate scheduling product. The spine already identifies Calendar / Dispatch as the last major system to add, and explicitly requires it to integrate with job_assignments, scheduled_date, the staffing engine, and ops_status.

1. System Position

Compliance Matters is an event-driven operational workflow engine. Jobs are operational units, service cases are problem containers, job_events are the narrative source of truth, and staffing is controlled by job_assignments. The calendar must extend that model, not replace it.

Calendar Definition

The Calendar / Dispatch layer is:

a time-based dispatch projection of scheduled jobs, staffing, and operational state

It is not:

a new source of scheduling truth

a standalone calendar widget

a technician-owned system

a replacement for Ops queues

a replacement for /ops/field

This matches the domain map, where scheduling ownership already belongs to the calendar/scheduling domain but must remain tied to job scheduling fields and should produce events.

2. Fundamental Representation (LOCKED)
Recommended Model

Hybrid dispatch model with job-centric truth

Why

The system already defines:

Job = visit / operational unit

Service Case = problem / continuity container

job_assignments = staffing truth

job_events = narrative truth

ops_status = operational projection

Because of that:

the primary object on the calendar is the job

the primary workload lens is the technician / assignee

the meaning of the job comes from ops_status + field state

the history of schedule changes belongs in job_events

Locked Principle

Jobs are what get scheduled. Technicians are how workload is viewed.

This preserves the existing architectural rule:

role = permission
assignment = workload

3. Source of Truth Map (LOCKED)

The calendar must be a projection layer over existing truth. It must not invent a parallel scheduling model.

Canonical Scheduling Truth

From the domain map, scheduling ownership already lives on calendar/scheduling and uses the existing job fields:

jobs.scheduled_date

jobs.window_start

jobs.window_end

Canonical Staffing Truth

job_assignments = assignment source of truth

all displayed people must flow through the Human Layer Adapter

UI must not expose raw user IDs or bypass the adapter

Canonical Operational Meaning

jobs.ops_status = operational projection layer

it is derived, not manually invented by the calendar UI

Canonical Narrative / Audit

job_events = source of truth for schedule-related actions and visibility history

no hidden schedule mutation standard should be introduced outside the event model

Continuity Context

service_cases = continuity across visits

parent_job_id = direct retest / follow-up relationship

calendar phase 1 may reference this for context, but should still render jobs as the scheduled object

4. Calendar Read Rules (LOCKED)

The calendar reads existing operational truth only.

Calendar must read from

jobs

job_assignments

jobs.ops_status

lifecycle / field state

Human Layer Adapter

job_events for schedule history / movement visibility

customers / locations or job snapshots as allowed by Strategy B, without redefining canonical ownership

Calendar must not create

a calendar_events table

a second technician schedule table

a separate dispatch status column

an alternate assignment model

a UI-only schedule state that is not reflected in jobs and events

That would violate the source-of-truth strategy and domain ownership map.

5. Relationship to Existing System Surfaces (LOCKED)

The system already has distinct operational surfaces. Calendar must complement them, not compete with them.

/ops

Owns:

queues

urgency

blockers

pending info

retest needed

paperwork / closeout visibility

“what needs attention?”

/calendar

Owns:

scheduled execution across time

workload coordination

unassigned scheduled work

“who is going where, and when?”

/ops/field

Owns:

worker-facing workload

my work today / in progress / upcoming

“what do I personally need to do next?”

/jobs/[id]

Owns:

canonical job detail

actions

notes

attachments

history

tests

communication loop

“what exactly happened on this visit?”

Locked Principle

Ops is urgency-based. Calendar is time-based. Field is worker-based. Job detail is record-based.

6. Required MVP Views (LOCKED)

The system should start with the minimum viable dispatch layer, not a full scheduling suite.

Phase 1 Views
A. Office Dispatch Day View

Primary MVP surface.

Shows:

scheduled jobs for a selected day

arrival windows

primary assignee + overflow staffing

unassigned scheduled jobs

in-progress / on-the-way markers

quick links to job, customer, and location

B. Office Dispatch Week View

Secondary MVP surface.

Shows:

same scheduling truth across a week

workload balancing visibility

scheduling gaps / overload patterns

upcoming coordination needs

C. Unassigned Jobs Panel

Required alongside day/week dispatch.

Shows:

scheduled jobs with no active assignment

optionally surfaced “needs schedule” counts as a link back to Ops, not as fake calendar blocks

These three views are enough for a safe phase 1.

Phase 2 Views

Technician day view

Technician week view

“My Schedule” simplified field view

stronger filtering and workload pivots

Phase 3 Views

route-oriented dispatch

capacity balancing

service-case chain visibility in schedule context

scheduling intelligence / recommendations

This phased approach aligns with Spine 3.0, which says the remaining work is refinement and expansion, not a core architecture rewrite.

7. Visibility Rules (Phase 1)
Calendar should show

scheduled jobs only

assignment state

time window

customer / location identity

ops_status context

field progress indicators where relevant

unassigned scheduled jobs

active/in-progress jobs that are still part of today’s operational execution

Calendar should not show as active work

archived jobs

jobs excluded by current archive behavior

retest parent jobs when a retest child is the active operational unit

The retest model is already locked: the parent is historical, the retest child is the actionable unit. Calendar must honor that rule.

8. Edit Behavior (Phase 1)

Phase 1 should be read-first with narrow safe writes.

Allowed in Phase 1

assign technician

reassign technician

set primary assignee

remove assignment

update scheduled date

update window start/end

open job/customer/location

Requirements for all writes

use existing owner-domain actions

respect RLS and tenant boundaries

preserve role vs assignment separation

write job_events for scheduling actions / reassignment actions as part of the dispatch standard

revalidate affected read surfaces after mutation

This is consistent with the domain map rule that UI does not own behavior, and the calendar/scheduling domain must remain anchored to existing fields and event visibility.

Not allowed in Phase 1

advanced drag-and-drop as canonical control

bulk routing engine

technician availability system

recurring scheduling logic

schedule logic detached from jobs

lifecycle mutation from the calendar surface

9. Dispatch Behavior Model (LOCKED)
Assignment Behavior

Assignment remains owned by job_assignments.

Calendar may expose assignment controls, but it does not own assignment truth.

Scheduling Behavior

Scheduling remains owned by job scheduling fields:

scheduled_date

window_start

window_end

Ops Behavior

Calendar does not manually determine workflow progression.
It reads ops_status and field state; it does not redefine them.

Event Behavior

Dispatch-relevant mutations should be recorded in job_events so the schedule layer remains auditable and consistent with the system’s event-driven model.

10. Technician Experience (LOCKED DIRECTION)

The system already supports the rule that admins can be assigned to field jobs, while office users may coordinate work without being field users. That must remain intact.

Office Experience

Office users need:

team-wide visibility

dispatch coordination

staffing + reschedule controls

unassigned work visibility

overload / gap visibility

Field Experience

Technicians need:

simpler “My Schedule” view

today / now / next clarity

mobile-friendly workload surface

assignment-aware but permission-safe experience

Locked Principle

Calendar is an office dispatch surface first.
Field schedule is a downstream technician surface second.

11. Risks / Duplication Traps (LOCKED WARNINGS)
Do not:

Create duplicate scheduling truth

Let technician lanes become canonical instead of jobs

Rebuild Ops queues inside Calendar

Show both retest parent and retest child as active work

Bypass the Human Layer Adapter for people display

Let UI mutate lifecycle logic directly

Introduce drag-and-drop before write paths are validated

Break contractor boundaries or internal staffing protections

These warnings follow directly from the spine, source-of-truth strategy, service case model, and domain ownership map.

12. Recommended Implementation Phases (LOCKED)
Phase 1 — Dispatch Visibility MVP

Build /calendar as a read-first dispatch projection.

Includes:

day view

week view

unassigned scheduled jobs panel

staffing visibility via Human Layer Adapter

status and progress context

navigation into canonical surfaces

narrow assignment + schedule controls only

Phase 2 — Dispatch Control Layer

Add:

stronger reassignment UX

inline reschedule workflows

technician-specific schedule lens

more filtering / grouping

field-facing “My Schedule” alignment

Phase 3 — Dispatch Intelligence

Add only after stability:

route-aware planning

capacity views

service chain context

technician utilization / planning intelligence

advanced drag/drop if safe

13. Final Locked Definition
One-line definition

Calendar / Dispatch is the time-based operational projection of scheduled jobs across staffing, workload, and operational state.

Final architectural rule

Job is the scheduled unit. Assignment is the workload overlay. Calendar is the projection surface. Events preserve the audit trail.

This spec is aligned with the current active spine, source-of-truth strategy, service case architecture, domain map, and data flow map.

Source files

Spine v3.0

Project Spine & Sprint Plan

Source-of-Truth Strategy

Service Case Container Spine

DOMAIN MAP v2

DATA FLOW v2