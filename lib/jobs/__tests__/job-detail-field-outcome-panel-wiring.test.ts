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
  it("wires the read-only panel near field action areas", () => {
    expect(jobDetailSource).toContain('import FieldOutcomePanel from "./_components/FieldOutcomePanel";');
    expect(jobDetailSource).toContain('<FieldOutcomePanel');
    expect(jobDetailSource).toContain('anchorId="field-outcome"');
  });

  it("guards panel visibility for closed, cancelled, and archived jobs", () => {
    expect(jobDetailSource).toContain("const isJobArchived = Boolean(job.deleted_at) || normalizedOpsStatus === \"archived\";");
    expect(jobDetailSource).toContain('const isJobClosed = normalizedOpsStatus === "closed";');
    expect(jobDetailSource).toContain('const isJobCancelled = normalizedJobStatus === "cancelled";');
    expect(jobDetailSource).toContain("const showFieldOutcomePanel = !(isJobClosed || isJobCancelled || isJobArchived);");
  });

  it("keeps the panel non-mutating and ECC-safe", () => {
    expect(panelSource).toContain('listFieldOutcomeRoutes');
    expect(panelSource).toContain("Field complete is already recorded for this visit.");
    expect(panelSource).toContain("Submission wiring is coming in a future slice.");
    expect(panelSource).toContain("ECC guardrail: manual generic Failed is intentionally unavailable.");
    expect(panelSource).toContain("Failed/retest results come from ECC test completion.");
  });
});