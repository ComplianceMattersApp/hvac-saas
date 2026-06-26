import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const jobPageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf8",
);

const mobileJobDetailCurrentSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/MobileJobDetailCurrent.tsx"),
  "utf8",
);

describe("job detail service address edit affordance", () => {
  it("links internal users from job detail to the saved service address editor", () => {
    expect(jobPageSource).toContain(
      "const serviceLocationEditHref = locationId ? `/locations/${locationId}` : null;",
    );
    expect(mobileJobDetailCurrentSource).toContain("aria-label={`Edit service address: ${serviceAddressDisplay}`}");
    expect(jobPageSource).toContain("Correct address");
    expect(mobileJobDetailCurrentSource).toContain("href={serviceLocationEditHref}");
  });
});
