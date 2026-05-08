# Compliance Matters Software â€” Pre-Launch Confirmation Checklist

**Status:** ACTIVE PRE-LAUNCH PLANNING SUPPORT DOC  
**Authority:** Subordinate to `docs/ACTIVE/Active Spine V4.0 Current.md`  
**Purpose:** Keep final launch enablements, hardening items, and rollout confirmations visible so they do not fall off the agenda while core development continues.

---

## 1. What this document is

This is a **launch-readiness checklist**, not the operational source of truth.

If any item here conflicts with the active spine, the spine wins.

---

## 2. Pre-launch enablement items

### 2.1 Supabase Auth leaked password protection
- Enable leaked password protection when the required paid plan / launch readiness is in place.
- Treat as a launch hardening item, not a current development blocker.
- Verify the warning is cleared before launch.

### 2.2 SMS / on-the-way messaging
- Keep SMS/on-the-way messaging wired directionally in product planning.
- Do not fully configure/send live messages until right before launch.
- Final provider/payment-backed setup belongs to the pre-launch window.
- Verify wording does not imply live texting is active until setup is complete.

### 2.3 Payment/live enablement readiness
- Confirm launch posture remains `payment-ready by design, payment-active later` unless explicitly changed.
- Confirm Phase P1 payment-ready foundation is complete, while live processor-backed payment execution remains later/pre-launch enablement work.
- Confirm Stripe Platform Subscription V1 is implemented and live-smoke confirmed for platform account onboarding.
- Confirm this Stripe work is separate from tenant customer/work invoice payment execution.
- Confirm the tenant customer/work payment execution track remains future/deferred:
  - customer pays invoice online
  - payment outcome writes back to Compliance Matters
  - invoice payment status/balance updates
  - partial/full payment outcomes anticipated
  - refunds/disputes/payment-failure handling remains later
  - optional small platform fee remains future capability
  - QBO remains optional/downstream only
- Verify no UI implies live processor-backed payment collection before it truly exists.
- Confirm Stripe-first future direction and QBO-optional boundary remain intact.
- Confirm recent invoice/payment wording polish remains honest:
  - payment entries are tracking-only and do not execute card charges
  - no live Pay Now/Charge Card/checkout/refund/dispute/payout language appears as active behavior

### 2.3.1 Launch-readiness catch-up confirmations (completed)
- Scope vs Line Items / Work Items terminology alignment is complete.
- Confirmed UI no longer presents free-form scope and structured line items as duplicate concepts on validated core surfaces.
- Validated surfaces:
  - internal `/jobs/new`
  - service `/jobs/[id]`
  - invoice panel / build-from-work-items path
  - contractor `/portal/jobs`
  - contractor new-job/request form (`/jobs/new` in contractor mode)
- Validation passed:
  - targeted tests: `npx vitest run lib/jobs/__tests__/visit-scope.test.ts lib/business/__tests__/internal-invoice-line-items-provenance.test.ts` (`2` files passed, `8` tests passed)
  - TypeScript: `npx tsc --noEmit` (`TSC_OK`)
  - browser smoke including contractor-authenticated follow-up
- Confirmed no behavior/schema/Estimate/invoice/Pricebook/payment/support/contractor-authority changes.
- Service / Visit Scope clarity pass is complete:
  - Service Details vs Visit Scope purpose wording is clarified on job detail
  - Job Title fallback copy is clarified
  - no model/validation/billing/ECC/RLS behavior changes were introduced
- Invoice job-detail TLC pass is complete:
  - panel scanability and issue/send/payment/void wording are clearer
  - invoice truth anchor is explicit; payment recording remains tracking-only
  - external-billing lightweight wording emphasizes Invoice Sent tracking
- Internal invoice prefill fallback hardening is complete where source fields exist; existing drafts are not overwritten.
- Address state capture/wiring pass is complete for relevant intake/finalization seams and supports billing-state prefill where source data is captured.
- Internal invoice void recovery/replacement pass is complete:
  - voided invoices remain historical
  - voided invoices do not satisfy closeout billed truth
  - replacement draft flow is available for same-job continuity
- Invoice report wording polish is complete:
  - Send Status replaces Comm State
  - Payment Count replaces Payments
  - CSV header wording aligned where applicable

### 2.3.2 Stripe platform onboarding status and live rollout confirmation
- Stripe Platform Subscription V1 is implemented and has now passed live production smoke for platform account onboarding.
- Live Stripe Product/Price is configured for the flat platform account subscription.
- Vercel production env is configured with live Stripe values.
- Live Stripe webhook endpoint is configured for:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Production Checkout successfully opened live Stripe Checkout.
- Live subscription completion succeeded on a normal non-owner test account.
- Vercel logs confirmed `/api/stripe/webhook` returned `200`.
- `platform_account_entitlements` synced correctly after live purchase:
  - Billing Customer: Linked
  - Subscription: Active
  - Period End populated
- Manage billing path remains available.
- Local sandbox smoke and hardening also remain confirmed:
  - `/api/stripe/webhook` bypasses session-auth proxy redirect (no Stripe 307 redirect loop)
  - webhook signature verification remains enforced inside `app/api/stripe/webhook/route.ts`
  - unmanaged/fixture `checkout.session.completed` events are safely ignored with 200
  - period-end mapping uses `subscription.items.data[*].current_period_end` with legacy fallback to `subscription.current_period_end`
- This remains platform account subscription billing only.
- Sandbox/test Stripe values must never be committed.
- `.env.local` remains local-only.
- Local Stripe CLI webhook secret is not the same as deployed/live webhook secret.
- Keep this priority separate from tenant customer invoice payment execution.
- Tenant customer invoice payment execution remains deferred unless explicitly pulled forward.
- Live payment execution surfaces (Pay Now/Charge Card/checkout/refunds/disputes/payouts) remain deferred.

### 2.3.3 Completed production-shipped cleanup sequence confirmation
- Completed production-shipped cleanup batch is confirmed as launch-readiness baseline documentation:
  - Notifications/proposals: unread-awareness cleanup on accept/reject/finalize, card identity restoration, preserved contractor follow-up comments, preserved internal adjudication notes, and intact contractor-visible/internal-only boundaries.
  - Calendar/scheduling: phone wiring fix in details, card identity restoration (job title/city), no-tech scheduled visibility, unassigned filter chip, inspector collapsible/default-closed behavior, responsive default views (desktop Month, mobile List, explicit view preserved), and unified-surface drag/drop direction with manual scheduling still available.
  - UI polish: date-only display format changed to MM-DD-YYYY (storage/input/query unchanged), login password show/hide toggle, and day/aging counters on Failed and Need Info/Pending Info internal/portal surfaces.
  - ECC/test workflow: refrigerant Photo Taken path is attestation-only, does not require/verify uploaded photo proof, does not claim numeric pass, preserves computed_pass = null until manual/admin review or override where needed, and keeps numeric/manual override paths intact.
  - Duct leakage override suggestion list includes Asbestos while preserving custom/manual reason support.
- Confirmed boundaries for this closeout:
  - no payment execution behavior change
  - no Pricebook behavior change
  - no RLS behavior change
  - no claim of calendar engine rebuild
  - no technician-assignment ownership change from calendar drag/drop

### 2.3.4 Production contractor intake hotfix closeout (resolved)
- Confirmed production incident: contractor-reported new work request for 4137 Amberwood Cir, Pleasanton showed an error/disappeared and did not save.
- Confirmed production read-only verification:
  - no matching durable row existed in `contractor_intake_submissions`, `jobs`, `customers`, `locations`, `job_events`, or `notifications`
  - 24-hour production sweep confirmed the failed contractor/company path aligned with the only contractor login activity in that period
  - no additional silent contractor intake failures were found in that sweep window
- Confirmed root cause: contractor `/jobs/new` form path did not post `state`, while server-side contractor proposal validation requires `address_line1`, `city`, `state`, and `zip`.
- Confirmed fix/closeout:
  - contractor form now posts state
  - required-address behavior was tightened to match server intake validation
  - contractor validation/error handling remains clear
  - side-effect failures after successful proposal save do not erase the saved submission
- Confirmed boundary remains unchanged:
  - contractor submissions remain proposed intake data
  - contractors retain no scheduling/lifecycle authority
  - internal users retain finalization authority
- Confirmed no production data repair was possible for the failed Amberwood row because it never persisted.
- Confirmed contractor resend follow-up was completed and a new production contractor submission/job path succeeded after fix.
- Confirmed no payment, Stripe, QBO, support-access, RLS model, or tenant-boundary behavior changed.

### 2.3.4.1 Contractor intake attachment resilience closeout (resolved)
- Follow-up issue after the prior missing-state hotfix: contractor intake still failed only when documents/photos were attached.
- Confirmed root cause/risk: file bytes were being sent through the initial Next Server Action for contractor `/jobs/new`; large photos/PDFs could exceed the request body parser limit before `createJobFromForm` ran, resulting in no durable `contractor_intake_submissions` row.
- Confirmed fix shipped in `70d1ee3` (`Harden contractor intake attachments`):
  - initial contractor proposal submit is now text-only and durable-first
  - `contractor_intake_submissions` row persists before attachment upload
  - attachments upload afterward through a separate signed-upload/finalize flow scoped to the saved pending proposal
  - finalize requires valid signed path shape and verifies uploaded storage object exists before inserting attachment rows
  - server-side validation includes file count, size, MIME/type, and extension
  - attachment DB insert failure attempts storage cleanup
  - attachment failure never deletes, rolls back, or hides the proposal
  - notification/email side-effect failures remain best-effort and do not erase saved proposals
- Confirmed boundary remains unchanged:
  - contractor submissions remain proposed intake data
  - contractors retain no scheduling/lifecycle authority
  - internal users retain finalization authority
  - no canonical customer/location/job creation occurs until internal finalization
  - no payment, Stripe, QBO, support-access, RLS model, or tenant-boundary behavior changed
