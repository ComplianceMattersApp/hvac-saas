import { describe, expect, it } from "vitest";
import { parseDismissals } from "@/components/calendar/RoutePlanView";

describe("parseDismissals", () => {
  it("parses single and repeated exclude params into a job → dates map", () => {
    // Job ids are UUIDs; the parser deliberately accepts only hex-and-dash ids.
    const idA = "5dbcd55c-73eb-48af-88c4-f4e0e2ce68bd";
    const idB = "43760be6-d0b9-412d-88d0-135078403800";
    expect(parseDismissals(`${idA}@2026-08-10`)).toEqual({ [idA]: ["2026-08-10"] });
    expect(
      parseDismissals([`${idA}@2026-08-10`, `${idA}@2026-08-11`, `${idB}@2026-08-10`]),
    ).toEqual({
      [idA]: ["2026-08-10", "2026-08-11"],
      [idB]: ["2026-08-10"],
    });
  });

  it("deduplicates repeated entries", () => {
    expect(parseDismissals(["a1b2c3d4@2026-08-10", "a1b2c3d4@2026-08-10"])).toEqual({
      a1b2c3d4: ["2026-08-10"],
    });
  });

  it("ignores malformed entries and missing input", () => {
    expect(parseDismissals(undefined)).toEqual({});
    expect(parseDismissals("")).toEqual({});
    expect(parseDismissals("not-a-dismissal")).toEqual({});
    expect(parseDismissals("a1b2c3d4@tomorrow")).toEqual({});
    expect(parseDismissals("a1b2c3d4@2026-8-1")).toEqual({});
    expect(parseDismissals("shortid@2026-08-10")).toEqual({});
    expect(parseDismissals("<script>@2026-08-10")).toEqual({});
  });

  it("caps hand-built URLs at the dismissal limit", () => {
    const flood = Array.from({ length: 200 }, (_, i) =>
      `${String(i).padStart(8, "0")}-0000-0000-0000-000000000000@2026-08-10`,
    );
    const parsed = parseDismissals(flood);
    expect(Object.keys(parsed).length).toBeLessThanOrEqual(50);
  });
});
