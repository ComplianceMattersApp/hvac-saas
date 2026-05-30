import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/invoice/page.tsx"),
  "utf8",
);

describe("internal invoice workspace saved-card charge wiring", () => {
  it("uses shared short invoice reference helper in the primary header", () => {
    expect(source).toContain('import { formatInvoiceDisplayReference } from "@/lib/utils/display-references";');
    expect(source).toContain("const invoiceHeaderReference = invoice");
    expect(source).toContain("formatInvoiceDisplayReference({");
    expect(source).toContain("invoiceDisplayNumber:");
    expect(source).toContain("invoiceNumber: invoice.invoice_number");
    expect(source).toContain("invoiceId: invoice.id");
    expect(source).toContain("{invoiceHeaderReference}");
    expect(source).not.toContain("Invoice ${invoice.invoice_number}");
  });

  it("keeps legacy invoice number as secondary audit text", () => {
    expect(source).toContain("const legacyInvoiceReference = invoice");
    expect(source).toContain("Legacy ref:");
    expect(source).toContain("String(invoice.invoice_number ?? \"\").trim() || null");
  });

  it("wires manual saved-card charge action and one-time copy", () => {
    expect(source).toContain("chargeSavedCardForIssuedInvoiceFromForm");
    expect(source).toContain("Charge saved card");
    expect(source).toContain("Charge saved card once");
    expect(source).toContain("This is not autopay");
    expect(source).toContain("no subscription is created");
    expect(source).toContain("recorded only after Stripe webhook confirmation");
  });

  it("preserves existing payment actions while adding saved-card control", () => {
    expect(source).toContain("Create payment link");
    expect(source).toContain("Record manual payment");
    expect(source).toContain("collectTenantInvoicePaymentNowFromForm");
    expect(source).toContain("recordInternalInvoicePaymentFromForm");
    expect(source).toContain("issueInternalInvoiceFromForm");
    expect(source).toContain("sendInternalInvoiceEmailFromForm");
    expect(source).toContain("voidInternalInvoiceFromForm");
    expect(source).toContain("Payment Options");
    expect(source).toContain("Payment History");
    expect(source).toContain("Audit / Technical Details");
    expect(source).not.toContain("Platform fee");
  });
});
