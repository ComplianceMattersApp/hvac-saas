# Mobile Job Page V2 M5-I0 Parity Checkpoint

Status: Phase M5-I0 documentation only
Date: 2026-06-27
Scope: canonical Mobile Job Page V2 parity status after accepted M5 native wiring/presentation slices

## Owner-Use Readiness Closeout

Status: **Launch-ready / monitoring**
Decision: **Accepted for controlled owner-led launch use**

Mobile Job V2 is accepted for controlled owner-led launch use. Canonical mobile `/jobs/[id]` already defaults to `MobileJobDetailV2Preview`, while `mobileLayout=current` and `mobileLayout=classic` remain the required current-mobile fallback paths. Standard View exits must continue to preserve `mobileLayout=current`, and desktop `/jobs/[id]` remains separate.

No Mobile V2 source-truth blocker was found in the final source/test smoke review. The owner is actively using the V2 default mobile job page with no reported issues. Full fixture state-matrix screenshots remain recommended monitoring evidence, but they are not a launch blocker for this controlled owner-led use.

This closeout is docs/readiness only. It does not authorize product code, schema, migration, Supabase, Stripe, SMS, QBO, env, feature-flag, production, fallback-removal, desktop, or runtime behavior changes.

## Purpose

This checkpoint updates the M5-C2 living parity ledger after the recent accepted Mobile V2 slices. It is a status snapshot, not a promotion decision and not a product-code change.

Default rule remains: **Mobile V2 should match current mobile behavior unless a design or function change is explicitly approved**. A row, card, or summary is not considered parity by itself. Parity means the current mobile behavior is either native in V2, intentionally routed to a real workspace, intentionally routed to Standard View, or intentionally deferred.

## Source Basis

Reviewed:

- `docs/WORKING/Mobile_Job_Page_V2_M5C2_Living_Parity_Ledger.md`
- `app/jobs/[id]/_components/MobileJobDetailV2Preview.tsx`
- `app/jobs/[id]/_components/MobileJobDetailCurrent.tsx`
- `app/jobs/[id]/_components/MobileJobStatusActionSurface.tsx`
- `app/jobs/[id]/_components/MobileJobSchedulePanel.tsx`
- `app/jobs/[id]/_components/MobileJobTeamNotesPanel.tsx`
- `app/jobs/[id]/_components/MobileJobSharedNotesPanel.tsx`
- `app/jobs/[id]/_components/MobileJobWorkScopePanel.tsx`
- `app/jobs/[id]/_components/MobileJobServiceFollowUpTool.tsx`

## Accepted Native / Updated Areas

