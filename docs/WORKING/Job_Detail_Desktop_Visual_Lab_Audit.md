# Job Detail Desktop Visual Lab Audit

Date: 2026-06-13
Branch: `feature/job-detail-desktop-visual-lab`
Scope: audit only for internal desktop `/jobs/[id]`

## 1. Executive summary

The internal job detail route is primarily assembled in `app/jobs/[id]/page.tsx`. It contains both the frozen mobile experience and the current desktop experience in the same server component. Desktop is not a clean component boundary yet; it is a large inline composition with shared deferred bodies and shared action components.

Current desktop is organized into:

- A desktop-only workbench near the lower half of `page.tsx`, visually split into left context/team, center destination/work, and right quick-reference notes.
- A visible top/action/status region with flash banners, field outcome, closeout, billing, service-plan, and ECC/retest prompts.
- A `Job Details & Records` launcher grid whose hidden detail panels are revealed through hash targets and CSS `:target`.
- Shared deferred bodies for notes, attachments, timeline, service chain, assignments, workflow milestones, invoice details, and customer contact attempts.

The highest-risk V2 redesign areas are:

- Mobile shares many of the same data, actions, components, and booleans, even though the visual layout is separate. Do not move or edit shared helpers/components casually.
- Notes are duplicated across the desktop right rail, shared notes card, internal notes drawer, mobile notes hub, and timeline. These are not equivalent surfaces.
- Billing exists in multiple states: lightweight external closeout, internal invoice summary, full internal invoice workspace, field charge proposals, supplemental invoices, payment ledger, send history, and no-charge/externally-billed disposition.
- ECC/compliance controls are scattered across field completion gating, permit quick reference/details, ECC summary, tests link, retest continuation, retest scheduling, correction review, workflow milestones, and contractor report.
- `Job Details & Records` hides many tools behind launchers. V2 must preserve every launcher, detail panel, and form before visual consolidation.

Recommended V2 principle: keep desktop redesign as a view-layer re-placement first. Preserve route data reads, server actions, role gates, job-state gates, and shared components until a later explicit refactor slice.

## 2. Files/components/actions reviewed

Primary route:

- `app/jobs/[id]/page.tsx`

Route-local components:

- `app/jobs/[id]/_components/ChangeServiceLocationForm.tsx`
- `app/jobs/[id]/_components/ConfirmNextDueDateActionButton.tsx`
- `app/jobs/[id]/_components/ContactLoggingQuickActions.tsx`
- `app/jobs/[id]/_components/ContractorReportPanel.tsx`
- `app/jobs/[id]/_components/DeferredAddAssigneeForm.tsx`
- `app/jobs/[id]/_components/DeferredCustomerAttemptsHistory.tsx`
- `app/jobs/[id]/_components/DeferredInternalNoteMentionComposer.tsx`
- `app/jobs/[id]/_components/DeferredInternalNotesBody.tsx`
- `app/jobs/[id]/_components/DeferredJobAttachmentsInternal.tsx`
- `app/jobs/[id]/_components/DeferredServiceChainPanelBody.tsx`
- `app/jobs/[id]/_components/DeferredSharedNotesBody.tsx`
- `app/jobs/[id]/_components/DeferredTimelineBody.tsx`
- `app/jobs/[id]/_components/DeferredWorkflowMilestonesPanelBody.tsx`
- `app/jobs/[id]/_components/EquipmentCreateForm.tsx`
- `app/jobs/[id]/_components/EquipmentEditCard.tsx`
- `app/jobs/[id]/_components/FieldBillingSummary.tsx`
- `app/jobs/[id]/_components/FieldExceptionRoutingPicker.tsx`
- `app/jobs/[id]/_components/FieldOutcomePanel.tsx`
- `app/jobs/[id]/_components/InternalInvoiceLineItemsTable.tsx`
- `app/jobs/[id]/_components/InternalNoteMentionComposer.tsx`
- `app/jobs/[id]/_components/InterruptStateFields.tsx`
- `app/jobs/[id]/_components/JobAttachmentsInternal.tsx`
- `app/jobs/[id]/_components/JobFieldActionButton.tsx`
- `app/jobs/[id]/_components/MarkVisitCountedActionButton.tsx`
- `app/jobs/[id]/_components/ServiceStatusActions.tsx`
- `app/jobs/[id]/_components/SupplementalInvoiceFamilySection.tsx`
- `app/jobs/[id]/_components/UnscheduleButton.tsx`

Shared components/helpers used by the route:

- `components/jobs/VisitScopeJobDetailForm.tsx`
- `components/jobs/VisitScopeBuilder.tsx`
- `components/jobs/JobLocationPreview.tsx`
- `components/jobs/CancelJobButton.tsx`
- `components/RoleContactsCard.tsx`
- `components/SubmitButton.tsx`
- `components/ImmediateSubmitButton.tsx`
- `components/ui/FlashBanner.tsx`
- `lib/jobs/visit-scope.ts`
- `lib/jobs/job-invoice-action.ts`
- `lib/jobs/job-detail-invoice-banner.ts`
- `lib/jobs/service-follow-up-progress.ts`
- `lib/jobs/job-history-summary-read-model.ts`
- `lib/business/internal-invoice.ts`
- `lib/business/internal-invoice-payments.ts`
- `lib/business/internal-invoice-delivery.ts`
- `lib/business/job-billing-state.ts`
- `lib/business/field-charge-proposals.ts`
- `lib/auth/field-billing-access.ts`
- `lib/auth/internal-user-access-capabilities.ts`
- `lib/communications/contact-recipients-read.ts`
- `lib/communications/contact-recipients-display.ts`
- `lib/maintenance-agreements/read-model.ts`

Server action files inspected read-only:

