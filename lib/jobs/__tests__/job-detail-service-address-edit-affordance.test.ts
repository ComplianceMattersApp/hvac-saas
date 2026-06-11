import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const jobPageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf8",
);

describe("job detail service address edit affordance", () => {
  it("links internal users from job detail to the saved service address editor", () => {
    expect(jobPageSource).toContain(
      "const serviceLocationEditHref = locationId ? `/locations/${locationId}` : null;",
    );
    expect(jobPageSource).toContain("Edit service address");
    expect(jobPageSource).toContain("Correct address");
    expect(jobPageSource).toContain("href={serviceLocationEditHref}");
  });
});