- Validation:
  - `npx.cmd tsc --noEmit` passed
  - targeted Vitest passed: contractor intake hotfix + attachment resilience tests, 2 files / 10 tests

### 2.3.5 Performance/responsiveness closeout (current pass) and active backlog
- The focused performance/responsiveness intervention batch is complete for the current pass and is now closed for this pass.
- Completed/current baseline from this pass:
  - field action timing instrumentation
  - job detail render timing instrumentation
  - internal `/jobs/[id]` first-paint/recomposition improvements
  - route loading/context preservation improvements
  - deferred secondary section bodies moved out of parent render path:
    - internal attachments
    - follow-up/customer-attempt history
    - service-chain detail/history body
    - add-assignee selector/form
    - timeline/shared/internal narrative bodies
  - internal invoice secondary-detail deferral:
    - immediate billing/closeout truth remains first-paint
    - full invoice detail/lines/delivery/payment/pricebook panel data streams later
  - customer-attempt summary deferral:
    - `customerAttemptSummary` is now `0ms` on measured first-paint renders
    - contact actions remain immediate
    - no false "0 attempts" display is shown
    - Follow-Up History remains authoritative and deferred
  - timeline summary softening:
    - blocking 200-row `job_events` parent read was removed from first paint
    - shared/internal notes and timeline header counts/latest-date subtitles were replaced with neutral "loads below" copy
    - `DeferredTimelineBody`, `DeferredSharedNotesBody`, and `DeferredInternalNotesBody` remain authoritative and still read `job_events` after streaming
    - `ContractorReportPanel` generate/send behavior is unchanged; first-paint contractor response labels were display-softened only
  - internal job-detail parent read fanout was parallelized after scoped boundary and main job load
  - contact-attempt calendar revalidation dedupe completed
  - timing instrumentation remains behind env-gated flags:
    - `CONTACT_ATTEMPT_TIMING_DEBUG`
    - `JOB_DETAIL_TIMING_DEBUG`
  - contact buttons no longer remain stuck as `Recording...`
  - contact pending feedback is action-specific
  - No Answer and Sent Text return near contact section after redirect instead of snapping to top
  - event write truth, redirects, revalidation behavior, banner behavior, attempt counts, and `tab=ops` continuity remain preserved
- Current practical baseline note:
  - earlier severe spikes were reduced significantly
  - latest local `/jobs/[id]` smoke showed steady-state renders commonly around roughly `1.45-2.47s`
  - `timelineSummary` usually measured around roughly `183-384ms` after softening
  - `customerAttemptSummary` stayed `0ms`
  - contact-action core timings have been observed around roughly `1.1-1.4s` on improved paths
  - cold/backend/Supabase variance can still cause spikes
- Performance is not done forever and remains an active launch-readiness backlog:
  - app-wide route speed
  - `/ops` first impression
  - `/jobs/[id]` first load and recomposition
  - `mainJobRead`/`eccPayloadReads` spike risk
  - `assignmentDisplaySummary` spike risk
  - `serviceChainSummary` spike risk
  - invoice truth/detail split monitoring
  - lifecycle buttons (On the Way / Work in Progress / Complete)
  - contact actions
  - `/jobs/new`
  - calendar
  - reports
  - broader backend/read variance audit territory
  - reducing full-page recomposition where safe
  - future inline/partial settle patterns where appropriate
- Performance no longer blocks all roadmap movement by default; next speed work must be measured, surgical, and intentionally queued.
- Guardrails for this stream remain locked:
  - do not weaken truth to chase speed
  - no optimistic final-state UI without explicit approval
  - do not trim revalidation without dependency mapping
  - do not casually alter invoice/billing/payment performance paths
  - continue audit -> small slice -> benchmark -> commit -> docs update
  - do not weaken auth/scope/source-of-truth/event/audit/revalidation just to chase speed

### 2.3.5.1 Ops First Impression performance pass closeout (`/ops`) (completed)
- Completed slices in this pass:
  - A1 removed unused `/ops` Upcoming read path from the blocking render path (`0e0b05e`).
  - A2 added `OPS_TIMING_DEBUG` diagnostics (`86d6e02`).
  - A3 captured baseline timings.
  - A4 split actor/business identity timing and safely overlapped business identity after actor scope was known (`c256153`).
  - A5 added `primaryQueueReads` breakdown diagnostics (`3c5d261`).
  - A6 split Field Work fetch vs post-filter (`277e898`).
  - A7 compared Field Work vs Call List and confirmed Field Work was not uniquely slow (`1f978a6`).
  - A8 split `secondarySignalReads` (`54708a8`).
  - A9 split unread contractor notification cost (`bfcf72337cb1d9ce3afc2408b4db62eaa1e2fe55`).
  - A10 switched Ops contractor-update awareness to a narrow helper, removing rich notification job enrichment from `/ops` first impression (`67163ec`).
  - A11 split assignment display map internals (`64ce273`).
  - A12 captured full current baseline after A10/A11.
  - A13 split closeout projection internals (`44d63e1`).
  - A14 split request actor context internals and confirmed variance source (`c07745c`).
- Real behavior improvements delivered:
  - unused Upcoming read path was removed from `/ops` first impression
  - Ops contractor-update awareness now uses a narrow helper instead of rich notification enrichment
- Diagnostic coverage now includes major `/ops` phases under `OPS_TIMING_DEBUG`:
  - request actor context
  - primary queues
  - secondary signals
  - assignment display
  - notifications
  - closeout projection
- Findings captured:
  - Field Work latency is fetch-side, not local filtering
  - Field Work is not uniquely slow compared with Call List
  - unread contractor notifications were slimmed successfully
  - assignment display cost is assignments fetch + profile display map, not fallback lookup
  - closeout projection is not a deterministic bottleneck
  - request actor context variance is lookup-driven, not assembly
  - remaining large spikes are more consistent with shared backend/network/Supabase variance than one obvious local loop
- Explicit non-changes:
  - no schema changes
  - no migrations
  - no Supabase commands
  - no RLS/auth behavior changes
  - no queue semantics changes
  - no event/revalidation changes
  - no billing/payment behavior changes
  - no Estimates/Support/QBO/onboarding behavior changes
- Validation recorded:
  - TypeScript passed during slices
  - targeted tests passed where run
  - authenticated `/ops` timing smoke was used repeatedly
  - logs were label/duration only and excluded sensitive data
- Future backlog (optional, measured only):
  - deeper auth/request-actor review only with high caution
  - Ops-specific lightweight assignment helper only if timings justify it
  - broader shared backend/read variance investigation
  - continue measured/surgical performance work only when a specific issue harms usability

### 2.3.6 Resumed pre-launch execution order (active)
- Pre-launch sequence is explicitly resumed in this order:
  1. Performance/responsiveness batch closeout and documentation (closed for the current pass)
  2. Support Console production-readiness planning (controlled, read-only, audited, careful flag-enable planning, no impersonation, no tenant mutation unless explicitly approved later)
  3. Estimates production-readiness planning (internal production-enablement decision only; migration/feature-flag/smoke/rollback plan required) â€” readiness audit complete, production readiness hardening guard committed, internal-only enablement runbook drafted; production enablement requires explicit gate approval per `docs/ACTIVE/Estimates_Production_Enablement_Runbook.md`
  4. Field-ready installable/PWA access readiness (web/PWA-style readiness; app-store/native remains deferred)
  5. Final launch confirmation sweep (intake, internal job creation, scheduling, field lifecycle, invoice-tracking honesty, reports, flags, disabled/deferred features, production smoke)
  6. First-owner/operator handoff dry-run (owner setup, operator checklist, account readiness, support readiness, launch operations)
  7. Controlled tester onboarding only after the above are acceptably complete
- Tester remains in the wings intentionally and is not to be treated as a public launch trigger.
- Support Console and Estimates production enablement remain parked behind their runbooks; tenant customer payment execution remains deferred; QBO remains optional downstream/last-last.
- Resume broader launch-readiness sequencing after this docs closeout without treating tester pressure as a launch trigger.

### 2.3.7 Field-ready installable/PWA access readiness V1 (Slice 1 baseline hardening)
- Completed scope for this slice is web/PWA metadata/installability baseline hardening only (`app/manifest.ts`, `app/layout.tsx`), with no auth/routing/data/server-action/source-of-truth behavior changes.
- Current posture remains web-first app-like install readiness.
- Native app-store distribution remains intentionally deferred.
- Service worker/offline caching remains intentionally deferred to a separate planned slice.
- Chromium install prompt readiness may still require a future service-worker slice and is not implemented here.
- iOS install flow remains manual Add to Home Screen guidance (no automatic browser install prompt path).

### 2.3.7.1 Field-ready installable/PWA access readiness V1B-1 — Proxy Verification + Portal Loading Polish (completed)
- Confirmed: `proxy.ts` is the active and correct routing convention for this project under Next.js 16.
  - Next.js 16.0.0 officially renamed `middleware.ts` to `proxy.ts`; `middleware.ts` is deprecated.
  - Root `proxy.ts` exports `function proxy(req: NextRequest)` — the correct named export form — and is wired and executing.
  - Do not add `middleware.ts`; `proxy.ts` is the correct baseline convention for this app.
- Confirmed: protected unauthenticated deep links preserve `?next=` return path for tested routes:
  - `/ops` → `/login?next=%2Fops`
  - `/calendar` → `/login?next=%2Fcalendar`
  - `/portal/jobs/some-deep-link-id` → `/login?next=%2Fportal%2Fjobs%2Fsome-deep-link-id`
- Confirmed: post-login role-routing safety is enforced by `resolveSafeAuthReturnPath`:
  - contractor users are constrained to `/portal/*` return paths
  - internal users are blocked from contractor portal return paths
- Added: `app/portal/loading.tsx` — mobile-friendly contractor portal loading skeleton with header card and job-list pulse animation.
- Confirmed boundaries unchanged:
  - auth/session architecture is unchanged
  - contractor/internal route separation is unchanged
  - first-owner routing behavior is unchanged
  - Estimates and Support Console production enablement remain deferred
  - source-of-truth boundaries remain unchanged
  - no schema, migrations, RLS, Supabase commands, feature flag changes, or production data actions
  - no service worker/offline caching
  - no native app-store packaging
