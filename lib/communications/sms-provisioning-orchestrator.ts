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
  fetchEndUser,
  listBundleAssignedObjectSids,
  listOwnedIncomingNumbers,
  purchaseLocalNumber,
  resubmitBrandRegistration,
  searchAvailableLocalNumbers,
  submitCustomerProfileForReview,
  submitTrustProductForReview,
  updateEndUser,
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
  /**
   * "waiting" means the step's PREREQUISITE review has not cleared yet (bundle
   * approval before brand, brand approval before campaign) — nothing ran,
   * nothing was spent, and nothing is wrong. The poller refreshes those
   * statuses; the operator just tries again later.
   */
  outcome: "advanced" | "blocked" | "failed" | "waiting" | "complete";
  message?: string;
  fieldFailures?: TwilioFieldFailure[];
};

export type ProvisioningRegistration = Record<string, any>;

const WEBHOOK_BASE = "https://app.compliancemattersca.com";
export const INBOUND_WEBHOOK_URL = `${WEBHOOK_BASE}/api/sms/twilio/inbound`;
export const STATUS_CALLBACK_URL = `${WEBHOOK_BASE}/api/sms/twilio/status-callback`;

/**
 * The next step this registration needs, derived from which references it
 * holds AND each step's status. A ref present means that step's Twilio
 * resource exists — but a 'failed' status means the step did not finish
 * (validation rejected, or a later call in the step broke), so the step
 * re-runs IN PLACE against the existing resource. Presence alone must never
 * skip a failed step: that would submit a bundle that was never fixed.
 */
export function nextProvisioningStep(registration: ProvisioningRegistration): ProvisioningStep {
  // 'failed' is the step's own failure; 'twilio_rejected' is the review's.
  // Both mean the same thing to the engine: this step must re-run in place
  // (with the operator's corrections) before anything after it may proceed.
  const failed = (status: unknown) =>
    ["failed", "twilio_rejected"].includes(String(status ?? "").toLowerCase());

  if (!registration?.subaccount_sid) return "subaccount";
  if (!registration.phone_number_sid || failed(registration.number_status)) return "number";
  if (!registration.messaging_service_sid || failed(registration.messaging_service_status)) {
    return "messaging_service";
  }
  if (!registration.customer_profile_sid || failed(registration.customer_profile_status)) {
    return "customer_profile";
  }
  if (!registration.trust_product_sid || failed(registration.trust_product_status)) {
    return "trust_product";
  }
  if (!registration.brand_registration_sid || failed(registration.brand_status)) {
    return "brand";
  }
  if (!registration.campaign_sid || failed(registration.campaign_status)) return "campaign";
  return "done";
}

/**
 * TrustHub bundle review status that allows the brand step to run — the
 * DATABASE form (underscored, per the migration's CHECK constraint), which the
 * poller normalizes Twilio's hyphenated API values into.
 */
const BUNDLE_APPROVED = "twilio_approved";

export function brandStepPrerequisitesMet(registration: ProvisioningRegistration): boolean {
  return (
    String(registration?.customer_profile_status ?? "").toLowerCase() === BUNDLE_APPROVED
    && String(registration?.trust_product_status ?? "").toLowerCase() === BUNDLE_APPROVED
  );
}

