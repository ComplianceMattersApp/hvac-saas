import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const contractorReportPanelSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/ContractorReportPanel.tsx"),
  "utf8",
);

describe("contractor report panel fallback wiring", () => {
  it("uses company fallback copy instead of missing-contractor wording", () => {
    expect(contractorReportPanelSource).toContain("Handled by your company");
    expect(contractorReportPanelSource).not.toContain("Not assigned");
  });
});