| Area | Current M5-I0 status | Risk | Source basis | Next action |
| --- | --- | --- | --- | --- |
| Status / Next Step native surface | Native parity accepted | Medium/High | `MobileJobStatusActionSurface` is rendered by both `MobileJobDetailCurrent` and `MobileJobDetailV2Preview`. It owns lifecycle actions, ECC failed/retest/permit/closeout branches, Service follow-up progress controls, and closeout blockers. | Keep guarded. Do not add new resolver logic. |
| Schedule / reschedule | Native parity accepted | Medium | `MobileJobSchedulePanel` renders current and V2 presentations. V2 uses `id="mobile-when-panel"`, existing `updateJobScheduleFromForm`, hidden permit/schedule fields, `UnscheduleButton`, and target-based close behavior. | Field-confirm close/save/unschedule after deploys; otherwise leave stable. |
| Team Notes | Native parity accepted | Medium | `MobileJobTeamNotesPanel` renders current and V2 target panel. It preserves `DeferredInternalNoteMentionComposer`, `DeferredInternalNotesBody`, `returnAnchor="mobile-internal-notes"`, and narrative scope props. | Keep native; avoid duplicating deferred reads elsewhere. |
| Shared Notes | Native parity accepted | Medium | `MobileJobSharedNotesPanel` renders current and V2 target panel. It preserves `addPublicNoteFromForm`, `note_scope=shared`, `return_to=#mobile-shared-notes`, `DeferredSharedNotesBody`, and narrative scope props. | Keep native; do not change audience/product-mode gates casually. |
| Work Scope / Visit Scope | Native parity accepted; V2 scope separated from Compliance Work | Medium/High | `MobileJobWorkScopePanel` renders current, `v2DisclosurePanel`, and `v2InlineBody`. V2 keeps Service/companion service scope in the Work to Do / Work Performed lane, and shows ECC job scope as its own visible `Work Scope` section instead of hiding it behind `Compliance details`. It preserves `updateJobVisitScopeFromForm`, `VisitScopeJobDetailForm`, `mobile-work-scope`, and `mobile-visit-reason-card`. | Field-confirm Add/Adjust Work remains stable; keep Work Scope independent from Compliance Work unless a design change is explicitly approved. |
| Service follow-up tool | Native parity implemented, needs field confirmation | Medium/High | `MobileJobServiceFollowUpTool` renders current and V2 tools presentations. It preserves `createNextServiceVisitFromForm`, `job_id`, `tab`, `visit_intent=return_visit`, `next_visit_reason`, and `return_to=#mobile-follow-up-job`. | Field-confirm Create Return Visit from V2 tools. |
| Failed reason editor | Native parity accepted | Medium | `MobileJobStatusActionSurface` renders a native `mobile-failed-reason-editor` disclosure using existing `updateJobOpsDetailsFromForm`, `job_id`, `next_action_note`, maxLength 240, and mobile return target. | Keep rose failed-state styling and compact editor. |
| Redundant correction/retest CTA | Removed / intentionally not wired | Low | V2 removed the vague `Open correction / retest tools` summary CTA. Actual retest/correction controls remain in `MobileJobStatusActionSurface` or current tools. | Keep removed unless a distinct missing action is identified. |
| Confirm Retest Ready / ECC Attention presentation | Native action accepted; duplicate lower summary hidden | Low/Medium | `MobileJobStatusActionSurface` keeps the native `confirmEccRetestReadyFromForm` form. V2 lower ECC Attention now remains only for linked-retest parent context. | Keep action upper-only; do not duplicate in Compliance Work. |

## Remaining Candidate Ledger

| Area | M5-I0 status | Risk | Current V2 posture | Next action |
| --- | --- | --- | --- | --- |
| Files & Attachments | Intentional real route/workspace | Low | V2 Evidence & Notes links directly to `/jobs/${job.id}/attachments`. | Leave as real route unless attachment counts/previews become a field need. |
| Equipment | Intentional real route/workspace | Low/Medium | V2 Compliance Work links to `/jobs/${job.id}/info?f=equipment`. | Leave as real route; do not duplicate equipment forms. |
| ECC Tests | Intentional real route/workspace | Low/Medium | V2 uses `/jobs/${job.id}/tests`; required-test precedence is guarded by existing loaded ECC state. | Leave as real route; no new test truth model. |
| Permit forms/actions | Intentional Standard View escape / current native status action only where already shared | High | V2 Permit Information still routes to `standardJobAnchorHref("mobile-permit-info")`; permit-needed action is handled in shared status surface when active. | Audit before any native permit edit. Permit info uses schedule action fields and must not be separated casually. |
| Billing / Invoice / External billing | Mixed: native status blockers in shared surface, summary/route elsewhere | High | `MobileJobStatusActionSurface` owns current closeout blockers; V2 Billing / Closeout summary routes to current anchors/workspaces. | Do not make native invoice redesign next. Needs separate billing audit. |
| Job Status Tools / waiting release | Intentional Standard View escape | High | V2 More Details links to `standardJobAnchorHref("mobile-tools")`. Waiting labels may show in lifecycle/next step, but interrupt/release controls remain current. | Candidate only after a waiting/release audit. Preserve evaluator and permissions. |
| Timeline / History | Intentional Standard View escape | Medium | V2 More Details links to `standardJobAnchorHref("mobile-tools-timeline")`; current `DeferredTimelineBody` remains deferred/fail-open. | Leave standard-linked unless owner needs native history. Avoid duplicate timeline reads. |
| Team assignment | Not wired | Medium/High | Current mobile renders `AssignedTeamControls`; V2 has no native assignment controls. | Good future candidate only if assignment is a field friction point. Audit actions/anchors first. |
| Contact logging | Not wired | Medium | Current mobile renders `ContactLoggingQuickActions`; V2 does not expose a native contact logging row. | Strong practical candidate if owner logs calls/texts in field. Audit exact anchor/return behavior first. |
| Service Plan details/create | Intentional real route/workspace | Low/Medium | V2 Service Plan row links to customer service-plan area or standard job fallback. | Leave as route. |
| Service Plan visit-count / next-due actions | Not native / intentionally deferred | High | Current mobile attention strips render `MarkVisitCountedActionButton` and `ConfirmNextDueDateActionButton`; V2 only links to Service Plan context. | Do not wire without exact mutation audit. |
| Location & Address edit | Intentional real route/workspace | Low/Medium | V2 More Details uses `serviceLocationEditHref`; no location form duplication. | Leave as route; do not alter `JobLocationPreview` or service-location logic. |
| Completion Report / certification surfaces | Native only where already part of shared status surface; otherwise unclear | High | Cert/closeout actions such as `markCertsCompleteFromForm` remain in `MobileJobStatusActionSurface` blocker branch. Completion report/certification-specific surfaces still need source audit. | Separate certification/closeout audit before native changes. |

