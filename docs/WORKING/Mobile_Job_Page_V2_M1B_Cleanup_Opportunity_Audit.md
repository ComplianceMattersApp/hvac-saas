# Mobile Job Page V2 M1-B Cleanup Opportunity Audit

Status: Phase M1-B cleanup opportunity audit only  
Date: 2026-06-25  
Scope: internal mobile `/jobs/[id]` after M1-A extraction

## 1. Executive verdict

The M1-A extraction created the intended safe mobile layout boundary. `app/jobs/[id]/page.tsx` still owns the route-level reads, auth, product-mode resolution, billing/ECC/service-chain read models, heavy booleans, redirects, and desktop branch. The extracted `app/jobs/[id]/_components/MobileJobDetailCurrent.tsx` is currently a zero-change render component for the mobile branch.

The boundary is mechanically broad but coherent:

- `page.tsx` passes 182 props into `MobileJobDetailCurrent`.
- `MobileJobDetailCurrent` destructures 182 props.
- No destructured prop was found unused inside `MobileJobDetailCurrent`.
- No prop passed from `page.tsx` was missing from the extracted component.
- No extracted component prop was missing from the `page.tsx` render call.

The main cleanup opportunities are therefore not broken extraction residue. They are contract clarity, page-local dead-code candidates, duplicated mobile JSX patterns that existed before extraction, and future risk reduction around action/form-heavy areas.

No cleanup should be implemented before a separate, tightly scoped slice is approved.

## 2. Current M1-A extraction shape

Files inspected:

- `docs/ACTIVE/Mobile_Job_Page_V2_Blueprint.md`
- `docs/WORKING/Mobile_Job_Page_V2_M1_Readiness_Audit.md`
- `app/jobs/[id]/page.tsx`
- `app/jobs/[id]/_components/MobileJobDetailCurrent.tsx`

Current structure:

- `page.tsx` imports `MobileJobDetailCurrent` and renders it in the mobile-only location.
- `MobileJobDetailCurrent` contains the `lg:hidden` mobile shell and current mobile JSX.
- The desktop `lg:block` branch remains in `page.tsx`.
- Mobile anchors remain present in the extracted component, including:
  - `mobile-when-panel`
  - `mobile-work-scope`
  - `mobile-visit-reason-card`
  - `mobile-notes-hub`
  - `mobile-internal-notes`
  - `mobile-shared-notes`
  - `mobile-tools`
  - `mobile-invoice-summary-card`
  - `mobile-ecc-permit-needed-action`
  - `mobile-next-service-action`

Preservation note: `mobile-next-service-action` appears as a repeated source literal across mutually gated branches. That is a source duplication candidate, not automatically a runtime duplicate-ID bug. It should be preserved until a focused visual/action recomposition owns the branch precedence.

## 3. Unused imports or props created by extraction

### Extracted component props

No unused extracted props were found by source inspection. Every destructured prop in `MobileJobDetailCurrent` is referenced in the component body.

No prop mismatch was found:

- Passed by `page.tsx`: 182
- Destructured by `MobileJobDetailCurrent`: 182
- Passed but not destructured: 0
- Destructured but not passed: 0
- Destructured but unused in component body: 0

### Page imports

No obvious import was made unused by the extraction because `page.tsx` intentionally continues to pass many imported components/actions/functions through the mobile boundary. This keeps M1-A zero-change, but it makes the prop list large.

Potential later cleanup, after source-based tests are adjusted if needed:

- Stable imported UI/components could be imported directly by `MobileJobDetailCurrent` instead of passed as props.
- Server actions can also technically be imported directly into a server component, but action identity, payloads, and source-based tests make this higher risk than pure UI imports.
- Local wrappers/fallbacks defined in `page.tsx`, such as timed wrappers and fallback components, should remain passed until a later slice explicitly decides where those wrappers live.

### Intentional compatibility prop

`serviceLocationUpdatedBannerMessage` is passed as a literal prop:

- `serviceLocationUpdatedBannerMessage="Service location updated for this job."`

This appears to be a compatibility choice to keep source-based expectations against `page.tsx` stable after extraction. It is safe to keep for now. Removing it should be done only in a small test-aware slice.

## 4. Duplicated mobile-only JSX patterns

The following duplication is visible inside `MobileJobDetailCurrent` and should be treated as opportunity, not immediate cleanup authorization.

### Invoice create/open controls

The internal invoice path repeats several times across status, quick actions, attention strips, work/invoice summary, and More Details:

