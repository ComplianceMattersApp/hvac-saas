import { describe, expect, it } from "vitest";
import {
  formatInvoiceBillingAddressLines,
  formatServiceLocationAddressLines,
  invoiceServiceLocationMatchesBillingAddress,
} from "@/lib/business/internal-invoice-address-rendering";

const serviceLocation = {
  address_line1: "123 Homeowner Way",
  address_line2: null,
  city: "Stockton",
  state: "CA",
  zip: "95212",
};

describe("internal invoice customer-facing address rendering", () => {
  it("renders contractor-billed invoice billing address when explicit invoice billing fields are present", () => {
    const billingAddress = formatInvoiceBillingAddressLines(
      {
        billing_address_line1: "456 Contractor Blvd",
        billing_address_line2: "Suite 10",
        billing_city: "Sacramento",
        billing_state: "CA",
        billing_zip: "95814",
      },
      "contractor",
    );
    const serviceLocationLines = formatServiceLocationAddressLines(serviceLocation);

    expect(billingAddress).toEqual(["456 Contractor Blvd", "Suite 10", "Sacramento CA 95814"]);
    expect(serviceLocationLines).toEqual(["123 Homeowner Way", "Stockton CA 95212"]);
    expect(
      invoiceServiceLocationMatchesBillingAddress({
        billingRecipient: "contractor",
        billingAddressLines: billingAddress,
        serviceLocationLines,
      }),
    ).toBe(false);
  });

  it("omits contractor-billed invoice billing address when explicit invoice billing fields are blank", () => {
    const billingAddress = formatInvoiceBillingAddressLines(
      {
        billing_address_line1: null,
        billing_address_line2: null,
        billing_city: null,
        billing_state: null,
        billing_zip: null,
      },
      "contractor",
    );
    const serviceLocationLines = formatServiceLocationAddressLines(serviceLocation);

    expect(billingAddress).toEqual([]);
    expect(serviceLocationLines).toEqual(["123 Homeowner Way", "Stockton CA 95212"]);
    expect(
      invoiceServiceLocationMatchesBillingAddress({
        billingRecipient: "contractor",
        billingAddressLines: billingAddress,
        serviceLocationLines,
      }),
    ).toBe(false);
  });

  it("allows contractor-billed same-as-billing only when explicit billing address matches service location", () => {
    const billingAddress = formatInvoiceBillingAddressLines(
      {
        billing_address_line1: "123 Homeowner Way",
        billing_address_line2: null,
        billing_city: "Stockton",
        billing_state: "CA",
        billing_zip: "95212",
      },
      "contractor",
    );
    const serviceLocationLines = formatServiceLocationAddressLines(serviceLocation);

    expect(billingAddress).toEqual(["123 Homeowner Way", "Stockton CA 95212"]);
    expect(serviceLocationLines).toEqual(["123 Homeowner Way", "Stockton CA 95212"]);
    expect(
      invoiceServiceLocationMatchesBillingAddress({
        billingRecipient: "contractor",
        billingAddressLines: billingAddress,
        serviceLocationLines,
      }),
    ).toBe(true);
  });

  it("keeps contractor-billed invoice service location separate from billing recipient identity", () => {
    const serviceLocationLines = formatServiceLocationAddressLines(serviceLocation);

    expect(serviceLocationLines.join(", ")).toBe("123 Homeowner Way, Stockton CA 95212");
    expect(
      invoiceServiceLocationMatchesBillingAddress({
        billingRecipient: "contractor",
        billingAddressLines: ["456 Contractor Blvd", "Sacramento CA 95814"],
        serviceLocationLines,
      }),
    ).toBe(false);
  });

  it("allows homeowner-billed invoices to collapse service location only when the rendered billing address truly matches", () => {
    const billingAddress = formatInvoiceBillingAddressLines(
      {
        billing_address_line1: "123 Homeowner Way",
        billing_address_line2: null,
        billing_city: "Stockton",
        billing_state: "CA",
        billing_zip: "95212",
      },
      "customer",
    );
    const serviceLocationLines = formatServiceLocationAddressLines(serviceLocation);

    expect(billingAddress).toEqual(["123 Homeowner Way", "Stockton CA 95212"]);
    expect(
      invoiceServiceLocationMatchesBillingAddress({
        billingRecipient: "customer",
        billingAddressLines: billingAddress,
        serviceLocationLines,
      }),
    ).toBe(true);
  });

  it("does not fall back from missing billing recipient address to service location", () => {
    const billingAddress = formatInvoiceBillingAddressLines(
      {
        billing_address_line1: null,
        billing_address_line2: null,
        billing_city: null,
        billing_state: null,
        billing_zip: null,
      },
      "customer",
    );

    expect(billingAddress).toEqual([]);
    expect(
      invoiceServiceLocationMatchesBillingAddress({
        billingRecipient: "customer",
        billingAddressLines: billingAddress,
        serviceLocationLines: formatServiceLocationAddressLines(serviceLocation),
      }),
    ).toBe(false);
  });
});
