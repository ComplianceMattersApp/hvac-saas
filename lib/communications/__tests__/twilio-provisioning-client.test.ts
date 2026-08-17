import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TRUSTHUB_POLICY_A2P_MESSAGING_PROFILE,
  TwilioProvisioningError,
  createBrandRegistration,
  createCampaign,
  createMessagingService,
  createTwilioSubaccount,
  evaluateCustomerProfile,
  extractEvaluationFailures,
  fetchCampaign,
  isBrandIdentityMismatchError,
  isSoleProprietorEligibilityError,
  purchaseLocalNumber,
  sanitizeProviderMessage,
  searchAvailableLocalNumbers,
} from "@/lib/communications/twilio-provisioning-client";

const AUTH = { accountSid: "AC" + "0".repeat(32), authToken: "secret-token" };

/** Mirrors the mocking style of the qbo-api-client tests. */
function mockFetchSequence(responses: Array<{ status: number; body: unknown }>) {
  const fn = vi.fn();
  for (const response of responses) {
    fn.mockResolvedValueOnce({
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
    });
  }
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

function formOf(call: any): URLSearchParams {
  return new URLSearchParams(String((call[1] as RequestInit).body));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sanitizeProviderMessage", () => {
  it("redacts account SIDs and long hex runs", () => {
    // These strings are rendered to tenant admins in the wizard.
    expect(sanitizeProviderMessage(`Account AC${"a".repeat(32)} is invalid`)).toBe(
      "Account [redacted] is invalid",
    );
    expect(sanitizeProviderMessage(`token ${"f".repeat(40)}`)).toBe("token [redacted]");
  });

  it("keeps the useful part of a real Twilio message", () => {
    expect(sanitizeProviderMessage("EIN does not match business name")).toBe(
      "EIN does not match business name",
    );
  });

  it("truncates and copes with a non-string", () => {
    expect(sanitizeProviderMessage("x".repeat(500))).toHaveLength(300);
    expect(sanitizeProviderMessage(null)).toBe("Twilio API error");
  });
});

describe("createTwilioSubaccount", () => {
  it("creates the subaccount and returns its credentials", async () => {
    const fetchMock = mockFetchSequence([
      { status: 201, body: { sid: "AC" + "1".repeat(32), auth_token: "sub-token", friendly_name: "Acme" } },
    ]);

    const result = await createTwilioSubaccount({ auth: AUTH, friendlyName: "Acme HVAC" });

    expect(result).toMatchObject({ sid: "AC" + "1".repeat(32), authToken: "sub-token" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/Accounts.json");
    expect(formOf(fetchMock.mock.calls[0]).get("FriendlyName")).toBe("Acme HVAC");
  });

  it("fails loudly when Twilio returns no token", async () => {
    // Without the token we could never validate this tenant's webhooks, so a
    // half-created subaccount must not be recorded as success.
    mockFetchSequence([{ status: 201, body: { sid: "AC" + "1".repeat(32) } }]);
    await expect(
      createTwilioSubaccount({ auth: AUTH, friendlyName: "Acme" }),
    ).rejects.toMatchObject({ step: "subaccount" });
  });

  it("never leaks credentials in a failure message", async () => {
    mockFetchSequence([
      { status: 400, body: { code: 20003, message: `Auth failed for AC${"b".repeat(32)}` } },
    ]);
    await expect(createTwilioSubaccount({ auth: AUTH, friendlyName: "Acme" })).rejects.toMatchObject({
      message: "Auth failed for [redacted]",
      code: 20003,
    });
  });

  it("reports a network failure without echoing the URL", async () => {
    // The URL embeds the account SID.
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNRESET")) as unknown as typeof fetch;
    await expect(
      createTwilioSubaccount({ auth: AUTH, friendlyName: "Acme" }),
    ).rejects.toMatchObject({ message: "Could not reach Twilio. Check the connection and try again." });
  });
});

describe("phone numbers", () => {
  it("prefers the tenant's area code when it is a valid one", async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { available_phone_numbers: [{ phone_number: "+12095550100", locality: "Stockton", region: "CA" }] } },
    ]);

    const numbers = await searchAvailableLocalNumbers({ auth: AUTH, areaCode: "209" });

    expect(numbers).toEqual([{ phoneNumber: "+12095550100", locality: "Stockton", region: "CA" }]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("AreaCode=209");
  });

  it("omits a malformed area code rather than failing the search", async () => {
    const fetchMock = mockFetchSequence([{ status: 200, body: { available_phone_numbers: [] } }]);
    await searchAvailableLocalNumbers({ auth: AUTH, areaCode: "not-an-area-code" });
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("AreaCode");
  });

  it("purchases a number and returns its reference", async () => {
    const fetchMock = mockFetchSequence([
      { status: 201, body: { sid: "PN" + "2".repeat(32), phone_number: "+12095550100" } },
    ]);
    const result = await purchaseLocalNumber({ auth: AUTH, phoneNumber: "+12095550100" });
    expect(result).toEqual({ sid: "PN" + "2".repeat(32), phoneNumber: "+12095550100" });
    expect(formOf(fetchMock.mock.calls[0]).get("PhoneNumber")).toBe("+12095550100");
  });
});

