/**
 * Resumable A2P provisioning orchestration — server-only.
 *
 * Deliberately NOT one mega-action. Each step advances independently and
 * records its Twilio reference on the registration row before the next begins,
 * because these steps spend real money and are not idempotent: a number is
 * ~$1.15/mo the moment it is bought and a brand fee is non-refundable. If step
 * five fails, steps one through four must never be re-run.
 *
 * That makes the registration row the state machine, and `runNextProvisioningStep`
 * a pure function of it: whatever failed, the operator retries and the engine
 * picks up exactly where it stopped.
 *
 * Nothing here activates live sending. Provisioning ends at
 * `ready_for_activation`; a human still performs the attested activation.
 */

import {
  TwilioProvisioningError,
  a2pMessagingProfilePolicySid,
  assignToCustomerProfile,
  assignToTrustProduct,
  attachNumberToMessagingService,
  createAddress,
  createBrandRegistration,
  createCampaign,
  createCustomerProfile,
  createEndUser,
  createMessagingService,
  createSupportingDocument,
  createTrustProduct,
  createTwilioSubaccount,
  customerProfilePolicySid,
  evaluateCustomerProfile,
  evaluateTrustProduct,
  purchaseLocalNumber,
  searchAvailableLocalNumbers,
  submitCustomerProfileForReview,
  submitTrustProductForReview,
  type TwilioAuth,
  type TwilioFieldFailure,
} from "./twilio-provisioning-client";
import { encryptSmsCredential } from "./sms-credentials-encryption";
import { resolveSubaccountCredential } from "./sms-account-resolution";

export type ProvisioningStep =
  | "subaccount"
  | "number"
  | "messaging_service"
  | "customer_profile"
  | "trust_product"
  | "brand"
  | "campaign"
  | "done";

export type ProvisioningStepResult = {
  step: ProvisioningStep;
  outcome: "advanced" | "blocked" | "failed" | "complete";
  message?: string;
  fieldFailures?: TwilioFieldFailure[];
};

export type ProvisioningRegistration = Record<string, any>;

const WEBHOOK_BASE = "https://app.compliancemattersca.com";
export const INBOUND_WEBHOOK_URL = `${WEBHOOK_BASE}/api/sms/twilio/inbound`;
export const STATUS_CALLBACK_URL = `${WEBHOOK_BASE}/api/sms/twilio/status-callback`;

/**
 * The next step this registration needs, derived purely from which references
 * it already holds. A ref present means that step's spend already happened.
 */
export function nextProvisioningStep(registration: ProvisioningRegistration): ProvisioningStep {
  if (!registration?.subaccount_sid) return "subaccount";
  if (!registration.phone_number_sid) return "number";
  if (!registration.messaging_service_sid) return "messaging_service";
  if (!registration.customer_profile_sid) return "customer_profile";
  if (!registration.trust_product_sid) return "trust_product";
  if (!registration.brand_registration_sid) return "brand";
  if (!registration.campaign_sid) return "campaign";
  return "done";
}

export function isSoleProprietorPath(registration: ProvisioningRegistration): boolean {
  return String(registration?.registration_path ?? "") === "a2p_sole_prop";
}

function isMock(registration: ProvisioningRegistration): boolean {
  return String(registration?.provider_environment ?? "") === "sandbox";
}

/** Area code from the tenant's own address, so the number looks local to them. */
export function preferredAreaCode(registration: ProvisioningRegistration): string | null {
  const phone = String(registration?.rep_phone ?? "").replace(/\D/g, "");
  if (phone.length === 11 && phone.startsWith("1")) return phone.slice(1, 4);
  if (phone.length === 10) return phone.slice(0, 3);
  return null;
}

async function patchRegistration(params: {
  admin: any;
  registrationId: string;
  patch: Record<string, unknown>;
}): Promise<void> {
  await params.admin
    .from("sms_provisioning_registrations")
    .update(params.patch)
    .eq("id", params.registrationId);
}

/** Business-information attributes for the EIN (standard) path. */
export function buildBusinessInformationAttributes(registration: ProvisioningRegistration) {
  return {
    business_name: String(registration.legal_business_name ?? ""),
    business_identity: "direct_customer",
    business_type: String(registration.business_type ?? ""),
    business_industry: String(registration.business_industry ?? ""),
    business_registration_identifier: "EIN",
    business_registration_number: String(registration.ein ?? ""),
    business_regions_of_operation: "USA_AND_CANADA",
    website_url: String(registration.website_url ?? ""),
    social_media_profile_urls: "",
  };
}

