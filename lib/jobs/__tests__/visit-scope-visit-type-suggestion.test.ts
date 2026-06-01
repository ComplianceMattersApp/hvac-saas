import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveVisitTypeScopeSuggestion } from "@/components/jobs/VisitScopeBuilder";

const builderSource = readFileSync(
  path.join(process.cwd(), "components", "jobs", "VisitScopeBuilder.tsx"),
  "utf8",
);

describe("Visit scope visit-type suggestion UX", () => {
  it("maps supported visit types to safe scope suggestions", () => {
    expect(resolveVisitTypeScopeSuggestion("diagnostic")).toBe("Diagnostic");
    expect(resolveVisitTypeScopeSuggestion("repair")).toBe("Service Call");
    expect(resolveVisitTypeScopeSuggestion("install")).toBe("Install");
    expect(resolveVisitTypeScopeSuggestion("maintenance")).toBeNull();
    expect(resolveVisitTypeScopeSuggestion("callback")).toBeNull();
  });

  it("keeps visit-type suggestion available in compact add-work controls", () => {
    expect(builderSource).toContain("visitTypeSuggestionCandidate");
    expect(builderSource).toContain("Add {visitTypeSuggestionCandidate.title}");
    expect(builderSource).toContain("From visit type");
    expect(builderSource).toContain("isVisitTypeSuggestionAdded");
  });

  it("prevents duplicate adds from suggestion path", () => {
    expect(builderSource).toContain("isVisitTypeSuggestionAdded");
    expect(builderSource).toContain("findExistingScopeItem(items, visitTypeSuggestionCandidate)");
  });

  it("uses a compact search-first composer instead of nested add-more details", () => {
    expect(builderSource).toContain("Add Work");
    expect(builderSource).toContain("Search Pricebook or type custom work...");
    expect(builderSource).toContain("disabled={!searchQuery}");
    expect(builderSource).not.toContain("Add more work");
    expect(builderSource).not.toContain("Add another item");
  });

  it("renders added service scope as selected editable rows", () => {
    expect(builderSource).toContain("Selected Work Items");
    expect(builderSource).toContain("From saved work item");
    expect(builderSource).toContain("Custom work");
    expect(builderSource).toContain("rounded-xl border border-slate-200 bg-white px-3 py-2.5");
    expect(builderSource).toContain("Optional price");
    expect(builderSource).toContain('aria-label={`Optional price for ${item.title.trim() || "scope item"}`}');
  });
});
