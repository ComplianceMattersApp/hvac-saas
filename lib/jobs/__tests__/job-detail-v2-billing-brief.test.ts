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

  it("does not call field-complete jobs closed out while closeout blockers remain", () => {
    expect(source).toContain('closeoutNeeds.needsInvoice || closeoutNeeds.needsCerts ? "Field Complete" : "Closed out"');
  });

  it("keeps the failed ECC banner separate from the follow-up reminder surface", () => {
    expect(source).toContain("const canShowEccFailedReasonBanner = isEccJob");
    expect(source).toContain("const failedReasonBannerText = failedReasonBannerNote");
    expect(source).toContain('id="failed-reason-banner"');
    expect(source).toContain("Save Failed Reason");
    expect(source).toContain('id="followup"');
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