- Validation:
  - `npx.cmd tsc --noEmit` passed
  - browser smoke passed for unauthenticated `/ops`, `/calendar`, and `/portal/jobs/...` deep-link redirects with `?next=`
- Deferred from this slice:
  - post-login role-routing smoke with live credentials (validated logically via `resolveSafeAuthReturnPath` tests)
  - authenticated slow-load visual confirmation of portal loading skeleton
  - service worker/offline caching (separate planned slice)
  - native app-store distribution (intentionally deferred)

### 2.3.8 Service Workflow / Visit Scope Field Experience V1 Slice 1 (completed)
- Service job detail now uses clearer field-first Work Items guidance.
- Prior "confirm the work" helper wording was replaced to avoid implying a required validation action.
- Waiting/Interrupt State copy now clarifies that waiting explains why work is paused and does not replace Work Items / Visit Scope.
- Create Next Service Visit copy now clarifies service-chain continuation, per-visit Work Items, and no automatic copy-forward.
- Invoice language remains downstream: Invoice Charges are billed truth; Work Items are operational scope, not billing records.
- No schema, RLS, lifecycle, billing, payment, estimate, support console, or contractor-authority behavior changed.

Roadmap-forward note:
- Future backlog: Line Item Source Consolidation / Pricebook-style Entry.
- Long-term direction should reduce duplicate/similar line-item entry paths and favor selecting from Pricebook or adding manual line items through the same clean Pricebook-like entry pattern.
- Preserve the boundary between Work Items, Estimate Lines, and Invoice Charges.

Mobile home-screen launch QA checklist (Slice 1):
- [x] Unauthenticated home-screen launch routes cleanly to `/login`.
- [x] Authenticated internal user launch routes correctly to `/ops`.
- [x] Authenticated contractor user launch routes correctly to `/portal`.
- [x] First-owner/admin invite acceptance routing is unchanged (`/set-password?mode=invite` -> `/ops/admin` after anchor checks).
- [x] `/ops` remains reachable and mobile-safe.
- [x] `/jobs/[id]` remains reachable and mobile-safe.
- [x] `/jobs/new` remains reachable and mobile-safe.
- [x] `/calendar` remains reachable and mobile-safe.
- [x] `/portal` remains reachable and mobile-safe.
- [x] `/portal/jobs/[id]` remains reachable and mobile-safe.

Verification notes (2026-05-07, local dev session):
- Browser/mobile-width smoke used `390x844` viewport.
- Verified unauthenticated `/ops` launch redirects to `/login?next=%2Fops`.
- Verified internal authenticated routing to `/ops` and mobile-safe reachability for `/ops`, `/jobs/[id]`, `/jobs/new`, and `/calendar` (no horizontal overflow observed in sampled views).
- Verified first-owner/admin invite continuity by targeted routing tests:
  - `lib/auth/__tests__/first-owner-routing.test.ts` (`7/7`) confirms first-owner marker path resolves to `/ops/admin` after anchor checks and contractor branch remains `/portal`.
  - `lib/auth/__tests__/proxy-public-route.test.ts` (`3/3`) confirms `/set-password` is a public auth route and `/ops` remains protected.
- Contractor-session browser smoke completed (2026-05-07, second local dev session):
  - Authenticated as contractor (Eddie Castellanos Jr): `/portal` rendered correctly — CONTRACTOR PORTAL header, 8 portal jobs, status badges (1 ACTION NEEDED, 3 UPCOMING, 0 ACTIVE WORK, 19 WAITING, 0 PASSED), search field.
  - `/portal/jobs/[id]` rendered correctly — NEEDS CORRECTION badge, Customer/Site Contact, Street View map, Navigate/Open in Maps, Contractor Actions (note, upload, retest), Timeline. Second job confirmed SCHEDULED/Visit booked with contractor notes and timeline.
  - Contractor session did not route to `/ops` — portal scope enforced correctly.
  - All three previously pending checklist items are now closed.


### 2.3.8 Dispatch calendar block edit/delete hardening and production RLS object-drift closeout (resolved)
- Confirmed production incident: calendar block edit showed false success (date unchanged) before app hardening; after app hardening commit `6aa814e`, editing a visible production calendar block showed "That calendar block no longer exists" banner because production `calendar_events_internal_update_scope` UPDATE policy was missing.
- Confirmed production read-only verification:
  - Direct `pg_policies` inspection found `public.calendar_events` had SELECT, INSERT, DELETE policies but no UPDATE policy.
  - Migration history showed `202604041730_calendar_events_block_delete_policy.sql` as applied, yet the UPDATE policy object was absent — confirmed production RLS object drift.
  - Sandbox appeared aligned; object drift was production-specific.
- Confirmed app fix (commit `6aa814e`):
  - `updateCalendarBlockEventFromForm` and `deleteCalendarBlockEventFromForm` now require a returned row `id` via `.select('id').maybeSingle()`.
  - Zero-row update/delete now redirects with `calendar_block_update_missing` / `calendar_block_delete_missing` banner instead of silently claiming success.
  - 9 scope-hardening tests pass; TypeScript check clean.
- Confirmed production RLS fix:
  - Targeted SQL patch applied through Supabase Dashboard SQL Editor, restoring only `calendar_events_internal_update_scope`.
  - No `supabase db push` used. No migration history modified. No support/estimate deferred migrations applied.
- Confirmed Delete Block UI:
  - `deleteCalendarBlockEventFromForm` wired to two-step confirmation control in edit block panel (`components/calendar/calendar-view.tsx`).
  - Native `<details>`/`<summary>` disclosure used for confirmation; no client component introduced.
- Confirmed production smoke passed: mistaken block deleted, date change on remaining block persisted.
- Confirmed no schema migration, RLS model, tenant boundary, or payment behavior changed.
- Pre-launch guardrail added: for production readiness, sample-check critical RLS-controlled tables by direct `pg_policies` inspection, not migration list alone. Migration history entry does not guarantee database object existence.

### 2.3.9 Field notes launch-hardening closeout (resolved)
- Duct leakage required-result validation hardening is complete (`2dd205a`):
  - duct leakage completion now requires `measured_duct_leakage_cfm`
  - server-side completion guard blocks `is_completed = true` when measured value is missing/invalid
  - measured result input has required behavior while Save Draft remains allowed with partial data
  - computed pass/fail and override behavior are unchanged
  - other ECC test types are unchanged
  - validation passed: `npx.cmd tsc --noEmit`, `duct-leakage-required-result.test.ts` (`3/3`), `ecc-save-complete-scope-hardening.test.ts` (`18/18`)
- Notifications richness/presentation/ops alignment is complete:
  - enrichment resilience hardening (`381592b`) and card presentation polish (`38bd4e0`) are complete
  - `/ops` New Work Requests signal family is complete (`d5a31cc`)
  - signal label: `New Work Requests`
  - signal link: `/ops/notifications?view=new_jobs&state=unread`
  - canonical included types: `contractor_intake_proposal_submitted`, `contractor_job_created`
  - email fallback rows (`internal_contractor_intake_proposal_email`, `internal_contractor_job_intake_email`) are deduped behind canonical rows
  - Contractor Updates remains narrow only: `contractor_note`, `contractor_correction_submission`, `contractor_schedule_updated`
  - global ribbon badge remains broad unread awareness
  - `contractor_report_sent` remains excluded from internal notification awareness
  - validation included TypeScript clean, notification/internal-awareness tests, browser smoke for `/ops`, `/ops/notifications`, `view=new_jobs`, `view=contractor_updates`, and mobile-width notification card smoke
- Contractor portal closeout status alignment is complete (`9d51091`):
  - evidence-accepted failed ECC jobs now project contractor-safe wording
  - accepted but not fully closed: `Final processing` / `Accepted by review. Final paperwork is being completed.`
  - accepted and fully closed: `Resolved` / `Accepted by review and closed.`
  - projection uses `failure_resolved_by_correction_review` + `field_complete` + `certs_complete` + `invoice_complete`
  - portal list/detail pass required flags/events into resolver
  - historical failed-test truth remains intact
  - internal lifecycle/ECC evaluator/queue/notification/auth-RLS/schema/authority boundaries remain unchanged
  - validation passed: `npx.cmd tsc --noEmit`, `resolveContractorIssues.test.ts` (`11/11`)
  - contractor-authenticated visual smoke remained pending due to internal-session scope during fix verification
- Explicit non-changes for this field-note closeout batch:
  - no schema changes
  - no migrations
  - no Supabase commands
  - no RLS/auth changes
  - no source-of-truth redesign
  - no queue rewrite
  - no payment/Stripe tenant execution/QBO/Estimates/Support/onboarding behavior changes
- Launch gating posture remains unchanged:
  - controlled tester onboarding remains parked until explicit owner approval after remaining spine review
  - Estimates and Support Console production enablement remain parked behind runbooks
  - tenant customer payment execution remains deferred
  - QBO remains optional/downstream only

