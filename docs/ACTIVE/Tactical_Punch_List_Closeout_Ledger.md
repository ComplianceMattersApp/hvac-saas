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

### Production-Shipped Cleanup Sequence

- Evidence source: formerly duplicated in `Compliance_Matters_Prelaunch_Confirmation_Checklist.md` Section 2.3.3.
- Closed behavior: notification/proposal unread-awareness cleanup, proposal card identity restoration, contractor/internal note preservation, calendar/scheduling display fixes, no-tech scheduled visibility, unassigned filter chip, inspector default-collapsed behavior, responsive default calendar views, date-only display format polish, login password show/hide, and day/aging counters on Failed and Need Info/Pending Info surfaces.
- ECC/test tactical items: Refrigerant Charge photo evidence is now a guided inline documentation mode with separate Take Photo and Upload Photo actions, normal job attachment storage, clean labels, hidden numeric fields while in photo evidence mode, and explicit Pass / Fail / Needs Review before completion; photo capture/upload alone still does not auto-pass. Duct Leakage override suggestions include Asbestos while preserving custom/manual reasons.
- Guardrails preserved: no payment execution behavior, no Pricebook behavior, no RLS behavior, no calendar engine rebuild claim, and no technician-assignment ownership change from calendar drag/drop.

### Proposal / Closeout / Calendar Polish Catch-Up

- Evidence source: formerly duplicated in `Compliance_Matters_Prelaunch_Confirmation_Checklist.md` Section 2.3.6.
- Closed behavior: proposal builder visual cleanup, editable estimate line items, builder workflow polish, pricebook search model, save-manual-line-to-pricebook, redirect-to-new-job-after-convert-to-job, proposal print/customer presentation polish, Internal Proposal Boundaries box removal, Proposal Notes using the existing estimate notes field, proposal link/customer approval/email delivery smoke closeouts, Closeout Queue V1 confirmation, and Calendar Work Context derived-label confirmation.
- Parked follow-ups remain unchanged: contact recipient write/edit workflow, Closeout Queue V2, provider-powered SMS, and Payments V2 deferred register.
- Guardrails preserved: no schema changes for print/proposal polish, no SMS/text proposal delivery, no proposal payment collection, no QBO behavior, no invoice issue/send from proposal approval, no automatic job or invoice conversion, no customer portal login dependency, no e-signature/legal artifact model, and no live SMS behavior.

### Job Detail Responsiveness and Contact Action Polish

- Commits: `655d83b` and `4ecf127`.
- Evidence source: formerly duplicated in `Compliance_Matters_Prelaunch_Confirmation_Checklist.md` Section 2.3.7.
- Closed behavior: service closeout read de-dupe, job detail location preview deferral, timing instrumentation, first-paint/recomposition improvements, deferred secondary section bodies, invoice secondary-detail deferral, customer-attempt summary deferral, timeline summary softening, parent read fanout parallelization, contact-attempt calendar revalidation dedupe, action-specific contact pending feedback, and contact redirects returning near the contact section.
- Guardrails preserved: responsiveness/perceived-performance only; no source-of-truth, lifecycle, `/ops`, Service Plans, invoice/payment, portal, SMS, QBO, schema, migration, auth/RLS, entitlement, feature-flag, event truth, redirect, revalidation, banner, attempt-count, or `tab=ops` continuity behavior changed.
- Future backlog remains measured/surgical only: route speed, `/ops`, `/jobs/[id]`, lifecycle buttons, contact actions, `/jobs/new`, calendar, reports, backend/read variance, and safe partial-settle patterns.

### Ops First Impression Performance Pass

- Evidence source: formerly duplicated in `Compliance_Matters_Prelaunch_Confirmation_Checklist.md` Section 2.3.5.1.
- Closed behavior: removed unused `/ops` Upcoming read path, added timing diagnostics, split actor/business identity timing, split major queue/read phases, narrowed contractor-update awareness, and added diagnostics for assignment display, closeout projection, and request actor context.
- Guardrails preserved: no schema, migrations, Supabase commands, RLS/auth behavior, queue semantics, event/revalidation behavior, billing/payment behavior, Estimates, Support, QBO, or onboarding behavior changed.
- Future backlog remains optional and measurement-driven: deeper auth/request-actor review, Ops-specific lightweight assignment helper, broader backend/read variance investigation.

