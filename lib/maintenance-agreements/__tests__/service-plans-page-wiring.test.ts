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
    expect(servicePlansPageSource).toContain("Showing {visibleRows.length} plan");
    expect(servicePlansPageSource).not.toContain("This page is read-only.");
  });

  it("uses simple Default Visit Work copy without advanced or JSON wording", () => {
    expect(servicePlansPageSource).toContain("Default Visit Work");
    expect(servicePlansPageSource).toContain("Describe the default work, checklist, or scope for future visits.");
    expect(servicePlansPageSource).toContain("Example: Inspect system, replace filter, check refrigerant charge, clean condenser coil.");
    expect(servicePlansPageSource).toContain("Leave blank if this template should not prefill visit work.");
    expect(servicePlansPageSource).toContain("return \"\";");
    expect(servicePlansPageSource).toContain("name=\"default_visit_scope_items_json\"");
    expect(servicePlansPageSource).not.toContain("Advanced default work items");
    expect(servicePlansPageSource).not.toContain("No default work items added yet.");
    expect(servicePlansPageSource).not.toContain("Default Work Items");
    expect(servicePlansPageSource).not.toContain("Default Work Items (JSON array)");
    expect(servicePlansPageSource).not.toContain('defaultValue="[]"');
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

  it("adds search and scan buckets for larger service plan lists", () => {
    expect(servicePlansPageSource).toContain("Search service plans");
    expect(servicePlansPageSource).toContain("name=\"q\"");
    expect(servicePlansPageSource).toContain("const visibleRows = normalizedSearchQuery");
    expect(servicePlansPageSource).toContain("visibleNeedsAttentionCount");
    expect(servicePlansPageSource).toContain("visibleDueSoonCount");
    expect(servicePlansPageSource).toContain("visibleActiveCount");
    expect(servicePlansPageSource).toContain("visibleInactiveCount");
    expect(servicePlansPageSource).toContain("Needs Attention {visibleNeedsAttentionCount}");
    expect(servicePlansPageSource).toContain("Due Soon {visibleDueSoonCount}");
    expect(servicePlansPageSource).toContain("Active {visibleActiveCount}");
    expect(servicePlansPageSource).toContain("Inactive {visibleInactiveCount}");
  });

  it("preserves search state through filter links and template actions", () => {
    expect(servicePlansPageSource).toContain("q?: string;");
    expect(servicePlansPageSource).toContain("if (q) params.set(\"q\", q);");
    expect(servicePlansPageSource).toContain("href={buildServicePlansHref({ filter: filter.value, q: searchQuery })}");
    expect(servicePlansPageSource).toContain("name=\"return_q\"");
    expect(servicePlansPageSource).toContain("value={searchQuery}");
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
