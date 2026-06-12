import { describe, expect, it } from "vitest";
import {
  buildJobBillingStateReadModel,
  formatJobBillingDispositionLabel,
} from "@/lib/business/job-billing-state";

describe("job billing state read model", () => {
  it("treats no-charge disposition as resolved without marking money collected", () => {
    const state = buildJobBillingStateReadModel({
      billingMode: "internal_invoicing",
      invoiceComplete: true,
      billingDisposition: "no_charge",
      internalInvoice: {
        status: "draft",
        invoice_number: "INV-1",
        issued_at: null,
      },
    });

    expect(state.billedTruthSatisfied).toBe(true);
    expect(state.statusLabel).toBe("No Charge Recorded");
    expect(state.statusTone).toBe("emerald");
    expect(formatJobBillingDispositionLabel("no_charge")).toBe("No Charge Recorded");
  });

  it("treats externally billed disposition as resolved without requiring an issued invoice", () => {
    const state = buildJobBillingStateReadModel({
      billingMode: "internal_invoicing",
      invoiceComplete: true,
      billingDisposition: "externally_billed",
      internalInvoice: {
        status: "draft",
        invoice_number: "INV-2",
        issued_at: null,
      },
    });

    expect(state.billedTruthSatisfied).toBe(true);
    expect(state.statusLabel).toBe("Externally Billed");
    expect(state.statusTone).toBe("emerald");
    expect(formatJobBillingDispositionLabel("externally_billed")).toBe("Externally Billed");
  });
});
