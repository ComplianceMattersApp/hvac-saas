# Job Detail V1 Retirement — Removed Test Assertions

The classic desktop job detail layout and its `?desktopLayout=current|classic` /
`?legacy=1` escape hatch were removed from `app/jobs/[id]/page.tsx`. Desktop now
renders `app/jobs/[id]/v2/page.tsx` unconditionally, matching mobile, which had
already moved to `MobileJobDetailV2Preview`.

These source-scraping assertions described markup that lived only in the removed
branch. They were passing because the branch was still present in the file, not
because any user-reachable surface satisfied them — the branch was reachable only
by query string. Each is listed here so the intent can be re-asserted against V2
if it still matters.

**257 assertions and 23 `it` blocks removed across 16 files.**

## Review priority

Capabilities present in the classic desktop layout with no V2 equivalent found:

- `Tech ID` header label — V2 never renders the raw job UUID (intentional; stronger than the old 'demote' behaviour).
- ~~Service address edit affordance — present on mobile V2, **absent from V2 desktop**.~~
  **Fixed.** Desktop V2's location card now links to `/locations/{id}` with an
  `aria-label` naming the address, matching what the classic layout offered.
  Note this is distinct from `ChangeServiceLocationForm`, which V2 already had:
  that switches the job to a *different* saved location and is not a way to
  correct the current one. Covered by
  `lib/jobs/__tests__/job-detail-service-address-edit-affordance.test.ts`.
- `Change Service Location` compact flow — not found on any live surface.
- `Send ECC/HERS Request` sender-side UI — not found on any live surface.
- **`#next-service-action` is a dead deep-link target (pre-existing).** Six live
  code paths send users to it — `app/ops/queues/waiting/page.tsx:197`,
  `lib/actions/job-ops-actions.ts:2355`, and four post-action redirects in
  `lib/actions/job-actions.ts` (retest confirmed, schedule window invalid,
  schedule date required, retest create failed). All five renders of
  `id="next-service-action"` were inside the removed legacy desktop branch
  (pre-excision lines 4203–5579 of the 4010–8043 block), so the anchor only ever
  existed behind `?legacy=1`. Those redirects have therefore been scrolling
  nowhere for users all along; the retirement exposed this rather than causing
  it. The banner query params still work — only the scroll target is missing.
  Fix by adding the anchor to the V2 next-service region, or by dropping the
  fragment from the six call sites.

## Second pass: dead-code sweep

After the desktop branch was removed, `MobileJobDetailCurrent.tsx` (1,152 lines)
was deleted — it had been unreferenced by production since Slice B and was held
in place only by test fixtures — and 673 lines of symbols the legacy branch had
been the sole consumer of were swept from `page.tsx` (imports, helper
components, computed values, and one now-unnecessary Supabase read for
`sourceJobWorkshareRequests`).

Tests asserting the *existence* of those computations were asserting dead code,
and are included in the listing below.

`equipmentSystems` and `jobChecklistItems` were initially left in place. They
are positional elements of the `await Promise.all([...])` destructure, where
removing a binding without removing its matching promise at the same index
silently rebinds every value after it — a mechanical sweep produced exactly
that, binding `internalInvoiceTruth` to a customer-name array. They have since
been removed properly, in a paired edit that deletes the binding, the promise,
and the `timedPhase` read behind it, with the two arrays asserted equal in
length and checked pairwise afterwards. That drops two Supabase reads
(`job_systems` and `job_checklist_item_completions`) from every job detail
render.

`page.tsx` is now 3,273 lines, down from 8,058. Unused-symbol warnings in the
file are at 37, below the 44 present before this work began.

## Removed assertions by file

### `job-tests-page-wiring.test.ts` (113)

