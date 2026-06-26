# Mobile Job Page V2 M1 Readiness Audit

Status: Phase M1 implementation-readiness audit only  
Date: 2026-06-25  
Scope: internal mobile `/jobs/[id]` only

## 1. Executive verdict

Mobile V2 is feasible as a presentation-only recomposition, but the first safe implementation step must be a zero-change extraction of the current mobile branch from `app/jobs/[id]/page.tsx`. The current route already has the data and actions needed for the approved V2 zones, including location preview, lifecycle transitions, ECC tests, equipment, permits, retest/correction, notes, attachments, work items, billing, team, contact logging, timeline, and service-chain surfaces.

Hard stops / readiness flags:

- The approved photo hero can be produced from current location reads only as a best-effort Google Street View/static map preview. It cannot be treated as stored or authoritative property truth.
- The five-stage lifecycle rail can be derived for common scheduled/on-way/in-progress/field-complete/closeout states, but `pending_info`, `on_hold`, failed-family ECC states, linked historical parents, cancelled, archived, and unscheduled backlog require explicit display handling.
- Current code does not have a single next-action resolver. Precedence is assembled inline from booleans in `page.tsx`, so V2 should not introduce a new resolver in M1.
- Current mobile anchors and return targets are preservation constraints, especially `mobile-when-panel`, `mobile-work-scope`, `mobile-visit-reason-card`, `mobile-notes-hub`, `mobile-internal-notes`, `mobile-shared-notes`, `mobile-tools`, `mobile-invoice-summary-card`, `mobile-ecc-permit-needed-action`, and `mobile-next-service-action`.
- The blueprint does not conflict with the Active Spine or workflow locks. It is subordinate to them and correctly preserves ECC/service separation, billing/cert separation, and no-new-truth constraints.

## 2. Current mobile composition map

Current mobile render starts at `app/jobs/[id]/page.tsx` inside the `lg:hidden` branch, after all route-level reads and booleans are prepared.

Representative rendered order:

