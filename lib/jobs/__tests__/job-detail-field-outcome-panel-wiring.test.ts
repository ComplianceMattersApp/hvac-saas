import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const jobDetailSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
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
    expect(jobDetailSource).toContain('const normalizedServiceVisitType = String(job.service_visit_type ?? "").trim().toLowerCase();');
    expect(jobDetailSource).toContain('normalizedServiceVisitType === "callback" || normalizedServiceVisitType === "return_visit";');
    expect(jobDetailSource).toContain("const showFieldOutcomePanel =");
    expect(jobDetailSource).toContain("!isFieldComplete &&");
    expect(jobDetailSource).toContain('normalizedJobStatus === "in_process";');
    expect(jobDetailSource).toContain("{showFieldOutcomePanel ? (");
    expect(jobDetailSource).toContain("Field work complete - ready for closeout.");
    expect(jobDetailSource).toContain("Field work complete - invoice/certs can be handled as needed.");
  });

  it("suppresses duplicate ECC tests workspace shortcuts while the primary in-process action row is visible", () => {
    expect(jobDetailSource).toContain('!isFieldComplete && job.status !== "completed" ? (');
    expect(jobDetailSource).toContain('href={`/jobs/${job.id}/tests`}');
    expect(jobDetailSource).toContain("Open Tests Workspace");
    expect(jobDetailSource).toContain('job.job_type === "ecc" && (isFieldComplete || job.status === "completed") ? (');
    expect(jobDetailSource).not.toContain("|| showFieldOutcomePanel) ? (");
  });

  it("keeps completion on the primary action and leaves the outcome panel for exceptions only", () => {
    expect(fieldActionButtonSource).toContain("Complete Field Work");
    expect(jobDetailSource).toContain('!isFieldComplete && job.status !== "completed" ? (');
    expect(jobDetailSource).toContain("Field work complete - ready for closeout.");
    expect(jobDetailSource).toContain("Field work complete - invoice/certs can be handled as needed.");
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
    expect(exceptionPickerSource).toContain("Need Parts");
    expect(exceptionPickerSource).toContain("Need Approval");
    expect(exceptionPickerSource).toContain("Unable to Complete");
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
    expect(exceptionPickerSource).toContain("form action={props.differentIssueFoundAction}");
    expect(exceptionPickerSource).toContain("name=\"different_issue_note\"");
    expect(exceptionPickerSource).toContain("Send this visit to office/dispatch as Waiting on Part.");
    expect(exceptionPickerSource).toContain("Send this visit to office/dispatch as Approval Needed.");
    expect(exceptionPickerSource).toContain("Send this visit to office/dispatch for review.");
    expect(exceptionPickerSource).toContain("placeholder=\"What part or issue is needed?\"");
    expect(exceptionPickerSource).toContain("placeholder=\"Example: customer approval for repair, owner approval for added work\"");
    expect(exceptionPickerSource).toContain("placeholder=\"Example: customer not home, no access, unsafe condition, missing information\"");
    expect(exceptionPickerSource).toContain("placeholder=\"Example: original issue resolved, but separate airflow issue found in upstairs zone\"");
    expect(exceptionPickerSource).toContain("Submit Parts Needed");
    expect(exceptionPickerSource).toContain("Submit Approval Needed");
    expect(exceptionPickerSource).toContain("Submit Unable to Complete");
    expect(exceptionPickerSource).toContain("Submit Different Issue Found");
  });

  it("gates Different Issue Found to callback/revisit-only rendering", () => {
    expect(panelSource).not.toContain("route.code === \"work_completed\"");
    expect(panelSource).not.toContain('type="button"');
    expect(panelSource).not.toContain("Only Work Completed is wired in this slice. Other outcomes remain unwired until future slices.");
    expect(exceptionPickerSource).toContain("props.showDifferentIssueFoundOutcome ? (");
    expect(exceptionPickerSource).toContain("Callback/revisit-only: send this visit to office review without creating a new visit.");
    expect(panelSource).not.toContain("return_needed");
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