- `createInternalInvoiceDraftFromForm` appears 6 times.
- `auto_import_visit_scope_items` appears 5 times.
- `/jobs/${job.id}/invoice#invoice-workspace` appears across both links and hidden `return_to` fields.

This is a good candidate for a later local helper/subcomponent, but it is form/action sensitive. Any dedupe must preserve:

- `job_id`
- `tab`
- `return_to`
- `auto_import_visit_scope_items`
- current open/create branch behavior
- current direct/proposal/external billing gates

### Repeated mobile action class usage

The same class props are reused across many launchers:

- `mobileFieldActionClass` appears 11 times.
- `mobileToolLinkClass` appears 11 times.
- `mobileMutedToolLinkClass` is used for lower-emphasis mobile tools.

This duplication is mostly presentation noise. It is safer to leave until M2/M3 because the approved visual work is expected to recompose these controls anyway.

### `mobile-next-service-action` branch repetition

`id="mobile-next-service-action"` appears 4 times in mutually selected branches, with multiple `return_to` values targeting the same anchor.

This should not be normalized casually. The duplicate source literal preserves current branch-specific forms and return behavior. V2 can reduce the repeated source shape only after next-responsibility presentation is owned by an approved visual/action slice.

### Attention and follow-up strips

The mobile attention area combines schedule-required, waiting, external data entry, internal invoicing placeholder, open-invoice attention, visit-count, and next-due prompts. These patterns are visually similar but behaviorally separate.

They should not be collapsed into a generic alert component until each branch has a clear payload and validation matrix.

### Notes blocks

Internal notes and shared notes have similar details structures, banners, note bodies, and deferred rendering, but they have different audience boundaries and actions:

- internal notes include the mention composer and internal note body
- shared notes include the public note form and shared note body
- shared notes are hidden in modes where product rules require it

Do not merge these before M2/M3. The shared/internal distinction is part of the product boundary.

### Permit forms

Permit data appears in both the blocker/action area and More Details / Tools. The duplication exists because one is a promoted closeout blocker/action and the other is an administrative detail editor.

Leave this duplication alone until the Compliance Work lane is implemented.

## 5. Dead code candidates

These are candidates only. They should be removed only after a narrow source search in the cleanup slice.

### Strong candidates after M1-A

The following values are defined in `page.tsx` but were not found in `MobileJobDetailCurrent` and do not appear to be consumed by the mobile render call:

- `failureResolutionSummaryText`
- `failureResolutionPathCount`
- `mobileIconChipClass`
- `mobilePrimaryStateLabel`
- `mobileSecondaryStateLabel`
- `mobileFieldLifecycleActive`
- `mobileOpsStatusLabel`

Some of these are intermediate-only values for other dead candidates. For example, `mobileFieldLifecycleActive` and `mobileOpsStatusLabel` primarily feed `mobilePrimaryStateLabel` / `mobileSecondaryStateLabel`.

### Not dead

`mobileNavigateHref` is still used by the desktop branch in `page.tsx`. It should not be removed as part of a mobile cleanup.

`mobileLifecycleStatusLabel` is still used to compute `mobileCurrentStatusLabel`, which is passed into `MobileJobDetailCurrent`.

## 6. Naming and type clarity opportunities

### Add an explicit prop type

`MobileJobDetailCurrent` currently accepts `props: any`. That was acceptable for the zero-change extraction, but it hides the boundary contract.

Safest clarity improvement:

- Add a route-local `MobileJobDetailCurrentProps` type.
- Keep the same prop names and render call.
- Do not group, rename, or move values in the first type slice.

This would make future cleanup less error-prone without changing behavior.

### Separate dependency props from data props

The current prop list mixes:

- route data
- derived booleans
- class strings
- icons
- components
- server actions
- formatting helpers
- local wrappers/fallbacks

Later type organization could group these conceptually, but the runtime prop shape should stay flat until after the visual work. Grouping values into nested objects would make diffs larger and could obscure behavior preservation.

### Component name

`MobileJobDetailCurrent` is a good temporary name. It signals that this is the current production mobile branch, not V2. Do not rename it until V2 preview/current switching is designed.

### Banner literal

`serviceLocationUpdatedBannerMessage` is descriptive but unusual because it exists only to carry one literal string across the boundary. Keep it until a test-aware cleanup updates the source expectation to include the extracted component.

## 7. High-risk shared-component areas

These should not be touched casually during cleanup because they encode behavior, authority, payloads, deferred reads, or shared desktop/mobile contracts.

