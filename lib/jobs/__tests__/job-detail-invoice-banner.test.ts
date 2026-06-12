import { describe, expect, it } from "vitest";

import { shouldShowInternalInvoiceRequiredBanner } from "@/lib/jobs/job-detail-invoice-banner";

const baseInput = {
  isInternalUser: true,
  billingModeBlocksLightweightBilling: true,
  billedTruthSatisfied: false,
  needsInvoice: true,
  isCloseoutPending: false,
  currentOpsStatus: "open",
  jobType: "service",
};

describe("shouldShowInternalInvoiceRequiredBanner", () => {
  it("does not warn for a fresh internal-invoicing job only because no invoice exists", () => {
    expect(shouldShowInternalInvoiceRequiredBanner(baseInput)).toBe(false);
  });

  it("warns when closeout projection has reached invoice-required state", () => {
    expect(
      shouldShowInternalInvoiceRequiredBanner({
        ...baseInput,
        isCloseoutPending: true,
      }),
    ).toBe(true);
  });

  it("warns when ops state explicitly requires invoice workflow", () => {
    expect(
      shouldShowInternalInvoiceRequiredBanner({
        ...baseInput,
        currentOpsStatus: "invoice_required",
      }),
    ).toBe(true);
  });

  it("does not warn once billing truth is satisfied", () => {
    expect(
      shouldShowInternalInvoiceRequiredBanner({
        ...baseInput,
        isCloseoutPending: true,
        billedTruthSatisfied: true,
      }),
    ).toBe(false);
  });
});
