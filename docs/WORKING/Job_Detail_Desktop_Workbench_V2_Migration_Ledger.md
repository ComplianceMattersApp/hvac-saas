# Job Detail Desktop Workbench V2 Migration Ledger

Date: 2026-06-15
Branch: `feature/job-detail-desktop-visual-lab`
Scope: desktop V2 preview only for internal `/jobs/[id]`

## Slice: Site / Place & Work

### Items reviewed

| Legacy item | Status | Notes |
|---|---|---|
| Service location visual/preview | Migrated to V2 preview | Reuses the existing `TimedJobLocationPreview` wrapper and `JobLocationPreview` props. No new reads were added. |
| Address display | Migrated to V2 preview | Uses existing route-derived `serviceAddressDisplay` and service address parts. |
| Navigate / Open Maps affordances | Migrated as part of preview component | These remain inside the existing `JobLocationPreview` behavior. No new custom links were added. |
| Correct address link | Migrated to V2 preview | Reuses existing `serviceLocationEditHref` and internal-user gate. |
| Add new location link | Migrated to V2 preview | Reuses existing `customerId` and internal-user gate. |
| Change Service Location form | Deferred | This is a live form/action surface. Deferring avoids introducing the first V2 migration slice as a form/action migration. |
| Invoice-history warning for location changes | Deferred with change-location flow | Must move together with `ChangeServiceLocationForm` in a later explicit action/form migration slice. |

### Performance notes

- No new database reads were introduced.
- The V2 site preview reuses existing route-loaded service location data.
- The V2 preview renders one location preview because `JobDetailDesktopWorkbenchV2` ignores the legacy desktop children on the V2 path.
- Existing `Suspense` and `TimedJobLocationPreview` behavior is preserved for the migrated V2 site preview.
- Deferred/expensive unrelated sections such as notes history, attachments, timeline, service chain, invoice detail, and ECC detail were not migrated.

### Validation

- `npx.cmd tsc --noEmit`
- `npx.cmd vitest run lib/jobs/__tests__/job-detail-service-address-edit-affordance.test.ts lib/actions/__tests__/job-service-location-change.test.ts lib/actions/__tests__/job-location-regression-guards.test.ts lib/jobs/__tests__/job-detail-field-outcome-panel-wiring.test.ts lib/jobs/__tests__/job-detail-invoice-banner.test.ts lib/jobs/__tests__/job-detail-ecc-retest-bridge-wiring.test.ts lib/jobs/__tests__/job-detail-header-reference-wiring.test.ts lib/actions/__tests__/return-visit-action-wiring.test.ts`
- `git diff --check`

## Slice: Job Brief Read-Only

### Items reviewed

| Legacy item | Status | Notes |
|---|---|---|
| Visit Reason | Migrated to V2 preview | Uses the existing `visitReasonText` display fallback, preserving the current priority of service visit reason, job title, and visit-scope lead text. |
| Customer Concern | Migrated to V2 preview | Uses the existing `shouldShowCustomerConcern` gate and `jobTitleText`; remains visually distinct from Visit Reason. |
| Intake Notes | Migrated to V2 preview | Uses the existing `shouldShowIntakeNotes` gate and `jobNotesText`; remains visually distinct from shared/field/internal notes. |
| Work Summary | Migrated to V2 preview | Uses the existing `shouldShowWorkSummary` gate and `visitScopeSummary`; remains separate from Visit Reason and Intake Notes. |
| Service Details display text | Migrated to V2 preview | Adds read-only classification context for job type, service type, visit type, visit outcome, and reason-for-visit when applicable. Reuses route-loaded `job` and `serviceCase` data only. |
| Visit Reason edit control | Deferred | This is a live form/action surface wired to `updateJobVisitScopeFromForm`; edit controls are intentionally out of scope for the read-only Job Brief slice. |
| Service Details edit form | Deferred | This is a live form/action surface wired to `updateJobServiceContractFromForm`; moving it requires a later explicit form/action migration slice. |
| Work Items link/editor | Deferred | `VisitScopeJobDetailForm` and the Work Items editor belong to the Primary Work zone, which is intentionally not migrated in this slice. |

