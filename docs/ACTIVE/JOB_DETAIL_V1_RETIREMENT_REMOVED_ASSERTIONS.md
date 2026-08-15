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

**225 assertions removed across 16 files.**

## Review priority

Capabilities present in the classic desktop layout with no V2 equivalent found:

- `Tech ID` header label — V2 never renders the raw job UUID (intentional; stronger than the old 'demote' behaviour).
- Service address edit affordance — present on mobile V2, **absent from V2 desktop**.
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

## Removed assertions by file

### `job-tests-page-wiring.test.ts` (94)

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
```

### `job-detail-field-billing-panel-wiring.test.ts` (26)

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
```

### `job-detail-field-outcome-panel-wiring.test.ts` (26)

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
```

### `callback-visit-action-wiring.test.ts` (13)

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

### `job-detail-workflow-milestones-wiring.test.ts` (8)

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
```

### `account-workshare-requests-ui-source.test.ts` (7)

```ts
expect(source).toContain("Send ECC/HERS Request");
expect(source).toContain("Send this job&apos;s ECC/HERS request to a connected rater account. This shares a safe request snapshot only. The rater will review it in a later step.");
expect(source).toContain("Rater account");
expect(source).toContain("Requested ECC/HERS scope");
expect(source).toContain("Notes for rater");
expect(source).toContain("Send request");
expect(source).toContain("ECC/HERS request sent to the connected rater.");
```

### `job-detail-mobile-assignment-parity.test.ts` (6)

```ts
expect(desktopPanelStart).toBeGreaterThan(-1);
expect(pageSource).toContain("const forceCurrentDesktopLayout =");
expect(desktopPanel).toContain("assignedTeam={assignedTeam}");
expect(desktopBranch).toContain("<AssignedTeamControls");
expect(desktopPanel).toContain("assignedUserIds={assignedUserIds}");
expect(desktopPanel).toContain("isInternalUser={isInternalUser}");
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
