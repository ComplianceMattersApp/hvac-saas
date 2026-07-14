import { describe, expect, it } from "vitest";

import { buildDraftBillingSnapshot } from "../../business/invoice-billing-snapshot";

const contractorBilling = {
  name: "Service Master",
  billing_name: "Service Master Billing",
  billing_email: "ap@servicemaster.example",
  billing_phone: "555-0100",
  billing_address_line1: "100 Contractor Way",
  billing_address_line2: "Suite 5",
  billing_city: "Sacramento",
  billing_state: "CA",
  billing_zip: "95811",
};

const customerBilling = {
  full_name: "Beck Raintree",
  billing_name: null,
  billing_email: "beck@example.com",
  billing_phone: "555-0200",
  billing_address_line1: "8534 Don Ave",
  billing_city: "Stockton",
  billing_state: "CA",
  billing_zip: "95209",
};

const emptyJobBilling = {
  billing_name: null,
  billing_email: null,
  billing_phone: null,
  billing_address_line1: null,
  billing_address_line2: null,
  billing_city: null,
  billing_state: null,
  billing_zip: null,
};

describe("buildDraftBillingSnapshot", () => {
  it("contractor billing → addressed to the contractor, INCLUDING their address", () => {
    const snap = buildDraftBillingSnapshot({
      billingRecipient: "contractor",
      customerBilling,
      contractorBilling,
      jobBilling: emptyJobBilling,
    });
    expect(snap.billing_name).toBe("Service Master Billing");
    expect(snap.billing_email).toBe("ap@servicemaster.example");
    // The key fix: contractor address is no longer dropped.
    expect(snap.billing_address_line1).toBe("100 Contractor Way");
    expect(snap.billing_city).toBe("Sacramento");
    expect(snap.billing_zip).toBe("95811");
  });

  it("customer billing → addressed to the customer with their address", () => {
    const snap = buildDraftBillingSnapshot({
      billingRecipient: "customer",
      customerBilling,
      contractorBilling,
      jobBilling: emptyJobBilling,
    });
    expect(snap.billing_name).toBe("Beck Raintree");
    expect(snap.billing_address_line1).toBe("8534 Don Ave");
    expect(snap.billing_city).toBe("Stockton");
  });

  it("contractor billing prefers the AP billing_contact_email over billing_email", () => {
    const snap = buildDraftBillingSnapshot({
      billingRecipient: "contractor",
      customerBilling,
      // fixture billing_email is ap@servicemaster.example; the AP contact must win
      contractorBilling: { ...contractorBilling, billing_contact_email: "accounts-payable@sm.example" },
      jobBilling: emptyJobBilling,
    });
    expect(snap.billing_email).toBe("accounts-payable@sm.example");
  });

  it("contractor with no bill-to → falls back to the contractor name, address blank (Phase 2 to complete)", () => {
    const snap = buildDraftBillingSnapshot({
      billingRecipient: "contractor",
      customerBilling,
      contractorBilling: { name: "Service Master" },
      jobBilling: emptyJobBilling,
    });
    expect(snap.billing_name).toBe("Service Master");
    expect(snap.billing_address_line1).toBeNull();
  });
});
