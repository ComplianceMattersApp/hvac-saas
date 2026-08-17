/**
 * Live On-The-Way SMS send — server-only.
 *
 * Called best-effort after Mark On The Way writes a ready sms_message_intents
 * row. Live sending requires the account's provider configuration to be
 * explicitly activated (activation_status = 'active', which the schema only
 * permits alongside ready_for_activation/active readiness). The activation is
 * a deliberate admin action with attestations — nothing here turns itself on.
 *
 * Gates enforced per send attempt:
 * - live activation on the provider configuration (single row reused from
 *   sandbox setup — activation does not require re-entering the number)
 * - verified/active sender identity + Messaging Service ref
 * - fresh suppression check on the recipient phone (STOP wins over consent,
 *   even a STOP that arrived after the intent was created)
 * - quiet hours: sends only 8am–9pm in the account's business time zone
 *   (TCPA window). On-the-way is a now-event, so a held message is skipped,
 *   not delayed.
 *
 * Failure never propagates: the caller treats this as fire-and-forget and job
 * lifecycle truth is never affected.
 */

import { prepareSmsProviderDeliveryPreflight } from "@/lib/communications/sms-provider-delivery-preflight";
import { resolveSubaccountCredential } from "@/lib/communications/sms-account-resolution";
import {
  sendTwilioSandboxMessage,
  TwilioMessageError,
} from "@/lib/communications/twilio-messages-client";

type SupabaseLike = {
  from(table: string): any;
};

export type LiveSendOutcome =
  | "sent_to_provider"
  | "provider_immediate_failure"
  | "held_quiet_hours"
  | "not_activated"
  | "suppressed"
  | "blocked"
  | "already_handled"
  | "error";

export type AttemptLiveOnTheWaySendResult = {
  attempted: boolean;
  outcome: LiveSendOutcome;
  deliveryId?: string;
  detail?: string;
};

export const SMS_SEND_WINDOW_START_HOUR = 8; // 8:00 AM local
export const SMS_SEND_WINDOW_END_HOUR = 21; // up to (not including) 9:00 PM local

