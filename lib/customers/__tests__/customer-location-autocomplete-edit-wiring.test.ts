import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const customerProfileSource = readFileSync(resolve(process.cwd(), "app/customers/[id]/page.tsx"), "utf8");
const locationPageSource = readFileSync(resolve(process.cwd(), "app/locations/[id]/page.tsx"), "utf8");
const locationActionSource = readFileSync(resolve(process.cwd(), "app/locations/[id]/notes-actions.ts"), "utf8");

describe("canonical location autocomplete edit wiring", () => {
  it("uses the shared island with saved values on customer profile edit", () => {
    expect(customerProfileSource).toContain("<form action={updateLocationServiceAddressFromForm}");
    expect(customerProfileSource).toContain('<input type="hidden" name="location_id" value={locId} />');
    expect(customerProfileSource).toContain('<input type="hidden" name="return_customer_id" value={customerId} />');
    expect(customerProfileSource).toContain("addressLine2: String(loc.address_line2 ?? \"\")");
    expect(customerProfileSource).toContain("zip: String(loc.zip ?? loc.postal_code ?? \"\")");
  });

  it("uses the same island and action on standalone canonical location edit", () => {
    expect(locationPageSource).toContain("<form action={updateLocationServiceAddressFromForm}");
    expect(locationPageSource).toContain('<input type="hidden" name="location_id" value={locationId} />');
    expect(locationPageSource).toContain("<ServiceLocationAddressFields");
    expect(locationPageSource).toContain('tone="muted"');
  });

  it("preserves correction-versus-reassignment and historical snapshot warning copy", () => {
    expect(locationPageSource).toContain("Correcting it updates the saved customer location and future job creation");
    expect(locationPageSource).toContain("Completed job snapshots are not bulk-rewritten");
  });

  it("leaves the scoped update and conditional billing safeguard authoritative", () => {
    expect(locationActionSource).toContain("loadScopedLocationForInternalMutation(locationId)");
    expect(locationActionSource).toContain("billingMatchesOldLocation(customer, location)");
    expect(locationActionSource).toContain("allBillingFieldsBlank(customer)");
    expect(locationActionSource).toContain('.eq("id", locationId)');
    expect(locationActionSource).not.toContain("GoogleAddressAutocomplete");
  });

  it("does not add invoice, estimate, job snapshot, QBO, or payment mutation paths", () => {
    expect(locationActionSource).not.toContain('.from("internal_invoices")');
    expect(locationActionSource).not.toContain('.from("estimates")');
    expect(locationActionSource).not.toContain('.from("jobs").update');
    expect(locationActionSource).not.toContain("qbo");
    expect(locationActionSource).not.toContain("stripe");
  });
});
