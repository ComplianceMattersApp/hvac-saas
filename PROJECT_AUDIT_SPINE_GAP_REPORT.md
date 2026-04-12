# PROJECT AUDIT — SPINE GAP REPORT

Status: Pass 1 complete, Pass 2 complete (implementation mapping)
Scope: Locked spine docs vs current repository implementation
Method: Two-pass audit (objective extraction, then code/schema mapping)

## 1) Audit Inputs (Locked Source Set)

- docs/ACTIVE/ACTIVE Spine v3.0 (Current State of Truth).md
- docs/ACTIVE/Spine v2 (Current Source of Truth).md
- docs/ACTIVE/source-of-truth-strategy.md
- docs/ACTIVE/PHASE_2_5_SERVICE_CASE_CONTAINER_SPINE.md
- docs/SUPPORTING/DOMAIN_MAP v2.md
- docs/SUPPORTING/DATA_FLOW v2.md
- docs/ARCHIVE/Compliance_Matters_Software_Project_Spine_and_Sprint_Plan.md

## 2) Pass 1 — Objective Extraction (What Must Be True)

1. Source-of-truth ownership is locked:
	- job_events = narrative truth
	- ecc_test_runs = ECC truth
	- jobs.ops_status = projection
	- service_cases = continuity container
2. Lifecycle must be resolver-driven and not invented in UI.
3. Retests must remain child jobs; parent history must not be overwritten.
4. Contractor interaction must be scoped and signal-only (events), not lifecycle control.
5. Required snapshot sync points must remain intact:
	- customer edit
	- location edit
	- intake/job creation
	- future relink (explicitly marked future)
6. Staffing must be assignment-based (job_assignments) with identity safety layer.
7. Multi-tenant/RLS boundaries must isolate internal vs contractor access.
8. Notification ledger exists, and v3 calls out missing full visibility UI as remaining scope.
9. Calendar/dispatch must be a projection layer, using canonical filtered datasets and not UI-derived status truth.
10. Changes should remain additive and avoid parallel logic paths.

## 3) Pass 2 — Domain Mapping Matrix

Legend: COMPLETE / PARTIAL / MISSING / DRIFT

1. Service case container ownership: PARTIAL
	- Evidence: service case creation/inheritance is implemented in lib/actions/job-actions.ts.
	- Evidence: additive design and no Phase 2 UI coupling are consistent with docs.
	- Gap: production schema snapshot artifact is not aligned with migration evidence for service_cases (see DRIFT item).

2. Jobs lifecycle and visit model: COMPLETE
	- Evidence: lifecycle mutations and operations are centralized in lib/actions/job-actions.ts and lib/actions/job-ops-actions.ts.
	- Evidence: retest child-job flow remains linked by parent_job_id.

3. Event narrative as canonical truth: COMPLETE
	- Evidence: broad event writes across intake, scheduling, attachments, portal contractor interactions, and ops transitions.
	- Evidence: job_events schema, indexes, and RLS are present in supabase/migrations/20260301_baseline_foundation.sql.

4. ECC truth and ops projection discipline: COMPLETE
	- Evidence: evaluateEccOpsStatus is wired across job and closeout paths in lib/actions/ecc-status.ts, lib/actions/job-actions.ts, lib/actions/job-ops-actions.ts, and lib/actions/job-evaluator.ts.
	- Evidence: tests enforce evaluator delegation in lib/actions/__tests__/job-evaluator.test.ts.

5. Contractor interaction constraints: COMPLETE
	- Evidence: portal write paths emit contractor events (contractor_note, contractor_correction_submission, retest_ready_requested) without direct jobs lifecycle mutation in app/portal/jobs/[id]/page.tsx and components/portal/JobAttachments.tsx.

6. Contractor reporting loop: COMPLETE
	- Evidence: contractor report generation/send persists contractor_report_sent events and delivery ledger status in lib/actions/job-ops-actions.ts and lib/actions/notification-actions.ts.

7. Snapshot sync points: PARTIAL
	- Evidence: customer edit syncs customers/locations and job snapshots plus revalidation in lib/actions/customer-actions.ts.
	- Evidence: intake stamps snapshot fields in lib/actions/intake-actions.ts.
	- Gap: no dedicated full location-edit action surface equivalent to customer edit sync path; app/locations/[id] currently updates notes only via app/locations/[id]/notes-actions.ts.
	- Note: relink sync point is documented as future and treated as not-yet-required for Phase 2 lock.

8. Staffing + human layer adapter: COMPLETE
	- Evidence: job_assignments read/write usage across ops, field, jobs, and calendar surfaces.
	- Evidence: identity safety adapter is centralized in lib/staffing/human-layer.ts and consumed in app/ops/page.tsx, app/jobs/[id]/page.tsx, app/ops/admin/internal-users/page.tsx, and lib/actions/calendar-actions.ts.

