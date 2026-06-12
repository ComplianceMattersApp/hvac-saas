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
    expect(source).toContain("const canAddManualLine = capabilities.can_add_manual_invoice_line");
    expect(source).toContain("const canAddInvoiceLine = canAddPricebookLine || canAddManualLine");
    expect(source).toContain("const canAddVisitScopeLine = capabilities.can_convert_visit_scope_to_invoice_lines");
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
    expect(source).toContain("canAddVisitScopeLine && eligibleVisitScopeItems.length > 0");
    expect(source).toContain("{canAddInvoiceLine && isAddFormOpen ? (");
    expect(source).toContain("{canAddPricebookLine ? (");
    expect(source).toContain("{canAddManualLine ? (");
    expect(source).toContain(") : canAddInvoiceLine ? (");
  });

  it("shows Work Item price as carried into draft charges instead of always zero", () => {
    expect(invoicePageSource).toContain("expectedUnitPrice: sanitizedRow.expected_unit_price");
    expect(jobDetailPageSource).toContain("expectedUnitPrice: sanitizedRow.expected_unit_price ?? null");
    expect(source).toContain("expectedUnitPrice: number | null");
    expect(source).toContain("const eligibleVisitScopeItems = visitScopePickerItems.filter((item) => !item.alreadyAdded)");
    expect(source).toContain("canAddVisitScopeLine && eligibleVisitScopeItems.length > 0");
    expect(source).toContain("eligibleVisitScopeItems.map((item)");
    expect(source).toContain("Recommended Path: Start with Work Performed");
    expect(source).toContain("Use Work Items when this charge comes from work completed on the job.");
    expect(source).not.toContain("All available Work Items are already on this draft invoice.");
    expect(source).not.toContain("Already added");
    expect(source).toContain("Add another charge");
    expect(source).toContain("Use this for fees, add-ons, or anything not already listed on the invoice.");
    expect(source).toContain("const [selectedPricebookItemId, setSelectedPricebookItemId] = useState<string>('');");
    expect(source).toContain("const [pricebookSearchQuery, setPricebookSearchQuery] = useState('');");
    expect(source).toContain("const filteredPricebookPickerItems = pricebookSearch");
    expect(source).toContain('placeholder="Search Pricebook services..."');
    expect(source).toContain("Search Pricebook");
    expect(source).toContain("Manual Charge");
    expect(source).toContain("disabled={!selectedPricebookItemId}");
    expect(source).toContain("setSelectedPricebookItemId('');");
    expect(source).toContain("setIsAddFormOpen(false);");
    expect(source).toContain("Add Charge");
    expect(source).not.toContain("Fallback Path: Add Charge from Pricebook");
    expect(source).not.toContain("Pricebook Service / Charge");
    expect(source).not.toContain("Add from Pricebook");
    expect(source).toContain("Work Item price carries into the draft charge when available.");
    expect(source).toContain("Price {formatCurrencyFromAmount(item.expectedUnitPrice)}");
    expect(source).not.toContain("Imported Work Items start as draft Invoice Charges with Qty 1.00 and Unit Price $0.00.");
  });

  it("renders the single add-charge flow below existing invoice lines", () => {
    const linesIndex = source.indexOf("{lineItems.map((lineItem, index) => {");
    const addPricebookFormIndex = source.indexOf("action={handleAddPricebook}");
    const addChargeEntryIndex = source.lastIndexOf("onClick={() => setIsAddFormOpen(true)}");
    const runningTotalIndex = source.indexOf("Running Total");

    expect(linesIndex).toBeGreaterThan(-1);
    expect(addPricebookFormIndex).toBeGreaterThan(linesIndex);
    expect(addChargeEntryIndex).toBeGreaterThan(linesIndex);
    expect(runningTotalIndex).toBeGreaterThan(addChargeEntryIndex);
    expect(source.indexOf("action={handleAddPricebook}")).toBe(source.lastIndexOf("action={handleAddPricebook}"));
  });

  it("renders a compact zero-dollar decision rail above charges without adding outcome actions", () => {
    const zeroRailIndex = source.indexOf("$0.00 invoice - choose how to handle it");
    const resolvedRailIndex = source.indexOf("Billing is handled for this $0.00 invoice. No payment was recorded.");
    const headerIndex = source.indexOf("Invoice Charge");
    const bottomAddFormIndex = source.indexOf("action={handleAddPricebook}");

    expect(source).toContain("Number(totalCents ?? 0) === 0");
    expect(source).toContain("billingDispositionLabel");
    expect(resolvedRailIndex).toBeGreaterThan(-1);
    expect(resolvedRailIndex).toBeLessThan(zeroRailIndex);
    expect(zeroRailIndex).toBeGreaterThan(-1);
    expect(zeroRailIndex).toBeLessThan(headerIndex);
    expect(zeroRailIndex).toBeLessThan(bottomAddFormIndex);
    expect(source).toContain("Add a charge if billing is missing. No Charge resolves billing without collecting money. Externally Billed resolves billing handled outside Compliance Matters.");
    expect(source).toContain("Mark No Charge");
    expect(source).toContain("Externally Billed");
    expect(source).toContain("Send $0 Invoice");
    expect(source).toContain("Sending a no-payment-due invoice needs an approved zero-dollar issued invoice model.");
    expect(source).not.toContain("sendZeroDollarInvoice");
  });

  it("keeps Add Charge wired to the existing pricebook invoice action fields", () => {
    const pricebookFormIndex = source.indexOf("action={handleAddPricebook}");
    const pricebookFormSlice = source.slice(pricebookFormIndex, pricebookFormIndex + 6000);

    expect(pricebookFormSlice).toContain('name="job_id" value={jobId}');
    expect(pricebookFormSlice).toContain('name="invoice_id" value={selectedInvoiceId}');
    expect(pricebookFormSlice).toContain('name="tab" value={tab}');
    expect(pricebookFormSlice).toContain('type="search"');
    expect(pricebookFormSlice).toContain('name="pricebook_item_id" value={selectedPricebookItemId}');
    expect(pricebookFormSlice).toContain('name="quantity"');
    expect(pricebookFormSlice).toContain('defaultValue="1.00"');
    expect(pricebookFormSlice).toContain("disabled={!selectedPricebookItemId}");
    expect(source).toContain("Cancel");
    expect(pricebookFormSlice).toContain("Add Pricebook Charge");
  });

  it("keeps manual charge entry wired to the manual invoice action fields", () => {
    const manualFormIndex = source.indexOf("action={handleAddManual}");
    const manualFormSlice = source.slice(manualFormIndex, manualFormIndex + 4000);

    expect(source).toContain("async function handleAddManual(formData: FormData)");
    expect(source).toContain("action: addLineItemAction");
    expect(manualFormSlice).toContain('name="job_id" value={jobId}');
    expect(manualFormSlice).toContain('name="invoice_id" value={selectedInvoiceId}');
    expect(manualFormSlice).toContain('name="tab" value={tab}');
    expect(manualFormSlice).toContain('name="item_name"');
    expect(manualFormSlice).toContain('placeholder="Type invoice charge..."');
    expect(manualFormSlice).toContain('name="item_type"');
    expect(manualFormSlice).toContain('name="quantity"');
    expect(manualFormSlice).toContain('name="unit_price"');
    expect(manualFormSlice).toContain('name="description"');
    expect(manualFormSlice).toContain("Add Manual Charge");
  });

  it("does not use the old select-only pricebook entry helper for invoice charge adds", () => {
    expect(source).not.toContain("<PricebookLineEntryFields");
    expect(source).not.toContain("includeEmptyOption");
    expect(source).not.toContain('emptyOptionLabel="Select a charge..."');
  });
});