- `lib/actions/job-actions.ts`
- `lib/actions/job-ops-actions.ts`
- `lib/actions/job-contact-actions.ts`
- `lib/actions/internal-invoice-actions.ts`
- `lib/actions/internal-invoice-payment-actions.ts`
- `lib/actions/notes-actions.ts`

## 3. Complete desktop inventory

### Route/auth/data boundary

| Item | Current placement | Source/component | Purpose | Visibility/gates | V2 placement |
|---|---|---|---|---|---|
| Internal actor boundary | Before render | `resolveJobDetailActor`, `loadScopedInternalJobDetailReadBoundaryOutcome` in `page.tsx` | Redirect contractor to portal, deny unauthorized, enforce same-account read | Authenticated user required. Contractors redirected to `/portal/jobs/[id]`. Unauthorized redirected/login or notFound | Keep outside visual redesign |
| Main job read | Before render | `jobs` select in `page.tsx` | Loads job core, customer/location IDs, schedule, status, billing fields, permit, visit scope, equipment, ECC runs | Same-account internal scoped read | Keep unchanged |
| Business profile/billing/product mode | Before render | `resolveInternalBusinessIdentityByAccountOwnerId`, `resolveBillingModeByAccountOwnerId`, `resolveProductModeForAccountOwnerId` | Controls internal invoicing vs external billing and HVAC service mode | Same account | Keep unchanged |
| Field billing capabilities | Before render | `loadFieldBillingExplicitCapabilitiesForUser`, `resolveFieldBillingCapabilities` | Determines invoice/proposal/payment authority | Role and explicit capability based | Keep unchanged |

### Flash/status banners

| Current label/title | Current desktop placement | Component/file | Purpose | Visibility conditions | Actions | Category | V2 placement |
|---|---|---|---|---|---|---|---|
| Job created and ready for next steps | Above desktop content | `FlashBanner` in `page.tsx` | Creation confirmation | `banner=job_created` | None | job memory | Global alert strip |
| Existing active job opened from intake | Above desktop content | `FlashBanner` | Intake dedupe confirmation | `banner=intake_existing_job_selected` | None | job memory | Global alert strip |
| Contractor intake finalized | Above desktop content | `FlashBanner` | Contractor intake conversion confirmation | `banner=contractor_intake_finalized` | None | job memory | Global alert strip |
| Job already created | Above desktop content | `FlashBanner` | Duplicate creation warning | `banner=job_already_created` | None | job memory | Global alert strip |
| Schedule updated / already up to date | Above desktop content | `FlashBanner` | Schedule action result | `banner=schedule_saved` or `schedule_already_saved` | None | job memory | Global alert strip |
| Saved / already processed / could not save changes | Above desktop content | `FlashBanner` | Generic status/closeout feedback | Status and closeout banner params | None | job memory | Global alert strip |
| Maintenance visit count banners | Above desktop content | `FlashBanner` | Service plan count results | `maintenance_visit_count_*` banners | None | billing/closeout | Global alert strip |
| On the Way reverted/unavailable | Above desktop content | `FlashBanner` | Undo On the Way result | `banner=on_the_way_reverted` or unavailable | None | primary work | Global alert strip |
| Workflow guidance banners | Service Chain detail panel | `FlashBanner` in `page.tsx` | Milestone/workflow action results | `workflow_guidance_*` banners | None | records/history | Service chain/workflow area |
| Internal/shared note banners | Notes areas | `FlashBanner` | Note save/mention feedback | `banner=internal_note_*`, shared `note_scope=shared` | None | job memory | Notes hub |

### Desktop workbench: left context/team column

| Current label/title | Current desktop placement | Component/file | Purpose | Data source | Visibility/gates | Actions | Category | Mobile dependency | V2 placement |
|---|---|---|---|---|---|---|---|---|---|
| Customer / Account context | Left column, account/person card | Inline in `page.tsx` | Shows customer/account name, phone/email links, access info where present | `jobs` customer fields, linked contacts | Internal desktop render | tel/mailto/sms links | people/responsibility | Mobile has separate Field Operations Board customer card | People rail |
| Contractor context | Left/context areas for ECC and records | Inline in `page.tsx` | Shows assigned contractor for ECC/contractor relationship | `job.contractor_id`, contractor read | ECC/contractor existence and product mode gates | Link/edit contractor in Job Details panel | people/responsibility | Mobile has contractor context card when ECC | People rail |
| Contact Logging | Left context / field board | `ContactLoggingQuickActions` | Quick log customer contact attempts | `job_events` customer_attempt count/latest | Internal user | `logCustomerContactAttemptFromForm` with No Answer and Log Text Attempt | primary work | Same component used in mobile Field Operations Board | People rail, communication subpanel |
| Team Assignment | Left context / assigned-team area | Inline plus `DeferredAddAssigneeForm` | Shows assigned team, primary marker, add/remove/primary controls | `getActiveJobAssignmentDisplayMap`, assignee data | Internal user for add/remove form. Assigned list visible internally | `setPrimaryJobAssigneeFromForm`, `removeJobAssigneeFromForm` | people/responsibility | Mobile shows assigned team read-only board; add/remove appears under mobile tools | Team/responsibility panel |
| Role-labeled contacts | Under team/contact context | `RoleContactsCard` | Shows Billing Recipient / Access Contact / other role contacts for job/customer/location | `listContactRecipientsForEntity`, `buildInternalJobRoleContactSections` | Internal route, contacts if returned | Read-only | people/responsibility | Shared component can affect other desktop/mobile placements | People rail, contact roles |

### Desktop workbench: center destination/work column

