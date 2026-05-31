import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const formSource = readFileSync(
  path.join(process.cwd(), "app", "jobs", "new", "NewJobForm.tsx"),
  "utf8",
);
const visitScopeBuilderSource = readFileSync(
  path.join(process.cwd(), "components", "jobs", "VisitScopeBuilder.tsx"),
  "utf8",
);

describe("New job Service Plan scheduling-first wiring", () => {
  it("keeps Service Plan context visible while masking Work Items by default", () => {
    expect(formSource).toContain("const isServicePlanQuickScheduleMode = Boolean(isServicePlanPrefillFlow && jobType === \"service\");");
    expect(formSource).toContain("Service Plan Visit");
    expect(formSource).toContain("work is already included.");
    expect(formSource).toContain("Review Included Work");
    expect(formSource).toContain("const [showServicePlanWorkItems, setShowServicePlanWorkItems] = useState(false);");
    expect(formSource).toContain("const [showServicePlanAdvancedDetails, setShowServicePlanAdvancedDetails] = useState(false);");
    expect(formSource).toContain('className={showServicePlanWorkItems ? "mt-4 border-t border-blue-200 pt-4" : "hidden"}');
  });

  it("keeps quick-schedule-first fields visible before optional work review", () => {
    expect(formSource).toContain('section className={`${isServicePlanQuickScheduleMode ? "order-1" : "order-2"} ${isInternalMode ? guidedSectionShellClass : "space-y-3"}`}');
    expect(formSource).toContain("Visit Note (optional)");
    expect(formSource).toContain("Review Advanced Details");
    expect(formSource).toContain("Hide Advanced Details");
  });

  it("keeps maintenance agreement and visit scope payload wiring intact", () => {
    expect(formSource).toContain('<input type="hidden" name="maintenance_agreement_id" value={maintenanceAgreementPrefill?.agreement_id ?? ""} />');
    expect(formSource).toContain('<input type="hidden" name="service_case_kind" value={serviceCaseKind} />');
    expect(formSource).toContain('<input type="hidden" name="service_visit_type" value={serviceVisitType} />');
    expect(visitScopeBuilderSource).toContain('itemsName = "visit_scope_items_json"');
    expect(formSource).toContain("hasStructuredVisitScopeItemsJson");
  });

  it("preserves standard non-Service-Plan work-item flow", () => {
    expect(formSource).toContain('isServicePlanPrefillFlow && jobType === "service" ? (');
    const builderMatches = formSource.match(/<VisitScopeBuilder/g) ?? [];
    expect(builderMatches.length).toBeGreaterThanOrEqual(2);
  });
});
