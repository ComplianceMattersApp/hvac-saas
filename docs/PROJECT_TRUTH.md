# EveryStep JobWorks — PROJECT TRUTH

Status: STABLE PRODUCT TRUTH (rarely changes)
Purpose: The durable facts, locked architecture, source-of-truth boundaries, and standing constraints for EveryStep JobWorks. An agent reads this to understand what the system IS and which rules never bend.

This document absorbs the locked (`§§1–20`) content of the retired `Active Spine V4.0 Current.md`. Locked rules are reproduced faithfully. Closeout evidence, completed-work narratives, roadmap sequencing, and lane status have been intentionally removed — where a Spine section mixed locked rules with closeout prose, the rules were kept and the prose was dropped (noted inline).

- For active lane status, roadmap, and next safe slices → [CURRENT_ROADMAP.md](./CURRENT_ROADMAP.md)
- For session-start context loading → [SESSION_CONTEXT_TEMPLATE.md](./SESSION_CONTEXT_TEMPLATE.md)
- Documentation authority workflow → [ACTIVE/Documentation_Authority_Map.md](./ACTIVE/Documentation_Authority_Map.md)

---

## 1. Product Identity

Product name: EveryStep JobWorks
Legal entity: Compliance Matters CA
Platform type: Field service management (FSM) for HVAC service companies and ECC/HERS compliance raters

EveryStep JobWorks is an event-driven operational workflow system for compliance and service work, with scheduling, staffing, contractor collaboration, and audit-backed job resolution.

It is not:
- a simple job tracker
- a static CRUD app
- a calendar-only dispatch toy
- a contractor portal-first system

It is:
- lifecycle-driven
- event-backed
- operations-first
- source-of-truth disciplined
- additive by design

> Branding note: many older docs still say "Compliance Matters." The current product name is EveryStep JobWorks; Compliance Matters CA is the legal entity. Tenant operational identity (per-account display name/logo/support contact) is separate from the global product brand — see §18.

---

## 2. Core System Model (Locked)

### 2.1 Operational hierarchy

Ops Command Center → Customer → Location → Service Case → Job → Portal / External Interaction

### 2.2 Meaning of each layer
- Customer = owner of the work relationship
- Location = physical service anchor
- Service Case = problem container / continuity layer
- Job = operational visit / work execution unit
- Portal = external collaboration surface only, never canonical truth

### 2.3 Structural principle

Service Case = the problem. Job = a visit.

Visit Scope = the operational scope for this visit under the job layer. It exists to define what work belongs to this trip without changing the locked container model:
- `service_cases` remain continuity truth
- `jobs` remain visit execution truth
- invoice line items remain downstream billed/commercial truth

Invoice line items must not become the primary operational work-definition surface.

A service case may contain multiple jobs. A job may belong to a service case and may also reference a prior visit through `parent_job_id`.

---

## 3. Source-of-Truth Hierarchy (Locked)

### 3.1 Canonical truth layers
- `job_events` → narrative / operational truth
- `ecc_test_runs` → technical test truth
- `jobs.ops_status` → operational projection
- `jobs` → visit execution unit
- `service_cases` → continuity container

### 3.2 Rules
- UI does not own lifecycle truth
- UI does not guess ECC resolution
- all meaningful operational actions should become events
- `ops_status` is a projection, not a freeform UI state
- additive changes only unless explicitly approved

---

## 4. Lifecycle + Ops Model (Locked)

### 4.1 Job lifecycle
Jobs represent visits and move through operational lifecycle states without redefining the container model.

### 4.2 Ops projection
`jobs.ops_status` drives queues and operational visibility. `pending_office_review` is a persisted ops state for office-owned ECC failed-job review, not a UI-derived overlay.

### 4.3 Queue philosophy
Ops queues are for current work visibility, not historical clutter.

### 4.4 Signal philosophy
Notifications are signals, not a second queue system.
- Ops = action
- Notifications = awareness

---

## 5. Event System (Locked)

### 5.1 Canonical event ledger
All meaningful operational activity is recorded in `job_events`.

### 5.2 Examples
scheduling changes · contractor communication · correction submissions · retest requests · internal notes · attachment-added events · job pass/fail markers · follow-up / contact-attempt history where applicable

### 5.3 Event rule
If it materially affects operations, history, or accountability: it should be an event.

---

## 6. ECC / Test System (Locked)

### 6.1 ECC truth
Technical compliance/test results are canonical in `ecc_test_runs`.

### 6.2 ECC resolution
Job ECC resolution is derived from completed test runs and projected into `jobs.ops_status`.

Refrigerant charge overall pass requires all active refrigerant-charge checks to pass, not just numeric subcool and superheat checks. Unless an approved charge exemption applies, overall pass also requires filter drier confirmation and applicable temperature qualification. UI surfaces must show non-numeric failure reasons from `ecc_test_runs.computed.failures` and must not imply that numeric check chips alone determine the final result.

> (Closeout prose describing the shipped Refrigerant Charge / Equipment Label photo-evidence workflow was removed from this section; the durable rule above is retained.)

### 6.3 UI discipline
ECC-specific actions and surfaces must only appear when ECC behavior actually applies. Service jobs must not expose ECC-only workspace affordances.

---

## 7. Customer / Location / Snapshot Strategy (Locked)

