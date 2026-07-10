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

const mobileJobDetailCurrentSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/MobileJobDetailCurrent.tsx"),
  "utf8",
);

const mobileJobSchedulePanelSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/MobileJobSchedulePanel.tsx"),
  "utf8",
);

const mobileJobWorkScopePanelSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/MobileJobWorkScopePanel.tsx"),
  "utf8",
);

const jobLocationPreviewSource = readFileSync(
  resolve(__dirname, "../../../components/jobs/JobLocationPreview.tsx"),
  "utf8",
);

const jobLocationPreviewImageSource = readFileSync(
  resolve(__dirname, "../../../components/jobs/JobLocationPreviewImage.tsx"),
  "utf8",
);

const jobAttachmentsInternalSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/JobAttachmentsInternal.tsx"),
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

const fanWattDrawInlinePreviewSource = readFileSync(
  resolve(__dirname, "../../../components/jobs/FanWattDrawInlinePreview.tsx"),
  "utf8",
);

const refrigerantChargePhotoEvidencePanelSource = readFileSync(
  resolve(__dirname, "../../../components/jobs/RefrigerantChargePhotoEvidencePanel.tsx"),
  "utf8",
);

describe("job tests page wiring", () => {
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
    expect(ductLeakageEntryFieldsSource).not.toContain("const showMeasurementFields = !exceptionActive;");
    expect(ductLeakageEntryFieldsSource).toContain('name="measured_duct_leakage_cfm"');
    expect(ductLeakageEntryFieldsSource).toContain("required={!exceptionActive}");
    expect(ductLeakageEntryFieldsSource).toContain("Exception details remain recorded for this test.");
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
    expect(airflowEntryFieldsSource).toContain("const exceptionRecordedText = selectedException ? `${selectedException.label} exception recorded` : \"\";");
    expect(airflowEntryFieldsSource).toContain('name="measured_total_cfm"');
    expect(airflowEntryFieldsSource).toContain("required={!exceptionActive}");
    expect(airflowEntryFieldsSource).toContain("{exceptionRecordedText ? (");
    expect(airflowEntryFieldsSource).toContain('Enter measured total airflow when available. Exception details remain recorded for this test.');
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
    expect(refrigerantChargeExceptionFieldsSource).toContain('name="rc_documentation_method"');
    expect(refrigerantChargeExceptionFieldsSource).toContain('Enter readings');
    expect(refrigerantChargeExceptionFieldsSource).toContain('Photo evidence');
    expect(refrigerantChargeExceptionFieldsSource).toContain('Exception / Not applicable');
    expect(refrigerantChargeExceptionFieldsSource).toContain("const showNumericFields = documentationMethod === \"\";");
    expect(refrigerantChargeExceptionFieldsSource).toContain("document.getElementById(`rc-numeric-section-${runId}`)");
    expect(refrigerantChargeExceptionFieldsSource).toContain("numericSection.hidden = !showNumericFields");
    expect(refrigerantChargeExceptionFieldsSource).toContain('name="rc_exception"');
    expect(refrigerantChargeExceptionFieldsSource).toContain('Package unit');
    expect(refrigerantChargeExceptionFieldsSource).toContain('Conditions not met / weather');
    expect(refrigerantChargeExceptionFieldsSource).toContain('name="rc_photo_taken"');
    expect(refrigerantChargeExceptionFieldsSource).toContain('name="rc_photo_result"');
    expect(refrigerantChargeExceptionFieldsSource).toContain('Needs Review');
    expect(refrigerantChargeExceptionFieldsSource).toContain('name="rc_override_details"');
    expect(refrigerantChargeExceptionFieldsSource).toContain('required');
    expect(refrigerantChargeExceptionFieldsSource).toContain('showEvidence ? (');
    expect(refrigerantChargeExceptionFieldsSource).toContain('{children}');
    expect(refrigerantChargeInlinePreviewSource).toContain('const SUBCOOL_TOLERANCE_F = 3');
    expect(refrigerantChargeInlinePreviewSource).toContain('const SUPERHEAT_MAX_F = 25');
    expect(refrigerantChargeInlinePreviewSource).toContain('condenserSat - liquidLineTemp');
    expect(refrigerantChargeInlinePreviewSource).toContain('suctionTemp - evaporatorSat');
    expect(refrigerantChargeInlinePreviewSource).toContain('Math.abs(measured - targetSubcool) <= SUBCOOL_TOLERANCE_F');
    expect(refrigerantChargeInlinePreviewSource).toContain('measured < SUPERHEAT_MAX_F');
    expect(refrigerantBlock).toContain('Lowest Return Air Dry Bulb');
    expect(refrigerantBlock).toContain('id={`rc-numeric-section-${runRC.id}`}');
    expect(refrigerantBlock).toContain("data-rc-numeric-section");
    expect(refrigerantBlock).toContain('runRC.data?.verification_method === "photo_taken"');
    expect(refrigerantBlock).toContain("Boolean(runRC.data?.charge_exempt_reason)");
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
    expect(refrigerantBlock).toContain('RefrigerantChargePhotoEvidencePanel');
    expect(refrigerantChargePhotoEvidencePanelSource).toContain('Take Photo');
    expect(refrigerantChargePhotoEvidencePanelSource).toContain('Upload Photo');
    expect(refrigerantChargePhotoEvidencePanelSource).toContain('capture="environment"');
    expect(refrigerantChargePhotoEvidencePanelSource.match(/capture=/g) ?? []).toHaveLength(1);
    expect(refrigerantChargePhotoEvidencePanelSource).toContain('attachmentEvidenceContext: "refrigerant_charge_photo"');
    expect(refrigerantBlock).not.toContain('Photo / Notes');
    expect(refrigerantBlock).not.toContain('Photo Taken - user attests gauge photo was captured');
    expect(refrigerantBlock).not.toContain('EccLivePreview mode="refrigerant_charge"');
    expect(refrigerantBlock).not.toContain('className="mt-3 grid grid-cols-2 gap-2 text-center"');
    expect(refrigerantBlock).not.toContain('className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"');
    expect(refrigerantBlock).not.toContain('id={`out-${runRC.id}`}');
  });

  it("keeps Fan Watt Draw live feedback inline with field entry", () => {
    const fanIndex = jobTestsPageSource.indexOf('FAN EFFICACY / WATT VERIFICATION');
    expect(fanIndex).toBeGreaterThan(-1);

    const fanBlock = jobTestsPageSource.slice(
      fanIndex,
      jobTestsPageSource.indexOf('            AIR FILTER DEVICE VERIFICATION', fanIndex),
    );

    expect(fanBlock).toContain("FanWattDrawInlinePreview");
    expect(fanBlock).not.toContain('EccLivePreview mode="fan_watt_draw"');
    expect(fanWattDrawInlinePreviewSource).toContain("computeFanWattDrawResult");
    expect(fanWattDrawInlinePreviewSource).toContain("Actual Fan Efficacy");
    expect(fanWattDrawInlinePreviewSource).toContain("Fan efficacy PASS");
    expect(fanWattDrawInlinePreviewSource).toContain("Fan efficacy FAIL");
  });

  it("strips refrigerant evidence tags from attachment display and edit labels", () => {
    expect(jobAttachmentsInternalSource).toContain("stripRefrigerantChargeEvidenceTag");
    expect(jobAttachmentsInternalSource).toContain("setEditingCaption(stripRefrigerantChargeEvidenceTag(attachment.caption))");
    expect(jobAttachmentsInternalSource).toContain("const visibleCaption = stripRefrigerantChargeEvidenceTag(a.caption)");
  });

  it("keeps refrigerant charge attachment uploads split between camera and photo library", () => {
    expect(jobAttachmentsInternalSource).toContain('idSuffix: "job-photo-camera"');
    expect(jobAttachmentsInternalSource).toContain('idSuffix: "job-photo-library"');
    expect(jobAttachmentsInternalSource).toContain('const pickerId = `${pickerIdPrefix}-${control.idSuffix}`;');
    expect(jobAttachmentsInternalSource).toContain('htmlFor={pickerId}');
    expect(jobAttachmentsInternalSource).toContain('id={pickerId}');
    expect(jobAttachmentsInternalSource).toContain('name={control.name}');
    expect(jobAttachmentsInternalSource).toContain('type="file"');
    expect(jobAttachmentsInternalSource).toContain('capture: "environment"');
    expect(jobAttachmentsInternalSource.match(/capture:\s*"environment"/g) ?? []).toHaveLength(1);
    expect(jobAttachmentsInternalSource).toContain('capture={control.capture}');
    expect(jobAttachmentsInternalSource).toContain('Take Photo');
    expect(jobAttachmentsInternalSource).toContain('Upload from Library');
    expect(jobAttachmentsInternalSource).toContain('accept: "image/*"');
    expect(jobAttachmentsInternalSource).toContain('accept={control.accept}');
    expect(jobAttachmentsInternalSource).toContain('onChange={onPickFiles}');
    expect(jobAttachmentsInternalSource).toContain('setFiles(list);');
    expect(jobAttachmentsInternalSource).not.toContain('Take or Choose Photo');
  });

  it("keeps the generic job attachment upload path available outside image-only mode", () => {
    expect(jobAttachmentsInternalSource).toContain('attachmentInputMode?: "all" | "images";');
    expect(jobAttachmentsInternalSource).toContain('attachmentInputMode = "all"');
    expect(jobAttachmentsInternalSource).toContain('idSuffix: "job-photo-library"');
    expect(jobAttachmentsInternalSource).toContain('idSuffix: "job-file-picker"');
    expect(jobAttachmentsInternalSource).toContain('label: "Upload Photo"');
    expect(jobAttachmentsInternalSource).toContain('Choose Files');
    expect(jobAttachmentsInternalSource).toContain('name: "job_photo_library"');
    expect(jobAttachmentsInternalSource).toContain('name: "job_file_picker"');
    expect(jobAttachmentsInternalSource).toContain('attachmentEvidenceContext,');
    expect(jobAttachmentsInternalSource).toContain('finalizeInternalJobAttachmentUpload');
  });

  it("keeps normal job photo upload mobile-safe and non-capture-forced", () => {
    const normalControlsStart = jobAttachmentsInternalSource.indexOf(': [\n        {\n          idSuffix: "job-photo-library"');
    const normalControlsEnd = jobAttachmentsInternalSource.indexOf("      ];", normalControlsStart);
    const normalControls = jobAttachmentsInternalSource.slice(normalControlsStart, normalControlsEnd);

    expect(normalControlsStart).toBeGreaterThanOrEqual(0);
    expect(normalControls).toContain('idSuffix: "job-photo-library"');
    expect(normalControls).toContain('label: "Upload Photo"');
    expect(normalControls).toContain('accept: "image/*"');
    expect(normalControls).toContain('idSuffix: "job-file-picker"');
    expect(normalControls).toContain('label: "Choose Files"');
    expect(normalControls).not.toContain('capture:');
    expect(jobAttachmentsInternalSource).not.toContain('.click()');
    expect(jobAttachmentsInternalSource).not.toContain('className="hidden"');
    expect(jobAttachmentsInternalSource).not.toContain('display: "none"');
  });

  it("retains selected file state and surfaces attachment upload failures visibly", () => {
    expect(jobAttachmentsInternalSource).toContain('setFiles(list);');
    expect(jobAttachmentsInternalSource).toContain('Selected: ${files.length} file');
    expect(jobAttachmentsInternalSource).toContain('role="alert"');
    expect(jobAttachmentsInternalSource).toContain('setError(e instanceof Error ? e.message : "Upload failed")');
    expect(jobAttachmentsInternalSource).toContain('disabled={!canAct}');
    expect(jobAttachmentsInternalSource).toContain('onClick={uploadInternal}');
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
    expect(jobTestsPageSource).toContain('import { isValidEccPermitNumber } from "@/lib/ecc/permit-needed";');
    expect(jobTestsPageSource).toContain("const canShowCompletionReportCertsSentAction =");
    expect(jobTestsPageSource).toContain("isCompletionReportFocused");
    expect(jobTestsPageSource).toContain("isInternalUser");
    expect(jobTestsPageSource).toContain("isEccJobType(job.job_type)");
    expect(jobTestsPageSource).toContain("!Boolean(job.certs_complete)");
    expect(jobTestsPageSource).toContain("!isCompletionReportCertCloseoutBlocked");
    expect(jobTestsPageSource).toContain("!isValidEccPermitNumber(job.permit_number)");
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
    expect(jobTestsPageSource).toContain('className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1"');
    expect(jobTestsPageSource).toContain('inline-flex min-h-10 shrink-0 items-center rounded-full');
    expect(jobTestsPageSource).toContain('href={withS(focusedType || undefined, String(sys.id))}');
    expect(jobTestsPageSource).toContain('<div className="mt-1 text-sm font-semibold text-slate-950">{selectedSystemName}</div>');
    expect(jobTestsPageSource).not.toContain('Report tools are secondary during active field entry.');
    expect(jobTestsPageSource).not.toContain('Expand report');
  });

  it("starts a not-yet-created mobile next test through the create-run action", () => {
    expect(jobTestsPageSource).toContain('const mobileNextTestRow = selectedSystemStatusRows.find((row) => !row.complete && !row.carriedForward) ?? null;');
    expect(jobTestsPageSource).toContain('status.state === "required" ? (');
    expect(jobTestsPageSource).toContain("action={addEccTestRunFromForm}");
    expect(jobTestsPageSource).toContain('name="test_type" value={testType}');
    expect(jobTestsPageSource).toContain("Start Test");
  });

  it("keeps add-another-test visible after the first test exists", () => {
    expect(jobTestsPageSource).toContain("const showInlineAddAnotherTestCard =");
    expect(jobTestsPageSource).toContain("selectedSystemStatusRows.length > 0");

    const addAnotherIndex = jobTestsPageSource.indexOf('<div className="text-sm font-semibold">Add another test</div>');
    expect(addAnotherIndex).toBeGreaterThan(-1);

    const addAnotherLinkStart = jobTestsPageSource.lastIndexOf("<Link", addAnotherIndex);
    const addAnotherLinkEnd = jobTestsPageSource.indexOf("</Link>", addAnotherIndex);
    const addAnotherLink = jobTestsPageSource.slice(addAnotherLinkStart, addAnotherLinkEnd);

    expect(addAnotherLink).toContain('href={focusedType === "custom" ? withS(undefined) : withS("custom")}');
    expect(addAnotherLink).not.toContain("sm:hidden");
  });

  it("does not fall back to completed tests for the mobile continue action", () => {
    expect(jobTestsPageSource).toContain(
      "const mobileNextTestRow = selectedSystemStatusRows.find((row) => !row.complete && !row.carriedForward) ?? null;",
    );
    expect(jobTestsPageSource).not.toContain(
      "selectedSystemStatusRows.find((row) => !row.carriedForward) ??\n    selectedSystemStatusRows[0]",
    );
    expect(jobTestsPageSource).toContain("const selectedAllTestsComplete =");
    expect(jobTestsPageSource).toContain("selectedRequiredRemainingCount === 0");
    expect(jobTestsPageSource).toContain("selectedDraftCount === 0");
    expect(jobTestsPageSource).toContain("selectedNotStartedCount === 0");
    expect(jobTestsPageSource).toContain("All tests complete");
  });

  it("keeps add-another-test unavailable after the ECC workspace is closed or completed", () => {
    expect(jobTestsPageSource).toContain("const isEccWorkspaceClosedOrCompleted =");
    expect(jobTestsPageSource).toContain('normalizedOpsStatus === "closed" || normalizedStatus === "completed"');
    expect(jobTestsPageSource).toContain("!isEccWorkspaceClosedOrCompleted &&\n    !isCompactTestWorkspace");
    expect(jobTestsPageSource).toContain('focusedType === "custom" && !isEccWorkspaceClosedOrCompleted');
    expect(jobTestsPageSource).toContain("Additional tests are unavailable after completion.");
  });

  it("shows save and completion recognition on the focused ECC test page", () => {
    expect(jobTestsPageSource).toContain('notice === "results_saved" || notice === "test_completed"');
    expect(jobTestsPageSource).toContain('notice === "test_completed" ? "Test completed." : "Results saved."');
    expect(jobTestsPageSource).toContain("Review the completed test here, or return to the test matrix when ready.");
    expect(jobTestsPageSource).toContain("Your latest entries were saved. You can keep editing or return to the test matrix.");
    expect(jobTestsPageSource).toContain("{!isCompactTestWorkspace ? (");
    expect(jobTestsPageSource).toContain("Back to Tests");
  });

  it("formats completed test timestamps through the shared LA-local result helper", () => {
    expect(jobTestsPageSource).toContain("function formatTestResultTimestamp");
    expect(jobTestsPageSource).toContain('timeZone: "America/Los_Angeles"');
    expect(jobTestsPageSource).toContain('month: "short"');
    expect(jobTestsPageSource).not.toContain("new Date(runDL.updated_at).toLocaleString()");
    expect(jobTestsPageSource).not.toContain("new Date(runAF.updated_at).toLocaleString()");
    expect(jobTestsPageSource).not.toContain("new Date(runRC.updated_at).toLocaleString()");
  });

  it("exposes mobile failed-report sending through the existing contractor report panel", () => {
    expect(jobPageSource).toContain("const canShowContractorReportPanel =");
    expect(jobPageSource).toContain('id="mobile-failed-report"');
    expect(jobPageSource).toContain("<ContractorReportPanel");
    expect(mobileJobDetailCurrentSource).toContain("MobileJobStatusActionSurface");
    expect(readFileSync(resolve(__dirname, "../../../app/jobs/[id]/_components/MobileJobStatusActionSurface.tsx"), "utf8")).toContain(
      "Send Failed Report",
    );
  });

  it("removes the visible Standard view button from mobile V2", () => {
    const mobileV2Source = readFileSync(resolve(__dirname, "../../../app/jobs/[id]/_components/MobileJobDetailV2Preview.tsx"), "utf8");
    expect(mobileV2Source).not.toContain("Standard view");
  });
});

