import { describe, expect, it } from "vitest";
import {
  parseGoogleAddressComponents,
  preserveAddressLine2,
  type GoogleAddressComponent,
} from "../google-place-address";

const component = (
  type: string,
  longText: string,
  shortText = longText,
): GoogleAddressComponent => ({ types: [type], longText, shortText });

describe("parseGoogleAddressComponents", () => {
  it("assembles street number and route independently of component ordering", () => {
    const parsed = parseGoogleAddressComponents([
      component("route", "Cordova Lane", "Cordova Ln"),
      component("locality", "Stockton"),
      component("street_number", "437"),
    ]);
    expect(parsed.addressLine1).toBe("437 Cordova Lane");
    expect(parsed.city).toBe("Stockton");
  });

  it("returns the route safely when the street number is missing", () => {
    expect(parseGoogleAddressComponents([component("route", "Main Street")]).addressLine1).toBe("Main Street");
  });

  it("returns the street number safely when the route is missing", () => {
    expect(parseGoogleAddressComponents([component("street_number", "25")]).addressLine1).toBe("25");
  });

  it("prefers locality and applies justified city fallbacks", () => {
    expect(parseGoogleAddressComponents([component("locality", "Sacramento")]).city).toBe("Sacramento");
    expect(parseGoogleAddressComponents([component("postal_town", "Truckee")]).city).toBe("Truckee");
    expect(parseGoogleAddressComponents([component("sublocality_level_1", "Hollywood")]).city).toBe("Hollywood");
    expect(parseGoogleAddressComponents([component("administrative_area_level_2", "San Joaquin County")]).city)
      .toBe("San Joaquin County");
  });

  it("uses the state abbreviation and normalizes it to uppercase", () => {
    const parsed = parseGoogleAddressComponents([
      component("administrative_area_level_1", "California", "ca"),
    ]);
    expect(parsed.state).toBe("CA");
  });

  it("returns a five-digit ZIP without a suffix", () => {
    expect(parseGoogleAddressComponents([component("postal_code", "95207")]).zip).toBe("95207");
  });

  it("joins ZIP and postal suffix as ZIP+4", () => {
    const parsed = parseGoogleAddressComponents([
      component("postal_code_suffix", "1234"),
      component("postal_code", "95207"),
    ]);
    expect(parsed.zip).toBe("95207-1234");
  });

  it("returns safe partial values for incomplete or absent components", () => {
    expect(parseGoogleAddressComponents(undefined)).toEqual({
      addressLine1: "",
      city: "",
      state: "",
      zip: "",
      suggestedUnit: "",
    });
  });

  it("exposes subpremise separately without making it canonical line 2", () => {
    const selection = parseGoogleAddressComponents([component("subpremise", "Suite 4")]);
    expect(selection.suggestedUnit).toBe("Suite 4");
    expect(selection).not.toHaveProperty("addressLine2");
  });

  it("preserves an existing Address Line 2 value", () => {
    const selection = parseGoogleAddressComponents([component("subpremise", "Unit 9")]);
    expect(preserveAddressLine2(selection, "Building B")).toMatchObject({
      addressLine2: "Building B",
      suggestedUnit: "Unit 9",
    });
  });
});
