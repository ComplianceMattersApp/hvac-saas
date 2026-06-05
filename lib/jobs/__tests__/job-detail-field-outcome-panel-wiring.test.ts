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
  });

  it("shows the active panel only for in-process not-yet-field-complete jobs", () => {
    expect(jobDetailSource).toContain("const isJobArchived = Boolean(job.deleted_at) || normalizedOpsStatus === \"archived\";");
    expect(jobDetailSource).toContain('const isJobClosed = normalizedOpsStatus === "closed";');
    expect(jobDetailSource).toContain('const isJobCancelled = normalizedJobStatus === "cancelled";');
    expect(jobDetailSource).toContain("const showFieldOutcomePanel =");
    expect(jobDetailSource).toContain("!isFieldComplete &&");
    expect(jobDetailSource).toContain('normalizedJobStatus === "in_process";');
  });

  it("wires only work_completed submit behavior", () => {
    expect(panelSource).toContain('import { advanceJobStatusFromForm } from "@/lib/actions/job-actions";');
    expect(panelSource).toContain("form action={advanceJobStatusFromForm}");
    expect(panelSource).toContain("name=\"job_id\"");
    expect(panelSource).toContain("name=\"current_status\"");
    expect(panelSource).toContain("name=\"tab\"");
    expect(panelSource).toContain("Confirm field work complete");
    expect(panelSource).toContain("Ready to finish this visit? This moves the job to closeout for invoice/certs as needed.");
    expect(panelSource).toContain("Confirm Work Completed");
  });

  it("does not render disabled future outcome controls in the default panel", () => {
    expect(panelSource).not.toContain("route.code === \"work_completed\"");
    expect(panelSource).not.toContain('type="button"');
    expect(panelSource).not.toContain("Only Work Completed is wired in this slice. Other outcomes remain unwired until future slices.");
  });

  it("keeps ECC guardrail and section guidance copy", () => {
    expect(panelSource).toContain("ECC guardrail: Failed/retest outcomes come from ECC test completion.");
  });

  it("keeps open and on-the-way flow on existing start actions", () => {
    expect(jobDetailSource).toContain('!isFieldComplete && job.status !== "completed" && !showFieldOutcomePanel');
    expect(jobDetailSource).toContain('!isFieldComplete && !showFieldOutcomePanel ? (');
  });
});