Canonical model detail lives in [ACTIVE/source-of-truth-strategy.md](./ACTIVE/source-of-truth-strategy.md); this section carries the locked boundaries.

### 7.1 Canonical entities
- `customers` = canonical identity/contact
- `locations` = canonical service address

### 7.2 Snapshot strategy
Jobs may carry convenience snapshot fields for operational display, but those fields are not canonical.

### 7.3 Sync-point rule
When canonical customer/location data changes, required job snapshot fields must be synced where relevant, with proper revalidation.

### 7.4 Current stable state
Location-edit sync and revalidation gaps identified during audit were corrected. This area is considered stabilized for current scope.

### 7.5 Customer visibility rule
`/customers` and `/customers/[id]` share one scoped visibility rule. Internal users may search and view customers within their account-visible scope. Contractor users may search and view only customers within their own contractor-visible scope. Customer list and customer detail must follow the same scope rule so a contractor-visible customer in `/customers` does not dead-end at `/customers/[id]`. Customer search/index remains read-only; this rule does not expand customer mutation authority for contractors.

### 7.6 Customer edit boundary
`/customers/[id]/edit` is a customer/billing edit surface only. Canonical service-address editing belongs to the Location domain. Customer edit must not guess, imply, or mutate a canonical "primary" location unless the target location is made explicit.

### 7.7 Shared intake lock (`/jobs/new`)
`/jobs/new` is a shared intake surface for internal users and constrained contractor submission. Create-time lifecycle/status rules are server-enforced:
- Create-time `status` is always intake-safe and server-forced to `open`; posted status values are ignored.
- Contractor intake is server-normalized to unscheduled: `scheduled_date = null`, `window_start = null`, `window_end = null`, `ops_status = need_to_schedule`.

Posted existing entity references must be validated before create:
- `customer_id` must belong to canonical owner scope.
- `location_id` must belong to canonical owner scope.
- `location_id` must belong to the resolved/posted customer before job creation.

Invalid posted customer/location pairings must not create jobs and must fail safely through intake error handling. Internal intake may create or link canonical customer/location records through this shared flow, using reuse-first linking behavior.

> (Production hotfix closeouts 7.7.1 / 7.7.1.1 / 7.7.2 — contractor missing-state fix, attachment resilience, and calendar-block RLS object-drift — were removed as historical evidence. One durable guardrail from 7.7.2 is preserved below.)

**Durable RLS guardrail (from 7.7.2):** If an RLS-protected action shows visible/readable rows but update/delete affects zero rows, verify actual `pg_policies` object state directly before assuming app code or migration history is correct. A migration-history entry does not guarantee the database object exists.

### 7.8 Internal/admin `/jobs/new` flow lock (Phase 2)
Internal/admin `/jobs/new` is a guided workflow, not a flat admin form. Locked internal sequence: customer/location resolution first → job setup/details → scheduling/billing → optional details → a concise human-facing final confidence check.

Internal customer resolution is locked to reuse-first guidance: live finder is name-first friendly; results include address context for recognition with phone/email as supporting signals; create-new customer remains a fallback path and must not be the default entry state. The confidence layer must stay concise and human-facing. This lock does not alter or reopen contractor intake proposal architecture (7.7 boundaries remain in force).

### 7.9 Internal/admin `/jobs/new` relationship-aware extension (V1)
After customer/location resolution and internal Job Type selection, internal intake includes a relationship-aware decision step (an extension, not a replacement intake model). V1 options: Open Active Job · Create Follow-Up Visit · Continue as New Case.

Locked V1 rules:
- The relationship step is internal-only and does not alter contractor intake boundaries in 7.7.
- Job Type must be selected before relationship review.
- Relationship candidates must be scoped by selected `job_type`; ECC and Service must not be blended in actionable relationship decisions.
- Existing customer + new location remains part of location resolution, not the relationship decision step.
- Open Active Job must show only true active/current work candidates, not generic unresolved history; `need_to_schedule` does not belong in Open Active Job; suppress older chain ancestors in favor of the current operative record.
- Create Follow-Up Visit anchors to an existing job and reuses/ensures `service_case_id` continuity; it does not repurpose `parent_job_id` (which remains tied to direct visit lineage and retest-chain semantics).
- Continue as New Case preserves the existing root-job create path.

### 7.10 Job-detail layout is V2 (classic retired)
The canonical job-detail layout is **V2** (`app/jobs/[id]/v2/page.tsx` + `app/jobs/[id]/v2/_components/`). The classic `app/jobs/[id]/page.tsx` is **retired** — normal job views route to `/jobs/{id}/v2`, and the classic route file lingers only pending deletion (tracked in the PERF Slice 3 backlog). Both files still exist on disk, so this is not obvious from the tree. All new job-detail feature work goes in V2; a feature added only to classic is invisible to users (this is exactly why the workshare send control had to be ported to V2). V2 uses an inline design-token object `S` and a `ScrollSpyNav` for right-rail sections.

---

## 8. Service Case Container Model (Locked)

### 8.1 Container rule
`service_cases` are additive and do not replace job operational truth.

### 8.2 Relationship rule
- `service_case_id` = container membership
- `parent_job_id` = direct visit-to-visit lineage

### 8.3 Failure resolution (Locked ECC failed-job model)
- Original ECC failed job remains historically failed.
- Any true revisit/retest is a new child job in the same chain/service case and becomes the active operational unit.
- Once a child revisit exists, the failed parent drops from active failed visibility but remains historically failed in chain history.
- Any "we fixed it" signal (portal, phone, text, email, photos) normalizes to `pending_office_review`.