| Current label/title | Current desktop placement | Component/file | Purpose | Data source | Visibility/gates | Actions | Category | Mobile dependency | V2 placement |
|---|---|---|---|---|---|---|---|---|---|
| Service Location | Center column top | `TimedJobLocationPreview` wrapping `JobLocationPreview` | Map/street preview, address, directions/search | `jobs.locations` or fallback job address fields | Desktop internal. Address actions visible if address exists | Google Maps search/directions links | place/work | Same `JobLocationPreview` used in mobile with `showActionsOnMobile` | Place/work panel |
| Correct address | Service Location controls | Link to `/locations/[id]` | Opens saved location edit | `locationId` | Internal user and location exists | Link only | place/work | Mobile has map controls but not this exact edit affordance | Place controls |
| Add new location | Service Location controls | Link to customer locations tab | Adds customer location | `customerId` | Internal user and customer exists | Link only | place/work | Mobile does not expose same control in primary board | Place controls |
| Change Service Location | Service Location collapsible | `ChangeServiceLocationForm` | Reassign job to a saved location | `serviceLocationOptions`, current location | Internal user. Warns if invoice history exists | `changeJobServiceLocationFromForm` | place/work | Component desktop-only here | Place controls, advanced |
| Visit Reason | Center column card | Inline form plus `updateJobVisitScopeFromForm` | Shows primary reason/title for visit | `service_visit_reason`, job title, visit scope summary, job notes | Internal edit control. Display always | `updateJobVisitScopeFromForm` | job brief | Mobile has separate editable `mobile-visit-reason-card` using same action | Job brief top |
| Customer Concern | Visit Reason card conditional | Inline | Shows job title when distinct from visit reason | `job.title` | Distinct normalized text | None | job brief | Mobile shows only some work summary surfaces | Job brief |
| Intake Notes | Visit Reason card conditional | Inline | Shows original job notes when distinct | `job.job_notes` | Distinct normalized text | None | job brief | Mobile work/visit area may not show all duplicate detail | Job brief |
| Work Summary | Visit Reason card conditional | Inline | Shows visit scope summary when distinct | `visit_scope_summary` | Distinct normalized text | None | job brief | Mobile has Work Summary details | Job brief |
| Work & Invoice | Below center column spanning desktop grid | Inline plus `VisitScopeJobDetailForm` | Add/update work items, show priced work, invoice summary/CTA | `visit_scope_summary`, `visit_scope_items`, pricebook templates, invoice truth | Internal user. Invoice child only when internal invoice panel active | `updateJobVisitScopeFromForm`, `createInternalInvoiceDraftFromForm`, links to invoice workspace, `promoteCompanionScopeToServiceJobFromForm` | primary work | Same `VisitScopeJobDetailForm` used mobile Work & Invoice | Primary work area |
| Add or Update Work / Add Work | Work & Invoice collapsible | `VisitScopeJobDetailForm`, `VisitScopeBuilder` | Quick add/pricebook/custom visit scope editing | Visit scope props, pricebook items | Internal user | `updateJobVisitScopeFromForm` | primary work | Same form used mobile | Primary work editor |
| Work Items list | Work & Invoice | Inline | Shows primary visit work items, price chips, details | Sanitized visit scope items | Internal user and `hasVisitScopeDefined` | None | primary work | Same data rendered mobile | Primary work list |
| Companion follow-up | Work & Invoice | Inline | Shows ECC companion service items | Visit scope items kind `companion_service` | Companion items exist | `promoteCompanionScopeToServiceJobFromForm` or link to promoted service job | primary work | Mobile lists companion label but promotion control appears desktop work area | Follow-up/service chain bridge |
| Work performed - price - invoice status | Work & Invoice billing band | Inline | Summarizes invoice state and ready-to-invoice total | Internal invoice truth, billing state, visit scope price total | `showInternalInvoicePanel` | Create invoice or open invoice workspace; proposal CTA if no direct authority | billing/closeout | Mobile has invoice summary card | Billing/closeout band |

### Desktop workbench: right quick-reference rail

| Current label/title | Current desktop placement | Component/file | Purpose | Data source | Visibility/gates | Actions | Category | Mobile dependency | V2 placement |
|---|---|---|---|---|---|---|---|---|---|
| Permit Quick Ref | Right rail top | Inline | One-glance ECC permit number | `job.permit_number` | `job.job_type === "ecc"` | None | quick reference, ECC/compliance | Mobile permit is under More Details/Tools | Compliance quick ref |
| Job Notes / Shared Notes | Right rail | Inline preview plus `DeferredInternalNoteMentionComposer`, `DeferredInternalNotesBody` | Shows latest notes preview and hidden add/view notes drawer | `job_events`, note counts, narrative chain IDs | Internal desktop. ECC title changes to Shared Notes and includes shared/internal previews | Internal note composer action through deferred component | job memory | Mobile notes hub uses same deferred bodies/composer | Notes hub, not merely rail |
| View / Add Notes | Right rail details | Inline details | Opens note composer and internal note history | `job_events` internal_note | Internal user | internal note mention save action inside `DeferredInternalNoteMentionComposer` | job memory | Same composer/body in mobile internal notes | Notes hub |

### Desktop next-service/follow-up area