### 2.4 First owner onboarding/provisioning readiness
- **V1 implemented and browser-smoked.** Public self-serve signup exists for standard onboarding at `/signup`, and invite-only platform-admin/operator provisioning remains active/manual fallback.
- Confirmed: provisioning script (`scripts/provision-first-owner.ts`) requires explicit allow flags for apply mode; defaults to dry-run.
- Confirmed: provisioning confirms/creates auth user, profile, owner-anchored `internal_users` row, `internal_business_profiles`, `platform_account_entitlements`.
- Confirmed: internal/comped entitlement support is complete for owner-safe accounts.
- Confirmed: production owner account is protected with `entitlement_status = active`, `seat_limit = null`, `notes = internal_comped_v1`, and no Stripe customer/subscription linkage.
- Confirmed: sandbox owner account is aligned to the same protected comped pattern.
- Confirmed: production owner account and Terry are protected under the production account-owner entitlement.
- Confirmed: owner/internal comped accounts are not pushed into Stripe Checkout.
- Confirmed: first-owner marker is durably written to user metadata before invite send.
- Confirmed: first-owner routing seam (`lib/auth/first-owner-routing.ts`) detects marker and confirms all anchor rows before routing; fails closed if any row is missing.
- Confirmed: first owner acceptance (`/set-password?mode=invite`) routes to `/ops/admin`; Admin Center + Account Setup readiness card renders.
- Confirmed: normal internal user routing (`/ops`) and contractor routing (`/portal`) branches are preserved.
- Confirmed: Self-Serve Onboarding V1 functional smoke passed (`/signup` load/submit, invite delivery, set-password/login completion, successful login for fresh email).
- Confirmed: duplicate/existing email public response behavior is intentionally neutral.
- Confirmed: public self-serve signup does not introduce tenant customer/work payment execution, QBO behavior, or RLS model change.
- Confirmed: initial signup first-impression polish is acceptable for current baseline; deeper public-brand polish remains deferred.
- Confirmed: operator runbook path remains active and required for manual/admin fallback onboarding.
- Confirmed: internal/comped owner provisioning remains operator-controlled and is not a public self-serve path.
- **Pre-launch operator runbook item:** before onboarding the first real production account, operator must run dry-run first, verify the intended Supabase project, then run apply with both `ALLOW_FIRST_OWNER_PROVISIONING=true` and `ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true`. Note: the production-flag is also required for any hosted Supabase project (including sandbox) because `.supabase.co` URLs are classified as production-like remote targets.
- Runbook reference: `docs/ACTIVE/First_Owner_Provisioning_Runbook.md`.

### 2.5 Admin readiness checklist confirmation
- Confirm Admin Readiness / Setup Checklist V1 is present and working on `/ops/admin` and contextually visible on `/ops/admin/company-profile`.
- Confirm readiness packaging remains read-only derived state from existing tenant/account sources (no new readiness truth table).
- Confirm required criteria and optional criteria render separately with clear setup guidance.
- Confirmed: setup-progress timestamps were added at `internal_business_profiles.profile_reviewed_at` and `internal_business_profiles.team_reviewed_at`, and applied in sandbox and production.
- Confirmed: readiness now separates provisioning-created foundation rows from user-completed onboarding actions.
- Confirmed: a newly provisioned standard account first login shows `0 of 5 complete`, not a misleading `5 of 5 complete`.
- Confirmed: saving company profile marks the profile-related readiness steps complete.
- Confirmed: confirming team setup marks the team step complete.
- Confirmed: production browser verification showed the newest account at `0 of 5` on first login.
- Confirmed: `/ops/admin/internal-users` launch cleanup removed/hid the `Link existing auth user` panel from the normal admin page while preserving Invite teammate, team setup confirmation, and the team member list.
- Closeout clarification: this roadmap area is closed at the current baseline, but readiness and first-owner provisioning remain required pre-launch verification/runbook checks.

### 2.6 Launch billing decision (confirmed)
- V1/live launch uses a flat platform account subscription with unlimited users.
- Active user count remains visible.
- Per-seat billing remains a desired later track, but is not enforced in V1/live launch.
- Future per-seat work should include seat-limit enforcement, Stripe quantity sync, proration handling, and customer portal quantity rules.

### 2.6.1 Operational entitlement mutation guard rollout closeout (production-promoted)
- Confirmed: operational entitlement mutation guard rollout is complete through Slice 16C and is production-promoted on `main` at commit `bf38eca`.
- Confirmed: full validation passed â€” 89 test files, 1057 tests, TSC_OK.
- Confirmed: production smoke passed.
- Confirmed: two test-only mock repairs committed during main validation (`job-ops-waiting-state.test.ts`, `service-case-reconciliation-wiring.test.ts`); no product behavior change.
- Confirmed guarded operational mutation families:
  - internal job creation/intake
  - job ops/scheduling/contact
  - closeout/completion
  - internal invoices/invoice lines/manual payment tracking
  - notes
  - calendar block events
  - contractor report preview/send
  - attachments
  - equipment/systems
  - ECC test-run/test-data
  - staffing/assignment/contractor relink
  - remaining job-detail operations
  - contractor intake adjudication
  - customer/profile mutations
  - contractor directory/admin mutations
  - Pricebook mutations
- Confirmed server-side entitlement result:
  - active entitlement is allowed
  - valid trial is allowed
  - internal/comped accounts are allowed
  - expired trial is blocked before writes/side effects
  - null-ended trial is blocked before writes/side effects
  - missing entitlement is blocked before writes/side effects
- Confirmed intentionally accessible setup/recovery/admin paths remain outside internal operational entitlement gating:
  - company profile
  - team setup
  - internal user/admin invite and password recovery
  - billing/setup recovery
  - notification read-state
- Confirmed: external contractor onboarding/invite acceptance remains outside internal operational entitlement gating.
- Confirmed: `createJob` remains a low-level helper only; active entrypoints are guarded.
- Confirmed: `lib/actions/intake-actions.ts` remains dormant legacy and is a later cleanup/retirement candidate.
- Confirmed: no Stripe tenant customer/work payment execution was introduced by this rollout.
- Confirmed: no QBO behavior was introduced by this rollout.
- Confirmed: no schema migration or Supabase data change was part of this rollout.
- Remaining: dormant legacy `lib/actions/intake-actions.ts` cleanup is a later candidate only; no immediate action required.

### 2.7 Pricebook invoice-line sourcing promotion confirmation (C1B/C1C)
- Completed: Pricebook C1B/C1C invoice-line sourcing promotion is production-promoted and production-smoke confirmed.
- Completed verification on promoted behavior:
  - active nonnegative items are selectable
  - inactive items are not selectable
  - negative/default-credit items are blocked/deferred
- Completed verification of frozen invoice-line snapshot/provenance fields for Pricebook-backed adds:
  - `source_kind`
  - `source_pricebook_item_id`
  - `category_snapshot`
  - `unit_label_snapshot`
- Completed verification that manual invoice line add/edit/remove flow remains intact after Pricebook-backed adds.
- Completed verification that issued/void invoices remain non-editable for Pricebook add controls.
- Completed verification that wording remains honest and does not imply live payment execution.
- Deferred policy remains unchanged: negative/default-credit adjustments remain blocked/deferred pending a separate adjustment/credit policy track.
- Payment execution remains deferred; tenant customer card/checkout charging is not part of this closeout.

### 2.8 Pricebook starter seeding promotion confirmation (D2C-3/D2C-4)
- Completed: D2C-3/D2C-4 are production-promoted.
  - D2C-3: starter seed helper foundation
  - D2C-4: first-owner provisioning integration + structured operator output
- Completed: production dry-run smoke confirmed `pricebookSeeding` output shape.
  - top-level mode was `dry_run`
  - `pricebookSeeding` preview returned the V1 starter set (`inserted_count = 12`, `skipped_count = 0`)
  - errors were empty and invite send was false
- Confirmed: no apply/write/invite action occurred during smoke.
- Before onboarding first real production accounts, operators must:
  - run dry-run first
  - verify production project ref before each run
  - confirm `pricebookSeeding` preview output is present and sane
  - run apply only when intentionally provisioning a real account

### 2.9 Pricebook controlled-options refinement promotion confirmation (D3B)
- Completed: D3B controlled-options refinement is production-promoted on `main` (merge `58dcb31`, change `3084906`).
- Completed: controlled options were refined in code/test only:
  - `lib/business/pricebook-options.ts`
  - `lib/business/__tests__/pricebook-options.test.ts`
- Completed: controlled option refinement for Pricebook includes:
  - categories added: `Electrical`, `Compliance Docs`
  - unit labels added: `trip`, `doc`
  - Pricebook controlled unit label removed: `cfm`
- Confirmed: CFM remains valid in ECC/airflow/testing contexts; this promotion did not alter ECC/workflow logic.
- Confirmed: no schema migration, Supabase command, or DB write action occurred for this promotion.
- Confirmed: no invoice/payment/Stripe/QBO/Visit Scope/service workflow behavior changed.
- Confirmed: Starter Kit V2 content was not implemented by D3B and was implemented later by V2A/V2B.

### 2.10 Pricebook Starter Kit V2A/V2B promotion confirmation
- Completed: V2A/V2B are production-promoted on `main`.
  - V2A: Starter Kit V2 seed definitions added (`23` rows total, `21` active, `2` inactive/deferred)
  - V2B: explicit provisioning selector wiring added for Starter Kit `v1|v2`
- Completed: default first-owner dry-run path still resolves to Starter Kit `v1` when selector is omitted.
- Completed: explicit `--starter-kit-version v2` dry-run path returns V2 preview (`23` rows) with selector metadata.
- Completed: invalid selector values (for example `v3`) are rejected clearly before provisioning execution.
- Completed: no provisioning apply/backfill action occurred during promotion verification.
- Completed: no payment behavior changed by V2A/V2B promotion.
- Completed: no migration, Supabase command, or production data action occurred as part of V2A/V2B promotion.

### 2.11 Visit Scope -> invoice bridge promotion confirmation (A1-A5)
- Completed: A1-A5 Visit Scope -> invoice bridge stack is production-promoted on `main`.
- Completed: production migration `20260428113000_internal_invoice_line_items_visit_scope_provenance_v1.sql` was applied and migration list sync was confirmed.
- Completed: promotion validation passed before and after merge:
  - targeted suite: 37 tests passed
  - `npx tsc --noEmit` passed
- Completed: broader smoke coverage confirmed the production-intent behavior set:
  - Service intake rejects summary-only scope
  - Service intake succeeds with at least one structured Visit Scope item
  - ECC optional scope remains lightweight/optional
  - ECC companion scope remains allowed
  - Build Invoice from Visit Scope adds draft line items at qty `1.00` / unit `$0.00`
  - Already-added state prevents duplicate scope-item adds
  - manual draft invoice line add still works
  - Pricebook draft invoice line add still works
  - issued/void invoice states keep builder/edit controls hidden
  - invoice/payment wording remains tracking-only and does not imply live charging
