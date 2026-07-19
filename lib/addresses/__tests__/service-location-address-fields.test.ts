import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeSelectedServiceAddressFields } from "../google-place-address";

const componentSource = readFileSync(
  resolve(process.cwd(), "components/addresses/ServiceLocationAddressFields.tsx"),
  "utf8",
);

describe("shared service-location address fields", () => {
  it("applies non-empty selected values and preserves Address Line 2", () => {
    expect(mergeSelectedServiceAddressFields(
      {
        addressLine1: "Old street",
        addressLine2: "Building B",
        city: "Old city",
        state: "NV",
        zip: "99999",
      },
      {
        addressLine1: "437 Cordova Lane",
        city: "Stockton",
        state: "CA",
        zip: "95207",
        suggestedUnit: "Suite 9",
      },
    )).toEqual({
      addressLine1: "437 Cordova Lane",
      addressLine2: "Building B",
      city: "Stockton",
      state: "CA",
      zip: "95207",
    });
  });

  it("does not erase current values for omitted provider components", () => {
    const current = {
      addressLine1: "12 Existing Road",
      addressLine2: "Unit 4",
      city: "Lodi",
      state: "CA",
      zip: "95240",
    };
    expect(mergeSelectedServiceAddressFields(
      current,
      { addressLine1: "", city: "", state: "", zip: "", suggestedUnit: "" },
    )).toEqual(current);
  });

  it("accepts a non-California U.S. state without relabeling it", () => {
    expect(mergeSelectedServiceAddressFields(
      {
        addressLine1: "",
        addressLine2: "",
        city: "",
        state: "",
        zip: "",
      },
      {
        addressLine1: "123 Mroz Road",
        city: "Beaufort",
        state: "SC",
        zip: "29906-8536",
        suggestedUnit: "",
      },
    )).toMatchObject({
      addressLine1: "123 Mroz Road",
      city: "Beaufort",
      state: "SC",
      zip: "29906-8536",
    });
  });

  it("preserves canonical native form names and React-owned editability", () => {
    for (const name of ["address_line1", "address_line2", "city", "state", "zip"]) {
      expect(componentSource).toContain(`name="${name}"`);
    }
    expect(componentSource).toContain("value={values.addressLine1}");
    expect(componentSource).toContain('onChange={(event) => update("addressLine1", event.target.value)}');
    expect(componentSource).toContain("value={values.state}");
    expect(componentSource).toContain('onChange={(event) => update("state", event.target.value)}');
    expect(componentSource).toContain("required={required}");
  });

  it("uses the adjacent assistant without submit, action, or identity behavior", () => {
    expect(componentSource).toContain("<GoogleAddressAutocomplete");
    expect(componentSource).not.toContain("requestSubmit");
    expect(componentSource).not.toContain("server action");
    expect(componentSource).not.toContain("customer_id");
    expect(componentSource).not.toContain("location_id");
  });
});