| Current label/title | Current desktop placement | Component/file | Purpose | Data source | Visibility/gates | Actions | Category | Mobile dependency | V2 placement |
|---|---|---|---|---|---|---|---|---|---|
| Next Service Action | Under desktop workbench | Inline | Creates return visits and callback visits; shows service follow-up progress | job status, ops status, service case count, follow-up progress events | Internal user, service job, not historical service follow-up pending info | `createNextServiceVisitFromForm`, `createCallbackVisitFromForm`, `releaseAndReevaluateFromForm`, part/approval progress actions | primary work, records/history | Mobile More Details/Tools has Create Return Visit; attention strips share flags | Follow-up/service-chain action zone |
| Mark Part Ordered | Next Service Action conditional | Inline form | Advances service follow-up progress | `serviceFollowUpProgressState.nextActionLabel` | Service pending-info reason indicates materials workflow | `markServicePartOrderedFromForm` | primary work | Mobile attention strips show active waiting but not all progress actions | Follow-up progress |
| Mark Part Arrived | Next Service Action conditional | Inline form | Advances parts workflow | Same | Same | `markServicePartArrivedFromForm` | primary work | Same risk | Follow-up progress |
| Mark Approval Received | Next Service Action conditional | Inline form | Advances approval workflow | Same | Approval workflow state | `markServiceApprovalReceivedFromForm` | primary work | Same risk | Follow-up progress |
| Ready to continue this work? | Next Service Action conditional | Inline form | Clears waiting/pending blocker | Active waiting state | `canShowWaitingReleaseQuickAction` | `releaseAndReevaluateFromForm` | primary work | Also in mobile attention strip and Job Status panel | Status/action zone |
| Create Return Visit | Next Service Action form | Inline | Creates unscheduled continuation visit | Current job | Internal service job | `createNextServiceVisitFromForm` | primary work | Mobile has same action in More Details/Tools | Follow-up/service chain |
| Create Callback Visit | Next Service Action conditional | Inline | Creates callback after job believed complete | Callback eligibility flag | `callbackIntakeHistoricalAnchorEligible` | `createCallbackVisitFromForm` | records/history, primary work | Mobile may expose callback under tools depending hidden section | Follow-up/service chain |

### Field outcome / finish / closeout / billing areas

| Current label/title | Current desktop placement | Component/file | Purpose | Visibility/gates | Actions | Category | V2 placement |
|---|---|---|---|---|---|---|---|
| FieldOutcomePanel | Desktop closeout/finish area | `FieldOutcomePanel` -> `FieldExceptionRoutingPicker` | Routes field outcome/finish path for service jobs | `showFieldOutcomePanel` derived from job lifecycle/status/billing context | Server actions passed through panel | primary work, billing/closeout | Finish workflow area |
| Field status action buttons | Finish/status area and mobile header | `JobFieldActionButton` | Field lifecycle actions such as start/on the way/complete | Field lifecycle booleans; ECC test gating | `advanceJobStatusFromForm`, `markJobFieldCompleteFromForm`, maybe retest action wrappers | primary work | Primary action bar |
| ServiceStatusActions | Status/action area | `ServiceStatusActions` via `TimedServiceStatusActions` | Service-specific operational status actions | Service job and status gates | Status actions passed from route | primary work | Primary action bar |
| Closeout readiness ribbon | Closeout area | Inline, `getCloseoutNeeds`, `getJobDetailCloseoutReadinessMessage` | Explains field/certs/invoice blockers | Closeout needs and queue state | None | billing/closeout | Closeout banner |
| External Billing closeout | Closeout/billing area | Inline | For external billing mode, confirms billing/data entry complete | `showExternalDataEntryPrompt` | `completeDataEntryFromForm` | billing/closeout | Billing/closeout lane |
| Billing summary band | Closeout/billing area | Inline plus `FieldBillingSummary` | Shows billing status, recipient, next step | `showSeparateFieldBillingDetails`, `showInternalInvoicePanel` | Create invoice/open workspace/proposal actions | billing/closeout | Billing workspace summary |
| Service Plan Visit Count Review | Maintenance/service plan block | Inline plus `MarkVisitCountedActionButton` | Counts eligible maintenance visit against agreement | `markVisitCountedLinkId && !suggestedNextDueProjection` | Service-plan action button | billing/closeout, records/history | Service plan/follow-up |
| Suggested next due date | Maintenance/service plan block | Inline plus `ConfirmNextDueDateActionButton` | Confirms projected next due date after counted visit | `suggestedNextDueProjection` | confirm next due date action | records/history | Service plan/follow-up |

## 4. Hidden/collapsible/tool inventory

### Desktop records launcher grid

The `Job Details & Records` section uses hash-target navigation. Launcher tiles are always visible, but detail panel bodies are hidden until their matching hash is targeted. CSS in `page.tsx` hides `#job-record-detail-panel > [data-record-panel]` and reveals `:target`.

| Launcher/hidden panel | Opens/reveals | Purpose | Component/action inventory | Visibility |
|---|---|---|---|---|
| Job Details | `#edit-job` | Editable schedule, permit details, contractor, service details, admin controls | `updateJobScheduleFromForm`, `updateJobContractorFromForm`, `updateJobServiceContractFromForm`, `archiveJobFromForm`, `CancelJobButton` | Launcher visible. Admin tools only `isInternalAdmin`. Contractor reassignment hidden in HVAC service mode. |
| Job Status | `#job-status` | Operational interrupt state and release controls | `updateJobOpsFromForm`, `InterruptStateFields`, `releaseAndReevaluateFromForm` | Launcher visible. Release controls only for eligible ops statuses. |
| ECC Summary | Inline details tile | Latest ECC test result/run count | Reads `job.ecc_test_runs` | Only `job.job_type === "ecc"` |
| Permit Details | Inline details tile | Permit number, jurisdiction, date | Reads job permit fields | ECC or any permit detail exists |
| Equipment | `#job-record-equipment` | Current equipment list and create form | `EquipmentEditCard`, `EquipmentCreateForm`, links to `/jobs/[id]/info?f=equipment` | Launcher visible |
| Attachments | `#job-record-attachments` | Attachment list and link to full attachments page | `DeferredJobAttachmentsInternal`, `/jobs/[id]/attachments` | Launcher visible |
| Follow Up | `#follow-up` | Active follow-up fields | `updateJobOpsDetailsFromForm` | Launcher visible |
| Follow-Up History | `#job-record-follow-up-history` | Customer contact attempt history | `DeferredCustomerAttemptsHistory` | Launcher visible |
| Timeline | `#job-record-timeline` | Timeline/job events/history summary | `DeferredTimelineBody` | Launcher visible |
| Service Chain | `#service-chain` | Service case workflow guidance and linked visits | `DeferredWorkflowMilestonesPanelBody`, `DeferredServiceChainPanelBody` | Launcher visible, empty state if no service case |
| Shared Notes | Inline details tile | Public/contractor/correction note composer and history | `addPublicNoteFromForm`, `DeferredSharedNotesBody` | Hidden in HVAC service mode (`showSharedNotesCard = !isHvacServiceMode`) |