### Performance notes

- No new database reads were introduced.
- The V2 Job Brief uses only existing route-loaded values and derived display booleans already used by legacy desktop.
- No heavy/deferred sections were rendered for this slice.
- The V2 preview still ignores legacy desktop children on the V2 path, avoiding duplicate Job Brief rendering in the V2 preview.
- Primary Work, People, Notes, Billing, ECC, Records, Timeline, Attachments, and Service Chain remain unmigrated.

### Validation

- `npx.cmd tsc --noEmit`
- `npx.cmd vitest run lib/jobs/__tests__/job-tests-page-wiring.test.ts -t "keeps visit reason and intake notes below the location preview"`
- `npx.cmd vitest run lib/jobs/__tests__/job-detail-job-type-switch-hidden.test.ts lib/jobs/__tests__/job-detail-service-address-edit-affordance.test.ts lib/jobs/__tests__/job-detail-field-outcome-panel-wiring.test.ts lib/jobs/__tests__/job-detail-invoice-banner.test.ts lib/jobs/__tests__/job-detail-ecc-retest-bridge-wiring.test.ts lib/jobs/__tests__/job-detail-header-reference-wiring.test.ts lib/actions/__tests__/return-visit-action-wiring.test.ts`
- `git diff --check`

Note: a broader `job-tests-page-wiring.test.ts` run was attempted and the relevant Job Brief assertion passed, but unrelated legacy field-operations-board source-string assertions in that file failed against the current visual-lab branch structure.

## Slice: V2 Pulse Header + Status Summary Strip

### Items reviewed

| Legacy item | Status | Notes |
|---|---|---|
| Job title / display title | Migrated to V2 Pulse preview | Uses existing `jobWorkbenchTitle`; no new source field was introduced. |
| Job number / display reference | Migrated to V2 Pulse preview | Uses existing `jobHeaderReference` from `formatJobDisplayReference`. |
| Service case reference | Migrated to V2 Pulse preview | Uses already-loaded `serviceCaseId`, `serviceCase.case_kind`, and `serviceCaseVisitCount`; no new service-case read was added. |
| Created timestamp | Migrated to V2 Pulse preview | Uses already-loaded `job.created_at` with the existing timestamp display helper. |
| Header actions | Deferred | Share, Edit Job, and Actions remain inert placeholders. Real navigation/actions are intentionally deferred to a later action/header slice. |
| Status / lifecycle state | Migrated to V2 Pulse preview | Uses existing `formatOpsStatusLabel`, `formatStatus`, `job.ops_status`, `job.status`, and field-complete state. |
| Priority | Deferred | No route-loaded priority source was identified for this page. The strip keeps an explicit priority placeholder. |
| Aging | Migrated to V2 Pulse preview | Uses already-loaded `job.created_at` for a lightweight elapsed-days/opened-date display. |
| Schedule date/window | Migrated to V2 Pulse preview | Uses existing `appointmentDateLabel` and `appointmentTimeLabel`. |
| Service location summary | Migrated to V2 Pulse preview | Uses existing `serviceAddressDisplay`; the full site/location card remains unmigrated in Pulse. |
| Customer summary | Migrated to V2 Pulse preview | Uses existing `customerDisplayName`, `customerPhone`, and `customerEmail`. |
| Assigned team summary | Migrated to V2 Pulse preview | Uses existing `assignedTeam` and primary assignee display data. |

### Performance notes

- No new database reads were introduced.
- The V2 Pulse header and status strip use only route-loaded job, service case, customer, schedule, location, and assignment display data.
- Header action placeholders remain inert and do not render forms, links, server actions, or mutation paths.
- The Job Pulse hero, Activity rail, operational cards, records dock, Job Brief, People, Site Card, Work, Billing, ECC, Timeline, Attachments, Notes, and Service Chain remain unmigrated in `v2-pulse`.

