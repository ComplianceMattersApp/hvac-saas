import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const formSource = readFileSync(resolve(__dirname, "../../../app/jobs/new/NewJobForm.tsx"), "utf8");

describe("new job internal intake optional permit and contractor summary", () => {
  it("keeps internal permit fields collapsed behind a permit disclosure", () => {
    expect(formSource).toContain('title: "+ Permit"');
    expect(formSource).toContain('description: "Add permit information when it is already available."');
    expect(formSource).toContain('name="permit_number"');
    expect(formSource).toContain('name="jurisdiction"');
    expect(formSource).toContain('name="permit_date"');
  });

  it("includes the selected contractor in the final job summary", () => {
    expect(formSource).toContain("const selectedContractorName = myContractor?.name");
    expect(formSource).toContain('`Contractor: ${selectedContractorName}`');
    expect(formSource).toContain("confirmationContractorLine,");
  });

  it("offers an optional technician assignment and confirms it in the final summary", () => {
    expect(formSource).toContain('name="assigned_user_id"');
    expect(formSource).toContain("Assign Technician (optional)");
    expect(formSource).toContain('`Assigned tech: ${selectedTechnicianName}`');
    expect(formSource).toContain("confirmationTechnicianLine,");
  });
});