- Before launch (post-deploy), operators should verify this path in production UI:
  - Service intake structured-scope requirement
  - ECC optional scope behavior
  - Build Invoice from Visit Scope draft builder
  - manual + Pricebook invoice add coexistence
  - issued/void invoice lock behavior

### 2.12 Pricebook existing-account Starter Kit V2 backfill tooling promotion confirmation (V2C-1/V2C-2/V2C-3)
- Completed: V2C-1/V2C-2/V2C-3 are production-promoted on `main` (commit `4ead046`).
  - V2C-1: dry-run planner helper promoted
  - V2C-2: apply helper promoted (requires explicit `confirmApply: true`; collision-blocking is default)
  - V2C-3: CLI wrapper (`scripts/backfill-pricebook-starter-kit.ts`) promoted
- Completed: promotion validation passed before and after merge:
  - 86 tests passed (64 pricebook-seeding + 22 backfill CLI)
  - `npx tsc --noEmit` passed
- Confirmed: no Supabase command, migration, provisioning apply, backfill run against real data, or production data action occurred as part of V2C promotion.
- Confirmed: backfill is not automatic; no production account has been backfilled.
- Confirmed: CLI defaults to dry-run; apply requires explicit `--apply` flag.
- Confirmed: insert-only behavior; existing rows are never updated or mutated.
- Confirmed: hosted/production-like targets require both `ALLOW_FIRST_OWNER_PROVISIONING=true` and `ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true` before dry-run or apply.
- Confirmed: invoice snapshots, historical invoices, payments, Stripe, QBO, Visit Scope, and service workflow behavior are unchanged.
- Pre-launch operator verification item: before any real account backfill, operator must run dry-run only against the intended target, review the full plan output, and confirm `would_insert_count` and collision output are sane before any apply.
- Runbook reference: `docs/ACTIVE/First_Owner_Provisioning_Runbook.md` (Section 10).

### 2.13 Pricebook/Admin visibility polish promotion confirmation (P1)
- Completed: Pricebook/Admin Polish P1 is production-promoted on `main` (commit `aecb735`).
- Completed: admin Pricebook screen smoke confirms clarity-focused UI labels/chips for normal users:
  - Starter
  - Custom
  - Active
  - Inactive
  - Deferred placeholder (where applicable)
- Completed: filter/chip language is consolidated for normal admin clarity and no longer exposes V1/V2 terminology on the page.
- Completed: promotion validation passed:
  - `npx tsc --noEmit` passed
  - Pricebook test suites passed (`lib/business/__tests__/pricebook-options.test.ts`, `lib/business/__tests__/pricebook-seeding.test.ts`)
  - total passed: 69 tests
- Confirmed: no Supabase command, migration, provisioning apply, or backfill run occurred as part of P1 promotion.
- Confirmed: no business/seed/backfill behavior changed by P1; this promotion is UI/read-only clarity polish.

### 2.14 Pricebook/Admin usability polish promotion confirmation (P2)
- Completed: Pricebook/Admin Polish P2 is production-promoted on `main` (commit `a97c764`).
- Completed: catalog management usability improvements confirmed:
  - add item form is clearer with helper copy explaining reusable catalog item purpose and future-selection-only impact
  - edit fields disclosure clearly labeled "Edit fields" with improved form layout and spacing
  - price and unit display now grouped in single table column for easier scanning
  - activate/deactivate buttons now color-coded (red for deactivating, green for activating) with helper text clarifying:
    - deactivation prevents future selection and does not mutate historical invoices
    - activation enables item in future selections
  - empty state messaging clarified with actionable guidance
- Completed: P1 clarity fully preserved for normal admin users:
  - Starter/Custom source identification remains clear
  - Active/Inactive status remains clear
  - Deferred placeholder status remains clear where applicable
- Completed: V1/V2 terminology remains intentionally hidden from normal admin-facing page and labels.
- Completed: promotion validation passed:
  - `npx tsc --noEmit` passed
  - Pricebook test suites passed (69 tests total)
    - `lib/business/__tests__/pricebook-options.test.ts`: 5 tests
    - `lib/business/__tests__/pricebook-seeding.test.ts`: 64 tests
- Confirmed: no Supabase command, migration, provisioning apply, or backfill run occurred as part of P2 promotion.
- Confirmed: no business logic, seed definitions, or backfill behavior changed by P2; this promotion is UI/usability polish only.
- Confirmed: admin UI backfill controls remain future work; operator-run tooling boundary is unchanged.
- Confirmed: no invoice/payment/Stripe/QBO/Visit Scope/service workflow behavior changed by P2.

### 2.15 Starter Kit V3 default adoption promotion confirmation
- Completed: Starter Kit V3 promotion is confirmed on `main` (commits `28cc757`, `b31d433`) with prior P2 cleanup commit `987af81` in the same promoted stack.
- Completed: first-owner provisioning default changed from starter kit `v1` to starter kit `v3` when selector is omitted.
- Completed: explicit starter kit selectors remain preserved (`v1`, `v2`, `v3`) and invalid values still fail closed.
- Completed: promoted V3 catalog baseline is confirmed:
  - `seed_count = 97`
  - `active_seed_count = 91`
  - `inactive_seed_count = 6`
  - refrigerant coverage includes `R-410A`, `R-454B`, `R-32`
- Completed: promotion validation passed:
  - `npx tsc --noEmit` passed
  - 5-file validation suite passed (`140` tests)
- Confirmed: no Supabase command, migration, provisioning apply, backfill run against real data, or production data action occurred during promotion.
- Confirmed: existing-account backfill remains operator-controlled and dry-run-first; no account has been backfilled as part of V3 default adoption.
- Pre-launch operator requirement: before onboarding the first real account on this baseline, verify dry-run preview output shows V3 starter metadata and sane row counts.

### 2.16 Pricebook V3 sandbox backfill + Admin P3 closeout confirmation
- Completed: safe-equivalent existing-account backfill tooling is production-promoted on `main` (commit `41d5dae`).
- Completed: controlled sandbox existing-account V3 backfill apply succeeded for account owner `6e93b2f7-1509-4a39-87e5-6558497f2157`.
- Completed verification:
  - pre-apply dry-run: `seed_count = 97`, `would_insert_count = 96`, `would_skip_existing_equivalent_count = 1`, `possible_collision_count = 0`, `errors = []`
  - apply result: `inserted_count = 96`, `skipped_existing_equivalent_count = 1`, `possible_collision_count = 0`, `errors = []`
  - post-apply dry-run: `would_insert_count = 0`, `would_skip_existing_seed_key_count = 96`, `would_skip_existing_equivalent_count = 1`, `possible_collision_count = 0`, `errors = []`
- Completed: existing V1 `R-410A` row was not duplicated.
- Completed: sandbox Pricebook UI now shows `109` items.
- Completed: Pricebook/Admin P3 usability promotion is on `main` (commit `4446af3`) with Search Pricebook, category filter, clear filters, filtered counts, and filtered empty state.
- Completed: validation passed for both promotion slices (`npx tsc --noEmit`; targeted Pricebook suites).
- Confirmed: no production data was touched for this closeout.
- Confirmed: no Supabase command, migration, provisioning apply, or backfill batch/automatic run occurred.
- Pre-launch operator note: before any additional production existing-account backfill, run dry-run first and verify inserts/skips/equivalents/collisions are sane before any apply.

### 2.17 Pricebook V3 production existing-account backfill verification confirmation
- Completed: production existing-account Starter Kit V3 verification is complete for owner account `93dd810e-3c0c-4b69-9dae-edfa0e481dbb` on host `ornrnvxtwwtulohqwxop.supabase.co`.
- Completed: production owner-account Pricebook count is verified at `108` items.
- Completed: production terminal dry-run state is verified:
  - `would_insert_count = 0`
  - `would_skip_existing_seed_key_count = 96`
  - `would_skip_existing_equivalent_count = 1`
  - `possible_collision_count = 0`
  - `errors = 0`
- Completed: R-410A non-duplication is verified:
  - `Refrigerant R-410A (per lb)` count = `1`
  - legacy V1 `R-410A` remains the safe equivalent skip row
- Confirmed: no Supabase CLI command, migration, provisioning apply, schema change, code change, file change, push, or commit occurred during final verification.
- Confirmed: production data was already in post-apply terminal state when final verification was executed.
- Security follow-up preserved:
  - previously exposed legacy production service_role key was rotated
  - new Supabase secret key is in use
  - Vercel `SUPABASE_SERVICE_ROLE_KEY` was updated as Sensitive
  - production was redeployed and smoke tested successfully
  - terminal sessions were closed
- Deferred hardening item (still required): migrate away from legacy JWT anon/service_role key usage before disabling JWT-based API keys.

### 2.18 Service workflow refinement baseline confirmation (completed)
- Completed: Service Waiting State V1 is complete as a no-schema implementation.
- Completed: Create Next Service Visit restoration/confirmation is complete.
- Completed validation:
  - waiting-state tests passed: 10/10
  - legacy job-detail hardening tests passed: 9/9
  - `npx tsc --noEmit` passed silently
- Confirmed: no schema changes, no migrations, no Supabase commands, and no production-data actions were part of this slice.
- Confirmed: no Pricebook, invoice, payment, Stripe, ECC/retest, contractor-authority, Visit Scope copy-forward, estimate implementation, or parts-inventory behavior changes were part of this slice.

### 2.19 Service workflow refinement V1 baseline promotion confirmation
- Completed: Service Case Reconciliation V1 is complete and production-promoted on `main` (commit `e3beda5`).
  - Centralized `reconcileServiceCaseStatusAfterJobChange` helper is wired into closeout and Create Next Service Visit write paths.
  - Active linked visit keeps/reopens case open; all-terminal linked visits resolve case.
  - `job_events` write for reconciliation events is intentionally deferred.
