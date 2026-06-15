import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const jobTestsPageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/tests/page.tsx"),
  "utf8",
);

const jobPageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf8",
);

const jobLocationPreviewSource = readFileSync(
  resolve(__dirname, "../../../components/jobs/JobLocationPreview.tsx"),
  "utf8",
);

const ductLeakageEntryFieldsSource = readFileSync(
  resolve(__dirname, "../../../components/jobs/DuctLeakageEntryFields.tsx"),
  "utf8",
);

const airflowEntryFieldsSource = readFileSync(
  resolve(__dirname, "../../../components/jobs/AirflowEntryFields.tsx"),
  "utf8",
);

const refrigerantChargeExceptionFieldsSource = readFileSync(
  resolve(__dirname, "../../../components/jobs/RefrigerantChargeExceptionFields.tsx"),
  "utf8",
);

const refrigerantChargeInlinePreviewSource = readFileSync(
  resolve(__dirname, "../../../components/jobs/RefrigerantChargeInlinePreview.tsx"),
  "utf8",
);

describe("job tests page wiring", () => {
  it("exposes Duct Leakage exception options and keeps exception reason free-form", () => {
    expect(jobTestsPageSource).toContain('{ value: "asbestos", label: "Asbestos" }');
    expect(jobTestsPageSource).toContain('{ value: "smoke_test", label: "Smoke Test" }');
    expect(jobTestsPageSource).toContain('{ value: "under_40_ft_ducting", label: "< 40\' of ducting" }');
    expect(jobTestsPageSource).toContain('{ value: "other", label: "Other" }');
    expect(ductLeakageEntryFieldsSource).toContain('name="duct_exception"');
    expect(ductLeakageEntryFieldsSource).toContain('name="override_reason"');
    expect(ductLeakageEntryFieldsSource).toContain('required');
    expect(jobTestsPageSource).not.toContain('<option value="fail">Asbestos</option>');
    expect(ductLeakageEntryFieldsSource).toContain('autoComplete="off"');
    expect(jobTestsPageSource).not.toContain('<datalist id={`ovr-reason-list-${runDL.id}`}>');
  });

  it("keeps Duct Leakage field-first layout without the extra calculated card", () => {
    const ductIndex = jobTestsPageSource.indexOf('Duct Leakage Results');
    expect(ductIndex).toBeGreaterThan(-1);

    const ductBlock = jobTestsPageSource.slice(
      ductIndex,
      jobTestsPageSource.indexOf('            AIRFLOW', ductIndex),
    );

    expect(ductBlock).toContain('DuctLeakageEntryFields');
    expect(ductBlock.indexOf('DuctLeakageEntryFields')).toBeLessThan(ductBlock.indexOf('Test Setup'));
    expect(ductLeakageEntryFieldsSource).toContain('Exception');
    const resultsEntryIndex = ductLeakageEntryFieldsSource.indexOf('Enter the measured duct leakage result');
    expect(resultsEntryIndex).toBeGreaterThan(-1);
    expect(ductLeakageEntryFieldsSource.indexOf('Exception')).toBeLessThan(resultsEntryIndex);
    expect(ductLeakageEntryFieldsSource).toContain('Total Leakage %');
    expect(ductBlock).toContain('DuctLeakageEntryFields');
    expect(ductBlock).not.toContain('data-duct-exception-select');
    expect(ductBlock).not.toContain('data-duct-live-total');
    expect(ductBlock).not.toContain('Needs input - measured');
    expect(ductBlock).not.toContain('<script');
    expect(jobTestsPageSource).toContain('const isCompactTestWorkspace = isDuctLeakageFocused || isAirflowFocused || isRefrigerantChargeFocused;');
    expect(jobTestsPageSource).toContain('className={isCompletionReportFocused ? "space-y-4 print:space-y-0" : isCompactTestWorkspace ? "hidden" : "order-last print:order-none"}');
  });

  it("keeps Airflow field-first layout with exception and inline results", () => {
    const airflowIndex = jobTestsPageSource.indexOf('Airflow Results');
    expect(airflowIndex).toBeGreaterThan(-1);

    const airflowBlock = jobTestsPageSource.slice(
      airflowIndex,
      jobTestsPageSource.indexOf('            FAN WATT DRAW', airflowIndex),
    );

    expect(jobTestsPageSource).toContain('{ value: "best_obtainable", label: "Best Obtainable" }');
    expect(jobTestsPageSource).toContain('{ value: "other", label: "Other" }');
    expect(airflowEntryFieldsSource).toContain('name="airflow_exception"');
    expect(airflowEntryFieldsSource).toContain('name="airflow_exception_reason"');
    expect(airflowEntryFieldsSource).toContain('required');
    expect(airflowBlock).toContain('AirflowEntryFields');
    expect(jobTestsPageSource).toContain('secondaryHref={isCompactTestWorkspace ? (selectedSystemId ? withS(undefined, selectedSystemId) : baseHref) : undefined}');
    expect(jobTestsPageSource).toContain('secondaryLabel={isCompactTestWorkspace ? "Back to Tests" : undefined}');
    expect(airflowBlock).not.toContain('Back to Tests');
    expect(airflowBlock.indexOf('AirflowEntryFields')).toBeLessThan(airflowBlock.indexOf('Test Setup'));
    expect(airflowEntryFieldsSource.indexOf('Exception')).toBeLessThan(
      airflowEntryFieldsSource.indexOf('Enter measured total airflow'),
    );
    expect(airflowEntryFieldsSource).toContain('Required');
    expect(airflowBlock).not.toContain('EccLivePreview mode="airflow"');
    expect(airflowBlock).not.toContain('Airflow Override Pass');
    expect(airflowBlock).not.toContain('Needs input - measured');
    expect(jobTestsPageSource).toContain('const isCompactTestWorkspace = isDuctLeakageFocused || isAirflowFocused || isRefrigerantChargeFocused;');
    expect(jobTestsPageSource).toContain('className={`${isCompactTestWorkspace || isCompletionReportFocused ? "hidden" : "space-y-3"} sm:hidden print:hidden`}');
  });

  it("keeps Refrigerant Charge as a vertical field-entry workspace", () => {
    const refrigerantIndex = jobTestsPageSource.indexOf('Refrigerant Charge Results');
    expect(refrigerantIndex).toBeGreaterThan(-1);

    const refrigerantBlock = jobTestsPageSource.slice(
      refrigerantIndex,
      jobTestsPageSource.indexOf('      </section>', refrigerantIndex),
    );

    expect(jobTestsPageSource).toContain('const isRefrigerantChargeFocused = focusedType === "refrigerant_charge";');
    expect(refrigerantBlock).toContain('Enter readings top to bottom in field order.');
    expect(refrigerantBlock).toContain('RefrigerantChargeExceptionFields');
    expect(refrigerantBlock).toContain('RefrigerantChargeInlinePreview formId={rcSaveFormId} kind="subcool"');
    expect(refrigerantBlock).toContain('RefrigerantChargeInlinePreview formId={rcSaveFormId} kind="superheat"');
    expect(refrigerantChargeExceptionFieldsSource).toContain('name="rc_exception"');
    expect(refrigerantChargeExceptionFieldsSource).toContain('No exception');
    expect(refrigerantChargeExceptionFieldsSource).toContain('Package unit');
    expect(refrigerantChargeExceptionFieldsSource).toContain('Conditions not met / weather');
    expect(refrigerantChargeExceptionFieldsSource).toContain('Photo Taken');
    expect(refrigerantChargeExceptionFieldsSource).toContain('name="rc_photo_taken"');
    expect(refrigerantChargeExceptionFieldsSource).toContain('name="rc_override_details"');
    expect(refrigerantChargeExceptionFieldsSource).toContain('required');
    expect(refrigerantChargeExceptionFieldsSource).toContain('showEvidence ? children : null');
    expect(refrigerantChargeInlinePreviewSource).toContain('const SUBCOOL_TOLERANCE_F = 3');
    expect(refrigerantChargeInlinePreviewSource).toContain('const SUPERHEAT_MAX_F = 25');
    expect(refrigerantChargeInlinePreviewSource).toContain('condenserSat - liquidLineTemp');
    expect(refrigerantChargeInlinePreviewSource).toContain('suctionTemp - evaporatorSat');
    expect(refrigerantChargeInlinePreviewSource).toContain('Math.abs(measured - targetSubcool) <= SUBCOOL_TOLERANCE_F');
    expect(refrigerantChargeInlinePreviewSource).toContain('measured < SUPERHEAT_MAX_F');
    expect(refrigerantBlock).toContain('Lowest Return Air Dry Bulb');
    expect(refrigerantBlock).toContain('Condenser Air Entering DB');
    expect(refrigerantBlock).toContain('Liquid Line Temp');
    expect(refrigerantBlock).toContain('Liquid Line Pressure');
    expect(refrigerantBlock).toContain('Condenser Saturation Temp');
    expect(refrigerantBlock).toContain('Target Subcool');
    expect(refrigerantBlock).toContain('Suction Line Temp');
    expect(refrigerantBlock).toContain('Suction Line Pressure');
    expect(refrigerantBlock).toContain('Evaporator Saturation Temp');
    expect(refrigerantChargeInlinePreviewSource).toContain('Measured Subcool');
    expect(refrigerantChargeInlinePreviewSource).toContain('Measured Superheat');
    expect(refrigerantBlock).toContain('Photo Taken records the field attestation.');
    expect(refrigerantBlock).toContain('Attach refrigerant charge photo');
    expect(refrigerantBlock).not.toContain('Photo / Notes');
    expect(refrigerantBlock).not.toContain('Photo Taken - user attests gauge photo was captured');
    expect(refrigerantBlock).not.toContain('EccLivePreview mode="refrigerant_charge"');
    expect(refrigerantBlock).not.toContain('className="mt-3 grid grid-cols-2 gap-2 text-center"');
    expect(refrigerantBlock).not.toContain('className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"');
    expect(refrigerantBlock).not.toContain('id={`out-${runRC.id}`}');
  });

  it("opens Completion Report as a report-first print view", () => {
    expect(jobTestsPageSource).toContain('const isCompletionReportFocused = focused === "completion_report";');
    expect(jobTestsPageSource).toContain('!isCompletionReportFocused ? (');
    expect(jobTestsPageSource).toContain('isCompactTestWorkspace || isCompletionReportFocused ? "hidden" : "space-y-3"');
    expect(jobTestsPageSource).toContain('href={withS("completion_report", selectedSystemId)}');
    expect(jobTestsPageSource).toContain('isCompletionReportFocused ? "space-y-4 print:space-y-0"');
    expect(jobTestsPageSource).toContain('Completion Report');
    expect(jobTestsPageSource).toContain('label="Print"');
    expect(jobTestsPageSource).toContain('label="Download"');
    expect(jobTestsPageSource).toContain('isCompletionReportFocused ? "block space-y-4 print:block print:space-y-0"');
    expect(jobTestsPageSource).toContain('isCompletionReportFocused ? "hidden" : eccPanelClass');
  });

  it("adds completion-report cert closeout through the existing job ops action path", () => {
    expect(jobTestsPageSource).toContain('import { markCertsCompleteFromForm } from "@/lib/actions/job-ops-actions";');
    expect(jobTestsPageSource).toContain("const canShowCompletionReportCertsSentAction =");
    expect(jobTestsPageSource).toContain("isCompletionReportFocused");
    expect(jobTestsPageSource).toContain("isInternalUser");
    expect(jobTestsPageSource).toContain("isEccJobType(job.job_type)");
    expect(jobTestsPageSource).toContain("!Boolean(job.certs_complete)");
    expect(jobTestsPageSource).toContain("!isCompletionReportCertCloseoutBlocked");
    expect(jobTestsPageSource).not.toContain("hasSelectedCompletionReportPass");
    expect(jobTestsPageSource).toContain("<form action={markCertsCompleteFromForm}>");
    expect(jobTestsPageSource).toContain('name="return_to" value={completionReportReturnTo}');
    expect(jobTestsPageSource).toContain("Certs Sent");
  });

  it("shows passive cert status on the completion report once certs are already sent", () => {
    expect(jobTestsPageSource).toContain("const showCompletionReportCertsSentStatus =");
    expect(jobTestsPageSource).toContain("Boolean(job.certs_complete)");
    expect(jobTestsPageSource).toContain("showCompletionReportCertsSentStatus ? (");
    expect(jobTestsPageSource).toContain("Certs sent");
  });

  it("suppresses completion-report cert closeout for failed, retest, and correction-review states", () => {
    expect(jobTestsPageSource).toContain(
      'const isFailedOrRetestState = ["failed", "retest_needed", "pending_office_review"].includes(normalizedOpsStatus);',
    );
    expect(jobTestsPageSource).toContain("const hasCompletedFailedEccRun = (job.ecc_test_runs ?? []).some");
    expect(jobTestsPageSource).toContain('event_type", "failure_resolved_by_correction_review"');
    expect(jobTestsPageSource).toContain("const isCompletionReportCertCloseoutBlocked =");
    expect(jobTestsPageSource).toContain("hasCompletedFailedEccRun && !hasCorrectionReviewResolution");
    expect(jobTestsPageSource).toContain('row.status.state === "fail" || row.status.state === "fail_override" || row.status.state === "unknown"');
  });

  it("renders concise Refrigerant Charge report statuses instead of blank field rows", () => {
    expect(jobTestsPageSource).toContain("function refrigerantConciseReportStatus(run: any)");
    expect(jobTestsPageSource).toContain('return "Refrigerant Charge Test Still Open";');
    expect(jobTestsPageSource).toContain('return "Refrigerant charge documented by photo.";');
    expect(jobTestsPageSource).toContain('return "Temperature requirements were not met.";');
    expect(jobTestsPageSource).toContain("const rcConciseReportStatus = refrigerantConciseReportStatus(sys.runRefrigerant);");
    expect(jobTestsPageSource).toContain(") : rcConciseReportStatus ? (");
    expect(jobTestsPageSource).toContain("{rcConciseReportStatus}");
  });

  it("keeps completed numeric Refrigerant Charge report values in the detailed measured and target rows", () => {
    const conciseIndex = jobTestsPageSource.indexOf(") : rcConciseReportStatus ? (");
    const numericIndex = jobTestsPageSource.indexOf("Measured Subcooling:", conciseIndex);

    expect(conciseIndex).toBeGreaterThanOrEqual(0);
    expect(numericIndex).toBeGreaterThan(conciseIndex);
    expect(jobTestsPageSource).toContain("function hasRefrigerantNumericReportValues(run: any)");
    expect(jobTestsPageSource).toContain("computed.measured_subcool_f");
    expect(jobTestsPageSource).toContain("computed.measured_superheat_f");
    expect(jobTestsPageSource).toContain("Target Subcooling from Manufacturer:");
    expect(jobTestsPageSource).toContain("Measured Superheat:");
  });

  it("keeps the mobile test hub matrix focused on actions and visible system chips", () => {
    expect(jobTestsPageSource).not.toContain('Test Queue');
    expect(jobTestsPageSource).not.toContain('<summary className="flex min-h-14 cursor-pointer list-none items-center justify-center text-base font-semibold text-slate-950">\n              Systems');
    expect(jobTestsPageSource).toContain('Completion Report');
    expect(jobTestsPageSource).toContain('systems.length > 1 ? (');
    expect(jobTestsPageSource).toContain('System Label');
    expect(jobTestsPageSource).toContain('className="mt-2 flex gap-2 overflow-x-auto pb-1"');
    expect(jobTestsPageSource).toContain('inline-flex min-h-10 shrink-0 items-center rounded-full');
    expect(jobTestsPageSource).toContain('href={withS(focusedType || undefined, String(sys.id))}');
    expect(jobTestsPageSource).toContain('<div className="mt-1 text-sm font-semibold text-slate-950">{selectedSystemName}</div>');
    expect(jobTestsPageSource).not.toContain('Report tools are secondary during active field entry.');
    expect(jobTestsPageSource).not.toContain('Expand report');
  });

  it("starts a not-yet-created mobile next test through the create-run action", () => {
    expect(jobTestsPageSource).toContain('const mobileNextTestRequiresRun =');
    expect(jobTestsPageSource).toContain('mobileNextTestRow?.status?.state === "required"');
    expect(jobTestsPageSource).toContain('mobileNextTestRequiresRun ? (');
    expect(jobTestsPageSource).toContain('<form action={addEccTestRunFromForm}>');
    expect(jobTestsPageSource).toContain('name="test_type" value={mobileNextTestType}');
    expect(jobTestsPageSource).toContain("Continue {mobileNextTestLabel}");
  });

  it("shows save and completion recognition on the focused ECC test page", () => {
    expect(jobTestsPageSource).toContain('notice === "results_saved" || notice === "test_completed"');
    expect(jobTestsPageSource).toContain('notice === "test_completed" ? "Test completed." : "Results saved."');
    expect(jobTestsPageSource).toContain("Review the completed test here, or return to the test matrix when ready.");
    expect(jobTestsPageSource).toContain("Your latest entries were saved. You can keep editing or return to the test matrix.");
    expect(jobTestsPageSource).toContain("Back to Tests");
  });
});

