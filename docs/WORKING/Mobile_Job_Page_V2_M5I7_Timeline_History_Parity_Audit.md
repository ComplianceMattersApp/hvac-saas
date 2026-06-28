# Mobile Job Page V2 M5-I7 Timeline / History Parity Audit

Status: Phase M5-I7 documentation only  
Date: 2026-06-28  
Scope: Timeline / History native parity readiness for Mobile Job Page V2

## Purpose

This audit determines whether Timeline / History can be promoted from a Standard View escape into a native collapsed/read-only Mobile V2 panel without changing timeline truth, duplicating reads, or weakening the existing deferred fail-open behavior.

No product code was changed.

## Source Basis

Reviewed:

- `docs/WORKING/Mobile_Job_Page_V2_M5I0_Parity_Checkpoint.md`
- `app/jobs/[id]/_components/MobileJobDetailCurrent.tsx`
- `app/jobs/[id]/_components/MobileJobDetailV2Preview.tsx`
- `app/jobs/[id]/_components/DeferredTimelineBody.tsx`
- `app/jobs/[id]/page.tsx`
- `lib/jobs/job-history-summary-read-model.ts`
- `lib/jobs/__tests__/job-history-summary-read-model.test.ts`
- `lib/jobs/__tests__/job-detail-deferred-narrative-fail-open.test.ts`
- `lib/jobs/__tests__/job-detail-mobile-assignment-parity.test.ts`
- `lib/jobs/__tests__/stripe-payment-received-visibility-wiring.test.ts`

## Current Mobile Behavior

| Item | Current behavior |
| --- | --- |
| Location | `MobileJobDetailCurrent.tsx`, inside the lower mobile `More Details / Tools` area. |
| Anchor / id | `id="mobile-tools-timeline"`. |
| Label | `Timeline / History`. |
| Visibility gates | No job-type-specific gate found around the timeline details itself. It appears in mobile tools for current mobile. |
| Collapsed/deferred posture | Rendered inside a native `<details>` disclosure. The body is wrapped in `<Suspense fallback={<NarrativeTimelineBodyFallback />}>`. |
| Body component | `DeferredTimelineBody`. |
| Mutation actions | None found in `DeferredTimelineBody`. The timeline/history area is read-only. |
| Fallback behavior | `DeferredTimelineBody` catches failures and renders `DeferredNarrativeSectionFailure` with: `Timeline is temporarily unavailable. Core job details remain available. Refresh to try again.` |
| Soft timeout behavior | Each timeline read helper has a 3500ms soft timeout. Expected timeout fallback does not log the scary stack; unexpected errors still `console.error("DeferredTimelineBody failed", error)`. |

Current mobile renders:

- `DeferredTimelineBody`
- `jobId`
- `timelineJobIds={narrativeScopeJobIds}`
- `hasDirectNarrativeChain={hasDirectNarrativeChain}`
- `emptyStateClassName={workspaceEmptyStateClass}`
- `jobSummary` built from current job status, ops status, field completion, schedule, parent job id, pending info reason, and on-hold reason

## Timeline / History Reads

`DeferredTimelineBody` performs read-only work:

| Read | Source | Purpose | Limit / timeout |
| --- | --- | --- | --- |
| Timeline events | `job_events` selecting `id, job_id, created_at, event_type, message, meta, user_id` | Full timeline corpus for current narrative scope | `.limit(200)`, 3500ms soft timeout |
| Linked child jobs | `jobs` selecting `id, status, ops_status, parent_job_id` | Only when timeline events include retest history | `.limit(20)`, 3500ms soft timeout |
| Actor display names | `resolveUserDisplayMap` | Human-readable actor labels for timeline rows | Only when timeline actor ids exist, 3500ms soft timeout |

The component then builds a read-only summary through `buildJobHistorySummary`, renders a summary card, shows up to three timeline preview items, and places overflow items inside a nested `Show all timeline entries` disclosure.

