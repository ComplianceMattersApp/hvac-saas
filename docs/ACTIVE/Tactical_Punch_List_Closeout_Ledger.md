# Tactical Punch-List Closeout Ledger

Status: ACTIVE TACTICAL CLOSEOUT LEDGER
Scope: minor fixes, low-risk polish, small regressions, tactical performance fixes, and punch-list completions. This file records evidence; it does not authorize product code, schema, migration, Supabase, Stripe, payment, ECC, portal, SMS, QBO, support, or env changes.

Authority: governed by [Documentation_Authority_Map.md](./Documentation_Authority_Map.md). The Active Spine remains current product truth; this ledger is tactical evidence and should not be treated as a model spec.

Control-plane rule: record minor UI polish, low-risk regressions, duplicate-submit/pending-state fixes, tactical performance fixes, and small punch-list completions here with concise commit evidence and guardrails. Do not use this ledger for durable model contracts, launch gates, roadmap sequencing, production runbook execution, or historical lane consolidation. If a tactical fix changes current product truth, add only a short Spine summary with a backlink here.

## June 2026 Remote / Low-Risk Punch-List Closeout

Status: CLOSED for the commits listed below. These items were verified from recent git history and are recorded here to avoid copying tactical details into the Spine, Roadmap, or Prelaunch checklist.

### Product Display Label Sweep

- Commit: `a78b4f5` (`polish(product): rename HVAC Service label to Service"`).
- Evidence files included signup/onboarding and app-facing surfaces: `app/signup/product-choice-landing.tsx`, `app/signup/signup-content.tsx`, `app/login/page.tsx`, `app/layout.tsx`, `app/jobs/new/NewJobForm.tsx`, owner/admin surfaces, and related tests.
- Closed behavior: visible app/product copy that said "HVAC Service" or "HVAC service" now displays as "Service" across signup/onboarding and app-facing UI.
- Guardrails preserved: internal `hvac_service` values, provisioning, entitlements, routes, schemas, ECC/HERS behavior, and product logic were not renamed or changed. Industry selection was not added.

### Duplicate-Submit / Pending Button Lock

- Commit: `06e51a5` (`fix(ui): lock pending mutation buttons`).
- Evidence files: `components/ImmediateSubmitButton.tsx`, `app/ops/admin/users/page.tsx`, `app/jobs/[id]/_components/JobFieldActionButton.tsx`, `app/jobs/[id]/page.tsx`.
- Closed behavior: People & Access internal invite and nearby People & Access mutation buttons lock immediately with pending/disabled feedback. `/jobs/[id]` lifecycle/status buttons also lock while slow transitions are pending.
- Guardrails preserved: existing server actions, authorization, lifecycle/status behavior, redirects, revalidation behavior, source-of-truth boundaries, and field finish routing remained unchanged.

### Job Lifecycle Response-Time Optimization

- Commit: `a228d98` (`perf(jobs): streamline lifecycle status action`).
- Evidence file: `lib/actions/job-actions.ts`.
- Closed behavior: `advanceJobStatusFromForm` widened the initial job read and removed/reused duplicate critical-path reads before redirect.
- Guardrails preserved: behavior, events, redirects, revalidation, ECC guard/evaluation behavior, and field finish routing remained unchanged. Job lifecycle semantics were not changed.

### Job Details & Records Button Consistency

- Commit: `3724f7b` (`polish(jobs): align details record buttons`).
- Evidence files: `app/jobs/[id]/page.tsx`, `components/jobs/CancelJobButton.tsx`.
- Closed behavior: Job Details & Records action buttons were visually aligned for size, spacing, alignment, and styling.
- Guardrails preserved: styling/layout only. No server actions, lifecycle/status behavior, field finish routing, invoice/payment/ECC/portal/SMS/QBO/support behavior, schema, migrations, env, or product-mode behavior changed.

### Desktop Equipment Card Render Fix

- Commit: `16fa045` (`fix(jobs): restore desktop equipment panel`).
- Evidence file in commit: `lib/jobs/__tests__/job-tests-page-wiring.test.ts`; implementation evidence in the completed slice restored desktop equipment panel wiring in `app/jobs/[id]/page.tsx`.
- Closed behavior: desktop `/jobs/[id]` Equipment panel renders the full equipment surface where appropriate and has wiring coverage for equipment edit/create components.
- Guardrails preserved: no equipment data model change, no lifecycle/status behavior change, and no invoice/payment/ECC/portal/SMS/QBO/support behavior change.

### Desktop Calendar Jump to Date Parity

- Commit: `08d49b9` (`polish(calendar): add desktop jump to date`).
- Evidence files: `components/calendar/calendar-view.tsx`, `lib/calendar/__tests__/calendar-action-responsiveness.test.ts`.
- Closed behavior: desktop calendar toolbar exposes Jump to Date and preserves view/date/tech behavior.
- Guardrails preserved: day/week/month/list behavior, Previous/Today/Next behavior, selected date/view behavior, scheduling rules, drag/drop behavior, and calendar engine behavior remained unchanged.

### Sticky Desktop Unscheduled Calendar Queue

- Commit: `620d3fe` (`polish(calendar): keep unscheduled queue sticky`).
- Evidence files: `components/calendar/calendar-view.tsx`, `lib/calendar/__tests__/calendar-action-responsiveness.test.ts`.
- Closed behavior: desktop planner/sidebar queue remains visible and usable while scrolling the calendar board.
- Guardrails preserved: no drag/drop logic change, no scheduling rule change, no assignment semantic change, no calendar data fetching change, and mobile remained layout-compatible.

## What This Ledger Does Not Change

- No schema, migration, Supabase command, env/secret, payment, ECC, portal, SMS, QBO, support, or product-mode behavior is changed by this documentation record.
- This ledger does not reopen old roadmap lanes.
- This ledger does not make minor tactical fixes canonical model truth; durable truth remains in the relevant canonical docs.
