import { describe, expect, it } from "vitest";
import {
  resolveDefaultJobTypeForNewJobForm,
  resolveRestoredDraftJobType,
} from "@/app/jobs/new/new-job-defaults";

describe("new job defaults", () => {
  it("keeps contractor mode default on ECC regardless of initial product-mode default", () => {
    expect(
      resolveDefaultJobTypeForNewJobForm({
        contractorId: "contractor-1",
        initialJobType: "service",
        productMode: "hvac_service",
        isInternalMode: false,
      }),
    ).toBe("ecc");
  });

  it("uses internal initial product-mode default when not in contractor mode", () => {
    expect(
      resolveDefaultJobTypeForNewJobForm({
        contractorId: null,
        initialJobType: "service",
        productMode: "hybrid",
        isInternalMode: true,
      }),
    ).toBe("service");
    expect(
      resolveDefaultJobTypeForNewJobForm({
        contractorId: null,
        initialJobType: "ecc",
        productMode: "hybrid",
        isInternalMode: true,
      }),
    ).toBe("ecc");
  });

  it("locks internal defaults by product mode for normal product accounts", () => {
    expect(
      resolveDefaultJobTypeForNewJobForm({
        contractorId: null,
        initialJobType: "ecc",
        productMode: "hvac_service",
        isInternalMode: true,
      }),
    ).toBe("service");

    expect(
      resolveDefaultJobTypeForNewJobForm({
        contractorId: null,
        initialJobType: "service",
        productMode: "ecc_hers",
        isInternalMode: true,
      }),
    ).toBe("ecc");
  });

  it("keeps draft jobType as the winner only in hybrid internal mode", () => {
    expect(
      resolveRestoredDraftJobType({
        draftJobType: "service",
        defaultJobType: "ecc",
        productMode: "hybrid",
        isInternalMode: true,
      }),
    ).toBe("service");

    expect(
      resolveRestoredDraftJobType({
        draftJobType: undefined,
        defaultJobType: "ecc",
        productMode: "hybrid",
        isInternalMode: true,
      }),
    ).toBe("ecc");
  });

  it("overrides stale draft jobType for non-hybrid internal accounts", () => {
    expect(
      resolveRestoredDraftJobType({
        draftJobType: "ecc",
        defaultJobType: "service",
        productMode: "hvac_service",
        isInternalMode: true,
      }),
    ).toBe("service");

    expect(
      resolveRestoredDraftJobType({
        draftJobType: "service",
        defaultJobType: "ecc",
        productMode: "ecc_hers",
        isInternalMode: true,
      }),
    ).toBe("ecc");
  });
});