| Order | Surface | Component/file | Data/source | Gate | Actions/payloads | Target/anchor | Shared risk |
|---|---|---|---|---|---|---|---|
| 1 | Job Workbench command header | `app/jobs/[id]/page.tsx` | `jobs`, `locations`, customer/contact fields, schedule fields, `formatJobDisplayReference` | Always in mobile branch | Schedule details edit via `updateJobScheduleFromForm`; hidden `job_id`, `return_to`, schedule fields, permit fields | `#mobile-when-panel`; service address links to `/locations/{id}` when internal | Shares route reads and helpers with desktop |
| 2 | Flash banners | `FlashBanner` in `page.tsx` | query params `banner`, `notice`, note-scope banners | Conditional per banner | No direct mutation | Inline above status card | Shared banner semantics with desktop and post-submit returns |
| 3 | Current field/status action card | `page.tsx`, `JobFieldActionButton`, `FieldOutcomePanel` | `job.status`, `job.ops_status`, `field_complete`, `closeoutNeeds`, ECC flags, follow-up state | Always shown; inner actions gated | `advanceJobStatusFromForm`, `markJobFieldCompleteFromForm`, `revertOnTheWayFromForm`, service outcome actions | `#field-outcome`, implicit current route | `JobFieldActionButton` is shared with desktop command bar |
| 4 | ECC permit/retest/correction/closeout variants inside status card | `page.tsx` | `isEccPermitNeededBlocker`, `activeRetestChild`, `closeoutNeeds`, `billingState`, `surfaceProfile` | Mutually selected inline branches | `markEccPermitAvailableFromForm`, `confirmEccRetestReadyFromForm`, `scheduleRetestNowFromForm`, `createRetestJobFromForm`, invoice/cert actions | `#mobile-ecc-permit-needed-action`, `#mobile-next-service-action`, invoice workspace | High precedence risk because several branches compete inline |
| 5 | Quick Field Actions | `page.tsx` | phone/address/equipment/test/invoice gates | Always shown; disabled spans when unavailable | Call/text links, equipment link, tests link, invoice draft form | `tel:`, `sms:`, `/jobs/{id}/info?f=equipment`, `/jobs/{id}/tests`, `/jobs/{id}/invoice#invoice-workspace` | Call/Text duplicate location/contact behavior planned for hero |
| 6 | Field Operations Board | `page.tsx`, `TimedJobLocationPreview`, `ContactLoggingQuickActions`, `AssignedTeamControls` | service address, Google preview helper, attempts, team assignment | Always shown; cleaning inserts informational placeholders | contact attempts via `logCustomerContactAttemptFromForm`; team controls via component actions | `#contact-logging`, `#assigned-team` | `JobLocationPreview` is also desktop; contact restore behavior is client-side |
| 7 | Contractor context | `page.tsx` | `contractorId`, `contractorName`, product surface | ECC contractor/rater handoff only | Read-only on mobile main scroll | None | Contractor controls live lower/desktop tools |
| 8 | Attention strips | `page.tsx`, service-plan buttons | schedule required, waiting, external/internal billing, open invoice, service-plan visit count/next due | Conditional | `completeDataEntryFromForm`, invoice draft create/open, `MarkVisitCountedActionButton`, `ConfirmNextDueDateActionButton` | invoice workspace; service-plan anchors | Billing/service-plan actions can become dominant in V2 only under gates |
| 9 | Work & Invoice | `page.tsx`, `VisitScopeJobDetailForm`, `VisitScopeBuilder` | `visit_scope_summary`, `visit_scope_items`, pricebook templates, invoice read model | Always shown; edit form internal-only | `updateJobVisitScopeFromForm`; invoice draft/open | `#mobile-work-scope`, `#mobile-invoice-summary-card`, `/jobs/{id}/invoice#invoice-workspace` | For ECC, this is companion service work, not ECC compliance truth |
| 10 | Notes & Attachments | `page.tsx`, deferred note bodies/composer | note counts, narrative scope, attachments route | Always; shared notes hidden in HVAC Service/Cleaning modes | internal mention composer, `addPublicNoteFromForm`, attachments route | `#mobile-notes-hub`, `#mobile-internal-notes`, `#mobile-shared-notes`, `/jobs/{id}/attachments` | Deferred reads and audience boundaries must remain unchanged |
| 11 | More Details / Tools | `page.tsx`, `ServiceStatusActions`, deferred timeline | estimates, return visits, permit details/edit, status tools, ECC status, timeline, retest/correction history | Collapsed details; individual gates | return visit create, permit edit via `updateJobScheduleFromForm`, `updateJobOpsFromForm`, release/reevaluate, correction review | `#mobile-tools`, `#mobile-follow-up-job`, `#mobile-permit-info`, `#mobile-permit-edit`, `#mobile-tools-timeline` | Large surface with many hidden forms and anchors |
| 12 | Desktop branch | `page.tsx` `lg:block` | Same booleans/actions | Hidden on mobile | Parallel action/forms | desktop anchors including `#field-status-actions`, `#job-location`, `#visit-scope-section` | Mobile extraction must not move shared data reads |

Representative ECC state differences:

- Scheduled/Open: status card shows `JobFieldActionButton` with `Mark On the Way`; if no full schedule, the client confirms auto-schedule. Quick actions, operations board, Work & Invoice, notes, tools still render.
- On the Way: status card shows `Mark In Progress`; `Undo On the Way` appears when `getOnTheWayUndoEligibility` allows it.
- In Progress: status card shows finish action through `JobFieldActionButton`; Service jobs may also show `FieldOutcomePanel`, ECC jobs do not show service finish outcomes. ECC test shortcut appears in quick actions.
- Field Complete with permit/cert blocker: permit blocker branch shows `Permit Needed` and `Permit Available` form when `isEccPermitNeededActive` and primary closeout blockers are not already shown; closeout blocker branch can show `Permit number required before certs can be sent`, `Certs Sent`, invoice, or external billing controls.
- Failed/correction/retest attention: `canShowEccFailedReasonBanner`, `showConfirmRetestReady`, `showRetestSection`, `showLinkedRetestCreated`, and `showCorrectionReviewResolution` control failed reason, confirm retest ready, schedule/move retest, linked child passive summary, and correction review.
- Historical/closed: completed/field-complete branches show read-only closeout messages plus tests workspace link for ECC. Linked retest/service follow-up parents become passive/historical with a link to the child when current helper state finds one.

## 3. Approved-anchor mapping table

