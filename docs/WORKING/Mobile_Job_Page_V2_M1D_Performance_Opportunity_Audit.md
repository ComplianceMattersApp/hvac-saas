# Mobile Job Page V2 M1-D Performance Opportunity Audit

Status: Phase M1-D performance opportunity audit only  
Date: 2026-06-25  
Scope: internal mobile `/jobs/[id]` only

## 1. Executive verdict

Mobile V2 can improve perceived speed mostly through recomposition, collapse strategy, and image loading priority without changing route truth or moving reads out of `app/jobs/[id]/page.tsx`.

The current parent route intentionally gathers a broad job-detail read model before rendering either mobile or desktop. That protects auth, same-account scoping, billing correctness, ECC state, service-chain context, role gates, and action availability. For Mobile V2, the safest performance posture is:

- keep route reads in `page.tsx`;
- keep authoritative action and billing state blocking where it is currently blocking;
- keep existing deferred bodies deferred;
- avoid new queries for hero, lifecycle rail, next-step card, Compliance Work, and compact Job Context;
- improve perceived speed by rendering primary identity/action from already-loaded fields and keeping lower-priority panels collapsed or streamed.

No product code was changed by this audit.

## 2. Current Parent-Page Read Fanout Relevant To Mobile

The route fanout currently starts with security and account boundary reads that must remain ahead of job rendering:

- `createClient`
- `supabase.auth.getUser`
- `resolveJobDetailActor`
- contractor shadow membership check
- same-account scoped job boundary via `loadScopedInternalJobDetailReadBoundaryOutcome`
- optional admin read-client switch for internal users with contractor membership
- main `jobs` read with location, equipment, ECC test runs, billing-disposition compatibility fallback

After the main job is known, the route assembles a shared mobile/desktop read model:

- `job_systems` for equipment systems
- immediate invoice truth and collected payment ledger when internal invoicing is enabled
- active assignment display map
- service-case summary and visit count
- narrative chain job IDs
- note counts and latest note preview
- service follow-up progress events
- active retest child
- customer contact attempt count/latest attempt
- on-the-way undo eligibility
- job/customer/location role contacts
- contractor and customer billing/contact reads
- pricebook templates for visit scope and field billing controls
- field billing summary data, including proposals, voided invoice, and supplemental invoice family where gated
- maintenance agreement links/suggested next due context where gated
- saved customer service locations for service-location edit controls

This fanout is large, but much of it feeds current mobile action availability, form options, field operation context, and desktop parity. The hard boundary for V2 remains: do not move these reads out of `page.tsx` and do not weaken the auth, source-of-truth, billing, or action gates to make the first viewport faster.

## 3. Existing Deferred Or Streamed Sections To Preserve

These deferred sections protect first paint and should remain deferred in Mobile V2:

- `DeferredInternalNoteMentionComposer`
- `DeferredInternalNotesBody`
- `DeferredSharedNotesBody`
- `DeferredTimelineBody`
- `DeferredJobAttachmentsInternal`
- `DeferredCustomerAttemptsHistory`
- `DeferredServiceChainPanelBody`
- `DeferredWorkflowMilestonesPanelBody`

Existing comments in `page.tsx` already document performance intent:

- the 200-row `job_events` timeline summary was removed from first paint;
- only cheap chain-job-ID discovery remains on the blocking path;
- timeline, shared notes, and internal notes remain authoritative in deferred bodies;
- contractor response labels/counts are deferred instead of adding a first-paint `job_events` read.

Mobile V2 should not duplicate these reads to populate prettier summaries. If the V2 UI needs note/timeline/service-chain previews above the fold, it should first use the already-loaded count/preview data, and any richer body should stay inside the existing deferred components.

## 4. Mobile Render Areas With Duplicate Data

The current mobile branch repeats some already-loaded facts across surfaces. These are perceived-speed and scroll-efficiency opportunities, not permission to remove capability.

Current duplication:

- service address appears in the command header and again through the Field Operations Board/location preview;
- Call/Text/Navigate are split between Quick Field Actions and location/preview behavior;
- invoice create/open controls appear in status, quick actions, attention strips, work/invoice summary, and More Details;
- permit information appears as a promoted blocker/action and again in More Details;
- retest/correction information appears both in current status branches and tools/history;
- notes summary/counts appear in the notes hub while full bodies stream later;
- service-chain/timeline context appears as section metadata while full bodies are deferred lower in the page.

