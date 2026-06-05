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

  it("shows the active panel only for completed and not-yet-field-complete jobs", () => {
    expect(jobDetailSource).toContain("const isJobArchived = Boolean(job.deleted_at) || normalizedOpsStatus === \"archived\";");
    expect(jobDetailSource).toContain('const isJobClosed = normalizedOpsStatus === "closed";');
    expect(jobDetailSource).toContain('const isJobCancelled = normalizedJobStatus === "cancelled";');
    expect(jobDetailSource).toContain("const showFieldOutcomePanel =");
    expect(jobDetailSource).toContain("!isFieldComplete &&");
    expect(jobDetailSource).toContain('job.status === "completed";');
  });

  it("wires only work_completed submit behavior", () => {
    expect(panelSource).toContain('import { markJobFieldCompleteFromForm } from "@/lib/actions/job-ops-actions";');
    expect(panelSource).toContain("form action={markJobFieldCompleteFromForm}");
    expect(panelSource).toContain("name=\"job_id\"");
    expect(panelSource).toContain("Confirm field work complete");
    expect(panelSource).toContain("Field work is marked complete and can move to closeout or billing as applicable.");
    expect(panelSource).toContain("Confirm Work Completed");
  });

  it("does not render disabled future outcome controls in the default panel", () => {
    expect(panelSource).not.toContain("route.code === \"work_completed\"");
    expect(panelSource).not.toContain('type="button"');
    expect(panelSource).toContain("Only Work Completed is wired in this slice. Other outcomes remain unwired until future slices.");
  });

  it("keeps ECC guardrail and section guidance copy", () => {
    expect(panelSource).toContain("Notes, photos, tests, and work items stay in their sections.");
    expect(panelSource).toContain("ECC guardrail: manual generic Failed is intentionally unavailable.");
    expect(panelSource).toContain("Failed/retest results come from ECC test completion.");
  });
});