export function campaignStepPrerequisitesMet(registration: ProvisioningRegistration): boolean {
  return String(registration?.brand_status ?? "").toUpperCase() === "APPROVED";
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

/**
 * Serialize a money-spending step across concurrent clicks: exactly one caller
 * wins the conditional flip to 'in_progress'; the loser sees zero rows and
 * reports "already running". A crashed winner is unstuck by the staleness
 * window — after two minutes the reservation may be taken over.
 */
export async function reserveSpendStep(params: {
  admin: any;
  registrationId: string;
  statusColumn: string;
  now?: Date;
}): Promise<boolean> {
  const staleBefore = new Date((params.now ?? new Date()).getTime() - 2 * 60 * 1000).toISOString();
  const { data, error } = await params.admin
    .from("sms_provisioning_registrations")
    .update({ [params.statusColumn]: "in_progress" })
    .eq("id", params.registrationId)
    .or(`${params.statusColumn}.neq.in_progress,updated_at.lt.${staleBefore}`)
    .select("id");
  if (error) {
    throw new TwilioProvisioningError({
      step: "bookkeeping",
      message: `Could not reserve the step: ${String(error.message ?? "database error")}`,
    });
  }
  return Array.isArray(data) && data.length > 0;
}

async function patchRegistration(params: {
  admin: any;
  registrationId: string;
  patch: Record<string, unknown>;
}): Promise<void> {
  // Throws on failure: silently losing a Twilio ref is how a retry double-buys
  // a resource. The recovery story for a lost write is adoption (the number
  // step lists what the subaccount already owns), but the first line of
  // defense is refusing to continue as if the write landed.
  const { error } = await params.admin
    .from("sms_provisioning_registrations")
    .update(params.patch)
    .eq("id", params.registrationId);
  if (error) {
    throw new TwilioProvisioningError({
      step: "bookkeeping",
      message: `Could not record provisioning progress: ${String(error.message ?? "database error")}`,
    });
  }
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
        // Reserve first: two concurrent clicks would both see an empty
        // subaccount and both purchase. Exactly one wins the conditional flip.
        const reserved = await reserveSpendStep({
          admin,
          registrationId,
          statusColumn: "number_status",
        });
        if (!reserved) {
          return {
            step,
            outcome: "waiting",
            message: "This step is already running — give it a moment, then refresh.",
          };
        }

        const auth = await authForRegistration({ admin, registration });

        // ADOPT before buying. The subaccount is exclusively this tenant's, so
        // any number already in it came from a prior attempt whose bookkeeping
        // write failed — buying another would be the double-spend this module
        // exists to prevent.
        const owned = await listOwnedIncomingNumbers({ auth });
        const adopted = owned[0] ?? null;
        if (adopted) {
          await patchRegistration({
            admin,
            registrationId,
            patch: {
              phone_number_sid: adopted.sid,
              phone_e164: adopted.phoneNumber,
              number_status: "complete",
              last_error: null,
            },
          });
          return { step, outcome: "advanced" };
        }

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

        // Persist the sid the moment the service exists, then attach. A re-run
        // after a failed attach reuses the recorded service instead of creating
        // a second one and binding the campaign to the wrong service.
        let serviceSid = String(registration.messaging_service_sid ?? "").trim();
        if (!serviceSid) {
          const service = await createMessagingService({
            auth,
            friendlyName: String(registration.legal_business_name ?? "EveryStep").slice(0, 64),
            inboundRequestUrl: INBOUND_WEBHOOK_URL,
            statusCallbackUrl: STATUS_CALLBACK_URL,
          });
          serviceSid = service.sid;
          await patchRegistration({
            admin,
            registrationId,
            // 'in_progress' — the only intermediate status the migration's
            // CHECK constraint permits for this column.
            patch: { messaging_service_sid: serviceSid, messaging_service_status: "in_progress" },
          });
        }

        await attachNumberToMessagingService({
          auth,
          messagingServiceSid: serviceSid,
          phoneNumberSid: String(registration.phone_number_sid),
        });
        await patchRegistration({
          admin,
          registrationId,
          patch: { messaging_service_status: "complete", last_error: null },
        });
        return { step, outcome: "advanced" };
      }

      case "customer_profile": {
        const auth = await authForRegistration({ admin, registration });
        const policySid = customerProfilePolicySid(soleProp);

        // Create-or-adopt the profile shell, persisting its sid IMMEDIATELY —
        // the brand will reference this bundle by sid, so a re-run must keep
        // correcting the same bundle, never start a parallel one.
        let profileSid = String(registration.customer_profile_sid ?? "").trim();
        if (!profileSid) {
          const profile = await createCustomerProfile({
            auth,
            friendlyName: String(registration.legal_business_name ?? "EveryStep").slice(0, 64),
            email: String(registration.rep_email ?? ""),
            policySid,
          });
          profileSid = profile.sid;
          await patchRegistration({
            admin,
            registrationId,
            patch: { customer_profile_sid: profileSid, customer_profile_status: "in_progress" },
          });
        }

        // Make the bundle contents match the CURRENT form values: existing
        // EndUsers are updated in place (this is the Edit path after a
        // validation failure), missing ones are created and assigned.
        const assigned = await listBundleAssignedObjectSids({
          auth,
          bundleKind: "CustomerProfiles",
          bundleSid: profileSid,
        });
        const endUserSidByType: Record<string, string> = {};
        for (const objectSid of assigned.filter((sid) => sid.startsWith("IT"))) {
          const endUser = await fetchEndUser({ auth, endUserSid: objectSid });
          if (endUser.type) endUserSidByType[endUser.type] = endUser.sid;
        }

        const wantedEndUsers = [
          {
            type: "authorized_representative_1",
            friendlyName: "Authorized representative",
            attributes: buildAuthorizedRepresentativeAttributes(registration),
          },
          ...(soleProp
            ? []
            : [
                {
                  type: "customer_profile_business_information",
                  friendlyName: "Business information",
                  attributes: buildBusinessInformationAttributes(registration),
                },
              ]),
        ];
        for (const wanted of wantedEndUsers) {
          const existingSid = endUserSidByType[wanted.type];
          if (existingSid) {
            await updateEndUser({ auth, endUserSid: existingSid, attributes: wanted.attributes });
          } else {
            const created = await createEndUser({
              auth,
              friendlyName: wanted.friendlyName,
              type: wanted.type,
              attributes: wanted.attributes,
            });
            await assignToCustomerProfile({
              auth,
              customerProfileSid: profileSid,
              objectSid: created.sid,
            });
          }
        }

        // Address document: created once and reused. (A later address change is
        // a support-path operation — documented limitation of this slice.)
        // If the sid write was lost but a document IS assigned, ADOPT the
        // assigned one — creating a second document would record a sid that is
        // not the one the bundle actually reads.
        let addressSid = String(registration.address_sid ?? "").trim();
        let documentSid = String(registration.supporting_document_sid ?? "").trim();
        const assignedDocumentSid = assigned.find((sid) => sid.startsWith("RD")) ?? "";
        if (!documentSid && assignedDocumentSid) {
          documentSid = assignedDocumentSid;
          await patchRegistration({
            admin,
            registrationId,
            patch: { supporting_document_sid: documentSid },
          });
        }
        if (!documentSid) {
          if (!addressSid) {
            const address = await createAddress({
              auth,
              customerName: String(registration.legal_business_name ?? ""),
              street: String(registration.address_line1 ?? ""),
              city: String(registration.city ?? ""),
              region: String(registration.region ?? ""),
              postalCode: String(registration.postal_code ?? ""),
              isoCountry: String(registration.iso_country ?? "US"),
            });
            addressSid = address.sid;
            await patchRegistration({ admin, registrationId, patch: { address_sid: addressSid } });
          }
          const document = await createSupportingDocument({
            auth,
            friendlyName: "Business address",
            type: "customer_profile_address",
            attributes: { address_sids: addressSid },
          });
          documentSid = document.sid;
          await patchRegistration({
            admin,
            registrationId,
            patch: { supporting_document_sid: documentSid },
          });
        }
        if (!assigned.includes(documentSid)) {
          await assignToCustomerProfile({
            auth,
            customerProfileSid: profileSid,
            objectSid: documentSid,
          });
        }

        // Free preflight. A rejected brand costs a non-refundable fee, so the
        // operator gets field-level errors here instead of a bill.
        const evaluation = await evaluateCustomerProfile({
          auth,
          customerProfileSid: profileSid,
          policySid,
        });
        if (evaluation.failures.length > 0) {
          await patchRegistration({
            admin,
            registrationId,
            patch: {
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

        await submitCustomerProfileForReview({ auth, customerProfileSid: profileSid });
        await patchRegistration({
          admin,
          registrationId,
          patch: { customer_profile_status: "pending_review", last_error: null },
        });
        return { step, outcome: "advanced" };
      }

      case "trust_product": {
        const auth = await authForRegistration({ admin, registration });
        // Sole proprietors evaluate against a different policy — the standard
        // one asks for things they structurally cannot provide.
        const policySid = a2pMessagingProfilePolicySid(soleProp);

        // Same ensure-idempotent shape as the customer profile: adopt the
        // bundle if it exists, persist the sid immediately when created, and
        // make its contents match rather than duplicating them.
        let productSid = String(registration.trust_product_sid ?? "").trim();
        if (!productSid) {
          const product = await createTrustProduct({
            auth,
            friendlyName: `${String(registration.legal_business_name ?? "EveryStep")} A2P`.slice(0, 64),
            email: String(registration.rep_email ?? ""),
            policySid,
          });
          productSid = product.sid;
          await patchRegistration({
            admin,
            registrationId,
            patch: { trust_product_sid: productSid, trust_product_status: "in_progress" },
          });
        }

        const assigned = await listBundleAssignedObjectSids({
          auth,
          bundleKind: "TrustProducts",
          bundleSid: productSid,
        });

        const profileInfoAttributes = {
          company_type: soleProp ? "direct" : "private",
          ...(soleProp ? {} : { stock_exchange: "NONE", stock_ticker: "" }),
        };
        const existingInfoSid = await (async () => {
          for (const objectSid of assigned.filter((sid) => sid.startsWith("IT"))) {
            const endUser = await fetchEndUser({ auth, endUserSid: objectSid });
            if (endUser.type === "us_a2p_messaging_profile_information") return endUser.sid;
          }
          return "";
        })();
        if (existingInfoSid) {
          await updateEndUser({ auth, endUserSid: existingInfoSid, attributes: profileInfoAttributes });
        } else {
          const profileInfo = await createEndUser({
            auth,
            friendlyName: "A2P messaging profile",
            type: "us_a2p_messaging_profile_information",
            attributes: profileInfoAttributes,
          });
          await assignToTrustProduct({ auth, trustProductSid: productSid, objectSid: profileInfo.sid });
        }

        const customerProfileSid = String(registration.customer_profile_sid);
        if (!assigned.includes(customerProfileSid)) {
          await assignToTrustProduct({ auth, trustProductSid: productSid, objectSid: customerProfileSid });
        }

        const evaluation = await evaluateTrustProduct({
          auth,
          trustProductSid: productSid,
          policySid,
        });
        if (evaluation.failures.length > 0) {
          await patchRegistration({
            admin,
            registrationId,
            patch: {
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

        await submitTrustProductForReview({ auth, trustProductSid: productSid });
        await patchRegistration({
          admin,
          registrationId,
          patch: { trust_product_status: "pending_review", last_error: null },
        });
        return { step, outcome: "advanced" };
      }

      case "brand": {
        // GATE: the brand references both TrustHub bundles, and creating it
        // while they are still in review is a guaranteed rejection that reads
        // like an error to the operator. Wait until the poller has seen both
        // bundles approved. Nothing runs and nothing is spent.
        if (!brandStepPrerequisitesMet(registration)) {
          return {
            step,
            outcome: "waiting",
            message:
              "Twilio is still reviewing your business profile — usually minutes to a day. "
              + "Come back and press Continue once it clears; we check the status every few minutes.",
          };
        }

        // Brand creation carries a non-refundable fee — same reservation
        // discipline as the number purchase.
        const reservedBrand = await reserveSpendStep({
          admin,
          registrationId,
          statusColumn: "brand_status",
        });
        if (!reservedBrand) {
          return {
            step,
            outcome: "waiting",
            message: "This step is already running — give it a moment, then refresh.",
          };
        }

        const auth = await authForRegistration({ admin, registration });

        // A FAILED brand is resubmitted in place after the operator fixed the
        // bundle (a bare re-POST triggers carrier re-evaluation; Twilio covers
        // two free retries). Creating a second brand would pay a second fee.
        const existingBrandSid = String(registration.brand_registration_sid ?? "").trim();
        if (existingBrandSid) {
          const resubmitted = await resubmitBrandRegistration({
            auth,
            brandRegistrationSid: existingBrandSid,
          });
          await patchRegistration({
            admin,
            registrationId,
            patch: {
              brand_status: resubmitted.status || "PENDING",
              brand_identity_status: resubmitted.identityStatus,
              last_error: null,
            },
          });
          return { step, outcome: "advanced" };
        }

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
        // GATE: a campaign created under a brand that is not yet APPROVED is
        // rejected on sight (error 21717) and burns operator confidence.
        if (!campaignStepPrerequisitesMet(registration)) {
          return {
            step,
            outcome: "waiting",
            message:
              "The carriers are still reviewing your business registration — typically minutes, "
              + "occasionally up to a week. Come back and press Continue once it clears; we check "
              + "the status every few minutes.",
          };
        }

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