| V2 zone | Reuse unchanged | Safe recomposition | Extract first | Risk | Missing/deferred |
|---|---|---|---|---|---|
| Photo-led Job Command Hero | `JobLocationPreview`, address display helpers, call/text/navigate URL construction | Move existing address, preview, schedule, customer, job ref into hero | Mobile header plus location preview props | Image load is best-effort and currently coupled to map links | No stored image snapshot; no new location truth |
| Lifecycle orientation rail | `job.status`, `job.ops_status`, `field_complete`, closeout helpers | Display-only rail from existing labels | Small pure presentation helper later, not M1 | Ambiguous waiting/failed/historical states | Product decisions for cancelled/archived/linked parent rail state |
| Current Responsibility / Next Step | Current status/action card branches | Present one dominant branch using current precedence | Extract current mobile action branch exactly | Inline precedence can show multiple important actions in nearby surfaces | New resolver deferred |
| ECC Compliance Work | Equipment link, tests link, permit surfaces, latest ECC run data, retest/correction controls | Group existing launchers/statuses under compliance lane | Identify launchers vs read-only status | ECC Work & Invoice currently leads companion work too strongly | Completion report status/launcher needs exact current route audit before implementation |
| Evidence & Notes | Notes hub, attachments route, deferred bodies | Rename/reorder as Evidence & Notes for ECC | Keep deferred components intact | Audience boundary for shared notes/product mode | Do not merge notes with timeline |
| Compact Job Context | Field Operations Board pieces | Collapse location/team/contact/contractor details | Extract board as-is before collapsing | Contact logging scroll restore and team mutation controls | Focused detail presentation deferred |
| Billing / Closeout | invoice summary, `FieldBillingSummary`, closeout blockers | Promote only when relevant by current gates | Leave billing reads in `page.tsx` initially | Financial authority and invoice workspace routing | No invoice editor on job page |
| More Details / Tools | Current `#mobile-tools` details | Keep launcher layer | Extract exact current details body | Hidden forms and anchors are easy to break | Sheet/focused-route behavior deferred |

## 4. Property-image audit

Current component/helper/provider:

- `components/jobs/JobLocationPreview.tsx` builds address, Google Maps search/directions URLs, Street View metadata URL, Street View image URL, and static map fallback URL.
- `components/jobs/JobLocationPreviewImage.tsx` is the client image/fallback wrapper. It renders an anchor to Google Maps search and either an image or "Map preview unavailable" fallback.
- Provider is Google Maps via `GOOGLE_MAPS_API_KEY`; with no key, no image URL is generated.

Availability:

- A usable preview requires a non-empty composed address and `GOOGLE_MAPS_API_KEY`.
- If Street View metadata returns `OK`, Street View is used; otherwise static roadmap image is used.
- If image loading fails client-side, the component falls back to a map-pin unavailable state.

Loading/fallback:

- The route wraps `TimedJobLocationPreview` in `Suspense` with `JobLocationPreviewFallback`.
- No address renders "Location preview unavailable" plus "Add a full service address...".
- The image is not stored, snapshotted, or made authoritative.

Coupling:

- The image anchor opens Maps search.
- Navigate/Open in Maps are emitted by `JobLocationPreview`.
- Current mobile also separately computes `mobileNavigateHref` for Quick Field Actions.
- Address and Navigate are therefore partially coupled to the image component and partially duplicated in route-local quick actions.

Hero safety:

- Moving preview into the command hero is safe only inside the mobile branch and only if the same props, fallback, map URLs, and address display helper semantics are preserved.
- Desktop behavior changes if `JobLocationPreview` itself is changed, because desktop uses the same component in `#job-location`.
- Safest fallback: preserve address-first display from current service-location/job snapshot fields, render the same preview when available, and keep Navigate/Open in Maps available even when image is unavailable. Do not add storage or new truth in M1.

## 5. Lifecycle-rail derivation audit

Fields/helpers available:

- `jobs.status`: `open`, `on_the_way`, `in_process`, `completed`, `cancelled`.
- `jobs.ops_status`: scheduling/closeout/workflow projection including `need_to_schedule`, `scheduled`, `on_the_way`, `in_process`, `pending_info`, `pending_office_review`, `on_hold`, `failed`, `retest_needed`, `paperwork_required`, `invoice_required`, `closed`.
- `jobs.field_complete`, `certs_complete`, and billing read model feed closeout helpers.
- `getCloseoutNeeds`, `isInCloseoutQueue`, `formatOpsStatusLabel`, `formatEccOpsStatusLabel`, `buildServiceFollowUpProgressState`, and active retest child state.

Feasible display mapping:

- Scheduled: `status=open` with scheduled date/window, or `ops_status=scheduled`.
- On the way: `status=on_the_way`, or compatibility case `status=open` and `ops_status=on_the_way`.
- In progress: `status=in_process`, or compatibility case `status=open` and `ops_status=in_process`.
- Field done: `field_complete=true` or `status=completed` before administrative closeout is fully resolved.
- Closeout: `ops_status=paperwork_required`, `invoice_required`, or `closed`; final complete only when closeout helpers and billing/certs truth agree.