### Job Details hidden tools

| Tool | Placement | Fields/actions | Visibility | V2 note |
|---|---|---|---|---|
| Scheduling | `#edit-job` main form | Date, Window Start, Window End, hidden permit fields; `updateJobScheduleFromForm`; `UnscheduleButton` appears around schedule controls | Internal route | Keep schedule controls grouped with dispatch/workflow |
| Permit Details | Nested details in `#edit-job` | Permit Number, Jurisdiction, Permit Date; `updateJobScheduleFromForm` | Editable even when job not ECC if panel visible | Move to compliance details but preserve edit |
| Contractor | Nested details in `#edit-job` | Contractor select; `updateJobContractorFromForm` | Not HVAC service mode; contractor list read by `getContractors` | People/responsibility |
| Service Details | Nested details in `#edit-job` | Service Type, Visit Type, Reason for Visit, Visit Outcome; `updateJobServiceContractFromForm` | Service job/product conditions | Job brief/work classification |
| Admin Tools | Nested details in `#edit-job` | Archive Job, Cancel job | `isInternalAdmin`; cancel hidden if status in completed/failed/cancelled | Admin danger zone |

### Mobile-only hidden tools that share actions/components

Mobile is frozen but must be preserved. It includes `mobile-tools`, `mobile-work-scope`, `mobile-notes-hub`, mobile internal/shared notes details, and mobile invoice/action strips. These use shared actions such as `updateJobVisitScopeFromForm`, `createInternalInvoiceDraftFromForm`, `createNextServiceVisitFromForm`, `addPublicNoteFromForm`, and shared deferred note bodies. Any V2 desktop edits must not rename shared form fields or mutate shared components without a mobile regression pass.

## 5. Notes/activity inventory

| Surface | Placement | Source | Event types/data | Actions | Visibility | Category | V2 placement |
|---|---|---|---|---|---|---|---|
| Right rail Job Notes / Shared Notes preview | Desktop right rail | `latestJobNotesPreviewPromise` in `page.tsx` | Non-ECC: `internal_note`; ECC: `internal_note`, `public_note`, `contractor_note`, `contractor_correction_submission` | None in preview | Desktop internal | job memory | Notes hub preview |
| View / Add Notes | Desktop right rail details | `DeferredInternalNoteMentionComposer`, `DeferredInternalNotesBody` | `job_events.event_type = internal_note`, narrative chain IDs | Internal note mention composer action | Internal | job memory | Notes hub |
| Shared Notes | Records grid details tile | `DeferredSharedNotesBody` | `public_note`, `contractor_note`, `contractor_correction_submission` | `addPublicNoteFromForm` | Not HVAC service mode | job memory, contractor communication | Shared notes lane |
| Follow-Up History | Records target panel | `DeferredCustomerAttemptsHistory` | `job_events.event_type = customer_attempt` | None in history | Launcher visible | records/history | Communication history |
| Contact Logging | Desktop left/person area | `ContactLoggingQuickActions` | Creates `customer_attempt` events | `logCustomerContactAttemptFromForm` | Internal user | primary work, job memory | Communication tools |
| Timeline | Records target panel | `DeferredTimelineBody` | Up to 200 `job_events`; displays event labels, details, actor map, chain summary | Read-only | Launcher visible | records/history | Activity timeline |
| Job History Summary | Timeline body | `DeferredTimelineBody`, `job-history-summary-read-model` | Derived from event/job state | Read-only | Timeline loaded | records/history | Timeline header |
| Contractor correction submission notes | Shared/timeline bodies | `DeferredSharedNotesBody`, `DeferredTimelineBody` | `contractor_correction_submission` | Read-only on internal page | Exists if contractor submits correction | ECC/compliance, job memory | Compliance notes |
| Internal note mention alerts | Composer | `DeferredInternalNoteMentionComposer`, `InternalNoteMentionComposer` | Internal users list and mention metadata | Internal note save/mention action | Internal user | job memory | Notes hub |

## 6. Visit reason / job brief inventory

| Item | Source/derivation | Current desktop placement | Visibility | Action | V2 recommendation |
|---|---|---|---|---|---|
| Workbench title | `job.title`, visit scope lead, customer/access name fallback | Desktop header/workbench top | Desktop internal | None | Keep as page H1/primary identity |
| Job reference | `formatJobDisplayReference(job_display_number, id)` | Header/reference areas | Always when job loaded | None | Keep in header metadata |
| Visit Reason | First non-empty of `service_visit_reason`, normalized title, visit scope lead | Center `Visit Reason` card and mobile `mobile-visit-reason-card` | Always displayed | `updateJobVisitScopeFromForm` edits visit scope summary/title, not service_visit_reason directly | Make first-class job brief |
| Customer Concern | `job.title`, only if distinct from visit reason | Visit Reason card | Conditional | None | Keep under job brief, do not merge blindly |
| Intake Notes | `job.job_notes`, only if distinct | Visit Reason card | Conditional | None | Keep as job memory/source intake |
| Work Summary | `visit_scope_summary`, only if distinct from reason and notes | Visit Reason card and mobile work details | Conditional | Edited through visit scope form | Keep as work-to-perform summary |
| Work Items | Sanitized `visit_scope_items` | Work & Invoice section | Internal user if defined; empty-state otherwise | `updateJobVisitScopeFromForm` via `VisitScopeJobDetailForm` | Primary work area |
| Companion service items | Visit scope items with kind `companion_service` | Work & Invoice | Items exist | `promoteCompanionScopeToServiceJobFromForm` for ECC unpromoted items | Follow-up/action bridge |
| Service Details edit | `job_type`, `service_visit_type`, `service_visit_reason`, `service_visit_outcome` | `#edit-job` nested details | Service job details panel | `updateJobServiceContractFromForm` | Classification panel adjacent to job brief |

