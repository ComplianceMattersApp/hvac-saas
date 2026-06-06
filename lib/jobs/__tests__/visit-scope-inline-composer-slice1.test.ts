import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const builderSource = readFileSync(
  path.join(process.cwd(), "components", "jobs", "VisitScopeBuilder.tsx"),
  "utf8",
);

const newJobFormSource = readFileSync(
  path.join(process.cwd(), "app", "jobs", "new", "NewJobForm.tsx"),
  "utf8",
);

const jobActionsSource = readFileSync(
  path.join(process.cwd(), "lib", "actions", "job-actions.ts"),
  "utf8",
);

describe("visit scope inline composer slice 1", () => {
  it("keeps manual add path in the same search/type composer flow", () => {
    expect(builderSource).toContain("Search Pricebook or type custom work...");
    expect(builderSource).toContain("addManualItemFromQuickEntry");
    expect(builderSource).toContain("disabled={!searchQuery}");
  });

  it("keeps pricebook add path and provenance mapping", () => {
    expect(builderSource).toContain("applyPricebookTemplate");
    expect(builderSource).toContain("source_pricebook_item_id: selectedTemplate.id");
    expect(builderSource).toContain("source_pricebook_item_id: null");
  });

  it("keeps compact rows with inline edit expansion controls", () => {
    expect(builderSource).toContain("rounded-xl border border-slate-200 bg-white px-3 py-2.5");
    expect(builderSource).toContain("Price");
    expect(builderSource).toContain('aria-label={`Price for ${item.title.trim() || "scope item"}`}');
    expect(builderSource).toContain("Carries into the draft invoice charge when you build the invoice.");
    expect(builderSource).toContain('{isExpanded ? "Done" : "Edit"}');
    expect(builderSource).toContain("setExpandedItemId((prev) => (prev === item.id ? null : item.id))");
    expect(builderSource).toContain("value={item.title}");
    expect(builderSource).toContain("onChange={(event) => patchItem(item.id, { title: event.target.value })}");
    expect(builderSource).toContain("value={item.expected_unit_price ?? 0}");
    expect(builderSource).toContain("value={item.details}");
    expect(builderSource).toContain("onChange={(event) => patchItem(item.id, { details: event.target.value })}");
  });

  it("keeps duplicate prevention checks intact", () => {
    expect(builderSource).toContain("findExistingScopeItem(items, candidate)");
    expect(builderSource).toContain("Already in current job scope");
  });

  it("keeps service-required behavior intact for jobs new", () => {
    expect(newJobFormSource).toContain("hasStructuredVisitScopeItemsJson");
    expect(newJobFormSource).toContain('modeSafeJobType === "service"');
    expect(jobActionsSource).toContain('redirect("/jobs/new?err=visit_scope_required")');
  });

  it("keeps serialized visit scope payload shape backward compatible", () => {
    expect(builderSource).toContain("const serializedItems = useMemo(() => {");
    expect(builderSource).toContain("id: item.id");
    expect(builderSource).toContain("title: item.title.trim()");
    expect(builderSource).toContain("details: item.details.trim()");
    expect(builderSource).toContain('kind: jobType === "ecc" ? item.kind : "primary"');
    expect(builderSource).toContain("source_pricebook_item_id: sanitizeVisitScopeItemId(item.source_pricebook_item_id)");
    expect(builderSource).toContain("expected_unit_price:");
    expect(builderSource).toContain("unit_label: String(item.unit_label ?? \"\").trim() || null");
    expect(builderSource).toContain("item_type: String(item.item_type ?? \"\").trim() || null");
    expect(builderSource).toContain("category: String(item.category ?? \"\").trim() || null");
    expect(builderSource).toContain("promoted_service_job_id: String(item.promoted_service_job_id ?? \"\").trim() || null");
    expect(builderSource).toContain("promoted_at: String(item.promoted_at ?? \"\").trim() || null");
    expect(builderSource).toContain("promoted_by_user_id: String(item.promoted_by_user_id ?? \"\").trim() || null");
  });
});
