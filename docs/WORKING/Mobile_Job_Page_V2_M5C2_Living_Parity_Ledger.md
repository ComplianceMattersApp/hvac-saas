# Mobile Job Page V2 M5-C2 Living Parity Ledger

Status: Phase M5-C2 documentation only  
Date: 2026-06-26  
Scope: owner-only Mobile Job Page V2 field-test parity ledger for internal mobile `/jobs/[id]`

## Purpose

This ledger is the working contract for future Mobile Job Page V2 wiring.

Default rule: **match current mobile behavior unless a design or function change is explicitly approved**. A V2 area is not complete just because it is visually present. Completion means the old/current mobile behavior is either native in V2 with exact action/payload/return parity, routed to a real existing workspace, or intentionally standard-linked back to the current mobile page with `mobileLayout=current`.

## Source Basis

Reviewed:

- `docs/WORKING/Mobile_Job_Page_V2_M5B0_Blueprint_Code_Integrity_Audit.md`
- `app/jobs/[id]/_components/MobileJobDetailCurrent.tsx`
- `app/jobs/[id]/_components/MobileJobDetailV2Preview.tsx`
- `app/jobs/[id]/page.tsx`
- `lib/jobs/__tests__/job-detail-mobile-assignment-parity.test.ts`
- `lib/jobs/__tests__/job-tests-page-wiring.test.ts`
- scheduling/lifecycle action tests where useful for action names and schedule payload behavior

Known field findings to preserve:

- The large schedule helper card / oversized `Edit Schedule` block was design drift and was corrected back to a compact tappable schedule display.
- The hero image overlay was too large and was corrected so Street View / house imagery remains useful.
- Behavior-heavy notes/tools hot-linking to current mobile is expected during owner field testing.

## Global V2 Safety Contract

| Guard | Current source status |
| --- | --- |
| V2 default is owner-only env gated | `page.tsx` uses `ENABLE_MOBILE_JOB_V2_OWNER_DEFAULT`, `MOBILE_JOB_V2_ALLOWED_EMAILS`, and `MOBILE_JOB_V2_ALLOWED_USER_IDS`. |
| Explicit preview remains query-param gated | `mobileLayout === "v2"` still selects V2 when route/auth posture allows it. |
| Current fallback is forceable | `mobileLayout=current` or `mobileLayout=classic` forces `MobileJobDetailCurrent`. |
| Standard-current anchors must not bounce back to V2 | V2 uses `standardJobHref = /jobs/${job.id}?tab=${tab}&mobileLayout=current` and `standardJobAnchorHref(anchor)`. |
| V2 does not own data reads | Route reads remain in `page.tsx`. |
| V2 does not own mutation source of truth | Source tests guard no action imports, Supabase client, `.from()`, `.insert()`, `.update()`, `.upsert()`, or `.delete()` in `MobileJobDetailV2Preview.tsx`. |
| Desktop remains separate | Source tests assert desktop branch does not render the V2 selector/component. |

## Current-Mobile Parity Ledger

