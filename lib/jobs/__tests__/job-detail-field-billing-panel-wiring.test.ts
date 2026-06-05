import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf8",
);

describe("job detail field billing panel wiring", () => {
  it("renders FieldBillingSummary inside the visible Billing card", () => {
    const billingCardIndex = source.indexOf("{showInternalInvoicePanel ? (");
    const reviewInvoiceIndex = source.indexOf("Review Invoice", billingCardIndex);
    const billingCopyIndex = source.indexOf(
      "Invoice Charges are billed scope. Work Items remain operational scope.",
      billingCardIndex,
    );
    const summaryIndex = source.indexOf("<FieldBillingSummary", billingCardIndex);

    expect(billingCardIndex).toBeGreaterThanOrEqual(0);
    expect(reviewInvoiceIndex).toBeGreaterThan(billingCardIndex);
    expect(billingCopyIndex).toBeGreaterThan(reviewInvoiceIndex);
    expect(summaryIndex).toBeGreaterThan(billingCopyIndex);
  });

  it("passes read-only summary and proposal entry data without requiring issued invoice state", () => {
    const summaryIndex = source.indexOf("<FieldBillingSummary", source.indexOf("{showInternalInvoicePanel ? ("));
    const summarySlice = source.slice(summaryIndex, summaryIndex + 700);

    expect(summarySlice).toContain("capabilities={fieldBillingCapabilities}");
    expect(summarySlice).toContain("invoice={fieldBillingInvoiceSnapshot}");
    expect(summarySlice).toContain("fieldChargeProposals={fieldBillingSummaryData.fieldChargeProposals}");
    expect(summarySlice).toContain("pricebookProposalItems={fieldChargeProposalPricebookItems}");
    expect(summarySlice).toContain("visitScopeProposalItems={fieldChargeProposalVisitScopeItems}");
    expect(summarySlice).not.toContain("status === \"issued\"");
  });
});