📘 Compliance Matters — Spine v2 (Current System)

Status: ACTIVE SOURCE OF TRUTH
Replaces: Spine v1 (Legacy — reference only)
Purpose: Align all development, threads, and decisions to the current operational system

🧭 1. Core System Hierarchy (Locked)
Ops Command Center
↓
Customer
↓
Location (Operational Anchor)
↓
Job
↓
Contractor Portal
Definitions

Ops Command Center → system-wide operational control and prioritization

Customer → owner of work

Location → physical service anchor (normalized + deduplicated)

Job → single operational unit of work

Contractor Portal → external interaction layer (non-canonical)

🔁 2. Operational Loop (Final Form)
Job Created
↓
ECC Test Performed
↓
Pass / Fail Determined
↓
If Fail → Contractor Report Sent
↓
Contractor Responds (Notes / Correction / Retest Request)
↓
System Tracks Response (job_events + signals)
↓
Ops Reviews + Logs Internal Follow-Up
↓
Retest / Resolution
↓
Pass Achieved
↓
Closeout (Invoice + Certification)
System Guarantees

All stages are connected

All actions are traceable

All decisions are auditable

No silent state changes

🧠 3. System Principles (Non-Negotiable)
Operational Clarity

One job = one clear action

One signal per concept

System explains itself once (no duplication)

Ops and Portal speak the same language

Visual / UX Discipline

No duplicate urgency signals

Status + Next Step = primary communication model

History is visible but visually separate from active work

Architecture Discipline

Event-driven design

Audit-first system

Derived logic over hard-coded state

No unnecessary schema drift

No lifecycle rewrites without justification

📡 4. Event-Driven Architecture (Core)
Source of Truth
job_events
Rules

All meaningful actions must write an event

No hidden mutations outside event system

UI derives state from events where possible

Key Event Types (Examples)

contractor_report_sent

contractor_note

contractor_correction_submission

retest_ready_requested

internal_note

attachment_added

🔁 5. Retest Model (Locked Behavior)
Rules

Retest = new job (child relationship allowed)

Parent job = historical record

Retest job = active operational unit

UI Behavior

Portal hides parent job when retest exists

Ops treats retest as the only actionable job

🗂 6. Archive System (Locked Behavior)
Rules

Archived jobs:

excluded from queues

excluded from counts

not actionable

Still:

visible in history

clearly marked visually

🧩 7. Contractor Workflow (Locked)
Contractors CAN:

View assigned jobs

View latest contractor report

Submit:

notes

corrections

retest-ready requests

Upload attachments

Contractors CANNOT:

Modify job lifecycle

Schedule work

Close jobs

Access internal notes or logic

Ownership Model

Internal users own all canonical data

Contractors interact via scoped portal layer only

🧾 8. Contractor Reporting System (Current State)
Behavior

Generated internally

Reviewed before sending

Manual send (intentional)

Structure

reasons

next steps

optional contractor note

Persistence

Stored as contractor_report_sent event

Contractor-safe (no internal leakage)

🔔 9. Notifications Layer (Phase 1A)
Current State

Backend system active

Event-triggered insertion

No UI layer yet

Triggers (Current)

contractor_report_sent

contractor_note

retest_ready_requested

Design Principle

Notifications = internal awareness

Must not duplicate signals

Must not introduce noise

🟡 10. Signal System (Current State)
Visual Standardization

🟡 Yellow → operational attention

🔴 Red → true failure states only

Neutral → no action required

Card Structure (Ops + Portal)
Status (chip)
Next Step (single line)
Optional Detail (supporting line)
Rule

One signal per concept

No layered urgency

🧭 11. Current Capability Map
✅ Complete

Core operational loop

Command center hierarchy

Customer / Location / Job systems

Contractor portal

Contractor reporting (manual send)

Contractor response tracking

Event-driven architecture

Internal notes (context-aware)

Archive system

Retest behavior

Field clarity pass (Ops + Portal alignment)

🔄 Active (In Progress)

Contractor report delivery (email layer)

SMTP infrastructure

Notification visibility (UI layer)

⏭ Next (Planned)

Operational Signals Layer (priority system)

Notification UI / inbox / surfacing

Multi-technician assignment model

Field workspace (tech-focused view)

Dispatch / calendar system

🔮 Later

Contractor performance metrics

Reporting / analytics

Billing placeholders → integration

Automation rules (after signals mature)

🚫 12. Non-Negotiables (System Protection)

No schema drift without necessity

No lifecycle rewrites

No ECC logic regression

No RLS/security regression

No contractor permission expansion

No duplication of signals or urgency

🧠 13. Strategic Position

The system has completed:

✔ Full operational loop
✔ Bidirectional communication
✔ Event-backed audit system
✔ Unified operational language

Current Phase
Transition: Workflow System → Operational Intelligence System
📌 14. One-Line System Definition

Compliance Matters is an event-driven operational command system for compliance workflows, designed to track, communicate, and resolve work with full clarity, accountability, and auditability.

📎 Usage Rule (For All Future Threads)

When starting new work:

Use Spine v2 as the single source of truth.
Do not reference Spine v1 unless explicitly needed for historical context.