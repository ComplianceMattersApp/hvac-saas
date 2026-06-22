import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const todayPageSource = readFileSync(
  resolve(__dirname, "../../../app/today/page.tsx"),
  "utf8",
);

const clientSource = readFileSync(
  resolve(__dirname, "../../../components/home/TodayFieldConditionsClient.tsx"),
  "utf8",
);

const routeSource = readFileSync(
  resolve(__dirname, "../../../app/api/today/field-conditions/route.ts"),
  "utf8",
);

const readModelSource = readFileSync(
  resolve(__dirname, "../today-read-model.ts"),
  "utf8",
);

describe("today field conditions current-location wiring", () => {
  it("renders field conditions through the client geolocation component", () => {
    expect(todayPageSource).toContain("TodayFieldConditionsClient");
    expect(clientSource).toContain("navigator.geolocation.getCurrentPosition");
    expect(clientSource).toContain("Enable location for field conditions");
    expect(clientSource).not.toContain("localStorage");
  });

  it("routes rounded browser coordinates through the server weather helper", () => {
    expect(routeSource).toContain("loadTodayFieldConditionsForCoordinates");
    expect(routeSource).toContain("request.nextUrl.searchParams.get(\"lat\")");
    expect(routeSource).toContain("locationLabel: \"Near you\"");
  });

  it("does not load field conditions from scheduled Today job locations in the read model", () => {
    expect(readModelSource).not.toContain("fieldConditionsRead");
    expect(readModelSource).not.toContain("loadTodayFieldConditions");
    expect(readModelSource).not.toContain("locations:location_id(city, state)");
  });
});
