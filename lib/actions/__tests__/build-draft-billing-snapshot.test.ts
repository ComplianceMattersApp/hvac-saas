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
  billing_country: "US",
  qbo_customer_name: "Service Master, Inc.",
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

// A job-level billing override with its OWN address. The snapshot must never
// address the invoice to this (or to a service location) — the address always
// comes from the bill-to recipient's own record.
const jobBillingWithOverrideAddress = {
  billing_name: "Job Override Name",
  billing_email: "override@job.example",
  billing_phone: "555-9999",
  billing_address_line1: "999 Service Location Rd",
  billing_address_line2: null,
  billing_city: "Overrideville",
  billing_state: "NV",
  billing_zip: "89000",
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
    // Phase 4: country + QBO identity are frozen onto the snapshot too.
    expect(snap.billing_country).toBe("US");
    expect(snap.qbo_customer_name).toBe("Service Master, Inc.");
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

  it("customer billing → uses the customer's OWN address, never the job/service-location override", () => {
    const snap = buildDraftBillingSnapshot({
      billingRecipient: "customer",
      customerBilling,
      contractorBilling,
      // A job-level override with a different address is present, but must be ignored.
      jobBilling: jobBillingWithOverrideAddress,
    });
    expect(snap.billing_address_line1).toBe("8534 Don Ave");
    expect(snap.billing_city).toBe("Stockton");
    // The service-location / job override address must never leak into billing.
    expect(snap.billing_address_line1).not.toBe("999 Service Location Rd");
    expect(snap.billing_city).not.toBe("Overrideville");
  });

  it("customer billing with no address → billing address is null, not the job override (no fallback)", () => {
    const snap = buildDraftBillingSnapshot({
      billingRecipient: "customer",
      customerBilling: { full_name: "Beck Raintree", billing_email: "beck@example.com" },
      contractorBilling,
      jobBilling: jobBillingWithOverrideAddress,
    });
    expect(snap.billing_name).toBe("Beck Raintree");
    // Even though the job override carries an address, the snapshot refuses to
    // fall back to it — the invoice is addressed to the recipient or nobody.
    expect(snap.billing_address_line1).toBeNull();
    expect(snap.billing_city).toBeNull();
  });
});