### Validation

- `npx.cmd tsc --noEmit`
- `npx.cmd vitest run lib/jobs/__tests__/job-detail-job-type-switch-hidden.test.ts lib/jobs/__tests__/job-detail-service-address-edit-affordance.test.ts lib/jobs/__tests__/job-detail-field-outcome-panel-wiring.test.ts lib/jobs/__tests__/job-detail-invoice-banner.test.ts lib/jobs/__tests__/job-detail-ecc-retest-bridge-wiring.test.ts lib/jobs/__tests__/job-detail-header-reference-wiring.test.ts lib/actions/__tests__/return-visit-action-wiring.test.ts`
- `git diff --check`

## Slice: V2 Pulse Hero Read-Only State

### Items reviewed

| Hero item | Status | Notes |
|---|---|---|
| Current lifecycle/status | Migrated to V2 Pulse hero | Uses existing `formatOpsStatusLabel`, `job.ops_status`, `job.status`, and closed/cancelled/archive booleans already derived in the route. |
| Field status / field completion | Migrated to V2 Pulse hero | Uses existing `job.field_complete`, `isFieldComplete`, and lifecycle status. |
| Schedule state | Migrated to V2 Pulse hero | Uses existing `job.scheduled_date`, `appointmentDateLabel`, and `appointmentTimeLabel`. |
| Current next-action copy | Partially migrated | Uses existing `nextActionPreview` when present; otherwise uses conservative read-only copy based on already-rendered lifecycle/schedule/field/closeout values. |
| Closeout readiness headline | Migrated to V2 Pulse hero | Uses existing `primaryCloseoutMessage`, `isCloseoutPending`, and closeout needs already computed in the route. |
| Workflow/progress stages | Migrated as read-only display | Stages are derived only from already-loaded schedule, lifecycle, field-complete, closed, and billing truth values. No new workflow source was introduced. |
| Existing action/button copy | Deferred | Hero controls remain non-mutating display only. No submit buttons, mutation links, server actions, or live controls were introduced. |
| Last visit chip | Deferred | The hero chip remains an explicit `Deferred` placeholder because no route-loaded last-visit source was identified for this slice. |

### Performance notes

- No new database reads were introduced.
- The V2 Pulse hero uses only existing route-loaded job/schedule/billing data and existing route-derived closeout/status values.
- No heavy/deferred bodies were rendered: timeline, notes history, attachments, invoices, ECC detail, and service chain remain untouched.
- Operational cards, Activity rail, Records dock, People, Site Card, Work, Billing, ECC, Notes, Attachments, and Service Chain remain unmigrated in `v2-pulse`.

### Validation

- `npx.cmd tsc --noEmit`
- `npx.cmd vitest run lib/jobs/__tests__/job-detail-job-type-switch-hidden.test.ts lib/jobs/__tests__/job-detail-service-address-edit-affordance.test.ts lib/jobs/__tests__/job-detail-field-outcome-panel-wiring.test.ts lib/jobs/__tests__/job-detail-invoice-banner.test.ts lib/jobs/__tests__/job-detail-ecc-retest-bridge-wiring.test.ts lib/jobs/__tests__/job-detail-header-reference-wiring.test.ts lib/actions/__tests__/return-visit-action-wiring.test.ts`
- `git diff --check`

## Slice: V2 Pulse Top Strip Spacing + Hero Copy Cleanup

### Items reviewed

