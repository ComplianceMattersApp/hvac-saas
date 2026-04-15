PHASE 2.5 — Service Case Container Architecture Spine
Status

Phase: 2.5 (Additive Architecture Layer)
Risk Level: Low
Schema Impact: Additive Only
UI Impact: None in Phase 2

Purpose

The Compliance Matters system models real-world service resolution chains, not just isolated jobs.

A Service Case (Container) represents a single problem being solved.

Each Job represents a single operational visit made to resolve that problem.

This architecture allows the system to correctly represent workflows such as:

Title 24 HERS testing and retests

HVAC diagnosis and return visits

contractor callbacks

part ordering return visits

warranty service

unresolved issues requiring multiple visits

Most contractor systems treat these as status changes within a single job.
Compliance Matters instead models them as linked visits within a service container.

Core Concept
Service Case (Problem / Work Order)
   ├─ Job 1 (Initial Visit)
   ├─ Job 2 (Return Visit / Retest)
   └─ Job 3 (Callback / Final Resolution)

Key Principle:

Service Case = The Problem
Job = A Visit

The service case tracks the problem resolution narrative.

Each job remains an independent operational record with its own:

schedule

technician lifecycle

notes

attachments

invoice

certification state

test results

Current Phase 2 Architecture

The current system is job-centric, with jobs serving as the operational source of truth.

Linked visits are represented using:

jobs.parent_job_id

Example:

Job A
 ↳ Job B (retest)
 ↳ Job C (second retest)

The job timeline system (job_events) records the operational narrative for each job.

Operational queues are driven by:

jobs.ops_status

This architecture remains unchanged in Phase 2.

Phase 2.5 Additive Container Layer

Phase 2.5 introduces the service case container layer without disrupting existing workflows.

New table:

service_cases

New column:

jobs.service_case_id

This allows multiple jobs to belong to the same container.

Example:

service_cases
-------------
id
customer_id
location_id
problem_summary
status
created_at
updated_at

Jobs table extension:

jobs
-------------
id
service_case_id
parent_job_id
...

Important distinction:

service_case_id = container membership
parent_job_id = direct visit-to-visit relationship
Implementation Strategy (Phase 2 Safe)

Phase 2.5 implementation is additive only.

No existing logic is replaced.

Steps:

Create service_cases table

Add jobs.service_case_id

Backfill existing root jobs into new containers

Ensure new jobs attach to a container automatically

Rules:

Root Job Creation

When a new job is created and:

parent_job_id IS NULL

The system creates a new service case and assigns:

jobs.service_case_id = new_service_case.id
Child Job Creation

When a job is created with a parent:

parent_job_id = existing_job

Then:

jobs.service_case_id = parent_job.service_case_id

This ensures the entire visit chain belongs to the same container.

Title 24 Example
Service Case: Refrigerant Charge Verification
Job 1 — Initial Test → FAILED
Job 2 — Retest → FAILED
Job 3 — Retest → PASSED

Certification belongs to Job 3, but the case retains the full narrative.

HVAC Contractor Example
Service Case: AC Not Cooling
Job 1 — Diagnose capacitor failure
Job 2 — Return visit install capacitor
Job 3 — Callback system still not cooling
Job 4 — Found wiring issue → resolved

Invoices may exist for multiple visits.

Failure Resolution Model (Locked)

Failed ECC jobs have two possible resolution paths.

Path A — Correction Review

Contractor submits correction evidence.

Internal review determines issue resolved.

failed → paperwork_required

Certifications proceed on the original job.

Timeline event:

failure_resolved_by_correction_review
Path B — Retest Required

Internal review determines another visit is needed.

failed → retest_needed

Child job is created:

child_job.parent_job_id = failed_job.id

Child job becomes a new visit within the same service case.

If retest passes:

paperwork_required → closed

Certifications belong to the retest job, not the original.

Queue Behavior
Failed Queue

Shows jobs where:

ops_status = failed
AND no passing retest exists
Retest Needed Queue

Shows jobs where:

ops_status = retest_needed
Paperwork Required Queue

Shows jobs where:

passed AND paperwork incomplete
Future Expansion (Phase 3+)

The container architecture enables expansion into full contractor workflows.

Examples:

HVAC
diagnose → repair → callback
Plumbing
inspection → return with part
Electrical
install → correction visit
Warranty
service → warranty callback

All follow the same container + visit chain model.

UI Expansion (Future)

Planned feature:

Service Chain Panel

Example UI:

Service Chain

Visit 1 — Failed
Visit 2 — Failed
Visit 3 — Passed

This panel will visualize the container's job chain.

Architectural Principle

Compliance Matters Software is designed around problem resolution chains, not isolated jobs.

The system models the real-world workflow:

Problem → Visits → Resolution

The service case container is the structural foundation enabling this model.

End of Phase 2.5 Specification