## Page-Level Read / Performance Context

`page.tsx` explicitly documents that the old 200-row `job_events` summary read was removed from first paint. Only cheap chain job id discovery remains on the blocking path:

- `timelineSummaryPromise` reads chain job ids from `jobs`.
- `DeferredTimelineBody`, `DeferredSharedNotesBody`, and `DeferredInternalNotesBody` remain authoritative and stream the full `job_events` corpus below the fold.

This means the timeline body is intentionally deferred today. However, a server component inside a collapsed HTML `<details>` still begins rendering/streaming as part of the server response. The browser hiding the panel by default is not the same as true click-time lazy loading.

## V2 Current Posture

| Item | Current V2 behavior |
| --- | --- |
| Placement | More Details / Tools, under `Admin / Records`. |
| Current row | `Timeline / History`. |
| Current helper | `Open job history in standard view`. |
| Current href | `standardJobAnchorHref("mobile-tools-timeline")`. |
| Standard View behavior | `standardJobHref` includes `mobileLayout=current`, so the owner-default V2 route exits to current mobile and targets `#mobile-tools-timeline`. |
| Native timeline body in V2 | Not currently rendered. |
| Props readiness | V2 already receives `DeferredTimelineBody`, `NarrativeTimelineBodyFallback`, `narrativeScopeJobIds`, `hasDirectNarrativeChain`, `job`, and the same route-local props needed to build the current mobile `jobSummary`. |

V2 has enough already-loaded props to render the existing timeline wrapper without new route reads or page-level data movement.

## Read / Performance Contract

| Question | Finding |
| --- | --- |
| Would native V2 render add a new deferred read? | Yes, if V2 renders `DeferredTimelineBody`, it starts the same deferred timeline read currently used by current mobile. |
| Would current mobile and V2 render timeline at the same time? | Not on the same request, because `page.tsx` selects either `MobileJobDetailCurrent` or `MobileJobDetailV2Preview` for mobile. |
| Would V2 duplicate timeline reads already rendered elsewhere in V2? | No native timeline body exists in V2 today. Notes panels have separate deferred bodies and should remain separate. |
| Would a collapsed `<details>` prevent the server read until clicked? | No. Native HTML disclosure hides UI by default, but server component rendering still starts unless a separate lazy-loading pattern is introduced. |
| Does the 3500ms soft timeout apply if reused? | Yes, if V2 reuses `DeferredTimelineBody`. |
| Does fail-open remain isolated? | Yes, `DeferredTimelineBody` returns only the local failure UI and does not block the main job page once streamed. |
| Could native V2 slow first paint? | It should not move timeline reads into the blocking path if kept under Suspense, but it may still add streaming work to the V2 response. This is acceptable only if owner wants native history more than the current standard-link posture. |

## Source-Of-Truth Contract

Confirmed:

- Timeline rendering is read-only.
- `DeferredTimelineBody` reads `job_events`, linked `jobs` rows only for retest history, and actor display names.
- It does not insert, update, or delete `job_events`.
- It does not mutate job status, ops status, billing, notes, or closeout truth.
- It does not fabricate events; it renders the event rows it receives and a derived summary from those rows plus job snapshot props.
- No route reads need to move out of `page.tsx` for native reuse.

## Safe Reuse Classification

Classification: **Safe reuse only inside a collapsed disclosure, with performance caveat.**

Why:

- Direct component reuse preserves the existing read model, timeout, fallback, labels, summary builder, actor display handling, linked retest context, and no-mutation contract.
- V2 already has enough props for the same component call.
- The current and V2 mobile branches are mutually exclusive, so native V2 does not duplicate current mobile timeline reads on the same request.
- But native reuse is not true on-click lazy loading; it still streams the deferred body after page render.

Not recommended in the next slice:

- Building a separate lightweight recent-history read.
- Adding new route reads.
- Changing query semantics or the 200-row limit.
- Adding client-side fetch/lazy loading without a separate performance design.
- Moving timeline read models into `page.tsx`.