- Completed: Interrupt/Waiting State V1 is complete.
  - Pending Info (clear: Mark Info Received), On Hold (clear: Resume Job), Waiting (clear: Mark Ready to Continue).
  - Supported waiting reasons: Waiting on part, Waiting on customer approval, Estimate needed, Waiting on access, Waiting on information, Other.
  - Job-level only; no service-case-level global blocker orchestration.
  - No auto-clear on Create Next Service Visit; explicit/manual release required.
- Completed: Create Next Service Visit is complete (foundation only).
  - Internal users can create a next visit under the same service case.
  - No auto-release, no parts inventory, no estimate automation, no Visit Scope copy-forward.
- Completed: Reporting cleanup is complete.
  - Dashboard and report drilldown alignment done.
  - Jobs Report assignment filter (All/Unassigned/specific user) is complete and production-promoted on `main` (commit `422bb9d`).
  - Jobs Report now includes `contractor_id = null` same-account customer-owned jobs; cross-account null-contractor jobs remain excluded; contractor filter remains contractor-only for safety.
  - Service Cases Report Latest Visit display is clarity-only polish; no model change.
  - Remaining report work is visual/card polish only; data alignment is complete.
- Confirmed: no schema changes, no migrations, no Supabase commands, and no production data actions were part of this baseline.
- Confirmed: no Pricebook, invoice, payment, Stripe, QBO, ECC/retest rules, contractor authority, Visit Scope behavior, assignment behavior, scheduling behavior, service-case lifecycle code outside the reconciliation helper, or job creation behavior changed.

### 2.20 Estimates / Quoting V1A-V1J guarded internal baseline confirmation
- Completed: Estimates/Quoting V1A-V1J is implemented to the current guarded internal baseline.
- Completed: V1A schema/domain foundation is implemented (commit `a200a17`; migration `20260501140000_estimates_v1a_schema_domain.sql`).
- Completed: V1B internal create/read/line server actions are implemented.
- Completed: V1C internal UI is implemented for `/estimates`, `/estimates/new`, and `/estimates/[id]` with draft creation plus manual line add/remove.
- Completed: fail-closed `ENABLE_ESTIMATES` guard is implemented.
- Completed: V1D draft-only Pricebook-backed estimate line picker is implemented on estimate detail.
- Completed: manual estimate line add/remove remains intact alongside Pricebook-backed add/remove.
- Completed: server-owned frozen snapshots/provenance (`source_pricebook_item_id` and related snapshot fields), subtotal/total recomputation, and estimate create/line-change events (where implemented) are confirmed.
- Completed: V1E internal-only status transitions are implemented:
  - `draft -> sent`
  - `sent -> approved`
  - `sent -> declined`
  - `sent -> expired`
  - `draft -> cancelled`
  - `sent -> cancelled`
- Completed: V1E terminal statuses cannot transition further.
- Completed: V1E transition events include `previous_status` and `next_status`.
- Completed: V1E sets status timestamps on transition (`sent_at`, `approved_at`, `declined_at`, `expired_at`, `cancelled_at`).
- Completed: line editing remains draft-only and line-edit controls are hidden after `sent`.
- Completed: V1F internal-only hardening/operator polish is implemented:
  - status transition confirmation wording is clearer
  - terminal/destructive actions use stronger confirmation copy
  - status panel wording is clearer for draft, sent, and terminal states
  - operator-facing non-goals are stated directly in the UI (`sent` does not send email/PDF; `approved` does not create job/invoice/payment/conversion/customer approval records)
  - activity feed readability is improved with human-readable labels and transition summaries such as `Draft -> Sent` and `Sent -> Approved`
  - Back to Estimates navigation polish is present on detail pages
  - `/ops?notice=estimates_unavailable` now shows a small internal-safe notice
- Completed: V1G internal-only presentation and print-readiness polish is implemented:
  - estimate detail scan hierarchy/readability is improved for estimate number, status, customer/location context, totals, and line items
  - browser print layout is improved for internal estimate document review
  - explicit commercial boundary wording is present so `sent` means internal status change only and `approved` means internal outcome only
  - future-send placeholder wording is explicit: `Estimate sending is not enabled yet.` and `No email or PDF is generated from this action.`
  - communication history placeholder is read-only with no delivery-tracking claim
- Completed: V1H internal-only estimate communication/send-attempt foundation is implemented:
  - `estimate_communications` table is introduced as send-attempt/communication truth
  - internal send-attempt action is implemented with fail-closed `ENABLE_ESTIMATE_EMAIL_SEND`
  - blocked attempts are recorded when send flag is off
  - draft/sent estimate detail includes send-attempt UI and communication history
  - activity feed readability includes `estimate_send_attempted`
  - no send action is exposed on terminal estimate statuses
- Completed: V1I decision artifact is documented as planning-only (no implementation changes):
  - Option B first: generated document/PDF strategy planning before real provider enablement
  - Option A later: sandbox-only real provider enablement after document/wording go/no-go gates are satisfied
- Completed: V1I go/no-go gates are documented for future sandbox-only email enablement:
  - approved document wording
  - approved branding/header/footer
  - recipient confirmation UX reviewed
  - communication history wording approved
  - sandbox-only send smoke plan written
  - fail-closed rollback validated
- Completed: V1I go/no-go gates are documented for future PDF generation/storage:
  - canonical content model
  - freeze/version semantics
  - generation trigger
  - internal access boundaries
  - retention/storage policy
  - no portal/public exposure
- Completed: V1J internal document-template/readiness implementation is documented and verified:
  - canonical estimate document view model/helper is implemented
  - centralized estimate disclaimer package is implemented
  - revision semantics planning constants are implemented (future freeze at send-attempt creation, immutable historical revisions, post-freeze edits require a new revision)
  - estimate detail readiness section is wired to shared document helper
  - print/readiness wording consistency uses shared document model
  - no persistent revision storage is implemented yet
  - no PDF generation/storage is implemented yet
- Completed: Estimate Detail Wording + Internal Scaffolding Collapse is implemented and verified on estimate detail.
  - readiness/disclaimer content is collapsed under `Internal Readiness Notes` by default, while full readiness and boundary language remains available when expanded
  - `Mark Sent` is now labeled `Mark Sent Manually`
  - `Mark Sent Manually` helper copy now explicitly states lifecycle/status-only behavior with no email/PDF send side effect
  - `Send Estimate` remains communication-attempt wording only
  - send helper copy now explicitly states communication-attempt logging does not change estimate lifecycle status
- Completed: Estimate Pricebook Editable Defaults V1 is implemented and verified on estimate draft Add from Pricebook.
  - selecting a Pricebook item now prefills editable estimate line fields for item name, description, item type, category, unit label, quantity, and unit price
  - users can edit the prefilled values before add
  - added estimate line snapshots now use edited submitted values
  - Pricebook provenance is preserved via `source_pricebook_item_id`
  - no post-add estimate line editor was introduced
  - manual estimate line add and draft remove remain working
  - sent/non-draft estimate lock behavior remains unchanged
  - no invoice or Visit Scope behavior changed
- Completed: Work Item-first Invoice Builder Clarity V1 is implemented and verified on draft internal invoice panel.
  - `Build Invoice Charges from Work Items` is now presented as the recommended path when Work Items are available
  - helper copy now states operators should start from Work Items already captured for the visit
  - helper copy now states imported items become draft Invoice Charges for review/edit before issue
  - boundary copy now explicitly states Work Items remain operational record while Invoice Charges remain billed copy
  - `Add From Pricebook` remains available as a secondary/fallback path
  - no action/payload or behavior changes were introduced for Work Item import, Pricebook add, manual line handling, or issue/send/payment flows
- Completed: Work Item Import Defaults Clarification V1 is implemented and verified on draft internal invoice panel (`8f79e07`).
  - helper copy now explicitly states the current conservative defaults for imported Work Items
  - exact copy added: `Imported Work Items start as draft Invoice Charges with Qty 1.00 and Unit Price $0.00. Review and edit pricing before issuing.`
  - Work Item-first billing flow is reinforced: Work Items remain the operational work record, imported Work Items become draft Invoice Charges, and Invoice Charges remain reviewed/edited billed copies before issue
  - no smarter pricing was introduced
  - no Pricebook text matching was introduced
  - no persisted Work Item provenance fields were added
  - no server-action behavior changed
  - no payloads or hidden fields changed
  - no import default values changed
  - no schema/migration/Supabase/production-data/RLS/policy/auth/feature-flag/issue-send/payment/Visit Scope/Pricebook/estimate/Stripe tenant payment/QBO behavior changed
  - validation passed: `npx.cmd tsc --noEmit`; targeted tests (`2` files / `24` tests); browser smoke confirmed helper copy visibility, successful Work Item import, unchanged qty `1.00` and unit price `$0.00` defaults, editability preserved, and unchanged issue gate/issue behavior
- Completed: Invoice Panel Hierarchy Polish V1 is implemented and verified on draft internal invoice panel (`2cc5d58`).
  - draft invoice builder now visually matches the Work Item-first billing model
  - Work Item import now appears before `Add From Pricebook`
  - Work Item import remains the clear recommended path
  - `Add From Pricebook` now reads as a fallback path for charges not already captured as Work Items
  - manual `+ Add Charge` now reads as an exception/fallback path
  - flow reinforcement is explicit: Work Items first, Pricebook fallback, manual exception path
  - Work Items remain the operational work record; Invoice Charges remain reviewed billed copies used for the invoice
  - no server-action/payload/hidden-field/import-default/pricing/schema/migration/Supabase/production-data/RLS/policy/auth/feature-flag/issue-send-payment/Visit Scope/Pricebook/estimate/Stripe tenant payment/QBO behavior changed
  - no smarter pricing, no Pricebook text matching, and no persisted Work Item provenance fields were introduced
  - validation passed: `npx.cmd tsc --noEmit`; targeted tests (`2` files / `24` tests); browser smoke confirmed Work Item import order/recommended emphasis, Pricebook fallback wording, manual exception/fallback wording, unchanged Qty `1.00` + Unit Price `$0.00` import defaults, unchanged editability, unchanged direct Pricebook add/manual add success, and unchanged issue gate behavior