## Current Safety Invariants

- Canonical mobile `/jobs/[id]` defaults to `MobileJobDetailV2Preview` through `page.tsx` unless explicitly forced to current.
- `mobileLayout=current` / `classic` remains the fallback path.
- Standard View / current-mobile exits from V2 must continue to include `mobileLayout=current`.
- Desktop remains separate.
- Route reads remain in `page.tsx`.
- Native V2 extracted panels reuse already-loaded props and existing action components/forms.
- No new schema, Supabase reads, server actions, helper/source-of-truth logic, or RLS/auth changes are implied by this checkpoint.

## Final State-Matrix Monitoring Checklist

For monitoring evidence and broader fixture confidence, continue to run the final state-matrix smoke checklist where safe local/non-production fixtures exist. This evidence is still recommended, but it is no longer a launch blocker for controlled owner-led launch use:

- closed / cancelled / archived read-only jobs;
- ECC failed / pending-office-review / correction-review / retest-ready / linked-retest states;
- permit-needed and permit-info states;
- billing / closeout blockers, including invoice, external billing, certs, and no-action states;
- waiting / release / parts / approval / hold states;
- service-plan visit-count and next-due action states;
- fallback behavior for `mobileLayout=current`, `mobileLayout=classic`, Standard View exits, and desktop separation.

The checklist is tracked in `docs/WORKING/Mobile_Job_Page_V2_Final_State_Matrix_Smoke_Checklist.md`.

## Updated Known Field Findings

- Schedule helper-card drift was corrected; the compact schedule summary with native target panel is the accepted pattern.
- Work Scope duplicate-card/disclosure regressions were corrected.
- Work Scope is no longer hidden behind a `Compliance details` button in ECC V2. ECC scope now appears as its own visible `Work Scope` section, while Service/companion service scope remains in the Work to Do / Work Performed lane.
- Service follow-up Create Return Visit is native in More Details / Tools.
- Failed reason editing is native, compact, and rose-styled for failure.
- The vague correction/retest navigation CTA was removed because it was duplicate clutter.
- Confirm Retest Ready remains in the upper status/action card; lower ECC Attention is hidden unless it carries linked-retest parent context.

## Recommended Next Safest Wiring Target

Recommended next target: **Contact logging native parity audit**, then implementation only if the current mobile action/return behavior is clear.

Why this is the safest useful next target:

- Schedule, notes, Work Scope, status, failed reason, and service follow-up are already native.
- Files, Equipment, ECC Tests, Service Plan, Attachments, and Location already have acceptable real-route posture.
- Billing, permit, retest scheduling, closeout/certs, waiting release, and service-plan mutations are higher-risk source-of-truth areas.
- Contact logging is likely field-relevant, can remain route-local, and should not require invoice/ECC/billing truth changes if the existing `ContactLoggingQuickActions` can be reused mechanically.

Audit requirements before Contact logging implementation:

- Confirm current mobile location, anchor/return behavior, and visibility gates.
- Confirm `logCustomerContactAttemptFromForm` hidden fields/payload.
- Confirm whether V2 has enough already-loaded contact recipient/context props.
- Stop if native rendering requires new reads, permission changes, or changing contact logging action behavior.

## Validation

Documentation-only. No product code was changed for this M5-I0 checkpoint.
