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
    expect(resolveVisitTypeScopeSuggestion("maintenance")).toBeNull();
    expect(resolveVisitTypeScopeSuggestion("callback")).toBeNull();
  });

  it("renders a visit-type suggestion block near Current Job Scope", () => {
    expect(builderSource).toContain("Suggested from Visit Type");
    expect(builderSource).toContain("From visit type");
    expect(builderSource).toContain("Add to job scope");
    expect(builderSource).toContain("Already added");
  });

  it("prevents duplicate adds from suggestion path", () => {
    expect(builderSource).toContain("isVisitTypeSuggestionAdded");
    expect(builderSource).toContain("findExistingScopeItem(items, visitTypeSuggestionCandidate)");
  });

  it("keeps quick add behind Add more work instead of first visible state", () => {
    expect(builderSource).toContain("Add more work");
    expect(builderSource).toContain("Search saved work items or type custom work.");
    expect((builderSource.match(/Quick Add/g) || []).length).toBe(1);
  });
});