## 7. Role/state visibility matrix

| Gate | Controls/surfaces affected | Condition |
|---|---|---|
| Authenticated internal user | Entire `/jobs/[id]` internal route | `resolveJobDetailActor` returns internal user and scoped read succeeds |
| Contractor actor | Internal page not shown | Contractors redirected to `/portal/jobs/[id]` |
| Internal admin | Admin Tools in Job Details | `internalUser.role === "admin"` |
| Owner/admin workflow manager | Workflow milestone management | `internalRole === "owner" || internalRole === "admin"` |
| Internal user | Visit scope editing, contact logging, team assignment controls, location controls, service actions | `isInternalUser` true in current route |
| Field billing direct invoice access | Create/open invoice, line item mutation, issue/send where specific capabilities allow | `hasDirectInvoiceDraftMutationAccess`, `hasInvoiceIssueAccess`, `hasInvoiceSendAccess` from field billing capabilities |
| Field billing proposal access | Proposed charge entry | `can_select_pricebook_lines` or `can_convert_visit_scope_to_invoice_line` |
| Field charge review access | Approve/reject proposed charges | `capabilities.can_approve_field_charges` |
| HVAC service mode | Shared Notes hidden, contractor selector omitted | `productMode === "hvac_service"` |
| ECC job type | Permit Quick Ref, ECC Summary, Permit Details visibility, ECC tests link, retest/correction controls, contractor report | `job.job_type === "ecc"` |
| Service job type | Next Service Action, return visit tools, service visit details, work item attention | `job.job_type === "service"` |
| Active waiting/pending/on-hold | Interrupt state banners and release controls | `ops_status` and `getActiveWaitingState` |
| Failed/pending office review ECC | Confirm retest ready/correction review controls | ECC, no active retest child, `ops_status in failed,pending_office_review` |
| Retest needed ECC | Retest scheduling controls | ECC, no active retest child, `ops_status === retest_needed` |
| Linked active retest child | Passive Retest Continuation | ECC parent with active child | 
| Closeout queue/blockers | Closeout banners and finish guidance | `getCloseoutNeeds`, `isInCloseoutQueue`, field/certs/invoice booleans |
| External billing mode | External data entry prompt | Billing mode/state indicates external billing and data entry requirement |
| Internal invoicing mode | Internal invoice panel and invoice CTA | `billingMode === "internal_invoicing"` plus route billing state |
| Maintenance agreements enabled | Service plan visit count/next due controls | `isMaintenanceAgreementsEnabled()` and linked agreement projections |

## 8. Action/server-action inventory