9. Auth/RLS boundary integrity: COMPLETE
	- Evidence: requireInternalRole/requireInternalUser guard patterns are consistently used in admin and ops action surfaces.
	- Evidence: contractor_users/internal_users/job_assignments/service_cases policies are present in supabase/migrations/20260301_baseline_foundation.sql.

10. Calendar/dispatch as projection layer: PARTIAL
	- Evidence: canonical filtered dataset handling and ops_status display sourcing in lib/actions/calendar-actions.ts and components/calendar/calendar-view.tsx.
	- Evidence: scheduling writes produce events in lib/actions/job-actions.ts.
	- Gap: calendar implementation is substantial, but v3 still treats dispatch/calendar as next-phase major scope and refinement area.

11. Notifications visibility layer: MISSING
	- Evidence: notification ledger writes exist in lib/actions/notification-actions.ts and lib/actions/job-actions.ts.
	- Evidence: no route/component found consuming notifications table in app/** or components/**.

12. Admin invite flow hardening/validation: PARTIAL
	- Evidence: callback + set-password + role routing and admin invite actions are implemented in app/auth/callback/page.tsx, app/set-password/page.tsx, lib/actions/admin-user-actions.ts, lib/utils/resolve-invite-redirect-to.ts.
	- Gap: v3 explicitly marks invite flow validation as final core task; no clear test harness coverage found in this pass.

## 4) DRIFT Findings (Docs/Artifacts/Implementation Mismatch)

1. Schema artifact drift: DRIFT
	- supabase/migrations/20260301_baseline_foundation.sql includes service_cases.
	- prod_schema.sql in this workspace did not surface service_cases in this audit search pass.
	- Impact: operational confusion risk around authoritative schema snapshot/documentation.

2. Duplicate tree drift risk: DRIFT
	- Workspace contains both root project and nested hvac-saas mirror tree.
	- Impact: patching/reporting against one tree can diverge from the other if operational source is not explicit.

## 5) Top 10 Priority Gaps/Risks

1. MISSING: Notification visibility UI (inbox/read state/prioritization).
2. PARTIAL: Location edit sync-point ownership is incomplete as a standalone domain surface.
3. DRIFT: service_cases presence mismatch between migration baseline and prod schema artifact.
4. DRIFT: dual project tree can create implementation/audit split-brain.
5. PARTIAL: Invite-flow validation remains open despite implementation.
6. PARTIAL: Calendar/dispatch marked as active refinement scope despite substantial implementation.
7. PARTIAL: Snapshot strategy still hybrid; several screens depend on job snapshots, increasing sync-point sensitivity.
8. RISK: Event-coverage discipline is broad but not centrally enforced by automated event-contract tests.
9. RISK: Manual ops_status transitions in some internal flows require ongoing guard scrutiny to avoid projection drift.
10. RISK: Documentation-to-code verification currently manual and vulnerable to future drift without automation.

## 6) Next 5 (Execution Sequence After Top 10)

1. Add notifications read surface (internal inbox list + read/unread mutation path).
2. Establish explicit location edit owner action for address fields with snapshot sync + required revalidation.
3. Reconcile schema artifacts (regenerate/verify prod_schema.sql against applied migrations).
4. Consolidate operational source tree (declare root of truth, archive or guard mirror directory).
5. Add invite-flow integration tests (callback -> set-password -> role redirect paths).

## 7) What Is Explicitly Not a Gap (Per Locked Scope)

1. No service-case UI in Phase 2.5 (documented additive backend-first model).
2. No full app-wide normalization away from job snapshots in Phase 2 (hybrid strategy explicitly allowed).
3. Future relink sync-point is documented as future work, not current blocking non-compliance.

## 8) Verification Checklist (Blast-Radius Style)

1. Source-of-truth ownership traced to resolver/action/schema layers, not UI assumptions.
2. Writes/read paths reviewed for lifecycle, events, contractor portal, staffing, auth, calendar, notifications.
3. Duplicate logic risk flagged where projection could diverge from canonical owners.
4. Silent regression surfaces called out (schema artifacts, mirror tree, validation gaps).
5. Classification distinguishes architecture gaps vs scope-accepted postponements.

## 9) Final Assessment

Overall posture: Core architecture is largely aligned with locked spine ownership and lifecycle principles, with the most material implementation gap being notification visibility UI and the most material governance risk being schema/tree drift.

Compliance snapshot:
- COMPLETE: 7 domains
- PARTIAL: 4 domains
- MISSING: 1 domain
- DRIFT: 2 cross-cutting artifacts

## 10) Intake Authority Clarification (2026-04-12)

Locked intended rule:
- Internal intake may create/link canonical customer/location records through reuse-first intake flow.
- Contractor intake submits proposed customer/contact/location data and is not final canonical identity authority by default.
- Internal review finalizes identity linkage as one of:
	- existing customer + existing location
	- existing customer + new location
	- new customer + new location

Current behavior note:
- Current live shared create path can still directly create canonical customer/location records in contractor-originated intake branches.
- This is tracked as current behavior under review, not intended long-term authority.

