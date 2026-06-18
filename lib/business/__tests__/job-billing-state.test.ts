import { describe, expect, it } from "vitest";
import {
  buildBillingTruthCloseoutProjectionMap,
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

  it("preserves waiting reasons when building closeout billing truth projections", async () => {
    const { projectionsByJobId } = await buildBillingTruthCloseoutProjectionMap({
      supabase: {},
      accountOwnerUserId: null,
      jobs: [
        {
          id: "permit-missing-needs-invoice",
          field_complete: true,
          job_type: "ecc",
          ops_status: "pending_info",
          pending_info_reason: "Permit Needed",
          on_hold_reason: null,
          permit_number: "PENDING",
          invoice_complete: false,
          certs_complete: false,
        },
      ],
    });

    expect(projectionsByJobId.get("permit-missing-needs-invoice")).toMatchObject({
      pending_info_reason: "Permit Needed",
      on_hold_reason: null,
      permit_number: "PENDING",
      invoice_complete: false,
      certs_complete: false,
    });
  });
});