| Item | Status | Notes |
|---|---|---|
| Priority strip tile | Removed / deferred | No route-loaded priority source exists yet, so the placeholder tile was removed instead of showing fake priority. |
| Status strip fields | Retained | Status, Aging, Schedule, Service Location, Customer, and Assigned Team remain in the strip. |
| Strip spacing | Refined | The strip now uses six columns with extra width for Service Location, Customer, and Assigned Team to reduce truncation. |
| Hero scheduling copy | Refined | `need_to_schedule` now takes precedence over field lifecycle `in_process` for V2 Pulse hero title/body, preventing "Complete Field Work" from contradicting a scheduling-needed status. |
| Hero in-process/closeout/closed copy | Retained | Existing read-only state rules remain for field-active, closeout, and closed posture. |
| Hero controls | Deferred | No live buttons, links, forms, submit buttons, server actions, or mutation paths were introduced. |

### Performance notes

- No new database reads were introduced.
- No heavy/deferred components were rendered.
- This slice only changes V2 Pulse display spacing/copy; no additional content zones were migrated.

### Validation

- `npx.cmd tsc --noEmit`
- `npx.cmd vitest run lib/jobs/__tests__/job-detail-job-type-switch-hidden.test.ts lib/jobs/__tests__/job-detail-service-address-edit-affordance.test.ts lib/jobs/__tests__/job-detail-field-outcome-panel-wiring.test.ts lib/jobs/__tests__/job-detail-invoice-banner.test.ts lib/jobs/__tests__/job-detail-ecc-retest-bridge-wiring.test.ts lib/jobs/__tests__/job-detail-header-reference-wiring.test.ts lib/actions/__tests__/return-visit-action-wiring.test.ts`
- `git diff --check`

## Slice: V2 Pulse Service Location / Site Card

### Items reviewed

| Service-location item | Status | Notes |
|---|---|---|
| Service location visual/preview | Migrated to V2 Pulse preview | The Pulse hero site snapshot now renders one compact `TimedJobLocationPreview` with the existing `Suspense` fallback behavior. |
| Address display | Migrated to V2 Pulse preview | Uses existing `serviceAddressDisplay` and route-derived service address parts. |
| Compact operational Service Location card | Migrated to V2 Pulse preview | The Pulse operational grid now uses real address/site context for the Service Location card while other cards remain placeholders. |
| Navigation affordance | Migrated where available | Uses the existing route-derived maps/navigation href when an address is available. |
| Correct address link | Migrated as safe navigation | Reuses existing `serviceLocationEditHref` and internal-user gate; no mutation form is introduced. |
| Add new location link | Migrated as safe navigation | Reuses existing `customerId` and internal-user gate to open customer location/contact management. |
| Change Service Location form | Deferred | This remains a live mutation form and is intentionally not moved into Pulse in this slice. |

### Performance notes

- No new database reads were introduced.
- The Pulse site snapshot reuses existing route-loaded service location/address data.
- Pulse renders a single compact location preview in the hero site snapshot; the operational card is address/navigation-only to avoid duplicate preview work.
- Existing `Suspense` and `TimedJobLocationPreview` behavior is preserved.
- Notes, timeline, attachments, invoice detail, ECC detail, service-chain body, and other deferred/heavy sections were not rendered.

### Validation

- `npx.cmd tsc --noEmit`
- `npx.cmd vitest run lib/jobs/__tests__/job-detail-service-address-edit-affordance.test.ts lib/actions/__tests__/job-service-location-change.test.ts lib/actions/__tests__/job-location-regression-guards.test.ts lib/jobs/__tests__/job-detail-job-type-switch-hidden.test.ts lib/jobs/__tests__/job-detail-field-outcome-panel-wiring.test.ts lib/jobs/__tests__/job-detail-invoice-banner.test.ts lib/jobs/__tests__/job-detail-ecc-retest-bridge-wiring.test.ts lib/jobs/__tests__/job-detail-header-reference-wiring.test.ts lib/actions/__tests__/return-visit-action-wiring.test.ts`
- `git diff --check`

## Slice: V2 Pulse Hero/Site/Assignment Cleanup

### Items reviewed