function asTrimmed(value: unknown): string {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

export function isWithinSmsSendWindow(params: { timeZone: string; now?: Date }): boolean {
  const now = params.now ?? new Date();
  let hour: number;
  try {
    const hourText = new Intl.DateTimeFormat("en-US", {
      timeZone: params.timeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now);
    hour = Number.parseInt(hourText, 10);
  } catch {
    // Unknown/invalid time zone: fail closed (treat as outside the window).
    return false;
  }

  if (!Number.isFinite(hour)) {
    return false;
  }

  return hour >= SMS_SEND_WINDOW_START_HOUR && hour < SMS_SEND_WINDOW_END_HOUR;
}

export type ResolveLiveProviderConfigResult = {
  ready: boolean;
  blockedReasons: string[];
  providerConfigurationId?: string;
  messagingServiceSid?: string;
  /**
   * The subaccount this tenant's traffic runs under (AC…), or null for the
   * platform account. Written at provisioning completion; the send below and
   * webhook validation both key off this same column, so they cannot disagree.
   */
  providerAccountRef?: string | null;
};

/**
 * Live readiness: reuses the account's existing Twilio configuration row
 * (production row preferred when one exists) and requires explicit activation.
 * The sandbox send gate and test-recipient allowlist do NOT apply to live —
 * consent + suppression are the per-recipient gates.
 */
export async function resolveSmsLiveProviderConfig(params: {
  admin: SupabaseLike;
  accountOwnerUserId: string;
}): Promise<ResolveLiveProviderConfigResult> {
  const accountOwnerUserId = asTrimmed(params.accountOwnerUserId);
  if (!accountOwnerUserId) {
    return { ready: false, blockedReasons: ["account_scope_missing"] };
  }

  const configResponse = await params.admin
    .from("sms_provider_configurations")
    .select(
      "id, provider_environment, readiness_status, activation_status, default_messaging_service_ref, provider_account_ref",
    )
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("provider_name", "twilio");

  if (configResponse?.error) {
    throw configResponse.error;
  }

  const configRows: any[] = Array.isArray(configResponse?.data) ? configResponse.data : [];
  if (configRows.length === 0) {
    return { ready: false, blockedReasons: ["provider_configuration_missing"] };
  }

  const config =
    configRows.find((row) => asTrimmed(row.provider_environment) === "production") ??
    configRows[0];

  const providerConfigurationId = asTrimmed(config.id);

  if (asTrimmed(config.activation_status) !== "active") {
    return {
      ready: false,
      blockedReasons: ["live_activation_disabled"],
      providerConfigurationId,
    };
  }

  const senderResponse = await params.admin
    .from("sms_sender_identities")
    .select("id, verification_status, activation_status, messaging_service_ref")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("provider_configuration_id", providerConfigurationId)
    .limit(1);

  if (senderResponse?.error) {
    throw senderResponse.error;
  }

  const senderRows: any[] = Array.isArray(senderResponse?.data) ? senderResponse.data : [];
  const sender = senderRows[0];

  const senderReady =
    sender &&
    ["verified", "active"].includes(asTrimmed(sender.verification_status)) &&
    asTrimmed(sender.activation_status) === "active";

  if (!senderReady) {
    return {
      ready: false,
      blockedReasons: ["sender_identity_not_ready"],
      providerConfigurationId,
    };
  }

  const messagingServiceSid =
    asTrimmed(config.default_messaging_service_ref) || asTrimmed(sender.messaging_service_ref);

  if (!messagingServiceSid) {
    return {
      ready: false,
      blockedReasons: ["messaging_service_missing"],
      providerConfigurationId,
    };
  }

  const providerAccountRef = asTrimmed(config.provider_account_ref) || null;

  return {
    ready: true,
    blockedReasons: [],
    providerConfigurationId,
    messagingServiceSid,
    providerAccountRef,
  };
}

async function readAccountTimeZone(params: {
  admin: SupabaseLike;
  accountOwnerUserId: string;
}): Promise<string> {
  const response = await params.admin
    .from("internal_business_profiles")
    .select("time_zone")
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .maybeSingle();

  if (response?.error) {
    throw response.error;
  }

  return asTrimmed(response?.data?.time_zone) || "America/Los_Angeles";
}

async function hasActiveSuppressionForPhone(params: {
  admin: SupabaseLike;
  accountOwnerUserId: string;
  phoneE164: string;
}): Promise<boolean> {
  const response = await params.admin
    .from("contact_recipient_suppressions")
    .select("id")
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("phone_e164", params.phoneE164)
    .eq("is_active", true)
    .limit(1);

  if (response?.error) {
    throw response.error;
  }

  return Array.isArray(response?.data) && response.data.length > 0;
}

function normalizeTwilioStatus(twilioStatus: string): "queued" | "submitted" {
  return twilioStatus === "queued" ? "queued" : "submitted";
}

export async function attemptLiveOnTheWaySend(params: {
  admin: SupabaseLike;
  accountOwnerUserId: string;
  smsMessageIntentId: string;
  now?: Date;
}): Promise<AttemptLiveOnTheWaySendResult> {
  try {
    const accountOwnerUserId = asTrimmed(params.accountOwnerUserId);
    const smsMessageIntentId = asTrimmed(params.smsMessageIntentId);
    if (!accountOwnerUserId || !smsMessageIntentId) {
      return { attempted: false, outcome: "blocked", detail: "missing_scope_or_intent" };
    }

    // 1. Live activation + provider readiness
    const liveConfig = await resolveSmsLiveProviderConfig({
      admin: params.admin,
      accountOwnerUserId,
    });

    if (!liveConfig.ready) {
      const notActivated = liveConfig.blockedReasons.includes("live_activation_disabled");
      return {
        attempted: false,
        outcome: notActivated ? "not_activated" : "blocked",
        detail: liveConfig.blockedReasons.join(","),
      };
    }

    // 1b. Which Twilio account this tenant's traffic runs under — the SAME
    // rule webhook signature validation uses (resolveTwilioAccountForOwner):
    // the subaccount only when the configuration's provider_account_ref names
    // an account whose credential we hold; otherwise the platform account.
    // Implemented against the config row ALREADY read in step 1 (no second
    // configuration read, no read-skew window). Concierge tenants whose
    // free-text account ref matches no stored credential keep sending via the
    // platform exactly as before this lane existed.
    let sendAuth: { accountSid: string; authToken: string } | null = null;
    const accountRef = asTrimmed(liveConfig.providerAccountRef ?? "");
    if (accountRef.startsWith("AC")) {
      const credential = await resolveSubaccountCredential({
        admin: params.admin,
        accountOwnerUserId,
      });
      if (credential && credential.accountSid === accountRef) {
        sendAuth = { accountSid: credential.accountSid, authToken: credential.authToken };
      }
    }

    // 2. Quiet hours in the account's business time zone
    const timeZone = await readAccountTimeZone({
      admin: params.admin,
      accountOwnerUserId,
    });

    if (!isWithinSmsSendWindow({ timeZone, now: params.now })) {
      return { attempted: false, outcome: "held_quiet_hours", detail: timeZone };
    }

    // 3. Read the intent's phone snapshot and re-check suppression at send time
    const intentResponse = await params.admin
      .from("sms_message_intents")
      .select("recipient_phone_snapshot, message_body_snapshot")
      .eq("id", smsMessageIntentId)
      .eq("account_owner_user_id", accountOwnerUserId)
      .maybeSingle();

    if (intentResponse?.error) {
      throw intentResponse.error;
    }

    const recipientPhone = asTrimmed(intentResponse?.data?.recipient_phone_snapshot);
    const messageBody = asTrimmed(intentResponse?.data?.message_body_snapshot);
    if (!recipientPhone || !messageBody) {
      return { attempted: false, outcome: "blocked", detail: "intent_snapshot_missing" };
    }

    const suppressed = await hasActiveSuppressionForPhone({
      admin: params.admin,
      accountOwnerUserId,
      phoneE164: recipientPhone,
    });

    if (suppressed) {
      return { attempted: false, outcome: "suppressed" };
    }

    // 4. Create (or dedupe onto) the delivery row via the standard preflight
    const preflight = await prepareSmsProviderDeliveryPreflight({
      supabase: params.admin,
      accountOwnerUserId,
      smsMessageIntentId,
    });

    const deliveryId = asTrimmed(preflight.deliveryId);
    if (!deliveryId) {
      return {
        attempted: false,
        outcome: "blocked",
        detail: preflight.blockedReasons.join(","),
      };
    }

    // 5. Guarded reservation — exactly one submit per delivery, ever
    const nowIso = (params.now ?? new Date()).toISOString();
    const reserveResponse = await params.admin
      .from("sms_provider_deliveries")
      .update({ provider_status: "submitted", submitted_at: nowIso })
      .eq("id", deliveryId)
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("provider_status", "not_submitted")
      .is("provider_message_id", null)
      .select("id");

    if (reserveResponse?.error) {
      throw reserveResponse.error;
    }

    const reservedRows = Array.isArray(reserveResponse?.data) ? reserveResponse.data : [];
    if (reservedRows.length === 0) {
      return { attempted: false, outcome: "already_handled", deliveryId };
    }

    // 6. Provider submit
    try {
      const result = await sendTwilioSandboxMessage({
        to: recipientPhone,
        body: messageBody,
        messagingServiceSid: liveConfig.messagingServiceSid!,
        ...(sendAuth ?? {}),
      });

      const postNow = new Date().toISOString();
      await params.admin
        .from("sms_provider_deliveries")
        .update({
          provider_message_id: result.messageSid,
          provider_raw_status: result.status,
          provider_status: normalizeTwilioStatus(result.status),
          provider_last_event_at: postNow,
        })
        .eq("id", deliveryId)
        .eq("account_owner_user_id", accountOwnerUserId);

      return { attempted: true, outcome: "sent_to_provider", deliveryId };
    } catch (providerError) {
      const postNow = new Date().toISOString();
      const errorCode =
        providerError instanceof TwilioMessageError && providerError.code != null
          ? String(providerError.code)
          : null;
      const errorMessage =
        providerError instanceof TwilioMessageError ? providerError.message : "Provider error";

      try {
        await params.admin
          .from("sms_provider_deliveries")
          .update({
            provider_status: "failed",
            failed_at: postNow,
            provider_last_event_at: postNow,
            ...(errorCode != null ? { provider_error_code: errorCode } : {}),
            provider_error_message: errorMessage,
          })
          .eq("id", deliveryId)
          .eq("account_owner_user_id", accountOwnerUserId);
      } catch {
        // best-effort failure record
      }

      return { attempted: true, outcome: "provider_immediate_failure", deliveryId };
    }
  } catch (error) {
    return {
      attempted: false,
      outcome: "error",
      detail: error instanceof Error ? error.message : "unknown_error",
    };
  }
}
