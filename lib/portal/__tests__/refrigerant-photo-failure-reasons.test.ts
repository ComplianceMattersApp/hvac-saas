import { describe, expect, it } from "vitest";

import { extractFailureReasons } from "@/lib/portal/resolveContractorIssues";

describe("contractor refrigerant photo failure reasons", () => {
  it("prioritizes the explicit TXV photo finding over stale numeric failures", () => {
    expect(
      extractFailureReasons({
        test_type: "refrigerant_charge",
        override_pass: false,
        data: {
          photo_failure_reason: "txv_not_visible",
          photo_failure_details: "Provide a clear photo showing the installed TXV.",
        },
        computed: {
          status: "photo_evidence",
          failures: ["Filter drier not confirmed"],
          warnings: ["Missing superheat inputs"],
        },
      }),
    ).toEqual([
      "TXV / metering device is not visible in the refrigerant-charge photo.",
      "Provide a clear photo showing the installed TXV.",
    ]);
  });

  it("uses a safe photo-review reason for legacy failed photo records", () => {
    expect(
      extractFailureReasons({
        test_type: "refrigerant_charge",
        override_pass: false,
        data: {},
        computed: { status: "photo_evidence", failures: ["Filter drier not confirmed"] },
      }),
    ).toEqual(["Refrigerant-charge photo evidence did not pass review."]);
  });
});
