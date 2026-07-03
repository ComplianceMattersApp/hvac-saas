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

  it("treats legacy external-billing disposition as resolved even when invoice projection is stale", () => {
    const state = buildJobBillingStateReadModel({
      billingMode: "external_billing",
      invoiceComplete: false,
      billingDisposition: "externally_billed",
      internalInvoice: null,
    });

    expect(state.usesExternalBilling).toBe(true);
    expect(state.billedTruthSatisfied).toBe(true);
    expect(state.jobInvoiceCompleteProjection).toBe(false);
    expect(state.projectionMatchesBilledTruth).toBe(false);
    expect(state.statusLabel).toBe("Externally Billed");
    expect(state.statusTone).toBe("emerald");
  });

  it("treats legacy external-billing no-charge disposition as resolved even when invoice projection is stale", () => {
    const state = buildJobBillingStateReadModel({
      billingMode: "external_billing",
      invoiceComplete: false,
      billingDisposition: "no_charge",
      internalInvoice: null,
    });

    expect(state.billedTruthSatisfied).toBe(true);
    expect(state.jobInvoiceCompleteProjection).toBe(false);
    expect(state.projectionMatchesBilledTruth).toBe(false);
    expect(state.statusLabel).toBe("No Charge Recorded");
    expect(state.statusTone).toBe("emerald");
  });

  it("satisfies closeout billing truth from external billing disposition while draft invoice remains draft", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "internal_business_profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    account_owner_user_id: "owner-1",
                    display_name: "EveryStep FieldWorks",
                    billing_mode: "internal_invoicing",
                    created_at: "2026-01-01T00:00:00.000Z",
                    updated_at: "2026-01-01T00:00:00.000Z",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "internal_invoices") {
          return {
            select: () => ({
              neq: () => ({
                in: async () => ({
                  data: [
                    {
                      job_id: "job-1",
                      status: "draft",
                      invoice_number: "INV-2",
                      issued_at: null,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    const { projectionsByJobId } = await buildBillingTruthCloseoutProjectionMap({
      supabase,
      accountOwnerUserId: "owner-1",
      jobs: [
        {
          id: "job-1",
          field_complete: true,
          job_type: "service",
          ops_status: "invoice_required",
          invoice_complete: true,
          billing_disposition: "externally_billed",
          certs_complete: true,
        },
      ],
    });

    expect(projectionsByJobId.get("job-1")).toMatchObject({
      invoice_complete: true,
      billingState: {
        internalInvoiceStatus: "draft",
        billedTruthSatisfied: true,
        statusLabel: "Externally Billed",
      },
    });
  });

  it("satisfies closeout billing truth from legacy external billing disposition in external billing mode", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "internal_business_profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    account_owner_user_id: "owner-1",
                    display_name: "EveryStep FieldWorks",
                    billing_mode: "external_billing",
                    created_at: "2026-01-01T00:00:00.000Z",
                    updated_at: "2026-01-01T00:00:00.000Z",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    const { projectionsByJobId } = await buildBillingTruthCloseoutProjectionMap({
      supabase,
      accountOwnerUserId: "owner-1",
      jobs: [
        {
          id: "job-1",
          field_complete: true,
          job_type: "service",
          ops_status: "closed",
          invoice_complete: false,
          billing_disposition: "externally_billed",
          certs_complete: true,
        },
      ],
    });

    expect(projectionsByJobId.get("job-1")).toMatchObject({
      invoice_complete: true,
      billingState: {
        billedTruthSatisfied: true,
        jobInvoiceCompleteProjection: false,
        projectionMatchesBilledTruth: false,
        statusLabel: "Externally Billed",
      },
    });
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
