import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const editorPage = read("app/jobs/[id]/invoice/page.tsx");
const lineItemsTable = read("app/jobs/[id]/_components/InternalInvoiceLineItemsTable.tsx");
const invoiceActions = read("lib/actions/internal-invoice-actions.ts");
const estimateActions = read("lib/estimates/estimate-actions.ts");
const ledger = read("lib/reports/invoice-ledger.ts");
const reportPage = read("app/reports/invoices/page.tsx");
const pricebookPage = read("app/ops/admin/pricebook/page.tsx");

describe("invoice editor tax UI", () => {
  it("wires the rate and label inputs to the existing save action", () => {
    expect(editorPage).toContain('name="tax_settings_present"');
    expect(editorPage).toContain('name="tax_rate_percent"');
    expect(editorPage).toContain('name="tax_label"');
    expect(invoiceActions).toContain("applyInvoiceTaxSettingsFromForm");
    expect(invoiceActions).toContain("getTrimmedString(params.formData.get('tax_settings_present')) !== '1'");
  });

  it("keeps the quiet default: no rate and nothing taxable renders no tax fields", () => {
    expect(editorPage).toContain("const showTaxSettings =");
    expect(editorPage).toContain("invoiceTaxState!.ratePercent !== null");
    // Absent tax state (columns undeployed) disables the whole block.
    expect(editorPage).toContain("Boolean(invoiceTaxState)");
  });

  it("shows the exemption note instead of a rate the operator cannot use", () => {
    expect(editorPage).toContain("Tax exempt customer");
    expect(lineItemsTable).toContain("Tax exempt customer");
  });

  it("renders Subtotal / Tax / Total only once tax applies", () => {
    expect(lineItemsTable).toContain("const showTaxTotals = taxApplies && !tax!.customerTaxExempt;");
    expect(lineItemsTable).toContain("showTaxTotals ? 'Total' : 'Running Total'");
  });

  it("offers a per-line Taxable toggle carrying its presence marker", () => {
    expect(lineItemsTable).toContain('name="line_is_taxable"');
    expect(lineItemsTable).toContain('name="tax_fields_present"');
    expect(invoiceActions).toContain("line_is_taxable");
  });
});

describe("taxability travels with converted and imported lines", () => {
  it("snapshots is_taxable on estimate conversion", () => {
    expect(estimateActions).toContain("readPricebookTaxabilityByIds");
    expect(estimateActions).toContain("is_taxable: taxableByPricebookItemId.get(");
    // Converted invoices go through the shared seam, so tax applies to them too.
    expect(estimateActions).toContain("recalculateInvoiceTotals({ supabase, invoiceId, userId })");
  });

  it("snapshots is_taxable on visit-scope import", () => {
    expect(invoiceActions).toContain("source_visit_scope_item_id: scopeItemId,");
    expect(invoiceActions).toContain("is_taxable: await readPricebookItemTaxable({");
  });
});

describe("reports and pricebook admin", () => {
  it("adds a Tax column to the invoices report and its CSV", () => {
    expect(ledger).toContain('"Subtotal",\n    "Tax",\n    "Total",');
    expect(ledger).toContain("row.taxDisplay,");
    expect(reportPage).toContain("{row.taxDisplay}");
  });

  it("tolerates an undeployed tax column in the ledger query", () => {
    expect(ledger).toContain("isMissingInvoiceTaxColumnError(error)");
    expect(ledger).toContain("runLedgerQuery(LEDGER_COLUMNS_BASE)");
  });

  it("offers Taxable on both the create and edit pricebook forms", () => {
    // Two controls: one in the create form, one per row in the edit form.
    expect(pricebookPage.split('name="is_taxable"').length - 1).toBeGreaterThanOrEqual(2);
    expect(pricebookPage).toContain("taxColumnsDeployed");
  });
});