- Completed: Work Item-first Flow Copy Density Polish V1 is implemented and verified as a tiny copy/layout-only pass.
  - invoice/work-item helper language is now less technical and more field-service friendly
  - Work Item path remains primary
  - Pricebook remains fallback
  - manual add remains exception/fresh-charge path
  - imported Work Items still become draft charges reviewed before issue
  - explicit non-changes held: no server-action/payload/hidden-field/import-default/pricing/schema/migration/Supabase/production-data/RLS/policy/auth/feature-flag/issue-send-payment/Visit Scope/Pricebook/estimate/Stripe tenant payment/QBO behavior changes; no automatic pricing; no persisted provenance changes
  - validation passed: `npx.cmd tsc --noEmit`; targeted tests (`2` files / `24` tests); browser smoke confirmed desktop and narrow/mobile-ish render, no horizontal overflow on inspected invoice surface, Work Item path/fallback/manual sections and imported rows still rendered, and no behavior drift
- Future end-of-road UX review note (deferred, not current implementation): if job detail remains too dense after broader completion, evaluate a job-owned billing workspace such as `/jobs/[id]/billing` or `/jobs/[id]/invoice` while preserving job context, Work Item import behavior, issue/send/payment boundaries, permissions, source-of-truth ownership, and existing invoice components where practical.
- Completed: Pricebook-assisted Work Item Creation V1 is implemented and verified (`6145f16`).
  - Work Item builder now includes optional `Start from Pricebook template` assist.
  - Template selection prefills Work Item `title` from Pricebook `item_name` and Work Item `details` from Pricebook `default_description`.
  - Prefill behavior is create-or-prefill: fills existing blank Work Item when available, otherwise creates a new row within existing limits.
  - Work Items remain fully editable after template prefill.
  - Work Items continue saving through existing `visit_scope_items_json` payload.
  - Assist is available in both intake and job-detail Work Item editing.
  - Work Item-first boundary is reinforced: Pricebook helps start operational work records; Invoice Charges remain reviewed billed copies created later.
  - Guardrails held:
    - no schema or migration change
    - no Supabase command or production data action
    - no RLS/policy/auth or feature-flag change
    - no persisted Work Item provenance fields
    - no persisted Pricebook id/price/category/unit label/billing type on Work Items
    - no server-action behavior expansion beyond existing Work Item JSON submission
    - no invoice/payment/estimate/Stripe tenant payment/QBO behavior change
- Completed: Shared Pricebook Entry UI Primitive V1 closeout is confirmed for current internal estimate/invoice drafting continuity.
  - estimate draft line entry and draft invoice line entry now use the same clean Pricebook-style entry pattern for reusable selection and manual line entry
  - this is UI consolidation only; schema, migrations, RLS/policy, server ownership, estimate lifecycle truth, invoice immutability, Visit Scope ownership, payment behavior, and production estimate gating are unchanged
- Completed validation (V1J baseline): `npx vitest run lib/estimates` passed (`123/123`), `npx tsc --noEmit` passed (`TSC_OK`).
- Completed validation (Estimate Detail Wording + Internal Scaffolding Collapse): `npx.cmd tsc --noEmit` passed; `npx.cmd vitest run lib/estimates` passed (`7` files / `127` tests).
- Completed validation (Estimate Pricebook Editable Defaults V1): `npx.cmd tsc --noEmit` passed; `npx.cmd vitest run lib/estimates` passed (`7` files / `127` tests).
- Completed validation (Work Item-first Invoice Builder Clarity V1): `npx.cmd tsc --noEmit` passed; targeted tests passed (`npx.cmd vitest run lib/actions/__tests__/internal-invoice-pricebook-line-actions.test.ts lib/business/__tests__/internal-invoice-line-items-provenance.test.ts` = `2` files / `24` tests).
- Completed validation (Pricebook-assisted Work Item Creation V1): `npx.cmd tsc --noEmit` passed; targeted tests passed (`npx.cmd vitest run lib/jobs/__tests__/visit-scope.test.ts lib/actions/__tests__/job-intake-create-scope-hardening.test.ts lib/actions/__tests__/internal-invoice-pricebook-line-actions.test.ts lib/actions/__tests__/internal-invoice-scope-hardening.test.ts` = `4` files / `76` tests).
- Completed validation (Shared Pricebook Entry UI Primitive V1 closeout): targeted validation passed and no new production/runbook/payment boundary was introduced.
- Completed production readiness hardening guard: `createEstimateDraft` in `lib/estimates/estimate-actions.ts` now returns `{ success: false, error: "Estimates are currently unavailable." }` as the first statement when `ENABLE_ESTIMATES` is false or unset, running before `createClient`/auth/DB work. This was the sole identified pre-production code blocker from the readiness audit.
- Completed production readiness hardening validation: `npx vitest run lib/estimates` passed (`127/127`), `npx tsc --noEmit` passed (`TSC_OK`). Tests confirm flag-off returns unavailable with no DB insert, no estimate_events insert, and flag-on valid create still passing. No migrations, Supabase commands, production data, email sends, feature flag enables, RLS/policy changes, or PDF/storage/customer/public/payment/conversion behavior were introduced.
- Completed: internal-only production execution runbook is hardened and committed (`df9870f`) at `docs/ACTIVE/Estimates_Production_Enablement_Runbook.md`; this remains planning/runbook readiness only and did not execute migrations, flags, or production enablement.
- Completed manual sandbox smoke: sent, approved, and draft estimate detail checks all passed. Draft-detail smoke is now completed/closed using sandbox draft `EST-20260502-9D58499B` (`/estimates/43aeaa8e-e60e-47d4-8c26-2570600b24df`) with document readiness/disclaimer rendering, draft manual-line editing, draft pricebook picker availability, blocked send copy, communication history rendering, and no email/PDF/customer approval/public link/conversion/payment/customer portal/contractor controls exposed.
- Completed authenticated smoke (estimate detail wording/internal scaffolding closeout):
  - Internal Readiness Notes is collapsed by default
  - readiness/boundary language remains available when expanded
  - blocked `Record Send Attempt` writes communication truth while lifecycle status remained `Draft`
  - `Mark Sent Manually` transitioned lifecycle `Draft -> Sent`
  - no customer approval, PDF, conversion, payment/deposit, or live-email behavior surfaced
- Completed authenticated sandbox smoke (Estimate Pricebook Editable Defaults V1):
  - Pricebook item selected in draft estimate Add from Pricebook
  - editable fields prefilled
  - item name, description, quantity, and unit price edited before add
  - added line displayed edited submitted values
  - manual line add still worked
  - draft remove still worked
  - sent estimate remained locked
  - no invoice, payment, conversion, approval, PDF, or live-email behavior appeared
- Completed browser smoke (Work Item-first Invoice Builder Clarity V1):
  - create draft invoice worked
  - add selected Work Items worked
  - imported Work Item appeared and was marked `Already added`
  - Add From Pricebook still worked
  - manual add/edit/remove still worked
  - save charge worked
  - remove charge worked
  - no persistent feature breakage observed
  - transient dev-session navigation/request churn was observed and not treated as a blocker for this copy/UX slice
- Completed browser smoke (Pricebook-assisted Work Item Creation V1):
  - intake flow rendered `Start from Pricebook template`
  - selected `Airflow Diagnostic` template
  - Work Item title/details prefilled from template defaults
  - title/details were edited and saved through job creation
  - edited Work Item appeared on job detail
  - job-detail Edit Work Items also supported template assist
  - selected `Service Call` template and saved a second Work Item
  - created draft invoice successfully
  - imported Work Items into draft Invoice Charges successfully
  - imported charge remained editable
  - direct `Add Pricebook Item` invoice path still worked
  - no invoice/payment/estimate/conversion behavior drift observed
- Confirmed: estimate migrations are applied to sandbox only (`20260501140000_estimates_v1a_schema_domain.sql`, `20260502120000_estimate_communications_v1h.sql`).
- Confirmed: sandbox project ref is `kvpesjdukqwwlgpkzfjm`.
- Confirmed: production estimate migrations are not applied.
- Confirmed: production `ENABLE_ESTIMATES` remains unset/false.
- Confirmed: production `ENABLE_ESTIMATE_EMAIL_SEND` remains unset/false.
- Confirmed: production `/estimates` redirects to `/ops?notice=estimates_unavailable` when disabled.
- Confirmed: estimates nav remains hidden in production while `ENABLE_ESTIMATES` is disabled.
- Confirmed: estimates are not production-live.
- Confirmed source-of-truth boundaries remain locked:
  - `estimate_events` = lifecycle/operator audit truth
  - `estimate_communications` = send-attempt/communication truth
  - Estimate = proposed commercial scope
  - Visit Scope = operational work scope
  - Invoice = billed commercial scope
  - Payment = collected truth only where implemented
  - Pricebook = reusable catalog/default pricing truth
- Confirmed explicit non-goals remain deferred:
  - real outbound production estimate email
  - customer approval
  - customer e-signature
  - customer portal estimate visibility
  - public estimate links/tokens
  - contractor visibility/authority
  - PDF generation
  - PDF storage
  - persistent revision storage
  - estimate-to-job conversion
  - estimate-to-invoice conversion
  - payment/deposit
  - Stripe tenant payment behavior
  - QBO behavior
  - production estimate feature enablement
- Production rollout remains a later explicit decision. The sole pre-production code blocker (missing `createEstimateDraft` flag guard) is now resolved and committed.
- Internal-only production enablement requires, in order:
  - governance preflight (Phase A of runbook)
  - sandbox pre-validation with both migrations confirmed healthy (Phase B)
  - intentional production migration apply for both estimate migrations (Phase C)
  - disabled-state smoke confirmation with schema applied and flag still off (Phase D)
  - production `ENABLE_ESTIMATES` enablement for internal-only slice only (Phase E)
  - internal-only production smoke checklist (Phase F)
  - rollback by disabling `ENABLE_ESTIMATES` if needed (Phase G)
