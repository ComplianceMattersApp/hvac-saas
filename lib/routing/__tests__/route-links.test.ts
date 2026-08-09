import { describe, expect, it } from "vitest";
import { buildMultiStopDirectionsUrl, buildRouteStaticMapUrl } from "../route-links";

const HOME = { latitude: 38.0, longitude: -121.3 };
const STOP_1 = { latitude: 38.01, longitude: -121.3, order: 1 };
const STOP_2 = { latitude: 38.02, longitude: -121.3, order: 2 };

describe("buildRouteStaticMapUrl", () => {
  it("returns null without a key or without stops", () => {
    expect(buildRouteStaticMapUrl({ apiKey: null, homeBase: HOME, stops: [STOP_1] })).toBeNull();
    expect(buildRouteStaticMapUrl({ apiKey: "k", homeBase: HOME, stops: [] })).toBeNull();
  });

  it("renders home base and numbered stop markers", () => {
    const url = buildRouteStaticMapUrl({ apiKey: "test-key", homeBase: HOME, stops: [STOP_1, STOP_2] })!;
    expect(url).toContain("https://maps.googleapis.com/maps/api/staticmap?");
    expect(url).toContain("key=test-key");
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain("label:H|38,-121.3");
    expect(decoded).toContain("label:1|38.01,-121.3");
    expect(decoded).toContain("label:2|38.02,-121.3");
  });

  it("omits the home marker when no home base is set", () => {
    const url = buildRouteStaticMapUrl({ apiKey: "k", homeBase: null, stops: [STOP_1] })!;
    expect(decodeURIComponent(url)).not.toContain("label:H");
  });

  it("labels stops past 9 with letters and drops labels past 35", () => {
    const url = buildRouteStaticMapUrl({
      apiKey: "k",
      homeBase: null,
      stops: [
        { ...STOP_1, order: 10 },
        { ...STOP_2, order: 36 },
      ],
    })!;
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain("label:A|");
    expect(decoded).not.toContain("label:36");
  });
});

describe("buildMultiStopDirectionsUrl", () => {
  it("returns null without stops", () => {
    expect(buildMultiStopDirectionsUrl({ homeBase: HOME, stops: [] })).toBeNull();
  });

  it("round-trips from the home base through every stop", () => {
    const url = buildMultiStopDirectionsUrl({ homeBase: HOME, stops: [STOP_1, STOP_2] })!;
    const params = new URL(url).searchParams;
    expect(params.get("origin")).toBe("38,-121.3");
    expect(params.get("destination")).toBe("38,-121.3");
    expect(params.get("waypoints")).toBe("38.01,-121.3|38.02,-121.3");
    expect(params.get("travelmode")).toBe("driving");
  });

  it("runs first-to-last without a home base", () => {
    const url = buildMultiStopDirectionsUrl({ homeBase: null, stops: [STOP_1, STOP_2] })!;
    const params = new URL(url).searchParams;
    expect(params.get("origin")).toBe("38.01,-121.3");
    expect(params.get("destination")).toBe("38.02,-121.3");
    expect(params.get("waypoints")).toBeNull();
  });
});
