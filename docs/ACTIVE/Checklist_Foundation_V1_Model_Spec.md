# Checklist Foundation V1 Model Spec

Status: ACTIVE planning/model spec
Mode: V1A model lock plus V1B dormant schema foundation
Authority: Domain model spec subordinate to Active Spine and current product-mode docs
Date: 2026-06-18

---

## 1) Purpose

This document locks the first checklist model and UX contract before any runtime implementation.

Checklist answers:

> What tasks or evidence should be completed for this job?

The first product need is Cleaning Services, where job detail currently has informational Checklist, Site Instructions, and Quality Review placeholders. The model must remain a shared platform foundation, not a Cleaning-only shortcut, so future HVAC service QA, ECC office QA, onboarding, and other workflow checklists can use the same source-of-truth boundaries.

V1A is docs/model only. It does not authorize schema, migrations, UI writes, server actions, storage behavior, or runtime checklist behavior.

---

## 2) Explicit Non-Goals

Checklist is not:

- a Pricebook service catalog
- an invoice line item
- a job type
- a recurring billing period
- a payment record
- a crew assignment
- a full inspection scorecard in V1
- a replacement for notes, photos, or timeline
- a customer-facing report in V1

V1A does not implement:

- checklist schema or migrations
- Supabase reads/writes/mutations
- server actions
- job closeout gating
- generated re-clean jobs
- recurring agreement integration
- customer portal or customer-facing reports
- billing, payment, invoice, Pricebook, or agreement mutation
- file/photo storage or attachment linkage
- field UI, admin UI, or route behavior

---

## 3) Source-of-Truth Boundaries

Checklist source-of-truth boundaries are locked as follows:

| Domain | Owns | Must not own |
| --- | --- | --- |
| Checklist Template | reusable task/proof structure | billing, pricing, job lifecycle, crew assignment |
| Checklist Section | optional grouping inside a template | billable tasks, job tasks, recurring visits |
| Checklist Item | individual task/proof requirement | invoice charges, inspection score formulas, timeline history |
| Job Checklist Run | checklist instance attached to one job | job billing, invoice status, payment state, recurring visit count |
| Job Checklist Item Result | field/operator completion evidence for one item in one run | file storage truth, collected money truth, service catalog truth |
| Job Events / Timeline | narrative history | checklist item-result truth |
| Job Attachments | file/photo truth when evidence is linked later | checklist state or completion truth |
| Work Items / Visit Scope | operational work scope for the visit | sellable catalog or checklist completion evidence |
| Pricebook | sellable services, materials, diagnostics, and catalog defaults | checklist tasks or proof requirements |
| Invoice Line Items | billed commercial truth | field task completion truth |
| Payments | collected/failed money truth | job quality or checklist truth |
| Recurring Agreements | recurring obligation truth | checklist result truth |
| Maintenance/Recurring Visits | operational visit/link/counting truth | checklist billing or payment truth |

Checklist completion may inform future closeout readiness, quality attention, or office review, but it must not become billing truth, payment truth, recurring-service truth, or Pricebook truth.

---

## 4) Model Definitions

### 4.1 Checklist Template

A Checklist Template is an account-owned reusable checklist definition.

Examples:

- General Cleaning Checklist
- Deep Cleaning Checklist
- Restroom Detail Checklist
- Office / Commercial Cleaning Checklist
- future HVAC service QA checklist
- future ECC office QA checklist
- future onboarding checklist

Required model posture:

- account-owned by `account_owner_user_id`
- reusable across jobs
- active/inactive supported
- product-mode relevance supported as metadata
- product-mode relevance is presentation/defaulting guidance, not security authority
- reusable later by jobs, recurring agreements, service catalog items, or locations
- V1 should start with job attachment

Template should not duplicate Pricebook services. A template can describe "Empty trash" or "Upload final photo"; the Pricebook can separately describe "General Cleaning Service" as a sellable service. They are different truths.

### 4.2 Checklist Section

A Checklist Section is an optional grouping inside a template.

Examples:

- Entry / Common Areas
- Restrooms
- Floors
- Kitchen / Breakroom
- Final Walkthrough

