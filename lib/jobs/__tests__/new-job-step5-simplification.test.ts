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
    expect(formSource).toContain("Work To Perform &amp; Job Scope");
    expect(formSource).not.toContain("Visit Reason &amp; Work Items");
  });

  it("keeps service scope-required validation in place", () => {
    expect(formSource).toContain("hasStructuredVisitScopeItemsJson");
    expect(formSource).toContain("modeSafeJobType === \"service\"");
  });

  it("updates intake progress label to Job scope", () => {
    expect(formSource).toContain('label="Job scope"');
  });

  it("shows immediate add confirmation and current scope preview near entry", () => {
    expect(builderSource).toContain("Added to job scope:");
    expect(builderSource).toContain("Current Job Scope");
    expect(builderSource.indexOf("Current Job Scope")).toBeLessThan(
      builderSource.indexOf("Browse saved work items"),
    );
  });

  it("keeps details field-first and hides metadata controls", () => {
    expect(builderSource).toContain("<details");
    expect(builderSource).toContain("Details");
    expect(builderSource).not.toContain("Expected Price");
    expect(builderSource).not.toContain("Unit Label");
    expect(builderSource).not.toContain("Metadata:");
  });

  it("uses softened Pricebook wording", () => {
    expect(builderSource).toContain("Use Pricebook defaults");
    expect(builderSource).toContain("Default from Pricebook");
  });

  it("keeps field-first quick choices compact and excludes generic maintenance", () => {
    expect(builderSource).toContain("QUICK_SCOPE_CHOICES");
    expect(builderSource).toContain('label: "Service Call"');
    expect(builderSource).toContain('label: "Diagnostic"');
    expect(builderSource).toContain('label: "Install"');
    expect(builderSource).not.toContain('label: "Maintenance"');
  });

  it("adds quick choices through structured scope candidates", () => {
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
    expect(builderSource).toContain("addManualItemFromQuickEntry");
    expect(builderSource).toContain("applyFieldIntakeScopeDefaults");
    expect(builderSource).toContain('Add "${searchQuery');
  });

  it("preserves hidden serialized metadata keys internally", () => {
    expect(builderSource).toContain("unit_label");
    expect(builderSource).toContain("item_type");
    expect(builderSource).toContain("category");
    expect(builderSource).toContain("source_pricebook_item_id");
    expect(builderSource).toContain("serializedItems");
  });
});
