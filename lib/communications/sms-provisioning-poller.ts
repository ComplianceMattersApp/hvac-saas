/**
 * Polls in-flight A2P registrations and completes them — server-only.
 *
 * THE POLLER POLLS. IT NEVER PROVISIONS. Every provisioning step is a
 * non-refundable spend and runs only from an operator's explicit click in the
 * wizard (one step per click, by contract). The cron's whole job is to refresh
 * the statuses of things already submitted for review — TrustHub bundles, the
 * brand, the campaign — so the wizard's gates open when Twilio approves, and
 * to run completion when the campaign verifies. A registration the operator
 * saved but never started must sit untouched forever.
 *
 * Polling rather than Event Streams because a Streams sink must be configured
 * per subaccount, which is real per-tenant setup cost for status we can simply
 * ask for. Brand review is typically minutes; campaign review can be weeks, so
 * a 10-minute cadence is ample.
 *
 * Never throws, and isolates per row — the same discipline as the QBO sweeps.
 *
 * Completion lands at `ready_for_activation`. It NEVER sets activation_status
 * to active: a human still performs the three-attestation live activation.
 */

import {
  fetchBrandRegistration,
  fetchCampaign,
  fetchCustomerProfileStatus,
  fetchTrustProductStatus,
} from "./twilio-provisioning-client";
import { resolveSubaccountCredential } from "./sms-account-resolution";
import { isSmsSelfServeEnabledForAccountOwner } from "./sms-self-serve-gate";

export type PollOutcome =
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
      // Nothing async exists to poll before the customer profile is created;
      // rows the operator saved but never started stay untouched.
      .not("customer_profile_sid", "is", null)
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

  // An account removed from the allowlist stops being polled — entitlement is
  // re-checked per row, not assumed from the row's existence.
  if (!isSmsSelfServeEnabledForAccountOwner(String(registration.account_owner_user_id ?? ""))) {
    return { registrationId, outcome: "skipped", detail: "not entitled" };
  }

  await stampPolled(admin, registrationId, params.now);

  const credential = await resolveSubaccountCredential({
    admin,
    accountOwnerUserId: String(registration.account_owner_user_id),
  });
  if (!credential) return { registrationId, outcome: "skipped", detail: "no subaccount credential" };
  const auth = { accountSid: credential.accountSid, authToken: credential.authToken };

  // TrustHub bundle reviews first: the wizard's brand gate opens when both
  // bundles are twilio-approved, and this refresh is what opens it.
  for (const bundle of [
    {
      sid: registration.customer_profile_sid,
      column: "customer_profile_status",
      current: registration.customer_profile_status,
      fetch: () =>
        fetchCustomerProfileStatus({
          auth,
          customerProfileSid: String(registration.customer_profile_sid),
        }),
    },
    {
      sid: registration.trust_product_sid,
      column: "trust_product_status",
      current: registration.trust_product_status,
      fetch: () =>
        fetchTrustProductStatus({ auth, trustProductSid: String(registration.trust_product_sid) }),
    },
  ]) {
    const pending = ["pending_review", "pending-review", "in-review"].includes(
      String(bundle.current ?? "").toLowerCase(),
    );
    if (bundle.sid && pending) {
      const fetched = await bundle.fetch();
      if (fetched.status && fetched.status !== String(bundle.current ?? "").toLowerCase()) {
        await admin
          .from("sms_provisioning_registrations")
          .update({ [bundle.column]: fetched.status })
          .eq("id", registrationId);
      }
    }
  }

  // Brand next: a failed brand makes the campaign moot, and its failure reason
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

  // Campaign last — and only once it exists. Fetched by its own sid: the
  // collection URL returns a list envelope with no top-level status.
  if (!registration.campaign_sid) {
    return { registrationId, outcome: "waiting", detail: "awaiting operator steps" };
  }

  const campaign = await fetchCampaign({
    auth,
    messagingServiceSid: String(registration.messaging_service_sid),
    campaignSid: String(registration.campaign_sid),
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
 * FIND-OR-CREATE, not update: a wizard-only tenant has no provider
 * configuration or sender identity row — those were only ever inserted by the
 * concierge forms, which the audience split hides from tenants. An UPDATE that
 * matches zero rows would stamp the registration complete while leaving the
 * account unable to ever activate.
 */
export async function completeRegistration(params: {
  admin: any;
  registration: Record<string, any>;
  now?: Date;
}): Promise<void> {
  const { admin, registration } = params;
  const nowIso = (params.now ?? new Date()).toISOString();
  const accountOwnerUserId = registration.account_owner_user_id;
  const actorUserId = registration.updated_by_user_id ?? registration.created_by_user_id ?? null;

  const configPatch = {
    provider_account_ref: registration.subaccount_sid,
    default_messaging_service_ref: registration.messaging_service_sid,
    // ready_for_activation, never active — a human still attests.
    readiness_status: "ready_for_activation",
    inbound_webhook_readiness: "ready",
    status_callback_readiness: "ready",
    advanced_opt_out_readiness: "ready",
  };

  const { data: existingConfig } = await admin
    .from("sms_provider_configurations")
    .select("id")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("provider_name", "twilio")
    .maybeSingle();

  let configurationId: string | null = existingConfig?.id ? String(existingConfig.id) : null;
  if (configurationId) {
    await admin
      .from("sms_provider_configurations")
      .update(configPatch)
      .eq("id", configurationId)
      .eq("account_owner_user_id", accountOwnerUserId);
  } else {
    const { data: insertedConfig } = await admin
      .from("sms_provider_configurations")
      .insert({
        account_owner_user_id: accountOwnerUserId,
        provider_name: "twilio",
        provider_environment: String(registration.provider_environment ?? "production"),
        created_by_user_id: actorUserId,
        updated_by_user_id: actorUserId,
        ...configPatch,
      })
      .select("id")
      .single();
    configurationId = insertedConfig?.id ? String(insertedConfig.id) : null;
  }

  if (configurationId) {
    const senderPatch = {
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
      activation_status: "active",
    };

    const { data: existingSender } = await admin
      .from("sms_sender_identities")
      .select("id")
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("provider_configuration_id", configurationId)
      .maybeSingle();

    if (existingSender?.id) {
      await admin
        .from("sms_sender_identities")
        .update(senderPatch)
        .eq("id", existingSender.id)
        .eq("account_owner_user_id", accountOwnerUserId);
    } else {
      await admin.from("sms_sender_identities").insert({
        account_owner_user_id: accountOwnerUserId,
        provider_configuration_id: configurationId,
        sender_type: "long_code",
        sender_display_label: "Business Texting Number",
        created_by_user_id: actorUserId,
        updated_by_user_id: actorUserId,
        ...senderPatch,
      });
    }
  }

  await admin
    .from("sms_provisioning_registrations")
    .update({ campaign_status: "VERIFIED", completed_at: nowIso, last_error: null })
    .eq("id", registration.id);
}