Internal review from `pending_office_review` has exactly three outcomes:
- **Approve by evidence:** original failed parent remains historically failed; `ops_status` → `paperwork_required`; `resolution_source = correction_review`; approval must be event-backed (e.g. `failure_resolved_by_correction_review`); closeout path is cert only; no new invoice if no revisit occurred.
- **Reject review / need more proof:** job returns from `pending_office_review` to `failed`; rejection must be event-backed.
- **Revisit required:** child retest job is created immediately (no intermediate limbo state).

Passed child retest behavior: child owns successful revisit outcome and closeout; parent is not rewritten into successful truth.

Closeout matrix:
- failed visit unresolved = invoice only
- evidence-approved original parent = cert only
- passed child retest = invoice + cert

Child retest inheritance: inherit customer, location, contractor, service case, parent linkage, and core context; do not carry forward the prior failed test result as child authoritative truth (it may be shown later as comparison/reference context).

### 8.4 Narrative visibility on `/jobs/[id]`
Timeline, Shared Notes, and Internal Notes may intentionally aggregate narrative entries across the direct retest/job chain (current job plus parent/child lineage via `parent_job_id`). When chain-scoped narrative is shown, page copy should explicitly state chain scope and not imply current-job-only history.

### 8.5 Retest chain clarity
Parent/child chain history must preserve failed-parent historical truth while allowing the active child revisit job to carry current operational and closeout ownership. In `/ops`, active queue visibility is chain-owned, not ancestor-stacked. Only one active operative record from a linked chain should be visible in the working queue at a time.
- If a failed-family record has no active retest child, it may remain the visible active queue record.
- If a failed-family record has an active retest child, that ancestor must be suppressed from active queue visibility.
- The visible active queue record should be the current operative leaf in the chain, not older failed ancestors.

This is a queue-visibility ownership rule only. Do not alter parent/child linkage or audit/history visibility. Once a newer operative linked record exists, older linked ancestors must not remain as duplicate active queue items.

### 8.6 Service Contract V1 (Locked)
This first Service pass formalizes Service Case and Service Visit classification for later Billing/Reporting support. It does not start Billing or Reporting workflows.

Service Case v1 contract: `service_cases` own complaint continuity and case-level resolution ownership. Required case fields: `problem_summary`, `case_kind` (reactive|callback|warranty|maintenance), `status`, `resolved_by_job_id`, `resolved_at`, `resolution_summary`.

Service Visit v1 contract: `jobs` remain the visit execution unit for Service. Required visit fields: `service_visit_type` (diagnostic|repair|return_visit|callback|maintenance), `service_visit_reason`, `service_visit_outcome` (resolved|follow_up_required|no_issue_found).

Job Title vs Visit Scope (locked distinction): Job Title = short visit headline; Visit Scope / work items = exact work on this trip. If Job Title is blank and exactly one work item exists, the first work item may provide the derived title fallback. `service_visit_reason` aligns to the title layer.

Linkage guardrail: for linked visit chains, `parent_job_id` lineage must stay inside one `service_case_id`. Cross-case parent/child linkage is invalid.

Truth-boundary guardrail: these classifications do not change source-of-truth ownership — `job_events` remains narrative truth, `jobs.ops_status` remains operational projection, `ecc_test_runs` remains ECC technical truth.

Mixed-visit guardrail: ECC Test and Service remain the only top-level actionable workflow families. Do not create a hybrid third family. An ECC-first visit may carry same-visit companion service scope while the work remains part of the same trip, but companion scope must promote into a real Service job once it becomes its own lifecycle thread (separate scheduling, separate assignment, return-trip work, or separate follow-up continuity).

### 8.6.1 Service Waiting State V1 (locked model)
Waiting state is job-level V1 (not service-case-level global blocker orchestration). Existing fields are reused: `jobs.ops_status`, `jobs.pending_info_reason`, `jobs.on_hold_reason`, `jobs.action_required_by`, `jobs.follow_up_date`, `jobs.next_action_note`. `job_events` remains audit/narrative truth for waiting-state change history.

Supported waiting types (V1): Waiting on part · Waiting on customer approval · Estimate needed · Waiting on access · Waiting on information · Other.

Locked rules: waiting reasons persist in existing pending/on-hold reason fields using readable prefixed text (e.g. `Waiting on part: condenser fan motor`); legacy unprefixed reasons remain tolerated via fallback-safe parsing; creating a next service visit does not auto-clear the source job waiting state — explicit/manual release remains required for audit safety.

### 8.7 Visit Scope → Invoice Bridge (locked truth boundary)
Locked production behavior:
- Visit Scope items use durable IDs for downstream selection/provenance.
- Internal invoice line provenance supports Visit Scope sourcing via `source_kind = visit_scope` and `source_visit_scope_item_id`.
- Visit Scope-sourced draft invoice lines start at `quantity = 1.00` and `unit_price = 0.00`, then require operator review/edit before issue.
- Service intake requires at least one structured Visit Scope item; summary-only Service scope is rejected.
- ECC intake keeps lightweight optional scope behavior and does not auto-seed blank structured rows.
- Issued/void invoice records remain immutable and do not expose draft build controls.

