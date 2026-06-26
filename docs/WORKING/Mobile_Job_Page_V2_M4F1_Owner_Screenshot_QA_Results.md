# Mobile Job Page V2 M4-F1 Owner Screenshot QA Results

Status: Phase M4-F1 QA results report only  
Date: 2026-06-26  
Scope: preview-only internal mobile `/jobs/[id]?mobileLayout=v2`

## Executive Summary

No authenticated browser session or representative owner-approved fixture set was available in this run, so no visual screenshot state is marked as passing.

This report therefore records:

- Source-confirmed route gating and CTA safety posture.
- The exact states and viewport checks still needing owner/fixture review.
- A final recommendation based on the absence of completed screenshot evidence.

Recommendation: **Keep query-param preview only** until owner screenshots are captured and approved.

## Inputs Reviewed

- `docs/WORKING/Mobile_Job_Page_V2_M4F_Screenshot_State_QA_Checklist.md`
- `docs/WORKING/Mobile_Job_Page_V2_M4A_Promotion_Readiness_Audit.md`
- `app/jobs/[id]/_components/MobileJobDetailV2Preview.tsx`
- `app/jobs/[id]/page.tsx`

## Execution Limitation

Authenticated local browser access and a representative job fixture list were not available for this pass.

Per the M4-F checklist and this task's instructions, uninspected states are marked **Needs fixture / owner review** rather than passed.

No jobs were created or mutated for this report.

## Source-Confirmed Invariants

These items were confirmed by source inspection only:

- `/jobs/[id]` still defaults to `MobileJobDetailCurrent`.
- `/jobs/[id]?mobileLayout=v2` remains gated by `mobileLayout === "v2"` and selects `MobileJobDetailV2Preview`.
- The V2 preview uses `standardJobHref = /jobs/${job.id}?tab=${tab}` for standard/current-view exits.
- The V2 preview uses `standardJobAnchorHref(anchor)` for standard-current-view anchor links, omitting `mobileLayout=v2`.
- The V2 hero title uses a display-only `heroDisplayTitle` derived from `jobWorkbenchTitle` and `serviceCity`.
- Behavior-heavy current-only destinations remain standard-current-view exits rather than duplicated forms.
- Direct workspace links remain real routes where applicable:
  - Equipment: `/jobs/{id}/info?f=equipment`
  - Tests: `/jobs/{id}/tests`
  - Attachments: `/jobs/{id}/attachments`
  - Service Plan: customer Service Plans tab when customer context is available
- More Details / Tools is implemented as a collapsed disclosure with direct grouped rows.
- Service Plan appears inside expanded More Details / Tools.

## CTA Destination Review

Source-inspected CTA posture:

| CTA family | Destination posture | Result |
| --- | --- | --- |
| Standard view | `/jobs/{id}?tab={tab}` | Source-confirmed |
| Next Step behavior-heavy anchors | `standardJobAnchorHref(nextStep.anchor)` | Source-confirmed |
| Work / Visit Scope | `standardJobAnchorHref("mobile-work-scope")` | Source-confirmed |
| Internal notes | `standardJobAnchorHref("mobile-internal-notes")` | Source-confirmed |
| Shared notes | `standardJobAnchorHref("mobile-shared-notes")` | Source-confirmed |
| Invoice / Billing | `standardJobAnchorHref(billingPreview.hrefAnchor)` | Source-confirmed |
| Permit Information | `standardJobAnchorHref("mobile-permit-info")` | Source-confirmed |
| Retest / correction / closeout action areas | standard current mobile anchors such as `mobile-next-service-action` | Source-confirmed |
| Timeline / History | `standardJobAnchorHref("mobile-tools-timeline")` | Source-confirmed |
| Equipment | `/jobs/{id}/info?f=equipment` | Source-confirmed real route |
| ECC Tests | `/jobs/{id}/tests` | Source-confirmed real route |
| Files & Attachments | `/jobs/{id}/attachments` | Source-confirmed real route |
| Service Plan | customer profile service-plan tab when available; standard job fallback otherwise | Source-confirmed |

No source-inspected preview CTA introduced a standard-current-view anchor containing `mobileLayout=v2`.

## Screenshot QA Results

Legend:

- **Not inspected**: no authenticated browser/fixture review occurred.
- **Needs fixture / owner review**: a representative state fixture is required before this can pass.

### ECC States

