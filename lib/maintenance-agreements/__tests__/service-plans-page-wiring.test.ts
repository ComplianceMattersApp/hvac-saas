import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const servicePlansPageSource = readFileSync(
  resolve(__dirname, "../../../app/service-plans/page.tsx"),
  "utf-8",
);

describe("service plans template management wiring", () => {
  it("presents service plans as a landing page before template management", () => {
    expect(servicePlansPageSource).toContain(
      "Track recurring service agreements, upcoming visits, and plan templates.",
    );
    expect(servicePlansPageSource).toContain(
      "Customer plans are managed from each customer record. Templates standardize future assignments.",
    );
    expect(servicePlansPageSource).toContain("Plans Needing Attention");
    expect(servicePlansPageSource).toContain("Upcoming Service Plans");
    expect(servicePlansPageSource).toContain("Customer Service Plans");
    expect(servicePlansPageSource).toContain("Active Plans");
    expect(servicePlansPageSource).toContain("Due Next 7 Days");
    expect(servicePlansPageSource).toContain("Due Next 30 Days");
    expect(servicePlansPageSource).toContain("Templates Active");
    expect(servicePlansPageSource).toContain("Create Template");
    expect(servicePlansPageSource).toContain("Template Management");
  });

  it("wires template read model and actions from slice B", () => {
    expect(servicePlansPageSource).toContain("listMaintenanceAgreementTemplatesForAccount");
    expect(servicePlansPageSource).toContain("createMaintenanceAgreementTemplate");
    expect(servicePlansPageSource).toContain("updateMaintenanceAgreementTemplate");
    expect(servicePlansPageSource).toContain("archiveMaintenanceAgreementTemplate");
    expect(servicePlansPageSource).toContain("duplicateMaintenanceAgreementTemplate");
    expect(servicePlansPageSource).toContain("isTemplateStoreUnavailableError");
    expect(servicePlansPageSource).toContain("templateStoreUnavailable");
    expect(servicePlansPageSource).toContain("createTemplateFromForm");
    expect(servicePlansPageSource).toContain("updateTemplateFromForm");
    expect(servicePlansPageSource).toContain("archiveTemplateFromForm");
    expect(servicePlansPageSource).toContain("duplicateTemplateFromForm");
    expect(servicePlansPageSource).toContain("template_duplicated");
    expect(servicePlansPageSource).toContain("template_duplicate_failed");
    expect(servicePlansPageSource).toContain("Duplicate Template");
  });

  it("keeps active templates primary and archived templates secondary", () => {
    expect(servicePlansPageSource).toContain("Active Templates");
    expect(servicePlansPageSource).toContain("Archived Templates");
    expect(servicePlansPageSource).toContain("<details");
    expect(servicePlansPageSource).toContain('id="create-template-form"');
    expect(servicePlansPageSource).toContain("normalizeTemplateStatus(row.lifecycle_status) === \"active\"");
    expect(servicePlansPageSource).toContain("normalizeTemplateStatus(row.lifecycle_status) === \"archived\"");
    expect(servicePlansPageSource).toContain("{activeTemplates.length} active / {archivedTemplates.length} archived");
  });

  it("keeps existing customer service plans visibility read-only", () => {
    expect(servicePlansPageSource).toContain("Customer plans are managed from each customer record.");
    expect(servicePlansPageSource).toContain("Showing {result.rows.length} plan");
    expect(servicePlansPageSource).not.toContain("This page is read-only.");
  });

  it("uses user-friendly default work item copy without implementation wording", () => {
    expect(servicePlansPageSource).toContain("Default Work Items");
    expect(servicePlansPageSource).toContain("Optional default work items for future service visits.");
    expect(servicePlansPageSource).not.toContain("Default Work Items (JSON array)");
  });

  it("links customer plan actions directly to the customer Service Plans tab", () => {
    expect(servicePlansPageSource).toContain("?tab=service-plans&maFocus=");
    expect(servicePlansPageSource).toContain("?tab=service-plans");
    expect(servicePlansPageSource).toContain("Open Customer Plan");
    expect(servicePlansPageSource).not.toContain("Manage on Customer");
  });

  it("keeps status and due filters available", () => {
    expect(servicePlansPageSource).toContain('label: "All"');
    expect(servicePlansPageSource).toContain('label: "Active"');
    expect(servicePlansPageSource).toContain('label: "Overdue"');
    expect(servicePlansPageSource).toContain('label: "Due Today"');
    expect(servicePlansPageSource).toContain('label: "Due in 1-7 Days"');
    expect(servicePlansPageSource).toContain('label: "Due in 8-30 Days"');
    expect(servicePlansPageSource).toContain('label: "Not Scheduled"');
  });

  it("does not wire template actions into agreement creation or payment flows", () => {
    expect(servicePlansPageSource).not.toContain("createAgreementAction");
    expect(servicePlansPageSource).not.toContain("updateAgreementAction");
    expect(servicePlansPageSource).not.toContain("generateDraftInvoiceFromBillingPeriodAction");
    expect(servicePlansPageSource.toLowerCase()).not.toContain("autopay");
    expect(servicePlansPageSource.toLowerCase()).not.toContain("stripe");
    expect(servicePlansPageSource).not.toContain("createNextServiceVisitFromForm");
  });
});
