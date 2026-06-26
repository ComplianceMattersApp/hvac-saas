# Mobile Job Page V2 M3-A State-Specific Preview Audit

Status: Phase M3-A audit only  
Date: 2026-06-26  
Scope: preview-only mobile `/jobs/[id]?mobileLayout=v2`

## 1. Executive Verdict

The current V2 preview shell is useful as a first-viewport hierarchy prototype, but it is not yet state-complete. It safely remains preview-only behind `mobileLayout === "v2"` in `app/jobs/[id]/page.tsx`; the default mobile route still selects `MobileJobDetailCurrent`, and desktop remains owned by the existing `lg:block` branch.

The strongest parts of the preview are:

- photo-led job identity and contact/navigation affordances from existing props;
- display-only lifecycle rail from `job.status`, `job.ops_status`, `field_complete`, schedule presence, billing state, and cert truth;
- a single dominant Next Step card using existing safe lifecycle/action branches or links to existing mobile anchors;
- ECC-first Compliance Work presentation;
- Evidence & Notes as simple full-width launchers with existing note-count and banner-derived `New` signals;
- collapsed More Details / Tools with the service-location edit affordance moved into the disclosure.

Main hardening gaps before promotion:

- The preview does not consume several current mobile branches: linked retest parent summary, correction-review form, historical service follow-up continued summary, waiting release controls, full Service follow-up progress controls, and the current mobile invoice/action variants.
- ECC active work precedence is too broad because `showMobileEccTestAction` means "ECC tests surface exists," not necessarily "tests still required." This can make `Complete required tests` dominate normal scheduled/open ECC jobs.
- Service waiting/pending-info states are partially represented through `isServiceFieldFollowUpPendingInfo`, but generic `activeWaitingState` and release actions are not used by the preview Next Step helper.
- Lifecycle attention labels intentionally degrade failed/retest/waiting states to `Needs attention`, but the rail still highlights a normal stage, which can be misleading for failed, retest, linked-child, cancelled, and archived states.
- Billing / Closeout is presentation-only and uses existing gates, but it can hide some detailed current mobile invoice/external-billing actions behind a generic summary.

No product code, schema, actions, helpers, permissions, reads, anchors, form fields, return values, shared components, or tests were changed by this audit.

## 2. Source Basis

Reviewed:

- `docs/ACTIVE/Mobile_Job_Page_V2_Blueprint.md`
- `docs/WORKING/Mobile_Job_Page_V2_M1_Readiness_Audit.md`
- `docs/WORKING/Mobile_Job_Page_V2_M1D_Performance_Opportunity_Audit.md`
- `app/jobs/[id]/page.tsx`
- `app/jobs/[id]/_components/MobileJobDetailCurrent.tsx`
- `app/jobs/[id]/_components/MobileJobDetailV2Preview.tsx`

Important current V2 preview behavior:

- Lifecycle rail stages are fixed: `Scheduled`, `On the way`, `In progress`, `Field done`, `Closeout`.
- Lifecycle active stage is derived from closed truth, `field_complete`, `status=completed`, `status/ops_status=in_process`, `status/ops_status=on_the_way`, else scheduled.
- Attention label is display-only: `Paused for information`, `On hold`, `Needs scheduling`, `Cancelled`, `Archived`, or fallback `Needs attention`.
- Next Step priority is currently:
  1. permit needed when not primary closeout blocker;
  2. confirm retest ready;
  3. retest scheduling;
  4. Service follow-up pending info;
  5. primary closeout blockers;
  6. active ECC work with tests available;
  7. active ECC permit;
  8. active ECC certs;
  9. Service invoice field action;
  10. `status=completed` but not field complete;
  11. generic lifecycle action;
  12. generic closeout/tools fallback.
- Billing / Closeout quiets active ECC work only when ECC is not field complete and no existing invoice/external-billing gates are active.
- Evidence & Notes uses existing `internalNotesMeta`, `sharedNotesMeta`, `internalNoteBannerMessage`, and `sharedNoteBannerMessage`. It does not add attachment counts.
- More Details / Tools is a native collapsed disclosure. `Location & Address / Edit service location` uses existing `serviceLocationEditHref`.

## 3. State Matrix

