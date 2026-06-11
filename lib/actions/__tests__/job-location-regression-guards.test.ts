import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const jobActionsSource = readFileSync(
  path.join(process.cwd(), "lib", "actions", "job-actions.ts"),
  "utf8",
);
const estimateActionsSource = readFileSync(
  path.join(process.cwd(), "lib", "estimates", "estimate-actions.ts"),
  "utf8",
);
const maintenanceReadModelSource = readFileSync(
  path.join(process.cwd(), "lib", "maintenance-agreements", "read-model.ts"),
  "utf8",
);
const newJobFormSource = readFileSync(
  path.join(process.cwd(), "app", "jobs", "new", "NewJobForm.tsx"),
  "utf8",
);

describe("job location regression guards", () => {
  it("keeps estimate-to-job conversion carrying the estimate location id", () => {
    expect(estimateActionsSource).toContain("location_id: estimate.location_id");
    expect(estimateActionsSource).toContain("job_address: String(locationSnapshot?.address_line1 ?? \"\").trim() || null");
  });

  it("keeps service-plan job prefill anchored to primary location id", () => {
    expect(maintenanceReadModelSource).toContain("\"primary_location_id\"");
    expect(newJobFormSource).toContain("maintenanceAgreementPrefill?.primary_location_id");
    expect(newJobFormSource).toContain("if (hasMaintenancePrefillLocation) return maintenancePrefillLocationId;");
  });

  it("keeps ECC retest creation inheriting the parent location unchanged", () => {
    expect(jobActionsSource).toContain("location_id: parent?.location_id ?? null");
    expect(jobActionsSource).toContain("job_address: parent?.job_address ?? null");
  });
});