```ts
expect(jobStatusPanelSlice).toContain("Current lifecycle");
expect(recordsSectionIndex).toBeGreaterThan(-1);
expect(workInvoiceIndex).toBeGreaterThan(-1);
expect(callbackGateIndex).toBeGreaterThan(-1);
expect(topNotesIndex).toBeGreaterThan(-1);
expect(jobPageSource).toContain('id="internal-notes"');
expect(jobPageSource).toContain('{showEccSummaryCard ? (');
expect(jobPageSource).toContain("Permit Quick Ref");
expect(visitScopeIndex).toBeGreaterThan(-1);
expect(jobPageSource).toContain("Intake Notes");
expect(jobPageSource).toContain('id="visit-reason-card"');
expect(jobPageSource).toContain("<ActiveRescheduleWarning status={job.status} />");
expect(jobPageSource).toContain("Account Contact");
expect(jobPageSource).toContain("Contractor / Billing");
expect(jobPageSource).toContain("Billing contact on account");
expect(jobPageSource).toContain("Customer / Account");
expect(locationPanelStart).toBeGreaterThan(-1);
expect(jobStatusPanelSlice).toContain("{formatOpsStatusLabel(job.ops_status, job.job_type)}");
expect(sharedPanelIndex).toBeGreaterThan(recordsGridIndex);
expect(recordsGridIndex).toBeGreaterThan(recordsSectionIndex);
expect(workInvoiceSectionEnd).toBeGreaterThan(workInvoiceIndex);
expect(callbackTitleIndex).toBeGreaterThan(callbackGateIndex);
expect(topNotesIndex).toBeLessThan(recordsSectionIndex);
expect(jobPageSource).toContain("View / Add Notes");
expect(jobPageSource).toContain('title="ECC Summary"');
expect(jobPageSource).toContain("Permit number");
expect(assignedTeamIndex).toBeGreaterThan(-1);
expect(jobNotesCardSlice).toContain("ChatIcon");
expect(jobPageSource).toContain("Job Title");
expect(jobPageSource).toContain("active_reschedule_confirmation_required");
expect(jobPageSource).toContain("Access Call");
expect(jobPageSource).toContain("Invoice routing still follows the job/invoice billing recipient fields.");
expect(jobPageSource).toContain("Site / Access Contact");
expect(locationPanelSlice).toContain("Service Location");
expect(jobStatusPanelSlice).toContain("InterruptStateFields");
expect(jobPageSource).toContain("#job-record-detail-panel > [data-record-panel] { display: none; }");
expect(editJobIndex).toBeGreaterThan(recordsGridIndex);
expect(lowerNextServiceIndex).toBeGreaterThan(workInvoiceSectionEnd);
expect(jobPageSource).toContain('{showJobRecordsPermitCard ? (');
    expect(jobPageSource).toContain('title="Permit Details"');
    expect(jobPageSource).toContain('title="Equipment"');
  });
expect(lowerEccSummaryIndex).toBeGreaterThan(recordsGridIndex);
expect(permitQuickRefIndex).toBeGreaterThan(-1);
expect(assignedTeamIndex).toBeLessThan(visitScopeIndex);
expect(jobNotesCardSlice).toContain("{rightRailNotesTitle}");
expect(jobPageSource).toContain("form action={updateJobTitleFromForm}");
expect(jobPageSource).toContain("Access Text");
expect(jobPageSource).toContain("Access phone");
expect(locationPanelSlice).toContain("TimedJobLocationPreview");
expect(jobPageSource).toContain('{showJobRecordsPermitCard ? (');
expect(jobStatusPanelSlice).toContain("initialInterruptState={currentInterruptState");
expect(jobPageSource).toContain("#job-record-detail-panel > [data-record-panel]:target { display: block; }");
expect(jobStatusIndex).toBeGreaterThan(editJobIndex);
expect(lowerNextServiceSlice).toContain("Next Service Action");
expect(jobPageSource).toContain('title="Permit Details"');
expect(lowerPermitIndex).toBeGreaterThan(lowerEccSummaryIndex);
expect(permitNumberIndex).toBeGreaterThan(permitQuickRefIndex);
expect(rightRailIndex).toBeGreaterThan(visitScopeIndex);
expect(jobNotesCardSlice).toContain("{rightRailNotesEmptyText}");
expect(jobPageSource).toContain("form action={updateJobVisitScopeFromForm}");
expect(locationPanelSlice).toContain("showAddressOverlay");
expect(jobStatusPanelSlice).toContain("initialStatusReason={initialInterruptReason}");
expect(jobPageSource).toContain('data-record-panel="edit-job"');
expect(equipmentIndex).toBeGreaterThan(jobStatusIndex);
expect(lowerNextServiceSlice).toContain("Create Return Visit");
expect(jobPageSource).toContain('title="Equipment"');
expect(lowerEquipmentIndex).toBeGreaterThan(lowerPermitIndex);
expect(jobPageSource).toContain("xl:order-4 xl:col-span-3");
expect(jobStatusPanelSlice).toContain('className="space-y-4 rounded-xl border border-slate-200/80 bg-white/96 p-4"');
expect(jobPageSource).toContain('data-record-panel="job-status"');
expect(attachmentsIndex).toBeGreaterThan(equipmentIndex);
expect(nextServiceAnchorCount).toBeGreaterThan(1);
expect(attachmentsIndex).toBeGreaterThan(lowerEquipmentIndex);
expect(jobPageSource).toContain("space-y-3 xl:order-3");
expect(jobPageSource).toContain("whitespace-pre-wrap break-words");
expect(jobStatusPanelSlice).toContain('className={`${recordActionRowEndClass} border-t border-slate-200/80 pt-3`}');
expect(jobPageSource).toContain('data-record-panel="job-record-equipment"');
expect(followUpIndex).toBeGreaterThan(attachmentsIndex);
expect(jobPageSource).toContain("Manage Equipment");
expect(jobStatusPanelSlice).toContain("Save Interrupt State");
expect(jobPageSource).toContain('data-record-panel="job-record-attachments"');
expect(followUpHistoryIndex).toBeGreaterThan(followUpIndex);
expect(jobPageSource).toContain('data-record-panel="follow-up"');
expect(timelineIndex).toBeGreaterThan(followUpHistoryIndex);
expect(jobPageSource).toContain('data-record-panel="job-record-follow-up-history"');
expect(serviceChainIndex).toBeGreaterThan(timelineIndex);
expect(jobPageSource).toContain('data-record-panel="job-record-timeline"');
expect(jobPageSource).toContain('title="Job Details"');
expect(jobPageSource).toContain('data-record-panel="service-chain"');
expect(jobPageSource).toContain('title="Job Status"');
expect(jobPageSource).toContain('href="#job-details-records" className={recordCloseButtonClass}>Close</a>');
expect(jobPageSource).toContain("Details, status, equipment, attachments, follow-up, and history.");
expect(jobPageSource).toContain("<EquipmentEditCard");
expect(jobPageSource).toContain("<EquipmentCreateForm");
expect(jobPageSource).toContain("No equipment captured yet");
// [whole it block]
it("uses compact record launchers with one shared wide detail panel", () => {
    const recordsSectionIndex = jobPageSource.indexOf('id="job-details-records"');
    const recordsGridIndex = jobPageSource.indexOf('grid grid-cols-1 items-start gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-4', recordsSectionIndex);
    const sharedPanelIndex = jobPageSource.indexOf('id="job-record-detail-panel"', recordsGridIndex);
    const gridSlice =
      recordsGridIndex > -1 && sharedPanelIndex > recordsGridIndex
        ? jobPageSource.slice(recordsGridIndex, sharedPanelIndex)
        : "";
    const panelSlice =
      sharedPanelIndex > -1
        ? jobPageSource.slice(sharedPanelIndex, jobPageSource.indexOf("</section>", sharedPanelIndex) + "</section>".length)
        : "";

    expect(jobPageSource).toContain("const recordLauncherClass =");
    expect(jobPageSource).toContain("const recordPanelClass =");
    expect(gridSlice).not.toContain("Save Scheduling");
    expect(gridSlice).not.toContain("Manage Equipment");
    expect(gridSlice).not.toContain("DeferredJobAttachmentsInternal");
    expect(jobPageSource).toContain('import EquipmentEditCard from "./_components/EquipmentEditCard";');
    expect(jobPageSource).toContain('import EquipmentCreateForm from "./_components/EquipmentCreateForm";');
    expect(jobPageSource).toContain("job_systems");
    expect(jobPageSource).toContain('#job-details-records:has(#edit-job:target) [data-record-launcher="edit-job"]');
    expect(panelSlice).toContain("Selected record panel");
  });
// [whole it block]
it("keeps Mobile V2 as the only mobile default with the classic surface retired", () => {
    // Slice B: unconditional V2 selection; classic surface retired but file retained.
    expect(jobPageSource).toContain("const MobileJobDetailMobileComponent = MobileJobDetailV2Preview;");
    expect(jobPageSource).toContain('import MobileJobDetailV2Preview from "./_components/MobileJobDetailV2Preview";');
    expect(jobPageSource).not.toContain("buildV2JobDetailRedirectPath");
    expect(jobPageSource).not.toContain('import MobileJobDetailCurrent from "./_components/MobileJobDetailCurrent";');
    expect(jobPageSource).not.toContain("const forceCurrentMobileLayout");
    expect(jobPageSource).not.toContain("const mobileLayoutRaw = sp.mobileLayout;");
    expect(jobPageSource).not.toContain("? MobileJobDetailCurrent");
    expect(mobileJobDetailCurrentSource).toContain("export default function MobileJobDetailCurrent");
  });
// [whole it block]
it("exposes mobile failed-report sending through the existing contractor report panel", () => {
    expect(jobPageSource).toContain("const canShowContractorReportPanel =");
    expect(jobPageSource).toContain('id="mobile-failed-report"');
    expect(jobPageSource).toContain("<ContractorReportPanel");
    expect(mobileJobDetailCurrentSource).toContain("MobileJobStatusActionSurface");
    expect(readFileSync(resolve(__dirname, "../../../app/jobs/[id]/_components/MobileJobStatusActionSurface.tsx"), "utf8")).toContain(
      "Send Failed Report",
    );
  });
// [whole it block]
it("keeps customer context in the mobile header without duplicating it in the Field Operations Board", () => {
    const mobileHeaderStart = mobileJobDetailCurrentSource.indexOf('<span>Job Workbench</span>');
    const mobileHeaderEnd = mobileJobDetailCurrentSource.indexOf("<MobileJobSchedulePanel", mobileHeaderStart);
    const mobileHeaderSlice =
      mobileHeaderStart > -1 && mobileHeaderEnd > mobileHeaderStart
        ? mobileJobDetailCurrentSource.slice(mobileHeaderStart, mobileHeaderEnd)
        : "";
    const mobileBoardStart = mobileJobDetailCurrentSource.indexOf('<div className="text-lg font-semibold text-[#0f1f35]">Field Operations Board</div>');
    const mobileBoardEnd = mobileJobDetailCurrentSource.indexOf("{showMobileContractorContext ? (", mobileBoardStart);
    const mobileBoardSlice =
      mobileBoardStart > -1 && mobileBoardEnd > mobileBoardStart
        ? mobileJobDetailCurrentSource.slice(mobileBoardStart, mobileBoardEnd)
        : "";

    expect(mobileHeaderStart).toBeGreaterThan(-1);
    expect(mobileHeaderSlice).toContain("Customer / Account");
    expect(mobileHeaderSlice).toContain("mobileCustomerHref");
    expect(mobileHeaderSlice).toContain("serviceLocationEditHref");
    expect(mobileBoardStart).toBeGreaterThan(-1);
    expect(mobileBoardSlice).toContain("Service Location");
    expect(mobileBoardSlice).toContain("Contact Logging");
    expect(mobileBoardSlice).toContain("AssignedTeamControls");
    expect(mobileBoardSlice).not.toContain("Customer / Account");
    expect(mobileBoardSlice).not.toContain("mobileCustomerHref");
    expect(mobileBoardSlice).not.toContain("telLink");
    expect(mobileBoardSlice).not.toContain("sms:${accountPhoneDigits}");
    expect(mobileBoardSlice).not.toContain("accountEmailLink");
  });
// [whole it block]
it("uses the preferred job workbench heading fallback chain", () => {
    expect(jobPageSource).toContain("const fieldHeaderTitle =");
    expect(jobPageSource).toContain("const jobWorkbenchTitle = firstNonEmpty(jobTitleText, visitScopeLeadText, fieldHeaderTitle) ?? \"Job Detail\";");
    expect(mobileJobDetailCurrentSource).toContain("{jobWorkbenchTitle}");
    expect(jobPageSource).toContain("primarySiteAccessName");
    expect(jobPageSource).toContain("?? \"Job Detail\"");
    expect(`${jobPageSource}`).not.toContain('{normalizeRetestLinkedJobTitle(job.title) || "Operational job workspace"}');
  });
// [whole it block]
it("keeps the mobile schedule editor mounted in visible overflow containers", () => {
    const mobileScheduleStart = mobileJobSchedulePanelSource.indexOf('id="mobile-when-panel"');
    const mobileScheduleSlice = mobileJobSchedulePanelSource;

    expect(mobileScheduleStart).toBeGreaterThan(-1);
    expect(mobileJobDetailCurrentSource).toContain(
      '<section className="overflow-visible rounded-2xl border border-slate-200/80 bg-white shadow-[0_20px_48px_-34px_rgba(15,23,42,0.36)] ring-1 ring-blue-100/35">',
    );
    expect(mobileJobDetailCurrentSource).toContain("<MobileJobSchedulePanel {...props} />");
    expect(mobileScheduleSlice).toContain('className="group relative overflow-visible rounded-xl');
    expect(mobileScheduleSlice).toContain("<ClockIcon");
    expect(mobileScheduleSlice).toContain("{appointmentDateLabel}");
    expect(mobileScheduleSlice).toContain("{mobileAppointmentTimeLabel}");
    expect(mobileScheduleSlice).toContain('group-open:block');
    expect(mobileScheduleSlice).toContain('const closeHref =');
    expect(mobileScheduleSlice).toContain(': `/jobs/${job.id}?tab=${tab}`');
    expect(mobileScheduleSlice).toContain("href={closeHref}");
    expect(mobileScheduleSlice).toContain('form action={updateJobScheduleFromForm}');
    expect(mobileScheduleSlice).toContain('name="scheduled_date"');
    expect(mobileScheduleSlice).toContain('name="window_start"');
    expect(mobileScheduleSlice).toContain('name="window_end"');
    expect(mobileScheduleSlice).toContain("Save Scheduling");
    expect(mobileScheduleSlice).toContain("<UnscheduleButton");
    expect(mobileScheduleSlice).toContain("Close");
    expect(mobileScheduleSlice).not.toContain('className="group relative self-start overflow-hidden');
  });
// [whole it block]
it("keeps job title, visit reason, work summary, and intake notes bound to distinct fields", () => {
    expect(mobileJobDetailCurrentSource).toContain("<MobileJobWorkScopePanel {...props} />");
    expect(mobileJobWorkScopePanelSource).toContain("Visit Reason");
    expect(jobPageSource).toContain("const visitReasonText =");
    expect(mobileJobWorkScopePanelSource).toContain("{visitReasonText}");
    expect(mobileJobWorkScopePanelSource).toContain('id="mobile-visit-reason-card"');
    // The job title is the hero heading at the top of the mobile view, so the work
    // card no longer restates it. Editing it stays on the desktop/ops surfaces.
    expect(mobileJobWorkScopePanelSource).not.toContain('id="mobile-job-title-card"');
    expect(mobileJobWorkScopePanelSource).not.toContain("updateJobTitleFromForm");
    expect(mobileJobWorkScopePanelSource).toContain("updateJobVisitScopeFromForm");
    expect(mobileJobWorkScopePanelSource).toContain('name="visit_scope_summary"');
    expect(mobileJobWorkScopePanelSource).toContain('name="visit_scope_items_json" value={visitScopeItemsJsonForInlineEdit}');
    expect(mobileJobWorkScopePanelSource).not.toContain("Visit Reason / Visit Title");
    expect(jobPageSource).not.toContain("Customer Concern");
  });
// [whole it block]
it("uses count-only note and attachment indicators without loading payloads for the summary", () => {
    const mobileV2Source = readFileSync(
      resolve(__dirname, "../../../app/jobs/[id]/_components/MobileJobDetailV2Preview.tsx"),
      "utf8",
    );

    expect(jobPageSource).toContain('select("id", { count: "exact", head: true })');
    expect(jobPageSource).toContain('.in("event_type", ["public_note", "contractor_note", "contractor_correction_submission"])');
    expect(jobPageSource).toContain('.eq("event_type", "internal_note")');
    expect(jobPageSource).toContain('.from("attachments")');
    expect(jobPageSource).toContain('.eq("entity_type", "job")');
    expect(jobPageSource).toContain("const attachmentCountMeta =");
    expect(mobileV2Source).toContain("Files & Attachments");
    expect(mobileV2Source).toContain("{attachmentCountMeta ?");
    expect(mobileJobDetailCurrentSource).toContain('`Attachments · ${attachmentCountMeta}`');
  });
// [whole it block]
it("keeps work needed after visit reason on mobile while spanning the desktop grid", () => {
    const visitReasonIndex = mobileJobWorkScopePanelSource.indexOf("Visit Reason");
    const mobileWorkScopeIndex = mobileJobWorkScopePanelSource.indexOf('id="mobile-work-scope"');
    const mobileAssignedTeamIndex = mobileJobDetailCurrentSource.indexOf("<AssignedTeamControls");
    const mobileWorkScopeMountIndex = mobileJobDetailCurrentSource.indexOf("<MobileJobWorkScopePanel");
    const mobileWorkItemsIndex = mobileJobWorkScopePanelSource.indexOf(
      "{visitScopeItems.map((item: any, index: number) => {",
      visitReasonIndex,
    );
    const visitScopeIndex = jobPageSource.indexOf('id="visit-scope-section"');
    const rightRailIndex = jobPageSource.indexOf("Right: quick reference rail");
    const assignedTeamIndex = jobPageSource.indexOf("<AssignedTeamControls", jobPageSource.indexOf("Field Operations Board"));

    expect(visitReasonIndex).toBeGreaterThan(-1);
    expect(mobileWorkScopeIndex).toBeGreaterThan(-1);
    expect(mobileAssignedTeamIndex).toBeGreaterThan(-1);
    expect(mobileWorkScopeMountIndex).toBeGreaterThan(-1);
    expect(mobileAssignedTeamIndex).toBeLessThan(mobileWorkScopeMountIndex);
    expect(mobileWorkItemsIndex).toBeGreaterThan(visitReasonIndex);
  });
// [whole it block]
it("removes the mobile Tools jump button while preserving lower tools", () => {
    const mobileWorkScopeStart = mobileJobWorkScopePanelSource.indexOf('id="mobile-work-scope"');
    const mobileNotesStart = mobileJobWorkScopePanelSource.indexOf("<MobileJobWorkScopeBody", mobileWorkScopeStart);
    const mobileWorkScopeSlice =
      mobileWorkScopeStart > -1 && mobileNotesStart > mobileWorkScopeStart
        ? mobileJobWorkScopePanelSource.slice(mobileWorkScopeStart, mobileNotesStart)
        : "";

    expect(mobileWorkScopeSlice).not.toContain('href="#mobile-tools"');
    expect(mobileWorkScopeSlice).not.toContain(">Tools");
    expect(mobileJobDetailCurrentSource).toContain('id="mobile-tools"');
    expect(mobileJobDetailCurrentSource).toContain("More Details / Tools");
  });
// [whole it block]
it("deduplicates mobile Service Location address and navigation actions", () => {
    const mobileLocationStart = mobileJobDetailCurrentSource.indexOf('<div className="text-sm font-semibold text-[#0f1f35]">Service Location</div>');
    const mobileLocationEnd = mobileJobDetailCurrentSource.indexOf("<MobileJobWorkScopePanel", mobileLocationStart);
    const mobileLocationSlice =
      mobileLocationStart > -1 && mobileLocationEnd > mobileLocationStart
        ? mobileJobDetailCurrentSource.slice(mobileLocationStart, mobileLocationEnd)
        : "";

    expect(mobileLocationSlice).toContain("showAddressOverlay");
    expect(mobileLocationSlice).toContain("showAddressFooter");
    expect(mobileLocationSlice).toContain("showActionsOnMobile");
    expect(mobileLocationSlice).not.toContain("{serviceAddressDisplay}");
    expect(mobileLocationSlice).not.toContain("mobileNavigateHref");
    expect(mobileLocationSlice).not.toContain("<span>Navigate</span>");
    expect(jobLocationPreviewSource).toContain("showActionsOnMobile?: boolean");
    expect(jobLocationPreviewSource).toContain('props.showActionsOnMobile ? "mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch sm:justify-between"');
    expect(jobLocationPreviewSource).toContain("showAddressOverlay={props.showAddressOverlay}");
    expect(jobLocationPreviewSource).toContain("!props.showAddressOverlay && props.showAddressFooter");
    expect(jobLocationPreviewSource).toContain("Navigate");
    expect(jobLocationPreviewSource).toContain("Open in Maps");
  });
expect(jobPageSource).toContain("rightRailNotesTitle");
expect(jobPageSource).toContain("const rightRailNotesTitle = isEccJobType ? \"Shared Notes\" : \"Job Notes\";");
expect(jobPageSource).toContain("const rightRailNotesEmptyText = isEccJobType ? \"No shared or internal notes yet.\" : \"No notes yet.\";");
expect(jobPageSource).toContain("const accountEmailLink =");
expect(jobPageSource).toContain("const showSiteAccessCard = hasSeparateSiteAccessContact && !siteAccessMatchesAccount;");
expect(jobPageSource).toContain("const rightRailNotesSubtitle = isEccJobType");
expect(jobPageSource).toContain("mailto:");
expect(jobPageSource).toContain("? \"Latest shared/internal note activity.\"");
expect(jobPageSource).toContain(": \"Latest job note activity.\";");
```

