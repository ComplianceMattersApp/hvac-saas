# Maintenance Visit Checklist V1 — Model Spec (docs/model-only)

**Status:** Locked at the model level. Not implemented. This document authorizes no schema, migrations, UI writes, server actions, storage behavior, or runtime checklist behavior. It is the planning source of truth for a future implementation pass, in the same posture as Checklist_Foundation_V1_Model_Spec.md was before any of its work began.

---

## 1. Why this exists

Real-world use of Service Plans (Group 9A-16 series) surfaced a gap: a maintenance visit has a known, repeatable set of things a technician should check (e.g. "checked refrigerant level," "checked capacitor"), and today that list lives only as free-text Work Items with no structured completion state. The operator wants to define this list once on a Service Plan Template and have the technician check items off — with optional findings/notes per item — on every visit generated from that plan.

---

## 2. Relationship to the existing Checklist Foundation V1 spec

This is a sibling spec, not a successor or extension of [Checklist_Foundation_V1_Model_Spec.md](./Checklist_Foundation_V1_Model_Spec.md). The two are kept deliberately separate:

|  | **Checklist Foundation V1 (Cleaning)** | **Maintenance Visit Checklist V1 (this spec)** |
|---|---|---|
| **Product mode** | Cleaning Services | HVAC Service (visible to Hybrid/Master/All-in-One accounts that include Service) |
| **Cadence** | High-frequency — recurring multiple times a week/month, near-automatic | Low-frequency — 1–4 planned visits per year per agreement |
| **Origin of the list** | Reusable, job-attached, standalone task/proof structure | Defined once on a Service Plan Template, copied per visit |
| **Nature of completion** | Proof the standard task list was done | Diagnostic record — checkbox plus optional findings/notes per item |
| **Tied to recurring-service truth?** | Explicitly excluded by the locked spec | Explicitly the point of this spec |
| **Rollup surface** | None specified in that spec | Service Plan card completion summary |

**Shared conventions, separate implementations:** both specs use the same field vocabulary for the overlapping concepts (`is_completed`, `completed_by_user_id`, `completed_at`) so a future consolidation, if ever pursued, is a relabeling exercise rather than a rewrite. Neither spec's implementation may assume the other exists. No shared table is created by either spec. If Cleaning's checklist needs evolve toward a recurring-service template, that is an explicit, separate future decision — not something this spec or its implementation triggers automatically.

---

## 3. What this is

A maintenance visit checklist is:

- A reusable, ordered list of checklist items defined once on a `maintenance_agreement_templates` row (or directly on a `maintenance_agreements` row for plans created without a template)
- Copied onto each job created from that plan, the same way `default_visit_scope_items` (Work Items) are copied today
- Completed in the field per visit: each item gets a checkbox (done / not done) plus an optional free-text notes field for findings (e.g. "Capacitor reading 38µF, rated 45µF — close to failure, recommend replacement")
- Summarized read-only on the Service Plan card as a simple completion count (e.g. "Last visit: 8/10 items completed")

---

## 4. What this is not

Consistent with the truth-boundary model already locked for Work Items:

- **Not Pricebook** — checklist items carry no price, no billing type, no catalog identity
- **Not Invoice Charges** — a checked-off item never auto-creates a billed line. Findings/notes may inform a future estimate or invoice line, but only through the same manual, reviewed path Work Items already use
- **Not visit counting** — checklist completion has no effect on `maintenance_agreement_visits.count_status` or visit balance. A visit can be counted with an incomplete checklist, and a checklist can be fully complete without the visit being counted. These remain fully independent
- **Not the Cleaning checklist** — see Section 2
- **Not a redesign of Work Items** — Work Items remain free-text operational scope; the maintenance visit checklist is an additive, optional, more structured companion for plans that want it. A plan template with no checklist items behaves exactly as today, with Work Items only

---

## 5. Proposed data shape (planning reference only — not authorized for migration)

Two new conceptual entities, table names illustrative pending actual audit at implementation time:

**Template-level definition** (`maintenance_agreement_template_checklist_items` or similar):

