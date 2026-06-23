import { describe, expect, it } from "vitest";
import {
  resolveJobInvoiceActionLabel,
  resolveJobInvoiceStateLabel,
} from "@/lib/jobs/job-invoice-action";

describe("job invoice action labels", () => {
  it("labels no-invoice jobs as invoice creation unless billing is already resolved", () => {
    expect(resolveJobInvoiceActionLabel({ hasInvoice: false })).toBe("Create Invoice");
    expect(
      resolveJobInvoiceActionLabel({
        hasInvoice: false,
        billedTruthSatisfied: true,
      }),
    ).toBe("View Billing Details");
  });

  it("labels draft invoices by total and Work Item import context", () => {
    expect(
      resolveJobInvoiceActionLabel({
        hasInvoice: true,
        invoiceStatus: "draft",
        invoiceTotalCents: 12500,
        hasInvoiceCharges: true,
      }),
    ).toBe("Issue Invoice");
    expect(
      resolveJobInvoiceActionLabel({
        hasInvoice: true,
        invoiceStatus: "draft",
        invoiceTotalCents: 0,
        hasInvoiceCharges: false,
        eligibleUnaddedPricedWorkItemsTotalCents: 25000,
      }),
    ).toBe("Add Work Items to Invoice");
    expect(
      resolveJobInvoiceActionLabel({
        hasInvoice: true,
        invoiceStatus: "draft",
        invoiceTotalCents: 0,
        hasInvoiceCharges: false,
      }),
    ).toBe("Review Draft Invoice");
    expect(
      resolveJobInvoiceActionLabel({
        hasInvoice: true,
        invoiceStatus: "draft",
        invoiceTotalCents: 0,
        hasInvoiceCharges: true,
        eligibleUnaddedPricedWorkItemsTotalCents: 25000,
      }),
    ).toBe("Review Draft Invoice");
  });

  it("labels issued invoices from recorded payment truth", () => {
    expect(
      resolveJobInvoiceActionLabel({
        hasInvoice: true,
        invoiceStatus: "issued",
        invoiceTotalCents: 10000,
        paymentStatus: "unpaid",
        balanceDueCents: 10000,
      }),
    ).toBe("Collect Payment");
    expect(
      resolveJobInvoiceActionLabel({
        hasInvoice: true,
        invoiceStatus: "issued",
        invoiceTotalCents: 10000,
        paymentStatus: "partial",
        balanceDueCents: 2500,
      }),
    ).toBe("Collect Balance");
    expect(
      resolveJobInvoiceActionLabel({
        hasInvoice: true,
        invoiceStatus: "issued",
        invoiceTotalCents: 10000,
        paymentStatus: "paid",
        balanceDueCents: 0,
      }),
    ).toBe("View Paid Invoice");
  });

  it("does not translate billing dispositions into paid invoice language", () => {
    expect(
      resolveJobInvoiceActionLabel({
        hasInvoice: true,
        invoiceStatus: "draft",
        invoiceTotalCents: 0,
        billingDispositionLabel: "No Charge Recorded",
      }),
    ).toBe("No Charge Recorded");
    expect(
      resolveJobInvoiceStateLabel({
        hasInvoice: true,
        invoiceStatus: "draft",
        invoiceTotalCents: 0,
        billingDispositionLabel: "Externally Billed",
      }),
    ).toBe("Externally Billed");
  });

  it("labels voided invoices as read-only invoice access", () => {
    expect(
      resolveJobInvoiceActionLabel({
        hasInvoice: true,
        invoiceStatus: "void",
        invoiceTotalCents: 10000,
      }),
    ).toBe("View Voided Invoice");
  });
});