### `job-detail-field-outcome-panel-wiring.test.ts` (37)

```ts
expect(jobDetailSource).toContain('data-completion-action-banner="true"');
expect(jobDetailAndCurrentMobileSource).toContain("Use the invoice workspace to finish billing for this job.");
expect(jobDetailSource).toContain('banner === "certs_closeout_closed"');
expect(jobDetailSource).toContain('id="ecc-permit-needed-action"');
expect(jobDetailSource).toContain('{workflowChipLabel}');
expect(jobDetailSource).toContain('!isFieldComplete && job.status !== "completed" ? (');
    expect(jobDetailAndCurrentMobileSource).toContain(') : !isFieldComplete ? (');
    expect(jobDetailAndCurrentMobileSource).toContain(') : isFieldComplete || job.status === "completed" ? (');
  });
expect(jobDetailSource).toContain("different_issue_found_saved");
expect(jobDetailSource).toContain('!isFieldComplete && job.status !== "completed" ? (');
    expect(jobDetailSource).toContain("getJobDetailCloseoutReadinessMessage(closeoutProjectionJob)");
    expect(jobDetailSource).toContain("showPrimaryCloseoutBlockers");
    expect(jobDetailSource).toContain("jobPageInvoiceNextAction");
    expect(jobDetailAndCurrentMobileSource).toContain("Certs Sent");
    expect(panelSource).not.toContain('import { advanceJobStatusFromForm } from "@/lib/actions/job-actions";');
    expect(panelSource).not.toContain("form action={advanceJobStatusFromForm}");
    expect(panelSource).not.toContain("Confirm Work Completed");
    expect(jobDetailAndCurrentMobileSource).toContain('completeLabel="Mark Work Complete"');
    expect(jobDetailAndCurrentMobileSource).not.toContain("completeLabel={surfaceProfile.labels.finishComplete}");
    expect(panelSource).not.toContain("Confirm field work complete");
  });
expect(jobDetailSource).toContain('!isFieldComplete && job.status !== "completed" ? (');
expect(jobDetailSource).toContain("latestJobNotesPreview.map((preview, index) => (");
expect(jobDetailAndCurrentMobileSource).toContain('className="hidden w-full sm:block"');
expect(jobDetailSource).toContain('<div id="field-status-actions"');
expect(jobDetailSource).toContain("Certs sent. Job closed out.");
expect(jobDetailSource).toContain('banner === "permit_needed"');
expect(jobDetailSource).toContain("Different issue noted. This callback/return visit is complete and office review is next; the original job history was not changed.");
expect(jobDetailAndCurrentMobileSource).toContain("Back to Ops");
expect(jobDetailSource).toContain("key={`${preview.createdAt || \"note\"}-${preview.label}-${preview.text.slice(0, 40)}-${index}`}");
expect(jobDetailSource).toContain('banner === "certs_closeout_saved"');
expect(jobDetailSource).toContain('banner === "permit_available_saved"');
expect(jobDetailSource).toContain("Different Issue Found is only for callback or return visits. Use the normal follow-up options for first visits.");
expect(jobDetailAndCurrentMobileSource).toContain("Open Customer");
expect(jobDetailSource).toContain("Certs sent. Closeout blockers were recomputed.");
expect(jobDetailSource).toContain("Add a short note explaining the different issue before routing this callback/return visit to office review.");
expect(jobDetailSource).toContain('job.job_type === "ecc" && !showFieldOutcomePanel && !isEccPermitNeededActive && (isFieldComplete || job.status === "completed") ? (');
expect(jobDetailSource).toContain('banner === "certs_closeout_failed"');
expect(jobDetailSource).toContain("Could not mark certs sent. Refresh and try again.");
expect(jobDetailAndCurrentMobileSource).toContain("Create Estimate");
expect(jobDetailSource).toContain("showPrimaryCloseoutBlockers ||");
expect(jobDetailSource).toContain("serviceFollowUpProgressState.continuedScheduledDate");
expect(jobDetailSource).toContain("const workflowChipLabel =");
expect(jobDetailSource).toContain('const visitType = String(visit?.service_visit_type ?? "").trim().toLowerCase();');
expect(jobDetailSource).toContain('"Return Scheduled"');
expect(jobDetailSource).toContain('normalizedJobStatus === "in_process" && !isFieldComplete');
expect(jobDetailSource).toContain('if (visit?.parent_job_id && visitType === "callback") return "Callback visit";');
expect(jobDetailSource).toContain('"Follow-Up Continued"');
expect(jobDetailSource).toContain('if (visit?.parent_job_id && visitType === "return_visit") return "Return visit";');
expect(jobDetailSource).toContain('if (visit?.parent_job_id && String(visit?.job_type ?? "").toLowerCase() === "service") return "Linked service visit";');
```

### `job-detail-field-billing-panel-wiring.test.ts` (35)

```ts
expect(source).toContain("Ready-to-invoice total");
expect(desktopCloseoutIndex).toBeGreaterThanOrEqual(0);
expect(summarySlice).toContain("capabilities={fieldBillingCapabilities}");
expect(fieldBillingDetailsIndex).toBeGreaterThanOrEqual(0);
expect(source).toContain('{hasVisitScopeDefined ? "Add or Update Work" : "Add Work"}');
expect(workInvoiceIndex).toBeGreaterThanOrEqual(0);
expect(source).toContain("Price ${Number(item.expected_unit_price).toFixed(2)}");
expect(closeoutSlice).toContain("internalInvoiceTruth ? (");
      expect(closeoutSlice).toContain("href={`/jobs/${job.id}/invoice#invoice-workspace`}");
      expect(closeoutSlice).toContain("createInternalInvoiceDraftFromForm");
      expect(closeoutSlice).toContain("return_to");
      expect(closeoutSlice).toContain("/invoice#invoice-workspace");
      expect(closeoutSlice).toContain("auto_import_visit_scope_items");
      expect(closeoutSlice).toContain("SubmitButton");
    }
  });
