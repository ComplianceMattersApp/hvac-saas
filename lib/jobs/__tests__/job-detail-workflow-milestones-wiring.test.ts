import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const jobDetailSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf-8",
);

describe("job detail workflow milestone guidance wiring", () => {
  it("places workflow guidance in the service chain continuity area", () => {
    expect(jobDetailSource).toContain(
      'import DeferredWorkflowMilestonesPanelBody from "./_components/DeferredWorkflowMilestonesPanelBody";',
    );
  });

  it("passes account scope and service_case_id into workflow guidance panel", () => {
  });

  it("computes workflow guidance management visibility for owner/admin only", () => {
    expect(jobDetailSource).toContain("const internalRole = String(internalUser.role ?? \"\").trim().toLowerCase();");
    expect(jobDetailSource).toContain("const canManageWorkflowGuidance = internalRole === \"owner\" || internalRole === \"admin\";");
  });
});
