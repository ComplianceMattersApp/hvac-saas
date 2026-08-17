/**
 * Polls in-flight A2P registrations and completes them — server-only.
 *
 * Polling rather than Event Streams because a Streams sink must be configured
 * per subaccount, which is real per-tenant setup cost for status we can simply
 * ask for. Brand review is typically minutes; campaign review can be weeks, so
 * a 10-minute cadence is ample.
 *
 * Never throws, and isolates per row — the same discipline as the QBO sweeps.
 * One tenant whose Twilio account is misconfigured must not stop every other
 * tenant's registration from progressing.
 *
 * Completion lands at `ready_for_activation`. It NEVER sets activation_status
 * to active: a human still performs the three-attestation live activation.
 */

import { fetchBrandRegistration, fetchCampaign } from "./twilio-provisioning-client";
import { resolveSubaccountCredential } from "./sms-account-resolution";
import { runNextProvisioningStep } from "./sms-provisioning-orchestrator";

export type PollOutcome =
  | "advanced"
  | "waiting"
  | "completed"
  | "rejected"
  | "failed"
  | "skipped";

export type PollResult = { registrationId: string; outcome: PollOutcome; detail?: string };

/** Brand states that mean "stop waiting, a human must act". */
const TERMINAL_BRAND_FAILURES = new Set(["FAILED", "SUSPENDED", "DELETED"]);

export async function pollProvisioningRegistrations(params: {
  admin: any;
  limit?: number;
  now?: Date;
}): Promise<PollResult[]> {
  const limit = params.limit ?? 25;
  const results: PollResult[] = [];

  let rows: any[] = [];
  try {
    const { data, error } = await params.admin
      .from("sms_provisioning_registrations")
      .select("*")
      .is("completed_at", null)
      .order("last_polled_at", { ascending: true, nullsFirst: true })
      .limit(limit);
    if (error || !data) return results;
    rows = data;
  } catch {
    return results;
  }

  for (const registration of rows) {
    try {
      results.push(await pollOneRegistration({ admin: params.admin, registration, now: params.now }));
    } catch (error) {
      results.push({
        registrationId: String(registration?.id ?? ""),
        outcome: "failed",
        detail: error instanceof Error ? error.message : "poll failed",
      });
    }
  }

  return results;
}

async function stampPolled(admin: any, registrationId: string, now?: Date) {
  try {
    await admin
      .from("sms_provisioning_registrations")
      .update({ last_polled_at: (now ?? new Date()).toISOString() })
      .eq("id", registrationId);
  } catch {
    /* stamping is bookkeeping — never a reason to fail the poll */
  }
}

export async function pollOneRegistration(params: {
  admin: any;
  registration: Record<string, any>;
  now?: Date;
}): Promise<PollResult> {
  const { admin, registration } = params;
  const registrationId = String(registration.id);
  await stampPolled(admin, registrationId, params.now);

  // Not yet submitted: keep walking the creation steps rather than polling for
  // a status that does not exist yet.
  if (!registration.campaign_sid) {
    const stepResult = await runNextProvisioningStep({ admin, registration });
    return {
      registrationId,
      outcome:
        stepResult.outcome === "advanced"
          ? "advanced"
          : stepResult.outcome === "complete"
            ? "waiting"
            : "failed",
      detail: stepResult.message,
    };
  }

  const credential = await resolveSubaccountCredential({
    admin,
    accountOwnerUserId: String(registration.account_owner_user_id),
  });
  if (!credential) return { registrationId, outcome: "skipped", detail: "no subaccount credential" };
  const auth = { accountSid: credential.accountSid, authToken: credential.authToken };

  // Brand first: a failed brand makes the campaign moot, and its failure reason
  // is the actionable one (EIN/name mismatch being by far the most common).
  if (registration.brand_registration_sid) {
    const brand = await fetchBrandRegistration({
      auth,
      brandRegistrationSid: String(registration.brand_registration_sid),
    });
    if (brand.status && brand.status !== registration.brand_status) {
      await admin
        .from("sms_provisioning_registrations")
        .update({ brand_status: brand.status, brand_identity_status: brand.identityStatus })
        .eq("id", registrationId);
    }
    if (TERMINAL_BRAND_FAILURES.has(brand.status)) {
      await markRejected({
        admin,
        registration,
        message:
          brand.failureReason
          ?? "The carriers rejected this business registration. Check that the legal name matches the IRS letter for this EIN exactly.",
      });
      return { registrationId, outcome: "rejected", detail: brand.failureReason ?? undefined };
    }
  }

  const campaign = await fetchCampaign({
    auth,
    messagingServiceSid: String(registration.messaging_service_sid),
  });
  if (campaign.status && campaign.status !== registration.campaign_status) {
    await admin
      .from("sms_provisioning_registrations")
      .update({ campaign_status: campaign.status })
      .eq("id", registrationId);
  }

  if (campaign.status === "FAILED") {
    await markRejected({
      admin,
      registration,
      message: campaign.failureReason ?? "The carriers rejected this campaign registration.",
    });
    return { registrationId, outcome: "rejected", detail: campaign.failureReason ?? undefined };
  }

  if (campaign.status === "VERIFIED") {
    await completeRegistration({ admin, registration, now: params.now });
    return { registrationId, outcome: "completed" };
  }

  return { registrationId, outcome: "waiting", detail: campaign.status || undefined };
}

