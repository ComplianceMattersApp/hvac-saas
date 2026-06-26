# Mobile Job Page V2 M4-A Promotion Readiness Audit

Status: Phase M4-A promotion-readiness audit only  
Date: 2026-06-26  
Scope: internal mobile `/jobs/[id]` preview only

## 1. Executive Verdict

Mobile Job Page V2 should not be promoted to default mobile behavior yet.

The preview is now a strong field-facing shell: it has the photo-led command header, display-only lifecycle rail, dominant Next Step, ECC Compliance Work, Service Work lane, Evidence & Notes action list, Billing / Closeout summary, and collapsed More Details / Tools. It also preserves the important safety boundary: default `/jobs/[id]` still renders `MobileJobDetailCurrent`, while `/jobs/[id]?mobileLayout=v2` renders `MobileJobDetailV2Preview`.

However, promotion would still be premature because V2 does not directly render several behavior-heavy current-mobile capabilities. Most are reachable through standard-current-view links, which is safe for preview. Before default rollout, the owner must decide which of those current actions can remain as standard-view escapes and which must be promoted into V2 with exact form/action/return behavior.

Recommended path: keep V2 query-param preview for now, then move toward an env-flagged internal mobile default only after a targeted parity pass promotes or explicitly standard-links the remaining action families. Do not promote all mobile users immediately.

## 2. Route And Rendering Gate Confirmation

Source inspection confirms:

- `app/jobs/[id]/page.tsx` imports both `MobileJobDetailCurrent` and `MobileJobDetailV2Preview`.
- The route parses `sp.mobileLayout`.
- `useMobileV2Preview` is derived as `mobileLayout === "v2"`.
- `MobileJobDetailMobileComponent` selects `MobileJobDetailV2Preview` only when that boolean is true; otherwise it selects `MobileJobDetailCurrent`.
- The desktop branch remains separate under existing `lg:block` rendering.

Promotion invariant:

- Current default route `/jobs/[id]`: must continue to render `MobileJobDetailCurrent` until a later promotion slice changes this intentionally.
- Preview route `/jobs/[id]?mobileLayout=v2`: may render `MobileJobDetailV2Preview`.
- Desktop: still owned by the current desktop branch and should remain unchanged.

## 3. Current-Mobile Capability Inventory

### Already Represented Directly In V2

- Job identity: title, reference, job type, customer, contractor where present.
- Schedule summary.
- Photo/location preview using existing `TimedJobLocationPreview` and fallback.
- Address text plus Call, Text, and Navigate affordances.
- Display-only lifecycle rail.
- Dominant Next Step shell using existing props and safe inline lifecycle actions where allowed.
- ECC Compliance Work launchers for Equipment, ECC Tests, and Permit Info.
- Service Work / Work Performed lane from existing Visit Scope props.
- Companion Service Work lane for ECC jobs with companion service items.
- Evidence & Notes action rows for Team Notes, Shared Notes when gated, and Files & Attachments.
- Note badges/signals from already-loaded note metadata/banner signals only.
- Billing / Closeout preview summary from existing gates.
- More Details / Tools collapsed by default.
- Tool rows for Create Estimate, Create Return Visit, Service Plan, Permit Information, Job Status Tools, Timeline / History, and Location & Address when available.

### Still Reachable By Standard-View Link, Not Directly Rendered In V2

- Schedule edit panel at `mobile-when-panel`.
- Full Work Scope editor and `VisitScopeJobDetailForm`.
- Current invoice summary card and invoice create/open variants.
- Permit-needed form and permit edit form.
- Retest scheduling/move-to-needs-scheduling forms.
- Correction review form.
- Waiting release and service follow-up progress forms.
- Field outcome panel for Service secondary outcomes.
- Full internal notes composer/body.
- Full shared notes form/body.
- Timeline/history deferred body.
- Contact logging quick actions.
- Assigned team controls.
- Full role-contact and contractor management context.
- Full job status/interruption tools.
- Service plan visit-count and next-due mutation buttons.

