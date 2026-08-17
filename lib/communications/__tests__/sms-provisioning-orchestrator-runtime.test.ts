import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Runtime invariants of runNextProvisioningStep: a retry after any mid-step
 * failure must create ZERO new Twilio resources — it adopts what exists and
 * finishes what did not. Every client call is mocked; what these tests assert
 * is which calls happen, which is exactly the money question.
 */

vi.mock("@/lib/communications/twilio-provisioning-client", async (importOriginal) => {
  const original = await importOriginal<any>();
  return {
    ...original,
    createTwilioSubaccount: vi.fn(),
    listOwnedIncomingNumbers: vi.fn(),
    searchAvailableLocalNumbers: vi.fn(),
    purchaseLocalNumber: vi.fn(),
    createMessagingService: vi.fn(),
    attachNumberToMessagingService: vi.fn(),
    createBrandRegistration: vi.fn(),
    resubmitBrandRegistration: vi.fn(),
    createCampaign: vi.fn(),
  };
});

vi.mock("@/lib/communications/sms-account-resolution", () => ({
  resolveSubaccountCredential: vi.fn(async () => ({
    accountSid: "AC" + "8".repeat(32),
    authToken: "subaccount-token",
    isSubaccount: true,
  })),
}));

import {
  attachNumberToMessagingService,
  createBrandRegistration,
  createCampaign,
  createMessagingService,
  listOwnedIncomingNumbers,
  purchaseLocalNumber,
  resubmitBrandRegistration,
  searchAvailableLocalNumbers,
} from "@/lib/communications/twilio-provisioning-client";
import { runNextProvisioningStep } from "@/lib/communications/sms-provisioning-orchestrator";

function makeAdmin() {
  const patches: any[] = [];
  return {
    patches,
    from(table: string) {
      const builder: any = {
        update(values: any) {
          patches.push({ table, values });
          return builder;
        },
        upsert(values: any) {
          patches.push({ table, values, upsert: true });
          return builder;
        },
        eq: () => builder,
        then(onF: any, onR: any) {
          return Promise.resolve({ data: null, error: null }).then(onF, onR);
        },
      };
      return builder;
    },
  };
}

const base = {
  id: "reg-1",
  account_owner_user_id: "owner-1",
  registration_path: "a2p_lvs",
  provider_environment: "sandbox",
  legal_business_name: "Acme HVAC LLC",
  subaccount_sid: "AC" + "8".repeat(32),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("retry spends nothing twice", () => {
  it("ADOPTS an already-owned number instead of purchasing again", async () => {
    // The prior attempt bought a number but the bookkeeping write failed. The
    // subaccount is exclusively this tenant's, so anything in it is theirs.
    (listOwnedIncomingNumbers as any).mockResolvedValue([
      { sid: "PN-owned", phoneNumber: "+12095550100" },
    ]);

    const admin = makeAdmin();
    const result = await runNextProvisioningStep({
      admin,
      registration: { ...base, phone_number_sid: null },
    });

    expect(result).toMatchObject({ step: "number", outcome: "advanced" });
    expect(purchaseLocalNumber).not.toHaveBeenCalled();
    expect(searchAvailableLocalNumbers).not.toHaveBeenCalled();
    expect(admin.patches.at(-1)?.values).toMatchObject({
      phone_number_sid: "PN-owned",
      number_status: "complete",
    });
  });

  it("re-attaches to the RECORDED messaging service instead of creating a second", async () => {
    (attachNumberToMessagingService as any).mockResolvedValue(undefined);

    const admin = makeAdmin();
    const result = await runNextProvisioningStep({
      admin,
      registration: {
        ...base,
        phone_number_sid: "PN1",
        messaging_service_sid: "MG-recorded",
        messaging_service_status: "failed",
      },
    });

    expect(result).toMatchObject({ step: "messaging_service", outcome: "advanced" });
    expect(createMessagingService).not.toHaveBeenCalled();
    expect(attachNumberToMessagingService).toHaveBeenCalledWith(
      expect.objectContaining({ messagingServiceSid: "MG-recorded", phoneNumberSid: "PN1" }),
    );
  });

  it("RESUBMITS a failed brand rather than paying for a second one", async () => {
    (resubmitBrandRegistration as any).mockResolvedValue({
      sid: "BN1",
      status: "PENDING",
      identityStatus: "UNVERIFIED",
      failureReason: null,
    });

    const admin = makeAdmin();
    const result = await runNextProvisioningStep({
      admin,
      registration: {
        ...base,
        phone_number_sid: "PN1",
        messaging_service_sid: "MG1",
        messaging_service_status: "complete",
        customer_profile_sid: "BU1",
        customer_profile_status: "twilio-approved",
        trust_product_sid: "BU2",
        trust_product_status: "twilio-approved",
        brand_registration_sid: "BN1",
        brand_status: "FAILED",
      },
    });

    expect(result).toMatchObject({ step: "brand", outcome: "advanced" });
    expect(resubmitBrandRegistration).toHaveBeenCalledTimes(1);
    expect(createBrandRegistration).not.toHaveBeenCalled();
  });
});

describe("review gates hold spend steps", () => {
  it("waits at the brand step while bundles are in review — zero Twilio calls", async () => {
    const admin = makeAdmin();
    const result = await runNextProvisioningStep({
      admin,
      registration: {
        ...base,
        phone_number_sid: "PN1",
        messaging_service_sid: "MG1",
        messaging_service_status: "complete",
        customer_profile_sid: "BU1",
        customer_profile_status: "pending_review",
        trust_product_sid: "BU2",
        trust_product_status: "pending_review",
      },
    });

    expect(result.step).toBe("brand");
    expect(result.outcome).toBe("waiting");
    expect(createBrandRegistration).not.toHaveBeenCalled();
    expect(admin.patches).toEqual([]);
  });

  it("waits at the campaign step until the brand is APPROVED", async () => {
    const admin = makeAdmin();
    const result = await runNextProvisioningStep({
      admin,
      registration: {
        ...base,
        phone_number_sid: "PN1",
        messaging_service_sid: "MG1",
        messaging_service_status: "complete",
        customer_profile_sid: "BU1",
        customer_profile_status: "twilio-approved",
        trust_product_sid: "BU2",
        trust_product_status: "twilio-approved",
        brand_registration_sid: "BN1",
        brand_status: "PENDING",
      },
    });

    expect(result.step).toBe("campaign");
    expect(result.outcome).toBe("waiting");
    expect(createCampaign).not.toHaveBeenCalled();
    expect(admin.patches).toEqual([]);
  });
});
