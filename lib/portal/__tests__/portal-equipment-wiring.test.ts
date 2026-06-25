import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(resolve(__dirname, "../../..", path), "utf-8");
}

describe("portal equipment wiring", () => {
  it("keeps portal job detail equipment read-only and routes equipment changes through notes", () => {
    const portalJobDetail = readRepoFile("app/portal/jobs/[id]/page.tsx");

    expect(portalJobDetail).toContain("job_equipment (");
    expect(portalJobDetail).toContain("buildEquipmentSummaryLine");
    expect(portalJobDetail).toContain(
      "Equipment is managed by Compliance Matters after intake review. Use notes below to share equipment updates for this job.",
    );
    expect(portalJobDetail).not.toContain("info?f=equipment");
    expect(portalJobDetail).not.toContain("PortalEquipmentCreateForm");
    expect(portalJobDetail).not.toContain("Add equipment for this job");
    expect(portalJobDetail).not.toContain("addPortalJobEquipmentFromForm");
    expect(portalJobDetail).not.toContain("EquipmentEditCard");
    expect(portalJobDetail).not.toContain("deleteJobEquipmentFromForm");
    expect(portalJobDetail).not.toContain("updateJobEquipmentFromForm");
    expect(portalJobDetail).toContain("async function addContractorNote");
    expect(portalJobDetail).toContain('name="note"');
  });

  it("renders proposed equipment capture only in portal intake copy", () => {
    const newJobForm = readRepoFile("app/jobs/new/NewJobForm.tsx");

    expect(newJobForm).toContain('title: isCleaningMode ? "Site Details" : isContractorMode ? "Equipment" : "Additional Details"');
    expect(newJobForm).toContain(
      "Add equipment now so Compliance Matters has the system details before the job is reviewed.",
    );
    expect(newJobForm).toContain("EQUIPMENT_ROLE_OPTIONS");
    expect(newJobForm).toContain("Proposed equipment is intake context.");
  });
});
