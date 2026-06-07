import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/InternalInvoiceLineItemsTable.tsx"),
  "utf8",
);
const invoicePageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/invoice/page.tsx"),
  "utf8",
);
const jobDetailPageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf8",
);

describe("internal invoice line items table capability wiring", () => {
  it("accepts field billing capabilities and derives direct mutation booleans", () => {
    expect(source).toContain("capabilities: FieldBillingCapabilities");
    expect(source).toContain("const canAddPricebookLine = capabilities.can_select_pricebook_invoice_lines");
    expect(source).toContain("const canAddVisitScopeLine = capabilities.can_convert_visit_scope_to_invoice_lines");
    expect(source).toContain("const canAddManualLine = capabilities.can_add_manual_invoice_line");
    expect(source).toContain("const canEditAnyLine = canEditDescription || canEditQuantity || canEditPrice");
    expect(source).toContain("const canRemoveLine = capabilities.can_remove_invoice_line");
  });

  it("gates draft-line editor controls by granular capabilities", () => {
    expect(source).toContain("disabled={!canEditDescription}");
    expect(source).toContain("disabled={!canEditQuantity}");
    expect(source).toContain("disabled={!canEditPrice}");
    expect(source).toContain("{canEditAnyLine ? (");
    expect(source).toContain("{canRemoveLine ? (");
    expect(source).toContain("Draft invoice lines are visible, but no direct line mutations are available under your current permissions.");
  });

  it("keeps add-from-work-item and add-from-pricebook paths capability-aware", () => {
    expect(source).toContain("canAddVisitScopeLine && visitScopePickerItems.length > 0");
    expect(source).toContain("{canAddPricebookLine ? (");
    expect(source).toContain("{canAddManualLine && isAddFormOpen ? (");
  });

  it("shows Work Item price as carried into draft charges instead of always zero", () => {
    expect(invoicePageSource).toContain("expectedUnitPrice: sanitizedRow.expected_unit_price");
    expect(jobDetailPageSource).toContain("expectedUnitPrice: sanitizedRow.expected_unit_price ?? null");
    expect(source).toContain("expectedUnitPrice: number | null");
    expect(source).toContain("Recommended Path: Start with Work Performed");
    expect(source).toContain("Use Work Items when this charge comes from work completed on the job.");
    expect(source).toContain("Fallback Path: Add Charge from Pricebook");
    expect(source).toContain("Use direct invoice items for billing cleanup or add-ons that do not belong in Work Items.");
    expect(source).toContain("Add from Pricebook");
    expect(source).toContain("Use manual charges for billing cleanup or add-ons that were not captured as Work Items.");
    expect(source).toContain("Work Item price carries into the draft charge when available.");
    expect(source).toContain("Price {formatCurrencyFromAmount(item.expectedUnitPrice)}");
    expect(source).not.toContain("Imported Work Items start as draft Invoice Charges with Qty 1.00 and Unit Price $0.00.");
  });
});
