# Audit prompt — Systems & Equipment (customer page)

Paste into Claude Code. **Read-only inventory. Do not change any files.** Output a structured report; where you're unsure, say so rather than guessing.

---

We're about to redesign the Systems & Equipment area of the customer page and add an **equipment-lifecycle** capability (equipment owned by the address, replaceable, with retired-unit history). Before we build, I need a complete, honest audit of what exists today — data model first, then UI. Treat this as read-only.

## 1. Data model (most important)
- Where is equipment stored? List the table(s) and every column, with types and FKs.
- **What is equipment tied to today** — a job, a customer, a location/property, a "system", or several? Show the actual foreign keys.
- Is there a **"system"** concept that groups multiple equipment components (e.g. furnace + condenser + coil under one system)? If so, what table/column, and how is equipment linked to it?
- Is there a **user-defined system label** (e.g. "Upstairs" / "System 1")? Where is it stored, or is it absent?
- How is the **"from Job #X" provenance** represented — a stored FK, or derived at render time? Can equipment exist without a job?
- Is there **any** notion of equipment status, lifecycle, soft-delete, history, or replacement (e.g. `status`, `retired_at`, `replaced_by`, `active`)? If none, say so explicitly — that's a key finding.

## 2. The Systems & Equipment tab (UI)
- Which files render it? (page + child components, with paths.)
- Full render structure per property → system → equipment: every field shown, every action/button (View Equipment, Manage Equipment, Open Job, Add System, Add Equipment, …), and where each action goes.
- Every empty state and conditional (no systems, no equipment, no details on file, permission-gated views).
- Which of these are raw `<details>/<summary>` vs. real components.

## 3. Create / edit / manage surfaces
- Where is equipment **created** and **edited**? (`ProfileEquipmentCreateForm`, `EquipmentEditCard`, "Add System", "Add Equipment", "Manage Equipment" targets.) List the fields each collects.
- Is "Manage Equipment" a separate route/page, and what does it hold vs. the inline edit?

## 4. Reuse & blast radius
- Is this equipment data read anywhere else (customer Overview "systems" glance, job detail, tests/ECC, reports)? List every consumer, because a schema change touches them.
- Any server actions, validations, or RLS/permission gates around equipment reads/writes.

## 5. Gaps for the planned lifecycle
Given the target (equipment owned by **location**, grouped under a user-labeled **system**, each **component** independently replaceable, old units **retired not deleted**, provenance = job *or* contractor *or* standalone):
- List exactly what's **missing** in the current schema to support that.
- Propose the **minimal migration** (new columns/tables) — but do not write or run it; just describe it.
- Flag anything in the current model that would **fight** this (e.g. equipment hard-tied to a job with a NOT NULL job_id).

## Output
A structured report: **Data model → UI inventory → Create/edit surfaces → Consumers → Gaps & proposed migration.** Cite file paths and table/column names. Note anything you couldn't determine. **No code changes.**
