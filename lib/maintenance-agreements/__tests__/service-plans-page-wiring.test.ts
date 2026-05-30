import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const servicePlansPageSource = readFileSync(
  resolve(__dirname, "../../../app/service-plans/page.tsx"),
  "utf-8",
);

describe("service plans template management wiring", () => {
  it("adds template management copy and keeps template create prominent", () => {
    expect(servicePlansPageSource).toContain(
      "Templates help you standardize Service Plans before assigning them to customers.",
    );
    expect(servicePlansPageSource).toContain(
      "Creating a template does not create a customer Service Plan, job, invoice, or payment.",
    );
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
    expect(servicePlansPageSource).toContain("normalizeTemplateStatus(row.lifecycle_status) === \"active\"");
    expect(servicePlansPageSource).toContain("normalizeTemplateStatus(row.lifecycle_status) === \"archived\"");
  });

  it("keeps existing customer service plans visibility read-only", () => {
    expect(servicePlansPageSource).toContain("Existing customer Service Plans remain read-only on this page.");
    expect(servicePlansPageSource).toContain("This page is read-only.");
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