### 1. ECC scheduled/open

Expected preview behavior:

- Lifecycle rail: active `Scheduled`; no attention label when schedule exists. If `ops_status=need_to_schedule` and no schedule info, attention label `Needs scheduling`.
- Primary next-step card: currently likely `Complete required tests` when `showMobileEccTestAction` is true, even if the job is merely scheduled/open.
- Primary action or fallback: link to `/jobs/{id}/tests`; otherwise generic `JobFieldActionButton` would show the existing lifecycle action such as Mark On the Way.
- Compliance Work: prominent, with Equipment, ECC Tests, and Permit Info launchers.
- Billing / Closeout: should be quiet with `No billing action needed yet`; current helper should quiet it for active ECC with no invoice gates.
- Evidence & Notes: stable full-width action rows; internal/shared note badges and `New` signal if existing banners are present; Files & Attachments link only.
- More Details / Tools: collapsed by default; Job Tools and Location & Address visible only after expand.

Contradictions / risks:

- The preview may lead with `Complete required tests` too early. The current mobile page still prioritizes field lifecycle (`Mark On the Way`) for scheduled/open jobs while tests are a launcher.
- This can imply tests are the immediate responsibility before the technician is on site.

Missing current mobile action:

- Direct lifecycle action may be displaced by test link in the preview.

Recommendation:

- In a future hardening slice, distinguish "ECC tests surface exists" from "tests are currently required/blocking." Scheduled/open should prefer the lifecycle action unless an existing blocker explicitly requires tests.

### 2. ECC on the way

Expected preview behavior:

- Lifecycle rail: active `On the way`.
- Primary next-step card: could be `Complete required tests` because of broad ECC test precedence; otherwise `Start the visit`.
- Primary action or fallback: test link if current helper chooses ECC work; otherwise `JobFieldActionButton` for Mark In Progress.
- Compliance Work: prominent.
- Billing / Closeout: quiet unless current invoice/billing gates are active.
- Evidence & Notes: stable action list.
- More Details / Tools: collapsed; includes Job Tools and Location & Address after expand.

Contradictions / risks:

- On the Way state should normally lead with `Start the visit` / Mark In Progress. Broad tests precedence may skip the immediate lifecycle transition.
- Undo On the Way remains a text link below the Next Step card when `onTheWayUndoEligibility.eligible`, but it links back to the current page rather than duplicating the form.

Missing current mobile action:

- Current mobile has the exact Undo On the Way behavior and return handling. Preview only surfaces a safe link to job tools/current page, not the direct undo form.

Recommendation:

- Keep Undo as a secondary current-layout link until the exact form and return behavior are promoted intentionally.

### 3. ECC in progress

Expected preview behavior:

- Lifecycle rail: active `In progress`.
- Primary next-step card: likely `Complete required tests` if `showMobileEccTestAction` is true. If not, `Complete work` through `JobFieldActionButton`.
- Primary action or fallback: `/jobs/{id}/tests` link or inline lifecycle button.
- Compliance Work: prominent.
- Billing / Closeout: quiet until real billing/closeout gates are active.
- Evidence & Notes: stable action list.
- More Details / Tools: collapsed.

Contradictions / risks:

- If tests are already complete, `showMobileEccTestAction` can still make the preview imply tests remain the next duty.
- Current mobile can reject completion with missing-test notice, but it does not always say tests are the next action simply because ECC tests exist.

Missing current mobile action:

- Current mobile provides broader field status/action context and missing-test notice handling. Preview shows only one branch.

Recommendation:

- Future state hardening should use existing completed/latest ECC run truth to decide whether tests are action, status, or hidden behind Compliance Work.

### 4. ECC in progress with tests still required

Expected preview behavior:

- Lifecycle rail: active `In progress`.
- Primary next-step card: `Complete required tests`.
- Primary action or fallback: `/jobs/{id}/tests`.
- Compliance Work: prominent, with ECC Tests launcher.
- Billing / Closeout: quiet.
- Evidence & Notes: stable action list.
- More Details / Tools: collapsed.

Contradictions / risks:

- This is one of the states the current preview handles well, provided the test requirement is truly grounded by current state.
- The preview currently cannot distinguish "tests still required" from "tests route exists."

