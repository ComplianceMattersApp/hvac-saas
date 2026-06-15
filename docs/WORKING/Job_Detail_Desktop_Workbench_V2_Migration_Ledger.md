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
