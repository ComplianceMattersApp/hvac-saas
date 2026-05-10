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
      }),
    ).toBe("ecc");
  });

  it("uses internal initial product-mode default when not in contractor mode", () => {
    expect(
      resolveDefaultJobTypeForNewJobForm({
        contractorId: null,
        initialJobType: "service",
      }),
    ).toBe("service");
    expect(
      resolveDefaultJobTypeForNewJobForm({
        contractorId: null,
        initialJobType: "ecc",
      }),
    ).toBe("ecc");
  });

  it("keeps draft jobType as the winner over the computed default", () => {
    expect(
      resolveRestoredDraftJobType({
        draftJobType: "service",
        defaultJobType: "ecc",
      }),
    ).toBe("service");

    expect(
      resolveRestoredDraftJobType({
        draftJobType: undefined,
        defaultJobType: "ecc",
      }),
    ).toBe("ecc");
  });
});
