# DOMAIN MAP — v2 (Ownership + Change Authority)

Purpose: define EXACT ownership of system behavior.

Rule:
If you need to change behavior, START with the owner domain.
Do NOT patch UI first.

System Model:
Event-Driven + Service Case Container Architecture

---

# 1. SERVICE CASES (Problem Container Layer)

Ownership: problem continuity across multiple jobs

**DB**
- service_cases

**Responsibility**
- groups multiple jobs into one problem
- tracks resolution lifecycle across visits

**Key Rules**
- created on root job creation
- inherited by child jobs
- NOT tied to UI yet (Phase 2.5 additive layer)

**Future UI**
- service chain panel
- cross-job narrative

---

# 2. JOBS (Operational Unit / Visit Layer)

Ownership: single visit execution + lifecycle

**Routes**
- app/jobs/page.tsx
- app/jobs/new/page.tsx
- app/jobs/[id]/page.tsx
- app/jobs/[id]/info/page.tsx
- app/jobs/[id]/tests/page.tsx

**Actions (owner)**
- lib/actions/job-actions.ts
- lib/actions/job-contact-actions.ts
- lib/actions/job-ops-actions.ts

**Responsibilities**
- scheduling
- lifecycle (field status)
- contractor assignment
- job-level data

**Key Rule**
Job = visit, NOT the full problem

---

# 3. JOB EVENTS (SYSTEM SOURCE OF TRUTH)

Ownership: ALL operational activity + narrative

**DB**
- job_events

**Actions (owner)**
- (spread across action files — must always insert events)

**Responsibilities**
- contractor communication
- internal notes
- status changes
- attachments tracking
- reporting actions

**Key Rule**
If it matters → it MUST be an event

**Examples**
- contractor_report_sent
- contractor_note
- contractor_correction_submission
- retest_ready_requested
- internal_note
- attachment_added
- job_passed / job_failed

---

# 4. ECC / TEST SYSTEM

Ownership: technical validation + pass/fail logic

**Routes**
- app/jobs/[id]/tests/page.tsx

**Actions (owner)**
- lib/actions/ecc-status.ts
- lib/actions/ecc-paperwork-actions.ts

**DB**
- ecc_test_runs

**Responsibilities**
- store test data
- compute pass/fail
- allow override

**Key Rule**
Tests determine truth → NOT UI

---

# 5. OPS STATUS (PROJECTION LAYER)

Ownership: operational visibility (queues)

**Actions (owner)**
- lib/actions/ops-status.ts
- lib/actions/job-ops-actions.ts

**DB**
- jobs.ops_status

**Derived From**
- ecc_test_runs
- job_events

**Responsibilities**
- queue placement
- urgency classification
- workflow progression

**Key Rule**
ops_status is NEVER manually set blindly  
It is DERIVED

---

# 6. CONTRACTOR INTERACTION LAYER

Ownership: external communication + responses

**Routes**
- app/portal/**
- app/portal/jobs/[id]

**Actions (owner)**
- contractor response actions (notes, corrections, retest requests)

**Responsibilities**
- display contractor-safe data
- accept contractor input
- write events only (no direct mutations)

**Key Rule**
Contractors NEVER control lifecycle  
They only generate signals (events)

---

# 7. CONTRACTOR REPORTING SYSTEM

Ownership: failure communication + resolution loop

**Source**
- generated internally

**Stored As**
- job_events (contractor_report_sent)

**Responsibilities**
- communicate failures
- define next steps
- trigger contractor interaction

**Key Rule**
Reports are events, not separate entities

---

# 8. CUSTOMERS

Ownership: identity of work owner

**Routes**
- app/customers/page.tsx
- app/customers/[id]/page.tsx
- app/customers/[id]/edit/page.tsx

**Actions (owner)**
- lib/actions/customer-actions.ts

**DB**
- customers

---

# 9. LOCATIONS (OPERATIONAL ANCHOR)

Ownership: physical service address

**Routes**
- app/locations/[id]/page.tsx

**Actions (owner)**
- visit-actions.ts
- schedule-actions.ts
- retest-actions.ts
- close-visit-actions.ts

**DB**
- locations

**Key Rule**
Location anchors all jobs + service cases

---

# 10. CALENDAR / SCHEDULING

Ownership: time-based execution

**Routes**
- app/calendar/page.tsx

**Actions (owner)**
- lib/actions/calendar-actions.ts
- lib/actions/calendar.ts

**DB Fields**
- scheduled_date
- window_start
- window_end

**Key Rule**
Scheduling must also produce events (future standard)

---

# 11. ATTACHMENTS SYSTEM

Ownership: all uploaded media

**DB**
- attachments (entity_type + entity_id)

**Responsibilities**
- store photos/files
- link to job / test / event

**Key Rule**
Attachments must generate timeline visibility (event)

---

# 12. AUTH / SESSION

**Routes**
- app/login/page.tsx
- middleware.ts

**Supabase**
- lib/supabase/client.ts
- lib/supabase/server.ts

---

# 13. UI / LAYOUT (NON-OWNERSHIP LAYER)

**Files**
- app/layout.tsx
- components/*
- UI components

**Rule**
UI does NOT own behavior  
It reflects system state

---

# 14. SYSTEM OWNERSHIP HIERARCHY (FINAL)

1. job_events → narrative truth
2. ecc_test_runs → technical truth
3. ops_status → operational projection
4. jobs → execution unit
5. service_cases → continuity layer

---

# END