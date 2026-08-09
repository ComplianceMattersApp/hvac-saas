import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Route-planning foundations: coordinates captured by the address autocomplete
 * must actually reach the canonical `locations` writes. These are wiring
 * pins — they fail loudly if a refactor drops the hidden fields or the
 * coordinate spread from either new-location insert branch.
 */

const jobActionsSource = readFileSync(
  resolve(process.cwd(), "lib/actions/job-actions.ts"),
  "utf8",
);
const newJobFormSource = readFileSync(
  resolve(process.cwd(), "app/jobs/new/NewJobForm.tsx"),
  "utf8",
);
const autocompleteSource = readFileSync(
  resolve(process.cwd(), "components/addresses/GoogleAddressAutocomplete.tsx"),
  "utf8",
);

describe("location coordinate capture wiring", () => {
  it("fetches geometry alongside address components in the autocomplete", () => {
    expect(autocompleteSource).toContain('fields: ["addressComponents", "location"]');
    expect(autocompleteSource).toContain("parseGooglePlaceLocation");
  });

  it("posts captured coordinates from both NewJobForm new-location blocks", () => {
    const hiddenLatitudeInputs = newJobFormSource.match(/name="location_latitude"/g) ?? [];
    const hiddenLongitudeInputs = newJobFormSource.match(/name="location_longitude"/g) ?? [];
    expect(hiddenLatitudeInputs.length).toBe(2);
    expect(hiddenLongitudeInputs.length).toBe(2);
  });

  it("clears captured coordinates when the address is manually edited", () => {
    expect(newJobFormSource).toContain("function editNewLocationAddressField");
    // line 1, city, state, and zip across both new-location blocks
    const clearingHandlers = newJobFormSource.match(/editNewLocationAddressField\(setNewLocation/g) ?? [];
    expect(clearingHandlers.length).toBe(8);
  });

  it("spreads coordinate columns into both new-location inserts in createJobFromForm", () => {
    expect(jobActionsSource).toContain("readCoordinateFormFields(formData)");
    const coordinateSpreads =
      jobActionsSource.match(
        /\.\.\.coordinateWriteColumns\(capturedServiceCoordinates, "places_autocomplete"\)/g,
      ) ?? [];
    expect(coordinateSpreads.length).toBe(2);
  });
});
