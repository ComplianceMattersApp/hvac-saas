import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/invoice/print/page.tsx"),
  "utf8",
);

describe("internal invoice print reference wiring", () => {
  it("uses shared short invoice reference helper for primary print title and summary", () => {
    expect(source).toContain('import { formatInvoiceDisplayReference } from "@/lib/utils/display-references";');
    expect(source).toContain("const invoiceReference = formatInvoiceDisplayReference({");
    expect(source).toContain("invoiceDisplayNumber: invoice.invoice_display_number");
    expect(source).toContain("invoiceNumber: invoice.invoice_number");
    expect(source).toContain("invoiceId: invoice.id");
    expect(source).toContain("{invoiceReference}");
    expect(source).toContain("<h1");
    expect(source).not.toContain("Invoice {invoice.invoice_number}");
  });

  it("does not render legacy invoice references in the customer-facing print view", () => {
    expect(source).not.toContain("normalizeDisplayNumber");
    expect(source).not.toContain("legacyInvoiceReference");
    expect(source).not.toContain("Legacy ref");
    expect(source).not.toContain("<dt>Legacy ref</dt>");
    expect(source).not.toContain("INV-");
  });

  it("uses a compact header with the logo or company mark across from the invoice title", () => {
    expect(source).toContain("flex items-start justify-between gap-6");
    expect(source).toContain("justify-end text-right");
    expect(source).toContain('alt={tenantIdentity.displayName}');
    expect(source).toContain("max-h-16 max-w-[180px]");
  });

  it("formats billing contact details on separate lines without slash-separated contact copy", () => {
    expect(source).toContain("const billingEmail = String(invoice.billing_email ?? \"\").trim();");
    expect(source).toContain("const billingPhone = String(invoice.billing_phone ?? \"\").trim();");
    expect(source).toContain("{billingEmail ? <div");
    expect(source).toContain("{billingPhone ? <div");
    expect(source).not.toContain('join(" / ")');
  });

  it("avoids duplicating the same billing and service address while still labeling different service locations", () => {
    expect(source).toContain('from "@/lib/business/internal-invoice-address-rendering";');
    expect(source).toContain("formatInvoiceBillingAddressLines(invoice, (job as any).billing_recipient)");
    expect(source).toContain("invoiceServiceLocationMatchesBillingAddress({");
    expect(source).toContain("billingRecipient: (job as any).billing_recipient");
    expect(source).toContain('Service Location:</span>{" "}');
    expect(source).toContain('serviceLocationMatchesBilling ? "Same as billing address" : serviceLocationLabel');
  });

  it("removes internal payment notice language while keeping line items and total blocks", () => {
    expect(source).toContain("No billed line items were recorded.");
    expect(source).toContain("Description");
    expect(source).toContain("Qty");
    expect(source).toContain("Unit Price");
    expect(source).toContain("Subtotal");
    expect(source).toContain("Total Due");
    expect(source).toContain("Billing Recipient");
    expect(source).toContain("Service Location:");
    expect(source).not.toContain("Payment + Billing Notice");
    expect(source).not.toContain("manual records");
    expect(source).not.toContain("Stripe-confirmed online payments");
    expect(source).not.toContain("webhook");
    expect(source).not.toContain("Platform fee");
  });
});
