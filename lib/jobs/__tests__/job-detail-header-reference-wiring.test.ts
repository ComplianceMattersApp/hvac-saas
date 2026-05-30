import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf8",
);

describe("job detail header short reference wiring", () => {
  it("uses the shared short job reference helper in the job detail header", () => {
    expect(source).toContain('import { formatJobDisplayReference } from "@/lib/utils/display-references";');
    expect(source).toContain("const jobHeaderReference = formatJobDisplayReference({");
    expect(source).toContain("jobDisplayNumber:");
    expect(source).toContain("jobId: job.id");
  });

  it("keeps the short reference visible and demotes raw UUID to technical copy", () => {
    expect(source).toContain("{jobHeaderReference}");
    expect(source).toContain("Tech ID");
    expect(source).not.toContain(">Job ID<");
  });
});
