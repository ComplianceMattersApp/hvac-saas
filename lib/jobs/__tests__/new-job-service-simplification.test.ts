import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const formSource = readFileSync(
  path.join(process.cwd(), "app", "jobs", "new", "NewJobForm.tsx"),
  "utf8",
);

describe("/jobs/new HVAC Service-mode simplification (Phase 4)", () => {
  it("gates Step 3 Work Order Setup card off in HVAC Service mode while preserving hidden job_type", () => {
    expect(formSource).toContain(
      "isInternalMode && internalResolutionReady && isHvacServiceMode ? (",
    );
    expect(formSource).toContain(
      "isInternalMode && internalResolutionReady && !isHvacServiceMode ? (",
    );
    expect(formSource).toMatch(
      /isInternalMode && internalResolutionReady && isHvacServiceMode \? \(\s*<input type="hidden" name="job_type"/,
    );
  });

  it("gates Step 4 Relationship Path off in HVAC Service mode", () => {
    expect(formSource).toContain("shouldShowRelationshipStep && !isHvacServiceMode ?");
    expect(formSource).toContain("relationship_action");
    expect(formSource).toContain('shouldShowRelationshipStep ? relationshipAction : "new_case"');
  });

  it("renders Work Order Details heading with merged Service Type and Visit Type in Service mode", () => {
    expect(formSource).toContain('isHvacServiceMode ? "Work Order Details"');
    expect(formSource).toContain(
      "What kind of visit is this, and what work needs to be done?",
    );
    expect(formSource).toMatch(
      /isHvacServiceMode && jobType === "service" \? \([\s\S]*name="service_case_kind"[\s\S]*name="service_visit_type"[\s\S]*\) : null\}\s*<VisitScopeBuilder/,
    );
  });

  it("renames Step 7 Optional details to Additional details", () => {
    expect(formSource).toContain("Additional Details");
    expect(formSource).not.toMatch(/>Optional details</);
  });

  it("preserves permit field names inside Additional Details disclosure for Service mode", () => {
    expect(formSource).toMatch(
      /isHvacServiceMode \? \(\s*<details[\s\S]*Permit information[\s\S]*name="permit_number"[\s\S]*name="jurisdiction"[\s\S]*name="permit_date"[\s\S]*<\/details>/,
    );
  });

  it("does not render Relationship Path action labels in Service-mode-only intake branch", () => {
    expect(formSource).toContain("shouldShowRelationshipStep && !isHvacServiceMode ?");
    expect(formSource).toContain("Open Active Job");
    expect(formSource).toContain("Create Follow-Up Visit");
    expect(formSource).toContain("Continue as New Case");
  });
});
