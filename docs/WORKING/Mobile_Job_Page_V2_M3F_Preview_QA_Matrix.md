# Mobile Job Page V2 M3-F Preview QA Matrix

Status: Phase M3-F QA plan only  
Date: 2026-06-26  
Scope: preview-only internal mobile `/jobs/[id]?mobileLayout=v2`

## 1. QA Intent

This matrix defines the screenshot and state-review pass needed before further Mobile Job Page V2 implementation. It is not an implementation plan and does not authorize promotion.

The preview must remain gated behind `mobileLayout === "v2"` in `app/jobs/[id]/page.tsx`. Default `/jobs/[id]` must continue rendering `MobileJobDetailCurrent`, and desktop must remain unchanged.

Primary QA questions:

- Does the first viewport show the right job identity and field responsibility?
- Does the page avoid implying false workflow truth?
- Are CTAs either real workspaces or safe links back to the standard/current mobile view?
- Do exception states read as paused, read-only, review, or linked-work states rather than normal active field work?
- Does the layout remain readable at 360px, 390px, and 430px widths?

## 2. Invariant Checks

Confirm in every state:

- `/jobs/[id]` renders current mobile layout, not V2.
- `/jobs/[id]?mobileLayout=v2` renders `MobileJobDetailV2Preview`.
- Desktop viewport still renders the existing desktop branch.
- The hero shows job title/reference/type, customer, schedule, service address, and Call/Text/Navigate affordances where available.
- Image fallback never blocks job identity, address, schedule, or next action.
- Lifecycle rail is display-only.
- Next Step has one dominant responsibility.
- Compliance Work or Service Work is visible before supporting sections.
- Evidence & Notes rows are full-width, readable, and use only grounded badges/signals.
- More Details / Tools is collapsed by default; nested rows are hidden until expanded.
- Preview links to current mobile anchors omit `mobileLayout=v2` and route through standard current view.

## 3. State QA Matrix

### ECC Scheduled / Open

Above the fold should show:

- Photo hero with job identity, customer, schedule, address, and navigation.
- Lifecycle rail active on `Scheduled`.
- Next Step should prefer normal lifecycle progression such as heading to the job, not tests unless the existing required-test signal is present.
- Compliance Work prominent with Equipment, ECC Tests, and Permit Info.
- Billing / Closeout quiet with no billing action unless existing billing gates are active.

Must not happen:

- Do not show `Complete required tests` just because the tests surface exists.
- Do not lead with invoice/billing.
- Do not hide Compliance Work.

Recommended screenshots:

- 390px first viewport with scheduled date/time visible.
- 360px top-through-Compliance Work to verify wrapping.

### ECC On The Way

Above the fold should show:

- Lifecycle rail active on `On the way`.
- Next Step should prefer `Start the visit` / Mark In Progress behavior.
- Compliance Work remains visible as supporting work.
- Undo On the Way, if present, should remain a safe current-view/tooling link.

Must not happen:

- Do not displace Mark In Progress with tests unless tests are explicitly required/blocking.
- Do not show office-owned or closeout language unless existing state says so.

Recommended screenshots:

- 390px first viewport showing lifecycle and Next Step.
- 430px with the Undo On the Way link if the fixture supports it.

### ECC In Progress

Above the fold should show:

- Lifecycle rail active on `In progress`.
- Next Step should be field-completion oriented unless required tests are actually active.
- Compliance Work prominent.
- Billing / Closeout quiet unless existing billing/closeout gates are active.

Must not happen:

- Do not say tests are required after tests are complete.
- Do not make invoice the primary lane while compliance/field work is still active.

Recommended screenshots:

- 390px first viewport.
- 360px Compliance Work rows with long job title/customer if available.

### ECC Tests Required

Above the fold should show:

- Lifecycle rail active on the current field stage.
- Next Step may show `Complete required tests`.
- CTA should go to the real tests workspace.
- Compliance Work should still show ECC Tests as a launcher, not as the only source of truth.
- Billing / Closeout should remain quiet.

Must not happen:

- Do not fabricate test counts or pass/fail status.
- Do not imply tests are complete.

Recommended screenshots:

- 390px first viewport with `Complete required tests`.
- 430px through Compliance Work showing ECC Tests row.

### ECC Field Complete / Permit Needed

Above the fold should show:

- Lifecycle rail active on `Field done`.
- Next Step should show permit attention such as `Add permit information`.
- CTA should safely route to standard current view anchor for permit action.
- Compliance Work remains prominent.
- Billing / Closeout may be visible if closeout/billing gates are active, but should not replace permit responsibility.

Must not happen:

- Do not duplicate the permit form in preview.
- Do not point to a missing in-preview anchor.
- Do not treat permit status chip as a button unless it is a launcher.

