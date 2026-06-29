import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const customerPageSource = readFileSync(
  resolve(__dirname, "../../../app/customers/[id]/page.tsx"),
  "utf8",
);

const componentSource = readFileSync(
  resolve(__dirname, "../../../components/maintenance-agreements/ServicePlanCreateFlow.tsx"),
  "utf8",
);

describe("customer service-plan template prefill wiring", () => {
  it("wires template read model for service-plan create flow", () => {
    expect(customerPageSource).toContain("listMaintenanceAgreementTemplatesForAccount");
    expect(customerPageSource).toContain("agreementTemplates");
    expect(customerPageSource).toContain("ServicePlanCreateFlow");
    expect(customerPageSource).toContain("createAgreementAction");
  });

  it("component exposes required form fields for template prefill", () => {
    expect(componentSource).toContain('name="source_template_id"');
    expect(componentSource).toContain('name="agreement_type"');
    expect(componentSource).toContain('name="agreement_name"');
    expect(componentSource).toContain("template_name");
    expect(componentSource).toContain(".frequency");
  });

  it("component renders cadence and visit scope fields for form step", () => {
    expect(componentSource).toContain("MaintenanceAgreementCadenceFields");
    expect(componentSource).toContain("VisitScopeBuilder");
    expect(componentSource).toContain('summaryName="default_visit_scope_summary"');
    expect(componentSource).toContain('itemsName="default_visit_scope_items_json"');
  });

  it("empty state renders correctly with manual create and set-up-templates options", () => {
    expect(componentSource).toContain("No plan templates set up yet");
    expect(componentSource).toContain("Create manually");
    expect(componentSource).toContain("Set up templates");
    expect(componentSource).toContain("/ops/admin/service-plan-templates");
  });

  it("renders Starting from note and Start from scratch option when template selected", () => {
    expect(componentSource).toContain("Starting from:");
    expect(componentSource).toContain("Start from scratch instead");
  });

  it("keeps picker prefill-only without automation side effects", () => {
    expect(componentSource).not.toContain("Create Work Order");
    expect(componentSource).not.toContain("Generate Draft Invoice");
    expect(componentSource).not.toContain("autopay");
    expect(componentSource).not.toContain("createNextServiceVisitFromForm");
    expect(componentSource).not.toContain("createMaintenanceAgreementTemplate");
    expect(componentSource).not.toContain("archiveMaintenanceAgreementTemplate");
  });
});