export function buildAuthorizedRepresentativeAttributes(registration: ProvisioningRegistration) {
  return {
    first_name: String(registration.rep_first_name ?? ""),
    last_name: String(registration.rep_last_name ?? ""),
    email: String(registration.rep_email ?? ""),
    phone_number: String(registration.rep_phone ?? ""),
    business_title: String(registration.rep_business_title ?? registration.rep_title ?? ""),
    job_position: String(registration.rep_title ?? "Owner"),
  };
}

/**
 * Campaign copy. MessageFlow is the single most-rejected field, so it states in
 * plain words exactly how a customer consents — which for this product is
 * giving their number when booking service. The samples are the real on-the-way
 * text, so what carriers review is what actually sends.
 */
export function buildCampaignCopy(registration: ProvisioningRegistration) {
  const business = String(registration.legal_business_name ?? "our company");
  return {
    description:
      `Operational service notifications for ${business}: appointment confirmations and ` +
      `"technician is on the way" updates for customers who have scheduled service.`,
    messageFlow:
      "Customers provide their mobile number when they book or schedule a service " +
      "appointment, either by phone with our office or on our website's booking form, " +
      "and agree at that time to receive text updates about that appointment. " +
      "No numbers are purchased, rented, or shared. Consent is per customer and can be " +
      "withdrawn at any time by replying STOP.",
    messageSamples: [
      `${business}: Your technician is on the way and should arrive in about 30 minutes. Reply STOP to opt out.`,
      `${business}: Your service appointment is confirmed for tomorrow between 8am and 12pm. Reply STOP to opt out.`,
    ],
    optInMessage: `${business}: You will now receive appointment updates. Msg&data rates may apply. Reply HELP for help, STOP to cancel.`,
    optOutMessage: `${business}: You have been unsubscribed and will receive no further messages. Reply START to resubscribe.`,
    helpMessage: `${business}: For help, contact our office. Msg&data rates may apply. Reply STOP to unsubscribe.`,
    privacyPolicyUrl: `${WEBHOOK_BASE}/privacy`,
    termsAndConditionsUrl: `${WEBHOOK_BASE}/terms`,
  };
}

/** The subaccount's own credentials, needed for every step after the first. */
async function authForRegistration(params: {
  admin: any;
  registration: ProvisioningRegistration;
}): Promise<TwilioAuth> {
  const credential = await resolveSubaccountCredential({
    admin: params.admin,
    accountOwnerUserId: String(params.registration.account_owner_user_id),
  });
  if (!credential) {
    throw new TwilioProvisioningError({
      step: "credentials",
      message:
        "The Twilio subaccount credentials for this account could not be read. " +
        "Provisioning cannot continue until they are restored.",
    });
  }
  return { accountSid: credential.accountSid, authToken: credential.authToken };
}

/**
 * Advance the registration by exactly one step.
 *
 * Never throws: a failure is recorded on the row as a first-class state with a
 * sanitized reason, which is what the wizard renders with Retry and Edit.
 */
