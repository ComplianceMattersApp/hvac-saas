import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const formSource = readFileSync(
  path.join(process.cwd(), "app", "jobs", "new", "NewJobForm.tsx"),
  "utf8",
);
const visitScopeBuilderSource = readFileSync(
  path.join(process.cwd(), "components", "jobs", "VisitScopeBuilder.tsx"),
  "utf8",
);

describe("/jobs/new ECC-only guided alignment", () => {
  it("uses ECC-specific internal page and helper copy", () => {
    expect(formSource).toContain('? "New Work Order"');
    expect(formSource).toContain('? "New ECC Job"');
    expect(formSource).toContain(
      '"Select the responsible account and service location, define the compliance work, then create the job."',
    );
    expect(formSource).toContain('"Select the customer / responsible account and confirm where the compliance job should happen."');
  });

  it("uses ECC-specific create copy when the account is ecc_hers", () => {
    expect(formSource).toContain('? "Create ECC Job"');
    expect(formSource).toContain('"Review the compliance job summary, then create it when the required intake details are ready."');
    expect(formSource).toContain('"Ready to create this ECC job."');
  });

  it("does not expose the hybrid job-type choice UI for locked ECC accounts", () => {
    expect(formSource).toContain('title: jobFamilyStepTitle');
    expect(formSource).toContain('This account stays in the ECC workflow. Project type, permit, and jurisdiction details stay visible below.');
    expect(formSource).toContain('name="job_type" value={modeSafeJobType}');
  });

  it("keeps project type and ECC permit fields available", () => {
    expect(formSource).toContain('name="project_type"');
    expect(formSource).toContain('name="permit_number"');
    expect(formSource).toContain('name="jurisdiction"');
    expect(formSource).toContain('name="permit_date"');
  });

  it("preserves ECC lightweight scope language instead of forcing service scope", () => {
    expect(visitScopeBuilderSource).toContain('ECC test work is tracked separately. Add work items only if this visit includes additional service work.');
    expect(visitScopeBuilderSource).toContain('More options');
  });
});
