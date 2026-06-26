# Mobile Job Page V2 M5-B0 Blueprint / Code Integrity Audit

Status: Phase M5-B0 audit only  
Date: 2026-06-26  
Scope: owner-only production field-test posture for internal mobile `/jobs/[id]`

## Executive Verdict

Mobile Job Page V2 is intact against the original blueprint direction and the later owner-requested preview additions.

The current implementation is best described as a strong owner-only field-test shell, not a full default-rollout replacement. It correctly preserves the high-risk boundaries: route reads remain in `page.tsx`, desktop remains separate, V2 does not own server actions or source-of-truth writes, and behavior-heavy forms intentionally escape to the standard/current mobile view or real workspaces.

The owner-only production posture is present in source:

- `ENABLE_MOBILE_JOB_V2_OWNER_DEFAULT`
- `MOBILE_JOB_V2_ALLOWED_EMAILS`
- `MOBILE_JOB_V2_ALLOWED_USER_IDS`
- `mobileLayout=current` / `mobileLayout=classic` force current mobile
- Standard View exits include `mobileLayout=current`

Recommended next slice: **continue owner-only V2 field test, then promote native Notes if field testing shows the notes hot-link is too disruptive**. The current notes hot-links are expected and safe for M5-A, but they are likely the first workflow friction point now that the visual layout is approved.

## Source Basis

Reviewed:

- `docs/ACTIVE/Mobile_Job_Page_V2_Blueprint.md`
- `docs/WORKING/Mobile_Job_Page_V2_M1_Readiness_Audit.md`
- `docs/WORKING/Mobile_Job_Page_V2_M3A_State_Specific_Preview_Audit.md`
- `docs/WORKING/Mobile_Job_Page_V2_M3F_Preview_QA_Matrix.md`
- `docs/WORKING/Mobile_Job_Page_V2_M4A_Promotion_Readiness_Audit.md`
- `docs/WORKING/Mobile_Job_Page_V2_M4F_Screenshot_State_QA_Checklist.md`
- `app/jobs/[id]/page.tsx`
- `app/jobs/[id]/_components/MobileJobDetailCurrent.tsx`
- `app/jobs/[id]/_components/MobileJobDetailV2Preview.tsx`
- focused source-inspection tests under `lib/jobs/__tests__`

## 1. Blueprint Coverage