Missing current mobile action:

- The current mobile missing-test attention/notice path is not represented as a distinct blocker summary in V2 preview.

Recommendation:

- Add a future display-only test status from already-loaded ECC run truth before calling this branch authoritative.

### 5. ECC field complete / permit needed

Expected preview behavior:

- Lifecycle rail: active `Field done`; attention label may be absent unless `ops_status` is in the attention set.
- Primary next-step card: `Add permit information` when `isEccPermitNeededActive` and not `showPrimaryCloseoutBlockers`.
- Primary action or fallback: link to `#mobile-ecc-permit-needed-action`.
- Compliance Work: prominent; Permit Info row still shown as `Status`.
- Billing / Closeout: may show closeout/billing attention if closeout/invoice gates are active; otherwise quiet.
- Evidence & Notes: stable action list.
- More Details / Tools: collapsed.

Contradictions / risks:

- The preview does not duplicate the permit form. That is intentional and safe, but the primary card link depends on the current mobile anchor existing in `MobileJobDetailCurrent` when the preview route is open.
- Because the preview replaces current mobile content on `mobileLayout=v2`, `#mobile-ecc-permit-needed-action` may not exist in the preview DOM unless the current action area is still rendered elsewhere. This is a critical anchor parity risk.

Missing current mobile action:

- Current mobile has the actual `markEccPermitAvailableFromForm` form with hidden `return_to=#mobile-ecc-permit-needed-action`. Preview only links to the anchor.

Recommendation:

- For preview-only shell this is acceptable as a safe fallback only if there is a reachable current/standard view or tool route. Before promotion, either include a safe current action branch or route the button to standard view plus anchor.

### 6. ECC field complete / certs needed

Expected preview behavior:

- Lifecycle rail: active `Field done`.
- Primary next-step card: if `showPrimaryCloseoutBlockers`, `Finish compliance closeout`; otherwise, if active ECC work and `closeoutNeeds.needsCerts`, `Finish certification items`.
- Primary action or fallback: `#mobile-next-service-action` or `#mobile-tools`.
- Compliance Work: prominent, as Compliance Closeout/Work still matters.
- Billing / Closeout: should be prominent only if closeout/billing gates are active; otherwise quiet.
- Evidence & Notes: stable.
- More Details / Tools: collapsed.

Contradictions / risks:

- Cert action availability (`canShowCertsButton`, permit-valid rules, failure-state suppression) is not passed into or interpreted by the preview.
- The card can say `Finish certification items` without knowing whether the actual cert button is available.

Missing current mobile action:

- Current mobile can show `Certs Sent` form inside closeout blockers. Preview only links to existing areas.

Recommendation:

- Future M3/M4 work should keep certs as a status/action split: read-only cert blocker unless current `canShowCertsButton` is true and the existing form branch is safely available.

### 7. ECC failed / pending office review

Expected preview behavior:

- Lifecycle rail: stage likely `Scheduled` unless `field_complete/status` moves it to `Field done`; attention label `Needs attention`.
- Primary next-step card: `Confirm retest readiness` when `showConfirmRetestReady` is true.
- Primary action or fallback: link to `#mobile-next-service-action`.
- Compliance Work: prominent.
- Billing / Closeout: probably quiet unless closeout/billing gates are active.
- Evidence & Notes: stable and important because correction/retest often depends on notes/evidence.
- More Details / Tools: collapsed.

Contradictions / risks:

- Current mobile may also expose `Resolve by Correction Review` when `showCorrectionReviewResolution` is true. Preview ignores that branch.
- Failed/pending-office-review lifecycle rail can visually look like a normal scheduled or field-done job plus a generic `Needs attention` label.
- The primary card chooses retest readiness over correction review without surfacing the competing path.

Missing current mobile action:

- Correction review form and failed/retest history panel are not represented in the preview first viewport.

Recommendation:

- Owner decision remains needed: failed-family priority should choose Confirm Retest Ready as primary and Correction Review as secondary, or vice versa, using current gates.

### 8. ECC retest needed

Expected preview behavior:

