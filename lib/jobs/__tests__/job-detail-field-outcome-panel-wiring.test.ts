import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const jobDetailSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf8",
);

const jobActionsSource = readFileSync(
  resolve(__dirname, "../../actions/job-actions.ts"),
  "utf8",
);

const panelSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/FieldOutcomePanel.tsx"),
  "utf8",
);

const fieldActionButtonSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/JobFieldActionButton.tsx"),
  "utf8",
);

const exceptionPickerSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/FieldExceptionRoutingPicker.tsx"),
  "utf8",
);

const serviceChainPanelSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/DeferredServiceChainPanelBody.tsx"),
  "utf8",
);

describe("job detail field outcome panel wiring", () => {
  it("wires the compact panel near field action areas", () => {
    expect(jobDetailSource).toContain('import FieldOutcomePanel from "./_components/FieldOutcomePanel";');
    expect(jobDetailSource).toContain('<FieldOutcomePanel');
    expect(jobDetailSource).toContain('anchorId="field-outcome"');
    expect(jobDetailSource).toContain('className="hidden w-full sm:block"');
    expect(jobDetailSource).toContain("jobId={String(job.id)}");
    expect(jobDetailSource).toContain("showDifferentIssueFoundOutcome={showDifferentIssueFoundOutcome}");
  });

  it("keeps stable keys in latest notes preview list rendering", () => {
    expect(jobDetailSource).toContain("latestJobNotesPreview.map((preview, index) => (");
    expect(jobDetailSource).toContain("key={`${preview.createdAt || \"note\"}-${preview.label}-${preview.text.slice(0, 40)}-${index}`}");
  });

  it("shows the exception panel only for in-process not-yet-field-complete jobs", () => {
    expect(jobDetailSource).toContain("const isJobArchived = Boolean(job.deleted_at) || normalizedOpsStatus === \"archived\";");
    expect(jobDetailSource).toContain('const isJobClosed = normalizedOpsStatus === "closed";');
    expect(jobDetailSource).toContain('const isJobCancelled = normalizedJobStatus === "cancelled";');
    expect(jobDetailSource).toContain('job.job_type !== "ecc" &&');
    expect(jobDetailSource).toContain('const normalizedServiceVisitType = String(job.service_visit_type ?? "").trim().toLowerCase();');
    expect(jobDetailSource).toContain('normalizedServiceVisitType === "callback" || normalizedServiceVisitType === "return_visit";');
    expect(jobDetailSource).toContain("const showFieldOutcomePanel =");
    expect(jobDetailSource).toContain("!isFieldComplete &&");
    expect(jobDetailSource).toContain('normalizedJobStatus === "in_process";');
    expect(jobDetailSource).toContain("{showFieldOutcomePanel ? (");
    expect(jobDetailSource).toContain("getJobDetailCloseoutReadinessMessage");
    expect(jobDetailSource).toContain("{primaryCloseoutMessage}");
  });

  it("suppresses duplicate ECC tests workspace shortcuts while the primary in-process action row is visible", () => {
    expect(jobDetailSource).toContain('!isFieldComplete && job.status !== "completed" ? (');
    expect(jobDetailSource).toContain('href={`/jobs/${job.id}/tests`}');
    expect(jobDetailSource).toContain("Open Tests Workspace");
    expect(jobDetailSource).toContain("Back to Ops");
    expect(jobDetailSource).toContain("Open Customer");
    expect(jobDetailSource).toContain("Create Estimate");
    expect(jobDetailSource).not.toContain('job.job_type === "ecc" && (isFieldComplete || job.status === "completed") && !showPrimaryCloseoutBlockers ? (');
    expect(jobDetailSource).not.toContain("|| showFieldOutcomePanel) ? (");
  });

  it("keeps completion on the primary action and leaves the outcome panel for exceptions only", () => {
    expect(fieldActionButtonSource).toContain("Complete Field Work");
    expect(jobDetailSource).toContain('!isFieldComplete && job.status !== "completed" ? (');
    expect(jobDetailSource).toContain("getJobDetailCloseoutReadinessMessage(closeoutProjectionJob)");
    expect(jobDetailSource).toContain("showPrimaryCloseoutBlockers");
    expect(jobDetailSource).toContain("jobPageInvoiceNextAction");
    expect(jobDetailSource).toContain("✓ Certs Sent");
    expect(panelSource).not.toContain('import { advanceJobStatusFromForm } from "@/lib/actions/job-actions";');
    expect(panelSource).not.toContain("form action={advanceJobStatusFromForm}");
    expect(panelSource).not.toContain("Confirm Work Completed");
    expect(panelSource).not.toContain("Confirm field work complete");
  });

  it("renders compact exception routing instead of the full textarea stack by default", () => {
    expect(panelSource).toContain('import FieldExceptionRoutingPicker from "./FieldExceptionRoutingPicker";');
    expect(panelSource).toContain("<FieldExceptionRoutingPicker");
    expect(panelSource).not.toContain("Need a field exception?");
    expect(panelSource).not.toContain("Route active field work to office/dispatch only if this visit cannot be completed.");
    expect(panelSource).not.toContain("rounded-2xl");
    expect(panelSource).not.toContain("<textarea");
    expect(panelSource).not.toContain("form action={markJobPartsNeededFromForm}");
    expect(exceptionPickerSource).toContain('"use client";');
    expect(exceptionPickerSource).toContain("const [isOpen, setIsOpen] = useState(false);");
    expect(exceptionPickerSource).toContain("Can&apos;t finish today?");
    expect(exceptionPickerSource).toContain("Send this visit to office/dispatch for parts, approval, or review.");
    expect(exceptionPickerSource).toContain("Choose reason -&gt;");
    expect(exceptionPickerSource).toContain("w-full items-center justify-between");
    expect(exceptionPickerSource).toContain("What is blocking completion?");
    expect(exceptionPickerSource).toContain("Materials Needed");
    expect(exceptionPickerSource).toContain("Approval Needed");
    expect(exceptionPickerSource).toContain("Other");
    expect(exceptionPickerSource).not.toContain("Need Parts");
    expect(exceptionPickerSource).not.toContain("Need Approval");
    expect(exceptionPickerSource).not.toContain("Unable to Complete");
    expect(exceptionPickerSource).toContain("Back");
    expect(exceptionPickerSource).toContain("Cancel");
  });

  it("wires parts_needed, approval_needed, and unable_to_complete submit behavior", () => {
    expect(panelSource).toContain('from "@/lib/actions/job-ops-actions";');
    expect(panelSource).toContain("markJobPartsNeededFromForm");
    expect(panelSource).toContain("markJobApprovalNeededFromForm");
    expect(panelSource).toContain("markJobUnableToCompleteFromForm");
    expect(panelSource).toContain("partsNeededAction={markJobPartsNeededFromForm}");
    expect(panelSource).toContain("approvalNeededAction={markJobApprovalNeededFromForm}");
    expect(panelSource).toContain("unableToCompleteAction={markJobUnableToCompleteFromForm}");
    expect(exceptionPickerSource).toContain("form action={props.partsNeededAction}");
    expect(exceptionPickerSource).toContain("form action={props.approvalNeededAction}");
    expect(exceptionPickerSource).toContain("form action={props.unableToCompleteAction}");
    expect(exceptionPickerSource).toContain("name=\"job_id\"");
    expect(exceptionPickerSource).toContain("name=\"current_status\"");
    expect(exceptionPickerSource).toContain("name=\"tab\"");
    expect(exceptionPickerSource).toContain("name=\"parts_note\"");
    expect(exceptionPickerSource).toContain("name=\"approval_note\"");
    expect(exceptionPickerSource).toContain("name=\"unable_note\"");
    expect(panelSource).toContain("markJobDifferentIssueFoundFromForm");
    expect(panelSource).toContain("differentIssueFoundAction={markJobDifferentIssueFoundFromForm}");
    expect(exceptionPickerSource).not.toContain("form action={props.differentIssueFoundAction}");
    expect(exceptionPickerSource).not.toContain("name=\"different_issue_note\"");
    expect(exceptionPickerSource).toContain("Complete today&apos;s visit and hold follow-up for materials.");
    expect(exceptionPickerSource).toContain("Complete today&apos;s visit and hold follow-up for approval.");
    expect(exceptionPickerSource).toContain("Complete today&apos;s visit and hold follow-up for office review.");
    expect(exceptionPickerSource).toContain("placeholder=\"What materials are needed?\"");
    expect(exceptionPickerSource).toContain("placeholder=\"Example: customer approval for repair, owner approval for added work\"");
    expect(exceptionPickerSource).toContain("placeholder=\"Why does office or dispatch need to follow up?\"");
    expect(exceptionPickerSource).toContain("Complete Visit & Hold for Follow-Up");
    expect(exceptionPickerSource).not.toContain("Submit Parts Needed");
    expect(exceptionPickerSource).not.toContain("Submit Approval Needed");
    expect(exceptionPickerSource).not.toContain("Submit Unable to Complete");
    expect(exceptionPickerSource).not.toContain("Submit Different Issue Found");
  });

  it("keeps Different Issue Found out of the first service field follow-up picker", () => {
    expect(panelSource).not.toContain("route.code === \"work_completed\"");
    expect(panelSource).not.toContain('type="button"');
    expect(panelSource).not.toContain("Only Work Completed is wired in this slice. Other outcomes remain unwired until future slices.");
    expect(exceptionPickerSource).not.toContain("props.showDifferentIssueFoundOutcome ? (");
    expect(exceptionPickerSource).not.toContain("Callback/revisit-only: send this visit to office review without creating a new visit.");
    expect(exceptionPickerSource).not.toContain("Different Issue Found");
    expect(panelSource).not.toContain("return_needed");
  });

  it("renders Different Issue Found banners with callback/return and original-history context", () => {
    expect(jobDetailSource).toContain("different_issue_found_saved");
    expect(jobDetailSource).toContain("Different issue noted. This callback/return visit is complete and office review is next; the original job history was not changed.");
    expect(jobDetailSource).toContain("Different Issue Found is only for callback or return visits. Use the normal follow-up options for first visits.");
    expect(jobDetailSource).toContain("Add a short note explaining the different issue before routing this callback/return visit to office review.");
  });

  it("suppresses same-visit resume controls for completed service follow-up holds", () => {
    expect(jobDetailSource).toContain("const isServiceFieldFollowUpPendingInfo =");
    expect(jobDetailSource).toContain("const hasServiceFieldFollowUpPendingInfo =");
    expect(jobDetailSource).toContain("const isHistoricalServiceFollowUpContinued =");
    expect(jobDetailSource).toContain("/^(Materials Needed|Approval Needed|Other):/i.test(pendingInfoReasonText)");
    expect(jobDetailSource).toContain("const canShowReleaseAndReevaluate = !hasServiceFieldFollowUpPendingInfo && [");
    expect(jobDetailSource).toContain("buildServiceFollowUpProgressState");
    expect(jobDetailSource).toContain("serviceFollowUpProgressEventsPromise");
    expect(jobDetailSource).toContain("markServicePartOrderedFromForm");
    expect(jobDetailSource).toContain("markServicePartArrivedFromForm");
    expect(jobDetailSource).toContain("markServiceApprovalReceivedFromForm");
    expect(jobDetailSource).toContain("Progress: {serviceFollowUpProgressState.progressLabel}");
    expect(jobDetailSource).toContain("Mark Part Ordered");
    expect(jobDetailSource).toContain("Mark Part Arrived");
    expect(jobDetailSource).toContain("Mark Approval Received");
    expect(jobDetailSource).toContain("serviceFollowUpProgressState.bridgeActionLabel");
    expect(jobDetailSource).toContain('name="return_creation_mode" value="needs_scheduling"');
    expect(jobDetailSource).toContain('name="follow_up_bridge_action" value="add_to_scheduling_queue"');
    expect(jobDetailSource).toContain("serviceFollowUpProgressState.returnPromptLabel");
    expect(jobDetailSource).not.toContain("Ready to resume this service visit?");
  });

  it("renders continued service follow-up parents as historical after a linked return exists", () => {
    expect(jobDetailSource).toContain("Follow-up continued through linked return visit");
    expect(jobDetailSource).toContain("Open Linked Return Visit");
    expect(jobDetailSource).toContain("!hasServiceFieldFollowUpPendingInfo");
    expect(jobDetailSource).toContain("isHistoricalServiceFollowUpContinued ? null : getActiveWaitingState");
    expect(serviceChainPanelSource).toContain("buildServiceFollowUpProgressState");
    expect(serviceChainPanelSource).toContain("continuedParentIdByChildId");
    expect(serviceChainPanelSource).toContain("isCurrentActive");
    expect(serviceChainPanelSource).toContain("Active continuation");
    expect(serviceChainPanelSource).toContain("Continued");
    expect(serviceChainPanelSource).toContain("Linked return visit created");
  });

  it("distinguishes callback children from return visits in service-chain labels", () => {
    expect(jobDetailSource).toContain('const visitType = String(visit?.service_visit_type ?? "").trim().toLowerCase();');
    expect(jobDetailSource).toContain('if (visit?.parent_job_id && visitType === "callback") return "Callback visit";');
    expect(jobDetailSource).toContain('if (visit?.parent_job_id && visitType === "return_visit") return "Return visit";');
    expect(jobDetailSource).toContain('if (visit?.parent_job_id && String(visit?.job_type ?? "").toLowerCase() === "service") return "Linked service visit";');
    expect(serviceChainPanelSource).toContain("job_type, service_visit_type, created_at");
    expect(serviceChainPanelSource).toContain('if (visit?.parent_job_id && visitType === "callback") return "Callback visit";');
    expect(serviceChainPanelSource).toContain('if (visit?.parent_job_id && visitType === "return_visit") return "Return visit";');
    expect(serviceChainPanelSource).toContain('if (visit?.parent_job_id && String(visit?.job_type ?? "").toLowerCase() === "service") return "Linked service visit";');
  });

  it("removes the standalone exception card and ECC guardrail copy", () => {
    expect(panelSource).not.toContain("ECC guardrail: Failed/retest outcomes come from ECC test completion.");
    expect(panelSource).not.toContain("props.isEccJob ? (");
  });

  it("keeps open and on-the-way flow on existing start actions", () => {
    expect(jobDetailSource).toContain('!isFieldComplete && job.status !== "completed" ? (');
    expect(jobDetailSource).toContain(') : !isFieldComplete ? (');
    expect(jobDetailSource).toContain(') : isFieldComplete || job.status === "completed" ? (');
  });

  it("uses lifecycle copy for active workflow chip instead of showing stale scheduled copy", () => {
    expect(jobDetailSource).toContain("const workflowChipLabel =");
    expect(jobDetailSource).toContain('normalizedJobStatus === "in_process" && !isFieldComplete');
    expect(jobDetailSource).toContain('{workflowChipLabel}');
  });

  it("uses continuation copy for completed follow-up parent workflow chips", () => {
    expect(jobDetailSource).toContain("isHistoricalServiceFollowUpContinued");
    expect(jobDetailSource).toContain("serviceFollowUpProgressState.continuedScheduledDate");
    expect(jobDetailSource).toContain('"Return Scheduled"');
    expect(jobDetailSource).toContain('"Follow-Up Continued"');
  });

  it("wires ECC Permit Needed to a Permit Available action in Primary Next Action", () => {
    expect(jobDetailSource).toContain("markEccPermitAvailableFromForm");
    expect(jobDetailSource).toContain("isEccPermitNeededBlocker");
    expect(jobDetailSource).toContain("const isEccPermitNeededActive =");
    expect(jobDetailSource).toContain('id="ecc-permit-needed-action"');
    expect(jobDetailSource).toContain("Permit Needed");
    expect(jobDetailSource).toContain("Permit Available");
    expect(jobDetailSource).toContain("form action={markEccPermitAvailableFromForm}");
    expect(jobDetailSource).toContain('name="permit_number"');
    expect(jobDetailSource).toContain('name="jurisdiction"');
    expect(jobDetailSource).toContain('name="permit_date"');
    expect(jobDetailSource).toContain("!isEccPermitNeededActive");
    expect(jobDetailSource).toContain('banner === "permit_needed"');
    expect(jobDetailSource).toContain('banner === "permit_available_saved"');
  });

  it("surfaces closeout blockers and actions in Primary Next Action after field completion", () => {
    expect(jobDetailSource).toContain("const showPrimaryCloseoutBlockers =");
    expect(jobDetailSource).toContain("isCloseoutPending");
    expect(jobDetailSource).toContain("(isCloseoutPending || closeoutNeeds.isFailureFlow)");
    expect(jobDetailSource).toContain("getJobDetailCloseoutReadinessMessage(closeoutProjectionJob)");
    expect(jobDetailSource).toContain('href={`/jobs/${job.id}/invoice#invoice-workspace`}');
    expect(jobDetailSource).toContain("{jobPageInvoiceNextAction}");
    expect(jobDetailSource).toContain("form action={markCertsCompleteFromForm}");
    expect(jobDetailSource).toContain("✓ Certs Sent");
    expect(jobDetailSource).toContain("invoice_complete: billingState.billedTruthSatisfied");
    expect(jobDetailSource).toContain('banner === "certs_closeout_closed"');
    expect(jobDetailSource).toContain("Certs sent. Job closed out.");
    expect(jobDetailSource).toContain('banner === "certs_closeout_saved"');
    expect(jobDetailSource).toContain("Certs sent. Closeout blockers were recomputed.");
    expect(jobDetailSource).toContain('banner === "certs_closeout_failed"');
    expect(jobDetailSource).toContain("Could not mark certs sent. Refresh and try again.");
    expect(jobDetailSource).toContain("showPrimaryCloseoutBlockers ||");
    expect(jobDetailSource).not.toContain("!showPrimaryCloseoutBlockers");
    expect(jobDetailSource).not.toContain("Field work complete - invoice/certs can be handled as needed.");
  });

  it("keeps the obsolete middle Closeout action lane removed", () => {
    expect(jobDetailSource).not.toContain("const showCloseoutRow =");
    expect(jobDetailSource).not.toContain('id="closeout-actions"');
    expect(jobDetailSource).not.toContain("Closeout Actions (Internal Only)");
    expect(jobDetailSource).not.toContain("Closeout open");
    expect(jobDetailSource).not.toContain("lightweight invoice-complete controls");
    expect(jobDetailSource).not.toContain("job-linked internal invoice panel");
    expect(jobDetailSource).not.toContain("Internal invoicing mode is enabled");
    expect(jobDetailSource).toContain("Use the invoice workspace to finish billing for this job.");
  });

  it("aligns ECC missing-test warning with Tests workspace completed-run truth", () => {
    expect(jobDetailSource).toContain("is_completed,");
    expect(jobDetailSource).toContain("const hasCompletedEccTestRun = eccRuns.some((run: any) => run?.is_completed === true);");
    expect(jobDetailSource).toContain("const shouldShowEccMissingTestNotice = showEccNotice && isEccJobType && !hasCompletedEccTestRun;");
    expect(jobDetailSource).toContain("shouldShowEccMissingTestNotice");
    expect(jobActionsSource).toContain(".select(\"id, is_completed\")");
    expect(jobActionsSource).toContain("const hasCompletedRun = (runs ?? []).some((r: any) => r?.is_completed === true);");
    expect(jobActionsSource).not.toContain("hasMeaningfulCompletedRun");
  });

  it("renders completion blocker banners in the primary action region without lower duplicates", () => {
    expect(jobDetailSource).toContain("const completionActionAttentionBanner =");
    expect(jobDetailSource).toContain('title: "One step missing"');
    expect(jobDetailSource).toContain('title: "Could not complete field work"');
    expect(jobDetailSource).toContain('data-completion-action-banner="true"');
    expect(jobDetailSource).toContain('<div id="field-status-actions"');
    expect(jobDetailSource).not.toContain("{showEccNotice && (");
    expect(jobDetailSource).not.toContain('{banner === "status_update_failed" && (');
    expect(jobDetailSource).not.toContain('showEccNotice || sp?.schedule_required === "1"');
  });
});
