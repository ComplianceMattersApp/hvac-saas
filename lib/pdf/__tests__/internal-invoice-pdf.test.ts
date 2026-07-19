import { afterEach, describe, expect, it, vi } from "vitest";
import type { InternalInvoiceDocumentModel } from "@/lib/business/internal-invoice-document";
import { buildInternalInvoicePdfAttachment, renderInternalInvoicePdf } from "@/lib/pdf/internal-invoice-pdf";

function model(lineCount = 1): InternalInvoiceDocumentModel {
  return {
    invoiceReference: "INV-3001",
    invoiceNumber: "3001",
    invoiceDateLabel: "07-19-2026",
    statusLabel: "Issued",
    jobTitle: "Long-form service invoice",
    business: { displayName: "EveryStep HVAC", supportEmail: "help@example.com", supportPhone: "555-0110", logoUrl: null },
    billing: { name: "Customer With A Long Business Name", email: null, phone: null, addressLines: [] },
    serviceLocation: "123 Long Service Location Boulevard, Sacramento CA 95814",
    customerName: "Customer Name",
    lineItems: Array.from({ length: lineCount }, (_, index) => ({
      key: `line-${index}`,
      name: `Service item ${index + 1}`,
      description: `Detailed service description ${index + 1} `.repeat(8),
      serviceLocation: "123 Long Service Location Boulevard, Sacramento CA 95814",
      customerName: "Customer Name",
      quantity: 1,
      quantityLabel: "1.00",
      unitPrice: 125,
      unitPriceLabel: "$125.00",
      subtotal: 125,
      subtotalLabel: "$125.00",
    })),
    subtotalCents: lineCount * 12500,
    subtotalLabel: `$${(lineCount * 125).toFixed(2)}`,
    totalCents: lineCount * 12500,
    totalLabel: `$${(lineCount * 125).toFixed(2)}`,
    amountPaidCents: 0,
    amountPaidLabel: "$0.00",
    balanceDueCents: lineCount * 12500,
    balanceDueLabel: `$${(lineCount * 125).toFixed(2)}`,
    paymentStatus: "unpaid",
    notes: null,
  };
}

describe("internal invoice PDF renderer", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders a valid invoice-only PDF buffer", async () => {
    const buffer = await renderInternalInvoicePdf(model());
    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(1000);
  }, 20_000);

  it("renders long multi-page input and builds the provider-neutral attachment", async () => {
    const attachment = await buildInternalInvoicePdfAttachment(model(45));
    expect(attachment.filename).toBe("Invoice-3001.pdf");
    expect(attachment.contentType).toBe("application/pdf");
    expect(attachment.content.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(attachment.content.toString("latin1")).toMatch(/\/Count\s+[2-9]/);
  }, 30_000);

  it("renders paid and partially paid presentation variants", async () => {
    const paid = model(3);
    paid.statusLabel = "Paid";
    paid.paymentStatus = "paid";
    paid.amountPaidCents = paid.totalCents;
    paid.amountPaidLabel = paid.totalLabel;
    paid.balanceDueCents = 0;
    paid.balanceDueLabel = "$0.00";

    const partial = model(3);
    partial.statusLabel = "Partially Paid";
    partial.paymentStatus = "partial";
    partial.amountPaidCents = 12500;
    partial.amountPaidLabel = "$125.00";
    partial.balanceDueCents = partial.totalCents - 12500;
    partial.balanceDueLabel = "$250.00";

    for (const buffer of await Promise.all([renderInternalInvoicePdf(paid), renderInternalInvoicePdf(partial)])) {
      expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(buffer.length).toBeGreaterThan(1000);
    }
  }, 30_000);

  it("falls back safely when the configured logo cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("logo unavailable"); }));
    const withBrokenLogo = model();
    withBrokenLogo.business.logoUrl = "https://example.invalid/logo.png";
    const buffer = await renderInternalInvoicePdf(withBrokenLogo);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  }, 20_000);
});
