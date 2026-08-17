/**
 * Twilio provisioning REST client — server-only.
 *
 * Covers the calls the A2P 10DLC self-serve wizard needs, in tenant-flow order:
 * subaccount → number → Messaging Service → TrustHub customer profile → A2P
 * messaging profile → brand → campaign, plus the status reads the poller uses.
 *
 * Never import from browser/client code. Same error-sanitization discipline as
 * twilio-messages-client.ts: Account SIDs, auth tokens, and raw provider refs
 * never reach an error message or a log line, because these errors are rendered
 * to tenant admins in the wizard.
 */

const API_BASE = "https://api.twilio.com/2010-04-01";
const MESSAGING_BASE = "https://messaging.twilio.com/v1";
const TRUSTHUB_BASE = "https://trusthub.twilio.com/v1";

/**
 * TrustHub policy SIDs. These are Twilio-published constants, not secrets, and
 * they identify which regulatory bundle a profile is being evaluated against.
 */
export const TRUSTHUB_POLICY_SECONDARY_CUSTOMER_PROFILE = "RNdfbf3fae0e1107f8aded0e7cead80bf5";
export const TRUSTHUB_POLICY_STARTER_CUSTOMER_PROFILE = "RN806dd6cd175f314e1f96a9727ee271f4";
export const TRUSTHUB_POLICY_A2P_MESSAGING_PROFILE = "RNb0d4771c2c98518d916a3d4cd70a8f8b";
/**
 * Sole proprietors evaluate their A2P messaging profile against a DIFFERENT
 * policy than standard brands. Using the standard one here fails evaluation
 * with requirements a sole proprietor structurally cannot satisfy.
 */
export const TRUSTHUB_POLICY_A2P_MESSAGING_PROFILE_SOLE_PROP = "RN670d5d2e282a6130ae063b234b6019c8";

/** The A2P messaging-profile policy for a registration path. */
export function a2pMessagingProfilePolicySid(soleProprietor: boolean): string {
  return soleProprietor
    ? TRUSTHUB_POLICY_A2P_MESSAGING_PROFILE_SOLE_PROP
    : TRUSTHUB_POLICY_A2P_MESSAGING_PROFILE;
}

/** The customer-profile policy for a registration path. */
export function customerProfilePolicySid(soleProprietor: boolean): string {
  return soleProprietor
    ? TRUSTHUB_POLICY_STARTER_CUSTOMER_PROFILE
    : TRUSTHUB_POLICY_SECONDARY_CUSTOMER_PROFILE;
}

export type TwilioAuth = {
  /** The account the call is made AS. The subaccount once one exists. */
  accountSid: string;
  authToken: string;
};

export class TwilioProvisioningError extends Error {
  readonly code: number | string | null;
  readonly httpStatus: number | null;
  /** Which wizard step failed, so the UI can render it as a first-class state. */
  readonly step: string;
  /** Per-field failures from a TrustHub evaluation, mapped back onto the form. */
  readonly fieldFailures: TwilioFieldFailure[];

  constructor(params: {
    step: string;
    code?: number | string | null;
    httpStatus?: number | null;
    message: string;
    fieldFailures?: TwilioFieldFailure[];
  }) {
    super(params.message);
    this.name = "TwilioProvisioningError";
    this.step = params.step;
    this.code = params.code ?? null;
    this.httpStatus = params.httpStatus ?? null;
    this.fieldFailures = params.fieldFailures ?? [];
  }

  /** Shape stored in `sms_provisioning_registrations.last_error`. Already sanitized. */
  toStoredError() {
    return {
      step: this.step,
      code: this.code,
      httpStatus: this.httpStatus,
      message: this.message,
      fieldFailures: this.fieldFailures,
    };
  }
}

export type TwilioFieldFailure = {
  /** Twilio's field path, e.g. "business_information.business_name". */
  field: string;
  reason: string;
};

/**
 * Strip anything credential-shaped out of a provider message.
 *
 * These strings are rendered to tenant admins. Account SIDs (AC…), API keys
 * (SK…), and any long hex run could leak an identifier that is not theirs.
 */