Truth-boundary reminder (unchanged):
- Visit Scope = operational work definition.
- Invoice line item = frozen billed/commercial snapshot.
- Pricebook item = reusable mutable catalog/default definition.
- Payment = collected-truth layer only where materially implemented.

> (Section 8.8 "Service Workflow Refinement V1 Baseline" was a completed-work closeout and was removed; its durable rules are already captured in 8.6.1 and 8.7.)

---

## 9. Staffing / Assignment System (Locked)

### 9.1 Source of truth
Assignments are owned by `job_assignments`.

### 9.2 Supported model
multiple technicians per job · primary designation · assignment history preservation · internal-user eligibility rules

### 9.3 Human layer
Identity display must flow through the safe human-layer adapter, not raw user joins.

### 9.4 Principle
Role = permission. Assignment = workload. These are separate concepts.

---

## 10. Scheduling / Calendar Reality (Locked Clarification)

### 10.1 Current verdict
Scheduling engine is functionally complete. Calendar system is real. Remaining work is UX polish, not core-system completion.

### 10.2 What is complete
Real schedule fields (`scheduled_date`, `window_start`, `window_end`); scheduling/rescheduling/unscheduling backend flow; calendar route and real rendered views (day/week/month/list); assignment-aware scheduling; schedule-linked ops visibility; schedule-related event logging; technician-aware calendar filtering; unschedule capability exposed in UI; unified-surface drag/drop scheduling in day/week views (no technician-column primary calendar; assignment/no-tech remains metadata).

### 10.3 What is not missing
The system does not require a new calendar engine or a calendar rebuild.

### 10.4 What remains as UX-only
optional drag/drop micro-polish beyond the current unified baseline · optional further visual/operator refinements · optional additional filter/speed affordances

### 10.5 Product rule
Do not classify calendar/dispatch as "missing" unless discussing a specific UX enhancement not yet exposed.

### 10.6 Calendar status display rule
Calendar status dot/label is a deliberate hybrid presentation rule. Use `jobs.status` for lifecycle/historical markers: `cancelled`, `on_the_way` (displayed as "On My Way"), `in_progress`. Otherwise derive display from `jobs.ops_status` for operational projection. Presentation-only: `jobs.status` remains lifecycle/historical truth; `jobs.ops_status` remains operational projection.

### 10.7 Calendar historical visibility rule
Calendar is a system-of-record scheduling surface, not an active-queue-only surface. Closed or cancelled jobs must remain visible on the calendar as historical records when they still belong to the scheduled calendar dataset, across all views (they consume the same canonical scheduled dataset). Removal should happen only through true record-exclusion (archival, deletion/soft-delete, or other explicitly approved full-record visibility rules). Do not treat closed or cancelled status alone as a reason to drop a job from calendar history.

---

## 11. Notifications / Signals (Locked v1)

### 11.1 Current state
Notifications are a v1 internal visibility layer: notification ledger/backend, read/unread state, internal notifications page, mark-as-read, Ops header integration, unread badge, quiet preview surface.

### 11.3 Signal rule
Unread notifications should represent active awareness signals. Read items should not visually compete with active work.

### 11.4 Discipline
Do not turn notifications into another queue or urgency stack. Notifications are awareness signals only and do not own ECC failed-job `pending_office_review` workflow decisions.

### 11.5 Awareness-filter rule
Internal notifications should surface awareness-worthy inbound or action-needed signals, not every event written to audit history. Read boundaries remain internal-only; contractors do not receive read access to internal notifications through this awareness layer. Awareness-worthy examples: contractor notes/comments received, contractor attachments uploaded, correction submissions, retest-ready requests, new intake / new job alerts, other inbound signals requiring review. Outbound office-originated actions (e.g. `contractor_report_sent`) may remain canonical in `job_events`/audit without appearing in the awareness feed.

### 11.5.1 Notification family classification lock
Internal notification families must keep **new job/proposal arrival** distinct from **contractor follow-up updates**.
- `contractor_intake_proposal_submitted` belongs to **New job notifications**, not **Contractor updates**.
- New proposal / new contractor-submitted intake arrival is a new work-awareness signal, not a follow-up update signal.
- **Contractor updates** are follow-up contractor-originated changes on an existing proposal/job (note added, files/photos uploaded, correction submission, scheduling update, addendum/comment).

Copy rule: Contractor update cards use event-type-driven wording as the primary message; do not use raw note/comment text as the primary headline (raw text stays secondary preview context only). Notifications remain signals, not a second queue system.

### 11.6 Ops dashboard signal surface
`/ops` contains one signal surface only. Do not render separate internal/admin notice bars on `/ops`. It must show only current office-attention signals (contractor notes/comments, attachment uploads, correction submissions, retest-ready requests, new contractor-created/review-needed jobs, contractor schedule updates affecting follow-up). Do not surface internal/admin notice feeds, email-delivery/bookkeeping notices, outbound office actions, or audit/history-only events that do not require present attention.

### 11.7 Internal email awareness boundary
Internal email alerts represent new external/inbound awareness, not echoes of internal office actions. Internal users should receive new-job alert emails for contractor-originated submissions, but not for jobs created internally by office/internal users. Do not use internal email alerts as a mirror of all job creation activity.