- `JobLocationPreview` and preview fallback/wrapper behavior
- `VisitScopeJobDetailForm`
- `VisitScopeBuilder` and visit-scope serialization helpers
- `FieldOutcomePanel`
- `FieldBillingSummary`
- `InternalInvoiceLineItemsTable` and invoice helper/actions
- `ContactLoggingQuickActions`
- `AssignedTeamControls`
- `RoleContactsCard`
- `DeferredInternalNoteMentionComposer`
- `DeferredInternalNotesBody`
- `DeferredSharedNotesBody`
- `DeferredTimelineBody`
- `DeferredJobAttachmentsInternal`
- `DeferredCustomerAttemptsHistory`
- `DeferredServiceChainPanelBody`
- `DeferredWorkflowMilestonesPanelBody`
- `MarkVisitCountedActionButton`
- `ConfirmNextDueDateActionButton`
- `JobFieldActionButton`
- `UnscheduleButton`
- server actions passed into mobile forms
- all invoice, ECC, retest, permit, waiting, release, return-visit, and correction-review forms

Shared booleans and read models to avoid moving in cleanup:

- `showInternalInvoicePanel`
- `showExternalDataEntryPrompt`
- `showSharedNotesCard`
- `activeWaitingState`
- `canShowWaitingReleaseQuickAction`
- `showMobileInvoiceOpenAttention`
- `markVisitCountedLinkId`
- `suggestedNextDueProjection`
- `internalInvoiceTruth`
- `fieldBillingCapabilities`
- service-chain/narrative scope values
- ECC failed/retest/correction state
- closeout and billing state

## 8. Recommended cleanup slices, safest to riskiest

### Slice 1: Dead page-local mobile variables

Remove only values proven unused by source search, likely:

- `failureResolutionSummaryText`
- `failureResolutionPathCount`
- `mobileIconChipClass`
- `mobilePrimaryStateLabel`
- `mobileSecondaryStateLabel`
- intermediate values used only by those labels

Risk: low, if source search confirms no use.

Validation:

- `npx.cmd tsc --noEmit`
- `git diff --check`
- focused source search for each removed symbol

### Slice 2: Add `MobileJobDetailCurrentProps`

Introduce an explicit route-local prop type without changing names, grouping, render order, or behavior.

Risk: low to medium. Mostly compile-time, but large prop surfaces are easy to mistype.

Validation:

- `npx.cmd tsc --noEmit`
- `git diff --check`
- inspect that the prop count and names are unchanged

### Slice 3: Test-aware removal of the banner literal prop

Move the `"Service location updated for this job."` literal into `MobileJobDetailCurrent` or otherwise update source-based tests to search both `page.tsx` and the extracted component.

Risk: low product risk, medium test-risk because it intentionally changes source locality.

Validation:

- `npx.cmd tsc --noEmit`
- `git diff --check`
- `npx.cmd vitest run lib/actions/__tests__/job-service-location-change.test.ts`

### Slice 4: Import stable UI dependencies in the extracted component

Reduce prop noise by importing stable external dependencies directly into `MobileJobDetailCurrent`, starting only with low-risk UI primitives/components.

Possible candidates:

- `Link`
- `Suspense`
- `SubmitButton`
- `ImmediateSubmitButton`
- `FlashBanner`

Do not include local wrappers/fallbacks or server actions in the first pass.

Risk: medium. Source locality changes can affect tests or make future diffs harder to compare.

Validation:

- `npx.cmd tsc --noEmit`
- `git diff --check`
- focused M1 action tests from the readiness audit where practical
- authenticated smoke at mobile width for banners, notes, schedule, invoice create/open, and tools

### Slice 5: Move mobile-only class constants into `MobileJobDetailCurrent`

Move only mobile presentation class strings that are used exclusively by the extracted component.

Risk: medium. This is visually sensitive even if strings are copied exactly.

Validation:

- `npx.cmd tsc --noEmit`
- `git diff --check`
- mobile visual smoke at 390px and 430px
- desktop smoke to confirm no desktop class value was moved or changed

### Slice 6: Local subcomponents for repeated invoice controls

Create tiny route-local helpers for repeated internal invoice create/open controls.

Risk: high. These forms carry important hidden fields and authority gates.

Validation:

- `npx.cmd tsc --noEmit`
- `git diff --check`
- `npx.cmd vitest run lib/actions/__tests__/internal-invoice-scope-hardening.test.ts`
- `npx.cmd vitest run lib/actions/__tests__/internal-invoice-payment-actions.test.ts`
- mobile smoke for create invoice, open invoice, replacement/placeholder states, and return-to anchors