export function sanitizeProviderMessage(raw: unknown): string {
  const text = typeof raw === "string" ? raw : "";
  if (!text) return "Twilio API error";
  return text
    .replace(/\b(AC|SK|MG|BN|PN|AD|RN|CP|BU|IT|QE)[a-f0-9]{32}\b/gi, "[redacted]")
    .replace(/\b[a-f0-9]{32,}\b/gi, "[redacted]")
    .slice(0, 300);
}

function basicAuth(auth: TwilioAuth): string {
  return Buffer.from(`${auth.accountSid}:${auth.authToken}`).toString("base64");
}

/** Platform credentials — the parent account that creates subaccounts. */
export function getPlatformTwilioAuth(): TwilioAuth {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    throw new TwilioProvisioningError({
      step: "credentials",
      message: "Twilio credentials are not configured for this environment.",
    });
  }
  return { accountSid, authToken };
}

type RequestOptions = {
  step: string;
  auth: TwilioAuth;
  method: "GET" | "POST";
  url: string;
  form?: Record<string, string | string[] | undefined | null>;
};

/**
 * One request. Twilio takes form-encoded bodies and repeats a key for arrays.
 */
async function twilioRequest(options: RequestOptions): Promise<any> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(options.form ?? {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const entry of value) body.append(key, entry);
    } else {
      body.append(key, value);
    }
  }

  let response: Response;
  try {
    response = await fetch(options.url, {
      method: options.method,
      headers: {
        Authorization: `Basic ${basicAuth(options.auth)}`,
        ...(options.method === "POST"
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
      },
      body: options.method === "POST" ? body.toString() : undefined,
      // Hard deadline WELL inside the spend-step reservation's 2-minute
      // takeover window: a hung purchase that outlived the reservation would
      // let a second caller buy again while the first eventually also lands.
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    // Deliberately not echoing the URL: it embeds the account SID.
    throw new TwilioProvisioningError({
      step: options.step,
      message: "Could not reach Twilio. Check the connection and try again.",
    });
  }

  let json: any = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new TwilioProvisioningError({
      step: options.step,
      code: json?.code ?? null,
      httpStatus: response.status,
      message: sanitizeProviderMessage(json?.message) || `Twilio request failed (${response.status})`,
    });
  }

  return json;
}

// ---------------------------------------------------------------------------
// 1. Subaccount
// ---------------------------------------------------------------------------

export type TwilioSubaccount = { sid: string; authToken: string; friendlyName: string };

/**
 * Create the tenant's own Twilio subaccount.
 *
 * One subaccount per tenant is Twilio's ISV pattern and is not reversible
 * later: a registered A2P brand cannot be moved between accounts, so starting a
 * tenant under the parent account would lock in the wrong architecture
 * permanently.
 */
export async function createTwilioSubaccount(params: {
  auth?: TwilioAuth;
  friendlyName: string;
}): Promise<TwilioSubaccount> {
  const auth = params.auth ?? getPlatformTwilioAuth();
  const json = await twilioRequest({
    step: "subaccount",
    auth,
    method: "POST",
    url: `${API_BASE}/Accounts.json`,
    form: { FriendlyName: params.friendlyName.slice(0, 64) },
  });
  const sid = String(json?.sid ?? "").trim();
  const authToken = String(json?.auth_token ?? "").trim();
  if (!sid || !authToken) {
    throw new TwilioProvisioningError({
      step: "subaccount",
      message: "Twilio created the subaccount but returned no usable credentials.",
    });
  }
  return { sid, authToken, friendlyName: String(json?.friendly_name ?? "") };
}

// ---------------------------------------------------------------------------
// 2. Phone number
// ---------------------------------------------------------------------------

export type AvailableNumber = { phoneNumber: string; locality: string | null; region: string | null };

/** Local numbers available to buy, preferring the tenant's own area code. */
export async function searchAvailableLocalNumbers(params: {
  auth: TwilioAuth;
  areaCode?: string | null;
  limit?: number;
}): Promise<AvailableNumber[]> {
  const query = new URLSearchParams({
    // SMS capability is the only requirement. Do NOT filter on VoiceEnabled:
    // essentially every US local number is voice-capable, so VoiceEnabled=false
    // asks for numbers that cannot take calls and returns nothing.
    SmsEnabled: "true",
    PageSize: String(params.limit ?? 10),
  });
  const areaCode = String(params.areaCode ?? "").trim();
  if (/^\d{3}$/.test(areaCode)) query.set("AreaCode", areaCode);

  const json = await twilioRequest({
    step: "number_search",
    auth: params.auth,
    method: "GET",
    url: `${API_BASE}/Accounts/${params.auth.accountSid}/AvailablePhoneNumbers/US/Local.json?${query}`,
  });

  return (json?.available_phone_numbers ?? []).map((row: any) => ({
    phoneNumber: String(row?.phone_number ?? ""),
    locality: String(row?.locality ?? "").trim() || null,
    region: String(row?.region ?? "").trim() || null,
  }));
}

/**
 * Numbers this (sub)account already owns. The number step adopts an existing
 * number before ever purchasing: if a prior attempt bought one but the
 * bookkeeping write failed, the retry must reuse it, never buy a second.
 */
export async function listOwnedIncomingNumbers(params: {
  auth: TwilioAuth;
}): Promise<PurchasedNumber[]> {
  const json = await twilioRequest({
    step: "number_inventory",
    auth: params.auth,
    method: "GET",
    url: `${API_BASE}/Accounts/${params.auth.accountSid}/IncomingPhoneNumbers.json?PageSize=5`,
  });
  return (json?.incoming_phone_numbers ?? [])
    .map((row: any) => ({
      sid: String(row?.sid ?? ""),
      phoneNumber: String(row?.phone_number ?? ""),
    }))
    .filter((row: PurchasedNumber) => row.sid && row.phoneNumber);
}

export type PurchasedNumber = { sid: string; phoneNumber: string };

export async function purchaseLocalNumber(params: {
  auth: TwilioAuth;
  phoneNumber: string;
  friendlyName?: string;
}): Promise<PurchasedNumber> {
  const json = await twilioRequest({
    step: "number_purchase",
    auth: params.auth,
    method: "POST",
    url: `${API_BASE}/Accounts/${params.auth.accountSid}/IncomingPhoneNumbers.json`,
    form: { PhoneNumber: params.phoneNumber, FriendlyName: params.friendlyName },
  });
  const sid = String(json?.sid ?? "").trim();
  if (!sid) {
    throw new TwilioProvisioningError({
      step: "number_purchase",
      message: "Twilio did not return a phone number reference.",
    });
  }
  return { sid, phoneNumber: String(json?.phone_number ?? params.phoneNumber) };
}

// ---------------------------------------------------------------------------
// 3. Messaging Service
// ---------------------------------------------------------------------------

/**
 * Create the tenant's Messaging Service with our webhooks already attached.
 *
 * Advanced Opt-Out stays ON (Twilio's default): it handles STOP/HELP at the
 * carrier layer, which is a compliance requirement we must not silently turn
 * off. `UseInboundWebhookOnNumber=false` keeps inbound routing on the service
 * rather than the number, so it survives a number swap.
 */
export async function createMessagingService(params: {
  auth: TwilioAuth;
  friendlyName: string;
  inboundRequestUrl: string;
  statusCallbackUrl: string;
}): Promise<{ sid: string }> {
  const json = await twilioRequest({
    step: "messaging_service",
    auth: params.auth,
    method: "POST",
    url: `${MESSAGING_BASE}/Services`,
    form: {
      FriendlyName: params.friendlyName.slice(0, 64),
      InboundRequestUrl: params.inboundRequestUrl,
      InboundMethod: "POST",
      StatusCallback: params.statusCallbackUrl,
      UseInboundWebhookOnNumber: "false",
    },
  });
  const sid = String(json?.sid ?? "").trim();
  if (!sid) {
    throw new TwilioProvisioningError({
      step: "messaging_service",
      message: "Twilio did not return a messaging service reference.",
    });
  }
  return { sid };
}

export async function attachNumberToMessagingService(params: {
  auth: TwilioAuth;
  messagingServiceSid: string;
  phoneNumberSid: string;
}): Promise<void> {
  // Idempotent by check-then-attach: a re-run after a mid-step failure must
  // not error on "number already in service", and Twilio's duplicate-add error
  // code is not stable enough to pattern-match.
  const existing = await twilioRequest({
    step: "messaging_service_sender",
    auth: params.auth,
    method: "GET",
    url: `${MESSAGING_BASE}/Services/${params.messagingServiceSid}/PhoneNumbers?PageSize=50`,
  });
  const attached = (existing?.phone_numbers ?? []).some(
    (row: any) => String(row?.sid ?? "") === params.phoneNumberSid,
  );
  if (attached) return;

  await twilioRequest({
    step: "messaging_service_sender",
    auth: params.auth,
    method: "POST",
    url: `${MESSAGING_BASE}/Services/${params.messagingServiceSid}/PhoneNumbers`,
    form: { PhoneNumberSid: params.phoneNumberSid },
  });
}

// ---------------------------------------------------------------------------
// 4. TrustHub — customer profile
// ---------------------------------------------------------------------------

export async function createEndUser(params: {
  auth: TwilioAuth;
  friendlyName: string;
  type: string;
  attributes: Record<string, unknown>;
}): Promise<{ sid: string }> {
  const json = await twilioRequest({
    step: "trusthub_end_user",
    auth: params.auth,
    method: "POST",
    url: `${TRUSTHUB_BASE}/EndUsers`,
    form: {
      FriendlyName: params.friendlyName.slice(0, 64),
      Type: params.type,
      Attributes: JSON.stringify(params.attributes),
    },
  });
  return { sid: String(json?.sid ?? "") };
}

export async function createAddress(params: {
  auth: TwilioAuth;
  customerName: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  isoCountry: string;
}): Promise<{ sid: string }> {
  const json = await twilioRequest({
    step: "trusthub_address",
    auth: params.auth,
    method: "POST",
    url: `${API_BASE}/Accounts/${params.auth.accountSid}/Addresses.json`,
    form: {
      CustomerName: params.customerName,
      Street: params.street,
      City: params.city,
      Region: params.region,
      PostalCode: params.postalCode,
      IsoCountry: params.isoCountry,
    },
  });
  return { sid: String(json?.sid ?? "") };
}

export async function createSupportingDocument(params: {
  auth: TwilioAuth;
  friendlyName: string;
  type: string;
  attributes: Record<string, unknown>;
}): Promise<{ sid: string }> {
  const json = await twilioRequest({
    step: "trusthub_supporting_document",
    auth: params.auth,
    method: "POST",
    url: `${TRUSTHUB_BASE}/SupportingDocuments`,
    form: {
      FriendlyName: params.friendlyName.slice(0, 64),
      Type: params.type,
      Attributes: JSON.stringify(params.attributes),
    },
  });
  return { sid: String(json?.sid ?? "") };
}

export async function createCustomerProfile(params: {
  auth: TwilioAuth;
  friendlyName: string;
  email: string;
  policySid: string;
  statusCallbackUrl?: string;
}): Promise<{ sid: string }> {
  const json = await twilioRequest({
    step: "customer_profile",
    auth: params.auth,
    method: "POST",
    url: `${TRUSTHUB_BASE}/CustomerProfiles`,
    form: {
      FriendlyName: params.friendlyName.slice(0, 64),
      Email: params.email,
      PolicySid: params.policySid,
      StatusCallback: params.statusCallbackUrl,
    },
  });
  return { sid: String(json?.sid ?? "") };
}

export async function assignToCustomerProfile(params: {
  auth: TwilioAuth;
  customerProfileSid: string;
  objectSid: string;
}): Promise<void> {
  await twilioRequest({
    step: "customer_profile_assignment",
    auth: params.auth,
    method: "POST",
    url: `${TRUSTHUB_BASE}/CustomerProfiles/${params.customerProfileSid}/EntityAssignments`,
    form: { ObjectSid: params.objectSid },
  });
}

export type EvaluationResult = { sid: string; status: string; failures: TwilioFieldFailure[] };

/**
 * Run TrustHub's own validation BEFORE submitting for review.
 *
 * This is the whole reason the wizard can be honest about failures: an
 * evaluation is free and returns per-field reasons, whereas a rejected brand
 * costs a non-refundable TCR fee. Failures are mapped back onto the form.
 */
export async function evaluateCustomerProfile(params: {
  auth: TwilioAuth;
  customerProfileSid: string;
  policySid: string;
}): Promise<EvaluationResult> {
  const json = await twilioRequest({
    step: "customer_profile_evaluation",
    auth: params.auth,
    method: "POST",
    url: `${TRUSTHUB_BASE}/CustomerProfiles/${params.customerProfileSid}/Evaluations`,
    form: { PolicySid: params.policySid },
  });
  return {
    sid: String(json?.sid ?? ""),
    status: String(json?.status ?? ""),
    failures: extractEvaluationFailures(json),
  };
}

export async function evaluateTrustProduct(params: {
  auth: TwilioAuth;
  trustProductSid: string;
  policySid: string;
}): Promise<EvaluationResult> {
  const json = await twilioRequest({
    step: "trust_product_evaluation",
    auth: params.auth,
    method: "POST",
    url: `${TRUSTHUB_BASE}/TrustProducts/${params.trustProductSid}/Evaluations`,
    form: { PolicySid: params.policySid },
  });
  return {
    sid: String(json?.sid ?? ""),
    status: String(json?.status ?? ""),
    failures: extractEvaluationFailures(json),
  };
}

/**
 * Pull per-field failures out of an evaluation response.
 *
 * Twilio reports them as results[].invalid[] — an array of only the failing
 * fields, each with object_field and failure_reason. There is no fields[] array
 * listing passes and failures together; a requirement that passed simply has an
 * empty invalid[]. Defensive throughout: an unrecognized shape yields no
 * failures rather than throwing and losing the whole evaluation, which would
 * cost the operator the free preflight and push them into a paid rejection.
 */
export function extractEvaluationFailures(json: any): TwilioFieldFailure[] {
  const failures: TwilioFieldFailure[] = [];
  const results = Array.isArray(json?.results) ? json.results : [];
  for (const result of results) {
    const requirementName = String(result?.requirement_name ?? result?.friendly_name ?? "").trim();
    const invalid = Array.isArray(result?.invalid) ? result.invalid : [];

    if (invalid.length === 0) {
      // Nothing invalid means the requirement passed — unless Twilio explicitly
      // says otherwise, in which case report it at requirement level.
      if (result?.passed === false && requirementName) {
        failures.push({ field: requirementName, reason: "This requirement was not met." });
      }
      continue;
    }

    for (const field of invalid) {
      failures.push({
        field: String(field?.object_field ?? field?.friendly_name ?? requirementName).trim(),
        reason: sanitizeProviderMessage(
          field?.failure_reason ?? "This value did not pass Twilio's validation.",
        ),
      });
    }
  }
  return failures;
}

export async function submitCustomerProfileForReview(params: {
  auth: TwilioAuth;
  customerProfileSid: string;
}): Promise<{ status: string }> {
  const json = await twilioRequest({
    step: "customer_profile_submit",
    auth: params.auth,
    method: "POST",
    url: `${TRUSTHUB_BASE}/CustomerProfiles/${params.customerProfileSid}`,
    form: { Status: "pending-review" },
  });
  return { status: String(json?.status ?? "") };
}

// ---------------------------------------------------------------------------
// 5. TrustHub — A2P messaging profile (TrustProduct)
// ---------------------------------------------------------------------------

export async function createTrustProduct(params: {
  auth: TwilioAuth;
  friendlyName: string;
  email: string;
  policySid: string;
}): Promise<{ sid: string }> {
  const json = await twilioRequest({
    step: "trust_product",
    auth: params.auth,
    method: "POST",
    url: `${TRUSTHUB_BASE}/TrustProducts`,
    form: {
      FriendlyName: params.friendlyName.slice(0, 64),
      Email: params.email,
      PolicySid: params.policySid,
    },
  });
  return { sid: String(json?.sid ?? "") };
}

export async function assignToTrustProduct(params: {
  auth: TwilioAuth;
  trustProductSid: string;
  objectSid: string;
}): Promise<void> {
  await twilioRequest({
    step: "trust_product_assignment",
    auth: params.auth,
    method: "POST",
    url: `${TRUSTHUB_BASE}/TrustProducts/${params.trustProductSid}/EntityAssignments`,
    form: { ObjectSid: params.objectSid },
  });
}

export async function submitTrustProductForReview(params: {
  auth: TwilioAuth;
  trustProductSid: string;
}): Promise<{ status: string }> {
  const json = await twilioRequest({
    step: "trust_product_submit",
    auth: params.auth,
    method: "POST",
    url: `${TRUSTHUB_BASE}/TrustProducts/${params.trustProductSid}`,
    form: { Status: "pending-review" },
  });
  return { status: String(json?.status ?? "") };
}

/** Review status of a customer-profile bundle: draft | pending-review | in-review | twilio-approved | twilio-rejected. */
export async function fetchCustomerProfileStatus(params: {
  auth: TwilioAuth;
  customerProfileSid: string;
}): Promise<{ status: string }> {
  const json = await twilioRequest({
    step: "customer_profile_status",
    auth: params.auth,
    method: "GET",
    url: `${TRUSTHUB_BASE}/CustomerProfiles/${params.customerProfileSid}`,
  });
  return { status: String(json?.status ?? "").toLowerCase() };
}

/** Review status of an A2P trust-product bundle (same enum as customer profiles). */
export async function fetchTrustProductStatus(params: {
  auth: TwilioAuth;
  trustProductSid: string;
}): Promise<{ status: string }> {
  const json = await twilioRequest({
    step: "trust_product_status",
    auth: params.auth,
    method: "GET",
    url: `${TRUSTHUB_BASE}/TrustProducts/${params.trustProductSid}`,
  });
  return { status: String(json?.status ?? "").toLowerCase() };
}

/**
 * Object sids assigned to a bundle (works for CustomerProfiles and
 * TrustProducts — both expose the same EntityAssignments subresource).
 *
 * The Edit/Retry path depends on this: a brand references its bundles by sid,
 * so a fix after a failure must correct the SAME bundle in place — creating a
 * fresh profile would leave the failed brand pointing at the broken one.
 */
export async function listBundleAssignedObjectSids(params: {
  auth: TwilioAuth;
  bundleKind: "CustomerProfiles" | "TrustProducts";
  bundleSid: string;
}): Promise<string[]> {
  const json = await twilioRequest({
    step: "bundle_assignments",
    auth: params.auth,
    method: "GET",
    url: `${TRUSTHUB_BASE}/${params.bundleKind}/${params.bundleSid}/EntityAssignments?PageSize=50`,
  });
  return (json?.results ?? [])
    .map((row: any) => String(row?.object_sid ?? ""))
    .filter(Boolean);
}

export async function fetchEndUser(params: {
  auth: TwilioAuth;
  endUserSid: string;
}): Promise<{ sid: string; type: string }> {
  const json = await twilioRequest({
    step: "end_user_read",
    auth: params.auth,
    method: "GET",
    url: `${TRUSTHUB_BASE}/EndUsers/${params.endUserSid}`,
  });
  return { sid: String(json?.sid ?? ""), type: String(json?.type ?? "") };
}

export async function updateEndUser(params: {
  auth: TwilioAuth;
  endUserSid: string;
  attributes: Record<string, unknown>;
}): Promise<void> {
  await twilioRequest({
    step: "end_user_update",
    auth: params.auth,
    method: "POST",
    url: `${TRUSTHUB_BASE}/EndUsers/${params.endUserSid}`,
    form: { Attributes: JSON.stringify(params.attributes) },
  });
}

// ---------------------------------------------------------------------------
// 6. Brand registration
// ---------------------------------------------------------------------------

export type BrandRegistration = {
  sid: string;
  status: string;
  identityStatus: string | null;
  failureReason: string | null;
};

/**
 * Register the A2P brand.
 *
 * `SkipAutomaticSecVet=true` selects the Low-Volume Standard brand — $4.50
 * instead of $46, with throughput far beyond on-the-way message volumes.
 * `Mock=true` in sandbox exercises the whole state machine with no TCR spend.
 */
export async function createBrandRegistration(params: {
  auth: TwilioAuth;
  customerProfileBundleSid: string;
  a2pProfileBundleSid: string;
  soleProprietor: boolean;
  mock: boolean;
}): Promise<BrandRegistration> {
  const json = await twilioRequest({
    step: "brand",
    auth: params.auth,
    method: "POST",
    url: `${MESSAGING_BASE}/a2p/BrandRegistrations`,
    form: {
      CustomerProfileBundleSid: params.customerProfileBundleSid,
      A2PProfileBundleSid: params.a2pProfileBundleSid,
      ...(params.soleProprietor
        ? { BrandType: "SOLE_PROPRIETOR" }
        : { SkipAutomaticSecVet: "true" }),
      ...(params.mock ? { Mock: "true" } : {}),
    },
  });
  return toBrandRegistration(json);
}

/**
 * Brands already registered in this (sub)account. The subaccount is exclusively
 * one tenant's, so anything here came from a prior attempt whose bookkeeping
 * write failed — the retry adopts it instead of paying a second brand fee.
 */
export async function listBrandRegistrations(params: {
  auth: TwilioAuth;
}): Promise<BrandRegistration[]> {
  const json = await twilioRequest({
    step: "brand_inventory",
    auth: params.auth,
    method: "GET",
    url: `${MESSAGING_BASE}/a2p/BrandRegistrations?PageSize=5`,
  });
  return (json?.data ?? json?.brand_registrations ?? [])
    .map((row: any) => toBrandRegistration(row))
    .filter((brand: BrandRegistration) => brand.sid);
}

export async function fetchBrandRegistration(params: {
  auth: TwilioAuth;
  brandRegistrationSid: string;
}): Promise<BrandRegistration> {
  const json = await twilioRequest({
    step: "brand_status",
    auth: params.auth,
    method: "GET",
    url: `${MESSAGING_BASE}/a2p/BrandRegistrations/${params.brandRegistrationSid}`,
  });
  return toBrandRegistration(json);
}

/** Resubmit a failed brand after the underlying EndUser attributes are fixed. */
export async function resubmitBrandRegistration(params: {
  auth: TwilioAuth;
  brandRegistrationSid: string;
}): Promise<BrandRegistration> {
  const json = await twilioRequest({
    step: "brand_resubmit",
    auth: params.auth,
    method: "POST",
    url: `${MESSAGING_BASE}/a2p/BrandRegistrations/${params.brandRegistrationSid}`,
  });
  return toBrandRegistration(json);
}

/** Sole-proprietor brands verify the rep's phone by OTP; this resends it. */
export async function resendSoleProprietorOtp(params: {
  auth: TwilioAuth;
  brandRegistrationSid: string;
}): Promise<void> {
  await twilioRequest({
    step: "brand_otp_resend",
    auth: params.auth,
    method: "POST",
    url: `${MESSAGING_BASE}/a2p/BrandRegistrations/${params.brandRegistrationSid}/SmsOtp`,
  });
}

function toBrandRegistration(json: any): BrandRegistration {
  return {
    sid: String(json?.sid ?? ""),
    status: String(json?.status ?? ""),
    identityStatus: String(json?.identity_status ?? "").trim() || null,
    failureReason: json?.failure_reason
      ? sanitizeProviderMessage(json.failure_reason)
      : null,
  };
}

// ---------------------------------------------------------------------------
// 7. Campaign
// ---------------------------------------------------------------------------

export type CampaignRegistration = {
  sid: string;
  status: string;
  failureReason: string | null;
};

/**
 * Register the operational campaign under the brand.
 *
 * MessageFlow is the single most common rejection field: it must describe in
 * plain words exactly how a customer consents, which for this product is
 * "the customer gives their number when booking service". The samples come from
 * the already-approved on-the-way template so what carriers review is what
 * actually sends.
 */
export async function createCampaign(params: {
  auth: TwilioAuth;
  messagingServiceSid: string;
  brandRegistrationSid: string;
  description: string;
  messageFlow: string;
  messageSamples: string[];
  optInMessage: string;
  optOutMessage: string;
  helpMessage: string;
  privacyPolicyUrl: string;
  termsAndConditionsUrl: string;
}): Promise<CampaignRegistration> {
  // Carrier vetting enforces consistency between these flags and the actual
  // sample content (error 30889), so they are derived from the samples rather
  // than asserted: a hardcoded flag that contradicts the copy is a rejection.
  const sampleText = [
    ...params.messageSamples,
    params.optInMessage,
    params.optOutMessage,
    params.helpMessage,
  ].join(" ");
  const hasEmbeddedPhone = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(sampleText);
  const hasEmbeddedLinks = /https?:\/\//i.test(sampleText);

  const json = await twilioRequest({
    step: "campaign",
    auth: params.auth,
    method: "POST",
    url: `${MESSAGING_BASE}/Services/${params.messagingServiceSid}/Compliance/Usa2p`,
    form: {
      BrandRegistrationSid: params.brandRegistrationSid,
      Description: params.description,
      MessageFlow: params.messageFlow,
      MessageSamples: params.messageSamples,
      UsAppToPersonUsecase: "LOW_VOLUME",
      HasEmbeddedLinks: hasEmbeddedLinks ? "true" : "false",
      HasEmbeddedPhone: hasEmbeddedPhone ? "true" : "false",
      OptInMessage: params.optInMessage,
      OptOutMessage: params.optOutMessage,
      HelpMessage: params.helpMessage,
      OptInKeywords: ["START", "YES", "UNSTOP"],
      OptOutKeywords: ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"],
      HelpKeywords: ["HELP", "INFO"],
      PrivacyPolicyUrl: params.privacyPolicyUrl,
      TermsAndConditionsUrl: params.termsAndConditionsUrl,
    },
  });
  return toCampaignRegistration(json);
}

/**
 * Campaigns already registered on a Messaging Service (Twilio allows one).
 * Adoption path for a lost campaign_sid write: without it, every retry hits
 * the one-campaign-per-service conflict and the registration can never finish.
 */
export async function listCampaignsForService(params: {
  auth: TwilioAuth;
  messagingServiceSid: string;
}): Promise<CampaignRegistration[]> {
  const json = await twilioRequest({
    step: "campaign_inventory",
    auth: params.auth,
    method: "GET",
    url: `${MESSAGING_BASE}/Services/${params.messagingServiceSid}/Compliance/Usa2p`,
  });
  return (json?.compliance_registrations ?? [])
    .map((row: any) => toCampaignRegistration(row))
    .filter((campaign: CampaignRegistration) => campaign.sid);
}

export async function fetchCampaign(params: {
  auth: TwilioAuth;
  messagingServiceSid: string;
  campaignSid: string;
}): Promise<CampaignRegistration> {
  // MUST be the instance URL. The collection URL returns a list envelope
  // ({ compliance_registrations: [...] }) whose top level has no sid/status,
  // which would parse as an empty status and wait forever.
  const json = await twilioRequest({
    step: "campaign_status",
    auth: params.auth,
    method: "GET",
    url: `${MESSAGING_BASE}/Services/${params.messagingServiceSid}/Compliance/Usa2p/${params.campaignSid}`,
  });
  return toCampaignRegistration(json);
}

function toCampaignRegistration(json: any): CampaignRegistration {
  return {
    sid: String(json?.sid ?? ""),
    status: String(json?.campaign_status ?? json?.status ?? ""),
    failureReason: json?.failure_reason ? sanitizeProviderMessage(json.failure_reason) : null,
  };
}

/**
 * Twilio 30915: a registered LLC/corporation submitted as a sole proprietor.
 * Worth naming explicitly — the fix is to restart on the EIN path, which the
 * generic error text does not say.
 */
export function isSoleProprietorEligibilityError(error: unknown): boolean {
  return error instanceof TwilioProvisioningError && String(error.code) === "30915";
}

/** Twilio 30795: brand rejected, usually an EIN / legal-name mismatch. */
export function isBrandIdentityMismatchError(error: unknown): boolean {
  return error instanceof TwilioProvisioningError && String(error.code) === "30795";
}