| Area | Current mobile location/component | Current action/component/form | Hidden fields / payload notes | Current anchor / return target | Current visibility gates | V2 current status | V2 target location | Risk level | Performance notes | Dead-code/cleanup notes | Next recommended slice | Stop-and-discuss concerns |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Schedule / reschedule | `MobileJobDetailCurrent.tsx`, top schedule `<details>` | `updateJobScheduleFromForm`; `UnscheduleButton` when schedule fields exist | `job_id`, `return_to`, `permit_number`, `jurisdiction`, `permit_date`; fields `scheduled_date`, `window_start`, `window_end` | `mobile-when-panel`; return `/jobs/${job.id}?tab=${tab}#mobile-when-panel` | Panel mounted in current mobile header; unschedule button gated by `job.scheduled_date || job.window_start || job.window_end` | Standard-linked; compact schedule display is tappable | V2 hero schedule column links to `standardJobAnchorHref("mobile-when-panel")` | Medium | No new reads; no native scheduler bundle; first paint unchanged | M5-C1C removed drift helper card/large edit box | Keep standard-linked unless exact native scheduler parity is explicitly approved | Native rendering must preserve permit hidden fields, unschedule behavior, schedule email side effects, lifecycle/evaluator behavior |
| Lifecycle actions | Current mobile primary action card | `JobFieldActionButton`; special `markJobFieldCompleteFromForm` when status completed but field incomplete | `markJobFieldCompleteFromForm` uses `job_id`; `JobFieldActionButton` owns lifecycle payload internally | Primary area before blocker branches; no separate anchor unless current action branch uses surrounding section | Normal active states, `!isFieldComplete`, completed handoff | Partly native | V2 Next Step renders `JobFieldActionButton` for safe inline lifecycle action; other behavior-heavy branches standard-link | Medium | Reuses existing component only for safe lifecycle action; no extra reads | None | Audit if field users need every current lifecycle sub-state native in V2 | Do not add new lifecycle truth model or alter status progression |
| Team Notes | `mobile-notes-hub` / `mobile-internal-notes` details | `DeferredInternalNoteMentionComposer`; `DeferredInternalNotesBody` | Composer gets `jobId`, `tab`, `accountOwnerUserId`, `returnAnchor="mobile-internal-notes"` | `mobile-internal-notes` | Always rendered in current mobile notes hub; opens on `internalNoteBannerMessage` | Standard-linked | V2 Evidence & Notes row links to `standardJobAnchorHref("mobile-internal-notes")` | Medium | Keeps deferred note body/composer out of V2 first paint | Candidate cleanup: test naming says source parity, not native completion | Strong candidate for next native audit/promotion | Must preserve mention composer, return anchor, timeline scope, and direct narrative chain behavior |
| Shared Notes | `mobile-notes-hub` / `mobile-shared-notes` details | `addPublicNoteFromForm`; `DeferredSharedNotesBody` | `note_scope=shared`, `return_to`, `job_id`, `tab`, `note` | `mobile-shared-notes`; return `/jobs/${job.id}?tab=${tab}#mobile-shared-notes` | `showSharedNotesCard`; opens on `sharedNoteBannerMessage` | Standard-linked | V2 row appears when `showSharedNotesCard`, links to `standardJobAnchorHref("mobile-shared-notes")` | Medium | Keeps shared note body/form deferred in current mobile | None | Pair with Team Notes native audit if notes are field-test friction | Must preserve audience/product-mode gates and shared-note return path |
| Files & Attachments | Current mobile `Notes & Attachments` header link | Link to `/jobs/${job.id}/attachments` | No mutation payload in job page | Real route `/jobs/{id}/attachments` | Always available in notes hub | Native real-route launcher | V2 Evidence & Notes `Files & Attachments` row | Low | No new reads; no attachment count added without loaded data | None | No immediate work | Do not add counts without existing loaded prop/read |
| Work Scope / Visit Scope | `mobile-work-scope`; `mobile-visit-reason-card`; `VisitScopeJobDetailForm` | `updateJobVisitScopeFromForm`; `VisitScopeJobDetailForm` | Visit reason form: `job_id`, `tab`, `return_to`, `visit_scope_items_json`, `visit_scope_summary`; builder owns item payload | `mobile-work-scope`; `mobile-visit-reason-card` | Internal edit controls gated by `isInternalUser`; work summary/items displayed from loaded props | Standard-linked with summary native | V2 Work to Do / Compliance Work lanes show loaded summary/items and link to `standardJobAnchorHref("mobile-work-scope")` | Medium | No extra reads; avoids moving VisitScope builder into V2 | None | Possible native Work Scope audit after Notes | Must preserve Visit Scope operational truth separate from invoice charges |
| Service Field Outcome | Current primary action card below `JobFieldActionButton` | `FieldOutcomePanel` | Component owns parts/approval/different-issue outcome payloads | Anchors include `field-outcome` in current component | `showFieldOutcomePanel` | Missing / intentionally deferred | V2 Next Step standard-links to current action area for risky branches | High | Avoids shipping outcome form bundle into V2 | None | Separate Service outcome parity audit before defaulting Service broadly | Do not duplicate forms unless exact action/return behavior is preserved |
| Service follow-up / return visit | `mobile-next-service-action`; `mobile-follow-up-job` under tools | `createNextServiceVisitFromForm`; service follow-up progress forms | Follow-up forms use `job_id`, `tab`, `visit_intent`, `return_creation_mode`, `follow_up_bridge_action`, `next_visit_reason`, `return_to`; schedule-now also uses date/window fields | `mobile-next-service-action`; `mobile-follow-up-job` | Service follow-up flags such as `isServiceFieldFollowUpPendingInfo`, `serviceFollowUpProgressState`, internal service job tools | Standard-linked | V2 service follow-up Next Step and tools rows link to current mobile anchors | High | Avoids creating return visit / schedule-now payloads in V2 | None | Service-specific native follow-up audit only if owner identifies friction | Return-visit scheduling bridges use existing scheduling semantics; do not reimplement |
| Waiting / parts / approval controls | `mobile-next-service-action`; `mobile-tools` interrupt controls | `markServicePartOrderedFromForm`, `markServicePartArrivedFromForm`, `markServiceApprovalReceivedFromForm`, `updateJobOpsFromForm`, `releaseAndReevaluateFromForm` | Parts/approval forms use `job_id`, `return_to`; interrupt tools use `job_id`, `return_to`, `InterruptStateFields` payload | `mobile-next-service-action` and `mobile-tools` | Active waiting/follow-up/interruption state gates | Standard-linked | V2 exception Next Step uses waiting labels and links to current tools/action area | High | No added reads/bundles | None | Audit if waiting jobs are common in field test | Must not imply normal field progression or invent waiting truth |
| ECC Tests | Current mobile Compliance/Tools links; tests page | Real route `/jobs/${job.id}/tests`; current action branch can lead there | Tests page owns forms/truth | Real route, not current-only anchor | `showMobileEccTestAction`; required-test Next Step only when existing required-test truth says so | Native real-route launcher | V2 Compliance Work row and Next Step route to `/jobs/${job.id}/tests` | Low/Medium | No new reads; uses existing loaded ECC state | None | No immediate work unless tests route friction appears | Do not treat test surface availability as required tests |
| Equipment | Current mobile / tools route | Real route `/jobs/${job.id}/info?f=equipment` | Equipment workspace owns payload | Real route | ECC compliance surface | Native real-route launcher | V2 Equipment row | Low | No new reads | None | No immediate work | Do not duplicate equipment forms in V2 |
| Permit Info | `mobile-tools` / `mobile-permit-info` details | `updateJobScheduleFromForm` reused for permit info edit | Hidden schedule fields preserve existing schedule; permit fields `permit_number`, `jurisdiction`, `permit_date`; `return_to=#mobile-permit-edit` | `mobile-permit-info`; nested `mobile-permit-edit` | `surfaceProfile.surfaces.permits` | Standard-linked | V2 Permit Information rows link to `standardJobAnchorHref("mobile-permit-info")` | Medium/High | Avoids schedule/permit combined form in V2 | None | Permit native audit only after exact payload review | Permit edit is coupled to schedule action; do not separate casually |
| Permit needed action | Current primary branch `mobile-ecc-permit-needed-action` | `markEccPermitAvailableFromForm` | `job_id`, `return_to`, `permit_number`, `jurisdiction`, `permit_date` | `mobile-ecc-permit-needed-action` | `isEccPermitNeededActive && !showPrimaryCloseoutBlockers` | Standard-linked | V2 Next Step permit blocker routes to current anchor | High | No native permit form; no extra reads | None | Audit only if permit state is high-frequency | Do not outrank required ECC tests; preserve closeout truth |
| Failed reason / correction review | Current failed reason banner and tools history | `resolveFailureByCorrectionReviewFromForm`; failed reason edit link to `#job-status` | Correction review uses `job_id`, `review_note` | `mobile-next-service-action`, `mobile-tools`; edit failed reason points to desktop/current `job-status` anchor | `canShowEccFailedReasonBanner`, `showCorrectionReviewResolution` | Standard-linked / summary native | V2 shows ECC attention summary and links to current review/retest tools | High | No extra reads | Could audit `#job-status` mobile target clarity later | ECC failed/retest polish/audit if field test hits failed jobs | Owner decision may be needed on correction-vs-retest priority |
| Retest scheduling | `mobile-next-service-action` Retest Ready branch | `scheduleRetestNowFromForm`; fallback `createRetestJobFromForm` | `parent_job_id`, `copy_equipment`, `scheduled_date`, `window_start`, `window_end`; move-to-needs-scheduling server action | `mobile-next-service-action` | `showRetestSection`, `showConfirmRetestReady` | Standard-linked | V2 retest Next Step / ECC attention links to current action area | High | Avoids heavy retest form in V2 | None | Separate retest native parity audit only if needed | Must preserve linked child creation, scheduling, and equipment-copy semantics |
| Linked retest parent/child | Current linked retest passive copy and current tools/history | Link to child job when available in service follow-up branch; retest/correction history details | No generic mutation payload unless resolving correction review | `mobile-tools`, `mobile-next-service-action` | `showLinkedRetestCreated`, `isHistoricalServiceFollowUpContinued`, child job ids | Summary native + standard-linked | V2 labels linked parent/passive state and links to current tools/action area | Medium/High | No added reads | None | Audit child-link visibility if owner sees confusion | Do not imply historical parent is active job |
| Billing / invoice | `mobile-work-scope`, `mobile-invoice-summary-card`, attention strips, tools | `createInternalInvoiceDraftFromForm`; links to `/jobs/${job.id}/invoice#invoice-workspace` | Draft form: `job_id`, `tab`, `return_to=/jobs/${job.id}/invoice#invoice-workspace`, `auto_import_visit_scope_items=1` | `mobile-invoice-summary-card`; invoice workspace route | `showInternalInvoicePanel`, `hasDirectInvoiceWorkflowAccess`, `mobileInvoiceActionRelevant`, invoice truth | Standard-linked / summary native | V2 Billing / Closeout card links to current invoice anchor or invoice workspace via current surfaces | High | Avoids invoice forms in V2 | None | Separate invoice parity audit before native billing | Financial correctness risk; do not redesign in V2 shell |
| External billing | Current attention strip / closeout branch | `completeDataEntryFromForm` | `job_id`; current branch has immediate submit controls | `mobile-next-service-action` / attention strip area | `showExternalDataEntryPrompt`, `closeoutNeeds`, billing gates | Standard-linked / summary native | V2 uses External billing review copy and links to current action area | High | No new reads/actions | None | Separate external billing audit if needed | Do not alter external billing truth or closeout satisfaction |
| Closeout | Current primary closeout blockers branch | Mix of invoice draft/link, `completeDataEntryFromForm`, permit/certs actions depending state | Varies by blocker; current branch owns exact payloads | `mobile-next-service-action`, `mobile-invoice-summary-card`, permit anchors | `showPrimaryCloseoutBlockers`, `closeoutNeeds`, `primaryCloseoutMessage` | Standard-linked / summary native | V2 Billing / Closeout and Next Step route to current anchors | High | No extra reads | None | Audit before native closeout controls | Do not create optimistic final-state UI |
| Timeline / history | `mobile-tools-timeline` details | `DeferredTimelineBody` | Read-only deferred body; receives `jobSummary` and narrative scope ids | `mobile-tools-timeline` | Available under tools | Standard-linked | V2 More Details row links to `standardJobAnchorHref("mobile-tools-timeline")` | Medium | Keeps deferred timeline read out of V2 first paint; preserves fail-open current behavior | None | Leave standard-linked unless timeline becomes major need | Do not duplicate timeline reads above the fold |
| Job status tools | `mobile-tools` Job Status Tools details | `updateJobOpsFromForm`, `releaseAndReevaluateFromForm`, `InterruptStateFields` | `job_id`, `return_to`, interrupt/waiting fields | `mobile-tools` | Always under tools; release form gated by `canShowReleaseAndReevaluate` | Standard-linked | V2 More Details row links to `standardJobAnchorHref("mobile-tools")` | High | No interrupt form bundle in V2 | None | Audit if waiting/release controls need native V2 | Must preserve waiting/release permissions and evaluator behavior |
| Team assignment | Current mobile operations board `AssignedTeamControls` | `AssignedTeamControls` with mobile variant; underlying add/remove/primary assignee actions | Component owns assignment payloads and return anchor; tests guard mobile return anchor | Current card uses `id="assigned-team"`; tests mention mobile assignment anchors in component internals | Internal user gates inside controls | Missing / intentionally deferred | V2 does not directly render assignment controls; accessible through standard view/tools | Medium/High | Avoids assignment mutation controls in V2 | Possible mismatch: current anchor is `assigned-team`, not listed as V2 standard anchor | Audit before adding V2 team assignment link | Assignment mutations/destructive controls need exact parity |
| Contact logging | Current operations board Contact Logging card | `ContactLoggingQuickActions` with `logCustomerContactAttemptFromForm` | Component receives `jobId`, attempt count, action; button class | Current operations board, no V2 direct anchor identified | Current mobile renders in operations board | Missing / intentionally deferred | V2 relies on current/standard view for contact logging | Medium | No extra bundle/actions | Add explicit V2 tool row only after anchor target is confirmed | Contact logging may be high-value in field; audit anchor/return behavior before linking |
| Service Plan details/create | V2 tools row; current mobile attention strips for plan actions | Customer profile service-plan area for details/create; current mobile mutation buttons for visit-count/next-due when applicable | V2 row has no mutation payload; customer route may include `maFocus` | Customer route `?tab=service-plans`; standard job fallback | V2 row always present; helper changes based on plan context | Native real-route launcher | V2 More Details / Tools row | Low/Medium | No new reads; uses existing customer href/context | None | No immediate work | If no customer href, standard job fallback may be less useful; audit if owner reports friction |
| Service Plan visit-count / next-due actions | Current mobile attention strips | `MarkVisitCountedActionButton`; `ConfirmNextDueDateActionButton` | Buttons own `jobId`, `linkId`, `agreementId`, suggested/baseline due dates, `tab` | Attention strips near top of current mobile | `markVisitCountedLinkId`, `suggestedNextDueProjection`, `confirmedNextDueContext` | Standard-linked / not native | V2 only links to Service Plan area; does not render mutation buttons | High | Avoids service-plan mutation behavior in V2 | None | Separate native service-plan action audit if needed | Do not mutate visit counts/next due from V2 without exact parity |
| Location & Address / edit service location | Current top address row; V2 tools row | Existing `serviceLocationEditHref`; edit workflow outside V2 | Existing href owns payload | Current top address edit affordance; V2 More Details row | `isInternalUser && serviceLocationEditHref` | Native existing-route launcher | V2 More Details / Tools `Location & Address` row | Low/Medium | No extra reads; no edit form duplication | None | No immediate work | Do not alter `JobLocationPreview` or service-location change logic |
| Completion Report / certification surfaces | Current ECC closeout/certs surfaces | Certs/permit/closeout actions include `markCertsCompleteFromForm` and related blockers where current code gates them | Exact hidden fields vary by cert/closeout branch; source not fully re-audited in this slice | Current closeout/action areas; likely `mobile-next-service-action` and cert/permit blockers | `closeoutNeeds.needsCerts`, cert/permit gate booleans | Unclear / standard-linked | V2 says certification/closeout items and links to current closeout/action areas | High | No native cert surface in V2 | Marked unclear; needs source audit before native promotion | Audit exact Completion Report / cert action fields before adding any native V2 controls |