expect(summarySlice).toContain("parentProvidesInvoiceCta={hasDirectInvoiceWorkflowAccess}");
expect(billingCopyIndex).toBeGreaterThan(invoiceActionIndex);
expect(readyTotalIndex).toBeGreaterThan(invoiceStateIndex);
expect(closeoutSlice).toContain("internalInvoiceTruth ? (");
expect(closeoutSlice).toContain("href={`/jobs/${job.id}/invoice#invoice-workspace`}");
expect(summarySlice).toContain("invoice={fieldBillingInvoiceSnapshot}");
expect(summaryIndex).toBeGreaterThan(billingCopyIndex);
expect(source).toContain("Work performed - price - invoice status");
expect(closeoutSlice).toContain("createInternalInvoiceDraftFromForm");
expect(summarySlice).toContain("supplementalInvoices={fieldBillingSupplementalInvoiceSnapshots}");
expect(source).toContain("Invoice workspace handles official review, issue, send, and collection.");
expect(closeoutSlice).toContain("return_to");
expect(summarySlice).toContain("fieldChargeProposals={fieldBillingSummaryData.fieldChargeProposals}");
expect(closeoutSlice).toContain("/invoice#invoice-workspace");
expect(summarySlice).toContain("pricebookProposalItems={fieldChargeProposalPricebookItems}");
expect(closeoutSlice).toContain("auto_import_visit_scope_items");
expect(summarySlice).toContain("visitScopeProposalItems={fieldChargeProposalVisitScopeItems}");
expect(closeoutSlice).toContain("SubmitButton");
// [whole it block]
it("routes Create Invoice directly to the invoice workspace after draft creation", () => {
    const noInvoicePanelIndex = mobileJobDetailCurrentSource.indexOf('internalInvoiceTruth ? jobPageInvoiceNextAction : "Create invoice"');
    const noInvoicePanelSlice = mobileJobDetailCurrentSource.slice(noInvoicePanelIndex, noInvoicePanelIndex + 1400);

    expect(noInvoicePanelIndex).toBeGreaterThanOrEqual(0);
    expect(noInvoicePanelSlice).toContain("createInternalInvoiceDraftFromForm");
    expect(noInvoicePanelSlice).toContain("return_to");
    expect(noInvoicePanelSlice).toContain("/invoice#invoice-workspace");
    expect(noInvoicePanelSlice).toContain("auto_import_visit_scope_items");
    expect(noInvoicePanelSlice).toContain("Create invoice");
    expect(noInvoicePanelSlice).not.toContain("Create Draft Invoice");
  });
