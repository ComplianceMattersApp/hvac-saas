import { describe, expect, it } from "vitest";
import {
  coordinateWriteColumns,
  LOCATION_LATITUDE_FIELD,
  LOCATION_LONGITUDE_FIELD,
  normalizeCoordinatePair,
  readCoordinateFormFields,
} from "../coordinates";

describe("normalizeCoordinatePair", () => {
  it("accepts numeric and string inputs and rounds to 6 decimal places", () => {
    expect(normalizeCoordinatePair(37.95776012345, "-121.29079987654")).toEqual({
      latitude: 37.95776,
      longitude: -121.2908,
    });
  });

  it("rejects missing, blank, or non-numeric values", () => {
    expect(normalizeCoordinatePair(null, -121.29)).toBeNull();
    expect(normalizeCoordinatePair("", "-121.29")).toBeNull();
    expect(normalizeCoordinatePair("37.95", "not-a-number")).toBeNull();
    expect(normalizeCoordinatePair(undefined, undefined)).toBeNull();
    expect(normalizeCoordinatePair(Number.NaN, -121.29)).toBeNull();
    expect(normalizeCoordinatePair(Number.POSITIVE_INFINITY, -121.29)).toBeNull();
  });

  it("rejects out-of-range coordinates", () => {
    expect(normalizeCoordinatePair(90.1, 0.5)).toBeNull();
    expect(normalizeCoordinatePair(-90.1, 0.5)).toBeNull();
    expect(normalizeCoordinatePair(37.95, 180.1)).toBeNull();
    expect(normalizeCoordinatePair(37.95, -180.1)).toBeNull();
  });

  it("treats 0,0 as missing data rather than a real place", () => {
    expect(normalizeCoordinatePair(0, 0)).toBeNull();
    expect(normalizeCoordinatePair("0", "0")).toBeNull();
  });

  it("keeps boundary values that are legitimately in range", () => {
    expect(normalizeCoordinatePair(90, -180)).toEqual({ latitude: 90, longitude: -180 });
  });
});

describe("readCoordinateFormFields", () => {
  it("reads the hidden autocomplete fields from form data", () => {
    const formData = new FormData();
    formData.set(LOCATION_LATITUDE_FIELD, "37.957760");
    formData.set(LOCATION_LONGITUDE_FIELD, "-121.290800");
    expect(readCoordinateFormFields(formData)).toEqual({
      latitude: 37.95776,
      longitude: -121.2908,
    });
  });

  it("returns null when either field is absent or invalid", () => {
    const missingLongitude = new FormData();
    missingLongitude.set(LOCATION_LATITUDE_FIELD, "37.95776");
    expect(readCoordinateFormFields(missingLongitude)).toBeNull();

    const tampered = new FormData();
    tampered.set(LOCATION_LATITUDE_FIELD, "999");
    tampered.set(LOCATION_LONGITUDE_FIELD, "-121.29");
    expect(readCoordinateFormFields(tampered)).toBeNull();
  });
});

describe("coordinateWriteColumns", () => {
  it("returns an empty object when no coordinates were captured", () => {
    expect(coordinateWriteColumns(null, "places_autocomplete")).toEqual({});
  });

  it("returns insert-ready columns with provenance and timestamp", () => {
    const columns = coordinateWriteColumns(
      { latitude: 37.95776, longitude: -121.2908 },
      "places_autocomplete",
    );
    expect(columns).toMatchObject({
      latitude: 37.95776,
      longitude: -121.2908,
      geocode_source: "places_autocomplete",
    });
    expect(typeof (columns as { geocoded_at?: string }).geocoded_at).toBe("string");
    expect(Number.isNaN(Date.parse((columns as { geocoded_at: string }).geocoded_at))).toBe(false);
  });
});