## Design Drift / Owner Approval Ledger

| Item | Status | Owner-approved or drift? | Current instruction |
| --- | --- | --- | --- |
| Photo hero overlay reduction | Corrected | Owner-requested polish | Keep image mostly visible; address chip/action row pattern is expected. |
| Duplicate city/state display cleanup | Corrected display-only | Owner-requested polish | Keep display-only; do not mutate source location data. |
| Large schedule helper card for scheduled jobs | Corrected | Drift | Do not restore without explicit approval. |
| Compact tappable schedule display | Current expected pattern | Matches original interaction intent | Link to `mobileLayout=current#mobile-when-panel`. |
| Evidence & Notes behavior-heavy hot-links | Expected for owner field test | Approved posture from M5-B0 audit | Treat as navigation friction, not missing data behavior. |
| More Details / Tools collapsed disclosure | Expected | Owner-requested | Keep collapsed by default and direct grouped rows when expanded. |

## Performance / Response Notes

| Area | Performance posture |
| --- | --- |
| Schedule | Standard-linked; no native form or client bundle in V2; no extra reads. |
| Notes | Standard-linked; deferred current note bodies/composers are not duplicated in V2. |
| Timeline | Standard-linked; `DeferredTimelineBody` remains deferred/current and is not duplicated above the fold. |
| Work Scope | Summary/items use already-loaded props; builder/editor remains current mobile. |
| Billing / invoice | Summary uses already-loaded props; invoice forms/workspace not duplicated. |
| Service Plan | Uses existing customer href/context; no plan reads/mutations added. |
| Location hero | Uses existing `TimedJobLocationPreview` and fallback behavior; display cleanup is local only. |