### 11.8 Contractor response classification boundary
- Plain contractor notes remain `contractor_note`.
- Contractor correction/review submissions remain `contractor_correction_submission` in canonical event history and must not be flattened into generic contractor-note awareness.
- Upload-only contractor submissions may remain on the transitional `contractor_note` path until downstream response-tracking and awareness readers are updated together to support a separate upload concept safely.

### 11.10 Cross-account notification boundary (ECC/HERS work-sharing)
Notifications were originally within-account only (the RPC/RLS write paths assume actor ∈ target account). The ECC/HERS workshare lane introduced the **first cross-account notifications**: a request arrival notifies the *receiver* account, and an accept/decline notifies the *sender* account. Locked rules:
- Cross-account notification writes go through the **service-role/admin client** (the within-account RPC/RLS paths do not authorize them). The trust anchor is the `account_workshare_requests` row itself, which could only exist through an `active` connection — do not add a generic cross-account grant to the within-account RPC/RLS.
- These are best-effort side effects fired from the form wrappers, never from the core mutation, so the notification cannot fail or widen the core action's table surface.
- `workshare_request_received` classifies under **New job notifications**; the accept/declined outcome types are general awareness (list + badge). Email echoes are §11.7-appropriate (inbound external awareness).

> (11.9 "Future notification backlog" — tech dispatch phone notifications — is roadmap material and lives in [CURRENT_ROADMAP.md](./CURRENT_ROADMAP.md).)

---

## 12. Ops Workspace Principles (Locked)

### 12.1 Page philosophy
Ops pages should optimize for immediate clarity, next-action recognition, and readable history without burying high-value context.

### 12.2 Information priority
High-value operational information surfaces high: notes · failure reason · schedule state · assignment context.

For applicable ECC/HERS and Hybrid queue cards, contractor identity is high-value routing context and must be visible on the collapsed/front-facing card. Do not require Open & Act expansion to identify the responsible contractor. Internal Work may use the account/business identity fallback. Service-only surfaces must not introduce irrelevant contractor concepts.

### 12.3 Queue membership parity
Queue chips/counts, visible queue rows, focused queue routes, filters, and exports must apply the same membership contract. A count must not include a record that the corresponding active queue suppresses, and a focused route must not reintroduce a record suppressed by the main Ops workspace.

Linked ECC retest chains additionally follow §8.5 active-leaf exclusivity. The shared classifier/read model is presentation/routing logic only and must not rewrite failed-parent test truth or event history.

### 12.4 Redundancy rule
Avoid duplicate instructional text when the status and reason already communicate the meaning.

### 12.5 Right-rail rule
Secondary/history/supporting information belongs in supporting zones when it improves scanability.

---

## 13. Contractor / External Interaction (Locked)

### 13.1 Contractors can
view assigned work · view contractor-safe reports · submit corrections / notes / retest-ready requests · upload attachments · view customer outreach attempts (`customer_attempt` events) in the portal timeline when internal staff are contacting the customer about that job.

### 13.2 Contractors cannot
own lifecycle · schedule work · close jobs · access internal-only data · mutate canonical operations state directly.

### 13.3 Ownership principle
Internal users own canonical records. Contractors interact through constrained portal paths only. For ECC failed jobs under `pending_office_review`, internal users own the review queue/actions; contractor-facing portal state should be plain-language "under review," and contractors may continue adding notes/photos while review is pending.

### 13.4 Contractor intake boundary
`/jobs/new` is a shared intake surface. Internal users may create intake records directly. Contractor users may submit constrained intake / call-list jobs through `/jobs/new`, but this does not grant scheduling authority or lifecycle control. Contractor-submitted customer/contact/location values are proposed intake data, not final canonical identity authority.

Implementation lock (finalized):
- Contractor submissions without an explicit canonical `customer_id` + `location_id` pairing persist as contractor intake proposals for internal review/finalization.
- In this proposal path, contractor-originated intake does not directly create canonical customer/location records.
- Internal finalization resolves proposal data into canonical records through: existing customer + existing location · existing customer + new location · new customer + new location.
- Internal intake remains permitted to create/link canonical customer/location records directly through shared intake rules.

### 13.5 Contractor proposal visibility / collaboration rule
Contractor intake proposals in proposal-state review stay visible to the submitting contractor in the portal as plain-language **Under Review** until internal review/finalization resolves them. This exists for continuity and trust only; it does not grant scheduling authority, lifecycle control, or canonical record ownership.

Locked proposal-state rules:
- Proposal-state submissions may surface in contractor portal waiting/read models before final canonical job finalization.
- Proposal detail is a contractor-safe, read-only under-review surface for the original submission context.
- The original submitted note remains immutable on the proposal record.
- Contractors may append pending-only follow-up comments as additive proposal addenda while under review; addenda do not overwrite the original submission.
- Original proposal files use proposal attachment persistence, but contractor-facing receipt semantics must depend only on successfully persisted proposal attachment rows. If proposal attachment persistence fails, proposal submission must fail safely rather than silently succeeding with partial file loss.

---

## 14. Repo / Environment Guardrails (Locked)

### 14.1 Project trees
The root repo (`C:\Users\eddie\hvac-saas`) is authoritative.

> Correction (July 2026): a duplicate nested `hvac-saas/hvac-saas` mirror tree previously created split-brain drift risk. That nested tree has been removed and no longer exists. There is now a single authoritative working tree; no nested-mirror guidance applies.

### 14.2 Environment mapping
Production and sandbox/test Supabase environments must be explicitly distinguished.