## Proposed V2 Placement

Recommended placement: **native nested `Timeline / History` disclosure inside expanded More Details / Tools, under Admin / Records.**

Closed state:

- Keep More Details / Tools collapsed by default.
- When More Details / Tools is opened, show `Timeline / History` as a row matching other V2 tool rows.
- Helper can change from `Open job history in standard view` to `Review job history and activity`.
- Logging/history body remains hidden visually until the row is opened.

Opened state:

- Render the existing `DeferredTimelineBody` below the row.
- Keep `Suspense` fallback using `NarrativeTimelineBodyFallback`.
- Preserve `id="mobile-tools-timeline"` on the native V2 panel or a V2-safe equivalent only if current anchor tests are updated intentionally.
- Keep the existing failure message and soft timeout behavior.

## Risk Review

| Risk | Level | Notes |
| --- | --- | --- |
| Duplicate timeline reads | Low if replacing the Standard View row with native body in V2 only; medium if both native body and Standard View body are rendered in the same V2 tree. |
| Page slowdown | Medium. The read remains deferred/streamed but not true click-time lazy. |
| Soft timeout noise | Low. Expected `DeferredTimelineSoftTimeoutError` already avoids full-stack error logging. Unexpected query errors still log and fail open. |
| Huge history in drawer | Medium. `DeferredTimelineBody` limits to 200 rows and nests overflow behind `Show all timeline entries`. Still may feel dense in a drawer. |
| Confusing timeline with notes | Low/Medium. Keep it under Admin / Records, not Evidence & Notes. |
| Missing linked retest context | Low. Existing component already reads linked children when retest history is present and receives `hasDirectNarrativeChain`. |
| Broken fallback on timeout | Low. Covered by `job-detail-deferred-narrative-fail-open.test.ts`. |
| Accidentally changing timeline truth | Low if `DeferredTimelineBody` is reused unchanged. |

## Recommendation

Recommendation: **Implement native collapsed Timeline / History in V2 next only if the owner wants native history enough to accept the existing deferred server read starting during render.**

Preferred implementation slice:

1. Replace the V2 Standard View `Timeline / History` link with a nested collapsed disclosure in More Details / Tools.
2. Reuse `DeferredTimelineBody` unchanged.
3. Reuse `NarrativeTimelineBodyFallback`.
4. Build the same `jobSummary` object from already-passed `job` props.
5. Keep the body visually hidden until the `Timeline / History` row is opened.
6. Do not introduce new reads, new helpers, client fetches, action changes, event mutations, or query semantic changes.
7. Keep an escape to Standard View only if owner still wants a fallback link inside the opened panel.

If the requirement is strict “no timeline query until the user taps Timeline / History,” keep the Standard View escape for now. True click-time lazy loading would need a separate route/API/client loading design and should not be combined with parity promotion.

## Suggested Validation For Implementation Slice

If native V2 timeline is implemented later, run:

- `npx.cmd vitest run lib/jobs/__tests__/job-detail-deferred-narrative-fail-open.test.ts --reporter=dot`
- `npx.cmd vitest run lib/jobs/__tests__/job-history-summary-read-model.test.ts --reporter=dot`
- `npx.cmd vitest run lib/jobs/__tests__/job-detail-mobile-assignment-parity.test.ts --reporter=dot`
- `npx.cmd tsc --noEmit`
- `git diff --check`

Manual checks:

- More Details / Tools remains collapsed by default.
- Opening More Details / Tools shows `Timeline / History` as a clean row.
- Timeline body is hidden until the row is opened.
- Timeline fallback appears locally if the timeline read fails or times out.
- Main job details, status/action surface, notes, schedule, Work Scope, billing summary, current mobile, and desktop remain unchanged.

## Validation

Documentation-only. No product code was changed, and no test commands were required.
