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
