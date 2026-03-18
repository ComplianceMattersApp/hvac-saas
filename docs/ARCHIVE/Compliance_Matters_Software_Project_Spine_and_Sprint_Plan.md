Compliance Matters Software
Project Spine & Sprint Plan
Living roadmap + thread handoff breadcrumbs (Thread 8 and onward)

1) Purpose
This document is the single source of truth for what we’re building, what is locked, what is postponed, and how we keep continuity across many ChatGPT threads. The goal is a field-ready ECC Rater product first, while building a shared job core that can expand into Retail/HVAC later.
2) Product Direction (Locked)
•	Software A (Now): ECC Raters — job → customer → equipment → photos → tests → results.
•	Software B (Later): Retail/HVAC service software — built from the shared job core; job_type drives module visibility.
•	Contractors cannot schedule jobs in the current tracker version.
•	UI polish sprint will happen later (design system, reusable components). Not now.
•	Authentication/logins will be added later (separate logins for Eddie + wife). Not required for immediate solo testing.
•	Timeline/audit trail is important; we will start with lightweight event logging first.
3) Current System Status (as of Thread 8)
•	Stack: Next.js App Router + Supabase + Vercel (GitHub auto-deploy).
•	Working routes: /jobs, /jobs/new, /jobs/[id], /calendar; root redirects to /jobs.
•	Jobs list shows customer name + notes preview; job detail has ECC tests (ecc_test_runs) wired.
•	jobs table includes job_type (default 'ecc'), project_type (default 'alteration'), customer fields, and job_address.
•	ECC tests: flexible order; Refrigerant Charge (CHEERS-aligned), Airflow, Duct Leakage; 'Add Alteration Core Tests' is idempotent.
•	Data reset completed: calendar is clean; fresh job created; ready for field use.
4) Core Data Model (Locked Direction)
4.1 Entities
•	Customers: who the customer is (name, email, phone; later mailing/billing address).
•	Locations: where the work happens (service address). A customer can have multiple locations.
•	Jobs: a scheduled visit/event tied to a location (and therefore a customer). Contains job workflow status, ops/queue status, permit, tests, results, etc.
•	Job Segments (Linked Visits): follow-up/revisit jobs linked to a parent job for full history.
•	Equipment: job equipment records (furnace, condenser, package unit, etc.).
•	ECC Test Runs: ecc_test_runs per job with data/computed/override.
•	Attachments: generic media/attachments tied to any entity (job, test_run, customer, location).
•	Job Events: lightweight activity log (status changes, notes, reports sent, etc.).
•	Notifications Ledger: records when reports/notifications are generated/sent (manual now, automated later).
4.2 Address layers (Decision)
•	Job site address lives on the job/location level (what you use daily in the field).
•	Customer mailing/billing address can be added later if needed without disrupting the job site address model.
5) Operations & Queue Management (Locked)
We keep your field workflow status separate from operational visibility. The ops layer exists to prevent revenue delays and jobs slipping through the cracks.
5.1 Two distinct concepts
•	Field status (existing): open → on_the_way → in_process → completed; plus failed/cancelled.
•	Ops status (new): need_to_schedule (call list), pending_info (permit number, etc.), on_hold, retest_needed, ready.
5.2 Follow-up discipline
•	follow_up_date + next_action_note to keep items resurfacing until resolved.
•	action_required_by (rater/contractor/customer) as lightweight future-proof metadata.
5.3 Auto-archive rule
•	If invoice_number is present AND CHEERS is completed AND job is completed → job falls off active dashboard into archived/completed queue (still searchable).
6) Reports, Summaries, and Notifications (Planned)
•	CHEERS summary view: a human-readable summary after tests complete, optimized for CHEERS data entry.
•	CHEERS completed checkbox: cheers_completed + cheers_completed_at.
•	Failed report: generate a contractor-facing report when job/test fails; log in notifications ledger.
•	Pending info report: generate report explaining what is missing (e.g., permit number); log in notifications ledger.
•	Automation later: actual email sending after contractor assignment + auth/RLS are in place.
7) Linked Jobs (Segments / Revisits)
•	Add parent_job_id on jobs to link follow-up visits to the original job.
•	Job detail shows linked visit history in chronological order.
•	Button: 'Create follow-up job' creates a new job prefilled and linked to the parent.
8) Uploads & Intake (Phased)
•	Phase 1: Eddie uploads photos to jobs (thumbnails, captions optional).
•	Phase 2: Contractor uploads for corrections/retest workflow.
•	Phase 3: Customer intake link (public token) with photo uploads and basic info confirmation.
9) Job Type Toggle (ECC vs Retail)
•	On /jobs/new: choose ECC or Retail.
•	ECC jobs show permit/equipment/tests modules.
•	Retail jobs hide ECC-only sections and keep core job scheduling + customer/location info.
10) Equipment Model Additions
•	Add equipment type: package_unit.
•	Rule: package unit defaults to no refrigerant charge test (factory charged); allow override if needed.
11) Sprint Plan (High Level)
Sprint A — Contractor Foundation (Thread 8 focus)
1.	DB: contractors table (done) + connect contractor_id to jobs (assign/unassign).
2.	UI: contractor assignment card on /jobs/[id].
3.	Later: contractor portal visibility + RLS.
Sprint B — Ops/Queue Core
4.	DB: ops_status, follow_up_date, next_action_note, action_required_by, lifecycle_state.
5.	UI: master job list filters/queues (need_to_schedule, pending_info, on_hold, retest_needed).
6.	Auto-archive: completed + invoice_number + cheers_completed.
Sprint C — Customer/Location Spine (Future-proofing)
7.	DB: customers + locations + jobs.customer_id + jobs.location_id (safe migration, no breaking changes).
8.	Backfill: create customer/location records from existing job customer fields as needed.
9.	UI: /customers searchable list and /customers/[id] showing all jobs.
Sprint D — CHEERS Efficiency + Invoice
10.	Add invoice_number.
11.	CHEERS summary view + cheers_completed checkbox.
12.	Dashboard behavior: archive when invoice + CHEERS complete.
Sprint E — Linked Jobs (Segments)
13.	Add parent_job_id; UI list of linked visits; 'Create follow-up job' button.
Sprint F — Uploads
14.	Generic attachments system (entity_type/entity_id).
15.	Eddie uploads first, then contractors, then customer intake token flow.
Sprint G — Notifications v1
16.	Notification ledger + job events log.
17.	Generate failed/pending reports; manual send now; automate later.
12) Wait List (Intentionally Postponed)
•	Full invoicing / payments / estimates / pricebook.
•	SMS automation.
•	Full role-based access control + RLS policies (after auth is implemented).
•	UI design system / heavy polish pass.
•	Advanced reporting beyond basic ops aging/blockers.
13) Thread Handoff Breadcrumb Template
Copy/paste this block at the start of each new ChatGPT thread:
PROJECT STATE (Carryover)
- Thread: [X]
- Stack: Next.js App Router + Supabase + Vercel (GitHub auto-deploy)
- Live routes: /jobs, /jobs/new, /jobs/[id], /calendar; root -> /jobs
- Current focus: Contractor foundation -> Ops/Queue -> Customer/Location spine
- Locked decisions:
  - Customers + Locations model (customer -> location -> jobs), safe migration (no big-bang rewrite)
  - Ops_status separate from field status
  - Linked visits via parent_job_id (segments)
  - Attachments as generic entity_type/entity_id
  - Events + notifications ledger before full automation
- Intentionally postponed: auth/RLS, payments/invoicing system, SMS, UI polish sprint
- Last completed step: [describe]
- Next step (single): [describe exact next action + file/SQL]

