import { describe, expect, it } from "vitest";

import { isValidEccPermitNumber } from "@/lib/ecc/permit-needed";

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
});
