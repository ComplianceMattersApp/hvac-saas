import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.join(process.cwd(), "app", "jobs", "[id]", "v2", "page.tsx"),
  "utf8",
);

describe("desktop job detail V2 billing brief", () => {
  it("shows the intake billing recipient method instead of a section pointer", () => {
    expect(source).toContain("function formatBillingRecipientMethod");
    expect(source).toContain('billingRecipient === "contractor"');
    expect(source).toContain('billingRecipient === "customer"');
    expect(source).toContain('billingRecipient === "other"');
    expect(source).toContain("billingRecipientMethodLabel");
    expect(source).not.toContain("See billing section");
  });

  it("keeps billing completion truth visible in the brief", () => {
    expect(source).toContain("billedTruthSatisfied ? (");
    expect(source).toContain("COMPLETE");
  });

  it("routes unresolved internal invoice creation through direct draft creation", () => {
    const readyInvoiceIndex = source.indexOf("Ready to invoice");
    const readyInvoiceSlice = source.slice(readyInvoiceIndex, readyInvoiceIndex + 3200);

    expect(readyInvoiceIndex).toBeGreaterThanOrEqual(0);
    expect(source).toContain('import { createInternalInvoiceDraftFromForm } from "@/lib/actions/internal-invoice-actions";');
    expect(readyInvoiceSlice).toContain("billingState.usesInternalInvoicing ? (");
    expect(readyInvoiceSlice).toContain("createInternalInvoiceDraftFromForm");
    expect(readyInvoiceSlice).toContain("return_to");
    expect(readyInvoiceSlice).toContain("/invoice#invoice-workspace");
    expect(readyInvoiceSlice).toContain("auto_import_visit_scope_items");
    expect(readyInvoiceSlice).toContain("Create Invoice");
    expect(readyInvoiceSlice).not.toContain("Mark Externally Billed");
    expect(readyInvoiceSlice).not.toContain('href={`/jobs/${jobId}/invoice`}');
  });

  it("keeps external billing completion behind external lightweight billing mode", () => {
    const readyInvoiceIndex = source.indexOf("Ready to invoice");
    const readyInvoiceSlice = source.slice(readyInvoiceIndex, readyInvoiceIndex + 3200);

    expect(readyInvoiceSlice).toContain(") : canShowInvoiceButton ? (");
    expect(readyInvoiceSlice).toContain("markInvoiceCompleteFromForm");
    expect(readyInvoiceSlice).toContain("External Billing Complete");
    expect(source).not.toContain("Mark Externally Billed");
  });

  it("places billing closeout actions next to the certs completion action", () => {
    const railIndex = source.indexOf("Certs were sent");
    const railSlice = source.slice(railIndex, railIndex + 3600);

    expect(railIndex).toBeGreaterThanOrEqual(0);
    expect(railSlice).toContain("billingState.internalInvoicePanelEnabled");
    expect(railSlice).toContain("renderCloseoutBillingAction(S.primaryBtn");
    expect(railSlice).toContain("renderCloseoutBillingAction(S.outlineBtn");
    expect(railSlice).toContain("External Billing Complete");
    expect(railSlice).not.toContain("Send Certs");
    expect(railSlice).not.toContain("Send Invoice");
  });

  it("does not call field-complete jobs closed out while closeout blockers remain", () => {
    expect(source).toContain('isFailedUnresolved');
    expect(source).toContain('"Field Complete - Pending"');
    expect(source).toContain('"Field Complete"');
    expect(source).not.toContain('"Failure unresolved"');
  });

  it("does not describe unresolved failed jobs as fully closed out", () => {
    const failedBranch = source.indexOf('return "Field complete - pending closeout.";');
    const allDoneBranch = source.indexOf('return "All done');
    expect(failedBranch).toBeGreaterThan(-1);
    expect(allDoneBranch).toBeGreaterThan(-1);
    expect(failedBranch).toBeLessThan(allDoneBranch);
    expect(source).not.toContain("Failed test unresolved - review the failed reason and contractor report.");
  });

  it("keeps the failed ECC banner separate from the follow-up reminder surface", () => {
    expect(source).toContain("const canShowEccFailedReasonBanner = isEccJob");
    expect(source).toContain("const failedReasonBannerText = failedReasonBannerNote");
    expect(source).toContain("ops_board_failure_note");
    expect(source).toContain('id="failed-reason-banner"');
    expect(source).toContain("Save Failed Reason");
    expect(source).toContain('id="followup"');
  });

  it("treats follow-up notes as reminders that surface in Operations", () => {
    expect(source).toContain("const followUpReminderStatus = followUpDateValue");
    expect(source).toContain("Due now in Operations Follow Ups");
    expect(source).toContain("Visible in Operations Follow Ups; due");
    expect(source).toContain("highlights as the date approaches");
    expect(source).toContain("What should the office remember to do later?");
  });

  it("ports the legacy contractor report panel to desktop V2", () => {
    expect(source).toContain('import ContractorReportPanel from "../_components/ContractorReportPanel";');
    expect(source).toContain('const canShowContractorReportPanel = hasAssignedContractor && ["failed", "pending_info"].includes(opsStatus);');
    expect(source).toContain("<ContractorReportPanel jobId={jobId} />");
  });

  it("labels internal retail jobs when no contractor is selected", () => {
    expect(source).toContain('const contractorDisplayName = contractorName || "Retail";');
    expect(source).toContain("{contractorDisplayName}");
    expect(source).not.toContain('{contractorName || "—"}');
  });
});
