# DATA FLOW MAP — v2 (Aligned with Spine v2)

Compliance Matters Software

System Model: Event-Driven + Service Case Container Architecture

---

# 1. Core Principle (Updated)

The system does NOT revolve around a single job.

The system models:

Service Case (Problem)
→ Jobs (Visits)
→ Events (Operational Narrative)

Jobs are operational units.
Service Cases provide continuity.
Events provide truth.

---

# 2. Core Entity Flow (Corrected)

Customer
↓
Location (Operational Anchor)
↓
Service Case (Problem Container)
↓
Job (Visit)
↓
ECC Test Runs
↓
Event Stream (job_events)
↓
Ops Status Projection
↓
Resolution → Closeout → Archive

---

# 3. Service Case + Job Relationship

Service Case = problem being solved

Job = individual visit

Rules:

- Root job creates a new service case
- Child jobs inherit service_case_id
- parent_job_id represents visit chain
- service_case_id represents container

---

# 4. Operational Loop (REAL FLOW)

Job Created
↓
ECC Test Performed
↓
Pass / Fail Determined

IF PASS:
→ Proceed to Closeout

IF FAIL:
→ Contractor Report Generated
→ Contractor Report Sent (event)

↓

Contractor Responds:
- contractor_note
- contractor_correction_submission
- retest_ready_requested

↓

System Records Event (job_events)

↓

Ops Reviews + Internal Notes
↓

Decision:

A) Correction Accepted
→ failure_resolved_by_correction_review
→ Move to paperwork_required

B) Retest Required
→ Create Child Job (new visit)
→ Continue loop

---

# 5. Event-Driven System (Source of Truth)

job_events = canonical operational narrative

All actions MUST create events:

- contractor_report_sent
- contractor_note
- contractor_correction_submission
- retest_ready_requested
- internal_note
- attachment_added
- job_passed / job_failed

No silent state changes allowed.

---

# 6. ECC Test Flow (Unchanged Core)

jobs
↓
ecc_test_runs
↓
data (JSON)
↓
computed_pass
↓
override_pass (optional)
↓
is_completed

↓

evaluateEccOpsStatus(jobId)
↓

jobs.ops_status (derived projection)

---

# 7. Ops Status Flow (Projection Layer)

jobs
↓
job_events + ecc_test_runs
↓
evaluateEccOpsStatus
↓
ops_status

↓

Displayed in:
- /ops dashboard
- queues
- job cards

Important:

ops_status is NOT manually controlled.
It is derived.

---

# 8. Contractor Interaction Layer

Contractor Portal interacts ONLY through events.

Contractors can:
- view job
- view report
- submit responses
- upload attachments

Contractors CANNOT:
- change lifecycle
- modify ops_status
- close jobs

---

# 9. Closeout Flow

Requirements:

- job passed
- invoice sent
- certification completed

↓

ops_status → closed

↓

Archive Logic:

- removed from active queues
- retained in history

---

# 10. Archive Behavior

Archived jobs:
- not actionable
- not counted in queues
- visible in history only

---

# 11. Calendar + Scheduling

jobs
↓
scheduled_date
window_start / window_end
↓

calendar view

Scheduling events also logged in job_events

---

# 12. System Truth Hierarchy

1. job_events → narrative truth
2. ecc_test_runs → test truth
3. jobs.ops_status → operational projection
4. service_cases → continuity layer

---

# 13. System Model Summary (Final)

Compliance Matters is NOT a job tracker.

It is an:

Event-driven operational system  
that tracks problem resolution  
across multiple visits  
with full audit visibility

---

# END