describe("createMessagingService", () => {
  it("attaches our webhooks and leaves advanced opt-out alone", async () => {
    const fetchMock = mockFetchSequence([{ status: 201, body: { sid: "MG" + "3".repeat(32) } }]);

    await createMessagingService({
      auth: AUTH,
      friendlyName: "Acme HVAC",
      inboundRequestUrl: "https://app.example.com/api/sms/twilio/inbound",
      statusCallbackUrl: "https://app.example.com/api/sms/twilio/status-callback",
    });

    const form = formOf(fetchMock.mock.calls[0]);
    expect(form.get("InboundRequestUrl")).toBe("https://app.example.com/api/sms/twilio/inbound");
    expect(form.get("StatusCallback")).toBe("https://app.example.com/api/sms/twilio/status-callback");
    // Inbound routing lives on the service so it survives a number swap.
    expect(form.get("UseInboundWebhookOnNumber")).toBe("false");
    // Advanced Opt-Out handles STOP/HELP at the carrier layer — never disabled.
    expect(form.has("MessagingServiceStickySender")).toBe(false);
  });
});

describe("brand registration", () => {
  it("uses the Low-Volume Standard path by default", async () => {
    const fetchMock = mockFetchSequence([
      { status: 201, body: { sid: "BN" + "4".repeat(32), status: "PENDING" } },
    ]);

    await createBrandRegistration({
      auth: AUTH,
      customerProfileBundleSid: "BU" + "5".repeat(32),
      a2pProfileBundleSid: "BU" + "6".repeat(32),
      soleProprietor: false,
      mock: false,
    });

    const form = formOf(fetchMock.mock.calls[0]);
    // $4.50 instead of $46, ample throughput for on-the-way volumes.
    expect(form.get("SkipAutomaticSecVet")).toBe("true");
    expect(form.has("BrandType")).toBe(false);
    expect(form.has("Mock")).toBe(false);
  });

  it("uses the sole-proprietor brand type when there is no EIN", async () => {
    const fetchMock = mockFetchSequence([
      { status: 201, body: { sid: "BN" + "4".repeat(32), status: "PENDING" } },
    ]);

    await createBrandRegistration({
      auth: AUTH,
      customerProfileBundleSid: "BU" + "5".repeat(32),
      a2pProfileBundleSid: "BU" + "6".repeat(32),
      soleProprietor: true,
      mock: false,
    });

    const form = formOf(fetchMock.mock.calls[0]);
    expect(form.get("BrandType")).toBe("SOLE_PROPRIETOR");
    expect(form.has("SkipAutomaticSecVet")).toBe(false);
  });

  it("sends Mock=true in sandbox so the state machine costs nothing", async () => {
    const fetchMock = mockFetchSequence([
      { status: 201, body: { sid: "BN" + "4".repeat(32), status: "PENDING" } },
    ]);
    await createBrandRegistration({
      auth: AUTH,
      customerProfileBundleSid: "BU1",
      a2pProfileBundleSid: "BU2",
      soleProprietor: false,
      mock: true,
    });
    expect(formOf(fetchMock.mock.calls[0]).get("Mock")).toBe("true");
  });

  it("surfaces a rejected brand's reason, sanitized", async () => {
    mockFetchSequence([
      { status: 200, body: { sid: "BN1", status: "FAILED", identity_status: "FAILED", failure_reason: `EIN mismatch on AC${"c".repeat(32)}` } },
    ]);
    const { fetchBrandRegistration } = await import("@/lib/communications/twilio-provisioning-client");
    await expect(
      fetchBrandRegistration({ auth: AUTH, brandRegistrationSid: "BN1" }),
    ).resolves.toMatchObject({ status: "FAILED", failureReason: "EIN mismatch on [redacted]" });
  });
});