- Production `ENABLE_ESTIMATE_EMAIL_SEND` must remain unset/false for the internal-only slice. Real outbound estimate email requires a separate email-enablement runbook after all V1I go/no-go gates are satisfied.
- Full procedure is documented in the hardened committed runbook (`df9870f`) at `docs/ACTIVE/Estimates_Production_Enablement_Runbook.md`; next step remains a future explicit production execution decision, not automatic enablement.
- Next implementation direction: V1I planning and V1J internal document-template/readiness implementation are both complete.
  - draft-detail smoke caveat is closed
  - Option A remains next: sandbox-only provider enablement after documented gates
  - do not enable production estimate email sending without an explicit rollout plan
  - no customer approval, customer portal estimate visibility, contractor visibility/authority, email/PDF, conversion, payment/deposit, Stripe tenant payment behavior, QBO behavior, or production estimate enablement should be implemented without a design pass
- Future roadmap notes recorded for later design only; not implemented by this closeout:
  - future estimate polish should target the same professional clarity standard already reached by contractor report delivery
  - completed in current baseline: workflow wording now separates `Send Estimate` from `Mark Sent Manually` more explicitly
  - completed in current baseline: draft estimate Pricebook add now applies editable defaults before add while preserving provenance
  - Customer Estimate Profile Entry V1 is now complete on the guarded internal baseline (commits `bcfa9f7`, `b977c89`): `/customers/[id]` shows an internal-only Estimates section when `ENABLE_ESTIMATES=true`; the customer profile header includes `Create Estimate` for internal users when enabled; `Create Estimate` routes to `/estimates/new?customer_id=<id>`; `/estimates/new` validates the UUID and preselects the customer; customer/location context is prefilled or filtered where available but fields remain fully editable; customer estimates appear in the profile history/list; `/estimates/[id]` includes `Back to Customer` when `estimate.customer_id` is set; section CTA was cleaned up (no duplicate always-visible CTA; empty state retains `Create First Estimate`); contractors do not see estimate controls; existing feature gates remain intact; production estimates remain disabled unless explicitly enabled under runbook gates.
  - Customer Estimate Profile Entry V1 is guarded internal baseline only: no real outbound email, PDF generation/storage, customer approval/decline/request-change, public/customer portal links, contractor visibility, estimate-to-job conversion, estimate-to-invoice conversion, payment/deposit, Stripe tenant payment behavior, QBO behavior, schema changes, migrations, RLS changes, or production data actions were introduced.
  - Customer Estimate Profile Entry V1 validation: `npx.cmd tsc --noEmit` passed; `npx.cmd vitest run lib/estimates` passed (`7` files / `127` tests); user browser smoke passed.
  - future customer-centered estimate access/history may extend into customer profile/history, reporting, and standard nav once the guarded internal baseline is intentionally advanced
  - future estimate entry should support customer email/location prefill with explicit editability
  - future response flow may include explicit customer approve/decline/request-change outcomes after dedicated design/gates
  - future estimate reporting, explicit estimate-to-job/service-visit conversion, explicit later estimate-to-invoice-charge conversion, multi-option/good-better-best quoting, and top-ribbon/nav workflow access remain deferred design tracks
  - future Work Item-first billing flow remains a separate audit/planning item: Work Items stay primary operational truth, free-text scope/notes stay narrative context, and Invoice Charges should eventually be buildable from existing Work Items with review/editing
  - future slices may explore Pricebook -> Work Item assisted creation, smarter defaults, and broader invoice panel polish; those remain deferred and are not implemented by this slice
  - payment/deposit remains deferred until tenant payment execution is intentionally enabled

### 2.21 Contractor report delivery current-scope closeout (completed)
- Contractor Report current-scope delivery is complete. Failed ECC contractor reports now aggregate all failed completed ECC runs for the job and render contractor-actionable details including baseline, measured value, variance, and corrected duct-leakage percentage logic.
- Airflow and duct leakage failures are both included when both are failed.
- Refrigerant Charge pass override/weather exception remains excluded from contractor failure issues.
- The preview is sectioned into report, failure, next-step, and note cards.
- Next-step wording is neutral and aligned across preview/send: "Review and submit your response in the portal."
- The send flow supports a recipient override field that defaults to the contractor email, validates recipient server-side, and records actual/default/overridden recipient metadata.
- Sent report snapshots preserve `report_render_version`, `failure_details`, `reasons`, `next_step`, `body_text`, and recipient metadata in the `contractor_report_sent` job_event.
- Professional HTML email delivery, true plain-text fallback, and contractor portal CTA are implemented.
- contractor_report_sent remains audit/history truth in `job_events` and does not create internal notification-table records for outbound contractor report sends.
- Notification-table delivery tracking was removed from this send path because it was nonessential and was able to block delivery under notifications RLS.
- This contractor report path is now professional enough for current launch scope.
- PDF generation/attachment remains deferred.
- Final smoke passed (report generation, recipient override send, received email quality/header).

### 2.22 Branch workflow discipline update (active)
- Branch workflow update: the old `sandbox-clean-start` Git branch has been retired because it became stale/diverged from current `main` and posed a risk of reverting completed work.
- Going forward, `main` is the current production truth.
- Focused work should use short-lived branches created from current `main`, merged back only after validation, then retired.
- The Supabase sandbox environment remains usable; only the stale Git branch was retired.

---

## 3. Support / customer-operations readiness

### 3.1 Remote support access model
- Customer Support / Remote Assistance V1A is implemented, committed, and pushed on `main`.
- V1A includes `support_users`, `support_account_grants`, `support_access_sessions`, `support_access_audit_events`, resolver/audit helpers, and DB-level session/grant/account consistency invariant.
- V1A migration `20260501120000_support_access_v1a_foundation.sql` is applied to sandbox only.
- Production support-access migration/apply remains intentionally deferred.
- V1C exposure control is implemented and fail-closed by default: `ENABLE_SUPPORT_CONSOLE` must be explicitly enabled to expose `/ops/admin/users/support`.
- Production `ENABLE_SUPPORT_CONSOLE` remains intentionally unset/false.
- No production support access is live.

### 3.2 Support console status and boundaries
- Customer Support / Remote Assistance V1B support console shell is implemented, committed, and sandbox-smoked.
- Sandbox smoke confirmed `access_denied`, `session_started`, and `session_ended` audit events.
- H1-H5 hardening is implemented on the current code baseline:
  - support page-shell requires active `support_user`; non-support admins are redirected to `/ops/admin/users` with a dedicated notice
  - action-layer parity guard requires active `support_user` before start/end handlers proceed
  - support session start requires a human-entered reason; reason is captured in audit `metadata.operator_reason`
  - explicit scoped account loads emit `account_viewed` audit events with short-window dedupe to reduce refresh spam
  - operator-facing notice polish is present on `/ops/admin/users` for disabled console and support-user-required states
- V1B remains read-only only:
  - support access requires explicit `support_user` + active account grant + active support session
  - support sessions are account-owner scoped
  - audit events are required
  - support start reason is required for audit quality
  - no impersonation/login-as-customer behavior
  - no tenant job/customer/invoice browsing surface yet
  - no support mutation behavior
  - no support-side operational writes
  - no customer-facing support actions
  - no broad tenant browsing expansion

### 3.3 Deferred production enablement and next support slices
- Support V1 is intentionally parked from production enablement; this is not unfinished architecture.
- Production enablement is deferred pending explicit rollout timing/need decision.
- Do not proceed now with production support migration apply, production support seeding, or production `ENABLE_SUPPORT_CONSOLE` enablement.
- Hardening implementation above does not change deferred status: production migration apply, production flag enablement, production support-user/grant setup, and production smoke/rollback remain explicit later decisions.
- Execution-controlled runbook for later approved enablement is documented at `docs/ACTIVE/Support_Console_Production_Enablement_Runbook.md` and must be committed/used before any production support-console action.
- Production support-console enablement later requires both decisions together: production support migration apply decision and explicit `ENABLE_SUPPORT_CONSOLE` enablement decision.
- Keep-ready rollout checklist (later, explicit approval only):
  - production migration approval
  - production `support_user` seed
  - one read_only grant
  - explicit `ENABLE_SUPPORT_CONSOLE` enablement
  - controlled smoke
  - rollback by disabling `ENABLE_SUPPORT_CONSOLE`
- Tenant/customer-facing support grant visibility remains a later slice.
- Read-only account overview remains a later slice.
- Support mutation remains a much-later explicit decision, if ever.
- App-store/mobile native distribution remains deferred; current launch focus is web/PWA-style readiness, not Apple App Store or Google Play distribution.

---

## 4. Deferred but pinned hardening items

### 4.0 Future notification backlog
- Future feature: tech dispatch phone notifications.
- When a tech is assigned/dispatched to a job, the tech should receive a phone notification.
- Include a later user-facing preference/toggle so techs can turn dispatch notifications on/off.
- This is not part of the current performance closeout and was not implemented in this thread.

### 4.1 `pg_trgm` in `public`
- Current advisor warning is acknowledged and intentionally deferred.
- `pg_trgm` is actively backing live trigram indexes for customer/location search.
- Any move out of `public` must be handled as a dedicated search/index maintenance pass with regression testing.
- Preferred timing: deliberate pre-launch hardening window or immediate post-launch maintenance, depending on stability risk.

---

## 5. Final launch confirmation sweep

Before launch, confirm:
- core operational workflows still pass live smoke testing
- contractor intake / portal flows still behave correctly
- internal/admin critical paths still behave correctly
- notifications and awareness surfaces are honest and current
- billing/payment wording remains truthful
- tenant customer invoice payment execution is still not live
- pre-launch enablements above are either completed or intentionally deferred with explicit decision
- no deferred hardening item has been silently forgotten

---

## 6. One-line definition

This checklist exists to keep the final launch-critical enablements, support requirements, and deferred hardening tasks visible so launch readiness is deliberate rather than accidental.