| Blueprint / owner expectation | Current V2 implementation status | Directly rendered in V2 | Real route/workspace | Standard-current-view escape | Missing / unclear | Notes / recommended next action |
| --- | --- | --- | --- | --- | --- | --- |
| Photo-led hero | Implemented | Yes | No | No | No | Uses `TimedJobLocationPreview` and existing props. |
| Address/photo fallback | Implemented | Yes | No | No | No | `JobLocationPreviewFallback` remains address-first. |
| Customer/contractor/schedule/ref identity | Implemented | Yes | Customer link may be real route | No | No | Header shows job reference/type, customer, contractor when present, schedule. |
| Call/Text/Navigate | Implemented | Yes | `tel:`, `sms:`, Google Maps directions | No | No | Buttons disable honestly when unavailable. |
| Lifecycle rail | Implemented display-only | Yes | No | No | Some state visual smoke still needed | Uses checkmarks/dot/empty circles and attention labels. |
| Dominant Next Step | Implemented | Yes | Tests route for required ECC tests | Standard current anchors for behavior-heavy actions | Full parity for all current branches not native | Continue field-state smoke. |
| ECC Compliance Work | Implemented | Yes | Equipment/tests routes | Permit details/action via standard view | Completion report not explicit | Completion report remains unclear/deferred. |
| Equipment | Implemented | Launcher row | `/jobs/{id}/info?f=equipment` | No | No | Safe real workspace. |
| ECC Tests | Implemented | Launcher row; can be primary when required | `/jobs/{id}/tests` | No | No | Required-test precedence uses existing `sp.notice` plus completed-run check. |
| Permit Information | Implemented | Launcher/status row | No | `mobile-permit-info`; blocker uses current action area | Native permit form not promoted | Expected escape until exact permit form is promoted. |
| Service Work / Work to Do | Implemented | Yes | No | `mobile-work-scope` for detail/edit | Native Work Scope editor not promoted | Safe summary from existing Visit Scope props. |
| Work Performed | Implemented | Yes | No | `mobile-work-scope` | Native FieldOutcomePanel not promoted | Service finish seam still standard-linked. |
| Companion Service Work | Implemented | Yes for ECC companion items | No | `mobile-work-scope` | No | Keeps ECC compliance first. |
| Evidence & Notes | Implemented | Yes | Attachments route | Note bodies/composers standard-linked | Native note composer/body not promoted | Likely next usability slice if hot-links disrupt field work. |
| Team Notes | Implemented as action row | Row is direct launcher | No | `mobile-internal-notes` | Native composer/body not promoted | Expected escape. |
| Shared Notes | Implemented when gated | Row is direct launcher | No | `mobile-shared-notes` | Native composer/body not promoted | Preserves `showSharedNotesCard`. |
| Files & Attachments | Implemented | Row is direct launcher | `/jobs/{id}/attachments` | No | Attachment counts absent | Correct: no count added without loaded count. |
| Billing / Closeout | Implemented summary | Yes | Invoice workspace indirectly through current mobile / standard areas | `mobile-invoice-summary-card`, `mobile-next-service-action` | Native invoice/external billing forms not promoted | M4-E hardening present; keep standard-linked for now. |
| More Details / Tools collapsed/expanded | Implemented | Yes | Some real routes | Some standard anchors | No | One disclosure, direct grouped rows. |
| Create Estimate | Implemented when available | Row when `createEstimateFromJobHref` exists | Existing estimate route | No | No | Safe existing href. |
| Create Return Visit | Implemented for internal Service jobs | Row | No | `mobile-follow-up-job` | Native return-visit form not promoted | Expected escape. |
| Service Plan | Implemented | Row inside expanded tools | Customer service-plans tab when customer context exists | Standard job fallback if no customer href | No | Appears regardless of existing plan context with state-specific helper copy. |
| Job Status Tools | Implemented | Row | No | `mobile-tools` | Native status forms not promoted | Expected escape. |
| Timeline / History | Implemented | Row | No | `mobile-tools-timeline` | Deferred body not promoted | Expected escape; timeline stays deferred/current. |
| Location & Address / Edit service location | Implemented when available | Row inside expanded tools | Existing `serviceLocationEditHref` | No | No | Does not duplicate edit form. |
| Standard View fallback | Implemented | Header link | No | Standard current route | No | Uses `mobileLayout=current` to avoid owner-default bounce-back. |
| Owner-only env default | Implemented | Selection gate in `page.tsx` | No | No | Browser smoke still needed | Env + allowlist + internal/active checks. |
| `mobileLayout=current/classic` fallback | Implemented | Route selection | No | Forces current component | No | Force-current wins over owner-default and explicit V2. |

## 2. Latest Owner-Requested Additions

| Addition | Present | Guard / source basis | Notes |
| --- | --- | --- | --- |
| Evidence & Notes full-width rows | Yes | `Evidence & Notes`, Team Notes, Shared Notes, Files & Attachments rows in V2 | No cramped mini-card layout remains in V2. |
| More Details / Tools flattened into one disclosure | Yes | Single `details` / `summary`; direct `Tools` and `Admin / Records` grouped rows | No generic intermediate `Job Tools / Open tools area` row. |
| Service Plan row inside expanded More Details / Tools whether or not a plan exists | Yes | Always renders Service Plan row with helper determined by plan context | Links to customer service-plan tab when possible. |
| Service Plan links to customer service-plans tab when customer context exists | Yes | `servicePlanToolHref = mobileCustomerHref ? ...?tab=service-plans... : standardJobHref` | Uses `maFocus` when agreement id exists. |
| Generic field completion wording | Yes | `Finish field visit`; `Mark Field Work Complete`; helper `When the field work is done, mark this visit complete.` | Source guards cover this wording. |
| Lifecycle rail uses checkmarks/dot/empty circles, not letters | Yes | V2 lifecycle rendering uses checkmark icon/current dot/empty future circle styling | Needs real-device visual smoke, but code no longer uses letter glyphs. |
| Redundant city suffix removed from V2 hero title only | Yes | `getHeroDisplayTitle(jobWorkbenchTitle, serviceCity)` | Display-only cleanup; does not mutate job title truth. |
| Standard View exits include `mobileLayout=current` | Yes | `standardJobHref = /jobs/${job.id}?tab=${tab}&mobileLayout=current` | Prevents owner-default bounce-back. |

