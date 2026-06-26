# Mobile Job Page V2 M1-E Timing Baseline Notes

Status: Phase M1-E timing baseline notes only  
Date: 2026-06-25  
Scope: internal mobile `/jobs/[id]` before Mobile V2 visual implementation

## 1. Baseline Capture Status

No authenticated timing samples were captured in this pass.

Reason: the available workspace context does not include an authenticated browser session or confirmed local representative job URLs for the required ECC and Service states. The `/jobs/[id]` route requires authenticated internal access before the timing log is emitted. Without that session, any numbers would be fabricated or would only measure redirect/login behavior, not job-detail rendering.

This document therefore records the current timing hooks, target state matrix, and exact measurement plan to run before Mobile V2 visual work.

No product code was changed.

## 2. Existing Timing Source

The route already supports env-gated diagnostics:

- Env flag: `JOB_DETAIL_TIMING_DEBUG=true`
- Log marker: `[job-detail-timing]`
- File: `app/jobs/[id]/page.tsx`
- Emission point: `JobDetailTimingLog`
- Log payload: JSON with `routeLabels` and `phasesMs`

Target timing labels to record:

- `totalServerRenderBeforeResponse`
- `mainJobRead`
- `eccPayloadReads`
- `assignmentDisplaySummary`
- `serviceChainSummary`
- `immediateInvoiceTruthRead`
- `deferredInvoicePanelRead`
- `jobLocationPreviewBlocking`
- `serviceStatusActionsBlocking`
- `compositionPrep`

Additional available labels worth keeping with the raw sample:

- `createClient`
- `authGetUser`
- `actorRoleResolution`
- `sameAccountScopedJobBoundary`
- `contractorsRead`
- `businessProfileReads`
- `timelineSummary`
- `customerAttemptSummary`
- `undoEligibility`
- `billingCustomerContractorReads`

## 3. Target State Matrix

| State | Capture status | Notes |
|---|---|---|
| ECC scheduled/open | Not captured | Need authenticated internal job URL with `job_type=ecc`, scheduled/open state |
| ECC on the way | Not captured | Need job where lifecycle action shows in-progress transition/undo eligibility |
| ECC in progress | Not captured | Need job where ECC tests/equipment shortcuts are active and Service outcome panel remains hidden |
| ECC field complete / permit needed | Not captured | Need permit blocker active and cert action suppressed |
| ECC failed or retest-needed | Not captured | Need failed, pending office review, or retest-needed branch |
| Service scheduled/open | Not captured | Need service job with normal lifecycle action and Work Items surface |
| Service field complete / invoice needed | Not captured | Need internal or external billing closeout responsibility |
| Service waiting/follow-up state | Not captured | Need pending info/waiting/on-hold or service follow-up progress state |

## 4. Capture Procedure

Use the existing diagnostics only. Do not add new instrumentation.

1. Start the app with timing enabled:

```powershell
$env:JOB_DETAIL_TIMING_DEBUG='true'; npm.cmd run dev
```

2. Sign in as an internal user in a browser.

3. Use a mobile viewport, preferably 390px and/or 430px wide.

4. Visit each representative `/jobs/[id]` URL once to warm local build/server behavior.

5. Refresh the same route and capture the next `[job-detail-timing]` server-console log.

6. Save the full JSON payload for each sample, including:

- `jobId`
- `routeLabels`
- `phasesMs`
- viewport width
- job state label used for the matrix row
- whether the route had `banner`, `notice`, or `schedule_required` query params

7. Repeat at least 3 times for each state if practical. Use median values as the baseline and keep min/max as noise context.

## 5. Baseline Table Template

Fill this table after authenticated capture.

| State | Samples | totalServerRenderBeforeResponse median | mainJobRead | eccPayloadReads | assignmentDisplaySummary | serviceChainSummary | immediateInvoiceTruthRead | deferredInvoicePanelRead | jobLocationPreviewBlocking | serviceStatusActionsBlocking | compositionPrep |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| ECC scheduled/open | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| ECC on the way | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| ECC in progress | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| ECC field complete / permit needed | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| ECC failed or retest-needed | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| Service scheduled/open | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| Service field complete / invoice needed | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| Service waiting/follow-up state | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

## 6. Interpretation Notes For Mobile V2

Use `totalServerRenderBeforeResponse` as the primary route-level baseline. Mobile V2 presentation changes should not materially increase this unless an explicitly approved new read or heavy computation is added.

Use `compositionPrep` to watch for added presentation logic cost from:

- lifecycle rail display mapping;
- next-step card assembly;
- Compliance Work lane status mapping;
- compact Job Context summary building;
- hero address/contact composition.

Use `jobLocationPreviewBlocking` to evaluate photo hero risk. If the preview moves upward in V2, primary job identity and next action should still render independently from the image result/fallback.

Use `immediateInvoiceTruthRead` and `deferredInvoicePanelRead` as correctness-sensitive billing indicators only. Do not optimize or trim billing/payment behavior as part of general Mobile V2 performance work.

Use `serviceStatusActionsBlocking` as a warning signal for non-Service status tooling that remains in More Details / Tools. If V2 keeps those tools collapsed/lower priority, do not accidentally move this work into the first viewport.

## 7. Required Raw Log Shape

Each captured entry should resemble:

```json
{
  "jobId": "...",
  "routeLabels": {
    "tab": "ops",
    "hasNotice": false,
    "hasBanner": false,
    "hasScheduleRequired": false,
    "isEccNoticeBranch": false,
    "actorKind": "internal",
    "invoicePanelActive": false,
    "serviceCaseExists": false,
    "timelineChainExists": false
  },
  "phasesMs": {
    "mainJobRead": 0,
    "eccPayloadReads": 0,
    "assignmentDisplaySummary": 0,
    "serviceChainSummary": 0,
    "immediateInvoiceTruthRead": 0,
    "deferredInvoicePanelRead": 0,
    "jobLocationPreviewBlocking": 0,
    "serviceStatusActionsBlocking": 0,
    "compositionPrep": 0,
    "totalServerRenderBeforeResponse": 0
  }
}
```

Do not commit logs that expose customer names, addresses, emails, phone numbers, or secrets. The current timing payload is designed to avoid those details, but captured terminal context should still be reviewed before sharing.

## 8. Stop Conditions

Do not use a sample if:

- the request redirected to `/login`;
- the request redirected to the contractor portal;
- the job is deleted/archived and redirects away;
- the browser was not authenticated as an internal user;
- the route was hit during initial dev compilation;
- the log lacks `[job-detail-timing]`;
- the state does not match the intended matrix row.

## 9. Explicit Non-Actions

This baseline note did not change product code.

No schema, migration, Supabase state, server action, helper, source-of-truth logic, revalidation behavior, shared component, or Mobile V2 visual implementation was changed.