expect(jobDetailAndCurrentMobileSource).toContain("Create invoice");
expect(source).toContain("visitScopeReadyTotalCents");
expect(source).toContain("const canIssueInvoiceLifecycleAccess = hasInvoiceIssueAccess(fieldBillingCapabilities)");
expect(source).toContain("const showSeparateFieldBillingDetails =");
expect(source).toContain("const canSendInvoiceLifecycleAccess = hasInvoiceSendAccess(fieldBillingCapabilities)");
expect(source).toContain("!hasDirectInvoiceWorkflowAccess");
expect(source).toContain("fieldBillingSummaryData.fieldChargeProposals.length > 0");
expect(source).toContain("fieldBillingSupplementalInvoiceSnapshots.length > 0");
```

### `job-detail-mobile-assignment-parity.test.ts` (18)

```ts
expect(desktopPanelStart).toBeGreaterThan(-1);
expect(pageSource).toContain("const forceCurrentDesktopLayout =");
expect(desktopPanel).toContain("assignedTeam={assignedTeam}");
expect(desktopBranch).toContain("<AssignedTeamControls");
expect(desktopPanel).toContain("assignedUserIds={assignedUserIds}");
expect(desktopPanel).toContain("isInternalUser={isInternalUser}");
// [whole it block]
it("makes V2 the only mobile job detail surface with the classic mobile surface retired", () => {
    // Slice B: unconditional V2 selection; the classic surface is retired.
    expect(pageSource).toContain("const MobileJobDetailMobileComponent = MobileJobDetailV2Preview;");
    expect(pageSource).toContain('import MobileJobDetailV2Preview from "./_components/MobileJobDetailV2Preview";');
    expect(pageSource).not.toContain("buildV2JobDetailRedirectPath");
    expect(pageSource).not.toContain('import MobileJobDetailCurrent from "./_components/MobileJobDetailCurrent";');
    expect(pageSource).not.toContain("const forceCurrentMobileLayout");
    expect(pageSource).not.toContain("const mobileLayoutRaw = sp.mobileLayout;");
    expect(pageSource).not.toContain("? MobileJobDetailCurrent");
    expect(pageSource).not.toContain("const explicitlyRequestedMobileV2Preview =");
    expect(pageSource).not.toContain("const mobileV2EligibleInternalUser =");
    expect(pageSource).toContain("<MobileJobDetailMobileComponent");
    // The classic mobile component file is retained in the tree but unreachable.
    expect(mobileJobDetailCurrentSource).toContain("export default function MobileJobDetailCurrent");
    expect(mobileJobDetailV2PreviewSource).toContain("export default function MobileJobDetailV2Preview");
    expect(mobileJobDetailV2PreviewSource).toContain("Billing / Closeout");
    expect(mobileJobDetailV2PreviewSource).toContain("No billing action needed yet.");
    expect(mobileJobDetailV2PreviewSource).not.toContain("Preview only");
    expect(mobileJobDetailV2PreviewSource).toContain("<MobileJobStatusActionSurface {...props} />");
  });
// [whole it block]
it("renders native contact logging in V2 without changing the quick action contract", () => {
    expect(pageSource).toContain("ContactLoggingQuickActions={ContactLoggingQuickActions}");
    expect(pageSource).toContain("logCustomerContactAttemptFromForm={logCustomerContactAttemptFromForm}");
    expect(mobileJobDetailCurrentSource).toContain("<ContactLoggingQuickActions");
    expect(mobileJobDetailV2PreviewSource).toContain("ContactLoggingQuickActions");
    expect(mobileJobDetailV2PreviewSource).toContain('className="group/contact-log"');
    expect(mobileJobDetailV2PreviewSource).toContain("Contact Log");
    expect(mobileJobDetailV2PreviewSource).toContain("Record call, text, or no-answer attempt");
    expect(mobileJobDetailV2PreviewSource).toContain("group-open/contact-log:rotate-90");
    expect(mobileJobDetailV2PreviewSource).toContain("action={logCustomerContactAttemptFromForm}");
    expect(mobileJobDetailV2PreviewSource).toContain("attemptCount={attemptCount}");
    expect(mobileJobDetailV2PreviewSource).toContain("lastAttemptLabel={lastAttemptLabel}");
    expect(mobileJobDetailV2PreviewSource).not.toContain('standardJobAnchorHref("contact-logging")');
    expect(mobileJobDetailV2PreviewSource).not.toContain('href="#contact-logging"');
    expect(mobileJobDetailV2PreviewSource).not.toContain('import { logCustomerContactAttemptFromForm');
    expect(contactLoggingSource).toContain('id="contact-logging"');
    expect(contactLoggingSource).toContain('name="job_id"');
    expect(contactLoggingSource).toContain('name="method" value="call"');
    expect(contactLoggingSource).toContain('name="method" value="text"');
    expect(contactLoggingSource).toContain('name="result" value="no_answer"');
    expect(contactLoggingSource).toContain('name="result" value="sent"');
    expect(contactLoggingSource).toContain('name="return_to" value={returnTo}');
    expect(contactLoggingSource).toContain('name="success_banner" value="contact_attempt_logged"');
  });
