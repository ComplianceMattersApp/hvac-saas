import { describe, expect, it } from "vitest";
import { scoreDayFitsForJob } from "../day-fit";
import type { PlanAnchor } from "../route-plan";

const HOME = { latitude: 38.0, longitude: -121.3 };
const north = (steps: number) => ({ latitude: 38.0 + steps * 0.01, longitude: -121.3 });

function anchor(id: string, date: string, coordinates: { latitude: number; longitude: number } | null): PlanAnchor {
  return {
    id,
    title: `Job ${id}`,
    address: null,
    city: "Lodi",
    customerName: null,
    phone: null,
    coordinates,
    durationMinutes: null,
    scheduledDate: date,
    windowStart: "09:00:00",
    windowEnd: "11:00:00",
    assignmentNames: [],
  };
}

describe("scoreDayFitsForJob", () => {
  it("marks a day with nearby committed work as near_work with detour info", () => {
    const fits = scoreDayFitsForJob({
      coordinates: north(2),
      anchorsByDate: { "2026-08-10": [anchor("a1", "2026-08-10", north(3))] },
      horizonDates: ["2026-08-10"],
      homeBase: HOME,
    });

    expect(fits[0]).toMatchObject({
      date: "2026-08-10",
      kind: "near_work",
      anchorCount: 1,
      nearestAnchorLabel: "Lodi",
    });
    expect(fits[0].nearestAnchorKm).toBeGreaterThan(0.9);
    expect(fits[0].nearestAnchorKm).toBeLessThan(1.5);
    expect(fits[0].detourMinutes).toBeGreaterThan(0);
    expect(fits[0].roundTripMinutes).toBeNull();
  });

  it("marks an empty day as open with a round-trip estimate from home", () => {
    const fits = scoreDayFitsForJob({
      coordinates: north(10),
      anchorsByDate: {},
      horizonDates: ["2026-08-10"],
      homeBase: HOME,
    });

    expect(fits[0].kind).toBe("open");
    expect(fits[0].roundTripMinutes).toBeGreaterThan(0);
    expect(fits[0].nearestAnchorKm).toBeNull();
  });

  it("treats far-away committed work as an open day, not near_work", () => {
    const fits = scoreDayFitsForJob({
      coordinates: north(0),
      anchorsByDate: { "2026-08-10": [anchor("a1", "2026-08-10", north(30))] }, // ~33 km away
      horizonDates: ["2026-08-10"],
      homeBase: HOME,
    });

    expect(fits[0].kind).toBe("open");
    expect(fits[0].anchorCount).toBe(1);
  });

  it("counts neighboring-city work as near (30 minutes is not far)", () => {
    // ~20 km — Stockton↔Lodi range — should read as a green day.
    const fits = scoreDayFitsForJob({
      coordinates: north(0),
      anchorsByDate: { "2026-08-10": [anchor("a1", "2026-08-10", north(18))] },
      horizonDates: ["2026-08-10"],
      homeBase: HOME,
    });
    expect(fits[0].kind).toBe("near_work");
  });

  it("marks a day at stop capacity as full", () => {
    const anchors = Array.from({ length: 8 }, (_, i) => anchor(`a${i}`, "2026-08-10", north(1)));
    const fits = scoreDayFitsForJob({
      coordinates: north(1),
      anchorsByDate: { "2026-08-10": anchors },
      horizonDates: ["2026-08-10"],
      homeBase: HOME,
    });

    expect(fits[0]).toMatchObject({ kind: "full", capacityLeft: 0, anchorCount: 8 });
  });

  it("returns one fit per horizon day in order", () => {
    const fits = scoreDayFitsForJob({
      coordinates: north(1),
      anchorsByDate: {},
      horizonDates: ["2026-08-10", "2026-08-11", "2026-08-12"],
      homeBase: null,
    });
    expect(fits.map((f) => f.date)).toEqual(["2026-08-10", "2026-08-11", "2026-08-12"]);
    // Without a home base an open day has no round-trip estimate.
    expect(fits[0].roundTripMinutes).toBeNull();
  });
});
