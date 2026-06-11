import { describe, expect, it } from "vitest";

import {
  formatEccEventLabel,
  formatEccOpsStatusLabel,
  formatEccRetestReadySignalLabel,
  isEccJobType,
} from "@/lib/ecc/ecc-workflow-display";

describe("ecc workflow display labels", () => {
  it("maps ECC failed/correction/retest statuses to user-facing labels", () => {
    expect(formatEccOpsStatusLabel("failed", "ops")).toBe("Failed / Correction Required");
    expect(formatEccOpsStatusLabel("pending_office_review", "ops")).toBe("Corrections Submitted / Under Review");
    expect(formatEccOpsStatusLabel("pending_office_review", "portal")).toBe("Under Review");
    expect(formatEccOpsStatusLabel("retest_needed", "ops")).toBe("Retest Needed");
  });

  it("maps retest-ready request events without implying internal confirmation", () => {
    expect(formatEccEventLabel("retest_ready_requested")).toBe("Retest Ready Requested");
    expect(formatEccRetestReadySignalLabel()).toBe("Retest Ready Requested");
  });

  it("keeps unknown statuses out of the ECC helper and detects ECC job type", () => {
    expect(formatEccOpsStatusLabel("pending_info", "ops")).toBeNull();
    expect(isEccJobType("ecc")).toBe(true);
    expect(isEccJobType("service")).toBe(false);
  });
});
