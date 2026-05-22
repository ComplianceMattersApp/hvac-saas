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
    expect(formSource).toContain("Step 1 of 5");
    expect(formSource).toContain("Select a customer, choose the work, then create the job.");
  });

  it("prioritizes current job scope above add controls", () => {
    expect(builderSource).toContain("Current Job Scope");
    expect(builderSource.indexOf("Current Job Scope")).toBeLessThan(
      builderSource.indexOf("Browse saved work items"),
    );
    expect(builderSource).toContain("No work added yet.");
    expect(builderSource).toContain("Selected work appears here first so the active scope is always clear.");
  });

  it("keeps details field-first, keeps optional price, and hides metadata controls", () => {
    expect(builderSource).toContain("<details");
    expect(builderSource).toContain("Details");
    expect(builderSource).toContain("Optional price");
    expect(builderSource).toContain("does not create an invoice charge");
    expect(builderSource).not.toContain("Unit Label");
    expect(builderSource).not.toContain("Metadata:");
  });

  it("uses softened Pricebook wording", () => {
    expect(builderSource).toContain("Use Pricebook defaults");
    expect(builderSource).toContain("Default from Pricebook");
  });

  it("retains quick choices internally for non-service scope paths and excludes generic maintenance", () => {
    expect(builderSource).toContain("QUICK_SCOPE_CHOICES");
    expect(builderSource).toContain('label: "Service Call"');
    expect(builderSource).toContain('label: "Diagnostic"');
    expect(builderSource).toContain('label: "Install"');
    expect(builderSource).not.toContain('label: "Maintenance"');
  });

  it("keeps structured quick-choice candidate support for non-service paths", () => {
    expect(builderSource).toContain('jobType !== "service" ? (');
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
    expect(builderSource).toContain("Browse saved work items");
    expect(builderSource).toContain("shouldShowSavedDefaults");
  });

  it("supports typed custom scope adds", () => {
    expect(builderSource).toContain("Add Custom Work");
    expect(builderSource).toContain("Add another item");
    expect(builderSource).toContain("addManualItemFromQuickEntry");
    expect(builderSource).toContain("applyFieldIntakeScopeDefaults");
    expect(builderSource).toContain('Add "${searchQuery');
  });

  it("renders service scope items as selected cards with source and details affordances", () => {
    expect(builderSource).toContain("From saved work item");
    expect(builderSource).toContain("From visit type");
    expect(builderSource).toContain("Custom work");
    expect(builderSource).toContain('completedItems.length === 1 ? "item" : "items"');
    expect(builderSource).toContain("Optional price: $");
    expect(builderSource).toContain("rounded-2xl border border-emerald-200 bg-emerald-50/80");
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
