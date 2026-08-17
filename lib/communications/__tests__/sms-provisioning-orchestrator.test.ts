import { describe, expect, it } from "vitest";

import {
  brandStepPrerequisitesMet,
  buildAuthorizedRepresentativeAttributes,
  buildBusinessInformationAttributes,
  buildCampaignCopy,
  campaignStepPrerequisitesMet,
  describeProvisioningStep,
  isSoleProprietorPath,
  nextProvisioningStep,
  preferredAreaCode,
} from "@/lib/communications/sms-provisioning-orchestrator";

const base = {
  id: "reg-1",
  account_owner_user_id: "owner-1",
  registration_path: "a2p_lvs",
  legal_business_name: "Acme HVAC LLC",
};

describe("nextProvisioningStep", () => {
  it("walks the steps in spend order", () => {
    // Each ref present means that step's money was already spent, so the
    // sequence must never re-run an earlier step.
    expect(nextProvisioningStep({ ...base })).toBe("subaccount");
    expect(nextProvisioningStep({ ...base, subaccount_sid: "AC1" })).toBe("number");
    expect(nextProvisioningStep({ ...base, subaccount_sid: "AC1", phone_number_sid: "PN1" })).toBe(
      "messaging_service",
    );
    expect(
      nextProvisioningStep({ ...base, subaccount_sid: "AC1", phone_number_sid: "PN1", messaging_service_sid: "MG1" }),
    ).toBe("customer_profile");
    expect(
      nextProvisioningStep({
        ...base, subaccount_sid: "AC1", phone_number_sid: "PN1", messaging_service_sid: "MG1",
        customer_profile_sid: "BU1",
      }),
    ).toBe("trust_product");
    expect(
      nextProvisioningStep({
        ...base, subaccount_sid: "AC1", phone_number_sid: "PN1", messaging_service_sid: "MG1",
        customer_profile_sid: "BU1", trust_product_sid: "BU2",
      }),
    ).toBe("brand");
    expect(
      nextProvisioningStep({
        ...base, subaccount_sid: "AC1", phone_number_sid: "PN1", messaging_service_sid: "MG1",
        customer_profile_sid: "BU1", trust_product_sid: "BU2", brand_registration_sid: "BN1",
      }),
    ).toBe("campaign");
    expect(
      nextProvisioningStep({
        ...base, subaccount_sid: "AC1", phone_number_sid: "PN1", messaging_service_sid: "MG1",
        customer_profile_sid: "BU1", trust_product_sid: "BU2", brand_registration_sid: "BN1",
        campaign_sid: "QE1",
      }),
    ).toBe("done");
  });

  it("resumes mid-flight rather than restarting", () => {
    // The whole point of the resumable design: a failure at the brand step must
    // not re-buy a number.
    const afterFailure = {
      ...base, subaccount_sid: "AC1", phone_number_sid: "PN1", messaging_service_sid: "MG1",
      customer_profile_sid: "BU1", trust_product_sid: "BU2", brand_status: "failed",
    };
    expect(nextProvisioningStep(afterFailure)).toBe("brand");
  });

  it("re-runs a step whose status is failed even when its ref exists", () => {
    // A ref proves the Twilio resource exists, NOT that the step finished.
    // Presence-only skipping is how a rejected bundle got submitted to a brand
    // without ever being fixed.
    const midFailure = {
      ...base, subaccount_sid: "AC1", phone_number_sid: "PN1",
      messaging_service_sid: "MG1", messaging_service_status: "failed",
    };
    expect(nextProvisioningStep(midFailure)).toBe("messaging_service");

    const profileFailure = {
      ...base, subaccount_sid: "AC1", phone_number_sid: "PN1", messaging_service_sid: "MG1",
      messaging_service_status: "complete",
      customer_profile_sid: "BU1", customer_profile_status: "failed",
    };
    expect(nextProvisioningStep(profileFailure)).toBe("customer_profile");
  });
});

