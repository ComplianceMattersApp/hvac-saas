import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.join(process.cwd(), "app", "jobs", "[id]", "v2", "page.tsx"),
  "utf8",
);

const scrollSpyNavSource = readFileSync(
  path.join(process.cwd(), "app", "jobs", "[id]", "v2", "_components", "ScrollSpyNav.tsx"),
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

  it("badges jobs that started from the permit workflow", () => {
    expect(source).toContain("const startedFromPermitWorkflow =");
    expect(source).toContain("Created from permit request");
    expect(source).toContain("Permit Workflow");
  });

  it("keeps static identity chips in the title band without duplicating the job reference", () => {
    const headerIndex = source.indexOf('{" "}/ Jobs / <span');
    const headerSlice = source.slice(headerIndex, headerIndex + 3200);
    const railIndex = source.indexOf("RIGHT: command rail");
    const railSlice = source.slice(railIndex, railIndex + 1200);

    expect(headerIndex).toBeGreaterThanOrEqual(0);
    expect(headerSlice).toContain("{jobDisplayRef}");
    expect(headerSlice).toContain("{statusPill.label}");
    expect(headerSlice).toContain("ECC");
    expect(headerSlice).toContain("Permit Workflow");
    expect(railIndex).toBeGreaterThanOrEqual(0);
    expect(railSlice).not.toContain("{jobDisplayRef}");
    expect(railSlice).not.toContain("{statusPill.label}");
  });

  it("uses stronger typography and borders for V2 section and rail labels", () => {
    expect(source).toContain('letterSpacing: "0.11em"');
    expect(source).toContain('color: "oklch(0.42 0.025 262)"');
    expect(source).toContain('letterSpacing: "0.08em"');
    expect(source).toContain('color: "oklch(0.48 0.02 262)"');
    expect(source).toContain('border: "1px solid oklch(0.86 0.01 250)"');
    expect(source).toContain('borderTop: "1px solid oklch(0.88 0.008 250)"');
    expect(source).toContain('borderBottom: "1px solid oklch(0.88 0.008 250)"');
    expect(scrollSpyNavSource).toContain('const NAV_MUTED = "oklch(0.38 0.025 262)"');
    expect(scrollSpyNavSource).toContain('fontWeight: 700');
    expect(scrollSpyNavSource).toContain('background: isActive ? ACCENT : "oklch(0.84 0.01 250)"');
  });

  it("keeps admin archive controls available on the V2 job detail", () => {
    expect(source).toContain('archiveJobFromForm');
    expect(source).toContain('CancelJobButton');
    expect(source).toContain('{isAdmin ? (');
    expect(source).toContain('Danger Zone');
    expect(source).toContain('Archive Job');
    expect(source).toContain('<CancelJobButton jobId={jobId} />');
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
