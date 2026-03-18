# Compliance Matters Software — System Blueprint

## Overview

Compliance Matters Software is a contractor operations platform designed for HERS raters and HVAC contractors.

Primary goals:

• Manage job lifecycle from intake → testing → closeout  
• Provide operational queue management for raters  
• Allow contractors to submit jobs and respond to failures  
• Track testing data and compliance documentation  
• Provide transparent workflow visibility to customers

---

# System Stack

Frontend
- Next.js App Router
- React Server Components
- Tailwind UI

Backend
- Supabase (Postgres)
- Row Level Security (RLS)
- Server Actions

Infrastructure
- Vercel
- GitHub

Architecture Style
- Job-centric domain model
- Server Action data layer
- Multi-tenant contractor isolation

---

# Core Domains

Operations  
Scheduling  
Customers  
Jobs  
Testing  
Contractor Portal  
Internal Admin Tools

---

# Database Model

## Identity

users  
contractors  
contractor_users  
internal_users

## CRM

customers  
locations  

Relationships:

customers → locations

---

## Job System

jobs

Key fields:

customer_id  
location_id  
contractor_id  

scheduled_date  
window_start  
window_end  

ops_status  
status  

parent_job_id

invoice_number  
closeout_status  

deleted_at

---

## Equipment Model

job_systems  
job_equipment

Relationship:

jobs → job_systems → job_equipment

---

## Testing System

ecc_test_runs

Stores:

test_type  
measurements  
computed_pass  
override_pass  
is_completed

---

## Attachments

attachments

Generic attachment storage for:

jobs  
test runs  
correction submissions

---

## Timeline System

job_events

Canonical job history.

Examples:

job_created  
job_scheduled  
on_my_way  
job_started  
tests_completed  
job_failed  
retest_created  
retest_completed  
invoice_added  
paperwork_completed  
job_closed

---

# Page Architecture

## Operations

/ops  
/calendar

## Jobs

/jobs  
/jobs/new  
/jobs/[id]  
/jobs/[id]/info  
/jobs/[id]/tests

## CRM

/customers  
/customers/[id]

/locations/[id]

## Contractor Portal

/portal  
/portal/jobs/[id]

---

# Job Lifecycle

job_created  
↓  
need_to_schedule  
↓  
scheduled  
↓  
testing  
↓  
pass / fail  
↓  
retest_needed  
↓  
invoice_required  
↓  
paperwork_required  
↓  
complete  
↓  
archive

---

# Ops Queue Engine

Queues are determined by:

jobs.ops_status

Valid values:

need_to_schedule  
scheduled  
pending_info  
failed  
retest_needed  
invoice_required  
paperwork_required  
complete  
on_hold

These drive both:

/ops dashboard  
/portal contractor dashboard

---

# Contractor Portal Rules

Contractors must immediately see:

FAILED  
PENDING INFO  
ON HOLD  
RETEST REQUIRED  
SCHEDULED

Contractors may:

• create jobs
• upload corrections
• add notes
• view job timeline

Contractors may NOT:

• schedule jobs
• modify testing results

---

# Event System

job_events is the canonical audit trail.

Events include metadata stored in JSON.

Example:

job_failed
{
  "reasons": ["Airflow below threshold"]
}

This allows:

timeline display  
customer transparency  
future automation

---

# Archiving

Soft delete implemented via:

jobs.deleted_at

Archived jobs must be excluded from:

/ops  
/portal  
/job lists

---

# Future Integrations

CHEERS certification submission  
Contractor FSM imports  
Customer portal

---

# Development Rules

1. Jobs are the core entity.
2. Operational queues are driven by ops_status.
3. Timeline events must be recorded for lifecycle transitions.
4. Archived jobs must never appear in operational queues.
5. Contractor access must always be filtered by contractor_id.