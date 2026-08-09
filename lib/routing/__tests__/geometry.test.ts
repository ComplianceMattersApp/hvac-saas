import { describe, expect, it } from "vitest";
import {
  estimateDriveMinutes,
  haversineKm,
  kmToMiles,
  minutesToHHMM,
  minutesToLabel,
  parseTimeToMinutes,
  snapDownToHalfHour,
} from "../geometry";

const STOCKTON = { latitude: 37.9577, longitude: -121.2908 };
const LODI = { latitude: 38.1341, longitude: -121.2722 };

describe("haversineKm", () => {
  it("returns zero for identical points", () => {
    expect(haversineKm(STOCKTON, STOCKTON)).toBe(0);
  });

  it("matches the known Stockton–Lodi distance within tolerance", () => {
    const km = haversineKm(STOCKTON, LODI);
    expect(km).toBeGreaterThan(19);
    expect(km).toBeLessThan(21);
  });

  it("is symmetric", () => {
    expect(haversineKm(STOCKTON, LODI)).toBeCloseTo(haversineKm(LODI, STOCKTON), 10);
  });
});

describe("estimateDriveMinutes", () => {
  it("returns zero for the same point", () => {
    expect(estimateDriveMinutes(STOCKTON, STOCKTON)).toBe(0);
  });

  it("grows with distance and includes the arrival buffer", () => {
    const near = estimateDriveMinutes(STOCKTON, {
      latitude: 37.9677,
      longitude: -121.2908,
    });
    const far = estimateDriveMinutes(STOCKTON, LODI);
    expect(near).toBeGreaterThanOrEqual(4);
    expect(far).toBeGreaterThan(near);
    // ~20 km of city driving should land in a plausible 25–45 minute range.
    expect(far).toBeGreaterThan(25);
    expect(far).toBeLessThan(45);
  });
});

describe("time helpers", () => {
  it("parses HH:MM and HH:MM:SS", () => {
    expect(parseTimeToMinutes("08:30")).toBe(510);
    expect(parseTimeToMinutes("08:30:00")).toBe(510);
    expect(parseTimeToMinutes("18:00")).toBe(1080);
  });

  it("rejects invalid time strings", () => {
    expect(parseTimeToMinutes("")).toBeNull();
    expect(parseTimeToMinutes(null)).toBeNull();
    expect(parseTimeToMinutes("25:00")).toBeNull();
    expect(parseTimeToMinutes("12:75")).toBeNull();
    expect(parseTimeToMinutes("soon")).toBeNull();
  });

  it("formats minutes as HH:MM and friendly labels", () => {
    expect(minutesToHHMM(510)).toBe("08:30");
    expect(minutesToHHMM(1080)).toBe("18:00");
    expect(minutesToLabel(510)).toBe("8:30 AM");
    expect(minutesToLabel(750)).toBe("12:30 PM");
    expect(minutesToLabel(0)).toBe("12:00 AM");
  });

  it("snaps down to half hours", () => {
    expect(snapDownToHalfHour(544)).toBe(540);
    expect(snapDownToHalfHour(540)).toBe(540);
    expect(snapDownToHalfHour(569)).toBe(540);
    expect(snapDownToHalfHour(570)).toBe(570);
  });

  it("converts km to miles", () => {
    expect(kmToMiles(1.609344)).toBeCloseTo(1, 6);
  });
});