| Action | File | Current UI entry point | Purpose/gates observed |
|---|---|---|---|
| `updateJobScheduleFromForm` | `lib/actions/job-actions.ts` | Job Details scheduling and permit edit forms | Updates schedule/window/permit fields; operational scoped mutation access |
| `UnscheduleButton` action | `app/jobs/[id]/_components/UnscheduleButton.tsx` | Job Details scheduling | Clears schedule through its imported action |
| `updateJobCustomerFromForm` | `lib/actions/job-actions.ts` | Imported, not clearly visible in desktop slice read | Customer reassignment path if rendered elsewhere in page | 
| `updateJobContractorFromForm` | `lib/actions/job-actions.ts` | Job Details contractor selector | Reassigns contractor; internal operational access |
| `updateJobServiceContractFromForm` | `lib/actions/job-actions.ts` | Job Details Service Details | Edits service type/visit type/reason/outcome |
| `updateJobVisitScopeFromForm` | `lib/actions/job-actions.ts` | Visit Reason edit, Work & Invoice `VisitScopeJobDetailForm`, mobile equivalents | Saves visit scope summary/items |
| `promoteCompanionScopeToServiceJobFromForm` | `lib/actions/job-actions.ts` | ECC companion follow-up item | Creates linked service follow-up job |
| `createNextServiceVisitFromForm` | `lib/actions/job-actions.ts` | Next Service Action; mobile tools | Creates return visit/continuation job |
| `createCallbackVisitFromForm` | `lib/actions/job-actions.ts` | Callback Visit form | Creates callback job after historical completion |
| `advanceJobStatusFromForm` | `lib/actions/job-actions.ts` | Field status actions/ServiceStatusActions | Advances lifecycle/status |
| `revertOnTheWayFromForm` | `lib/actions/job-actions.ts` | Undo On the Way | Undo eligible on-the-way state |
| `archiveJobFromForm` | `lib/actions/job-actions.ts` | Admin Tools | Admin-only archive |
| `CancelJobButton` | `components/jobs/CancelJobButton.tsx` | Admin Tools | Cancels non-terminal job |
| `setPrimaryJobAssigneeFromForm` | `lib/actions/job-actions.ts` | Assigned team controls | Sets primary assignee |
| `removeJobAssigneeFromForm` | `lib/actions/job-actions.ts` | Assigned team controls | Removes assignee |
| `changeJobServiceLocationFromForm` | `lib/actions/job-actions.ts` | Change Service Location | Reassigns saved location; warns invoice history unchanged |
| `addPublicNoteFromForm` | `lib/actions/job-actions.ts` | Shared Notes desktop/mobile | Adds note visible to contractor |
| `completeDataEntryFromForm` | `lib/actions/job-actions.ts` | External Billing closeout | Marks external billing/data entry complete |
| `confirmEccRetestReadyFromForm` | `lib/actions/job-actions.ts` | ECC retest readiness controls | Moves failed/pending office review to retest-ready state |
| `createRetestJobFromForm` | `lib/actions/job-actions.ts` | ECC retest controls | Creates linked retest job |
| `scheduleRetestNowFromForm` | `lib/actions/job-actions.ts` | ECC retest controls | Creates/schedules retest now |
| `updateJobOpsFromForm` | `lib/actions/job-ops-actions.ts` | Job Status panel interrupt form | Saves pending/on-hold/waiting state |
| `updateJobOpsDetailsFromForm` | `lib/actions/job-ops-actions.ts` | Follow Up panel | Saves action required by, follow-up date, next action note |
| `releaseAndReevaluateFromForm` | `lib/actions/job-ops-actions.ts` | Job Status, Next Service Action, waiting prompt | Clears blocker and reevaluates ops status |
| `markServicePartOrderedFromForm` | `lib/actions/job-ops-actions.ts` | Service follow-up progress | Progresses parts workflow |
| `markServicePartArrivedFromForm` | `lib/actions/job-ops-actions.ts` | Service follow-up progress | Progresses parts workflow |
| `markServiceApprovalReceivedFromForm` | `lib/actions/job-ops-actions.ts` | Service follow-up progress | Progresses approval workflow |
| `markJobFieldCompleteFromForm` | `lib/actions/job-ops-actions.ts` | Field finish button/panel | Marks field work complete |
| `markCertsCompleteFromForm` | `lib/actions/job-ops-actions.ts` | ECC/certs closeout | Marks certificates complete |
| `markEccPermitAvailableFromForm` | `lib/actions/job-ops-actions.ts` | ECC permit closeout | Resolves permit blocker |
| `markInvoiceCompleteFromForm` | `lib/actions/job-ops-actions.ts` | Invoice closeout | Marks invoice complete for closeout |
| `resolveFailureByCorrectionReviewFromForm` | `lib/actions/job-ops-actions.ts` | Correction Review panel | Resolves ECC failure without retest |
| `logCustomerContactAttemptFromForm` | `lib/actions/job-contact-actions.ts` | ContactLoggingQuickActions | Logs no-answer/text attempt to job events |
| `createInternalInvoiceDraftFromForm` | `lib/actions/internal-invoice-actions.ts` | Billing bands, invoice panel, mobile invoice card | Creates primary/replacement draft invoice |
| `saveInternalInvoiceDraftFromForm` | `lib/actions/internal-invoice-actions.ts` | `InternalInvoiceDraftSaveForm` | Saves draft metadata |
| `addInternalInvoiceLineItemFromForm` | `lib/actions/internal-invoice-actions.ts` | `InternalInvoiceLineItemsTable` | Adds custom invoice line |
| `addInternalInvoiceLineItemFromPricebookForm` | `lib/actions/internal-invoice-actions.ts` | `InternalInvoiceLineItemsTable` | Adds pricebook line |
| `addInternalInvoiceLineItemsFromVisitScopeForm` | `lib/actions/internal-invoice-actions.ts` | `InternalInvoiceLineItemsTable` | Imports visit scope lines |
| `updateInternalInvoiceLineItemFromForm` | `lib/actions/internal-invoice-actions.ts` | `InternalInvoiceLineItemsTable` | Updates draft line |
| `removeInternalInvoiceLineItemFromForm` | `lib/actions/internal-invoice-actions.ts` | `InternalInvoiceLineItemsTable` | Removes draft line |
| `markInternalInvoiceNoChargeFromForm` | `lib/actions/internal-invoice-actions.ts` | `InternalInvoiceLineItemsTable` | Marks billing disposition no charge |
| `markInternalInvoiceExternallyBilledFromForm` | `lib/actions/internal-invoice-actions.ts` | `InternalInvoiceLineItemsTable` | Marks externally billed |
| `issueInternalInvoiceFromForm` | `lib/actions/internal-invoice-actions.ts` | Internal invoice Actions card | Issues draft invoice |
| `sendInternalInvoiceEmailFromForm` | `lib/actions/internal-invoice-actions.ts` | Send/Resend card | Sends issued invoice email |
| `voidInternalInvoiceFromForm` | `lib/actions/internal-invoice-actions.ts` | Void Invoice section | Voids invoice |
| `recordInternalInvoicePaymentFromForm` | `lib/actions/internal-invoice-payment-actions.ts` | Payment Tracking | Records manual payment |
| Field charge proposal actions | `lib/actions/field-charge-proposal-actions.ts` imported by `FieldBillingSummary` | FieldBillingSummary proposal entry/review | Add proposed charges, approve/reject review |
| Workflow milestone actions | `lib/workflows/actions.ts` imported by `DeferredWorkflowMilestonesPanelBody` | Service Chain Workflow Guidance | Assign workflow, update milestone, send to rater, complete/link ECC, record external ECC |
| Maintenance action buttons | `MarkVisitCountedActionButton`, `ConfirmNextDueDateActionButton` | Service plan blocks | Mark visit counted and confirm next due date |

## 9. Mobile dependency risk list