| State | Job URL | Viewports checked | Next Step copy | Primary CTA | Work/Compliance behavior | Billing / Closeout behavior | More Details behavior | CTA destination behavior | Pass/fail | Notes/issues |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ECC scheduled/open | Not provided | None | Expected: normal lifecycle such as `Head to the job` | Expected: lifecycle action or safe standard-view fallback | Expected: Compliance Work visible | Expected: quiet | Expected: collapsed by default; expands to direct rows | Source pattern safe; visual not inspected | Needs fixture / owner review | Need fixture at 360/390/430. |
| ECC on the way | Not provided | None | Expected: `Start the visit` | Expected: lifecycle action or safe standard-view fallback | Expected: Compliance Work supporting | Expected: quiet | Expected: collapsed by default | Source pattern safe; visual not inspected | Needs fixture / owner review | Need Undo On the Way fixture if available. |
| ECC in progress | Not provided | None | Expected: `Finish field visit` unless required tests active | Expected: `Mark Field Work Complete` or tests route if required | Expected: Compliance Work prominent | Expected: quiet while field/compliance active | Expected: collapsed by default | Source pattern safe; visual not inspected | Needs fixture / owner review | Confirm billing does not lead. |
| ECC required tests active | Not provided | None | Expected: `Complete required tests` | Expected: `Open tests` to tests workspace | Expected: ECC Tests row available | Expected: quiet | Expected: collapsed by default | `/jobs/{id}/tests` source-confirmed | Needs fixture / owner review | Need fixture with `ecc_test_required` truth. |
| ECC permit needed after tests complete | Not provided | None | Expected: `Permit needed` | Expected: `Review permit info` | Expected: Permit row shows needed/status posture | Expected: quiet or closeout-aware without outranking permit | Expected: Permit Information in expanded tools | Standard-current permit anchors source-confirmed | Needs fixture / owner review | Need fixture proving tests complete and permit blocking. |
| ECC failed / pending office review | Not provided | None | Expected: correction/retest/review wording | Expected: standard current action area | Expected: not normal active work | Expected: not invoice-led unless gated | Expected: tools/history reachable | Standard-current action anchors source-confirmed | Needs fixture / owner review | Need failed reason / pending review fixture. |
| ECC retest needed | Not provided | None | Expected: `Retest needed` | Expected: `Open retest actions` | Expected: Compliance Work available | Expected: quiet unless closeout/billing gated | Expected: tools/history reachable | Standard-current retest area source-confirmed | Needs fixture / owner review | Need retest-needed fixture. |
| ECC linked retest parent | Not provided | None | Expected: linked/passive wording | Expected: review retest history or safe standard view | Expected: does not imply active parent work | Expected: review/history posture | Expected: tools/history reachable | Standard-current tools/history source-confirmed | Needs fixture / owner review | Need linked parent fixture. |
| ECC field complete / closeout pending | Not provided | None | Expected: closeout/certs/blocker-specific copy | Expected: standard current closeout action area | Expected: Compliance Work before Billing / Closeout | Expected: closeout review only when gated | Expected: tools/history reachable | Standard-current closeout anchors source-confirmed | Needs fixture / owner review | Need field-complete closeout fixture. |
| ECC closed/cancelled/archived | Not provided | None | Expected: read-only/history language | Expected: `Review job history` | Expected: no active compliance implication | Expected: read-only review/history posture | Expected: tools/history reachable | Standard-current tools source-confirmed | Needs fixture / owner review | Use non-redirecting historical fixture if available. |

### Service States