Ambiguous or decision-needed:

- `pending_info`, `waiting`, and `on_hold` are interruptions, not clean rail stages.
- ECC `failed`, `pending_office_review`, and `retest_needed` are compliance attention states between field done and closeout, not new lifecycle stages.
- Parent jobs with active linked retest/return child should display passive/historical continuation, not the active rail.
- `need_to_schedule` is pre-scheduled backlog and should not look like a field stage.
- `cancelled`, `archived`, and deleted jobs do not honestly map to one of the five labels without an exception style.

## 6. Primary-action candidate and precedence audit

Current candidates:

| Candidate | Gate | Action/route | Current wording | Conflicts |
|---|---|---|---|---|
| Mark On the Way | `JobFieldActionButton`, `status=open` | `advanceJobStatusFromForm`; `job_id`, `current_status`, `tab`, `auto_schedule_confirmed` | `Mark On the Way` | Auto-schedule confirm if incomplete schedule |
| Mark In Progress | `status=on_the_way` | same | `Mark In Progress` | Undo On the Way may also show |
| Finish field visit | `status=in_process`, not field complete | same, then completion path | label from `surfaceProfile.labels.finishComplete` | ECC missing-test blocker can reject completion |
| Mark Field Complete | `status=completed` and `field_complete=false` | `markJobFieldCompleteFromForm`; `job_id` | `Mark Field Complete` | ECC requires completed test run |
| ECC missing-test attention | `notice=ecc_test_required`, ECC, no completed run | route link to `/jobs/{id}/tests` nearby | "One step missing" / `Open Tests Workspace` | Not a single form action |
| Add permit | `isEccPermitNeededActive` | `markEccPermitAvailableFromForm`; `permit_number`, `jurisdiction`, `permit_date` | `Permit Available`, `Save Permit` | May compete with closeout blockers |
| Confirm Retest Ready | failed/pending office review, ECC, no active child | `confirmEccRetestReadyFromForm`; `job_id` | `Confirm Retest Ready` | Correction review also available |
| Schedule/Move retest | `ops_status=retest_needed`, ECC, no active child | `scheduleRetestNowFromForm` or `createRetestJobFromForm`; parent/schedule/copy equipment | `Schedule Retest Now`, `Move to Needs Scheduling` | Two legitimate sibling retest actions |
| Correction review | failed/pending office review, ECC, no active child | `resolveFailureByCorrectionReviewFromForm`; `job_id`, `review_note` | `Resolve by Correction Review` | Equal family with confirm retest ready unless owner decides priority |
| Waiting release | active waiting and release allowed | `releaseAndReevaluateFromForm`; `job_id`, `return_to` | `Mark Ready to Continue` or helper label | Service follow-up model rejects same-visit resume after child |
| Service part/approval progress | service follow-up pending info | `markServicePartOrderedFromForm`, `markServicePartArrivedFromForm`, `markServiceApprovalReceivedFromForm` | exact action labels | Return-visit bridge may become next after progress done |
| Return visit continuation | service follow-up bridge label | `createNextServiceVisitFromForm` | `Add to Scheduling Queue`, `Schedule Return Visit Now` | Must not be used for ECC retest |
| Internal invoice | `showInternalInvoicePanel` and relevant closeout/billing | create/open invoice workspace | `Create Invoice`, dynamic invoice action label | Billing may be secondary until field complete |
| External billing | lightweight billing allowed and invoice needed | `completeDataEntryFromForm` or `markInvoiceCompleteFromForm` | `Mark External Billing Complete` | Separate from cert blockers |
| Certs sent | ECC, cert surface, not failed, permit valid | `markCertsCompleteFromForm` | `Certs Sent` | Must not appear if permit missing/failed unresolved |
| Linked child continuation | active retest/service child exists | Link to child job | `Open Linked Retest` / `Open Linked Return Visit` | Parent should be passive |

Presentation-only priority recommendation:

1. Passive linked-child continuation for historical parents.
2. Hard blocker required by current logic: ECC missing tests, permit required, unresolved failed/correction/retest.
3. Active waiting/service follow-up progress/release.
4. Field lifecycle transition.
5. Field finish responsibility.
6. ECC cert closeout or Service billing closeout.
7. Billing/open invoice/confirm external billing.
8. Historical/read-only summary.

Owner decision needed: when failed/pending office review has both `Confirm Retest Ready` and `Resolve by Correction Review`, V2 must choose one dominant presentation or explicitly show one as primary and the other as secondary. Current code treats both as available paths.