- Lifecycle rail: stage likely `Scheduled` or `Field done` depending on source fields; attention label `Needs attention`.
- Primary next-step card: `Schedule the retest`.
- Primary action or fallback: link to `#mobile-next-service-action`.
- Compliance Work: prominent.
- Billing / Closeout: quiet unless billing gates are active.
- Evidence & Notes: stable.
- More Details / Tools: collapsed, current tools/history reachable after expand.

Contradictions / risks:

- Current mobile retest section can expose two legitimate actions: schedule now and move to needs scheduling. Preview compresses them into one action label.
- If the preview route does not render the current retest form, the anchor target may not exist.

Missing current mobile action:

- `scheduleRetestNowFromForm` and `createRetestJobFromForm` payloads are not present in preview.

Recommendation:

- Keep preview action as a safe link only. Future promotion should either render the exact current retest action branch or provide a standard-view anchored escape.

### 9. ECC linked retest child / historical parent

Expected preview behavior:

- Lifecycle rail: no special linked-parent handling in `buildLifecyclePreview`; may show normal stage with no passive historical framing.
- Primary next-step card: no use of `showLinkedRetestCreated`, `linkedRetestPassiveHeading`, or `linkedRetestPassiveCopy`. It may fall through to closeout, tests, or generic tools.
- Primary action or fallback: not specifically linked child.
- Compliance Work: likely prominent.
- Billing / Closeout: depends on gates.
- Evidence & Notes: stable.
- More Details / Tools: collapsed. The preview only has generic Job Tools and Location & Address; it does not expose Retest / Correction History as a row.

Contradictions / risks:

- This is a major preview gap. Current mobile treats linked retest parent as passive/historical and points users to the child job.
- Preview might imply the parent job is still the active work item.

Missing current mobile action:

- Open linked retest child link and passive retest continuation summary.

Recommendation:

- Before hardening, add explicit linked-child passive state using already-passed `showLinkedRetestCreated`, `linkedRetestPassiveHeading`, `linkedRetestPassiveCopy`, and active child link data if safely available. Do not invent new reads.

### 10. Service scheduled/open

Expected preview behavior:

- Lifecycle rail: active `Scheduled`; `Needs scheduling` only if `need_to_schedule` and no schedule info.
- Primary next-step card: `Head to the job`.
- Primary action or fallback: inline `JobFieldActionButton`, expected Mark On the Way.
- Compliance Work / Work lane: `Work Performed` should be prominent enough to show visit reason/work item entry.
- Billing / Closeout: quiet unless current billing gates are active.
- Evidence & Notes: stable. Shared Notes may be hidden when `showSharedNotesCard` false.
- More Details / Tools: collapsed.

Contradictions / risks:

- This state is broadly aligned with current behavior.
- The Work Performed lane is thin and only links to current work scope; it does not surface full Service field outcome controls.

Missing current mobile action:

- Current mobile has Quick Field Actions and Field Operations Board below status; preview demotes them into hero/tools/context.

Recommendation:

- Acceptable for preview. Service full variant remains intentionally deferred.

### 11. Service on the way / in progress

Expected preview behavior:

- Lifecycle rail: active `On the way` or `In progress`.
- Primary next-step card: `Start the visit` or `Complete work`/surface-profile finish label.
- Primary action or fallback: inline `JobFieldActionButton`.
- Work lane: `Work Performed` prominent, with work item count/link.
- Billing / Closeout: likely quiet while field work active.
- Evidence & Notes: stable.
- More Details / Tools: collapsed.

Contradictions / risks:

- Current mobile can render `FieldOutcomePanel` for Service finish outcomes, including parts/approval/unable-to-complete flows. Preview does not render `FieldOutcomePanel`.
- If `JobFieldActionButton` alone is not enough at the finish seam, the preview can underrepresent current Service outcome choices.

Missing current mobile action:

- Service outcome panel actions and secondary outcomes are not promoted in preview.

Recommendation:

- Service full variant should explicitly decide how the finish seam surfaces FieldOutcomePanel without duplicating server actions or form payloads.

### 12. Service field complete / ready for billing

Expected preview behavior:

- Lifecycle rail: active `Field done`.
- Primary next-step card: `Review billing` when `showMobileServiceInvoiceFieldAction` is true; otherwise generic `Review remaining closeout`.
- Primary action or fallback: link to `#mobile-invoice-summary-card` or `#mobile-tools`.
- Work lane: `Work Performed` should be quiet summary.
- Billing / Closeout: prominent when invoice gates are active; shows invoice state/summary/action from existing props.
- Evidence & Notes: stable.
- More Details / Tools: collapsed.

Contradictions / risks:

- Preview billing summary is not the invoice workspace and does not render current invoice forms. This is correct for preview but must not imply invoice was completed.
- If `#mobile-invoice-summary-card` does not exist in preview DOM, the primary billing link can be a dead in-page anchor.

Missing current mobile action:

- Current mobile invoice summary card and direct create/open invoice form/link are not duplicated in preview.

Recommendation:

- Before promotion, either render a safe billing entry component in preview or send billing CTA to the invoice workspace/current standard route rather than a missing preview anchor.

### 13. Service external billing

Expected preview behavior:

- Lifecycle rail: likely `Field done` or `Closeout` depending on status/ops.
- Primary next-step card: because `showPrimaryCloseoutBlockers` comes before billing preview, likely `Closeout responsibility`; Billing / Closeout may show `External billing needed`.
- Primary action or fallback: `#mobile-next-service-action` or Billing / Closeout link to `#mobile-next-service-action`.
- Work lane: quiet.
- Billing / Closeout: prominent; status `Action needed`, action `Open billing action`.
- Evidence & Notes: stable.
- More Details / Tools: collapsed.

Contradictions / risks:

- Current mobile has actual `completeDataEntryFromForm` / `markInvoiceCompleteFromForm` branches under closeout/external billing. Preview only links.
- External billing remains separate from internal invoicing in copy, which is good.

Missing current mobile action:

- Direct external billing completion form is not rendered in preview.

Recommendation:

- Keep as safe link in preview. Future hardening should render the exact existing branch or link to standard view with anchor.

### 14. Service waiting / pending info / parts or approval needed

Expected preview behavior:

- Lifecycle rail: active stage based on underlying lifecycle plus attention label `Paused for information`, `On hold`, or `Needs attention`.
- Primary next-step card: only Service follow-up pending info is specifically handled. It shows the existing reason display and action label `Update follow-up`.
- Primary action or fallback: link to `#mobile-next-service-action`.
- Work lane: likely prominent or summary depending on field state.
- Billing / Closeout: quiet unless billing gates are active.
- Evidence & Notes: stable.
- More Details / Tools: collapsed.

Contradictions / risks:

- Generic `activeWaitingState` and `canShowWaitingReleaseQuickAction` are not used by the preview Next Step helper.
- Current mobile can show Mark Part Ordered, Mark Part Arrived, Mark Approval Received, release/reevaluate, create return visit, or schedule return now. Preview compresses this into `Update follow-up` link.
- Pending-info/on-hold state may still show a normal stage and generic attention label.

Missing current mobile action:

- Waiting release controls, part/approval progress controls, and return-visit creation/scheduling forms.

Recommendation:

- Future state hardening needs a Service waiting/follow-up pass before preview can be considered state-complete.

### 15. Closed / cancelled / archived / historical states

Expected preview behavior:

- Lifecycle rail: closed truth maps to active `Closeout`; `status=cancelled` maps attention label `Cancelled`; `ops_status=archived` maps `Archived`.
- Primary next-step card: may fall through to `Review compliance closeout` or `Review remaining closeout`; could also show billing if gates are active.
- Primary action or fallback: `Open job tools` or billing link.
- Compliance Work / Work lane: still visible.
- Billing / Closeout: visible, possibly quiet or status driven.
- Evidence & Notes: stable.
- More Details / Tools: collapsed.

Contradictions / risks:

- Cancelled/archived jobs should not imply normal action progression. The current lifecycle rail still highlights a stage and the Next Step card may imply remaining work.
- Historical parent states beyond linked retest are not specially handled.

Missing current mobile action:

- Current mobile/tooling has richer job status tools and timeline/history context. Preview only exposes collapsed Job Tools.

Recommendation:

- Add closed/cancelled/archived exception treatment before promotion: read-only summary, no implied field action, and history/tools as primary safe fallback.

## 4. Cross-State Findings

### Lifecycle Rail

