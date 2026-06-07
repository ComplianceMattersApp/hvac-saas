import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf8",
);

describe("job detail field billing panel wiring", () => {
  it("attaches invoice readiness to the Work Items flow", () => {
    const workInvoiceIndex = source.indexOf("Work & Invoice");
    const invoiceStateIndex = source.indexOf("jobPageInvoiceStateLabel", workInvoiceIndex);
    const readyTotalIndex = source.indexOf("Ready-to-invoice total", workInvoiceIndex);
    const nextActionIndex = source.indexOf("jobPageInvoiceNextAction", workInvoiceIndex);

    expect(workInvoiceIndex).toBeGreaterThanOrEqual(0);
    expect(invoiceStateIndex).toBeGreaterThan(workInvoiceIndex);
    expect(readyTotalIndex).toBeGreaterThan(invoiceStateIndex);
    expect(nextActionIndex).toBeGreaterThan(readyTotalIndex);
    expect(source).toContain("Work performed - price - invoice status");
    expect(source).toContain("Invoice workspace handles official review, issue, send, and collection.");
  });

  it("labels the job Work Items editor as an add/update surface", () => {
    expect(source).toContain('{hasVisitScopeDefined ? "Add or Update Work" : "Add Work"}');
    expect(source).not.toContain("Edit Work Items");
  });

  it("keeps the separate Field Billing Summary only for non-duplicate details", () => {
    expect(source).toContain("const showSeparateFieldBillingDetails =");
    expect(source).toContain("!hasDirectInvoiceWorkflowAccess");
    expect(source).toContain("fieldBillingSummaryData.fieldChargeProposals.length > 0");
    expect(source).toContain("fieldBillingSupplementalInvoiceSnapshots.length > 0");

    const fieldBillingDetailsIndex = source.indexOf("{showSeparateFieldBillingDetails ? (");
    const reviewInvoiceIndex = source.indexOf("Review Invoice", fieldBillingDetailsIndex);
    const billingCopyIndex = source.indexOf(
      "Invoice Charges are billed scope. Work Items remain operational scope.",
      fieldBillingDetailsIndex,
    );
    const summaryIndex = source.indexOf("<FieldBillingSummary", fieldBillingDetailsIndex);

    expect(fieldBillingDetailsIndex).toBeGreaterThanOrEqual(0);
    expect(reviewInvoiceIndex).toBeGreaterThan(fieldBillingDetailsIndex);
    expect(billingCopyIndex).toBeGreaterThan(reviewInvoiceIndex);
    expect(summaryIndex).toBeGreaterThan(billingCopyIndex);
  });

  it("passes read-only summary and proposal entry data without requiring issued invoice state", () => {
    const summaryIndex = source.indexOf("<FieldBillingSummary", source.indexOf("{showSeparateFieldBillingDetails ? ("));
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
    expect(source).toContain("loadFieldBillingExplicitCapabilitiesForUser");
    expect(source).toContain("fieldBillingExplicitCapabilitiesRead");
    expect(source).toContain("explicitCapabilities: explicitFieldBillingCapabilities");
    expect(source).toContain("const canIssueInvoiceLifecycleAccess = hasInvoiceIssueAccess(fieldBillingCapabilities)");
    expect(source).toContain("const canSendInvoiceLifecycleAccess = hasInvoiceSendAccess(fieldBillingCapabilities)");
    expect(source).toContain("{canIssueInvoiceLifecycleAccess ? (");
    expect(source).toContain("{canSendInvoiceLifecycleAccess ? (");
    expect(source).toContain("Invoice issue authority is not available for your current role.");
    expect(source).toContain("Invoice send authority is not available for your current role.");
  });

  it("routes Build Invoice directly to the invoice workspace after draft creation", () => {
    const noInvoicePanelIndex = source.indexOf("Build a draft invoice from the Work Items when billing is ready.");
    const noInvoicePanelSlice = source.slice(noInvoicePanelIndex, noInvoicePanelIndex + 900);

    expect(noInvoicePanelIndex).toBeGreaterThanOrEqual(0);
    expect(noInvoicePanelSlice).toContain("createInternalInvoiceDraftFromForm");
    expect(noInvoicePanelSlice).toContain("return_to");
    expect(noInvoicePanelSlice).toContain("/invoice#invoice-workspace");
    expect(noInvoicePanelSlice).toContain("auto_import_visit_scope_items");
    expect(noInvoicePanelSlice).toContain("Build Invoice");
    expect(noInvoicePanelSlice).not.toContain("Create Draft Invoice");
  });

  it("keeps existing draft invoices on the review path instead of creating duplicates", () => {
    expect(source).toContain('internalInvoiceTruth.status === "draft" ? (internalInvoiceTruth.line_item_count > 0 ? "Review Invoice" : "Build Invoice") : "Open Invoice Workspace"');
    expect(source).toContain('internalInvoice.status === "draft"');
    expect(source).toContain("alreadyAdded: existingVisitScopeInvoiceSourceIds.has(persistedItemId)");
  });

  it("shows job-page Work Item pricing as invoice-ready context", () => {
    expect(source).toContain("visitScopeReadyTotalCents");
    expect(source).toContain("Ready-to-invoice total");
    expect(source).toContain("Price ${Number(item.expected_unit_price).toFixed(2)}");
    expect(source).toContain("Build an invoice later when billing is ready.");
    expect(source).toContain("Build invoice");
  });

  it("formats job-page invoice references through the short display helper", () => {
    expect(source).toContain('import { formatInvoiceDisplayReference, formatJobDisplayReference } from "@/lib/utils/display-references";');
    expect(source).toContain("const jobPageInvoiceDisplayReference = internalInvoiceTruth");
    expect(source).toContain("formatInvoiceDisplayReference({");
    expect(source).toContain("jobPageInvoiceSummaryText");
    expect(source).not.toContain('`${internalInvoiceTruth.invoice_number || "Invoice"} /');
  });
});
