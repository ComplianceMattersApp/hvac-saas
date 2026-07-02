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
      "isInternalMode && internalResolutionReady && isServiceSurfaceMode ? (",
    );
    expect(formSource).toContain(
      "isInternalMode && internalResolutionReady && !isServiceSurfaceMode ? (",
    );
    expect(formSource).toMatch(
      /isInternalMode && internalResolutionReady && isServiceSurfaceMode \? \(\s*<input type="hidden" name="job_type"/,
    );
  });

  it("preserves hidden default relationship submission in HVAC Service mode", () => {
    expect(formSource).toContain("relationship_action");
    expect(formSource).toContain('shouldShowRelationshipStep ? relationshipAction : "new_case"');
  });

  it("renders Work Order Details heading with merged Service Type and Visit Type in Service mode", () => {
    expect(formSource).toContain('isHvacServiceMode ? "Work Order Details"');
    expect(formSource).toContain(
      "What kind of visit is this, and what work needs to be done?",
    );
    expect(formSource).not.toContain('value="install"');
    expect(formSource).toContain('isServiceSurfaceMode && jobType === "service" && !isServicePlanQuickScheduleMode ? (');
    expect(formSource).toContain('name="service_case_kind"');
    expect(formSource).toContain('name="service_visit_type"');
    expect(formSource).toContain('isServicePlanPrefillFlow && jobType === "service" ? (');
    expect(formSource).toContain("Review Included Work");
    expect(formSource).toContain("Service Plan Visit");
    expect(formSource).toContain("work is already included.");
    expect(formSource).toContain("<VisitScopeBuilder");
  });

  it("renders internal supporting details as notes-only", () => {
    expect(formSource).toContain('title: "Notes"');
    expect(formSource).toContain('title: "Internal Notes"');
    expect(formSource).not.toMatch(/>Optional details</);
    expect(formSource).not.toContain("Additional Details");
  });

  it("preserves permit field names inside the portal equipment disclosure for Service mode", () => {
    expect(formSource).toMatch(
      /isHvacServiceMode && surfaceProfile\.surfaces\.permits \? \(\s*<details[\s\S]*Permit information[\s\S]*name="permit_number"[\s\S]*name="jurisdiction"[\s\S]*name="permit_date"[\s\S]*<\/details>/,
    );
  });

  it("renders relationship-aware step with expected option labels", () => {
    expect(formSource).not.toContain("Relationship Path");
    expect(formSource).toContain("Open Active Job");
    expect(formSource).toContain("Create Follow-Up Visit");
    expect(formSource).toContain("Continue as New Case");
  });
});