### 14.3 Required rule
Before any migration operation, confirm the linked Supabase project intentionally matches the target environment.

### 14.4 Branch discipline
- sandbox branch = build/test/validate
- `main` = shipped production code

---

## 15. Migration Discipline (Locked Operating Rule)

### 15.1 Production principle
Do not blindly run `db push` against production when migration history and live schema may differ.

### 15.2 Reconciliation principle
Migration truth requires reconciliation between repo migration files, live production schema, and `schema_migrations` history.

### 15.3 Manual hotfix rule
If equivalent SQL is manually applied in production, the matching migration history must later be reconciled explicitly.

### 15.4 Current state
Production migration history for the current known migration set has been reconciled to match live schema reality.

### 15.5 Ongoing rule
Production migration operations must be deliberate, environment-verified, and history-aware.

---

## Environment and Repository Rules (consolidated)

Summary of the standing environment and branch rules. Full detail lives in [`ENVIRONMENT_RULES.md`](../ENVIRONMENT_RULES.md) and [`app/BRANCH_FLOW.md`](../app/BRANCH_FLOW.md); [`MIGRATION_STABILIZATION_PLAN.md`](../MIGRATION_STABILIZATION_PLAN.md) covers migration-history reconciliation.

Supabase projects:
- **Production** — project `ComplianceMatters`, ref `ornrnvxtwwtulohqwxop`, branch `main`.
- **Sandbox** — project `CMTest`, ref `kvpesjdukqwwlgpkzfjm`, branch `sandbox-clean-start`.

Branch / release flow:
- Do not work directly on `main`. Small work happens on `sandbox-clean-start`; larger/risky work on a short-lived `feature/*` (also `fix/*`, `refactor/*`) branch off `sandbox-clean-start`.
- Migrations are tested against sandbox first, then code is merged to `main`, then the same migration is applied to production intentionally, then production is verified.
- Never point production code at the sandbox DB. Never test risky schema changes first in production. Never create production-only DB changes by hand except emergency repair (and capture the fix back into migrations immediately).
- Before pushing migrations: verify the linked Supabase project, and never `db push` to production without confirming the target.

---

## 16. What Is Complete (durable baseline)

Core platform (locked as complete/real, not prototype): lifecycle engine · ops command center · customer/location/job model · service-case additive container layer · ECC test system · contractor portal · event-driven operational narrative · staffing/assignments · calendar/scheduling engine · notification visibility v1 · source-of-truth stabilization · repo/tree reconciliation · migration stabilization process and guardrails.

The core operational platform is complete enough to be considered a real working system, not a partial prototype.

**Operational Entitlement Mutation Guard — locked server-side result** (rollout closeout narrative removed; the durable authorization rule is retained):
- Active entitlement is allowed.
- Valid trial with a future `trial_ends_at` is allowed.
- Internal / comped accounts are allowed.
- Expired trial is blocked before operational mutation writes / side effects.
- Trial with null `trial_ends_at` is blocked before operational mutation writes / side effects.
- Missing entitlement row is blocked before operational mutation writes / side effects.

Intentionally outside internal operational entitlement gating: company profile · team setup · internal user / admin invite flows · password recovery / billing / setup recovery paths · notification read-state mutations. External contractor onboarding / invite acceptance is also outside internal operational entitlement gating.

`createJob` remains a low-level helper only; active entrypoints that call it are guarded — do not add new active callers unless the caller applies the operational entitlement gate first. `lib/actions/intake-actions.ts` remains dormant legacy create flow and is a later cleanup/retirement candidate, not an active mutation lane.

---

## 18. Internal Business Identity vs Product Brand Identity (Locked)

### 18.1 Internal Business Identity (tenant operational identity)
Account-owner-scoped operational identity from `internal_business_profiles`. Owner scope anchor: `account_owner_user_id`. Operational identity fields: `display_name`, `support_email`, `support_phone`, `logo_url`. Operational surfaces must resolve tenant identity through the internal business identity resolver boundary in the business profile layer. UI/action/email callers in operational flows must not carry local hardcoded tenant fallback literals.

### 18.2 Product Brand Identity (global platform identity)
Global platform identity for shell/auth/default infrastructure surfaces: app shell metadata, manifest, auth page branding copy, global email/platform branding defaults. Do not blur tenant operational identity into global product branding rules unless explicitly approved as a separate branding initiative.

### 18.3 Boundary rule
- internal users remain human identities
- contractors remain external business partners
- tenant operational identity is resolved from `internal_business_profiles`
- global product brand identity remains separately owned

This model does not yet own full billing/invoicing, broad tenant settings, business administration workflows, or role/permission semantics. Do not overload user profiles to represent company identity; keep the implementation narrow and identity-focused.

### 18.3.1 First Owner Onboarding / Account Provisioning (locked direction)
Standard account onboarding supports public self-serve signup at `/signup`; invite-only platform-admin/operator provisioning remains active as a controlled/manual fallback and for internal/comped owners (not public). Tenant anchor boundary remains `account_owner_user_id`; no RLS model change is introduced by onboarding. App-shell packaging does not replace tenant onboarding or account-ownership setup — login still uses the same server-side account provisioning/auth model.

> (Detailed implementation slice/file/flag narrative was removed as closeout evidence; provisioning runbook detail lives in [ACTIVE/First_Owner_Provisioning_Runbook.md](./ACTIVE/First_Owner_Provisioning_Runbook.md).)