// [whole it block]
it("renders the native current mobile schedule panel in V2", () => {
    expect(mobileJobDetailV2PreviewSource).toContain(
      "hasFullSchedule || job?.scheduled_date || job?.window_start || job?.window_end || mobileAppointmentTimeLabel",
    );
    expect(mobileJobDetailV2PreviewSource).toContain("function getHeroScheduleDateDisplay");
    expect(mobileJobDetailV2PreviewSource).toContain("return `${month}/${day}/${year}`;");
    expect(mobileJobDetailV2PreviewSource).toContain("const heroScheduleDateLabel = getHeroScheduleDateDisplay(job?.scheduled_date, appointmentDateLabel);");
    expect(mobileJobDetailCurrentSource).toContain("<MobileJobSchedulePanel {...props} />");
    expect(mobileJobDetailV2PreviewSource).toContain('import MobileJobSchedulePanel from "./MobileJobSchedulePanel";');
    expect(mobileJobDetailV2PreviewSource).toContain('href="#mobile-when-panel"');
    expect(mobileJobDetailV2PreviewSource).toContain('id="mobile-v2-schedule-summary"');
    expect(mobileJobDetailV2PreviewSource).toContain("mt-1 break-words text-base font-semibold");
    expect(mobileJobDetailV2PreviewSource).toContain("{heroScheduleDateLabel}");
    expect(mobileJobDetailV2PreviewSource).not.toContain('{job?.scheduled_date ? "Edit" : "Schedule"}');
    expect(mobileJobDetailV2PreviewSource).toContain("group-hover:bg-blue-100");
    expect(mobileJobDetailV2PreviewSource).not.toContain('className="group block rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3');
    expect(mobileJobDetailV2PreviewSource).not.toContain('mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full');
    expect(mobileJobDetailV2PreviewSource).toContain('<MobileJobSchedulePanel {...props} presentation="v2TargetPanel" />');
    expect(mobileJobDetailV2PreviewSource).not.toContain('const schedulePanelHref = standardJobAnchorHref("mobile-when-panel");');
    expect(mobileJobDetailV2PreviewSource).not.toContain("href={schedulePanelHref}");
    expect(mobileJobDetailV2PreviewSource).toContain("mobileLayout=current");
    expect(mobileJobDetailV2PreviewSource).not.toContain("Change appointment date or arrival window.");
    expect(mobileJobDetailV2PreviewSource).not.toContain("Edit Schedule");
    expect(mobileJobSchedulePanelSource).toContain('id="mobile-when-panel"');
    expect(mobileJobSchedulePanelSource).toContain('presentation === "v2TargetPanel"');
    expect(mobileJobSchedulePanelSource).toContain("target:block");
    expect(mobileJobSchedulePanelSource).toContain('? "#mobile-v2-schedule-summary"');
    expect(mobileJobSchedulePanelSource).toContain(': `/jobs/${job.id}?tab=${tab}`');
    expect(mobileJobSchedulePanelSource).toContain("href={closeHref}");
    expect(mobileJobSchedulePanelSource).toContain('form action={updateJobScheduleFromForm}');
    expect(mobileJobSchedulePanelSource).toContain('name="return_to" value={`/jobs/${job.id}?tab=${tab}#mobile-when-panel`}');
    expect(mobileJobSchedulePanelSource).toContain('name="permit_number"');
    expect(mobileJobSchedulePanelSource).toContain('name="jurisdiction"');
    expect(mobileJobSchedulePanelSource).toContain('name="permit_date"');
    expect(mobileJobSchedulePanelSource).toContain('name="scheduled_date"');
    expect(mobileJobSchedulePanelSource).toContain('name="window_start"');
    expect(mobileJobSchedulePanelSource).toContain('name="window_end"');
    expect(mobileJobSchedulePanelSource).toContain("<UnscheduleButton");
  });
// [whole it block]
it("surfaces existing Visit Scope as Service work without treating it as billing truth", () => {
    expect(mobileJobDetailV2PreviewSource).toContain("const allVisitScopeItems = Array.isArray(visitScopeItems) ? visitScopeItems : [];");
    expect(mobileJobDetailV2PreviewSource).toContain('item?.kind === "companion_service"');
    expect(mobileJobDetailV2PreviewSource).toContain('"Companion Service Work"');
    expect(mobileJobDetailV2PreviewSource).toContain('"Work Performed"');
    expect(mobileJobDetailV2PreviewSource).toContain('"Work to Do"');
    expect(mobileJobWorkScopePanelSource).toContain("Work Summary");
    expect(mobileJobDetailV2PreviewSource).toContain("No Work Items saved yet.");
    expect(mobileJobDetailCurrentSource).toContain("<MobileJobWorkScopePanel {...props} />");
    expect(mobileJobDetailV2PreviewSource).toContain('import MobileJobWorkScopePanel from "./MobileJobWorkScopePanel";');
    expect(mobileJobDetailV2PreviewSource).toContain('<MobileJobWorkScopePanel {...props} presentation="v2InlineBody" />');
    expect(mobileJobDetailV2PreviewSource).toContain('presentation="v2DisclosurePanel"');
    // The disclosure header is gone: the enclosing card is already titled Work
    // Performed, so a second "Work Items" heading restated it.
    expect(mobileJobDetailV2PreviewSource).not.toContain("disclosureLabel=");
    expect(mobileJobDetailV2PreviewSource).not.toContain("disclosureHelper=");
    expect(mobileJobDetailV2PreviewSource).toContain("const showEccWorkScopeLane =");
    expect(mobileJobDetailV2PreviewSource).toContain("{showEccWorkScopeLane ? (");
    expect(mobileJobDetailV2PreviewSource).toContain("Work Scope");
    expect(mobileJobDetailV2PreviewSource).toContain("Visit scope and Work Items for this job.");
    expect(mobileJobDetailV2PreviewSource).not.toContain("Compliance details");
    expect(mobileJobWorkScopePanelSource).toContain('presentation === "v2DisclosurePanel"');
    expect(mobileJobWorkScopePanelSource).toContain('presentation === "v2InlineBody"');
    expect(mobileJobWorkScopePanelSource).toContain('id="mobile-work-scope"');
    expect(mobileJobWorkScopePanelSource).not.toContain('<details id="mobile-work-scope"');
    expect(mobileJobWorkScopePanelSource).toContain('presentation === "v2TargetPanel"');
    expect(mobileJobWorkScopePanelSource).toContain('id="mobile-work-scope"');
    expect(mobileJobWorkScopePanelSource).toContain("target:block");
    expect(mobileJobDetailV2PreviewSource).not.toContain("[&:has(#mobile-work-scope:target)_.v2-work-scope-summary]:hidden");
    expect(mobileJobWorkScopePanelSource).toContain('id="mobile-visit-reason-card"');
    expect(mobileJobWorkScopePanelSource).toContain("VisitScopeJobDetailForm");
    expect(mobileJobWorkScopePanelSource).toContain("updateJobVisitScopeFromForm");
    // The disclosure body is always rendered, so the header carries no "Details"
    // pill — it read as a toggle that did nothing.
    expect(mobileJobWorkScopePanelSource).not.toContain("<span className={previewPillClass ?? \"\"}>Details</span>");
    expect(mobileJobDetailV2PreviewSource).not.toContain("View work details");
    // Billing lives inside the work card so the work list and its invoice total are
    // one block, and the panel is the only place work items are listed.
    expect(mobileJobDetailV2PreviewSource).toContain('<div id="mobile-billing-card"');
    expect(mobileJobDetailV2PreviewSource).not.toContain("serviceWorkPreviewItems.map(");
    // A closed job keeps its real invoice sentence instead of generic read-only copy,
    // and takes its title from the resolved invoice state rather than asserting the
    // invoice is complete — a closed job can hold an issued invoice with $0 collected.
    expect(mobileJobDetailV2PreviewSource).toContain(
      "props.jobPageInvoiceStateLabel || \"Billing / Closeout\"",
    );
    expect(mobileJobDetailV2PreviewSource).not.toContain('"Invoice complete"');
    // Closing a job is operational, not financial. An unpaid invoice keeps the
    // lifecycle ribbon and the billing chip reporting money still owed.
    expect(mobileJobDetailV2PreviewSource).toContain(
      'props.hasOutstandingInvoiceBalance ? "Invoice still open" : "Job closed"',
    );
    expect(mobileJobDetailV2PreviewSource).toContain('? "Balance due"');
    expect(mobileJobDetailV2PreviewSource).toContain("family_balance_due_cents");
    expect(mobileJobDetailV2PreviewSource).not.toContain("Invoice Charges are billed scope. Work Items remain operational scope.");
  });
