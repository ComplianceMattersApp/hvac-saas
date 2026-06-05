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

describe("job detail field outcome panel wiring", () => {
  it("wires the compact panel near field action areas", () => {
    expect(jobDetailSource).toContain('import FieldOutcomePanel from "./_components/FieldOutcomePanel";');
    expect(jobDetailSource).toContain('<FieldOutcomePanel');
    expect(jobDetailSource).toContain('anchorId="field-outcome"');
    expect(jobDetailSource).toContain("jobId={String(job.id)}");
    expect(jobDetailSource).toContain("showDifferentIssueFoundOutcome={showDifferentIssueFoundOutcome}");
  });

  it("keeps stable keys in latest notes preview list rendering", () => {
    expect(jobDetailSource).toContain("latestJobNotesPreview.map((preview, index) => (");
    expect(jobDetailSource).toContain("key={`${preview.createdAt || \"note\"}-${preview.label}-${preview.text.slice(0, 40)}-${index}`}");
  });

  it("shows the active panel only for in-process not-yet-field-complete jobs", () => {
    expect(jobDetailSource).toContain("const isJobArchived = Boolean(job.deleted_at) || normalizedOpsStatus === \"archived\";");
    expect(jobDetailSource).toContain('const isJobClosed = normalizedOpsStatus === "closed";');
    expect(jobDetailSource).toContain('const isJobCancelled = normalizedJobStatus === "cancelled";');
    expect(jobDetailSource).toContain('const normalizedServiceVisitType = String(job.service_visit_type ?? "").trim().toLowerCase();');
    expect(jobDetailSource).toContain('normalizedServiceVisitType === "callback" || normalizedServiceVisitType === "return_visit";');
    expect(jobDetailSource).toContain("const showFieldOutcomePanel =");
    expect(jobDetailSource).toContain("!isFieldComplete &&");
    expect(jobDetailSource).toContain('normalizedJobStatus === "in_process";');
  });

  it("wires work_completed, parts_needed, approval_needed, and unable_to_complete submit behavior", () => {
    expect(panelSource).toContain('import { advanceJobStatusFromForm } from "@/lib/actions/job-actions";');
    expect(panelSource).toContain('from "@/lib/actions/job-ops-actions";');
    expect(panelSource).toContain("markJobPartsNeededFromForm");
    expect(panelSource).toContain("markJobApprovalNeededFromForm");
    expect(panelSource).toContain("markJobUnableToCompleteFromForm");
    expect(panelSource).toContain("form action={advanceJobStatusFromForm}");
    expect(panelSource).toContain("form action={markJobPartsNeededFromForm}");
    expect(panelSource).toContain("form action={markJobApprovalNeededFromForm}");
    expect(panelSource).toContain("form action={markJobUnableToCompleteFromForm}");
    expect(panelSource).toContain("name=\"job_id\"");
    expect(panelSource).toContain("name=\"current_status\"");
    expect(panelSource).toContain("name=\"tab\"");
    expect(panelSource).toContain("name=\"parts_note\"");
    expect(panelSource).toContain("name=\"approval_note\"");
    expect(panelSource).toContain("name=\"unable_note\"");
    expect(panelSource).toContain("markJobDifferentIssueFoundFromForm");
    expect(panelSource).toContain("form action={markJobDifferentIssueFoundFromForm}");
    expect(panelSource).toContain("name=\"different_issue_note\"");
    expect(panelSource).toContain("Confirm field work complete");
    expect(panelSource).toContain("Ready to finish this visit? This moves the job to closeout for invoice/certs as needed.");
    expect(panelSource).toContain("Can&apos;t finish today?");
    expect(panelSource).toContain("Need parts, approval, or unable to complete?");
    expect(panelSource).toContain("Need approval?");
    expect(panelSource).toContain("Unable to complete?");
    expect(panelSource).toContain("Send this visit to office/dispatch as Waiting on Part.");
    expect(panelSource).toContain("Send this visit to office/dispatch as Approval Needed.");
    expect(panelSource).toContain("Send this visit to office/dispatch for review.");
    expect(panelSource).toContain("Why couldn&apos;t the visit be completed?");
    expect(panelSource).toContain("placeholder=\"What part or issue is needed?\"");
    expect(panelSource).toContain("placeholder=\"Example: customer approval for repair, owner approval for added work\"");
    expect(panelSource).toContain("placeholder=\"Example: customer not home, no access, unsafe condition, missing information\"");
    expect(panelSource).toContain("placeholder=\"Example: original issue resolved, but separate airflow issue found in upstairs zone\"");
    expect(panelSource).toContain("Submit Parts Needed");
    expect(panelSource).toContain("Submit Approval Needed");
    expect(panelSource).toContain("Submit Unable to Complete");
    expect(panelSource).toContain("Submit Different Issue Found");
    expect(panelSource).toContain("Confirm Work Completed");
  });

  it("gates Different Issue Found to callback/revisit-only rendering", () => {
    expect(panelSource).not.toContain("route.code === \"work_completed\"");
    expect(panelSource).not.toContain('type="button"');
    expect(panelSource).not.toContain("Only Work Completed is wired in this slice. Other outcomes remain unwired until future slices.");
    expect(panelSource).toContain("props.showDifferentIssueFoundOutcome ? (");
    expect(panelSource).toContain("Callback/revisit-only: send this visit to office review without creating a new visit.");
    expect(panelSource).not.toContain("return_needed");
  });

  it("keeps ECC guardrail and section guidance copy", () => {
    expect(panelSource).toContain("ECC guardrail: Failed/retest outcomes come from ECC test completion.");
  });

  it("keeps open and on-the-way flow on existing start actions", () => {
    expect(jobDetailSource).toContain('!isFieldComplete && job.status !== "completed" && !showFieldOutcomePanel');
    expect(jobDetailSource).toContain('!isFieldComplete && !showFieldOutcomePanel ? (');
    expect(jobDetailSource).toContain(') : isFieldComplete || job.status === "completed" ? (');
  });
});