Required model posture:

- belongs to a template
- stores label and sort order
- may be absent for simple templates
- helps field users scan and complete work
- does not create billable tasks
- does not create job work items
- does not create recurring-service visit records

### 4.3 Checklist Item

A Checklist Item is one task or proof requirement inside a template, optionally under a section.

Examples:

- Empty trash
- Wipe counters
- Mop floors
- Clean mirrors
- Restock supplies
- Upload final photo
- Report issue if supplies are low

Required model posture:

- belongs to a template
- may belong to a section
- stores label snapshot source
- optional help text
- required yes/no
- sort order
- expected response type
- optional policy for whether not-applicable is allowed

Recommended V1 response types:

- `checkbox` / done
- `yes_no`
- `pass_fail`
- `note_required`
- `photo_required_placeholder` only if photo implementation is deferred

V1 should keep response types intentionally simple. Do not introduce a dynamic form builder, scoring engine, conditional branching system, or inspection-grade rules engine in the first checklist implementation.

### 4.4 Job Checklist Run

A Job Checklist Run is a checklist instance attached to one job.

Required model posture:

- account-owned by `account_owner_user_id`
- belongs to one job
- references the selected template where available
- snapshots template/section/item meaning enough to preserve historical context if the template changes
- can start with one primary checklist per job if that keeps V1 simpler
- may evolve to multiple runs per job later
- status should be derived where practical or kept simple

Recommended run statuses:

- `not_started`
- `in_progress`
- `completed`
- `issue_found`

Run status must not mutate:

- job billing state
- invoice status
- payment state
- recurring-service visit count
- agreement next due date
- Pricebook item state

### 4.5 Job Checklist Item Result

A Job Checklist Item Result is one operator/field result for one item in one Job Checklist Run.

Required model posture:

- belongs to a Job Checklist Run
- stores item label snapshot
- stores response/result value
- stores optional note
- stores `completed_by_user_id` when completed
- stores `completed_at` when completed
- stores issue flag when relevant
- can later link to photo/file evidence without owning file truth

Future evidence linkage:

- Photo/file evidence should remain in the attachment/file domain.
- A checklist item result can later reference attachment IDs or an evidence join table.
- V1A does not implement storage, upload, attachment joins, or photo-required enforcement.

### 4.6 Checklist Issues / Quality Follow-Up

If a checklist item is marked issue/fail, it may later create office attention or quality review.

V1A locks this concept only:

- issue_found can be a run status or derived read state
- issue/fail can inform Today/Ops attention in a later read model
- issue/fail can inform future Quality Review workflows
- issue/fail must not automatically create re-clean jobs
- issue/fail must not automatically mutate job status
- issue/fail must not automatically produce customer-facing reports

---

## 5) Product-Mode Relevance Rules

Checklist foundation is shared platform infrastructure with Cleaning-first defaults.

Rules:

- `product_mode = cleaning_services` should surface checklist capabilities first once implemented.
- Product-mode relevance can guide default templates, empty-state copy, admin navigation, and suggested starter content.
- Product-mode relevance is not security. Access must still come from account scope, internal role/capability checks, and route/action authority.
- Checklist templates are account-owned records. A template may carry optional product-mode relevance metadata, but it should not become globally locked to one product mode.
- Non-Cleaning accounts may eventually use the same checklist foundation for QA, onboarding, office review, or field proof workflows.
- Product-mode relevance must not mutate Pricebook, billing, payments, recurring agreements, or job type.

Recommended first posture:

- shared table/model shape
- Cleaning-first starter templates later
- optional `product_mode_relevance` or equivalent metadata later
- no product-mode security policies

---

## 6) Cleaning V1 Placement Contract

### 6.1 `/jobs/new`

V1A lock:

- Do not require checklist selection yet.
- Do not block job creation on checklist state.
- Later implementation may add an optional checklist template picker.
- Later defaulting may be considered, but should not be automatic in the first attach/start slice unless explicitly approved.

### 6.2 Job Detail Desktop

Future replacement target:

- Replace the current informational Cleaning checklist placeholder with a Checklist panel.
- Panel should show checklist status and item progress.
- Panel should make the primary next action clear.
- Panel should avoid admin-only density.
- Panel should not mix invoice charges, Pricebook lines, or Work Items into checklist completion state.

### 6.3 Job Detail Mobile

Future field posture:

- Field users should be able to complete checklist work easily on mobile.
- Avoid dense admin layouts.
- Use simple action labels:
  - Done
  - Issue
  - N/A
  - Note
- Keep controls thumb-friendly and resilient to partial completion.
- Do not require the user to understand billing, Pricebook, or agreement context to complete checklist items.

### 6.4 Admin

Future admin posture:

- Checklist Templates belong in an admin/settings area.
- Owner/Admin can create and edit templates.
- Field users should not manage reusable templates.
- Admin template management should support active/inactive records.
- Admin template management should make product-mode relevance visible as guidance, not authority.

### 6.5 Today/Ops

Future attention posture:

- Today/Ops should only show checklist attention when issue/fail/required-incomplete states exist and a read model intentionally supports it.
- Do not add queue behavior in V1A.
- Do not mutate job status or create work automatically from checklist issues in V1A.

---

## 7) Cleaning Starter Templates To Plan Later

These are starter checklist templates to plan for a later starter-content slice. Do not put these checklist tasks into Pricebook.

### 7.1 General Cleaning Checklist

Sections:

- Entry / Common Areas
- Trash
- Floors
- Final Check

### 7.2 Deep Cleaning Checklist

Sections:

- High Touch Surfaces
- Detail Cleaning
- Floors
- Final Walkthrough

### 7.3 Restroom Detail Checklist

Sections:

- Fixtures
- Mirrors / Surfaces
- Floors
- Supplies

### 7.4 Office / Commercial Cleaning Checklist

Sections:

- Offices / Desks
- Common Areas
- Restrooms
- Trash / Recycling
- Floors

Starter content must remain checklist template content, not Pricebook content, invoice content, agreement content, or Work Item content.

---

## 8) Recommended Decisions For V1

Unless future audit finds a better path:

- V1 should allow one primary checklist run per job.
- V1 should start with manual attach/select on job detail or job setup, not automatic recurrence.
- V1 should not hard-block closeout; show attention first.
- V1 should allow `issue_found` but not auto-create re-clean jobs.
- V1 should defer real photo-required enforcement until attachment linkage is intentionally designed.
- V1 should keep template management Owner/Admin only.
- V1 should be a shared platform foundation with Cleaning-first defaults.

---

## 9) Open Questions To Resolve Before Or During V1B/V1C

- Should V1 allow one checklist per job or multiple?
- Should checklist template be chosen manually on a job, defaulted from Pricebook item, or defaulted from recurring agreement later?
- Should checklist completion block job closeout in V1, or only show attention?
- Should `issue_found` create Ops attention immediately, or wait for a later quality workflow?
- Should `photo_required` be V1, V1B/V1C, or later?
- Should field users be able to add ad-hoc checklist items, or should only admins manage templates?
- Should checklist templates be product-mode-specific or account-owned with optional product-mode relevance?

Recommended answers are recorded in Section 8 unless implementation audit reveals a stronger reason to change them.

---

## 10) Deferred Items

Deferred beyond V1A:

- checklist schema
- RLS policy design and migration
- template read model
- template admin UI
- job checklist run attach/start action
- job detail panel
- field completion UI
- item result mutation
- attachment/photo linkage
- issue/quality attention read model
- Cleaning starter template seeding
- recurring agreement defaults
- Pricebook item defaults
- location defaults
- customer-facing checklist report
- re-clean workflow
- inspection scoring
- analytics/reporting exports

---

## 11) Proposed Implementation Sequence

### V1A - Model Lock / UX Contract

- Add this model spec.
- Lock source-of-truth boundaries and UI placement.
- No runtime behavior changes.

### V1B - Schema Foundation

- Add additive checklist tables and policies.
- Preserve dormant posture: no UI/actions/runtime behavior.
- Add schema/RLS/read-shape tests.

V1B closeout status:

- Complete in repository as dormant schema foundation.
- Migration: `supabase/migrations/20260619120000_checklist_foundation_v1b.sql`.
- Tables added:
  - `checklist_templates`
  - `checklist_template_sections`
  - `checklist_template_items`
  - `job_checklist_runs`
  - `job_checklist_item_results`
- The migration adds account ownership, active/archive posture, simple response/status constraints, template/run/result snapshot fields, one active checklist run per job, and one result row per run/template item where a template item is present.
- Same-account integrity is enforced by assertion triggers for section-template, item-template/section, run-job/template, and result-run/template-item relationships.
- RLS is enabled on all five tables with account-scoped internal SELECT/INSERT/UPDATE policies. No DELETE policies are added.
- `photo_required_placeholder` remains model-only; no storage, upload, attachment linkage, or photo enforcement behavior is added.
- Runtime behavior remains unchanged: no UI, server actions, seed data, job closeout gating, issue queue, recurring integration, customer report, billing/payment behavior, Pricebook behavior, job event behavior, or production migration apply.
- Focused validation: `npx.cmd vitest run lib/checklists/__tests__/checklist-schema-foundation.test.ts` passed (`7` tests).
- V1C remains Template Admin Read/Create/Edit. V1D remains Job Checklist Run Attach/Start.

### V1C - Template Admin Read/Create/Edit

- Add Owner/Admin template management.
- Support template active/inactive.
- Support sections/items/response types.
- Keep field users out of template management.

### V1D - Job Checklist Run Attach/Start

- Add manual job checklist attach/start.
- Start with one primary run per job unless explicitly reopened.
- Snapshot template meaning into run/item result rows.

### V1E - Field Checklist Completion Panel

- Replace Cleaning job detail placeholder with field-friendly checklist panel.
- Add item completion actions.
- Keep mobile completion simple: Done, Issue, N/A, Note.

### V1F - Issue/Quality Attention Read Model

- Add read model for issue_found/failed/required-incomplete attention.
- Surface office attention without automatic job mutation.

### V1G - Cleaning Starter Checklist Templates

- Add starter Cleaning templates.
- Keep starter checklist tasks out of Pricebook.

### Later

- recurring agreement defaults
- Pricebook defaults
- location defaults
- photo evidence linkage
- customer report
- re-clean workflow
- broader QA/inspection scoring

---

## 12) Acceptance Criteria For V1B Schema Foundation

V1B schema foundation is acceptable only if it preserves this V1A lock.

Required:

- additive schema only
- no UI implementation
- no server actions
- no Supabase writes outside migration/test setup
- no job closeout gating
- no invoice, payment, Pricebook, or recurring agreement mutation
- account scope present on checklist tables
- RLS/account-scope policy posture defined and tested
- template, section, item, run, and item-result concepts represented clearly
- template active/inactive supported
- item response type constrained to a simple approved set
- result rows preserve item label/meaning snapshot
- job checklist run belongs to account and job
- issue/fail can be represented without automatic workflow mutation
- attachment/photo linkage is deferred or represented only as a future-safe nullable/reference posture
- product-mode relevance is metadata/defaulting guidance, not security authority
- tests confirm no schema object is named or modeled as Pricebook, invoice, payment, or recurring-visit truth

Forbidden in V1B:

- inserting starter Cleaning templates into Pricebook
- creating invoice line items from checklist items
- creating payments or payment allocations from checklist completion
- creating maintenance agreement visits from checklist completion
- changing job type from checklist selection
- requiring checklist completion for job closeout
- customer portal/report exposure
- file storage behavior

---

## 13) V1A Acceptance

V1A is accepted when:

- the checklist model is clearly separated from Pricebook, Work Items, invoice line items, recurring services, payments, and inspections
- Cleaning-first use is covered without making the model Cleaning-only
- source-of-truth boundaries are explicit enough to support small implementation slices
- the future UI placement contract is clear for `/jobs/new`, job detail desktop/mobile, Admin, and Today/Ops
- non-goals and deferred items are explicit
- V1B schema acceptance criteria are locked
- no runtime behavior changes are introduced