### Not Yet Explicit Enough For Default Rollout

- Failed-family ECC: correction review vs confirm retest ready priority is still product-sensitive.
- Retest-needed and linked retest parent: V2 gives safer read-only/standard-view posture, but does not yet expose the exact current action set.
- Service waiting/parts/approval: V2 labels the state safely but does not yet render the current release/progress controls.
- Service finish seam: `FieldOutcomePanel` is not promoted, so Service-specific outcome choices are not first-class in V2.
- Billing/Closeout: V2 summarizes and routes safely, but does not yet directly represent all invoice/external-billing action variants.
- Service plan: V2 now provides a consistent More Details row to the customer Service Plans context, but visit-count and next-due mutations remain in standard/current surfaces.

## 4. Promotion Classification

### Acceptable As Standard-View Links For Initial Flagged Preview

These can remain as standard-current-view links while V2 is preview-only or behind an internal feature flag:

- Timeline / History.
- Job Status Tools.
- Permit Information when not the current blocker.
- Create Return Visit.
- Location & Address / Edit service location.
- Team Notes and Shared Notes bodies/composers.
- Work Scope editor when Work Items are visible as summary in V2.
- Service Plan details/create area through the customer Service Plans tab.
- Attachments route.
- Equipment and tests workspaces.

### Must Be Promoted Or Explicitly Accepted Before Default Rollout

These require owner/product decision before V2 becomes default for ordinary mobile use:

- Current lifecycle action parity for all normal states, including Undo On the Way visibility/return behavior.
- Service finish outcomes through `FieldOutcomePanel` or a deliberately equivalent V2 action surface.
- Waiting/release/parts/approval progress actions.
- ECC failed/correction/retest action hierarchy.
- Permit-needed current blocker form, if field users must complete it from V2 without detouring.
- Billing/external billing/invoice next action when it is the current blocker.
- Service plan visit-count and next-due action placement, if maintenance visit completion requires immediate action from the job page.

## 5. V2 CTA Audit

### Real Routes / Workspaces

- Standard view: `/jobs/{id}?tab={tab}`.
- Customer profile: `mobileCustomerHref`.
- Call/Text: `mobileCallHref`, `mobileTextHref`.
- Navigate: Google Maps directions URL built from address display.
- Equipment: `/jobs/{id}/info?f=equipment`.
- ECC Tests: `/jobs/{id}/tests`.
- Attachments: `/jobs/{id}/attachments`.
- Create Estimate: `createEstimateFromJobHref`.
- Service Plan: `/customers/{id}?tab=service-plans`, with `maFocus` when an existing agreement id is already available; otherwise standard job fallback.
- Service Location edit: existing `serviceLocationEditHref`.

### Standard-Current-View Anchors

These intentionally route to the standard current mobile page by using `standardJobHref` and omitting `mobileLayout=v2`:

- `mobile-work-scope`
- `mobile-tools`
- `mobile-internal-notes`
- `mobile-shared-notes`
- `mobile-invoice-summary-card`
- `mobile-next-service-action`
- `mobile-follow-up-job`
- `mobile-permit-info`
- `mobile-tools-timeline`

These anchors exist in `MobileJobDetailCurrent`, not in the V2 preview DOM, so the standard-view route is the correct safety posture for preview.

### Preview DOM Anchors

The preview does not rely on in-preview hash anchors for major behavior-heavy current actions. This is appropriate until those action forms are intentionally promoted.

### CTA Risk Summary

No reviewed V2 CTA appears to point to a missing in-preview anchor while staying on the preview route. The current pattern is either real route/workspace or standard-current-view anchor with `mobileLayout` omitted.

## 6. Source-Of-Truth Preservation

No source-of-truth changes are introduced by the preview architecture reviewed here:

