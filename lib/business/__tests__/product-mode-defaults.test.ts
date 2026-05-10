import { describe, expect, it } from "vitest";
import {
  resolveJobTypeDefaultForProductMode,
  resolveProductModeFromSignals,
} from "@/lib/business/product-mode-defaults";

describe("product mode defaults", () => {
  it("defaults the owner brand to hybrid", () => {
    expect(
      resolveProductModeFromSignals({
        accountOwnerUserId: "owner-1",
        displayName: "Compliance Matters",
        contractorCount: 0,
      }),
    ).toBe("hybrid");
  });

  it("defaults HVAC service accounts to service when contractor signals are absent", () => {
    expect(
      resolveProductModeFromSignals({
        accountOwnerUserId: "angkor-owner",
        displayName: "Angkor Heating and Air",
        contractorCount: 0,
      }),
    ).toBe("hvac_service");
  });

  it("defaults ECC/HERS customer accounts to ECC/HERS when contractor signals exist", () => {
    expect(
      resolveProductModeFromSignals({
        accountOwnerUserId: "ecc-owner",
        displayName: "North Bay Compliance",
        contractorCount: 2,
      }),
    ).toBe("ecc_hers");
  });

  it("honors an explicit temporary override before fallback logic", () => {
    expect(
      resolveProductModeFromSignals({
        accountOwnerUserId: "explicit-owner",
        displayName: "Anything",
        contractorCount: 0,
        overridesByOwnerId: {
          "explicit-owner": "ecc_hers",
        },
      }),
    ).toBe("ecc_hers");
  });

  it("maps product mode to the expected /jobs/new default", () => {
    expect(resolveJobTypeDefaultForProductMode("hybrid")).toBe("ecc");
    expect(resolveJobTypeDefaultForProductMode("ecc_hers")).toBe("ecc");
    expect(resolveJobTypeDefaultForProductMode("hvac_service")).toBe("service");
  });
});