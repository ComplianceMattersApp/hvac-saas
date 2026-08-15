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

const desktopV2JobDetailSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/v2/page.tsx"),
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

  it("offers the same address editor from the desktop V2 location card", () => {
    // Desktop V2 redirects contractors to the portal before render, so reaching
    // this surface already implies an internal user and needs no extra gate.
    expect(desktopV2JobDetailSource).toContain("redirect(`/portal/jobs/${jobId}`)");
    expect(desktopV2JobDetailSource).toContain("href={`/locations/${location.id}`}");
    expect(desktopV2JobDetailSource).toContain("Edit service address");
  });

  it("keeps changing which location is used separate from editing its address", () => {
    // ChangeServiceLocationForm switches the job to a different saved location;
    // it is not a substitute for correcting the current address.
    expect(desktopV2JobDetailSource).toContain("<ChangeServiceLocationForm");
    expect(desktopV2JobDetailSource).toContain("customerLocations.length > 1 ? (");
  });
});