Recommendation: defer until after M2/M3 unless the duplication blocks visual work.

### Slice 7: Dedupe next-service/retest/correction branches

Normalize repeated `mobile-next-service-action` source branches or shared retest/correction action layout.

Risk: high. This touches branch precedence, anchor behavior, hidden fields, and state-specific action availability.

Validation:

- `npx.cmd tsc --noEmit`
- `git diff --check`
- `npx.cmd vitest run lib/actions/__tests__/ecc-action-scope-hardening.test.ts`
- `npx.cmd vitest run lib/actions/__tests__/ecc-completion-redirects.test.ts`
- `npx.cmd vitest run lib/actions/__tests__/ecc-retest-schedule-now-wiring.test.ts`
- mobile smoke for failed, pending office review, retest needed, linked active retest child, correction review

Recommendation: leave for visual M2/M3/M4 work.

## 9. Validation by cleanup category

| Cleanup category | Required validation |
|---|---|
| Dead local variables | `npx.cmd tsc --noEmit`, `git diff --check`, source search for removed symbols |
| Prop type only | `npx.cmd tsc --noEmit`, `git diff --check` |
| Source/test compatibility cleanup | `npx.cmd tsc --noEmit`, `git diff --check`, affected source-based test |
| UI imports moved into extracted component | `npx.cmd tsc --noEmit`, `git diff --check`, focused M1 tests where practical, mobile smoke |
| Mobile class constants moved | `npx.cmd tsc --noEmit`, `git diff --check`, mobile screenshot/smoke at 390px/430px, desktop unchanged smoke |
| Invoice/form dedupe | `npx.cmd tsc --noEmit`, `git diff --check`, invoice action tests, mobile create/open invoice smoke |
| Retest/correction/next-service dedupe | `npx.cmd tsc --noEmit`, `git diff --check`, ECC/retest focused tests, mobile state smoke |

The focused tests recommended by the M1 readiness audit remain the safest regression set when cleanup touches action-heavy surfaces:

- `lib/actions/__tests__/job-lifecycle-scope-hardening.test.ts`
- `lib/actions/__tests__/job-ops-actions.test.ts`
- `lib/actions/__tests__/job-ops-waiting-state.test.ts`
- `lib/actions/__tests__/job-ops-parts-needed.test.ts`
- `lib/actions/__tests__/ecc-action-scope-hardening.test.ts`
- `lib/actions/__tests__/ecc-completion-redirects.test.ts`
- `lib/actions/__tests__/ecc-retest-schedule-now-wiring.test.ts`
- `lib/actions/__tests__/internal-invoice-scope-hardening.test.ts`
- `lib/actions/__tests__/internal-invoice-payment-actions.test.ts`
- `lib/actions/__tests__/job-ops-contact-scope-hardening.test.ts`
- `lib/actions/__tests__/job-service-location-change.test.ts`

## 10. Leave alone until after visual M2/M3 work

Do not clean up or recompose these before the approved visual implementation work because the current duplication is part of preserving behavior:

- mobile section order
- current labels/copy
- current class strings and spacing
- action precedence inside the current status card
- `mobile-next-service-action` repeated branches
- Quick Field Actions composition
- Field Operations Board / Job Context composition
- notes/internal/shared note structure
- invoice create/open placement
- permit blocker versus permit admin details
- retest/correction controls
- service follow-up and waiting controls
- More Details / Tools content and anchors
- Compliance Work recomposition
- photo hero or location preview placement
- lifecycle rail or next-action resolver
- desktop extraction

Also leave all server actions, helper/source-of-truth logic, schema, migrations, permissions, redirects, form field names, anchors, and shared components unchanged unless a later slice explicitly targets them with validation.

## 11. Manual/smoke notes

The M1-A extraction appears intended to preserve rendered mobile order because the entire current mobile JSX branch is now rendered from `MobileJobDetailCurrent` in the same mobile-only location.

Desktop remains structurally unchanged because the desktop branch still lives in `page.tsx` and the extracted component is wrapped in the mobile `lg:hidden` shell.

No product behavior should have changed from the extraction itself. The cleanup opportunities above should be treated as future slices, not as permission to alter behavior during M1-B.

## 12. Explicit non-actions

This audit did not implement cleanup.

No product code, layout, styling, actions, anchors, form fields, return-to values, server actions, helpers, tests, schemas, permissions, or shared components were changed.

No validation commands were run for this audit because the requested work product is documentation only.