describe("campaign registration", () => {
  it("sends the low-volume use case with opt-out keywords and legal URLs", async () => {
    const fetchMock = mockFetchSequence([
      { status: 201, body: { sid: "QE" + "7".repeat(32), campaign_status: "PENDING" } },
    ]);

    await createCampaign({
      auth: AUTH,
      messagingServiceSid: "MG1",
      brandRegistrationSid: "BN1",
      description: "Appointment notifications",
      messageFlow: "Customers provide their number when booking service.",
      messageSamples: ["Your tech is on the way.", "Reply STOP to opt out."],
      optInMessage: "You are subscribed.",
      optOutMessage: "You are unsubscribed.",
      helpMessage: "Contact support.",
      privacyPolicyUrl: "https://app.example.com/privacy",
      termsAndConditionsUrl: "https://app.example.com/terms",
    });

    const form = formOf(fetchMock.mock.calls[0]);
    expect(form.get("UsAppToPersonUsecase")).toBe("LOW_VOLUME");
    expect(form.getAll("MessageSamples")).toHaveLength(2);
    expect(form.getAll("OptOutKeywords")).toContain("STOP");
    // Registration data must match the public disclosures.
    expect(form.get("PrivacyPolicyUrl")).toBe("https://app.example.com/privacy");
    expect(form.get("TermsAndConditionsUrl")).toBe("https://app.example.com/terms");
  });

  it("reads campaign status for the poller", async () => {
    mockFetchSequence([{ status: 200, body: { sid: "QE1", campaign_status: "VERIFIED" } }]);
    await expect(fetchCampaign({ auth: AUTH, messagingServiceSid: "MG1" })).resolves.toMatchObject({
      status: "VERIFIED",
    });
  });
});

describe("TrustHub evaluations", () => {
  it("maps per-field failures back onto the form", async () => {
    // An evaluation is free; a rejected brand is a non-refundable TCR fee. This
    // is what lets the wizard fail before spending anything.
    mockFetchSequence([
      {
        status: 200,
        body: {
          sid: "EV1",
          status: "noncompliant",
          results: [
            {
              requirement_name: "business_information",
              // Twilio lists ONLY the failing fields here; passing ones are absent.
              invalid: [{ object_field: "business_name", failure_reason: "Required" }],
            },
            { requirement_name: "authorized_representative_1", invalid: [] },
          ],
        },
      },
    ]);

    const result = await evaluateCustomerProfile({
      auth: AUTH,
      customerProfileSid: "BU1",
      policySid: TRUSTHUB_POLICY_A2P_MESSAGING_PROFILE,
    });

    expect(result.status).toBe("noncompliant");
    expect(result.failures).toEqual([{ field: "business_name", reason: "Required" }]);
  });

  it("records a failed requirement that names no invalid field", () => {
    expect(
      extractEvaluationFailures({ results: [{ passed: false, requirement_name: "address", invalid: [] }] }),
    ).toEqual([{ field: "address", reason: "This requirement was not met." }]);
  });

  it("treats an empty invalid[] as a pass", () => {
    expect(extractEvaluationFailures({ results: [{ requirement_name: "address", invalid: [] }] })).toEqual([]);
  });

  it("reads every invalid field, not just the first", () => {
    expect(
      extractEvaluationFailures({
        results: [
          {
            requirement_name: "business_information",
            invalid: [
              { object_field: "business_name", failure_reason: "Required" },
              { object_field: "business_regions_of_operation", failure_reason: "Invalid" },
            ],
          },
        ],
      }),
    ).toEqual([
      { field: "business_name", reason: "Required" },
      { field: "business_regions_of_operation", reason: "Invalid" },
    ]);
  });

  it("returns nothing rather than throwing on an unrecognized shape", () => {
    // Twilio's evaluation payload varies by policy; losing the whole evaluation
    // to a parse error would be worse than reporting no field-level detail.
    expect(extractEvaluationFailures(null)).toEqual([]);
    expect(extractEvaluationFailures({ results: "not-an-array" })).toEqual([]);
    expect(extractEvaluationFailures({ results: [{ passed: true }] })).toEqual([]);
    expect(extractEvaluationFailures({ results: [{ invalid: "not-an-array" }] })).toEqual([]);
  });
});

