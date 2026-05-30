import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const customerPageSource = readFileSync(
  resolve(__dirname, "../../../app/customers/[id]/page.tsx"),
  "utf8",
);

const addAgreementTemplateBlock =
  customerPageSource.match(/Start from template[\s\S]*?Save Maintenance Agreement/)?.[0] ?? "";

describe("customer service-plan template prefill wiring", () => {
  it("wires template read model for add-maintenance-agreement prefill", () => {
    expect(customerPageSource).toContain("listMaintenanceAgreementTemplatesForAccount");
    expect(customerPageSource).toContain("selectedAgreementTemplate");
    expect(customerPageSource).toContain('name="maTemplate"');
    expect(customerPageSource).toContain("Load Template");
    expect(customerPageSource).toContain("No template (manual)");
  });

  it("keeps template picker prefill-only without automation side effects", () => {
    expect(addAgreementTemplateBlock).toContain("Manual mode stays available.");
    expect(addAgreementTemplateBlock).toContain("does not create records until you save");
    expect(addAgreementTemplateBlock).not.toContain("Create Work Order");
    expect(addAgreementTemplateBlock).not.toContain("Generate Draft Invoice");
    expect(addAgreementTemplateBlock).not.toContain("autopay");
    expect(addAgreementTemplateBlock).not.toContain("createNextServiceVisitFromForm");
    expect(addAgreementTemplateBlock).not.toContain("createMaintenanceAgreementTemplate");
    expect(addAgreementTemplateBlock).not.toContain("archiveMaintenanceAgreementTemplate");
  });
});