V2 can reduce visual duplication without changing data fanout by making the hero own identity/address/contact actions, the next-step card own the dominant action, and below-fold panels become launchers or collapsed detail.

## 5. V2 Perceived-Speed Opportunities Without New Queries

Low-risk perceived-speed opportunities for Mobile V2:

- Render job identity, reference, customer/account, schedule, address text, lifecycle label, and current action from already-loaded `job`, `surfaceProfile`, `closeoutNeeds`, billing state, and existing booleans.
- Use the existing mobile status/action branches as the source for the Next Step card rather than adding a new resolver or read.
- Build the lifecycle rail as display-only from existing `job.status`, `job.ops_status`, `field_complete`, closeout, billing, and ECC booleans.
- Build the Compliance Work lane from existing equipment/test/permit/retest booleans and links already used in Quick Field Actions and More Details.
- Make Job Context compact by default, showing only already-loaded assignment/contact/location summary, then keeping the heavier location/contact/team details behind an existing anchor-preserving expanded panel.
- Keep More Details / Tools collapsed by default, with deferred timeline/service-chain bodies loading only when streamed as today.
- Avoid showing duplicate invoice controls above the fold unless the existing billing/closeout gate makes invoice the dominant next responsibility.

These changes can make the first viewport feel faster by reducing visual work and scan cost, even if the route still waits for the same authoritative read model.

## 6. Photo Hero Blocking Assessment

The photo hero can render without blocking primary job identity and next action if implemented carefully.

Safe approach:

- Render identity, address text, schedule, lifecycle, and primary action from the existing page data immediately.
- Treat the image as progressive enhancement.
- Use the existing `JobLocationPreview` / `JobLocationPreviewImage` behavior and fallback semantics.
- Keep an address-first fallback when preview metadata/image is unavailable.
- Do not treat Google Street View/static map as stored property truth.
- Do not change `JobLocationPreview` globally unless desktop behavior is explicitly included in a later slice.

Current `TimedJobLocationPreview` records `jobLocationPreviewBlocking` when `JOB_DETAIL_TIMING_DEBUG=true`. If V2 moves the preview into the hero, the audit recommendation is to keep the hero text/action independent of preview completion. The user should see the job and next action even if the image falls back or arrives later.

## 7. Below-Fold Panels That Can Remain Collapsed Or Deferred

These areas are good candidates to stay collapsed, streamed, or lower-priority after V2:

- More Details / Tools
- Timeline / History
- Service Chain and workflow milestones
- Follow-up history/customer attempts history
- Attachments full body
- Internal Notes body
- Shared Notes body
- permit edit form when permit is not the current blocker
- job status tools / interrupt-state editor
- return visit creation form when it is not the current next responsibility
- service-location change controls and location alternatives
- assigned-team management controls
- role contacts detail cards
- invoice workspace details beyond the current billing responsibility summary

Important distinction: collapsed/deferred does not mean unavailable. Current anchors, post-submit return positions, and role-gated tools must remain reachable.

## 8. Risks Around V2 Additions

### Lifecycle Rail

Risk: making ambiguous or interrupted states look simpler than they are.

Use only existing state fields and helper output. `pending_info`, `on_hold`, `failed`, `pending_office_review`, `retest_needed`, cancelled, archived, and linked historical parent jobs require explicit exception display. Do not add a new lifecycle model in a performance slice.

### Next-Step Card

Risk: accidentally changing action precedence or hiding a required blocker.

Use current branch gates and server actions. Do not invent a resolver or optimistic final-state UI. Any next-step recomposition needs state smoke for ECC, Service, waiting, retest, permit, and billing cases.

### Compliance Work Lane

Risk: conflating launchers with statuses or treating companion Service Work as ECC truth.

Use existing equipment/test/permit/retest/correction data. Do not add new completion-report queries until the route/source is separately audited.

### Compact Job Context

Risk: hiding mutation controls or breaking contact logging scroll restore/anchors.

Keep `ContactLoggingQuickActions`, assigned-team controls, role contacts, and service-location edit behavior intact. Collapse presentation only after anchor and return behavior are explicitly preserved.

### Hero Image

