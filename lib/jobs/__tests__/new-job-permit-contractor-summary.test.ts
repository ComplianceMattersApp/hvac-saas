import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const formSource = readFileSync(resolve(__dirname, "../../../app/jobs/new/NewJobForm.tsx"), "utf8");
const pageSource = readFileSync(resolve(__dirname, "../../../app/jobs/new/page.tsx"), "utf8");

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

  it("offers any active internal team member for optional assignment and confirms the selection", () => {
    expect(formSource).toContain('name="assigned_user_id"');
    expect(formSource).toContain("Assign Team Member (optional)");
    expect(formSource).toContain('`Assigned team member: ${selectedTechnicianName}`');
    expect(formSource).toContain("confirmationTechnicianLine,");
    expect(pageSource).toContain("const assignableUsers = await getAssignableInternalUsers");
    expect(pageSource).not.toContain('.filter((staff) => staff.role === "tech")');
  });
});
