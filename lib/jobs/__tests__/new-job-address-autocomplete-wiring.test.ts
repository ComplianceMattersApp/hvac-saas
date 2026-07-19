import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  mergeSelectedServiceAddress,
  shouldShowInternalAddressAutocomplete,
} from "../new-job-address-autocomplete";

const formSource = readFileSync(resolve(process.cwd(), "app/jobs/new/NewJobForm.tsx"), "utf8");

describe("internal new-job address autocomplete pilot", () => {
  it("shows only for internal manual new-location modes", () => {
    expect(shouldShowInternalAddressAutocomplete({
      isInternalMode: true,
      createNewCustomer: true,
      selectedCustomerId: "",
      locationMode: null,
    })).toBe(true);
    expect(shouldShowInternalAddressAutocomplete({
      isInternalMode: true,
      createNewCustomer: false,
      selectedCustomerId: "customer-1",
      locationMode: "new",
    })).toBe(true);
    expect(shouldShowInternalAddressAutocomplete({
      isInternalMode: true,
      createNewCustomer: false,
      selectedCustomerId: "customer-1",
      locationMode: "existing",
    })).toBe(false);
    expect(shouldShowInternalAddressAutocomplete({
      isInternalMode: false,
      createNewCustomer: true,
      selectedCustomerId: "",
      locationMode: "new",
    })).toBe(false);
  });

  it("updates returned address fields while protecting line 2", () => {
    expect(mergeSelectedServiceAddress(
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
        zip: "95207-1234",
        suggestedUnit: "Suite 9",
      },
    )).toEqual({
      addressLine1: "437 Cordova Lane",
      addressLine2: "Building B",
      city: "Stockton",
      state: "CA",
      zip: "95207-1234",
    });
  });

  it("does not erase existing values when a partial selection omits components", () => {
    expect(mergeSelectedServiceAddress(
      {
        addressLine1: "12 Existing Road",
        addressLine2: "Unit 4",
        city: "Lodi",
        state: "CA",
        zip: "95240",
      },
      { addressLine1: "", city: "", state: "", zip: "", suggestedUnit: "" },
    )).toEqual({
      addressLine1: "12 Existing Road",
      addressLine2: "Unit 4",
      city: "Lodi",
      state: "CA",
      zip: "95240",
    });
  });

  it("keeps the existing form action, canonical field names, and editable inputs", () => {
    expect(formSource).toContain('<form action={createJobFromForm}');
    for (const name of ["address_line1", "address_line2", "city", "state", "zip"]) {
      expect(formSource).toContain(`name="${name}"`);
    }
    expect(formSource).toContain("onChange={(e) => setNewLocationAddressLine1(e.target.value)}");
    expect(formSource).toContain("onChange={(e) => setNewLocationAddressLine2(e.target.value)}");
  });

  it("does not assume California for a new service location", () => {
    expect(formSource).toContain('const [newLocationState, setNewLocationState] = useState("")');
    expect(formSource).not.toContain('const [newLocationState, setNewLocationState] = useState("CA")');
  });

  it("uses one application-owned selection handler without submit, action, or identity mutations", () => {
    expect(formSource).toContain("function applyAutocompleteSelection");
    const handler = formSource.slice(
      formSource.indexOf("function applyAutocompleteSelection"),
      formSource.indexOf("function onQuickWindowChange"),
    );
    expect(handler).not.toContain("createJobFromForm");
    expect(handler).not.toContain("requestSubmit");
    expect(handler).not.toContain("setSelectedCustomerId");
    expect(handler).not.toContain("setLocationId");
    expect(handler).not.toContain("setNewLocationAddressLine2");
  });
});