- Works adequately for normal scheduled, on-the-way, in-progress, field-done, and closeout states.
- Needs explicit exception handling for failed, pending-office-review, retest-needed, linked historical parent, waiting/on-hold, cancelled, and archived states.
- `Needs attention` is safe but not sufficiently explanatory for failed/retest states.

### Next Step

- The preview currently has a useful priority scaffold, but it is not the current mobile action resolver.
- ECC tests are over-prioritized because the branch uses `showMobileEccTestAction`, not "tests missing/blocking."
- Several current mobile action families are only links or absent: correction review, linked child, waiting release, service follow-up details, external billing, certs, invoice forms.
- Any future hardening should continue to reuse current actions and anchors rather than invent a new resolver.

### Compliance Work / Work Performed

- ECC Compliance Work is appropriately prominent for most active ECC states.
- ECC failed/retest and linked-child states need a more specific correction/retest lane.
- Service Work Performed is intentionally light and should not be treated as Service full variant readiness.

### Billing / Closeout

- Quiet ECC active-work handling is directionally correct.
- Service billing promotion is directionally correct after field completion.
- The preview should avoid linking to anchors that are not rendered in the preview DOM. This is the largest action-reachability risk for permit, retest, and invoice CTAs.

### Evidence & Notes

- Current V2 preview behavior is safe and low risk:
  - `Team Notes` links to `#mobile-internal-notes`;
  - `Shared Notes` links to `#mobile-shared-notes` only when `showSharedNotesCard`;
  - `Files & Attachments` links to `/jobs/{id}/attachments`;
  - counts use existing note meta only;
  - `New` uses existing banner messages only.
- It does not duplicate deferred reads and does not invent attachment counts.

### More Details / Tools

- The preview now behaves as a true collapsed disclosure.
- It only exposes a generic Job Tools link and Location & Address when expanded.
- Current mobile More Details contains many more tools: timeline/history, status tools, retest/correction history, invoice fallback, permit edit, waiting release, and other administrative surfaces. The preview preserves reachability only through the generic Job Tools link, not a full launcher inventory.

## 5. Highest-Priority Gaps Before M3 Hardening

1. Anchor reachability in preview: CTAs link to current mobile anchors that may not exist in V2 preview DOM.
2. ECC tests precedence: split "tests available" from "tests required/blocking."
3. Linked retest parent handling: must be passive and point to active child.
4. Failed/pending-office-review priority: correction review versus confirm retest ready needs explicit primary/secondary decision.
5. Service waiting/follow-up: preview needs current release/progress/return-visit semantics or a clearly safe fallback.
6. Certs needed: do not imply cert action availability without `canShowCertsButton`/permit/failure gates.
7. Closed/cancelled/archived: avoid active-work language and use read-only/history-first posture.

## 6. Recommended Future Slices

Safest to riskiest:

1. Documentation and test updates only: add source-inspection tests that preview remains gated by `mobileLayout === "v2"` and default remains `MobileJobDetailCurrent`.
2. Preview CTA safety pass: ensure every preview CTA either targets a DOM anchor rendered in preview or intentionally links to standard view/current workspace.
3. Lifecycle exception label pass: display-only labels for failed, retest-needed, linked parent, waiting, cancelled, archived.
4. ECC test-status pass: use already-loaded ECC run truth to distinguish required, complete, failed, and available states.
5. Linked retest passive preview row: use existing props and child link data, no new reads.
6. Failed-family action hierarchy: primary/secondary correction/retest presentation using existing actions or safe links.
7. Service waiting/follow-up hardening: expose current progress/release/return-visit branches or safe links, preserving form payloads.
8. Billing CTA hardening: separate future audit before rendering invoice/external billing forms in preview.

## 7. Validation Notes

Documentation-only audit. No validation commands were required or run for this slice.

No product code changes were made. Existing uncommitted product-code changes from earlier preview slices were not modified by this audit.

## 8. Explicit Non-Actions

This audit did not:

- change product code;
- change layout, styling, actions, anchors, form fields, return values, reads, helpers, schemas, permissions, or shared components;
- promote V2 to default;
- redesign the invoice workspace;
- implement a Service full variant;
- move or duplicate deferred reads;
- add a new route read or next-action resolver.
