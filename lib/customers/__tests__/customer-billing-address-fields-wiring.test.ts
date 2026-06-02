import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const billingFieldsSource = readFileSync(
  resolve(__dirname, "../../../app/customers/[id]/edit/_components/BillingAddressFields.tsx"),
  "utf8",
);

const customerActionsSource = readFileSync(
  resolve(__dirname, "../../../lib/actions/customer-actions.ts"),
  "utf8",
);

describe("customer billing address edit wiring", () => {
  it("defaults to same-as-service mode when explicit billing fields are missing", () => {
    expect(billingFieldsSource).toContain("type BillingAddressMode = 'same_as_service' | 'different';");
    expect(billingFieldsSource).toContain("if (hasServiceAddress && explicitBillingMatchesService) return 'same_as_service';");
    expect(billingFieldsSource).toContain("if (hasExplicitBillingAddress) return 'different';");
    expect(billingFieldsSource).toContain("if (hasServiceAddress) return 'same_as_service';");
    expect(billingFieldsSource).toContain("Billing address defaults to the service address unless you enter a different billing address.");
  });

  it("persists copied service address fields through hidden inputs in same-as mode", () => {
    expect(billingFieldsSource).toContain("useServiceAddressMode");
    expect(billingFieldsSource).toContain("<input type=\"hidden\" name=\"billing_address_line1\" value={serviceAddressLine1} />");
    expect(billingFieldsSource).toContain("<input type=\"hidden\" name=\"billing_address_line2\" value={serviceAddressLine2} />");
    expect(billingFieldsSource).toContain("<input type=\"hidden\" name=\"billing_city\" value={serviceCity} />");
    expect(billingFieldsSource).toContain("<input type=\"hidden\" name=\"billing_state\" value={serviceState} />");
    expect(billingFieldsSource).toContain("<input type=\"hidden\" name=\"billing_zip\" value={serviceZip} />");
  });

  it("keeps separate billing address entry available when different mode is selected", () => {
    expect(billingFieldsSource).toContain("Different billing address");
    expect(billingFieldsSource).toContain("name=\"billing_address_line1\"");
    expect(billingFieldsSource).toContain("name=\"billing_city\"");
    expect(billingFieldsSource).toContain("name=\"billing_state\"");
    expect(billingFieldsSource).toContain("name=\"billing_zip\"");
  });

  it("submits billing address fields through existing customer profile action", () => {
    expect(customerActionsSource).toContain('const billing_address_line1 = String(formData.get("billing_address_line1") ?? "").trim() || null;');
    expect(customerActionsSource).toContain('const billing_city = String(formData.get("billing_city") ?? "").trim() || null;');
    expect(customerActionsSource).toContain("billing_address_line1,");
    expect(customerActionsSource).toContain("billing_city,");
    expect(customerActionsSource).toContain("billing_state,");
    expect(customerActionsSource).toContain("billing_zip,");
  });
});
