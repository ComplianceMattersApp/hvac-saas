import { describe, expect, it } from "vitest";
import { buildComplianceWorkSummary } from "../compliance-work-summary";

describe("Compliance Work summary", () => {
  it("reports missing prerequisites without inventing a required-test denominator", () => {
    expect(buildComplianceWorkSummary({
      equipmentCount: 0,
      eccRuns: [],
      hasValidPermit: false,
      permitNeeded: true,
    })).toEqual({
      equipment: "Missing",
      tests: "Not started",
      permit: "Needed",
      completionReport: "Needs tests",
    });
  });

  it("summarizes completed truth and gives failures precedence", () => {
    expect(buildComplianceWorkSummary({
      equipmentCount: 2,
      eccRuns: [
        { is_completed: true, computed_pass: true },
        { is_completed: true, computed_pass: false },
        { is_completed: false, computed_pass: false },
      ],
      hasValidPermit: true,
      permitNeeded: false,
    })).toEqual({
      equipment: "2 items",
      tests: "1 failed",
      permit: "Recorded",
      completionReport: "Ready",
    });
  });

  it("honors an explicit passing override over a failed computed result", () => {
    expect(buildComplianceWorkSummary({
      equipmentCount: 1,
      eccRuns: [{ is_completed: true, computed_pass: false, override_pass: true }],
      hasValidPermit: false,
      permitNeeded: false,
    }).tests).toBe("1 complete");
  });
});
