import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/invoice/print/page.tsx"),
  "utf8",
);

describe("internal invoice print reference wiring", () => {
  it("uses shared short invoice reference helper for primary print title and summary", () => {
    expect(source).toContain("buildInternalInvoiceDocumentModel");
    expect(source).toContain("const invoiceReference = documentModel.invoiceReference;");
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
    expect(source).toContain("sm:flex-row sm:justify-between");
    expect(source).toContain("sm:justify-end sm:text-right");
    expect(source).toContain('alt={tenantIdentity.displayName}');
    expect(source).toContain("max-h-16 max-w-[180px]");
  });

  it("uses readable mobile line-item cards while preserving the desktop and print table", () => {
    expect(source).toContain("md:hidden print:hidden");
    expect(source).toContain("hidden md:block print:block");
    expect(source).toContain("<article key={lineItem.key}");
    expect(source).toContain("Quantity");
    expect(source).toContain("break-words");
  });

  it("prints the specifically selected primary or add-on invoice", () => {
    expect(source).toContain("requestedInvoiceIdValue");
    expect(source).toContain("resolveInternalInvoiceById");
    expect(source).toContain("(requestedInvoice.member_job_ids ?? [requestedInvoice.job_id]).includes(jobId)");
    expect(source).toContain("requestedInvoice.account_owner_user_id === internalUser.account_owner_user_id");
    expect(source).toContain("invoice_id=${encodeURIComponent(invoice.id)}");
  });

  it("formats billing contact details on separate lines without slash-separated contact copy", () => {
    expect(source).toContain("const billingEmail = documentModel.billing.email;");
    expect(source).toContain("const billingPhone = documentModel.billing.phone;");
    expect(source).toContain("{billingEmail ? <div");
    expect(source).toContain("{billingPhone ? <div");
    expect(source).not.toContain('join(" / ")');
  });

  it("keeps billing recipient separate from line-level service details", () => {
    expect(source).toContain('from "@/lib/business/internal-invoice-document";');
    expect(source).toContain("const billingAddress = documentModel.billing.addressLines;");
    expect(source).toContain("loadInternalInvoiceMemberPresentationContexts");
    expect(source).toContain("Service details are listed by line item below.");
    expect(source).not.toContain("invoiceServiceLocationMatchesBillingAddress");
    expect(source).not.toContain("Same as billing address");
    expect(source).not.toContain('Service Location:</span>{" "}');
  });

  it("renders line items with service location and customer context", () => {
    expect(source).toContain("Description");
    expect(source).toContain("Service Location");
    expect(source).toContain("Customer");
    expect(source).toContain("Qty");
    expect(source).toContain("Unit Price");
    expect(source).toContain("Subtotal");
    expect(source).toContain('{lineItem.serviceLocation || "Service location unavailable"}');
    expect(source).toContain("{lineItem.customerName}");
    expect(source).toContain("{lineItem.jobReference}");
  });

  it("removes internal payment notice language while keeping line items and total blocks", () => {
    expect(source).toContain("No billed line items were recorded.");
    expect(source).toContain("Description");
    expect(source).toContain("Service Location");
    expect(source).toContain("Customer");
    expect(source).toContain("Qty");
    expect(source).toContain("Unit Price");
    expect(source).toContain("Subtotal");
    expect(source).toContain("Balance Due");
    expect(source).toContain("Billing Recipient");
    expect(source).not.toContain("Payment + Billing Notice");
    expect(source).not.toContain("manual records");
    expect(source).not.toContain("Stripe-confirmed online payments");
    expect(source).not.toContain("webhook");
    expect(source).not.toContain("Platform fee");
  });
});
