import { describe, expect, it } from "vitest";

import { isValidEccPermitNumber, shouldApplyEccPermitNeededBlocker } from "@/lib/ecc/permit-needed";

describe("ECC permit-needed helpers", () => {
  it("rejects blank and placeholder permit numbers", () => {
    for (const value of [null, "", "   ", "PENDING", "Not added", "N/A", "TBD", "unknown"]) {
      expect(isValidEccPermitNumber(value), `${String(value)} should not be a valid permit number`).toBe(false);
    }
  });

  it("accepts real permit identifiers", () => {
    expect(isValidEccPermitNumber("PERMIT-12345")).toBe(true);
    expect(isValidEccPermitNumber("B24-001234")).toBe(true);
  });

  it("reopens completed ECC permit follow-up even from stale closed or cert-complete projections", () => {
    expect(shouldApplyEccPermitNeededBlocker({
      job_type: "ecc",
      status: "completed",
      field_complete: true,
      certs_complete: false,
      permit_number: null,
      ops_status: "closed",
    })).toBe(true);
    expect(shouldApplyEccPermitNeededBlocker({
      job_type: "ecc",
      status: "completed",
      field_complete: true,
      certs_complete: true,
      permit_number: "PENDING",
      ops_status: "paperwork_required",
    })).toBe(true);
  });
});
