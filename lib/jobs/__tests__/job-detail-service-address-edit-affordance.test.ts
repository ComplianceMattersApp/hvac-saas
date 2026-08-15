import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const jobPageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf8",
);

const mobileJobDetailV2PreviewSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/MobileJobDetailV2Preview.tsx"),
  "utf8",
);

describe("job detail service address edit affordance", () => {
  it("links internal users from job detail to the saved service address editor", () => {
    expect(jobPageSource).toContain(
      "const serviceLocationEditHref = locationId ? `/locations/${locationId}` : null;",
    );
    expect(jobPageSource).toContain("serviceLocationEditHref={serviceLocationEditHref}");
  });

  it("renders the mobile edit entry only for internal users", () => {
    expect(mobileJobDetailV2PreviewSource).toContain(
      "{isInternalUser && serviceLocationEditHref ? (",
    );
    expect(mobileJobDetailV2PreviewSource).toContain("href={serviceLocationEditHref}");
    // Labelled by visible text rather than the classic surface's aria-label.
    expect(mobileJobDetailV2PreviewSource).toContain("Edit service location");
  });
});