| State | Job URL | Viewports checked | Next Step copy | Primary CTA | Work/Compliance behavior | Billing / Closeout behavior | More Details behavior | CTA destination behavior | Pass/fail | Notes/issues |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Service scheduled/open with Work to Do | Not provided | None | Expected: normal lifecycle such as `Head to the job` | Expected: lifecycle action or safe fallback | Expected: `Work to Do` prominent | Expected: quiet unless gated | Expected: Service Plan inside expanded tools | Source pattern safe; visual not inspected | Needs fixture / owner review | Need Visit Scope fixture. |
| Service in progress | Not provided | None | Expected: `Finish field visit` | Expected: `Mark Field Work Complete` if generic branch applies | Expected: Work to Do before Billing / Closeout | Expected: quiet unless field-complete/billing gated | Expected: collapsed by default | Source pattern safe; visual not inspected | Needs fixture / owner review | Confirm no FieldOutcomePanel duplication. |
| Service waiting / pending info | Not provided | None | Expected: waiting label such as `Waiting on info` | Expected: standard waiting/tools action area | Expected: Work lane remains context | Expected: quiet unless separately gated | Expected: tools/history reachable | Standard-current tools source-confirmed | Needs fixture / owner review | Need pending-info fixture. |
| Service parts needed / approval needed | Not provided | None | Expected: `Waiting on part` or `Approval needed` | Expected: standard current action area | Expected: Work lane remains context | Expected: quiet unless separately gated | Expected: tools/history reachable | Standard-current tools source-confirmed | Needs fixture / owner review | Use if fixture exists. |
| Service unable to complete / follow-up needed | Not provided | None | Expected: service follow-up wording | Expected: standard follow-up action area | Expected: Work lane visible | Expected: quiet unless closeout/billing gated | Expected: Create Return Visit when gated | Standard-current follow-up anchor source-confirmed | Needs fixture / owner review | Need follow-up fixture. |
| Service field complete / billing needed | Not provided | None | Expected: `Billing review`, `Review invoice`, or closeout wording | Expected: standard invoice/current billing area | Expected: `Work Performed` before Billing / Closeout | Expected: billing/closeout prominent when gated | Expected: tools/history reachable | Standard-current invoice anchor source-confirmed | Needs fixture / owner review | Need field-complete invoice fixture. |
| Service external billing | Not provided | None | Expected: `External billing review` | Expected: `Review external billing` | Expected: Work Performed remains above Billing / Closeout | Expected: external billing review prominent | Expected: tools/history reachable | Standard-current next-service action area source-confirmed | Needs fixture / owner review | Need external billing fixture. |
| Service closed/cancelled/archived | Not provided | None | Expected: read-only/history language | Expected: `Review job history` | Expected: no active field implication | Expected: read-only review/history posture | Expected: tools/history reachable | Standard-current tools source-confirmed | Needs fixture / owner review | Use non-redirecting historical fixture if available. |

## Viewport Results

No viewport screenshots were captured in this pass.

| Viewport | Result | Notes |
| --- | --- | --- |
| 360px | Needs fixture / owner review | Check no horizontal overflow, hero wrapping, lifecycle labels, Evidence & Notes badges, and collapsed tools row. |
| 390px | Needs fixture / owner review | Owner-review baseline still required for every representative state. |
| 430px | Needs fixture / owner review | Confirm larger-phone spacing and no hierarchy drift. |

## Default Route / Preview Gate Confirmation

Source inspection confirms:

- `page.tsx` imports `MobileJobDetailCurrent`.
- `page.tsx` imports `MobileJobDetailV2Preview`.
- `page.tsx` derives `useMobileV2Preview` from `mobileLayout === "v2"`.
- `MobileJobDetailMobileComponent` selects `MobileJobDetailV2Preview` only when `useMobileV2Preview` is true.
- Otherwise, `MobileJobDetailMobileComponent` selects `MobileJobDetailCurrent`.

Browser confirmation is still required:

- [ ] `/jobs/{id}` renders current mobile.
- [ ] `/jobs/{id}?mobileLayout=v2` renders preview.

## Desktop Confirmation

Desktop was not browser-inspected in this pass.

Source review did not identify a desktop selection change in this report. Desktop remains out of scope and must still be smoke-checked before rollout:

- [ ] Desktop `/jobs/{id}` remains existing desktop branch.
- [ ] Desktop is not affected by `MobileJobDetailV2Preview`.

## Open QA Blockers

Before any env-flagged internal default:

1. Provide or identify representative ECC and Service job IDs for the M4-F matrix.
2. Capture 390px screenshots for every required state.
3. Capture 360px, 390px, and 430px screenshots for at least:
   - one normal ECC state,
   - one Service Work Items state,
   - one read-only or exception state.
4. Click or inspect behavior-heavy CTAs to confirm:
   - real routes/workspaces remain direct;
   - standard-current-view exits omit `mobileLayout=v2`;
   - no preview route points to a missing hash anchor.
5. Owner must explicitly accept or reject standard-current-view escapes for:
   - permit-needed action,
   - invoice/external billing action,
   - retest/correction action,
   - waiting/release action,
   - Field Outcome / Service finish action.

## Final Recommendation

Decision: **Keep query-param preview only**.

Reason:

- No representative authenticated screenshots were captured.
- No state in the M4-F matrix can be marked as visually passing.
- Source inspection supports the safety posture, but owner visual QA is still required before env-flagged default rollout.

Promotion status:

- Ready for env-flagged internal default: **No**
- Needs one more polish slice: **Not determined from this pass**
- Keep query-param preview only: **Yes**

## Sign-Off

Reviewer: Not completed  
Date: 2026-06-26  
Decision: Keep query-param preview only pending owner screenshots  
Notes: Source safety posture was reviewed; visual fixture review remains open.