### 18.4 Equipment Domain — Canonical Role Vocabulary and Field Contract
The `job_equipment` table uses `equipment_role` as the single canonical classification field.

Canonical stored vocabulary:

| Stored value | Physical meaning | Field group |
|---|---|---|
| outdoor_unit | Outdoor AC condenser | Cooling |
| indoor_unit | Indoor coil | Cooling |
| air_handler | Air handler | Cooling |
| heat_pump | Heat pump outdoor unit | Cooling |
| package_unit | Package unit (any fuel type) | Cooling |
| mini_split_outdoor | Mini-split outdoor unit | Cooling (design deferred) |
| mini_split_head | Mini-split indoor head | Cooling (design deferred) |
| furnace | Furnace (any fuel type) | Heating-only |
| other | Unknown / specialist | Permissive |

Intake mapping: the `/jobs/new` intake form uses detailed component sub-types (condenser_ac, furnace_gas, air_handler_electric, heat_pump_outdoor, package_gas_electric, package_heat_pump, coil) that map to canonical values before persistence. The mapping is owned by `lib/utils/equipment-domain.ts`.

Field contract by role:
- Furnace (heating-only): valid fields are `heating_capacity_kbtu`, `heating_efficiency_percent`, `heating_output_btu`. `tonnage` and `refrigerant_type` must be NULL.
- Cooling roles (all others except furnace and other): valid fields are `tonnage` and `refrigerant_type`. All `heating_*` fields must be NULL.
- Other: all numeric fields are optional with no role-based filtering.

Enforcement: `lib/utils/equipment-domain.ts` exports `mapToCanonicalRole()` and `sanitizeEquipmentFields()`. Every write path (intake create, post-create add, post-create edit) uses these helpers; filtering logic is not duplicated.

Stability: `equipment_role` is currently editable for correction. Changing role re-sanitizes incompatible fields server-side. Full immutability is a future option, not currently locked. Out of scope: `component_type` column is not part of this contract; mini-split full treatment is deferred.

---

## 19. Payments Module (Locked Direction)

The platform is payment-ready by design, not yet payment-active. Detailed payment sequencing and evidence live in the payment specs: [ACTIVE/Compliance_Matters_Payments_Roadmap.md](./ACTIVE/Compliance_Matters_Payments_Roadmap.md), [ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md](./ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md), [ACTIVE/Financial_Trust_Lane_Deposits_Payout_Reconciliation_V1_Model_Spec.md](./ACTIVE/Financial_Trust_Lane_Deposits_Payout_Reconciliation_V1_Model_Spec.md), [ACTIVE/Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md](./ACTIVE/Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md).

### 19.2 Core payment direction (locked)
The platform is payment-ready by design; not yet payment-active; the architecture supports future live payments without requiring redesign.

### 19.3 Ownership model (locked)
- EveryStep JobWorks = operational source of truth for payment visibility, payment-related workflow state, and operational tracking.
- Stripe = implemented rail for platform account subscription onboarding; future preferred rail for tenant customer payment acceptance and money movement.
- QBO (optional future) = accounting integration seam only.

Operational payment state, accounting sync, and payment execution are separate layers and must remain separate in the architecture.

### 19.4 QBO rule (locked)
QuickBooks Online must not be the required foundation for payment architecture. QBO is optional, downstream, accounting-oriented, a future sync/integration seam. QBO is not the required basis for payment acceptance, the payment rail, the required merchant setup, or a prerequisite for core product usage.

### 19.5 Stripe rule (locked)
Stripe is the preferred future payment rail. Future customer payment execution should follow a Stripe-first path; processor-backed payment handling must not depend on QBO adoption; future contractor payout/onboarding complexity should live at the payment-rail layer, not in accounting logic. Platform subscription onboarding V1 is implemented (admin checkout, portal access, webhook entitlement sync) and must not be treated as tenant customer invoice payment execution; tenant Pay Now/Charge Card/invoice checkout/refunds/disputes/payout execution remains deferred. Keep Stripe implementation additive.

### 19.6 Current live behavior
Supported now: payment tracking · payment status visibility · amount due/paid visibility where implemented · manual/external payment reference tracking · operational awareness of payment state. Not yet supported: live card acceptance · ACH · saved payment methods · processor-led refunds · dispute/chargeback handling · contractor payout onboarding · customer self-serve payment checkout.

### 19.7 Payment foundation requirements
- **19.7.1 Data-model rule:** the payment domain must be built to represent payment status, amount due, amount paid, balance due, payment method type, processor name, processor reference, recorded/paid date, refund status, refund amount, failure/error note, and sync status — without requiring all execution flows to exist now.
- **19.7.2 Processor abstraction rule:** payment tracking must remain processor-agnostic at the domain level. Do not hardcode payment logic around QBO-specific objects, accounting-only assumptions, or one-off manual patterns that would block future Stripe rollout. The layer must allow manual/off-platform recorded payments now, Stripe execution later, and optional QBO sync later.
- **19.7.3 Event rule:** payment-related operational changes should be event-capable from the start (`invoice_sent`, `payment_recorded`, `payment_partially_paid`, `payment_marked_paid`, `payment_marked_failed`, `refund_recorded`, `payment_sync_failed`). If payment state materially affects operations, history, or accountability, it should be event-backed.
- **19.7.4 UI rule:** current UI must reflect tracking truth only. Allowed language: Payment Status, Amount Paid, Balance Due, Payment Recorded, External Payment Reference. Disallowed until live processing exists: Pay Now, Collect Card, Charge Card, Process Refund, Card on File. The UI must not imply live processor-backed payment functionality before it is actually implemented.