- ECC test truth remains based on existing ECC state and the existing tests workspace. The preview hardening uses `sp.notice === "ecc_test_required"` plus completed-run truth to avoid treating test availability as a blocker.
- Visit Scope / Work Items truth remains in existing `visitScopeItems`, `visitScopeSummary`, and current edit forms. V2 displays a summary and routes to standard-current work scope.
- Invoice/payment truth remains in existing billing/invoice read models and workspaces. V2 does not duplicate invoice editing or payment behavior.
- Service-plan/maintenance-agreement truth remains in existing customer Service Plans and job-page current surfaces. V2 links to those contexts and does not mutate visit count or next due.
- Timeline/note truth remains in existing deferred bodies and note actions. V2 uses loaded counts/signals only and does not fabricate unread or attachment counts.

## 7. Behavior-Risk Confirmation

No risky behavior should be bundled into promotion:

- No server action changes.
- No schema or migration changes.
- No route reads moved out of `page.tsx`.
- No helper/source-of-truth changes.
- No auth/RLS/permission changes.
- No desktop takeover.
- No invoice/payment/autopay behavior change.
- No duplicate deferred timeline/note reads.
- No new next-action resolver beyond presentation helpers in the preview.

The current preview respects these boundaries.

## 8. State Coverage Review

### ECC Scheduled / Open

Current readiness: mostly safe for preview.  
Expected V2 posture: Scheduled lifecycle, lifecycle action should lead, Compliance Work visible, Billing quiet.  
Promotion blocker: must smoke that tests do not lead unless required-test truth is present.

### ECC On The Way

Current readiness: safe for preview.  
Expected V2 posture: On the way lifecycle, Mark In Progress as current responsibility, Compliance Work supporting.  
Promotion blocker: Undo On the Way remains a standard-view escape; owner must accept or promote exact undo behavior.

### ECC In Progress

Current readiness: improved after ECC test precedence hardening.  
Expected V2 posture: Finish field visit unless required tests are active.  
Promotion blocker: verify completed-test and missing-test fixtures.

### ECC Tests Required

Current readiness: directionally good.  
Expected V2 posture: Next Step can lead with required tests and route to tests workspace.  
Promotion blocker: missing-test copy/status should be visually reviewed with real data.

### ECC Field Complete / Permit Needed

Current readiness: safe only as standard-view escape.  
Expected V2 posture: permit attention should lead; Compliance Work remains prominent.  
Promotion blocker: permit-needed form is not in V2. Decide whether standard-view anchor is acceptable for default users.

### ECC Failed / Pending Office Review

Current readiness: not promotion-ready.  
Expected V2 posture: Correction needed or Review needed, not normal active workflow.  
Promotion blocker: correction review vs retest-ready hierarchy and exact action reachability.

### ECC Retest Needed

Current readiness: not promotion-ready without owner acceptance.  
Expected V2 posture: Retest needed label and safe standard-view action.  
Promotion blocker: schedule retest now / move to needs scheduling forms are not promoted.

### ECC Linked Retest Parent

Current readiness: safer than earlier slices, but still needs real fixture review.  
Expected V2 posture: linked/passive job language, no active-parent implication.  
Promotion blocker: active child link/read-only parent behavior must be smoke-tested.

### Service Scheduled / Open

Current readiness: good for preview.  
Expected V2 posture: normal lifecycle action, Work to Do lane, Billing quiet.  
Promotion blocker: Service-specific variant still needs owner review.

### Service In Progress

Current readiness: partial.  
Expected V2 posture: field completion oriented with Work to Do visible.  
Promotion blocker: `FieldOutcomePanel` secondary outcomes are not first-class in V2.

### Service Field Complete / Billing Needed

Current readiness: safe summary only.  
Expected V2 posture: Work Performed summary plus Billing / Closeout prominence.  
Promotion blocker: invoice/external-billing action branches should be promoted or explicitly standard-linked for default.

### Service Waiting / Parts / Approval

Current readiness: not promotion-ready.  
Expected V2 posture: Waiting on info/part/approval, safe current-view link, no active-work language.  
Promotion blocker: release/progress/return-visit controls are not directly rendered.

### Closed / Cancelled / Archived