| Item | Status | Notes |
|---|---|---|
| `Job Pulse` eyebrow | Retained | The small hero identity label remains in the dark hero band. |
| Hero headline language | Refined | Uses current operational-step copy from already-loaded schedule/lifecycle/field/closeout/failure state: `Needs Scheduling`, `Waiting to Begin`, `Team En Route`, `Field Work Active`, closeout blocker language, `Retest or Review Needed`, or `Job Complete`. |
| Progress bubbles / tracker | Retained | Lifecycle tracker remains separate from the hero headline so the tracker shows progression while the headline names the current operational step. |
| Duplicate hero status card | Refined | The floating status card was removed from the main hero copy area and replaced with a compact `Current Step` card under the right-side site area. |
| Site image address overlay | Removed | The site image is now image-only. Address remains visible in the status strip and Service Location card. |
| User-facing placeholder/helper language in real site areas | Removed | Real site/location surfaces no longer describe themselves as preview/route-loaded placeholders. |
| Assignment wording | Refined | Removed `Assigned Lead`; V2 Pulse now uses `Assigned Techs` and the first assigned user when available. |
| Assigned count tooltip | Implemented | Desktop V2 Pulse shows a read-only `+N` count with a focusable/title tooltip containing the full assigned list when multiple users are assigned. No assignment controls were added. |
| Hero controls | Deferred | No live buttons, links, forms, submit buttons, server actions, or mutation paths were introduced. |

### Performance notes

- No new database reads were introduced.
- Assignment display uses the already-loaded `assignedTeam` data.
- No heavy/deferred components were added.
- No new content zones were migrated in this cleanup slice.

### Validation

- `npx.cmd tsc --noEmit`
- `npx.cmd vitest run lib/jobs/__tests__/job-detail-job-type-switch-hidden.test.ts lib/jobs/__tests__/job-detail-service-address-edit-affordance.test.ts lib/jobs/__tests__/job-detail-field-outcome-panel-wiring.test.ts lib/jobs/__tests__/job-detail-invoice-banner.test.ts lib/jobs/__tests__/job-detail-ecc-retest-bridge-wiring.test.ts lib/jobs/__tests__/job-detail-header-reference-wiring.test.ts lib/actions/__tests__/return-visit-action-wiring.test.ts`
- `git diff --check`

## Slice: V2 Pulse Right Column Status Micro-Cleanup

### Items reviewed

| Item | Status | Notes |
|---|---|---|
| Faint lower-left current step card | Removed | The extra status card was removed from the lower-left hero area so the hero is led by the headline, progress tracker, and chip row. |
| Right-side status placement | Refined | The same already-derived status concept now appears as `Current Status` under the right-side site snapshot/address area. |
| Status card legibility | Refined | The card uses stronger contrast and the existing Pulse hero tone dot instead of the faint disabled-looking treatment. |
| Site image helper text | Removed | User-facing helper copy below the real site image/address was removed. |
| Site image and address | Retained | The site preview remains image-only, and the service location/address line remains visible directly beneath it. |
| Hero controls | Deferred | No live buttons, links, forms, submit buttons, server actions, or mutation paths were introduced. |

### Performance notes

- No new database reads were introduced.
- Current Status uses the already-derived Pulse hero state.
- No heavy/deferred components or additional content zones were added.

### Validation

- `npx.cmd tsc --noEmit`
- `npx.cmd vitest run lib/jobs/__tests__/job-detail-job-type-switch-hidden.test.ts lib/jobs/__tests__/job-detail-service-address-edit-affordance.test.ts lib/jobs/__tests__/job-detail-field-outcome-panel-wiring.test.ts lib/jobs/__tests__/job-detail-invoice-banner.test.ts lib/jobs/__tests__/job-detail-ecc-retest-bridge-wiring.test.ts lib/jobs/__tests__/job-detail-header-reference-wiring.test.ts lib/actions/__tests__/return-visit-action-wiring.test.ts`
- `git diff --check`
