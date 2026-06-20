import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildAddressDisplay,
  buildMapsDirectionsUrl,
  buildMapsSearchUrl,
  buildStaticMapImageUrl,
} from "@/components/jobs/JobLocationPreview";

const previewImageSource = readFileSync(
  resolve(__dirname, "../../../components/jobs/JobLocationPreviewImage.tsx"),
  "utf8",
);

describe("JobLocationPreview helpers", () => {
  it("builds a valid address and encoded static map preview URL", () => {
    const address = buildAddressDisplay({
      addressLine1: "437 Cordova Ln",
      city: "Stockton",
      state: "CA",
      zip: "95207",
    });

    expect(address).toBe("437 Cordova Ln, Stockton, CA 95207");

    const url = buildStaticMapImageUrl(address, "test key");
    expect(url).toContain("https://maps.googleapis.com/maps/api/staticmap?");
    expect(url).toContain("markers=color:red%7C437%20Cordova%20Ln%2C%20Stockton%2C%20CA%2095207");
    expect(url).toContain("key=test%20key");
  });

  it("keeps Navigate and Open in Maps URLs encoded from the same address", () => {
    const address = "437 Cordova Ln, Stockton, CA 95207";

    expect(buildMapsDirectionsUrl(address)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=437%20Cordova%20Ln%2C%20Stockton%2C%20CA%2095207",
    );
    expect(buildMapsSearchUrl(address)).toBe(
      "https://www.google.com/maps/search/?api=1&query=437%20Cordova%20Ln%2C%20Stockton%2C%20CA%2095207",
    );
  });
});

describe("JobLocationPreviewImage fallback", () => {
  it("renders a clean fallback on image failure instead of browser-visible alt text", () => {
    expect(previewImageSource).toContain("onError={() => setImageFailed(true)}");
    expect(previewImageSource).toContain("Map preview unavailable");
    expect(previewImageSource).toContain("{addressDisplay}");
    expect(previewImageSource).toContain('alt=""');
    expect(previewImageSource).not.toContain("alt={imageAlt}");
  });

  it("keeps the map search anchor around both image and fallback states", () => {
    expect(previewImageSource).toContain("href={mapsSearchUrl}");
    expect(previewImageSource).toContain("Open ${addressDisplay} in Google Maps");
    expect(previewImageSource).toContain("canShowImage");
  });
});