// [whole it block]
it("exposes mobile assignment controls in the visible Team Assignment card", () => {
    const mobilePanelStart = mobileJobDetailCurrentSource.indexOf("<AssignedTeamControls", mobileJobDetailCurrentSource.indexOf("Contact Logging"));
    const mobilePanelEnd = mobileJobDetailCurrentSource.indexOf("showMobileContractorContext", mobilePanelStart);
    const mobilePanel = mobileJobDetailCurrentSource.slice(mobilePanelStart, mobilePanelEnd);

    expect(mobilePanelStart).toBeGreaterThan(-1);
    expect(mobilePanel).toContain("<AssignedTeamControls");
    expect(mobilePanel).toContain('variant="mobile"');
    expect(mobilePanel).toContain("isInternalUser={isInternalUser}");
    expect(mobilePanel).toContain("assignedTeam={assignedTeam}");
    expect(mobilePanel).toContain("assignedUserIds={assignedUserIds}");
  });
// [whole it block]
it("omits the redundant lower mobile tools jump to the visible assignment card", () => {
    const mobileToolsStart = mobileJobDetailCurrentSource.indexOf('id="mobile-tools"');
    const mobileToolsEnd = mobileJobDetailCurrentSource.indexOf('id="mobile-tools-timeline"', mobileToolsStart);
    const mobileTools = mobileJobDetailCurrentSource.slice(mobileToolsStart, mobileToolsEnd);

    expect(mobileToolsStart).toBeGreaterThan(-1);
    expect(mobileTools).not.toContain('href="#mobile-assigned-team"');
    expect(mobileTools).not.toContain("Assign / Manage");
    expect(mobileTools).not.toContain('id="mobile-assigned-team-panel"');
  });
// [whole it block]
it("omits the redundant mobile work summary card from the header", () => {
    const mobileScheduleSection = mobileJobSchedulePanelSource;

    expect(`${pageSource}`).not.toContain("const mobileWorkStateLabel =");
    expect(mobileJobDetailCurrentSource).not.toContain("{mobileWorkStateLabel}");
    expect(mobileScheduleSection).not.toContain("<span>Work</span>");
    expect(mobileScheduleSection).not.toContain('job.job_type === "service" ? "Service" : "ECC"');
  });
// [whole it block]
it("keeps the top mobile customer link while omitting the duplicate operations-board customer card", () => {
    const mobileHeaderStart = mobileJobDetailCurrentSource.indexOf("<h1");
    const mobileHeaderEnd = mobileJobDetailCurrentSource.indexOf("<MobileJobSchedulePanel", mobileHeaderStart);
    const mobileHeader = mobileJobDetailCurrentSource.slice(mobileHeaderStart, mobileHeaderEnd);
    const fieldOpsStart = mobileJobDetailCurrentSource.indexOf("Field Operations Board");
    const fieldOpsEnd = mobileJobDetailCurrentSource.indexOf('id="assigned-team"', fieldOpsStart);
    const fieldOpsBoard = mobileJobDetailCurrentSource.slice(fieldOpsStart, fieldOpsEnd);

    expect(mobileHeaderStart).toBeGreaterThan(-1);
    expect(mobileHeaderEnd).toBeGreaterThan(mobileHeaderStart);
    expect(mobileHeader).toContain("Customer / Account");
    expect(mobileHeader).toContain("mobileCustomerHref");
    expect(fieldOpsStart).toBeGreaterThan(-1);
    expect(fieldOpsEnd).toBeGreaterThan(fieldOpsStart);
    expect(fieldOpsBoard).toContain("Service Location");
    expect(fieldOpsBoard).toContain("Contact Logging");
    expect(fieldOpsBoard).not.toContain("Customer / Account");
    expect(fieldOpsBoard).not.toContain("mobileCustomerHref");
  });
// [whole it block]
it("styles the mobile Notes & Attachments attachment link as a blue action", () => {
    const notesHubStart = mobileJobDetailCurrentSource.indexOf('id="mobile-notes-hub"');
    const notesHubEnd = mobileJobDetailCurrentSource.indexOf("<MobileJobTeamNotesPanel", notesHubStart);
    const notesHub = mobileJobDetailCurrentSource.slice(notesHubStart, notesHubEnd);

    expect(notesHubStart).toBeGreaterThan(-1);
    expect(notesHubEnd).toBeGreaterThan(notesHubStart);
    expect(notesHub).toContain('href={`/jobs/${job.id}/attachments`}');
    expect(notesHub).toContain("rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white");
    expect(notesHub).toContain("hover:bg-blue-800");
    expect(notesHub).toContain("focus-visible:ring-2 focus-visible:ring-blue-300");
    expect(notesHub).toContain("active:translate-y-[0.5px]");
  });
// [whole it block]
it("folds the mobile service address edit affordance into the address row", () => {
    const mobileHeaderStart = mobileJobDetailCurrentSource.indexOf("<h1");
    const mobileHeaderEnd = mobileJobDetailCurrentSource.indexOf("<MobileJobSchedulePanel", mobileHeaderStart);
    const mobileHeader = mobileJobDetailCurrentSource.slice(mobileHeaderStart, mobileHeaderEnd);

    expect(mobileHeaderStart).toBeGreaterThan(-1);
    expect(mobileHeaderEnd).toBeGreaterThan(mobileHeaderStart);
    expect(mobileHeader).toContain("serviceAddressDisplay !== \"No address set\"");
    expect(mobileHeader).toContain("serviceLocationEditHref && isInternalUser");
    expect(mobileHeader).toContain("aria-label={`Edit service address: ${serviceAddressDisplay}`}");
    expect(mobileHeader).toContain("href={serviceLocationEditHref}");
    expect(mobileHeader).toContain("<MapPinIcon");
    expect(mobileHeader).toContain("<ChevronRightIcon");
    expect(mobileHeader).not.toContain(">Edit service address<");
  });
// [whole it block]
it("removes duplicate mobile workflow and field status row below the schedule/work cards", () => {
    const mobileWorkbenchStart = mobileJobDetailCurrentSource.indexOf("<MobileJobSchedulePanel");
    const mobileWorkbenchEnd = mobileJobDetailCurrentSource.indexOf('{banner === "note_added"', mobileWorkbenchStart);
    const mobileWorkbench = mobileJobDetailCurrentSource.slice(mobileWorkbenchStart, mobileWorkbenchEnd);

    expect(mobileWorkbenchStart).toBeGreaterThan(-1);
    expect(mobileWorkbenchEnd).toBeGreaterThan(mobileWorkbenchStart);
    expect(mobileWorkbench).not.toContain("formatOpsStatusLabel(job.ops_status, job.job_type)");
    expect(mobileWorkbench).not.toContain("{formatStatus(job.status)}");
  });
