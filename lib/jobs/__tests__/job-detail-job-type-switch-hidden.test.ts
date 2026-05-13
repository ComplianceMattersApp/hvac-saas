import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const jobDetailSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf-8",
);

const newJobFormSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/new/NewJobForm.tsx"),
  "utf-8",
);

describe("Job detail UI hardening - job type switch", () => {
  it("does not render Change Job Type panel copy on /jobs/[id]", () => {
    expect(jobDetailSource).not.toContain("Change Job Type");
    expect(jobDetailSource).not.toContain("Switch between service and ECC workflows.");
  });

  it("does not render job type switch form wiring on /jobs/[id]", () => {
    expect(jobDetailSource).not.toContain("action={updateJobTypeFromForm}");
  });

  it("keeps normal edit controls on job detail", () => {
    expect(jobDetailSource).toContain("Scheduling");
    expect(jobDetailSource).toContain("Change Contractor");
    expect(jobDetailSource).toContain("Service Details");
    expect(jobDetailSource).toContain("Permit & Compliance");
  });

  it("keeps creation-time job family selection available in /jobs/new", () => {
    expect(newJobFormSource).toContain("setJobType");
    expect(newJobFormSource).toContain('value="ecc"');
    expect(newJobFormSource).toContain('value="service"');
    expect(newJobFormSource).toContain('name="job_type"');
  });
});
