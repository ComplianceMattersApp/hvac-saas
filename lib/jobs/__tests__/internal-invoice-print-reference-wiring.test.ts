import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/invoice/print/page.tsx"),
  "utf8",
);

describe("internal invoice print reference wiring", () => {
  it("uses shared short invoice reference helper for primary print title and summary", () => {
    expect(source).toContain('import { formatInvoiceDisplayReference, normalizeDisplayNumber } from "@/lib/utils/display-references";');
    expect(source).toContain("const invoiceReference = formatInvoiceDisplayReference({");
    expect(source).toContain("invoiceDisplayNumber: invoice.invoice_display_number");
    expect(source).toContain("invoiceNumber: invoice.invoice_number");
    expect(source).toContain("invoiceId: invoice.id");
    expect(source).toContain("{invoiceReference}");
    expect(source).not.toContain("Invoice {invoice.invoice_number}");
  });

  it("keeps legacy invoice number as secondary audit text when display number exists", () => {
    expect(source).toContain("const legacyInvoiceReference = normalizeDisplayNumber(invoice.invoice_display_number)");
    expect(source).toContain("Legacy ref: {legacyInvoiceReference}");
    expect(source).toContain("<dt>Legacy ref</dt>");
  });

  it("keeps existing line items and total blocks without platform fee copy", () => {
    expect(source).toContain("No billed line items were recorded.");
    expect(source).toContain("Total Due");
    expect(source).not.toContain("Platform fee");
  });
});