describe("named Twilio failures", () => {
  it("recognizes the sole-proprietor eligibility rejection", () => {
    // 30915 means a registered LLC tried the sole-prop path; the fix is to
    // restart on the EIN path, which the generic text does not say.
    const error = new TwilioProvisioningError({ step: "brand", code: 30915, message: "not eligible" });
    expect(isSoleProprietorEligibilityError(error)).toBe(true);
    expect(isBrandIdentityMismatchError(error)).toBe(false);
  });

  it("recognizes the EIN / legal-name mismatch rejection", () => {
    const error = new TwilioProvisioningError({ step: "brand", code: "30795", message: "mismatch" });
    expect(isBrandIdentityMismatchError(error)).toBe(true);
  });

  it("carries a storable, already-sanitized error shape", () => {
    const error = new TwilioProvisioningError({
      step: "campaign",
      code: 21212,
      httpStatus: 400,
      message: "bad",
      fieldFailures: [{ field: "message_flow", reason: "too vague" }],
    });
    expect(error.toStoredError()).toEqual({
      step: "campaign",
      code: 21212,
      httpStatus: 400,
      message: "bad",
      fieldFailures: [{ field: "message_flow", reason: "too vague" }],
    });
  });
});

describe("TrustHub policy selection", () => {
  it("uses a different A2P messaging-profile policy for sole proprietors", async () => {
    const {
      a2pMessagingProfilePolicySid,
      customerProfilePolicySid,
      TRUSTHUB_POLICY_A2P_MESSAGING_PROFILE_SOLE_PROP,
      TRUSTHUB_POLICY_STARTER_CUSTOMER_PROFILE,
      TRUSTHUB_POLICY_SECONDARY_CUSTOMER_PROFILE,
    } = await import("@/lib/communications/twilio-provisioning-client");

    // A sole proprietor cannot satisfy the standard profile's requirements, so
    // evaluating against it fails on things they structurally cannot provide.
    expect(a2pMessagingProfilePolicySid(true)).toBe("RN670d5d2e282a6130ae063b234b6019c8");
    expect(a2pMessagingProfilePolicySid(true)).toBe(TRUSTHUB_POLICY_A2P_MESSAGING_PROFILE_SOLE_PROP);
    expect(a2pMessagingProfilePolicySid(false)).toBe(TRUSTHUB_POLICY_A2P_MESSAGING_PROFILE);
    expect(a2pMessagingProfilePolicySid(true)).not.toBe(a2pMessagingProfilePolicySid(false));

    expect(customerProfilePolicySid(true)).toBe(TRUSTHUB_POLICY_STARTER_CUSTOMER_PROFILE);
    expect(customerProfilePolicySid(false)).toBe(TRUSTHUB_POLICY_SECONDARY_CUSTOMER_PROFILE);
  });
});