- `id`
- `template_id` (FK to `maintenance_agreement_templates`) — nullable if attached directly to an agreement instead
- `agreement_id` (FK to `maintenance_agreements`) — nullable, mutually exclusive with `template_id`
- `item_label` (e.g. "Checked capacitor")
- `default_guidance` (optional helper text shown to the tech, e.g. "Record microfarad reading and compare to rated value")
- `sort_order`
- `created_by_user_id`, `created_at`

**Per-visit completion** (`job_checklist_item_completions` or similar):

- `id`
- `job_id` (FK to `jobs`)
- `source_item_id` (FK back to the template/agreement-level item this was copied from, for traceability — does not re-read the source live)
- `item_label` (snapshot copy at job-creation time, same pattern as Work Items snapshotting — editing the template later does not retroactively change past visits)
- `is_completed` (boolean, default false)
- `notes` (optional free text — the findings field)
- `completed_by_user_id`, `completed_at` (nullable until checked)

This mirrors the existing Work Items snapshot pattern exactly: copy-at-creation, not live-reference, so historical visits remain accurate even if the template changes later.

---

## 6. Proposed surfaces (planning reference only)

**Phase 1 — Desktop/admin (lower risk, scoped first):**

- **Template create/edit form** (`/ops/admin/service-plan-templates`): add an optional "Checklist items" section, ordered list entry, same UI pattern family as the existing Work Items builder
- **Job creation from Service Plan:** checklist items copy onto the job alongside Work Items, using the existing prefill/snapshot pattern from 9A-9E
- **Job detail (desktop):** checklist renders as a checkbox list with an expandable notes field per item, positioned near the existing Work Items / Visit Scope section
- **Service Plan card (customer profile):** read-only completion summary line, e.g. "Last visit: 8/10 items completed," sourced from the most recent linked job's checklist completions

**Phase 2 — Field Mode (explicitly deferred, requires separate sign-off):**

- Mobile rendering of the same checkbox + notes interaction on MobileJobDetailV2Preview (the current source-of-truth mobile surface)
- The legacy mobile surface is a rollback safety net only and does not require this feature — Phase 2 implementation targets V2 exclusively unless explicitly told otherwise
- Phase 2 requires its own audit of both mobile surfaces before any spec or code is written, per the existing mobile-surface boundary rule
- Phase 2 requires explicit owner sign-off as a distinct decision, separate from Phase 1 approval

---

## 7. Boundaries preserved

- No schema changes, no migrations, no Supabase commands authorized by this document
- No changes to visit counting, next-due-date logic, or `maintenance_agreement_visits` lifecycle
- No invoice, payment, billing, or Stripe behavior changes
- No changes to the Cleaning checklist spec, table, or any future Cleaning implementation
- No changes to ECC/HERS behavior — this is Service-mode scoped and naturally invisible to pure ECC accounts the same way Maintenance Agreements already are
- No portal, SMS, or QBO behavior
- No automatic estimate or invoice generation from checklist findings — any commercial follow-up from a flagged item (e.g. "recommend replacement") remains a manual, separate action by the operator, same as today
- No Field Mode changes authorized in Phase 1 — Phase 2 is a distinct future unlock

---

## 8. Open questions for implementation-time audit

1. Confirm exact column names and constraints once the actual checklist tables (if any precedent exists from the Cleaning spec work) are reviewed, to avoid naming collisions
2. Confirm whether checklist items should be allowed on agreements created without a template (manual/custom plans) — this spec assumes yes, via the nullable `agreement_id` path, but this should be revisited against real usage before implementation
3. Confirm the exact completion summary calculation for the Service Plan card rollup — "most recent visit" needs a precise definition (most recently created job? most recently completed job? most recent counted visit?) before implementation

---

## 9. Sequencing

This spec is locked at the model level only. Suggested next steps, each requiring separate approval before proceeding:

1. Owner review and explicit sign-off on this model spec
2. Phase 1 pre-implementation audit (real table/column confirmation, exact UI insertion points)
3. Phase 1 implementation (template authoring, job prefill, job detail checkbox UI, Service Plan card rollup) — desktop/admin only
4. Phase 1 real-world use and feedback before Phase 2 is scoped
5. Phase 2 mobile Field Mode audit (both surfaces) — separate sign-off required before any Phase 2 spec is written
6. Phase 2 implementation, V2 surface only, legacy surface unaffected
