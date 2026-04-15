🧱 Compliance Matters Software — Spine v3.0 (Current State of Truth)

You can copy/paste this directly into your project docs.

🧠 System Identity

Compliance Matters Software is a:

Event-driven operational workflow engine with technician-aware staffing, contractor collaboration, and real-time communication

It is not:

a simple job tracker

a static CRUD system

It is:

lifecycle-driven

event-backed

staffing-aware

communication-enabled

🧩 Core Architecture (LOCKED)
1. Lifecycle Engine (Jobs as Operational Units)

Jobs represent visits, not containers.

Each job:

progresses through lifecycle states

maintains operational clarity via ops_status

supports ECC + service workflows without divergence

Lifecycle is:

stable

non-duplicated

not coupled to UI

2. Service Case Container Model (Spine 2.5)

Service Cases represent:

the problem/container

Jobs represent:

visits/work executions

Structure:

service_cases → container

jobs → visit

parent_job_id → direct follow-ups / retests

This model is:

additive (no regression)

future-ready for HVAC workflows

3. Event System (Single Source of Truth)

All operational activity is recorded in:

job_events

Includes:

lifecycle changes

staffing actions

contractor communication

movement tracking

internal notes

attachments

Rules:

events are append-only

no hidden state mutations

UI is a projection of events

4. Staffing Engine (Phase 2 — COMPLETE)

Source of truth:

job_assignments

Supports:

multiple technicians per job

primary designation (manual)

soft removal (history preserved)

Movement events:

on_my_way

tech_arrived

job_started

job_completed

All events support:

actor_user_id

optional assignment_id

System is:

idempotent

concurrency-safe

backward compatible

5. Human Layer Adapter (COMPLETE)

Location:

lib/staffing/human-layer.ts

Purpose:

resolve user identity safely for UI

prevent raw UUID exposure

enforce internal vs contractor boundaries

Rules:

all identity display flows through adapter

no direct user joins in UI

safe fallback handling

Status:

fully propagated across system

no visible raw IDs remain

6. Assignment Surfaces (COMPLETE)
/jobs/[id]

Assigned Team section

primary + multi-user support

Unassigned fallback

/ops

light staffing signals

primary + overflow indicator

/ops/field

My Work surface

Today / In Progress / Upcoming grouping

All read from:

job_assignments

Human Layer Adapter

7. Assignment Controls (COMPLETE)

Write layer enabled:

assign user

set primary

remove assignment

Constraints:

uses existing helpers

respects RLS

no lifecycle mutation

8. RLS + Multi-Tenant Integrity (LOCKED)

contractor isolation enforced

internal users separated from contractor users

staffing restricted to internal users

no cross-domain leakage

Critical lesson:

RLS must be applied in DB, not just committed

9. Communication Layer (Email — COMPLETE)
Two-layer system:
A. Auth Emails (Supabase SMTP via Resend)

invite

password reset

confirmation

branded

B. App Emails (Resend via code)

contractor report delivery

customer scheduling emails

contractor intake alerts

Rules:

event-driven triggers only

deduped

logged in notification system

non-blocking

10. Contractor Portal (STABLE)

Supports:

job visibility

status clarity

correction submission

attachment uploads

communication loop

Rules:

no internal data leakage

simplified language

aligned with Ops terminology

11. Notification System (FOUNDATION COMPLETE)

Backend:

notification ledger exists

email events logged

Missing:

full UI visibility layer

12. Admin Center (FOUNDATION COMPLETE)

Supports:

internal user creation

invite flow (pending final validation)

contractor management

role structure foundation

Still validating:

invite → callback → set-password → routing

⚙️ System Principles (LOCKED)
1. Event-driven architecture

All actions originate from events

2. Role vs Assignment separation

role = permission

assignment = workload

3. No duplicate signals

One concept → one signal

4. Read surfaces before write controls

(maintained successfully)

5. No lifecycle coupling to UI or email

UI and email are downstream only

📊 System Completion
Core Platform

99% complete

Remaining Work

Not architectural — refinement + expansion

🟡 Remaining Work (Spine 3.0 Scope)
1. Invite Flow Validation (FINAL CORE TASK)

callback session timing

set-password routing

role-based redirect

2. Calendar / Dispatch Layer (NEXT MAJOR BUILD)

This is the only major missing system component

Will introduce:

scheduling visualization

technician calendar

dispatch board

assignment-time coordination

Must integrate with:

job_assignments

scheduled_date

staffing engine

ops_status

3. Notification Visibility UI

inbox / alert surface

read/unread tracking

prioritization

4. Admin Enhancements

role editing

multi-recipient contractor emails

user status management

5. System Refinement / Bugs

edge-case handling

UX polish

performance tuning

🚀 Next Phase Definition
Spine 3.0 = Calendar + Refinement Phase

Focus:

scheduling intelligence

technician coordination

operational polish

bug resolution

NOT:

rebuilding core architecture

changing lifecycle

reworking staffing

🧾 One-Line Summary

Compliance Matters is now a fully operational, event-driven, technician-aware workflow system with communication and staffing — entering final phase: scheduling, visibility, and refinement.