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
  it("wires the panel near field action areas", () => {
    expect(jobDetailSource).toContain('import FieldOutcomePanel from "./_components/FieldOutcomePanel";');
    expect(jobDetailSource).toContain('<FieldOutcomePanel');
    expect(jobDetailSource).toContain('anchorId="field-outcome"');
    expect(jobDetailSource).toContain("const canSubmitWorkCompletedFromOutcomePanel = !isFieldComplete && job.status === \"completed\";");
    expect(jobDetailSource).toContain("canSubmitWorkCompleted={canSubmitWorkCompletedFromOutcomePanel}");
    expect(jobDetailSource).toContain("jobId={String(job.id)}");
  });

  it("guards panel visibility for closed, cancelled, and archived jobs", () => {
    expect(jobDetailSource).toContain("const isJobArchived = Boolean(job.deleted_at) || normalizedOpsStatus === \"archived\";");
    expect(jobDetailSource).toContain('const isJobClosed = normalizedOpsStatus === "closed";');
    expect(jobDetailSource).toContain('const isJobCancelled = normalizedJobStatus === "cancelled";');
    expect(jobDetailSource).toContain("const showFieldOutcomePanel = !(isJobClosed || isJobCancelled || isJobArchived);");
  });

  it("wires only work_completed and keeps other outcomes read-only", () => {
    expect(panelSource).toContain('listFieldOutcomeRoutes');
    expect(panelSource).toContain('import { markJobFieldCompleteFromForm } from "@/lib/actions/job-ops-actions";');
    expect(panelSource).toContain('route.code === "work_completed"');
    expect(panelSource).toContain("<form action={markJobFieldCompleteFromForm}>");
    expect(panelSource).toContain("name=\"job_id\"");
    expect(panelSource).toContain("Confirm Work Completed");
    expect(panelSource).toContain("Mark the job complete first, then confirm field completion.");
    expect(panelSource).toContain('type="button"');
    expect(panelSource).toContain("Only Work Completed is wired in this slice.");
  });

  it("preserves read-only behavior for field-complete and ECC guardrail copy", () => {
    expect(panelSource).toContain("Field complete is already recorded for this visit.");
    expect(panelSource).toContain("ECC guardrail: manual generic Failed is intentionally unavailable.");
    expect(panelSource).toContain("Failed/retest results come from ECC test completion.");
  });
});