describe("job detail field operations board layout", () => {
  it("keeps the service location chip over the image area", () => {
    const locationPanelStart = jobPageSource.indexOf('id="job-location"');
    const locationPanelEnd = jobPageSource.indexOf("{isInternalUser ? (", locationPanelStart);
    const locationPanelSlice =
      locationPanelStart > -1 && locationPanelEnd > locationPanelStart
        ? jobPageSource.slice(locationPanelStart, locationPanelEnd)
        : "";

    expect(locationPanelStart).toBeGreaterThan(-1);
    expect(locationPanelSlice).toContain("Service Location");
    expect(locationPanelSlice).toContain("TimedJobLocationPreview");
    expect(locationPanelSlice).toContain("showAddressOverlay");
    expect(jobPageSource).not.toContain("bg-slate-100 p-3 pt-10");
  });

  it("labels account, access, and billing context clearly", () => {
    expect(jobPageSource).toContain("Customer / Account");
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

  it("uses the preferred job workbench heading fallback chain", () => {
    expect(jobPageSource).toContain("const fieldHeaderTitle =");
    expect(jobPageSource).toContain("const jobWorkbenchTitle = firstNonEmpty(jobTitleText, visitScopeLeadText, fieldHeaderTitle) ?? \"Job Detail\";");
    expect(mobileJobDetailCurrentSource).toContain("{jobWorkbenchTitle}");
    expect(jobPageSource).toContain("primarySiteAccessName");
    expect(jobPageSource).toContain("?? \"Job Detail\"");
    expect(`${jobPageSource}\n${mobileJobDetailCurrentSource}`).not.toContain('{normalizeRetestLinkedJobTitle(job.title) || "Operational job workspace"}');
  });

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

  it("keeps visit reason and intake notes below the location preview", () => {
    expect(mobileJobDetailCurrentSource).toContain("<MobileJobWorkScopePanel {...props} />");
    expect(mobileJobWorkScopePanelSource).toContain("Visit Reason");
    expect(jobPageSource).toContain("const visitReasonText =");
    expect(mobileJobWorkScopePanelSource).toContain("{visitReasonText}");
    expect(jobPageSource).toContain('id="visit-reason-card"');
    expect(mobileJobWorkScopePanelSource).toContain('id="mobile-visit-reason-card"');
    expect(mobileJobWorkScopePanelSource).toContain("updateJobVisitScopeFromForm");
    expect(mobileJobWorkScopePanelSource).toContain('name="visit_scope_summary"');
    expect(mobileJobWorkScopePanelSource).toContain('name="visit_scope_items_json" value={visitScopeItemsJsonForInlineEdit}');
    expect(jobPageSource).toContain("Customer Concern");
    expect(jobPageSource).toContain("Intake Notes");
    expect(jobPageSource).toContain("whitespace-pre-wrap break-words");
  });

  it("does not duplicate intake note in right notes card and keeps honest empty-state copy", () => {
    const jobNotesCardStart = jobPageSource.indexOf('id="internal-notes"');
    const jobNotesCardEnd = jobPageSource.indexOf('id="next-service-action"', jobNotesCardStart);
    const jobNotesCardSlice =
      jobNotesCardStart > -1 && jobNotesCardEnd > jobNotesCardStart
        ? jobPageSource.slice(jobNotesCardStart, jobNotesCardEnd)
        : "";

    expect(jobPageSource).toContain("Intake Notes");
    expect(jobNotesCardSlice).not.toContain("Intake note");
    expect(jobPageSource).toContain("const rightRailNotesEmptyText = isEccJobType ? \"No shared or internal notes yet.\" : \"No notes yet.\";");
    expect(jobNotesCardSlice).toContain("ChatIcon");
    expect(jobNotesCardSlice).toContain("{rightRailNotesTitle}");
    expect(jobNotesCardSlice).toContain("{rightRailNotesEmptyText}");
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
    const visitReasonIndex = mobileJobWorkScopePanelSource.indexOf("Visit Reason");
    const mobileWorkScopeIndex = mobileJobWorkScopePanelSource.indexOf('id="mobile-work-scope"');
    const mobileAssignedTeamIndex = mobileJobDetailCurrentSource.indexOf("<AssignedTeamControls");
    const mobileWorkScopeMountIndex = mobileJobDetailCurrentSource.indexOf("<MobileJobWorkScopePanel");
    const mobileWorkItemsIndex = mobileJobWorkScopePanelSource.indexOf(
      "{visitScopeItems.map((item: any, index: number) => (",
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
    expect(visitScopeIndex).toBeGreaterThan(-1);
    expect(assignedTeamIndex).toBeGreaterThan(-1);
    expect(assignedTeamIndex).toBeLessThan(visitScopeIndex);
    expect(rightRailIndex).toBeGreaterThan(visitScopeIndex);
    expect(jobPageSource).toContain("xl:order-4 xl:col-span-3");
    expect(jobPageSource).toContain("space-y-3 xl:order-3");
  });

  it("shows every saved Work Scope item on mobile without a hidden more-items summary", () => {
    expect(mobileJobWorkScopePanelSource).toContain("{visitScopeItems.map((item: any, index: number) => (");
    expect(mobileJobWorkScopePanelSource).not.toContain("primaryVisitScopeItems.slice(0, 2)");
    expect(mobileJobWorkScopePanelSource).not.toContain("more work item");
    expect(mobileJobWorkScopePanelSource).toContain("formatVisitScopeItemKindLabel(item.kind)");
    expect(mobileJobWorkScopePanelSource).toContain("Number(item.expected_unit_price).toFixed(2)");
  });

  it("keeps post-build invoice state visible in the mobile Work & Invoice section", () => {
    const mobileWorkScopeStart = mobileJobWorkScopePanelSource.lastIndexOf('<section id="mobile-work-scope"');
    const mobileNotesStart = mobileJobWorkScopePanelSource.indexOf("<MobileJobWorkScopeBody", mobileWorkScopeStart);
    const mobileWorkScopeSlice =
      mobileWorkScopeStart > -1 && mobileNotesStart > mobileWorkScopeStart
        ? mobileJobWorkScopePanelSource.slice(mobileWorkScopeStart, mobileNotesStart)
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
    const mobileVisitReasonStart = mobileJobWorkScopePanelSource.indexOf('id="mobile-visit-reason-card"');
    const mobileVisitReasonEnd = mobileJobWorkScopePanelSource.indexOf("{visitScopeItems.map((item: any, index: number) => (", mobileVisitReasonStart);
    const mobileVisitReasonSlice =
      mobileVisitReasonStart > -1 && mobileVisitReasonEnd > mobileVisitReasonStart
        ? mobileJobWorkScopePanelSource.slice(mobileVisitReasonStart, mobileVisitReasonEnd)
        : "";

    expect(mobileVisitReasonSlice).toContain('<details className="group">');
    expect(mobileVisitReasonSlice).toContain('className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-3 shadow-sm"');
    expect(mobileVisitReasonSlice).toContain('className="mt-3 grid grid-cols-2 gap-2"');
    expect(mobileVisitReasonSlice).toContain('inline-flex min-h-10 items-center justify-center rounded-xl');
    expect(mobileVisitReasonSlice).toContain('name="visit_scope_summary"');
    expect(mobileVisitReasonSlice).toContain('name="visit_scope_items_json" value={visitScopeItemsJsonForInlineEdit}');
  });

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

  it("keeps the location preview compact on mobile and hides lower map actions there", () => {
    expect(jobLocationPreviewImageSource).toContain("h-40 w-full object-cover");
    expect(jobLocationPreviewImageSource).toContain("sm:h-52 lg:h-56 xl:h-60");
    expect(jobLocationPreviewSource).toContain("mt-3 hidden flex-col gap-2 sm:flex");
    expect(jobLocationPreviewSource).toContain("border border-gray-300 bg-white");
    expect(jobPageSource).toContain("h-40 w-full animate-pulse");
    expect(jobPageSource).toContain("mt-3 hidden flex-col gap-2 sm:flex");
    expect(jobPageSource).toContain("Navigate");
    expect(jobPageSource).toContain("Open in Maps");
  });

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

  it("keeps permit quick reference in the top rail", () => {
    const permitQuickRefIndex = jobPageSource.indexOf("Permit Quick Ref");
    const permitNumberIndex = jobPageSource.indexOf("Permit number", permitQuickRefIndex);

    expect(jobPageSource).toContain("Permit Quick Ref");
    expect(jobPageSource).toContain("Permit number");
    expect(permitQuickRefIndex).toBeGreaterThan(-1);
    expect(permitNumberIndex).toBeGreaterThan(permitQuickRefIndex);
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
    expect(jobPageSource).toContain("showEccSummaryCard = surfaceProfile.surfaces.eccTests && job.job_type === \"ecc\"");
    expect(jobPageSource).toContain("showJobRecordsPermitCard = surfaceProfile.surfaces.permits && (showEccSummaryCard || hasPermitDetails)");
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
    const jobNotesCardStart = jobPageSource.indexOf('id="internal-notes"');
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
    const workInvoiceSectionEnd = jobPageSource.indexOf("{/* Right: quick reference rail */}", workInvoiceIndex);
    const lowerNextServiceIndex = jobPageSource.indexOf('id="next-service-action"', workInvoiceSectionEnd);
    const lowerNextServiceEnd = jobPageSource.indexOf('id="job-details-records"', lowerNextServiceIndex);
    const lowerNextServiceSlice =
      lowerNextServiceIndex > -1 && lowerNextServiceEnd > lowerNextServiceIndex
        ? jobPageSource.slice(lowerNextServiceIndex, lowerNextServiceEnd)
        : "";
    const nextServiceAnchorCount = jobPageSource.match(/id="next-service-action"/g)?.length ?? 0;

    expect(workInvoiceIndex).toBeGreaterThan(-1);
    expect(workInvoiceSectionEnd).toBeGreaterThan(workInvoiceIndex);
    expect(lowerNextServiceIndex).toBeGreaterThan(workInvoiceSectionEnd);
    expect(lowerNextServiceSlice).toContain("Next Service Action");
    expect(lowerNextServiceSlice).toContain("Create Return Visit");
    expect(nextServiceAnchorCount).toBeGreaterThan(1);
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
    expect(jobStatusPanelSlice).toContain("{formatOpsStatusLabel(job.ops_status, job.job_type)}");
    expect(jobStatusPanelSlice).toContain("InterruptStateFields");
    expect(jobStatusPanelSlice).toContain("initialInterruptState={currentInterruptState");
    expect(jobStatusPanelSlice).toContain("initialStatusReason={initialInterruptReason}");
    expect(jobStatusPanelSlice).toContain('className="space-y-4 rounded-xl border border-slate-200/80 bg-white/96 p-4"');
    expect(jobStatusPanelSlice).toContain('className={`${recordActionRowEndClass} border-t border-slate-200/80 pt-3`}');
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
