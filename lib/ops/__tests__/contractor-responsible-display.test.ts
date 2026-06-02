import { describe, expect, it } from "vitest";

import { resolveContractorResponsibleDisplay } from "@/lib/ops/contractor-responsible-display";

describe("resolveContractorResponsibleDisplay", () => {
  it("returns assigned contractor display when contractor is explicitly set", () => {
    const result = resolveContractorResponsibleDisplay({
      contractorName: "Alpha Air",
      internalBusinessDisplayName: "Compliance Matters",
    });

    expect(result).toEqual({
      label: "Alpha Air",
      state: "contractor_assigned",
    });
  });

  it("falls back to internal account display when contractor is not assigned", () => {
    const result = resolveContractorResponsibleDisplay({
      contractorName: "",
      internalBusinessDisplayName: "Compliance Matters",
    });

    expect(result).toEqual({
      label: "Compliance Matters",
      state: "internal_fallback",
    });
  });

  it("uses handled-by-company fallback when no internal business display is available", () => {
    const result = resolveContractorResponsibleDisplay({
      contractorName: "",
      internalBusinessDisplayName: "",
    });

    expect(result).toEqual({
      label: "Handled by your company",
      state: "internal_fallback",
    });
  });

  it("returns action-needed state only when contractor is explicitly required", () => {
    const result = resolveContractorResponsibleDisplay({
      contractorName: "",
      internalBusinessDisplayName: "Compliance Matters",
      requiresExternalContractor: true,
    });

    expect(result).toEqual({
      label: "Contractor assignment required",
      state: "missing_required_contractor",
    });
  });
});
