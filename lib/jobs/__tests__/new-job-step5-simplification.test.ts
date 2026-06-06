import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const formSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/new/NewJobForm.tsx"),
  "utf-8",
);

const builderSource = readFileSync(
  resolve(__dirname, "../../../components/jobs/VisitScopeBuilder.tsx"),
  "utf-8",
);

describe("New job Step 5 simplification wiring", () => {
  it("uses plain-language Step 5 heading", () => {
    expect(formSource).toContain("Work To Perform & Job Scope");
    expect(formSource).not.toContain("Visit Reason &amp; Work Items");
  });

  it("keeps service scope-required validation in place", () => {
    expect(formSource).toContain("hasStructuredVisitScopeItemsJson");
    expect(formSource).toContain("modeSafeJobType === \"service\"");
  });

  it("uses compact top progress text", () => {
    expect(formSource).not.toContain("Step 1 of 5");
    expect(formSource).toContain("Select the responsible account, choose the work, then create the job.");
  });

  it("keeps a compact add-work composer ahead of saved defaults", () => {
    expect(builderSource).toContain("Add Work");
    expect(builderSource.indexOf("Add Work")).toBeLessThan(
      builderSource.indexOf("Saved work items"),
    );
    expect(builderSource).toContain("Search Pricebook or type custom work...");
    expect(builderSource).toContain("disabled={!searchQuery}");
  });

  it("keeps details field-first, keeps price, and hides metadata controls", () => {
    expect(builderSource).toContain("<details");
    expect(builderSource).toContain("Details");
    expect(builderSource).toContain("Price");
    expect(builderSource).toContain("Carries into the draft invoice charge when you build the invoice.");
    expect(builderSource).not.toContain("Unit Label");
    expect(builderSource).not.toContain("Metadata:");
  });

  it("uses softened Pricebook wording", () => {
    expect(builderSource).toContain("Saved work item");
    expect(builderSource).toContain("Saved work items");
  });

  it("retains quick choices internally for non-service scope paths and excludes generic maintenance", () => {
    expect(builderSource).toContain("QUICK_SCOPE_CHOICES");
    expect(builderSource).toContain('label: "Service Call"');
    expect(builderSource).toContain('label: "Diagnostic"');
    expect(builderSource).toContain('label: "Install"');
    expect(builderSource).not.toContain('label: "Maintenance"');
  });

  it("keeps structured quick-choice candidate support across scope paths", () => {
    expect(builderSource).toContain("quickChoices.map");
    expect(builderSource).toContain("addScopeCandidate(choice.candidate)");
    expect(builderSource).toContain("title: choice.label");
    expect(builderSource).toContain("source_pricebook_item_id");
  });

  it("shows selected or added state for duplicate quick/default selections", () => {
    expect(builderSource).toContain("findExistingScopeItem");
    expect(builderSource).toContain("disabled={choice.isAdded}");
    expect(builderSource).toContain("disabled={isAdded}");
    expect(builderSource).toContain("Already in current job scope");
  });

  it("hides saved/default rows until search or browse", () => {
    expect(builderSource).toContain("showSavedDefaults");
    expect(builderSource).toContain("searchQuery.length > 0");
    expect(builderSource).toContain("Saved work items");
    expect(builderSource).toContain("onToggle={(event) => setShowSavedDefaults");
  });

  it("supports typed custom scope adds", () => {
    expect(builderSource).toContain("Search Pricebook or type custom work...");
    expect(builderSource).toContain("addManualItemFromQuickEntry");
    expect(builderSource).toContain("applyFieldIntakeScopeDefaults");
    expect(builderSource).toContain("disabled={!searchQuery}");
  });

  it("renders service scope items as compact rows with source and details affordances", () => {
    expect(builderSource).toContain("From saved work item");
    expect(builderSource).toContain("From visit type");
    expect(builderSource).toContain("Custom work");
    expect(builderSource).toContain('completedItems.length === 1 ? "item" : "items"');
    expect(builderSource).toContain("Selected Work Items");
    expect(builderSource).toContain("rounded-xl border border-slate-200 bg-white px-3 py-2.5");
  });

  it("flattens the service scope shell instead of nesting extra framed cards", () => {
    expect(builderSource).toContain('className="space-y-3 border-t border-slate-200/80 pt-3"');
    expect(builderSource).not.toContain('rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3');
  });

  it("keeps compact row editing with one-row expansion behavior", () => {
    expect(builderSource).toContain("setExpandedItemId(nextItemId)");
    expect(builderSource).toContain("setExpandedItemId((prev) => (prev === item.id ? null : item.id))");
    expect(builderSource).toContain("lg:min-w-[12rem]");
    expect(builderSource).toContain("lg:text-right");
    expect(builderSource).toContain('aria-label={`Price for ${item.title.trim() || "scope item"}`}');
    expect(builderSource).toContain("value={item.title}");
    expect(builderSource).toContain("value={item.expected_unit_price ?? 0}");
    expect(builderSource).toContain("value={item.details}");
  });

  it("preserves matched default prices and falls back to 0.00 when needed", () => {
    expect(builderSource).toContain("normalizeExpectedUnitPrice");
    expect(builderSource).toContain("matchingTemplate?.default_unit_price");
    expect(builderSource).toContain("safeDefaults.expected_unit_price");
    expect(builderSource).toContain("selectedTemplate.default_unit_price");
    expect(builderSource).toContain("? 0");
  });

  it("preserves hidden serialized metadata keys internally", () => {
    expect(builderSource).toContain("unit_label");
    expect(builderSource).toContain("item_type");
    expect(builderSource).toContain("category");
    expect(builderSource).toContain("source_pricebook_item_id");
    expect(builderSource).toContain("serializedItems");
  });
});