## Dead-Code / Cleanup Watchlist

| Candidate | Recommendation |
| --- | --- |
| V2 schedule helper strings | Keep tests guarding that `Change appointment date or arrival window.` and `Edit Schedule` do not reappear as large helper blocks. |
| Repeated standard-current anchor usage | Current `standardJobAnchorHref` consolidation is sufficient; do not over-abstract until more anchors become native. |
| V2 source-inspection strings | Keep focused assertions around safety boundaries; avoid broad brittle checks for every visual class. |
| Current mobile props passed to V2 | Do not trim casually; many are used for display-only gates or future parity classification. Audit unused props separately. |

## Stop-And-Discuss Triggers

Stop before implementation if a proposed V2 native slice would:

- import or call server actions directly from `MobileJobDetailV2Preview.tsx` without an explicit approved parity plan;
- add Supabase reads or move route reads out of `page.tsx`;
- duplicate deferred note/timeline reads above the fold;
- alter schedule, lifecycle, ECC test, permit, invoice, external billing, Visit Scope, Service Plan, timeline, or note source-of-truth logic;
- change hidden fields, `return_to`, anchors, form field names, or server-action payloads;
- make V2 default for non-owner users or affect desktop;
- turn a standard-current escape into a fake in-preview anchor;
- make a visual/card change that differs from current mobile without explicit owner approval.

## Safest Next Wiring Slice

Recommended next slice: **native Notes audit first**, then implementation only if the audit confirms exact parity is safe.

Why Notes first:

- Team Notes and Shared Notes are high-frequency field workflows.
- Current V2 already has polished Evidence & Notes rows.
- The current behavior is safe but navigationally disruptive because it hot-links to current mobile.
- Native Notes can likely be scoped without touching invoice, permit, retest, lifecycle, or billing truth, but it still needs an audit for `DeferredInternalNoteMentionComposer`, `DeferredInternalNotesBody`, `addPublicNoteFromForm`, return anchors, audience gates, and narrative chain scope.

Alternative low-risk slice: **Work Scope native audit**. It is useful, but the `VisitScopeJobDetailForm` / builder payload is more complex than Notes and should follow after the Notes audit unless owner field testing says Work Items are the bigger pain.

Do not pick invoice, retest, permit, external billing, Service Plan mutation buttons, or Field Outcome as the next native slice without a dedicated audit; those are higher-risk source-of-truth areas.

## Validation

Documentation-only slice. No product code was changed and no tests were required.