## 3. Expected Standard-Current-View Escapes

| Behavior-heavy action | Classification | Current V2 posture | Notes / recommended next action |
| --- | --- | --- | --- |
| Team Notes composer/body | Expected escape | `mobile-internal-notes` standard-current anchor | Candidate for next native promotion if field-test friction is high. |
| Shared Notes composer/body | Expected escape | `mobile-shared-notes` standard-current anchor | Preserve product-mode/audience gates. |
| Full Work Scope editor | Expected escape | `mobile-work-scope` standard-current anchor | Should remain until `VisitScopeJobDetailForm` payload parity is intentionally promoted. |
| Invoice create/open/edit/action surfaces | Expected escape | `mobile-invoice-summary-card` or invoice workspace via current surfaces | Do not duplicate invoice forms in V2 yet. |
| Permit-needed form | Expected escape | Next Step routes to `mobile-ecc-permit-needed-action` through standard current view | Safe for owner test; exact form could be promoted later. |
| Permit edit form | Expected escape | `mobile-permit-info` standard-current anchor | Native permit edit not promoted. |
| Retest scheduling / move to needs scheduling | Expected escape | `mobile-next-service-action` standard-current anchor | Keep until exact retest payload parity is promoted. |
| Correction review | Expected escape | `mobile-next-service-action` standard-current anchor | Owner decision still needed on correction vs retest primary priority. |
| Waiting release | Expected escape | `mobile-tools` / current action area depending branch | Service waiting remains safe but not fully native. |
| Service follow-up progress controls | Expected escape | `mobile-next-service-action` / `mobile-follow-up-job` standard anchors | Native progress controls not promoted. |
| `FieldOutcomePanel` | Expected escape | Not rendered in V2 | Must be promoted intentionally if Service default rollout expands. |
| Timeline/history body | Expected escape | `mobile-tools-timeline` standard-current anchor | Keeps deferred timeline read out of V2 first paint. |
| Contact logging quick actions | Expected escape | Available through current/mobile tools/context, not native V2 | Preserve scroll restore/return behavior if promoted. |
| Assigned team controls | Expected escape | Current mobile only | Preserve authority/destructive controls. |
| Service plan visit-count and next-due mutation buttons | Expected escape | Service Plan row links to customer/service-plan context; current job actions not native | Mutations remain standard/current or customer context. |

No escape above appears unsafe from source inspection. The main risk is usability friction, not data risk, because the escapes intentionally leave V2 and force current mobile via `mobileLayout=current`.

## 4. CTA Safety Audit

Source-inspected V2 CTA targets:

| CTA / target | Type | Safety status |
| --- | --- | --- |
| `Standard view` | Standard-current route with `mobileLayout=current` | Safe |
| Primary Next Step with `nextStep.anchor` | `standardJobAnchorHref(nextStep.anchor)` | Safe: exits owner-default V2 to current mobile |
| Primary Next Step with `nextStep.href` | Real route, currently tests workspace when required | Safe |
| Undo On the Way text link | `standardJobHref` | Safe |
| Compliance details | `standardJobAnchorHref("mobile-work-scope")` | Safe escape |
| ECC attention summary | `standardJobAnchorHref("mobile-tools" | "mobile-next-service-action")` | Safe escape |
| Equipment | `/jobs/{id}/info?f=equipment` | Safe real workspace |
| ECC Tests | `/jobs/{id}/tests` | Safe real workspace |
| Permit Information | `standardJobAnchorHref("mobile-permit-info")` | Safe escape |
| Service work details | `standardJobAnchorHref("mobile-work-scope")` | Safe escape |
| Team Notes | `standardJobAnchorHref("mobile-internal-notes")` | Safe escape |
| Shared Notes | `standardJobAnchorHref("mobile-shared-notes")` | Safe escape |
| Files & Attachments | `/jobs/{id}/attachments` | Safe real workspace |
| Billing CTA | `standardJobAnchorHref(billingPreview.hrefAnchor)` | Safe escape |
| Create Estimate | `createEstimateFromJobHref` | Safe existing route |
| Create Return Visit | `standardJobAnchorHref("mobile-follow-up-job")` | Safe escape |
| Service Plan | customer service-plans route when available; standard job fallback otherwise | Safe |
| Permit Information tool row | `standardJobAnchorHref("mobile-permit-info")` | Safe escape |
| Job Status Tools | `standardJobAnchorHref("mobile-tools")` | Safe escape |
| Timeline / History | `standardJobAnchorHref("mobile-tools-timeline")` | Safe escape |
| Location & Address | `serviceLocationEditHref` | Safe existing href |
| Call/Text/Navigate | `tel:`, `sms:`, Google Maps directions | Safe |

Findings:

- Standard-current-view exits use `standardJobHref` / `standardJobAnchorHref`.
- `standardJobHref` includes `mobileLayout=current`.
- V2 source does not contain `mobileLayout=v2` in CTA destinations.
- Behavior-heavy CTAs do not remain on the V2 preview while targeting current-only anchors.
- No V2-specific missing preview anchor pattern was found by source inspection.

## 5. Source-Of-Truth Audit

Source inspection confirms:

- No schema or migration changes are part of V2 preview.
- `MobileJobDetailV2Preview.tsx` does not import server actions from action modules.
- `MobileJobDetailV2Preview.tsx` does not create a Supabase client.
- `MobileJobDetailV2Preview.tsx` does not call `.from()`, `.insert()`, `.update()`, `.upsert()`, or `.delete()`.
- ECC test truth is not mutated. V2 only uses existing job/ECC state and routes to `/jobs/{id}/tests`.
- Visit Scope truth is not mutated. V2 displays existing `visitScopeItems` / `visitScopeSummary` and standard-links to current Work Scope.
- Invoice/payment/external billing truth is not mutated. V2 displays existing billing props and standard-links to current/invoice surfaces.
- Service-plan/maintenance-agreement truth is not mutated. V2 links to customer service-plan context and does not render visit-count or next-due mutation buttons.
- Timeline/note truth is not mutated. V2 uses loaded note metadata/signals only and standard-links to existing note/timeline bodies.
- Route reads remain in `page.tsx`.
- Desktop branch remains separate under existing desktop rendering.

## 6. Owner-Only Production Field-Test Posture

| Requirement | Source status | Notes |
| --- | --- | --- |
| Env gate exists | Present | `ENABLE_MOBILE_JOB_V2_OWNER_DEFAULT` must equal `true`. |
| Allowlist email behavior exists | Present | `MOBILE_JOB_V2_ALLOWED_EMAILS`, comma-separated, lowercased. |
| Allowlist user id behavior exists | Present | `MOBILE_JOB_V2_ALLOWED_USER_IDS`, comma-separated, lowercased. |
| Contractors do not get owner-default V2 | Present | Contractor actors redirect to portal; shadow contractor membership blocks owner-default. |
| Portal-only users do not get owner-default V2 | Present | Non-internal actor resolution does not reach internal mobile component selection. |
| Inactive users do not get owner-default V2 | Present | Checks `status !== inactive` and `active !== false`. |
| Env off returns current mobile behavior | Present | `mobileV2OwnerDefaultAllowed` false when env is absent/false. |
| `mobileLayout=v2` explicit preview remains | Present | `explicitlyRequestedMobileV2Preview`. |
| `mobileLayout=current/classic` forces current mobile | Present | `forceCurrentMobileLayout` wins before V2 selection. |
| Desktop remains separate | Present | Source tests assert desktop branch excludes V2 selector. |

