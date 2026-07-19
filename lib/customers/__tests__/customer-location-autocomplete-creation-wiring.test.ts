import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const newCustomerSource = readFileSync(resolve(process.cwd(), "app/customers/new/page.tsx"), "utf8");
const customerProfileSource = readFileSync(resolve(process.cwd(), "app/customers/[id]/page.tsx"), "utf8");
const customerActionsSource = readFileSync(resolve(process.cwd(), "lib/actions/customer-actions.ts"), "utf8");

describe("customer location autocomplete creation wiring", () => {
  it("wires only the optional physical location on new customer creation", () => {
    expect(newCustomerSource).toContain("<ServiceLocationAddressFields required={false} showAddressLine2={false} />");
    expect(newCustomerSource).toContain("<form action={createCustomerOnlyFromForm}");
    expect(newCustomerSource).toContain("Optional. Leave blank to add a location later");
    expect(newCustomerSource).not.toContain("BillingAddressFields");
  });

  it("retains customer-only creation and the existing optional-location action contract", () => {
    expect(customerActionsSource).toContain("const hasAddress = Boolean(address_line1 && city && zip)");
    expect(customerActionsSource).toContain("if (hasAddress)");
    expect(customerActionsSource).not.toContain("GoogleAddressAutocomplete");
  });

  it("wires Add Location without changing customer identity or action", () => {
    expect(customerProfileSource).toContain("<form action={addCustomerServiceLocationFromForm}");
    expect(customerProfileSource).toContain('<input type="hidden" name="customer_id" value={customerId} />');
    expect(customerProfileSource).toContain("<ServiceLocationAddressFields");
    expect(customerProfileSource).not.toContain('initialValues={{ state: "CA" }}');
    expect(customerProfileSource).not.toContain('type="hidden" name="state" value="CA"');
  });

  it("preserves normalized duplicate-location reuse and submit-time creation", () => {
    expect(customerActionsSource).toContain("normalizedAddressLine1");
    expect(customerActionsSource).toContain("reusableLocation");
    expect(customerActionsSource).toContain('locSaved=existing');
    expect(customerActionsSource).toContain('.from("locations")');
  });
});
