# Phase 2 — Core Workflow

Phase 2 focuses on workflow integrity and operational stability.

---

# Completed

Contractor multi-tenant model  
Customer + location linking  
Job equipment + systems  
ECC test runs data model  
Attachments system  
Job events foundation  
Job archiving  
Internal admin user model  
RLS stabilization

---

# In Progress

Contractor Portal workflow clarity

Portal must clearly show:

Failed jobs  
Pending information  
Retest required  
Scheduled jobs

---

# Remaining Work

Portal Queue Engine

- filter jobs by contractor
- hide archived jobs
- implement queue filtering
- show failure reasons clearly

Ops Command Center

/ops becomes central operations engine.

Queues:

Need to schedule  
Pending info  
Retest required  
Invoice required  
Paperwork required

Job Events Expansion

Standardize lifecycle events:

job_created  
job_scheduled  
job_started  
job_failed  
retest_created  
job_passed  
invoice_added  
paperwork_completed  
job_closed

Retest Workflow

Retests should create a child job using:

parent_job_id

Invoice Workflow

Invoice number should move job to:

invoice_required → paperwork_required

Closeout Workflow

After paperwork completion:

ops_status → complete

---

# Phase 2 Exit Criteria

Phase 2 is complete when:

Contractor portal clearly communicates workflow

Ops dashboard functions as queue manager

Job lifecycle transitions are stable

Retest workflow functions correctly

Invoice and paperwork tracking exists

Timeline events capture all major transitions