async function markRejected(params: {
  admin: any;
  registration: Record<string, any>;
  message: string;
}): Promise<void> {
  const { admin, registration } = params;
  try {
    await admin
      .from("sms_provisioning_registrations")
      .update({
        last_error: { step: "carrier_review", message: params.message },
      })
      .eq("id", registration.id);
    await admin
      .from("sms_provider_configurations")
      .update({ readiness_status: "rejected" })
      .eq("account_owner_user_id", registration.account_owner_user_id)
      .eq("provider_name", "twilio");
  } catch {
    /* the poll result still reports the rejection */
  }
}

/**
 * Write the finished registration into the schema the send path already reads.
 *
 * This is the whole point of the lane: the columns
 * (`provider_brand_ref`, `provider_campaign_ref`, `provider_registration_ref`,
 * `provider_sender_ref`, `messaging_service_ref`) have existed since the SMS
 * foundation and were never written. Filling them is what makes a
 * wizard-provisioned tenant indistinguishable from a concierge-provisioned one.
 */
export async function completeRegistration(params: {
  admin: any;
  registration: Record<string, any>;
  now?: Date;
}): Promise<void> {
  const { admin, registration } = params;
  const nowIso = (params.now ?? new Date()).toISOString();
  const accountOwnerUserId = registration.account_owner_user_id;

  const { data: configuration } = await admin
    .from("sms_provider_configurations")
    .select("id")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("provider_name", "twilio")
    .maybeSingle();

  await admin
    .from("sms_provider_configurations")
    .update({
      provider_account_ref: registration.subaccount_sid,
      default_messaging_service_ref: registration.messaging_service_sid,
      // ready_for_activation, never active — a human still attests.
      readiness_status: "ready_for_activation",
      inbound_webhook_readiness: "ready",
      status_callback_readiness: "ready",
      advanced_opt_out_readiness: "ready",
    })
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("provider_name", "twilio");

  if (configuration?.id) {
    await admin
      .from("sms_sender_identities")
      .update({
        phone_e164: registration.phone_e164,
        phone_last4: String(registration.phone_e164 ?? "").slice(-4),
        provider_sender_ref: registration.phone_number_sid,
        messaging_service_ref: registration.messaging_service_sid,
        provider_brand_ref: registration.brand_registration_sid,
        provider_campaign_ref: registration.campaign_sid,
        provider_registration_ref: registration.customer_profile_sid,
        registration_type: "a2p_10dlc",
        // Earned, not attested: the campaign is VERIFIED at the carriers and
        // the number is attached to the messaging service.
        verification_status: "verified",
      })
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("provider_configuration_id", configuration.id);
  }

  await admin
    .from("sms_provisioning_registrations")
    .update({ campaign_status: "VERIFIED", completed_at: nowIso, last_error: null })
    .eq("id", registration.id);
}
