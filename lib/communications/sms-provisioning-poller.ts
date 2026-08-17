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

/**
 * Twilio's TrustHub API speaks hyphens ("twilio-approved"); the registration
 * columns are CHECK-constrained to the underscore vocabulary. Rejection maps
 * to `twilio_rejected`, which the step engine treats like a failure: the step
 * re-runs in place with the operator's corrections. Unknown values map to
 * null and are not written.
 */
function toDbBundleStatus(apiStatus: string): string | null {
  switch (String(apiStatus ?? "").toLowerCase().replace(/-/g, "_")) {
    case "draft":
    case "in_progress":
      return "in_progress";
    case "pending_review":
    case "in_review":
      return "pending_review";
    case "twilio_approved":
      return "twilio_approved";
    case "twilio_rejected":
      return "twilio_rejected";
    default:
      return null;
  }
}

/** brand_status values the migration's CHECK constraint permits. */
const ALLOWED_BRAND_STATUSES = new Set([
  "not_started",
  "in_progress",
  "PENDING",
  "APPROVED",
  "FAILED",
  "IN_REVIEW",
  "DELETED",
  "SUSPENDED",
  "failed",
]);

export async function pollOneRegistration(params: {
  admin: any;
  registration: Record<string, any>;
  now?: Date;
}): Promise<PollResult> {
  const { admin, registration } = params;
  const registrationId = String(registration.id);

  // Stamp FIRST, decide after: a row skipped without a stamp keeps
  // last_polled_at null, sorts to the very front of every poll (nullsFirst),
  // and 25 such rows would starve every entitled tenant out of the window.
  await stampPolled(admin, registrationId, params.now);

  // An account removed from the allowlist stops being polled — entitlement is
  // re-checked per row, not assumed from the row's existence.
  if (!isSmsSelfServeEnabledForAccountOwner(String(registration.account_owner_user_id ?? ""))) {
    return { registrationId, outcome: "skipped", detail: "not entitled" };
  }

  const credential = await resolveSubaccountCredential({
    admin,
    accountOwnerUserId: String(registration.account_owner_user_id),
  });
  if (!credential) return { registrationId, outcome: "skipped", detail: "no subaccount credential" };
  const auth = { accountSid: credential.accountSid, authToken: credential.authToken };

  // TrustHub bundle reviews first: the wizard's brand gate opens when both
  // bundles are twilio_approved, and this refresh is what opens it. A
  // rejection also records last_error — the step engine re-runs the bundle
  // step in place, and the wizard must show WHY, never a calm "waiting".
  for (const bundle of [
    {
      sid: registration.customer_profile_sid,
      column: "customer_profile_status",
      current: registration.customer_profile_status,
      label: "business profile",
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
      label: "messaging profile",
      fetch: () =>
        fetchTrustProductStatus({ auth, trustProductSid: String(registration.trust_product_sid) }),
    },
  ]) {
    const pending = String(bundle.current ?? "").toLowerCase() === "pending_review";
    if (bundle.sid && pending) {
      const fetched = await bundle.fetch();
      const dbStatus = toDbBundleStatus(fetched.status);
      if (dbStatus && dbStatus !== String(bundle.current ?? "").toLowerCase()) {
        const patch: Record<string, unknown> =
          dbStatus === "twilio_rejected"
            ? {
                [bundle.column]: dbStatus,
                last_error: {
                  step: bundle.column.replace(/_status$/, ""),
                  message:
                    `Twilio's review rejected your ${bundle.label}. Edit the details below and `
                    + "resubmit — the same registration continues; nothing is lost.",
                },
              }
            : { [bundle.column]: dbStatus };
        await admin
          .from("sms_provisioning_registrations")
          .update(patch)
          .eq("id", registrationId);
      }
    }
  }

  // Brand next: a failed brand makes the campaign moot, and its failure reason
  // is the actionable one (EIN/name mismatch being by far the most common).
  // Skip the brand fetch once it is terminally APPROVED — during the weeks a
  // campaign can sit in carrier review, refetching a settled brand every ten
  // minutes is a thousand pointless authenticated calls per registration.
  if (
    registration.brand_registration_sid
    && String(registration.brand_status ?? "").toUpperCase() !== "APPROVED"
  ) {
    const brand = await fetchBrandRegistration({
      auth,
      brandRegistrationSid: String(registration.brand_registration_sid),
    });
    // Clamp to the CHECK constraint's vocabulary: an unexpected value from the
    // API (e.g. DELETION_PENDING) must not turn a status refresh into a
    // constraint violation. Terminal detection below still sees the raw value.
    if (
      brand.status
      && brand.status !== registration.brand_status
      && ALLOWED_BRAND_STATUSES.has(brand.status)
    ) {
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
    try {
      await completeRegistration({ admin, registration, now: params.now });
      return { registrationId, outcome: "completed" };
    } catch (error) {
      // completed_at was NOT stamped, so the next poll retries this. Record
      // why, so a persistent failure is visible instead of a silent loop.
      const message = error instanceof Error ? error.message : "completion failed";
      try {
        await admin
          .from("sms_provisioning_registrations")
          .update({ last_error: { step: "completion", message } })
          .eq("id", registrationId);
      } catch {
        /* the poll result still carries the failure */
      }
      return { registrationId, outcome: "failed", detail: message };
    }
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

  // A sandbox registration is a Mock walkthrough: its brand/campaign never
  // reached the carriers, so its refs must NEVER land in the columns the live
  // send path reads. Concierge configs live on provider_environment='sandbox'
  // rows and can be LIVE-ACTIVE — writing a Mock messaging service over one
  // would reroute real customer texts into an unregistered lane. Sandbox
  // completion closes the registration row and touches nothing else.
  if (String(registration.provider_environment ?? "") === "sandbox") {
    const { error } = await admin
      .from("sms_provisioning_registrations")
      .update({ campaign_status: "VERIFIED", completed_at: nowIso, last_error: null })
      .eq("id", registration.id);
    if (error) {
      throw new Error(`Completion write failed (sandbox stamp): ${String(error.message ?? error)}`);
    }
    return;
  }

  // completed_at is stamped ONLY when every write below lands. A completion
  // that half-failed and stamped anyway would retire the row from the poll
  // forever, leaving an account that can never activate and no error anywhere.
  // Throwing instead lets the caller record it and the next poll retry it.
  const require = (label: string, error: unknown) => {
    if (error) {
      throw new Error(`Completion write failed (${label}): ${String((error as any)?.message ?? error)}`);
    }
  };

  const configPatch = {
    provider_account_ref: registration.subaccount_sid,
    default_messaging_service_ref: registration.messaging_service_sid,
    // ready_for_activation, never active — a human still attests.
    readiness_status: "ready_for_activation",
    inbound_webhook_readiness: "ready",
    status_callback_readiness: "ready",
    advanced_opt_out_readiness: "ready",
  };

  // List, never maybeSingle: a tenant can legitimately hold one config row per
  // environment (the unique index allows it), and a multi-row maybeSingle
  // error must not silently reroute this into the insert branch.
  const registrationEnvironment = String(registration.provider_environment ?? "production");
  const { data: configRows, error: configReadError } = await admin
    .from("sms_provider_configurations")
    .select("id, provider_environment")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("provider_name", "twilio");
  require("configuration read", configReadError);
  const rows: any[] = Array.isArray(configRows) ? configRows : [];
  const existingConfig =
    rows.find((row) => String(row?.provider_environment ?? "") === registrationEnvironment)
    ?? rows.find((row) => String(row?.provider_environment ?? "") === "production")
    ?? rows[0]
    ?? null;

  let configurationId: string | null = existingConfig?.id ? String(existingConfig.id) : null;
  if (configurationId) {
    const { error } = await admin
      .from("sms_provider_configurations")
      .update(configPatch)
      .eq("id", configurationId)
      .eq("account_owner_user_id", accountOwnerUserId);
    require("configuration update", error);
  } else {
    const { data: insertedConfig, error } = await admin
      .from("sms_provider_configurations")
      .insert({
        account_owner_user_id: accountOwnerUserId,
        provider_name: "twilio",
        provider_environment: registrationEnvironment,
        created_by_user_id: actorUserId,
        updated_by_user_id: actorUserId,
        ...configPatch,
      })
      .select("id")
      .single();
    require("configuration insert", error);
    configurationId = insertedConfig?.id ? String(insertedConfig.id) : null;
  }
  if (!configurationId) {
    throw new Error("Completion write failed (configuration): no configuration id resolved");
  }

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

  // List-and-pick for the same reason as the config read above: nothing
  // guarantees a single sender row per configuration, and a multi-row
  // maybeSingle error would strand a VERIFIED registration forever.
  const { data: senderRows, error: senderReadError } = await admin
    .from("sms_sender_identities")
    .select("id")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("provider_configuration_id", configurationId);
  require("sender read", senderReadError);
  const existingSender = (Array.isArray(senderRows) ? senderRows : [])[0] ?? null;

  if (existingSender?.id) {
    const { error } = await admin
      .from("sms_sender_identities")
      .update(senderPatch)
      .eq("id", existingSender.id)
      .eq("account_owner_user_id", accountOwnerUserId);
    require("sender update", error);
  } else {
    const { error } = await admin.from("sms_sender_identities").insert({
      account_owner_user_id: accountOwnerUserId,
      provider_configuration_id: configurationId,
      sender_type: "long_code",
      sender_display_label: "Business Texting Number",
      created_by_user_id: actorUserId,
      updated_by_user_id: actorUserId,
      ...senderPatch,
    });
    require("sender insert", error);
  }

  const { error: stampError } = await admin
    .from("sms_provisioning_registrations")
    .update({ campaign_status: "VERIFIED", completed_at: nowIso, last_error: null })
    .eq("id", registration.id);
  require("completion stamp", stampError);
}
