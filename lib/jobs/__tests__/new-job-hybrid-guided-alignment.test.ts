import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const formSource = readFileSync(
  path.join(process.cwd(), "app", "jobs", "new", "NewJobForm.tsx"),
  "utf8",
);

describe("/jobs/new hybrid guided-builder alignment", () => {
  it("uses Job Type wording instead of Job Family for internal non-service mode", () => {
    expect(formSource).toMatch(/const jobFamilyStepTitle = isHvacServiceMode[\s\S]*: "Job Type";/);
    expect(formSource).toContain('const jobFamilyControlLabel = isHvacServiceMode ? "Service / Work Order" : "Job Type";');
    expect(formSource).not.toContain(': "Job family";');
  });

  it("uses clear hybrid lane copy for Service and ECC choices", () => {
    expect(formSource).toContain("What kind of job are you creating?");
    expect(formSource).toContain("Service / Work Order");
    expect(formSource).toContain("ECC / Compliance");
  });

  it("renders non-service setup with guided section shell instead of legacy gradient panels", () => {
    expect(formSource).toContain("title: jobFamilyStepTitle");
    expect(formSource).not.toContain("rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-5 shadow-sm space-y-5");
  });

  it("keeps hidden default relationship submission without rendering the chooser", () => {
    expect(formSource).toContain('name="relationship_action" value={shouldShowRelationshipStep ? relationshipAction : "new_case"}');
    expect(formSource).not.toContain("Relationship Path");
    expect(formSource).not.toContain("Open Active Job");
    expect(formSource).not.toContain("Create Follow-Up Visit");
    expect(formSource).not.toContain("Continue as New Case");
    expect(formSource).not.toContain("Continuing as a new case.");
  });
});
