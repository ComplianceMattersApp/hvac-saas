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
    const summarySlice = source.slice(summaryIndex, summaryIndex + 900);

    expect(summarySlice).toContain("capabilities={fieldBillingCapabilities}");
    expect(summarySlice).toContain("parentProvidesInvoiceCta={hasDirectInvoiceWorkflowAccess}");
    expect(summarySlice).toContain("invoice={fieldBillingInvoiceSnapshot}");
    expect(summarySlice).toContain("supplementalInvoices={fieldBillingSupplementalInvoiceSnapshots}");
    expect(summarySlice).toContain("fieldChargeProposals={fieldBillingSummaryData.fieldChargeProposals}");
    expect(summarySlice).toContain("pricebookProposalItems={fieldChargeProposalPricebookItems}");
    expect(summarySlice).toContain("visitScopeProposalItems={fieldChargeProposalVisitScopeItems}");
    expect(summarySlice).not.toContain("status === \"issued\"");
  });

  it("keeps the immediate job-detail invoice read scoped to the primary invoice", () => {
    const immediateReadIndex = source.indexOf('.from("internal_invoices")');
    const immediateReadSlice = source.slice(immediateReadIndex, immediateReadIndex + 300);

    expect(immediateReadSlice).toContain('.eq("job_id", jobId)');
    expect(immediateReadSlice).toContain('.eq("invoice_kind", "primary")');
    expect(immediateReadSlice).toContain('.neq("status", "void")');
  });

  it("degrades field proposal summary reads without crashing job detail", () => {
    const fieldBillingReadIndex = source.indexOf("timedPhase(\"fieldBillingSummaryRead\"");
    const fieldBillingReadSlice = source.slice(fieldBillingReadIndex, fieldBillingReadIndex + 2200);

    expect(fieldBillingReadIndex).toBeGreaterThanOrEqual(0);
    expect(fieldBillingReadSlice).toContain("fieldChargeProposalsUnavailable");
    expect(fieldBillingReadSlice).toContain("return [] as Awaited<ReturnType<typeof listFieldChargeProposalsForJob>>");
    expect(fieldBillingReadSlice).toContain("resolveLatestVoidedInternalInvoiceByJobId");
  });

  it("gates issue and send controls through explicit field billing lifecycle capabilities", () => {
    expect(source).toContain("const canIssueInvoiceLifecycleAccess = hasInvoiceIssueAccess(fieldBillingCapabilities)");
    expect(source).toContain("const canSendInvoiceLifecycleAccess = hasInvoiceSendAccess(fieldBillingCapabilities)");
    expect(source).toContain("{canIssueInvoiceLifecycleAccess ? (");
    expect(source).toContain("{canSendInvoiceLifecycleAccess ? (");
    expect(source).toContain("Invoice issue authority is not available for your current role.");
    expect(source).toContain("Invoice send authority is not available for your current role.");
  });
});