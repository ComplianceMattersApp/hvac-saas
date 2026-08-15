import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

// The desktop job detail header is rendered by the V2 surface; /jobs/[id]
// delegates to it, so the header contract lives here now.
const source = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/v2/page.tsx"),
  "utf8",
);

describe("job detail header short reference wiring", () => {
  it("uses the shared short job reference helper in the job detail header", () => {
    expect(source).toContain('import { formatJobDisplayReference } from "@/lib/utils/display-references";');
    expect(source).toContain("formatJobDisplayReference({");
    expect(source).toContain("jobDisplayNumber:");
    expect(source).toContain("jobId: job.id");
  });

  it("keeps the short reference visible and never surfaces the raw UUID", () => {
    expect(source).toContain("jobDisplayRef");
    // The classic desktop header demoted the UUID behind a "Tech ID" label.
    // V2 does not render the raw UUID at all, which satisfies the same intent.
    expect(source).not.toContain(">Job ID<");
    expect(source).not.toContain("Tech ID");
  });

  it("badges jobs that started from the permit workflow", () => {
    expect(source).toContain("const startedFromPermitWorkflow =");
    expect(source).toContain("Created from permit request");
    expect(source).toContain("Permit Workflow");
  });
});
