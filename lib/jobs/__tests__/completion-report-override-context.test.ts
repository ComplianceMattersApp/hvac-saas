import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const completionReportSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/tests/page.tsx"),
  "utf8",
);

describe("completion report override context", () => {
  it("shows the saved reason and notes for airflow overrides", () => {
    expect(completionReportSource).toContain("sys.runAirflow?.override_pass != null");
    expect(completionReportSource).toContain(
      "Override reason / notes: {fallbackText(sys.runAirflow?.override_reason)}",
    );
  });

  it("shows the saved reason and notes for duct leakage overrides", () => {
    expect(completionReportSource).toContain("sys.runDuct?.override_pass != null");
    expect(completionReportSource).toContain(
      "Override reason / notes: {fallbackText(sys.runDuct?.override_reason)}",
    );
  });
});