describe("review gates", () => {
  const readyForBrand = {
    subaccount_sid: "AC1", phone_number_sid: "PN1", messaging_service_sid: "MG1",
    customer_profile_sid: "BU1", trust_product_sid: "BU2",
  };

  it("holds the brand step until BOTH bundles are twilio_approved", () => {
    // A brand created against in-review bundles is a guaranteed rejection that
    // reads like an error to the operator.
    expect(brandStepPrerequisitesMet({ ...readyForBrand, customer_profile_status: "pending_review", trust_product_status: "twilio_approved" })).toBe(false);
    expect(brandStepPrerequisitesMet({ ...readyForBrand, customer_profile_status: "twilio_approved", trust_product_status: "in_progress" })).toBe(false);
    expect(brandStepPrerequisitesMet({ ...readyForBrand, customer_profile_status: "twilio_approved", trust_product_status: "twilio_approved" })).toBe(true);
  });

  it("holds the campaign step until the brand is APPROVED", () => {
    expect(campaignStepPrerequisitesMet({ brand_status: "PENDING" })).toBe(false);
    expect(campaignStepPrerequisitesMet({ brand_status: "IN_REVIEW" })).toBe(false);
    expect(campaignStepPrerequisitesMet({ brand_status: "APPROVED" })).toBe(true);
  });
});

describe("registration path", () => {
  it("recognizes the sole-proprietor path", () => {
    expect(isSoleProprietorPath({ registration_path: "a2p_sole_prop" })).toBe(true);
    expect(isSoleProprietorPath({ registration_path: "a2p_lvs" })).toBe(false);
    expect(isSoleProprietorPath({})).toBe(false);
  });
});

describe("preferredAreaCode", () => {
  it("takes the area code from the representative's phone", () => {
    expect(preferredAreaCode({ rep_phone: "+1 (209) 555-0100" })).toBe("209");
    expect(preferredAreaCode({ rep_phone: "2095550100" })).toBe("209");
  });

  it("returns null when there is nothing usable", () => {
    // Null means "search without a preference" rather than a bogus filter.
    expect(preferredAreaCode({ rep_phone: "" })).toBeNull();
    expect(preferredAreaCode({ rep_phone: "12345" })).toBeNull();
    expect(preferredAreaCode({})).toBeNull();
  });
});

describe("TrustHub attributes", () => {
  it("declares the EIN as the business registration identifier", () => {
    const attributes = buildBusinessInformationAttributes({
      ...base,
      ein: "12-3456789",
      business_type: "Limited Liability Company",
      business_industry: "CONSTRUCTION",
      website_url: "https://acme.example",
    });
    expect(attributes).toMatchObject({
      business_name: "Acme HVAC LLC",
      business_registration_identifier: "EIN",
      business_registration_number: "12-3456789",
      business_regions_of_operation: "USA_AND_CANADA",
    });
  });

  it("carries a contactable human for the authorized representative", () => {
    expect(
      buildAuthorizedRepresentativeAttributes({
        rep_first_name: "Ada", rep_last_name: "Byron",
        rep_email: "ada@acme.example", rep_phone: "+12095550100", rep_title: "Owner",
      }),
    ).toMatchObject({ first_name: "Ada", last_name: "Byron", email: "ada@acme.example", job_position: "Owner" });
  });
});

describe("campaign copy", () => {
  const copy = buildCampaignCopy(base);

  it("states consent in plain words — the most-rejected field", () => {
    expect(copy.messageFlow).toMatch(/provide their mobile number when they book/i);
    expect(copy.messageFlow).toMatch(/No numbers are purchased, rented, or shared/i);
    expect(copy.messageFlow).toMatch(/STOP/);
  });

  it("uses real on-the-way samples carrying STOP language", () => {
    expect(copy.messageSamples.length).toBeGreaterThanOrEqual(2);
    for (const sample of copy.messageSamples) {
      expect(sample).toContain("Acme HVAC LLC");
      expect(sample).toMatch(/STOP/);
    }
  });

  it("points at the public disclosures registration data must match", () => {
    expect(copy.privacyPolicyUrl).toMatch(/\/privacy$/);
    expect(copy.termsAndConditionsUrl).toMatch(/\/terms$/);
  });

  it("names the business in every customer-facing keyword reply", () => {
    for (const message of [copy.optInMessage, copy.optOutMessage, copy.helpMessage]) {
      expect(message).toContain("Acme HVAC LLC");
    }
    expect(copy.optOutMessage).toMatch(/unsubscribed/i);
  });
});

describe("step descriptions", () => {
  it("are plain language, and set expectations on carrier review", () => {
    expect(describeProvisioningStep("number")).toMatch(/local phone number/i);
    expect(describeProvisioningStep("campaign")).toMatch(/two weeks/i);
    expect(describeProvisioningStep("done")).toMatch(/complete/i);
  });
});
