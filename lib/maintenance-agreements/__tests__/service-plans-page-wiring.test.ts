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
    expect(servicePlansPageSource).toContain("Manage Templates");
    expect(servicePlansPageSource).not.toContain("Template Management");
  });

  it("uses template read model only for dashboard summaries", () => {
    expect(servicePlansPageSource).toContain("listMaintenanceAgreementTemplatesForAccount");
    expect(servicePlansPageSource).toContain("isTemplateStoreUnavailableError");
    expect(servicePlansPageSource).toContain("templateStoreUnavailable");
    expect(servicePlansPageSource).toContain("/service-plans/templates");
  });

  it("keeps compact template summary counts on dashboard", () => {
    expect(servicePlansPageSource).toContain("{activeTemplates.length} active / {archivedTemplates.length} archived");
    expect(servicePlansPageSource).toContain("Setup and maintain reusable Service Plan templates in a dedicated workspace.");
  });

  it("keeps existing customer service plans visibility read-only", () => {
    expect(servicePlansPageSource).toContain("Customer plans are managed from each customer record.");
    expect(servicePlansPageSource).toContain("const showingLabel = visibleRows.length <= pageSize");
    expect(servicePlansPageSource).not.toContain("This page is read-only.");
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

  it("renders service plan type cards with grouped counts and clear filter behavior", () => {
    expect(servicePlansPageSource).toContain("Service Plan Types");
    expect(servicePlansPageSource).toContain("Select a type to review matching customer plans.");
    expect(servicePlansPageSource).toContain("divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200");
    expect(servicePlansPageSource).toContain("sm:grid-cols-[minmax(0,1fr)_auto_auto]");
    expect(servicePlansPageSource).toContain("const planTypeGroups = Array.from");
    expect(servicePlansPageSource).toContain("getPlanTypeGroup(row)");
    expect(servicePlansPageSource).toContain("const agreementType = String(row.agreement_type ?? \"\").trim();");
    expect(servicePlansPageSource).toContain("key: normalizeTypeKeyPart(agreementType) || \"other\"");
    expect(servicePlansPageSource).toContain("label: titleCase(agreementType)");
    expect(servicePlansPageSource).toContain("source_template_name_snapshot");
    expect(servicePlansPageSource).toContain("source_template_id");
    expect(servicePlansPageSource).toContain("group.active");
    expect(servicePlansPageSource).toContain("group.dueSoon");
    expect(servicePlansPageSource).toContain("group.overdue");
    expect(servicePlansPageSource).toContain("group.needsAttention");
    expect(servicePlansPageSource).toContain("{group.total} plan");
    expect(servicePlansPageSource).toContain("group.needsAttention > 0");
    expect(servicePlansPageSource).toContain("group.dueSoon > 0");
    expect(servicePlansPageSource).toContain("group.overdue > 0");
    expect(servicePlansPageSource).toContain("Clear Type");
    expect(servicePlansPageSource).toContain("Showing type:");
    expect(servicePlansPageSource).not.toContain("grid gap-3 md:grid-cols-2 xl:grid-cols-3");
  });

  it("preserves search and type state through filter links", () => {
    expect(servicePlansPageSource).toContain("q?: string;");
    expect(servicePlansPageSource).toContain("typeKey?: string;");
    expect(servicePlansPageSource).toContain("page?: number;");
    expect(servicePlansPageSource).toContain("if (q) params.set(\"q\", q);");
    expect(servicePlansPageSource).toContain("if (typeKey) params.set(\"type\", typeKey);");
    expect(servicePlansPageSource).toContain("href={buildServicePlansHref({ filter: filter.value, q: searchQuery, typeKey: activeTypeGroup?.key })}");
    expect(servicePlansPageSource).toContain("href={buildServicePlansHref({ filter: selectedFilter, q: searchQuery, typeKey: group.key })}");
    expect(servicePlansPageSource).toContain("defaultValue={searchQuery}");
  });

  it("keeps customer list controls with detail list and uses load-more display limits", () => {
    const customerListIndex = servicePlansPageSource.indexOf("Customer Service Plans");
    const templateIndex = servicePlansPageSource.indexOf("Manage Templates");
    expect(customerListIndex).toBeGreaterThan(-1);
    expect(templateIndex).toBeGreaterThan(customerListIndex);
    expect(servicePlansPageSource).toContain("Detail view for the selected type, status, and search filters.");
    expect(servicePlansPageSource).toContain("Search service plans");
    expect(servicePlansPageSource).toContain("const pageSize = 25;");
    expect(servicePlansPageSource).toContain("const pagedRows = visibleRows.slice(0, clampedVisibleCount);");
    expect(servicePlansPageSource).toContain("const hasMoreRows = clampedVisibleCount < visibleRows.length;");
    expect(servicePlansPageSource).toContain("Showing 1-${clampedVisibleCount} of ${visibleRows.length} plans");
    expect(servicePlansPageSource).toContain("Load More");
    expect(servicePlansPageSource).toContain("No service plans match this type and filter.");
  });

  it("does not wire template actions into agreement creation or payment flows", () => {
    expect(servicePlansPageSource).not.toContain("createAgreementAction");
    expect(servicePlansPageSource).not.toContain("updateAgreementAction");
    expect(servicePlansPageSource).not.toContain("generateDraftInvoiceFromBillingPeriodAction");
    expect(servicePlansPageSource.toLowerCase()).not.toContain("autopay");
    expect(servicePlansPageSource.toLowerCase()).not.toContain("stripe");
    expect(servicePlansPageSource).not.toContain("createNextServiceVisitFromForm");
    expect(servicePlansPageSource).not.toContain("Confirm Payment");
  });
});