export async function runNextProvisioningStep(params: {
  admin: any;
  registration: ProvisioningRegistration;
}): Promise<ProvisioningStepResult> {
  const { admin, registration } = params;
  const registrationId = String(registration.id);
  const step = nextProvisioningStep(registration);
  if (step === "done") return { step, outcome: "complete" };

  const soleProp = isSoleProprietorPath(registration);

  try {
    switch (step) {
      case "subaccount": {
        const subaccount = await createTwilioSubaccount({
          friendlyName: `EveryStep — ${String(registration.legal_business_name ?? registrationId).slice(0, 40)}`,
        });
        // Store the credential BEFORE the ref: a subaccount whose token we lost
        // is unusable, and we would have no way to reach it again.
        await admin.from("sms_provider_subaccount_credentials").upsert(
          {
            account_owner_user_id: registration.account_owner_user_id,
            subaccount_sid: subaccount.sid,
            auth_token_encrypted: encryptSmsCredential(subaccount.authToken),
          },
          { onConflict: "account_owner_user_id" },
        );
        await patchRegistration({
          admin,
          registrationId,
          patch: { subaccount_sid: subaccount.sid, subaccount_status: "complete", last_error: null },
        });
        return { step, outcome: "advanced" };
      }

      case "number": {
        const auth = await authForRegistration({ admin, registration });
        const candidates = await searchAvailableLocalNumbers({
          auth,
          areaCode: preferredAreaCode(registration),
        });
        // Retry without the area-code preference rather than failing: a local
        // number in the next area code beats no number at all.
        const fallback = candidates.length
          ? candidates
          : await searchAvailableLocalNumbers({ auth, areaCode: null });
        if (!fallback.length) {
          throw new TwilioProvisioningError({
            step: "number",
            message: "No local numbers are currently available to purchase. Try again shortly.",
          });
        }
        const purchased = await purchaseLocalNumber({
          auth,
          phoneNumber: fallback[0].phoneNumber,
          friendlyName: String(registration.legal_business_name ?? "").slice(0, 64) || undefined,
        });
        await patchRegistration({
          admin,
          registrationId,
          patch: {
            phone_number_sid: purchased.sid,
            phone_e164: purchased.phoneNumber,
            number_status: "complete",
            last_error: null,
          },
        });
        return { step, outcome: "advanced" };
      }

      case "messaging_service": {
        const auth = await authForRegistration({ admin, registration });
        const service = await createMessagingService({
          auth,
          friendlyName: String(registration.legal_business_name ?? "EveryStep").slice(0, 64),
          inboundRequestUrl: INBOUND_WEBHOOK_URL,
          statusCallbackUrl: STATUS_CALLBACK_URL,
        });
        await attachNumberToMessagingService({
          auth,
          messagingServiceSid: service.sid,
          phoneNumberSid: String(registration.phone_number_sid),
        });
        await patchRegistration({
          admin,
          registrationId,
          patch: {
            messaging_service_sid: service.sid,
            messaging_service_status: "complete",
            last_error: null,
          },
        });
        return { step, outcome: "advanced" };
      }

      case "customer_profile": {
        const auth = await authForRegistration({ admin, registration });
        const policySid = customerProfilePolicySid(soleProp);
        const profile = await createCustomerProfile({
          auth,
          friendlyName: String(registration.legal_business_name ?? "EveryStep").slice(0, 64),
          email: String(registration.rep_email ?? ""),
          policySid,
        });

        const rep = await createEndUser({
          auth,
          friendlyName: "Authorized representative",
          type: "authorized_representative_1",
          attributes: buildAuthorizedRepresentativeAttributes(registration),
        });
        await assignToCustomerProfile({ auth, customerProfileSid: profile.sid, objectSid: rep.sid });

        if (!soleProp) {
          const business = await createEndUser({
            auth,
            friendlyName: "Business information",
            type: "customer_profile_business_information",
            attributes: buildBusinessInformationAttributes(registration),
          });
          await assignToCustomerProfile({
            auth,
            customerProfileSid: profile.sid,
            objectSid: business.sid,
          });
        }

        const address = await createAddress({
          auth,
          customerName: String(registration.legal_business_name ?? ""),
          street: String(registration.address_line1 ?? ""),
          city: String(registration.city ?? ""),
          region: String(registration.region ?? ""),
          postalCode: String(registration.postal_code ?? ""),
          isoCountry: String(registration.iso_country ?? "US"),
        });
        const document = await createSupportingDocument({
          auth,
          friendlyName: "Business address",
          type: "customer_profile_address",
          attributes: { address_sids: address.sid },
        });
        await assignToCustomerProfile({
          auth,
          customerProfileSid: profile.sid,
          objectSid: document.sid,
        });

        // Free preflight. A rejected brand costs a non-refundable fee, so the
        // operator gets field-level errors here instead of a bill.
        const evaluation = await evaluateCustomerProfile({
          auth,
          customerProfileSid: profile.sid,
          policySid,
        });
        if (evaluation.failures.length > 0) {
          await patchRegistration({
            admin,
            registrationId,
            patch: {
              customer_profile_sid: profile.sid,
              address_sid: address.sid,
              supporting_document_sid: document.sid,
              customer_profile_status: "failed",
              last_error: {
                step: "customer_profile",
                message: "Twilio's validation rejected some business details.",
                fieldFailures: evaluation.failures,
              },
            },
          });
          return {
            step,
            outcome: "blocked",
            message: "Twilio's validation rejected some business details.",
            fieldFailures: evaluation.failures,
          };
        }

        await submitCustomerProfileForReview({ auth, customerProfileSid: profile.sid });
        await patchRegistration({
          admin,
          registrationId,
          patch: {
            customer_profile_sid: profile.sid,
            address_sid: address.sid,
            supporting_document_sid: document.sid,
            customer_profile_status: "pending_review",
            last_error: null,
          },
        });
        return { step, outcome: "advanced" };
      }

      case "trust_product": {
        const auth = await authForRegistration({ admin, registration });
        // Sole proprietors evaluate against a different policy — the standard
        // one asks for things they structurally cannot provide.
        const policySid = a2pMessagingProfilePolicySid(soleProp);
        const product = await createTrustProduct({
          auth,
          friendlyName: `${String(registration.legal_business_name ?? "EveryStep")} A2P`.slice(0, 64),
          email: String(registration.rep_email ?? ""),
          policySid,
        });
        const profileInfo = await createEndUser({
          auth,
          friendlyName: "A2P messaging profile",
          type: "us_a2p_messaging_profile_information",
          attributes: {
            company_type: soleProp ? "direct" : "private",
            ...(soleProp ? {} : { stock_exchange: "NONE", stock_ticker: "" }),
          },
        });
        await assignToTrustProduct({ auth, trustProductSid: product.sid, objectSid: profileInfo.sid });
        await assignToTrustProduct({
          auth,
          trustProductSid: product.sid,
          objectSid: String(registration.customer_profile_sid),
        });

        const evaluation = await evaluateTrustProduct({
          auth,
          trustProductSid: product.sid,
          policySid,
        });
        if (evaluation.failures.length > 0) {
          await patchRegistration({
            admin,
            registrationId,
            patch: {
              trust_product_sid: product.sid,
              trust_product_status: "failed",
              last_error: {
                step: "trust_product",
                message: "Twilio's messaging-profile validation did not pass.",
                fieldFailures: evaluation.failures,
              },
            },
          });
          return {
            step,
            outcome: "blocked",
            message: "Twilio's messaging-profile validation did not pass.",
            fieldFailures: evaluation.failures,
          };
        }

        await submitTrustProductForReview({ auth, trustProductSid: product.sid });
        await patchRegistration({
          admin,
          registrationId,
          patch: {
            trust_product_sid: product.sid,
            trust_product_status: "pending_review",
            last_error: null,
          },
        });
        return { step, outcome: "advanced" };
      }

      case "brand": {
        const auth = await authForRegistration({ admin, registration });
        const brand = await createBrandRegistration({
          auth,
          customerProfileBundleSid: String(registration.customer_profile_sid),
          a2pProfileBundleSid: String(registration.trust_product_sid),
          soleProprietor: soleProp,
          mock: isMock(registration),
        });
        await patchRegistration({
          admin,
          registrationId,
          patch: {
            brand_registration_sid: brand.sid,
            brand_status: brand.status || "PENDING",
            brand_identity_status: brand.identityStatus,
            last_error: null,
          },
        });
        return { step, outcome: "advanced" };
      }

      case "campaign": {
        const auth = await authForRegistration({ admin, registration });
        const copy = buildCampaignCopy(registration);
        const campaign = await createCampaign({
          auth,
          messagingServiceSid: String(registration.messaging_service_sid),
          brandRegistrationSid: String(registration.brand_registration_sid),
          ...copy,
        });
        await patchRegistration({
          admin,
          registrationId,
          patch: {
            campaign_sid: campaign.sid,
            campaign_status: campaign.status || "PENDING",
            submitted_at: new Date().toISOString(),
            last_error: null,
          },
        });
        return { step, outcome: "advanced" };
      }

      default:
        return { step, outcome: "complete" };
    }
  } catch (error) {
    const provisioning =
      error instanceof TwilioProvisioningError
        ? error
        : new TwilioProvisioningError({
            step,
            message: error instanceof Error ? error.message : "Provisioning step failed.",
          });

    // Best-effort: a failure we cannot record is still a failure we must report.
    try {
      await patchRegistration({
        admin,
        registrationId,
        patch: { [`${statusColumnForStep(step)}`]: "failed", last_error: provisioning.toStoredError() },
      });
    } catch {
      /* swallow — the returned result still carries the failure */
    }

    return {
      step,
      outcome: "failed",
      message: provisioning.message,
      fieldFailures: provisioning.fieldFailures,
    };
  }
}

function statusColumnForStep(step: ProvisioningStep): string {
  switch (step) {
    case "subaccount":
      return "subaccount_status";
    case "number":
      return "number_status";
    case "messaging_service":
      return "messaging_service_status";
    case "customer_profile":
      return "customer_profile_status";
    case "trust_product":
      return "trust_product_status";
    case "brand":
      return "brand_status";
    default:
      return "campaign_status";
  }
}

/** Plain-language label for each step, for the tenant-facing status panel. */
export function describeProvisioningStep(step: ProvisioningStep): string {
  switch (step) {
    case "subaccount":
      return "Setting up your messaging account";
    case "number":
      return "Reserving your local phone number";
    case "messaging_service":
      return "Connecting your number";
    case "customer_profile":
      return "Submitting your business details for verification";
    case "trust_product":
      return "Submitting your messaging profile";
    case "brand":
      return "Registering your business with the carriers";
    case "campaign":
      return "Registering your message type — carrier review can take up to about two weeks";
    default:
      return "Registration complete";
  }
}
