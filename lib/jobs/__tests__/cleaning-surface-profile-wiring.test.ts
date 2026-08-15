import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const newJobFormSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/new/NewJobForm.tsx"),
  "utf8",
);

const jobDetailSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf8",
);

const fieldActionButtonSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/JobFieldActionButton.tsx"),
  "utf8",
);

const fieldOutcomePanelSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/FieldOutcomePanel.tsx"),
  "utf8",
);

const fieldExceptionPickerSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/FieldExceptionRoutingPicker.tsx"),
  "utf8",
);

describe("cleaning surface profile wiring", () => {
  it("uses cleaning job and cleaning scope language on the new job form", () => {
    expect(newJobFormSource).toContain('? "New Cleaning Job"');
    expect(newJobFormSource).toContain('title: isCleaningMode ? "Cleaning Scope"');
    expect(newJobFormSource).toContain('surfaceProfile.surfaces.permits ? (');
    expect(newJobFormSource).toContain('surfaceProfile.surfaces.equipment ? (');
    expect(newJobFormSource).toContain("Cleaning checklists and crew-specific fields are planned later.");
  });

  it("gates HVAC and ECC-native job detail surfaces behind the surface profile", () => {
    expect(jobDetailSource).toContain("surfaceProfile.surfaces.eccTests && job.job_type === \"ecc\"");
    expect(jobDetailSource).toContain("surfaceProfile.surfaces.certs");
    expect(jobDetailSource).toContain("surfaceProfile.surfaces.retest");
    expect(jobDetailSource).toContain("surfaceProfile.surfaces.contractorRaterHandoff");
  });

  it("renders informational cleaning placeholders without adding forms or stored checklist values", () => {
    expect(jobDetailSource).not.toContain('name="cleaning_checklist');
    expect(jobDetailSource).not.toContain("cleaning_checklist_json");
    expect(jobDetailSource).not.toContain("inspection_score");
  });

  it("keeps field finish overrides display-only", () => {
    expect(fieldActionButtonSource).toContain("completeLabel?: string");
    expect(fieldActionButtonSource).toContain('completeLabel = "Complete Field Work"');
    expect(fieldOutcomePanelSource).toContain("labels?: {");
    expect(fieldExceptionPickerSource).toContain("partsNeededLabel");
    expect(fieldExceptionPickerSource).toContain("approvalNeededLabel");
  });
});
