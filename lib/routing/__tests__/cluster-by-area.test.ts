import { describe, expect, it } from "vitest";
import { clusterJobsByArea, type LocatedPlanJob, type PlanJob } from "../route-plan";

/**
 * Real Central Valley geography — these tests encode the owner's own examples:
 *  - "Stockton and Lodi, and not Manteca anymore — it's the other way"
 *  - "Sacramento groupings would be like Elk Grove, Sacramento, Galt"
 */
const SHOP = { latitude: 37.9577, longitude: -121.2908 }; // Stockton home base

const CITY = {
  stockton: { latitude: 37.9577, longitude: -121.2908 },
  lodi: { latitude: 38.1341, longitude: -121.2722 }, // ~20 km north
  manteca: { latitude: 37.7974, longitude: -121.2161 }, // ~19 km south
  galt: { latitude: 38.2546, longitude: -121.2999 }, // north, between Lodi and Elk Grove
  elkGrove: { latitude: 38.4088, longitude: -121.3716 },
  sacramento: { latitude: 38.5816, longitude: -121.4944 },
} as const;

function job(id: string, city: keyof typeof CITY): LocatedPlanJob {
  return {
    id,
    title: `Job ${id}`,
    address: null,
    city: city.charAt(0).toUpperCase() + city.slice(1),
    customerName: null,
    phone: null,
    coordinates: CITY[city],
    durationMinutes: null,
  } as PlanJob as LocatedPlanJob;
}

function areaCities(area: LocatedPlanJob[]): string[] {
  return Array.from(new Set(area.map((j) => String(j.city).toLowerCase()))).sort();
}

describe("clusterJobsByArea", () => {
  it("keeps Stockton+Lodi in one lane and files Manteca separately (the other way)", () => {
    const areas = clusterJobsByArea(
      [job("s1", "stockton"), job("s2", "stockton"), job("l1", "lodi"), job("m1", "manteca")],
      { homeBase: SHOP },
    );

    const sorted = areas.map(areaCities).sort((a, b) => b.length - a.length);
    expect(sorted).toEqual([["lodi", "stockton"], ["manteca"]]);
  });

  it("groups Sacramento with Elk Grove and Galt, apart from the Stockton lane", () => {
    const areas = clusterJobsByArea(
      [
        job("s1", "stockton"),
        job("s2", "stockton"),
        job("sac1", "sacramento"),
        job("sac2", "sacramento"),
        job("eg1", "elkGrove"),
        job("g1", "galt"),
        job("l1", "lodi"),
      ],
      { homeBase: SHOP },
    );

    const sorted = areas.map(areaCities).sort((a, b) => b.length - a.length);
    expect(sorted).toContainEqual(["elkgrove", "galt", "sacramento"]);
    expect(sorted).toContainEqual(["lodi", "stockton"]);
  });

  it("attaches home-city work to the lane with the most jobs", () => {
    // Two Lodi jobs vs one Manteca job: Stockton (home city) rides north.
    const areas = clusterJobsByArea(
      [job("l1", "lodi"), job("l2", "lodi"), job("s1", "stockton"), job("m1", "manteca")],
      { homeBase: SHOP },
    );
    const withStockton = areas.find((area) => areaCities(area).includes("stockton"))!;
    expect(areaCities(withStockton)).toEqual(["lodi", "stockton"]);
  });

  it("falls back to distance-only rules without a home base", () => {
    // No lane discipline without a shop location: all three merge on distance.
    const areas = clusterJobsByArea(
      [job("s1", "stockton"), job("l1", "lodi"), job("m1", "manteca")],
      { homeBase: null },
    );
    expect(areas.map(areaCities).some((cities) => cities.length === 3)).toBe(true);
  });

  it("keeps genuinely distant metro areas apart regardless of lane", () => {
    const areas = clusterJobsByArea([job("s1", "stockton"), job("sac1", "sacramento")], {
      homeBase: SHOP,
    });
    expect(areas).toHaveLength(2);
  });
});