Current readiness: safe for preview but needs fixture review.  
Expected V2 posture: read-only/history/tooling language.  
Promotion blocker: ensure no active field action appears on real closed/cancelled/archived jobs.

## 9. Remaining Product Decisions

### Service-Specific Variant

Needed before default promotion. The current Service lane is useful but does not yet fully model the Service finish seam, waiting progress, or field-complete billing posture.

### ECC Failed / Retest Polish

Needed before ECC default promotion if failed/retest states are common field workflows. Owner must decide primary vs secondary presentation for correction review, confirm retest ready, retest scheduling, and linked child continuation.

### Billing / Closeout Preview Hardening

Needed before broad default promotion. V2 can stay summary/link based for preview, but default users need either exact current action branches or an intentional standard-view escape pattern for invoice/external-billing blockers.

### Promotion Mechanism

Do not promote immediately. Best next promotion mechanism is an env-flagged internal mobile default after remaining blockers are handled and QA screenshots are approved. Query-param preview should remain available during that transition.

## 10. Recommended Promotion Path

Recommendation: no promotion yet.

Next safest target: promote behind a feature flag for internal users only, after parity blockers are handled. Do not promote ECC-only or Service-only yet:

- ECC has stronger visual direction but failed/retest/permit blockers still need action parity decisions.
- Service has Work to Do, but the Service-specific variant and finish/waiting/billing semantics are not complete.
- Promoting all mobile users now would make standard-view escapes too frequent for action-heavy jobs.

## 11. Required Implementation Sequence For Recommended Path

1. Add an M4-B source/CTA guard test pass:
   - default mobile remains `MobileJobDetailCurrent`;
   - V2 remains query-param or future flag gated;
   - preview standard-view anchors omit `mobileLayout=v2`;
   - no preview CTA hash targets a missing in-preview anchor.

2. Complete Service-specific V2 variant hardening:
   - promote or safely standard-link `FieldOutcomePanel` outcomes;
   - handle waiting, parts, approval, unable-to-complete, return visit, and field-complete billing states;
   - keep Work Items separate from invoice charges.

3. Complete ECC failed/retest hardening:
   - decide correction-review vs retest-ready priority;
   - add linked-child passive summary with safe child/current-view route;
   - keep retest forms standard-linked unless exact payload parity is promoted.

4. Complete permit and billing blocker hardening:
   - decide whether permit-needed and invoice/external-billing blockers are direct V2 forms or standard-view escapes;
   - preserve hidden field names, `return_to`, and server action payloads if promoted.

5. Run the M3-F screenshot matrix:
   - 360px, 390px, 430px;
   - ECC scheduled/open, on the way, in progress, tests required, permit needed, failed/retest, linked parent;
   - Service scheduled/open, in progress, field complete billing, waiting/parts/approval;
   - closed/cancelled/archived.

6. Add an env flag for default mobile selection:
   - keep `?mobileLayout=v2` as explicit override;
   - keep a fallback path to current mobile;
   - do not affect desktop.

7. Run focused and stateful validation:
   - `npx.cmd tsc --noEmit`;
   - `git diff --check`;
   - focused job-detail source-inspection tests;
   - lifecycle, waiting, ECC, invoice, service-location, notes/timeline fail-open, and maintenance-agreement tests as touched;
   - authenticated mobile smoke for the state matrix.

8. Promote gradually:
   - internal-only flag in local/staging;
   - owner screenshot review;
   - limited internal default;
   - keep query-param/current fallback until post-launch validation is clean.

## 12. Explicit Non-Actions

This audit did not change product code.

It did not:

- promote V2 to default;
- change desktop rendering;
- change layout, styling, actions, anchors, form fields, return values, route reads, helpers, schemas, permissions, or shared components;
- add schema/migration/Supabase changes;
- change server actions;
- change ECC, Visit Scope, invoice/payment, service-plan, timeline, or note truth;
- duplicate deferred reads;
- implement Service full variant, invoice redesign, or ECC failed/retest polish.