Risk: letting third-party image/metadata latency delay the first meaningful job/action view, or changing desktop by editing shared preview components.

Keep image optional and non-authoritative. Prefer address-first fallback and progressive rendering.

## 9. Existing Timing Measurements To Use

The route already has env-gated diagnostics:

- enable with `JOB_DETAIL_TIMING_DEBUG=true`;
- logs are emitted as `[job-detail-timing]`;
- timings include route labels and `phasesMs`;
- existing phase names include:
  - `createClient`
  - `authGetUser`
  - `actorRoleResolution`
  - `sameAccountScopedJobBoundary`
  - `mainJobRead`
  - `contractorsRead`
  - `businessProfileReads`
  - `assignmentDisplaySummary`
  - `serviceChainSummary`
  - `timelineSummary`
  - `customerAttemptSummary`
  - `undoEligibility`
  - `billingCustomerContractorReads`
  - `immediateInvoiceTruthRead`
  - `deferredInvoicePanelRead`
  - `eccPayloadReads`
  - `jobLocationPreviewBlocking`
  - `serviceStatusActionsBlocking`
  - `compositionPrep`
  - `totalServerRenderBeforeResponse`

Suggested measurement protocol:

- Capture baseline logs for representative ECC and Service states before visual V2 work.
- Compare mobile V2 preview/current renders with the same env flag; do not add new production logging.
- Record route labels: tab, notice/banner presence, schedule-required flag, ECC notice branch, invoice panel active, service case present, and narrative chain present.
- Watch `jobLocationPreviewBlocking` if the preview moves upward into the hero.
- Watch `compositionPrep` when adding lifecycle/next-step/compliance presentation logic.
- Treat billing phases as correctness-sensitive; do not optimize them inside general mobile-performance work.

No new timing system is recommended for M1-D.

## 10. Safe Future Implementation Slices

### Slice 1: Measurement Baseline

Use `JOB_DETAIL_TIMING_DEBUG=true` to capture current mobile/desktop timings for the smoke matrix states. No code change.

Risk: lowest.

Validation: confirm logs appear and are archived in working notes, not committed secrets or production data.

### Slice 2: First-Viewport Recomposition From Existing Props

In a V2 preview shell, render hero identity, address text, schedule, lifecycle label, and current responsibility from existing props only.

Risk: low to medium.

Validation: compare visible action availability and mobile order intent against current branch.

### Slice 3: Progressive Photo Hero

Move existing preview behavior into the hero only if text identity and next action render independently.

Risk: medium.

Validation: mobile smoke with image available, missing API key/fallback, no address, and slow image load. Confirm desktop unchanged unless included.

### Slice 4: Collapse Job Context Detail

Show compact assignment/contact/location summary above the fold, keep full location/contact/team controls in an anchor-preserving expanded detail.

Risk: medium because contact logging, team controls, and service-location changes are behavior-heavy.

Validation: contact logging return/scroll, assigned-team controls, service-location warning and return anchors.

### Slice 5: Keep Evidence/Timeline Bodies Deferred

Re-label/reposition Evidence & Notes while continuing to stream existing note/timeline bodies.

Risk: medium.

Validation: internal/shared note audience boundaries, deferred fallbacks, note save return anchors.

### Slice 6: Compliance Work Lane From Existing State

Present equipment/tests/permit/retest/correction as launcher/status rows using already-loaded state.

Risk: medium to high because ECC gates are subtle.

Validation: ECC scheduled, in-progress, missing-test, permit-needed, failed, pending-office-review, retest-needed, linked-retest states.

### Slice 7: Billing/Invoice Perceived-Speed Review

Separate future audit only. Billing/payment correctness, invoice truth, collected-payment ledger, supplemental invoices, and proposal states should not be optimized casually.

Risk: highest.

Validation: dedicated billing/payment test matrix and invoice authority smoke.

## 11. Explicit Non-Actions

This audit did not change product code.

It does not recommend:

- schema or migration changes;
- Supabase changes;
- server action/helper/source-of-truth changes;
- revalidation trimming;
- optimistic final-state UI;
- moving data reads out of `page.tsx`;
- duplicating deferred reads;
- touching shared components;
- invoice/billing/payment performance work inside general Mobile V2 work.

Mobile V2 performance should start with measured, presentation-only perceived-speed improvements while preserving current truth and action correctness.