expect(currentMobileSurfaceSource).toContain(`id="${anchor}"`);
```

### `callback-visit-action-wiring.test.ts` (14)

```ts
expect(jobPageSource).toContain('banner === "callback_report_recorded"');
expect(jobPageSource).toContain('id="next-service-action"');
expect(jobPageSource).toContain('banner === "callback_visit_created"');
expect(jobPageSource).toContain("Create Return Visit");
expect(jobPageSource).toContain(
      "Callback visit created. This is an unscheduled office/dispatch item and will not appear in ${surfaceProfile.labels.fieldUser.toLowerCase()} My Work until scheduled and assigned.",
    );
expect(jobPageSource).toContain("Create Callback Visit");
expect(jobPageSource).toContain('banner === "callback_visit_requires_historical_anchor"');
expect(jobPageSource).toContain("Use when the original job is not finished yet and another visit is needed to complete it.");
expect(jobPageSource).toContain('banner === "callback_report_requires_historical_anchor"');
expect(jobPageSource).toContain("Use when the customer calls back after the job was believed complete.");
expect(jobPageSource).toContain("This records the customer report and creates a new unscheduled office/dispatch callback item.");
expect(jobPageSource).toContain("What did the customer report?");
expect(jobPageSource).toContain("It will not appear in {surfaceProfile.labels.fieldUser.toLowerCase()} My Work until it is scheduled and assigned.");
expect(jobPageSource).toContain("createCallbackVisitFromForm");
```

### `cleaning-surface-profile-wiring.test.ts` (10)

```ts
expect(jobDetailSource).toContain('completeLabel="Mark Work Complete"');
expect(jobDetailSource).toContain("Cleaning checklist support is coming next. Use Cleaning Tasks and notes for this rollout.");
expect(jobDetailSource).toContain("surfaceProfile.surfaces.equipment ? (");
    expect(jobDetailSource).toContain("surfaceProfile.surfaces.eccTests && job.job_type === \"ecc\"");
    expect(jobDetailSource).toContain("surfaceProfile.surfaces.permits && job.job_type === \"ecc\"");
    expect(jobDetailSource).toContain("surfaceProfile.surfaces.certs");
    expect(jobDetailSource).toContain("surfaceProfile.surfaces.retest");
    expect(jobDetailSource).toContain("surfaceProfile.surfaces.contractorRaterHandoff");
  });
expect(jobDetailSource).toContain("surfaceProfile.surfaces.equipment ? (");
expect(jobDetailSource).toContain("completedLabel={surfaceProfile.labels.finishComplete}");
expect(jobDetailSource).toContain("Use location notes and job notes for access, alarm, parking, and supply details.");
expect(jobDetailSource).toContain("surfaceProfile.surfaces.permits && job.job_type === \"ecc\"");
expect(jobDetailSource).toContain("partsNeeded: surfaceProfile.labels.needParts");
expect(jobDetailSource).toContain("Use notes/photos for quality issues until inspection support is added.");
expect(jobDetailSource).toContain('approvalNeeded: isCleaningMode ? "Office / Client Approval Needed" : "Approval Needed"');
```

### `job-detail-workflow-milestones-wiring.test.ts` (10)

```ts
expect(jobDetailSource).toContain(
      "accountOwnerUserId={String(internalUser.account_owner_user_id)}",
    );
expect(jobDetailSource).toContain("title=\"Service Chain\"");
expect(jobDetailSource).toContain("currentJobId={String(jobId)}");
expect(jobDetailSource).toContain("Workflow Guidance");
expect(jobDetailSource).toContain("serviceCaseId={String(serviceCaseId)}");
expect(jobDetailSource).toContain("<DeferredWorkflowMilestonesPanelBody");
expect(jobDetailSource).toContain("canManageWorkflowGuidance={canManageWorkflowGuidance}");
expect(jobDetailSource).toContain('returnToPath={`/jobs/${job.id}?tab=${tab}#service-chain`}');
expect(jobDetailSource).toContain("const canManageWorkflowGuidance = internalRole === \"owner\" || internalRole === \"admin\";");
expect(jobDetailSource).toContain(
      'import DeferredWorkflowMilestonesPanelBody from "./_components/DeferredWorkflowMilestonesPanelBody";',
    );
```

### `job-detail-button-response-wiring.test.ts` (9)

```ts
expect(jobDetailSource).toContain('href={`/jobs/${job.id}/info?f=equipment`}');
expect(desktopActionsSource).toContain("{onTheWayUndoEligibility.eligible ? (");
expect(jobDetailSource).toContain('id="field-status-actions"');
expect(jobDetailSource).toContain("Manage Equipment");
expect(desktopActionsSource).toContain("revertOnTheWayFromForm");
expect(jobDetailSource).toContain('value={`/jobs/${job.id}?tab=${tab}#field-status-actions`}');
expect(desktopActionsSource).toContain("<ImmediateSubmitButton");
expect(desktopActionsSource).toContain('pendingText="Reverting..."');
expect(desktopActionsSource).toContain("Undo On the Way");
```

### `job-detail-job-type-switch-hidden.test.ts` (8)

```ts
expect(jobDetailSource).toContain("Service Details");
expect(jobDetailSource).toContain("!isHvacServiceMode ? (");
    expect(jobDetailSource).toContain("Change Contractor");
  });
expect(jobDetailSource).toContain("!isHvacServiceMode ? (");
expect(jobDetailSource).toContain("Permit Information");
expect(jobDetailSource).toContain("Change Contractor");
expect(jobDetailSource).toContain('name="permit_number"');
expect(jobDetailSource).toContain('name="permit_date"');
expect(jobDetailSource).toContain('name="jurisdiction"');
```

### `account-workshare-requests-ui-source.test.ts` (8)

```ts
expect(source).toContain("Send ECC/HERS Request");
expect(source).toContain("Send this job&apos;s ECC/HERS request to a connected rater account. This shares a safe request snapshot only. The rater will review it in a later step.");
expect(source).toContain("Rater account");
expect(source).toContain("Requested ECC/HERS scope");
expect(source).toContain("Notes for rater");
expect(source).toContain("Send request");
expect(source).toContain("ECC/HERS request sent to the connected rater.");
expect(source).toContain("hasActiveRaterWorkshareConnection");
```

### `job-detail-ecc-retest-bridge-wiring.test.ts` (5)

```ts
expect(jobDetailAndCurrentMobileSource).toContain("Open Linked Retest");
expect(desktopRetestIndex).toBeGreaterThanOrEqual(0);
expect(jobDetailSource).toContain('id="next-service-action"');
expect((desktopRetestBlock.match(/Copy equipment from original/g) ?? [])).toHaveLength(1);
expect((desktopRetestBlock.match(/<form/g) ?? [])).toHaveLength(1);
```

### `job-detail-v2-entrypoint.test.ts` (4)

```ts
expect(legacyJobDetailSource).toContain("const forceCurrentDesktopLayout =");
expect(legacyJobDetailSource).toContain('desktopLayoutMode === "current"');
expect(legacyJobDetailSource).toContain('desktopLayoutMode === "classic"');
expect(legacyJobDetailSource).toContain('legacyMode === "1"');
```

### `job-service-location-change.test.ts` (4)

```ts
expect(jobPageSource).toContain("Change Service Location");
expect(jobPageSource).toContain("Use this if the job was created for the wrong saved address.");
expect(jobPageSource).toContain("action={changeJobServiceLocationFromForm}");
expect(jobPageSource).toContain("locations={serviceLocationOptions}");
```

### `return-visit-action-wiring.test.ts` (3)

```ts
expect(jobPageSource).toContain("Use when the original job is not finished yet and another visit is needed to complete it.");
expect(jobPageSource).toContain("Examples: waiting on a part, customer approval, or more time needed to complete the same job.");
expect(jobPageSource).toContain('id="next-service-action"');
```

### `internal-invoice-line-items-table-capability-wiring.test.ts` (1)

```ts
expect(jobDetailPageSource).toContain("Number(item.expected_unit_price).toFixed(2)");
```

### `invoice-tax-ui-wiring.test.ts` (1)

```ts
expect(jobPage).toContain('banner === "internal_invoice_invalid_tax_rate"');
```