describe("job detail field operations board layout", () => {
  it("keeps the service location chip over the image area", () => {
    expect(jobPageSource).toContain('className="bg-slate-100 p-3"');
    expect(jobPageSource).toContain('Service Location');
    expect(jobPageSource).not.toContain('bg-slate-100 p-3 pt-10');
  });

  it("labels account, access, and billing context clearly", () => {
    expect(jobPageSource).toContain("Responsible Account");
    expect(jobPageSource).toContain("Site / Access Contact");
    expect(jobPageSource).toContain("Billing");
    expect(jobPageSource).toContain("Phone:");
    expect(jobPageSource).toContain("Email:");
    expect(jobPageSource).toContain("Access phone");
    expect(jobPageSource).toContain("billingRecipientEmail");
  });

  it("suppresses duplicate default cards and keeps billing-context hint copy", () => {
    expect(jobPageSource).toContain("const showSiteAccessCard = hasSeparateSiteAccessContact && !siteAccessMatchesAccount;");
    expect(jobPageSource).not.toContain("Same as responsible account");
    expect(jobPageSource).not.toContain("No separate site/access contact saved");
    expect(jobPageSource).not.toContain("Defaults to responsible account");
    expect(jobPageSource).toContain("Billing contact on account");
    expect(jobPageSource).toContain("Invoice routing still follows the job/invoice billing recipient fields.");
  });

  it("keeps custom and contractor billing recipient display branches", () => {
    expect(jobPageSource).toContain("const hasBillingSnapshotFields = Boolean(");
    expect(jobPageSource).toContain("const isContractorBillingRecipient = billingRecipientType === \"contractor\";");
    expect(jobPageSource).toContain("Contractor / Billing");
    expect(jobPageSource).toContain("billingRecipientAddressParts");
  });

  it("keeps account and access action buttons available with compact labels", () => {
    expect(jobPageSource).toContain("Account Contact");
    expect(jobPageSource).toContain("const accountEmailLink =");
    expect(jobPageSource).toContain("mailto:");
    expect(jobPageSource).toContain("Call");
    expect(jobPageSource).toContain("Text");
    expect(jobPageSource).toContain("Email");
    expect(jobPageSource).toContain("Access Call");
    expect(jobPageSource).toContain("Access Text");
    expect(jobPageSource).not.toContain("Call account phone");
    expect(jobPageSource).not.toContain("Text account phone");
    expect(jobPageSource).not.toContain("Open Map");
  });

  it("uses a field-first job command header instead of the job title as the main heading", () => {
    expect(jobPageSource).toContain("const fieldHeaderTitle =");
    expect(jobPageSource).toContain("{fieldHeaderTitle}");
    expect(jobPageSource).toContain("primarySiteAccessName");
    expect(jobPageSource).toContain("?? \"Job Detail\"");
    expect(jobPageSource).not.toContain('{normalizeRetestLinkedJobTitle(job.title) || "Operational job workspace"}');
  });

  it("keeps visit reason and intake notes below the location preview", () => {
    expect(jobPageSource).toContain("Visit Reason");
    expect(jobPageSource).toContain("const visitReasonText =");
    expect(jobPageSource).toContain("{visitReasonText}");
    expect(jobPageSource).toContain('id="visit-reason-card"');
    expect(jobPageSource).toContain('id="mobile-visit-reason-card"');
    expect(jobPageSource).toContain("updateJobVisitScopeFromForm");
    expect(jobPageSource).toContain('name="visit_scope_summary"');
    expect(jobPageSource).toContain('name="visit_scope_items_json" value={visitScopeItemsJsonForInlineEdit}');
    expect(jobPageSource).toContain("Customer Concern");
    expect(jobPageSource).toContain("Intake Notes");
    expect(jobPageSource).toContain("whitespace-pre-wrap break-words");
  });

  it("does not duplicate intake note in right notes card and keeps honest empty-state copy", () => {
    const jobNotesCardStart = jobPageSource.indexOf("<ChatIcon className=\"h-3.5 w-3.5\" />{rightRailNotesTitle}</div>");
    const jobNotesCardEnd = jobPageSource.indexOf('id="next-service-action"', jobNotesCardStart);
    const jobNotesCardSlice =
      jobNotesCardStart > -1 && jobNotesCardEnd > jobNotesCardStart
        ? jobPageSource.slice(jobNotesCardStart, jobNotesCardEnd)
        : "";

    expect(jobPageSource).toContain("Intake Notes");
    expect(jobNotesCardSlice).not.toContain("Intake note");
    expect(jobPageSource).toContain("const rightRailNotesEmptyText = isEccJobType ? \"No shared or internal notes yet.\" : \"No notes yet.\";");
    expect(jobPageSource).toContain("<ChatIcon className=\"h-3.5 w-3.5\" />{rightRailNotesTitle}</div>");
    expect(jobPageSource).not.toContain("Notes & Comments");
    expect(jobNotesCardSlice).not.toContain("Follow-up note");
    expect(jobPageSource).toContain("View / Add Notes");
  });

  it("uses service-safe wording in top notes card and keeps shared wording ECC-only", () => {
    expect(jobPageSource).toContain("const isEccJobType = job.job_type === \"ecc\";");
    expect(jobPageSource).toContain("const rightRailNotesTitle = isEccJobType ? \"Shared Notes\" : \"Job Notes\";");
    expect(jobPageSource).toContain("const rightRailNotesSubtitle = isEccJobType");
    expect(jobPageSource).toContain("? \"Latest shared/internal note activity.\"");
    expect(jobPageSource).toContain(": \"Latest job note activity.\";");
    expect(jobPageSource).toContain("const rightRailNotesEmptyText = isEccJobType ? \"No shared or internal notes yet.\" : \"No notes yet.\";");
  });

  it("keeps work needed after visit reason on mobile while spanning the desktop grid", () => {
    const visitReasonIndex = jobPageSource.indexOf("Visit Reason");
    const visitScopeIndex = jobPageSource.indexOf('id="visit-scope-section"');
    const rightRailIndex = jobPageSource.indexOf("Right: quick reference rail");
    const assignedTeamIndex = jobPageSource.indexOf('id="assigned-team"');

    expect(visitReasonIndex).toBeGreaterThan(-1);
    expect(visitScopeIndex).toBeGreaterThan(visitReasonIndex);
    expect(assignedTeamIndex).toBeGreaterThan(-1);
    expect(assignedTeamIndex).toBeLessThan(visitScopeIndex);
    expect(rightRailIndex).toBeGreaterThan(visitScopeIndex);
    expect(jobPageSource).toContain("xl:order-4 xl:col-span-3");
    expect(jobPageSource).toContain("space-y-3 xl:order-3");
  });

  it("shows every saved Work Scope item on mobile without a hidden more-items summary", () => {
    const mobileWorkScopeStart = jobPageSource.indexOf('id="mobile-work-scope"');
    const mobileNotesStart = jobPageSource.indexOf('id="mobile-notes-hub"', mobileWorkScopeStart);
    const mobileWorkScopeSlice =
      mobileWorkScopeStart > -1 && mobileNotesStart > mobileWorkScopeStart
        ? jobPageSource.slice(mobileWorkScopeStart, mobileNotesStart)
        : "";

    expect(mobileWorkScopeSlice).toContain("{visitScopeItems.map((item, index) => (");
    expect(mobileWorkScopeSlice).not.toContain("primaryVisitScopeItems.slice(0, 2)");
    expect(mobileWorkScopeSlice).not.toContain("more work item");
    expect(mobileWorkScopeSlice).toContain("formatVisitScopeItemKindLabel(item.kind)");
    expect(mobileWorkScopeSlice).toContain("Number(item.expected_unit_price).toFixed(2)");
  });

  it("keeps post-build invoice state visible in the mobile Work & Invoice section", () => {
    const mobileWorkScopeStart = jobPageSource.indexOf('id="mobile-work-scope"');
    const mobileNotesStart = jobPageSource.indexOf('id="mobile-notes-hub"', mobileWorkScopeStart);
    const mobileWorkScopeSlice =
      mobileWorkScopeStart > -1 && mobileNotesStart > mobileWorkScopeStart
        ? jobPageSource.slice(mobileWorkScopeStart, mobileNotesStart)
        : "";

    expect(mobileWorkScopeSlice).toContain('id="mobile-invoice-summary-card"');
    expect(mobileWorkScopeSlice).toContain("{jobPageInvoiceStateLabel}");
    expect(mobileWorkScopeSlice).toContain("{jobPageInvoiceSummaryText}");
    expect(mobileWorkScopeSlice).toContain("{jobPageInvoiceNextAction}");
    expect(mobileWorkScopeSlice).toContain('/invoice#invoice-workspace');
    expect(mobileWorkScopeSlice).toContain("internalInvoiceTruth ? (");
    expect(mobileWorkScopeSlice).toContain("createInternalInvoiceDraftFromForm");
  });

  it("keeps mobile Visit Reason editing aligned inside the Visit Reason card", () => {
    const mobileVisitReasonStart = jobPageSource.indexOf('id="mobile-visit-reason-card"');
    const mobileVisitReasonEnd = jobPageSource.indexOf("{visitScopeItems.map((item, index) => (", mobileVisitReasonStart);
    const mobileVisitReasonSlice =
      mobileVisitReasonStart > -1 && mobileVisitReasonEnd > mobileVisitReasonStart
        ? jobPageSource.slice(mobileVisitReasonStart, mobileVisitReasonEnd)
        : "";

    expect(mobileVisitReasonSlice).toContain('<details className="group">');
    expect(mobileVisitReasonSlice).toContain('className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-3 shadow-sm"');
    expect(mobileVisitReasonSlice).toContain('className="mt-3 grid grid-cols-2 gap-2"');
    expect(mobileVisitReasonSlice).toContain('inline-flex min-h-10 items-center justify-center rounded-xl');
    expect(mobileVisitReasonSlice).toContain('name="visit_scope_summary"');
    expect(mobileVisitReasonSlice).toContain('name="visit_scope_items_json" value={visitScopeItemsJsonForInlineEdit}');
  });

  it("removes the mobile Tools jump button while preserving lower tools", () => {
    const mobileWorkScopeStart = jobPageSource.indexOf('id="mobile-work-scope"');
    const mobileNotesStart = jobPageSource.indexOf('id="mobile-notes-hub"', mobileWorkScopeStart);
    const mobileWorkScopeSlice =
      mobileWorkScopeStart > -1 && mobileNotesStart > mobileWorkScopeStart
        ? jobPageSource.slice(mobileWorkScopeStart, mobileNotesStart)
        : "";

    expect(mobileWorkScopeSlice).not.toContain('href="#mobile-tools"');
    expect(mobileWorkScopeSlice).not.toContain(">Tools");
    expect(jobPageSource).toContain('id="mobile-tools"');
    expect(jobPageSource).toContain("More Details / Tools");
  });

  it("keeps the location preview compact on mobile and hides lower map actions there", () => {
    expect(jobLocationPreviewSource).toContain("h-40 w-full object-cover");
    expect(jobLocationPreviewSource).toContain("sm:h-52 lg:h-56 xl:h-60");
    expect(jobLocationPreviewSource).toContain("mt-3 hidden flex-col gap-2 sm:flex");
    expect(jobLocationPreviewSource).toContain("border border-gray-300 bg-white");
    expect(jobPageSource).toContain("h-40 w-full animate-pulse");
    expect(jobPageSource).toContain("mt-3 hidden flex-col gap-2 sm:flex");
    expect(jobPageSource).toContain("Navigate");
    expect(jobPageSource).toContain("Open in Maps");
  });

  it("deduplicates mobile Service Location address and navigation actions", () => {
    const mobileLocationStart = jobPageSource.indexOf("<span>Service Location</span>");
    const mobileLocationEnd = jobPageSource.indexOf('id="mobile-work-scope"', mobileLocationStart);
    const mobileLocationSlice =
      mobileLocationStart > -1 && mobileLocationEnd > mobileLocationStart
        ? jobPageSource.slice(mobileLocationStart, mobileLocationEnd)
        : "";

    expect(mobileLocationSlice).toContain("showAddressOverlay");
    expect(mobileLocationSlice).toContain("showAddressFooter");
    expect(mobileLocationSlice).toContain("showActionsOnMobile");
    expect(mobileLocationSlice).not.toContain("{serviceAddressDisplay}");
    expect(mobileLocationSlice).not.toContain("mobileNavigateHref");
    expect(mobileLocationSlice).not.toContain("<span>Navigate</span>");
    expect(jobLocationPreviewSource).toContain("showActionsOnMobile?: boolean");
    expect(jobLocationPreviewSource).toContain('props.showActionsOnMobile ? "mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch sm:justify-between"');
    expect(jobLocationPreviewSource).toContain("props.showAddressOverlay && imageUrl && addressDisplay");
    expect(jobLocationPreviewSource).toContain("(!props.showAddressOverlay || !imageUrl) && props.showAddressFooter");
    expect(jobLocationPreviewSource).toContain("Navigate");
    expect(jobLocationPreviewSource).toContain("Open in Maps");
  });

  it("keeps permit quick reference in the top rail", () => {
    const permitQuickRefIndex = jobPageSource.indexOf("><ClipboardIcon className=\"h-3.5 w-3.5\" />Permit Quick Ref</div>");

    expect(jobPageSource).toContain("Permit Quick Ref");
    expect(jobPageSource).toContain("Permit number");
    expect(permitQuickRefIndex).toBeGreaterThan(-1);
  });

  it("restores ECC summary, permit details, and equipment inside lower job records section", () => {
    const recordsSectionIndex = jobPageSource.indexOf("Job Details & Records");
    const recordsGridIndex = jobPageSource.indexOf('grid grid-cols-1 items-start gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-4', recordsSectionIndex);
    const lowerEccSummaryIndex = jobPageSource.indexOf('title="ECC Summary"', recordsGridIndex);
    const lowerPermitIndex = jobPageSource.indexOf('title="Permit Details"', recordsGridIndex);
    const lowerEquipmentIndex = jobPageSource.indexOf('title="Equipment"', recordsGridIndex);
    const attachmentsIndex = jobPageSource.indexOf('title="Attachments"', recordsGridIndex);

    expect(recordsSectionIndex).toBeGreaterThan(-1);
    expect(recordsGridIndex).toBeGreaterThan(recordsSectionIndex);
    expect(lowerEccSummaryIndex).toBeGreaterThan(recordsGridIndex);
    expect(lowerPermitIndex).toBeGreaterThan(lowerEccSummaryIndex);
    expect(lowerEquipmentIndex).toBeGreaterThan(lowerPermitIndex);
    expect(attachmentsIndex).toBeGreaterThan(lowerEquipmentIndex);
    expect(jobPageSource).toContain("showEccSummaryCard = job.job_type === \"ecc\"");
    expect(jobPageSource).toContain("showJobRecordsPermitCard = showEccSummaryCard || hasPermitDetails");
    expect(jobPageSource).toContain("Manage Equipment");
  });

  it("keeps ECC summary gated to ECC jobs while preserving permit and equipment cards", () => {
    expect(jobPageSource).toContain('{showEccSummaryCard ? (');
    expect(jobPageSource).toContain('title="ECC Summary"');
    expect(jobPageSource).toContain('{showJobRecordsPermitCard ? (');
    expect(jobPageSource).toContain('title="Permit Details"');
    expect(jobPageSource).toContain('title="Equipment"');
  });

  it("keeps notes rail action near top with no follow-up shortcut", () => {
    const jobNotesCardStart = jobPageSource.indexOf("<ChatIcon className=\"h-3.5 w-3.5\" />{rightRailNotesTitle}</div>");
    const jobNotesCardEnd = jobPageSource.indexOf('id="next-service-action"', jobNotesCardStart);
    const jobNotesCardSlice =
      jobNotesCardStart > -1 && jobNotesCardEnd > jobNotesCardStart
        ? jobPageSource.slice(jobNotesCardStart, jobNotesCardEnd)
        : "";

    expect(jobPageSource).toContain("rightRailNotesTitle");
    expect(jobPageSource).toContain('id="internal-notes"');
    expect(jobPageSource).toContain("DeferredInternalNoteMentionComposer");
    expect(jobPageSource).toContain("DeferredInternalNotesBody");
    expect(jobNotesCardSlice).not.toContain('href="#follow-up"');
    expect(jobPageSource).toContain("View / Add Notes");
  });

  it("keeps job notes in the top rail instead of a duplicate lower record card", () => {
    const topNotesIndex = jobPageSource.indexOf('id="internal-notes"');
    const recordsSectionIndex = jobPageSource.indexOf("Job Details & Records");

    expect(topNotesIndex).toBeGreaterThan(-1);
    expect(topNotesIndex).toBeLessThan(recordsSectionIndex);
    expect(jobPageSource).not.toContain('details id="internal-notes" className={jobRecordsDetailsClass}');
    expect(jobPageSource).not.toContain("title={internalNotesTitle}");
  });

  it("gates callback creation until the anchor job is believed complete", () => {
    const callbackGateIndex = jobPageSource.indexOf("{callbackIntakeHistoricalAnchorEligible ? (");
    const callbackTitleIndex = jobPageSource.indexOf("Create Callback Visit", callbackGateIndex);

    expect(callbackGateIndex).toBeGreaterThan(-1);
    expect(callbackTitleIndex).toBeGreaterThan(callbackGateIndex);
    expect(jobPageSource).not.toContain("Callback visit creation is available for service jobs that are field-complete, completed, or closed.");
  });

  it("keeps Next Service Action separate from Work & Invoice", () => {
    const workInvoiceIndex = jobPageSource.indexOf("Work & Invoice");
    const nextServiceIndex = jobPageSource.indexOf('id="next-service-action"');
    const workInvoiceSectionEnd = jobPageSource.indexOf("{/* Right: quick reference rail */}", workInvoiceIndex);

    expect(workInvoiceIndex).toBeGreaterThan(-1);
    expect(nextServiceIndex).toBeGreaterThan(workInvoiceSectionEnd);
    expect(jobPageSource).toContain("Next Service Action");
    expect(jobPageSource).toContain("Create Return Visit");
  });

  it("consolidates Job Details and Job Status inside the Job Details & Records grid", () => {
    const recordsSectionIndex = jobPageSource.indexOf("Job Details & Records");
    const recordsGridIndex = jobPageSource.indexOf('grid grid-cols-1 items-start gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-4', recordsSectionIndex);
    const editJobIndex = jobPageSource.indexOf('href="#edit-job" data-record-launcher="edit-job"', recordsGridIndex);
    const jobStatusIndex = jobPageSource.indexOf('href="#job-status" data-record-launcher="job-status"', recordsGridIndex);
    const equipmentIndex = jobPageSource.indexOf('title="Equipment"', recordsGridIndex);
    const attachmentsIndex = jobPageSource.indexOf('title="Attachments"', recordsGridIndex);
    const followUpIndex = jobPageSource.indexOf('title="Follow Up"', recordsGridIndex);
    const followUpHistoryIndex = jobPageSource.indexOf('title="Follow-Up History"', recordsGridIndex);
    const timelineIndex = jobPageSource.indexOf("title={timelineTitle}", recordsGridIndex);
    const serviceChainIndex = jobPageSource.indexOf('title="Service Chain"', recordsGridIndex);

    expect(recordsSectionIndex).toBeGreaterThan(-1);
    expect(recordsGridIndex).toBeGreaterThan(recordsSectionIndex);
    expect(editJobIndex).toBeGreaterThan(recordsGridIndex);
    expect(jobStatusIndex).toBeGreaterThan(editJobIndex);
    expect(equipmentIndex).toBeGreaterThan(jobStatusIndex);
    expect(attachmentsIndex).toBeGreaterThan(equipmentIndex);
    expect(followUpIndex).toBeGreaterThan(attachmentsIndex);
    expect(followUpHistoryIndex).toBeGreaterThan(followUpIndex);
    expect(timelineIndex).toBeGreaterThan(followUpHistoryIndex);
    expect(serviceChainIndex).toBeGreaterThan(timelineIndex);
    expect(jobPageSource).toContain('title="Job Details"');
    expect(jobPageSource).toContain('title="Job Status"');
    expect(jobPageSource).toContain("Details, status, equipment, attachments, follow-up, and history.");
    expect(jobPageSource).toContain("[&[open]]:xl:col-span-2");
    expect(jobPageSource).not.toContain('<div className="mb-4 grid grid-cols-1 items-start gap-2 sm:gap-3 xl:grid-cols-2">');
    expect(jobPageSource).not.toContain('<details id="edit-job" className={`${workspaceDetailsClass} mb-6`}>');
    expect(jobPageSource).not.toContain('<details id="job-status" className={`${workspaceDetailsClass} mb-6');
  });

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

    expect(recordsSectionIndex).toBeGreaterThan(-1);
    expect(sharedPanelIndex).toBeGreaterThan(recordsGridIndex);
    expect(jobPageSource).toContain("const recordLauncherClass =");
    expect(jobPageSource).toContain("const recordPanelClass =");
    expect(jobPageSource).toContain("#job-record-detail-panel > [data-record-panel] { display: none; }");
    expect(jobPageSource).toContain("#job-record-detail-panel > [data-record-panel]:target { display: block; }");
    expect(jobPageSource).toContain('data-record-panel="edit-job"');
    expect(jobPageSource).toContain('data-record-panel="job-status"');
    expect(jobPageSource).toContain('data-record-panel="job-record-equipment"');
    expect(jobPageSource).toContain('data-record-panel="job-record-attachments"');
    expect(jobPageSource).toContain('data-record-panel="follow-up"');
    expect(jobPageSource).toContain('data-record-panel="job-record-follow-up-history"');
    expect(jobPageSource).toContain('data-record-panel="job-record-timeline"');
    expect(jobPageSource).toContain('data-record-panel="service-chain"');
    expect(gridSlice).not.toContain("Save Scheduling");
    expect(gridSlice).not.toContain("Manage Equipment");
    expect(gridSlice).not.toContain("DeferredJobAttachmentsInternal");
    expect(jobPageSource).toContain('href="#job-details-records" className={recordCloseButtonClass}>Close</a>');
    expect(jobPageSource).toContain('import EquipmentEditCard from "./_components/EquipmentEditCard";');
    expect(jobPageSource).toContain('import EquipmentCreateForm from "./_components/EquipmentCreateForm";');
    expect(jobPageSource).toContain("job_systems");
    expect(jobPageSource).toContain("<EquipmentEditCard");
    expect(jobPageSource).toContain("<EquipmentCreateForm");
    expect(jobPageSource).toContain("No equipment captured yet");
    expect(jobPageSource).toContain('#job-details-records:has(#edit-job:target) [data-record-launcher="edit-job"]');
    expect(panelSlice).toContain("Selected record panel");
  });

  it("keeps the Job Status shared panel focused on lifecycle and interrupt state", () => {
    const jobStatusPanelStart = jobPageSource.indexOf('data-record-panel="job-status"');
    const jobStatusPanelEnd = jobPageSource.indexOf('data-record-panel="job-record-equipment"', jobStatusPanelStart);
    const jobStatusPanelSlice =
      jobStatusPanelStart > -1 && jobStatusPanelEnd > jobStatusPanelStart
        ? jobPageSource.slice(jobStatusPanelStart, jobStatusPanelEnd)
        : "";

    expect(jobStatusPanelSlice).toContain("Current lifecycle");
    expect(jobStatusPanelSlice).toContain("{formatOpsStatusLabel(job.ops_status)}");
    expect(jobStatusPanelSlice).toContain("InterruptStateFields");
    expect(jobStatusPanelSlice).toContain("initialInterruptState={currentInterruptState");
    expect(jobStatusPanelSlice).toContain("initialStatusReason={initialInterruptReason}");
    expect(jobStatusPanelSlice).toContain('className="space-y-4 rounded-xl border border-slate-200/80 bg-white/96 p-4"');
    expect(jobStatusPanelSlice).toContain('className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/80 pt-3"');
    expect(jobStatusPanelSlice).toContain("Save Interrupt State");
    expect(jobStatusPanelSlice).not.toContain("TimedServiceStatusActions");
    expect(jobStatusPanelSlice).not.toContain("Service Closeout");
  });

  it("includes location-linked contacts in site/access resolution priority", () => {
    expect(jobPageSource).toContain('linkedEntityType: "location"');
    expect(jobPageSource).toContain('["job", 0]');
    expect(jobPageSource).toContain('["location", 1]');
    expect(jobPageSource).toContain('["customer", 2]');
    expect(jobPageSource).not.toContain('["billing_contact", 5]');
  });
});