Recommended screenshots:

- 390px first viewport with permit Next Step.
- 360px after tapping CTA target in standard view if doing manual smoke.

### ECC Failed / Pending Office Review

Above the fold should show:

- Lifecycle rail with attention label `Correction needed` or `Review needed`.
- Next Step should keep existing retest-ready priority when current preview gates support it.
- Otherwise, Next Step should read as review/correction, not normal field progression.
- Compliance Work remains visible but not misleadingly "all normal."
- Evidence & Notes should be easy to reach.

Must not happen:

- Do not show a clean normal lifecycle with no attention context.
- Do not imply the tech can simply continue normal field work.
- Do not decide correction-review versus retest-ready priority beyond existing gates in the preview.

Recommended screenshots:

- 390px first viewport for failed.
- 390px first viewport for pending office review if a separate fixture exists.

### ECC Retest Needed

Above the fold should show:

- Lifecycle rail with attention label `Retest needed`.
- Next Step should show existing retest scheduling/review wording where gated.
- CTA should route safely to standard current view action area.
- Compliance Work and Evidence & Notes remain available.

Must not happen:

- Do not duplicate retest forms or payloads.
- Do not imply original parent job is a fresh normal field visit.

Recommended screenshots:

- 390px first viewport.
- 430px through Next Step and Compliance Work.

### ECC Linked Retest Parent

Above the fold should show:

- Lifecycle rail attention label `Linked active job`.
- Next Step should read as linked/passive work if existing props identify it.
- CTA should route to standard current view tools/history, not invent a child action.
- Compliance Work may remain available, but should not imply the parent is the active work item.

Must not happen:

- Do not imply the parent job is the active dispatch target.
- Do not hide the passive/historical nature if current props expose it.

Recommended screenshots:

- 390px first viewport of linked parent.
- 360px after expanding More Details / Tools.

### Service Scheduled / Open

Above the fold should show:

- Photo hero with schedule/address/contact context.
- Lifecycle rail active on `Scheduled`.
- Next Step should be field progression such as heading to the job.
- Work lane should show `Work to Do` with visit summary / Work Items from existing Visit Scope.
- Billing / Closeout quiet unless existing billing gates are active.

Must not happen:

- Do not hide Work Items below Billing / Closeout.
- Do not treat Work Items as invoice charges.

Recommended screenshots:

- 390px first viewport.
- 360px through Work to Do lane.

### Service In Progress

Above the fold should show:

- Lifecycle rail active on `In progress`.
- Next Step should be field completion oriented.
- Work lane should show `Work to Do` or current work summary.
- Billing / Closeout should remain secondary unless existing billing gates are active.

Must not happen:

- Do not promote billing before field work is complete unless current state requires it.
- Do not omit Work Items / visit scope.

Recommended screenshots:

- 390px first viewport.
- 430px with Work Items list if multiple items exist.

### Service Field Complete / Billing Needed

Above the fold should show:

- Lifecycle rail active on `Field done` or closeout depending on current truth.
- Next Step may show billing/closeout responsibility when existing gates require it.
- Work lane should show `Work Performed`.
- Billing / Closeout should be prominent enough to identify invoice/external billing action.
- Evidence & Notes remain reachable below.

Must not happen:

- Do not duplicate invoice forms or invoice workspace.
- Do not change billing/payment truth or imply final payment/closeout optimistically.

Recommended screenshots:

- 390px first viewport with billing Next Step.
- 360px through Work Performed and Billing / Closeout.

### Service Waiting / Parts / Approval

Above the fold should show:

- Lifecycle rail attention label grounded by existing waiting state: `Waiting on info`, `Waiting on part`, `Approval needed`, `Paused`, or `Waiting`.
- Next Step should be a waiting/tools link, not normal Mark On the Way / Mark In Progress / Finish Visit.
- Work lane remains visible for context.
- Billing / Closeout quiet unless separately gated.

Must not happen:

- Do not show active-work language when waiting is office-owned or blocker-owned.
- Do not fabricate waiting reason.
- Do not duplicate release/re-evaluate forms in preview.

Recommended screenshots:

- 390px first viewport for parts-needed.
- 390px first viewport for approval-needed if fixture exists.
- 360px top-through-work-lane to verify long reason wrapping.

### Closed / Cancelled / Archived

Above the fold should show:

- Lifecycle rail attention/read-only label: `Job closed`, `Job cancelled`, or `Archived`.
- Next Step should be read-only/history/tooling language such as `Review job history`.
- Evidence & Notes and More Details / Tools remain reachable.
- Billing / Closeout should reflect existing closed/billing truth only.

Must not happen:

- Do not show Mark On the Way, Start Visit, Finish Visit, or other active field language.
- Do not imply work remains active unless current closeout truth says review is needed.
- Do not promote V2 as default for historical review.

Recommended screenshots:

- 390px first viewport for closed.
- 390px first viewport for cancelled.
- 390px first viewport for archived if a non-redirectable fixture exists.

## 4. Viewport Checklist

Run each representative state at:

- 360px width: smallest common field-phone width; check wrapping, badge collisions, CTA height, and hero overlay.
- 390px width: common modern mobile width; owner-review baseline.
- 430px width: large phone width; verify layout does not feel sparse or shift hierarchy.

For each viewport:

- Confirm no horizontal scrolling.
- Confirm hero overlay does not cover unreadable address or controls.
- Confirm lifecycle labels do not overlap.
- Confirm Next Step title and CTA fit cleanly.
- Confirm Evidence & Notes rows stay full-width and badges attach to their row.
- Confirm Billing / Closeout only rises visually when relevant.
- Confirm More Details / Tools is collapsed by default and expands cleanly.

## 5. Negative QA Checklist

The preview must not:

- Take over default `/jobs/[id]`.
- Affect desktop rendering.
- Lead active ECC field/compliance work with invoice or billing unless existing gates require it.
- Show tests as required unless `sp.notice === "ecc_test_required"` and no completed ECC test run is present.
- Use active-work language on cancelled, archived, closed, linked-parent, or waiting jobs.
- Route CTA hashes to anchors missing from the V2 preview DOM unless the link intentionally exits to standard/current view.
- Show `New` note indicators unless existing note banner signals exist.
- Add attachment counts without an already-loaded count.
- Treat Work Items as billing truth or invoice charges.
- Duplicate server-action forms, invoice forms, retest forms, permit forms, waiting release forms, or Visit Scope editors.

## 6. Screenshot Set For Owner Review

Minimum owner-review screenshots:

- ECC scheduled/open at 390px.
- ECC in progress with no required tests at 390px.
- ECC tests required at 390px.
- ECC field complete / permit needed at 390px.
- ECC failed or pending office review at 390px.
- ECC retest needed at 390px.
- ECC linked retest parent at 390px.
- Service scheduled/open with Work to Do at 390px.
- Service in progress with Work Items at 390px.
- Service field complete / billing needed at 390px.
- Service waiting on part or approval at 390px.
- Closed/cancelled/archived read-only state at 390px.

Responsive spot-check screenshots:

- One ECC normal active state at 360px, 390px, and 430px.
- One Service Work Items state at 360px, 390px, and 430px.
- One Evidence & Notes state with note badges at 360px and 390px.
- One exception/read-only state at 360px and 390px.

Interaction screenshots:

- More Details / Tools collapsed.
- More Details / Tools expanded with Job Tools and Location & Address.
- Standard current-view target reached from a preview CTA that exits to `#mobile-work-scope`, `#mobile-tools`, `#mobile-next-service-action`, or `#mobile-invoice-summary-card`.

## 7. Remaining Hardening Recommendations

Safest to riskiest:

1. Visual/readability polish within `MobileJobDetailV2Preview` only: spacing, type scale, row wrapping, and icon consistency.
2. Service-specific variant refinement using existing Visit Scope, waiting, field-complete, and billing gates already passed into the preview.
3. ECC failed/retest polish that exposes clearer read-only summaries and standard-view links without duplicating forms.
4. Billing / Closeout preview hardening that better separates ECC closeout, Service invoice, external billing, and no-charge states without changing invoice behavior.
5. CTA audit automation or source-inspection expansion for every preview link/anchor.
6. Promotion-readiness work that decides which current mobile action forms can move into V2. This is highest risk because it touches action placement, return anchors, and form payload preservation.

## 8. Recommended Next Slice

Recommended next implementation slice: **visual polish/readability**.

Rationale:

- M3-C, M3-D, and M3-E have already reduced the largest semantic risks: ECC tests are no longer treated as required just because the surface exists, Work Items are visible, and exception states no longer sound like normal active field work.
- Before adding Service-specific behavior or billing complexity, the owner should review screenshots for hierarchy, wrapping, first-viewport density, CTA clarity, and section order.
- Visual/readability polish is the lowest-risk next step and can stay preview-only.

Second choice after owner screenshot review: **Service-specific variant**, because Service jobs now have the Work to Do lane but still need a deliberate state pass distinct from ECC.

Defer until after screenshot review:

- ECC failed/retest polish, because priority between correction review, retest readiness, and retest scheduling needs owner/product judgment.
- Billing/closeout preview hardening, because invoice/payment correctness has higher blast radius.
- Promotion-readiness, because it requires deciding which current forms/actions move into V2 and preserving exact anchors/payloads.