- `app/jobs/[id]/page.tsx` contains both mobile and desktop branches. Editing route-level variables, booleans, imports, or action wiring can change mobile even if CSS/layout edits look desktop-only.
- `VisitScopeJobDetailForm` and `VisitScopeBuilder` are used by desktop Work & Invoice and mobile Work & Invoice. Form field names and submit behavior are shared.
- `JobLocationPreview` is used in desktop Service Location and mobile Field Operations Board. Props such as `showActionsOnMobile`, `showAddressOverlay`, and `showAddressFooter` control both experiences.
- `ContactLoggingQuickActions` is used in desktop communication context and mobile Field Operations Board.
- `DeferredInternalNoteMentionComposer`, `DeferredInternalNotesBody`, and `DeferredSharedNotesBody` are used in desktop right rail/records and mobile notes hub.
- `FieldBillingSummary` is rendered by desktop invoice sections and affects billing/proposal surface. Mobile reads the same invoice state and actions.
- `MarkVisitCountedActionButton` and `ConfirmNextDueDateActionButton` appear in both desktop service-plan area and mobile attention strips.
- Global booleans such as `showInternalInvoicePanel`, `showExternalDataEntryPrompt`, `showSharedNotesCard`, `activeWaitingState`, `showMobileInvoiceOpenAttention`, `markVisitCountedLinkId`, and `suggestedNextDueProjection` feed both desktop and mobile.
- Shared action redirect anchors (`return_to`) often target mobile or desktop IDs. Renaming IDs can break post-submit return positions.
- `Job Details & Records` uses CSS `:target`; changing target IDs such as `#edit-job`, `#job-status`, `#follow-up`, `#service-chain`, `#shared-notes`, or mobile IDs can break hidden panels and redirects.

## 10. Do-not-lose checklist

- Auth redirects and same-account scoped read boundary.
- All flash/banner messages and banner query-param handling.
- Header job identity, job reference, status chips, and lifecycle summaries.
- Field status actions including On the Way undo.
- Field outcome/finish flow including ECC missing-test blocker.
- Closeout readiness messaging and field/certs/invoice blockers.
- External billing data-entry prompt and complete action.
- Internal invoice summary, draft create, replacement invoice prompt, invoice charges, issue, send/resend, void, payment tracking, delivery history.
- Field billing proposal entry and review controls.
- Supplemental invoice family summary and links.
- Customer/account phone, text, email links.
- Billing recipient/access/role contact cards.
- Contractor assignment/relationship controls.
- Contact logging quick actions and contact attempt history.
- Team assignment list, add assignee, set primary, remove assignee.
- Service location preview, directions/search, correct address, add new location, change location form and invoice-history warning.
- Visit Reason, Customer Concern, Intake Notes, Work Summary.
- Work Items editor, primary items, companion service items, promoted service job links, Create Service Follow-Up.
- Permit Quick Ref and full Permit Details with number/jurisdiction/date.
- ECC Summary latest run/result/date and tests link paths.
- ECC retest ready, retest scheduling, linked retest continuation, correction review resolution.
- Contractor Report Panel for failed/pending-info contractor correction context.
- Shared Notes composer/history and internal notes composer/history.
- Timeline and job history summary.
- Attachments launcher, attachment list, and full attachments link.
- Equipment list/edit/create and Manage Equipment link.
- Follow Up edit fields and Follow-Up History.
- Service Chain empty state, workflow guidance, milestones, linked visits, handoff/rater controls.
- Maintenance agreement visit count and suggested/confirmed next due date controls.
- Admin tools: archive and cancel.
- Mobile-only sections and IDs: mobile header/actions, mobile work scope, mobile notes hub, mobile tools, mobile attention strips.

## 11. Proposed V2 placement map

| V2 zone | Move/group these current surfaces | Notes |
|---|---|---|
| Header and primary action bar | Job identity/reference, lifecycle status, field status actions, On the Way undo, schedule summary | Preserve flash banners above. Keep mobile branch untouched. |
| Job brief | Visit Reason, Customer Concern, Intake Notes, Work Summary, Service Details classification | Keep distinct source labels. Do not collapse into one text blob yet. |
| Primary work | Work Items editor/list, companion service items, Add/Update Work, service return/callback actions | Keep visit scope source of truth unchanged. |
| People and responsibility | Customer/account, contact links, billing/access/role contacts, contractor, team assignment, contact logging | Contact logging belongs here but history can live in activity. |
| Place/work location | Service Location preview, directions/search, correct address, add new location, change service location | Keep invoice snapshot warning with change form. |
| Status and blockers | Job Status interrupt panel, waiting/pending/on-hold banners, release/re-evaluate, closeout readiness | Keep operational status separate from work items. |
| Billing/closeout | Internal invoice summary/full workspace entry, external billing prompt, field billing proposals, payment tracking, supplemental invoices | Do not mix payment authority controls with read-only billing chips. |
| ECC/compliance | Permit Quick Ref, Permit Details, ECC Summary, tests link, certs/permit closeout, retest/correction review, contractor correction report | Keep compliance evidence/history visible near ECC controls. |
| Notes hub | Right rail preview, internal notes composer/history, shared notes composer/history, note banners | Avoid deleting duplicate-looking surfaces until a notes source-of-truth plan exists. |
| Records/history | Timeline, Follow-Up History, Attachments, Equipment, Service Chain, Workflow Guidance | Launcher grid can become tabs/sidebar, but all target panels must survive. |
| Service plan/follow-up | Visit count review, suggested next due, confirmed due context, return/callback visits | Keep service-plan actions near lifecycle completion/follow-up. |
| Admin/advanced | Archive, cancel, dangerous/state-changing admin tools | Keep gated and visually separated. |

## 12. Explicit non-actions

- No product code was modified.
- No layout, styling, component, server action, helper, schema, migration, env, Supabase, Stripe, QBO, SMS, RLS/auth, or permission changes were made.
- No tools, cards, actions, buttons, fields, drawers, tabs, collapsibles, notes, records, or hidden panels were removed.
- No tests were modified.
- This document is an audit and proposed placement map only. It is not an implementation plan for the redesign and does not authorize component refactors.