### 19.8 Platform-fee rule (locked)
Future Stripe-based acceptance should support a small **configurable** platform fee: the architecture should allow the platform to retain a modest fee later; the fee must be configurable, not hardcoded as an aggressive monetization model; do not make payment monetization the centerpiece of the current build.

### 19.9 Roadmap phase framework (locked layering)
- **P0 — Tracking only (current live state):** payment visibility, status tracking, operational awareness, manual/external reference support.
- **P1 — Payment-ready foundation:** payment domain model, payment fields, processor-agnostic architecture, event-ready transitions, UI wording boundaries, future Stripe seam, optional future QBO sync seam, support for a later configurable platform fee.
- **P2 — Customer payment acceptance (later):** customer pays invoice online; outcome writes back; state updates automatically; simple Stripe-first path; no payout complexity unless required. Platform subscription billing execution is a separate platform-billing track and must not be conflated with tenant invoice billed/collected tracking truth.
- **P3 — Contractor/platform payout layer (later):** only after customer acceptance is stable — contractor onboarding, payout rules, recipient ownership logic, refund/dispute responsibility, optional platform-fee activation.
- **P4 — Optional QBO sync (later):** accounting convenience only; QBO sync must remain optional and downstream.

> (Current phase status and the P1 completed-slice evidence live in [CURRENT_ROADMAP.md](./CURRENT_ROADMAP.md) and the payment evidence ledgers, not here.)

### 19.10 Launch rule (locked)
Lack of live payment acceptance does not automatically block launch — payment tracking still supports operations, the system can manage invoice/payment visibility, and payment execution is a later convenience/collection layer.

### 19.11 Non-negotiables
- do not require QBO for payment architecture
- do not couple payment readiness to accounting adoption
- do not imply live payment acceptance before it exists
- do not hardcode around QBO-specific payment structures
- do not overbuild payout complexity too early
- do support a future small configurable platform fee
- do keep payment execution additive to the operational core, not disruptive to it

---

## 20. Current locked clarifications

(From Spine §20.4 — the durable clarifications; the point-in-time product assessment and support-console status narratives were roadmap/status material and moved to [CURRENT_ROADMAP.md](./CURRENT_ROADMAP.md).)

### 20.1 `on_the_way` rule
`on_the_way` is a field lifecycle state only and must never be written to `ops_status`.

### 20.2 `retest_needed` closure
`retest_needed` is not an active production target state in the current ECC model. Current ECC retest flow is governed by failed-parent historical truth, `pending_office_review` internal review where applicable, retest child job creation for revisit/retest work, and `paperwork_required`/`invoice_required`/`closed` closeout progression as resolver-driven outcomes.
- New writes must not set `jobs.ops_status` to `retest_needed`.
- Existing historical `retest_needed` rows may be read for compatibility during transition cleanup.
- Treat `retest_needed` as legacy compatibility-only, not a forward state.

### 20.3 Customer Support / Remote Assistance — locked boundaries
Support sessions are read-only only. Support access requires explicit `support_user` + active grant + active session, is account-owner scoped, and requires audit events (with a human-entered start reason for audit quality). No impersonation/login-as-customer behavior; no support mutation or support-side operational writes; no customer-facing support actions; no broad tenant browsing expansion. Production support-console enablement is gated behind `ENABLE_SUPPORT_CONSOLE` (fail-closed) and remains intentionally deferred — see [ACTIVE/Support_Console_Production_Enablement_Runbook.md](./ACTIVE/Support_Console_Production_Enablement_Runbook.md).

---

## How to use this document

When starting future work:
- Use PROJECT_TRUTH as the current operational truth. Treat every "Locked" rule as non-negotiable unless an explicit, approved change says otherwise.
- Distinguish clearly between core engine completeness, UX polish, deferred future modules, and unresolved model decisions. Do not relabel a UX gap as a missing backend system.
- Do not introduce new source-of-truth layers without explicit approval. Preserve additive architecture and environment discipline.

Where things live in the new structure:
- **PROJECT_TRUTH.md** (this file) — stable product facts, locked architecture, standing constraints.
- **[CURRENT_ROADMAP.md](./CURRENT_ROADMAP.md)** — active lanes, current status, next safe slices, deferred/gated work.
- **[SESSION_CONTEXT_TEMPLATE.md](./SESSION_CONTEXT_TEMPLATE.md)** — paste-at-start briefing for a Claude/Codex session.
- **[ACTIVE/Documentation_Authority_Map.md](./ACTIVE/Documentation_Authority_Map.md)** — which doc owns what; naming the authority target before editing.
- Domain model specs, runbooks, and evidence ledgers under `docs/ACTIVE/` remain the canonical owners of their detail; this file links to them rather than duplicating them.

One-line definition: EveryStep JobWorks is a stabilized, event-driven operational system for compliance and service workflows, with complete scheduling and staffing foundations, strong auditability, a completed payment/deposits reporting foundation, controlled money-flow proof still gated, and future-ready business-layer expansion.
