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
    expect(jobDetailSource).toContain("title=\"Service Chain\"");
    expect(jobDetailSource).toContain("Workflow Guidance");
    expect(jobDetailSource).toContain("<DeferredWorkflowMilestonesPanelBody");
  });

  it("passes account scope and service_case_id into workflow guidance panel", () => {
    expect(jobDetailSource).toContain(
      "accountOwnerUserId={String(internalUser.account_owner_user_id)}",
    );
    expect(jobDetailSource).toContain("currentJobId={String(jobId)}");
    expect(jobDetailSource).toContain("serviceCaseId={String(serviceCaseId)}");
  });
});