Important nuance:

- `mobileLayout=v2` remains available to authenticated internal job-detail users who already pass the route's internal authorization path. It does not override contractor/unauthorized redirects.
- Owner-default is narrower than explicit preview: owner-default requires env + allowlist + active internal posture.

## 7. Field-Test Reconciliation

Use this table for owner field notes during the production owner-only test.

| Job URL | Job type/state | What Eddie clicked | Expected behavior | Actual behavior | Was Standard View needed? | Severity | Recommended fix slice |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Owner field observation | General active field-test use | Visual V2 layout reviewed | V2 should provide approved hero, lifecycle, Next Step, work lane, Evidence & Notes, Billing / Closeout, and tools hierarchy | Visual layout is approved/great | Not for layout | Cosmetic / none | Continue field test |
| Owner field observation | Notes / behavior-heavy areas | Notes or other behavior-heavy rows | V2 should route to current mobile for unpromoted forms/bodies | Notes and behavior-heavy areas hot-link to old/current mobile page | Yes, intentionally | Navigation | Expected for M5-A owner-only field test unless target is broken/confusing |
| TODO | Specific job URL | TODO | TODO | TODO | TODO | cosmetic / navigation / workflow blocker / data risk | TODO |

Interpretation:

- Hot-linking to the current mobile page is expected for M5-A because V2 is owner-only field-test shell and behavior-heavy forms are not native.
- This should be treated as a navigation friction issue, not a data risk, unless a target anchor is broken, confusing, or loses return context.
- If notes are the most frequently used escape, native Notes should be the first promotion candidate.

## 8. Missing / Risky / Unclear Items

| Item | Risk | Recommendation |
| --- | --- | --- |
| Native Team/Shared Notes composer/body | Navigation friction | Candidate next slice if field test confirms notes are high-frequency. |
| Native FieldOutcomePanel / Service finish seam | Workflow friction for Service default rollout | Defer until exact action payload parity is planned. |
| Native permit-needed form | Navigation friction in ECC permit states | Accept during owner test; promote only with exact current hidden fields and returns. |
| Native invoice/external billing controls | Financial correctness risk if rushed | Keep standard-linked until separate parity slice. |
| Native retest/correction controls | Workflow correctness risk if rushed | Keep standard-linked; owner decision still needed on primary priority. |
| Completion Report explicit launcher/status | Unclear route/status mapping | Audit exact current route/status before adding to Compliance Work. |
| Full compact Job Context | Not fully implemented as blueprint envisioned | Current V2 keeps hero plus tools; contact/team/location admin remains standard-linked. |

## 9. Final Recommendation

Decision: **Keep owner-only V2 default and continue field test**.

Why:

- Blueprint hierarchy is intact.
- Owner-requested visual/layout additions are present.
- Source-of-truth and action boundaries remain protected.
- Owner-default is tightly gated by env + allowlist + current/internal posture.
- Standard View fallback is explicit and includes `mobileLayout=current`.
- Hot-linking to current mobile for behavior-heavy Notes/tools is expected in this phase.

Do not promote beyond owner-only yet.

Recommended next slice:

1. If field notes show Notes are the main annoyance: **M5-B1 native Notes entry/body promotion audit or implementation slice**.
2. If field notes show navigation wording confusion: **small CTA copy polish for standard-view escapes**.
3. If field notes show workflow blockers: stop native expansion and fix the specific broken target/anchor first.

## 10. Explicit Non-Actions

This audit did not change product code.

It did not:

- change route reads;
- change server actions;
- change schemas or migrations;
- change helpers/source-of-truth logic;
- change desktop rendering;
- change auth/RLS policies;
- promote V2 to all users;
- mutate jobs, notes, invoices, permits, service plans, timeline, or Visit Scope truth.