### Field Bus Improvement Passes

- Evidence source: formerly duplicated in `Compliance_Matters_Prelaunch_Confirmation_Checklist.md` Section 2.3.6.
- Closed behavior: new job/new work awareness clears when scheduled/finalized/rejected/handled, Owner Console company-name fallback correction, equipment/CHEERS/report label and visibility polish, login signup options and invited-user helper copy, `/jobs/new` Create New Customer shortcut, full `/ops/call-list` workspace, and schedule update permit-field preservation.
- Guardrails preserved: manual Read remains available, contractor update scope unchanged, no equipment schema/storage/unit-conversion/test-type change, Hybrid signup remains hidden, customer search/reuse and server-side intake behavior unchanged, `/ops` remains command center, and schedule updates did not change scheduling source-of-truth, lifecycle, notification, or queue semantics.

### Field-Ready PWA / Portal Loading Polish

- Evidence source: formerly duplicated in `Compliance_Matters_Prelaunch_Confirmation_Checklist.md` Sections 2.3.7 and 2.3.7.1.
- Closed behavior: web/PWA metadata/installability baseline hardening, login continuity hardening, update-safe refresh notice, service-worker update-failure handling, shared Device setup guidance with per-device notifications, Today/Ops first-action guidance, revenue workflow rail clarity, calendar mobile control compression, admin Day 1 essentials, protected unauthenticated deep-link `?next=` preservation, role-routing safety, and mobile-friendly contractor portal loading skeleton.
- Guardrails preserved: web-first controlled rollout posture, mobile `/jobs/[id]` field-mode protection, no auth/session architecture change, no contractor/internal route separation change, no first-owner routing behavior change, no schema/migrations/RLS/Supabase/feature flag/production data changes, no service worker/offline caching expansion, and no native app-store packaging.

### HVAC Service Ops First Impression + Shared Notes De-Emphasis

- Evidence source: formerly duplicated in `Compliance_Matters_Prelaunch_Confirmation_Checklist.md` Section 2.3.8.
- Closed behavior: HVAC Service `/ops` first impression uses Team Work Snapshot + Work by Technician, existing job search remains available, HVAC Service operational copy is team/work oriented, and Shared Notes is de-emphasized/optional for HVAC Service while Timeline and Internal Notes / Team Notes remain available.
- Guardrails preserved: ECC/HERS contractor filter/search and contractor links/query params remain functional, Hybrid/Master/All-in-One behavior remains intact, no schema/migration/Supabase/auth/RLS/contractor-authority/source-of-truth/job_events/billing/payment/Stripe/QBO/report dataset/product split behavior changed, and `proxy.ts` remains the correct Next.js 16 routing convention.

### Owner Console Readability / Display Polish

- Evidence source: formerly duplicated in roadmap closeout notes for Owner Console UI Polish, Hidden Test Accounts, and Internal Account Separation / Display Polish.
- Closed behavior: `/ops/owner-console` defaults to Current active/trial/grace metrics, inactive/cancelled rows remain inspectable through read-only filters, table readability was improved, `/ops/admin` shows the Owner Console link only for allowlisted platform-owner actors, hidden/test accounts can be suppressed from normal metrics while remaining inspectable, and platform/internal accounts can be separated from customer counts.
- Guardrails preserved: access remains explicit allowlist-only; no impersonation, Support Console enablement, tenant mutation, product-mode mutation, database cleanup, Stripe cleanup, auth deletion, archive/delete action, or security/RLS behavior changed.
- Configuration remains env-driven where applicable: `PLATFORM_OWNER_EMAILS`, optional `PLATFORM_OWNER_USER_IDS`, `PLATFORM_OWNER_HIDDEN_ACCOUNT_EMAILS`, and `PLATFORM_OWNER_INTERNAL_ACCOUNT_EMAILS`.

## What This Ledger Does Not Change

- No schema, migration, Supabase command, env/secret, payment, ECC, portal, SMS, QBO, support, or product-mode behavior is changed by this documentation record.
- This ledger does not reopen old roadmap lanes.
- This ledger does not make minor tactical fixes canonical model truth; durable truth remains in the relevant canonical docs.
