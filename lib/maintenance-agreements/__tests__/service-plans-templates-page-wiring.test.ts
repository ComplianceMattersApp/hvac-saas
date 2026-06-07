import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const templatesPageSource = readFileSync(
  resolve(__dirname, "../../../app/service-plans/templates/page.tsx"),
  "utf-8",
);

describe("service plans templates page wiring", () => {
  it("wires template read model and actions on dedicated templates route", () => {
    expect(templatesPageSource).toContain("listMaintenanceAgreementTemplatesForAccount");
    expect(templatesPageSource).toContain("createMaintenanceAgreementTemplate");
    expect(templatesPageSource).toContain("updateMaintenanceAgreementTemplate");
    expect(templatesPageSource).toContain("archiveMaintenanceAgreementTemplate");
    expect(templatesPageSource).toContain("duplicateMaintenanceAgreementTemplate");
    expect(templatesPageSource).toContain("createTemplateFromForm");
    expect(templatesPageSource).toContain("updateTemplateFromForm");
    expect(templatesPageSource).toContain("archiveTemplateFromForm");
    expect(templatesPageSource).toContain("duplicateTemplateFromForm");
    expect(templatesPageSource).toContain("/service-plans/templates");
    expect(templatesPageSource).toContain("/service-plans");
  });

  it("retains clean Default Visit Work language", () => {
    expect(templatesPageSource).toContain("Default Visit Work");
    expect(templatesPageSource).toContain("Describe the default work, checklist, or scope for future visits.");
    expect(templatesPageSource).toContain("Example: Inspect system, replace filter, check refrigerant charge, clean condenser coil.");
    expect(templatesPageSource).toContain("Leave blank if this template should not prefill visit work.");
    expect(templatesPageSource).not.toContain("Advanced default work items");
    expect(templatesPageSource).not.toContain("Default Work Items (JSON array)");
    expect(templatesPageSource).not.toContain("(JSON array)");
  });

  it("keeps active and archived template sections available", () => {
    expect(templatesPageSource).toContain("Template Management");
    expect(templatesPageSource).toContain("Create Template");
    expect(templatesPageSource).toContain("Active Templates");
    expect(templatesPageSource).toContain("Archived Templates");
    expect(templatesPageSource).toContain("Duplicate Template");
    expect(templatesPageSource).toContain("Archive Template");
  });
});