## 7. Compliance action-versus-status inventory

| Element | Current surface | Classification | False-affordance risk |
|---|---|---|---|
| Equipment | Quick Field Actions link; records panel; `/jobs/{id}/info?f=equipment` | Action launcher plus historical/current record | Safe as launcher; count/status should be read-only |
| Current equipment rows | `EquipmentEditCard` in record panel | Mixed edit record | Do not style read-only equipment count like a button |
| ECC Tests | Quick action link to `/jobs/{id}/tests`; latest run summary in record surfaces | Action launcher plus status | Latest result is status, not a launcher unless row clearly links |
| Completion Report | Current audited route likely under tests/report workflow; not prominent in mobile main branch | Deferred launcher/status split | Needs exact route mapping before V2 implementation |
| Permit | Permit details in tools; permit needed action form | Read-only status plus action when blocker active | `Permit: Missing` must not look like submit; `Permit Available` is action |
| Certs | Closeout blocker/action | Action when `canShowCertsButton`; blocker/status otherwise | `Permit number required...` is read-only blocker |
| Failed reason | status card banner | Blocker/attention summary | `Edit failed reason` anchor is action; banner body is not |
| Confirm Retest Ready | status card/tools | Action launcher/form | Competes with correction review |
| Schedule retest / Move to Needs Scheduling | retest section | Action forms | Both are real actions; distinguish primary/secondary |
| Linked retest child | linked summary/tools | Historical/passive record plus child launcher | Parent summary should not look active except child link |
| Correction review | status/tools/failure section | Action form | Review note row is input; history summary is not |

## 8. Mobile/desktop shared-dependency risks

- `JobLocationPreview` and `JobLocationPreviewImage` are shared; changing component markup changes desktop `#job-location`.
- Deferred bodies for internal notes, shared notes, timeline, attachments, customer attempts, service chain, and workflow milestones protect first paint; do not duplicate their reads in a V2 shell.
- `VisitScopeJobDetailForm` and `VisitScopeBuilder` enforce Service work-item content and serialize `visit_scope_items_json`; changing labels/placement must preserve payload names.
- `FieldOutcomePanel` is Service-only by gate; do not expose service outcomes on ECC.
- `FieldBillingSummary`, invoice helpers, invoice workspace links, and direct/proposal authority gates are shared financial contracts.
- `ContactLoggingQuickActions` uses `sessionStorage` scroll restore and `return_to` based on current path/search; moving it requires preserving `#contact-logging`.
- `AssignedTeamControls`, `RoleContactsCard`, contractor controls, and service-location change warning contain mutation and authority boundaries.
- Mobile and desktop branches share booleans such as `showInternalInvoicePanel`, `showExternalDataEntryPrompt`, `showSharedNotesCard`, `activeWaitingState`, `canShowWaitingReleaseQuickAction`, `showMobileInvoiceOpenAttention`, `markVisitCountedLinkId`, `suggestedNextDueProjection`, `internalInvoiceTruth`, and `fieldBillingCapabilities`.
- Hash targets and return positions are part of current behavior. Preserve both mobile and desktop anchors until an owner-approved redirect migration exists.

## 9. Proposed zero-change M1 extraction boundary

Smallest safe boundary:

- Add `app/jobs/[id]/_components/MobileJobDetailCurrent.tsx`.
- Move only the JSX for the current mobile branch plus the mobile-only class strings and tiny mobile-local derived labels if unavoidable.
- Keep all Supabase reads, authorization, product-mode resolution, billing/ECC/service-chain read models, and heavy booleans in `page.tsx`.
- Pass a broad explicit props object containing already-derived values and imported server actions/components where needed, or keep imports colocated if the component remains a server component.
- `page.tsx` should continue to own redirects, `notFound`, data reads, query-param parsing, timing, and the desktop branch.

Do not refactor yet:

- No new next-action resolver.
- No movement of data reads or helper truth into the extracted component.
- No changes to `JobLocationPreview`, `VisitScopeJobDetailForm`, `VisitScopeBuilder`, billing helpers, ECC evaluators, server actions, form field names, IDs, anchors, return URLs, or CSS semantics.
- No desktop extraction in the same slice.

Expected risk:

- High line movement, low intended behavior change if done as a mechanical extraction.
- Primary risk is omitted prop/import or accidentally changing action identity/hidden field value.

Rollback strategy:

- Revert the single extraction commit/file movement.
- Because no server action/helper/schema change should occur, rollback should restore `page.tsx` mobile JSX only.

## 10. Smallest expected M1 diff

Expected files:

- Add `app/jobs/[id]/_components/MobileJobDetailCurrent.tsx`.
- Change `app/jobs/[id]/page.tsx` to render `<MobileJobDetailCurrent ... />` inside the existing `lg:hidden` wrapper or include the wrapper in the extracted component.
- Optional: add a route-local `mobile-job-detail-current.types.ts` only if the props contract becomes unreadable. Prefer avoiding it for the first extraction.

Expected non-code file after this audit:

- This document only: `docs/WORKING/Mobile_Job_Page_V2_M1_Readiness_Audit.md`.

## 11. Validation and screenshot matrix

Commands for later M1 extraction:

- `npx.cmd tsc --noEmit`
- `npx.cmd vitest run lib/actions/__tests__/job-lifecycle-scope-hardening.test.ts`
- `npx.cmd vitest run lib/actions/__tests__/job-ops-actions.test.ts`
- `npx.cmd vitest run lib/actions/__tests__/job-ops-waiting-state.test.ts`
- `npx.cmd vitest run lib/actions/__tests__/job-ops-parts-needed.test.ts`
- `npx.cmd vitest run lib/actions/__tests__/ecc-action-scope-hardening.test.ts`
- `npx.cmd vitest run lib/actions/__tests__/ecc-completion-redirects.test.ts`
- `npx.cmd vitest run lib/actions/__tests__/ecc-retest-schedule-now-wiring.test.ts`
- `npx.cmd vitest run lib/actions/__tests__/internal-invoice-scope-hardening.test.ts`
- `npx.cmd vitest run lib/actions/__tests__/internal-invoice-payment-actions.test.ts`
- `npx.cmd vitest run lib/actions/__tests__/job-ops-contact-scope-hardening.test.ts`
- `npx.cmd vitest run lib/actions/__tests__/job-service-location-change.test.ts`
- `git diff --check`

Manual authenticated mobile-width smoke:

- ECC scheduled/open: header, schedule, `Mark On the Way`, Quick Field Actions, tests/equipment links.
- ECC on the way: `Mark In Progress`, Undo On the Way eligibility/return.
- ECC in progress: tests link, no Service outcome panel, missing-test banner after rejected field complete.
- ECC field complete with permit missing: permit blocker/action, cert action suppressed, invoice separation visible.
- ECC failed/pending office review: failed reason, confirm retest ready, correction review, contractor report if gated.
- ECC retest needed: schedule retest now and move to needs scheduling payloads.
- ECC parent with active retest child: passive parent and child link.
- Service scheduled/on-way/in-progress: lifecycle action, Service outcome panel, Work Items.
- Service field complete with internal invoice: invoice summary and workspace route.
- Service external billing: external billing completion action.
- Service waiting/follow-up: part/approval progress and return child creation.
- Historical/closed: no active parent action, history/tools reachable.

Desktop regression checks:

- `#field-status-actions`
- `#job-location`
- `#visit-scope-section`
- `#job-details-records`
- `#job-status`
- `#service-chain`
- invoice workspace link and return anchors

Screenshot comparison list:

- Mobile 390px and 430px widths for each representative ECC/Service state above.
- Desktop 1440px for shared location, field action, work/invoice, notes, and tools surfaces.
- Before/after screenshots must include open details states for `mobile-when-panel`, `mobile-tools`, `mobile-internal-notes`, `mobile-shared-notes`, and mobile permit/retest panels.

## 12. Conflicts, unknowns, and owner decisions required

- Decide dominant failed-family action priority when both correction review and retest-ready confirmation are valid.
- Decide how lifecycle rail displays `pending_info`, `on_hold`, `failed`, `pending_office_review`, `retest_needed`, cancelled, archived, and linked historical parent states.
- Confirm completion-report route/launcher/status source before styling it in Compliance Work.
- Decide whether the photo hero uses Street View/static map as-is or requires a stricter "usable property image" definition. New storage is explicitly out of scope.
- Decide whether Call/Text/Navigate are removed from Quick Field Actions only after the hero owns them.
- Decide whether compact Job Context opens inline details, a sheet, or an anchor-preserving expanded panel in later phases.

## 13. Explicit non-actions

This audit did not implement Mobile V2.

No product code, JSX, layout, CSS, shared component, action, helper, test, schema, migration, Supabase state, production data, permission, redirect, form field, anchor, or source-of-truth logic was changed.

No commit was created.
