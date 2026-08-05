/**
 * Twilio status callback processor — server-only (F6D).
 *
 * Applies a provider status callback to the matching `sms_provider_deliveries`
 * row. Account scope is resolved from the delivery row found by MessageSid —
 * callback payload values are never trusted as account identifiers.
 *
 * Idempotency: statuses only move forward. Duplicate callbacks re-apply the
 * same values; out-of-order callbacks for earlier statuses are ignored.
 * This processor never mutates jobs, job_events, or sms_message_intents.
 */

type SupabaseLike = {
  from(table: string): any;
};

export type TwilioStatusCallbackOutcome =
  | "updated"
  | "ignored_missing_fields"
  | "ignored_unknown_message"
  | "ignored_stale_status";

export type ProcessTwilioStatusCallbackResult = {
  outcome: TwilioStatusCallbackOutcome;
  deliveryId?: string;
  normalizedStatus?: string;
};

/** Twilio MessageStatus -> normalized sms_provider_deliveries.provider_status */
const TWILIO_STATUS_NORMALIZATION: Record<string, string> = {
  accepted: "submitted",
  scheduled: "submitted",
  queued: "queued",
  sending: "queued",
  sent: "sent",
  delivered: "delivered",
  read: "delivered",
  undelivered: "undelivered",
  failed: "failed",
  canceled: "failed",
};

/**
 * Forward-only ordering. A callback only applies when its normalized status
 * ranks at or above the stored one, so late-arriving earlier statuses never
 * regress delivery truth.
 */
const PROVIDER_STATUS_RANK: Record<string, number> = {
  not_submitted: 0,
  unknown: 0,
  submitted: 1,
  queued: 2,
  sent: 3,
  blocked: 4,
  undelivered: 4,
  failed: 4,
  delivered: 5,
};

const SNAPSHOT_ALLOWED_KEYS = [
  "MessageSid",
  "MessageStatus",
  "SmsStatus",
  "ErrorCode",
  "ApiVersion",
  "MessagingServiceSid",
] as const;

function asTrimmed(value: unknown): string {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

function sanitizeProviderText(value: string): string {
  return value.replace(/AC[a-f0-9]{32}/gi, "[redacted]").slice(0, 200);
}

function buildSafeSnapshot(params: Record<string, string>, receivedAt: string) {
  const snapshot: Record<string, string> = { received_at: receivedAt };
  for (const key of SNAPSHOT_ALLOWED_KEYS) {
    const value = asTrimmed(params[key]);
    if (value) {
      snapshot[key] = sanitizeProviderText(value);
    }
  }
  return snapshot;
}

export async function processTwilioStatusCallback(input: {
  admin: SupabaseLike;
  params: Record<string, string>;
  now?: string;
}): Promise<ProcessTwilioStatusCallbackResult> {
  const messageSid = asTrimmed(input.params.MessageSid ?? input.params.SmsSid);
  const rawStatus = asTrimmed(input.params.MessageStatus ?? input.params.SmsStatus).toLowerCase();

  if (!messageSid || !rawStatus) {
    return { outcome: "ignored_missing_fields" };
  }

  const deliveryResponse = await input.admin
    .from("sms_provider_deliveries")
    .select("id, account_owner_user_id, provider_status, sent_at, delivered_at, failed_at")
    .eq("provider_name", "twilio")
    .eq("provider_message_id", messageSid)
    .maybeSingle();

  if (deliveryResponse?.error) {
    throw deliveryResponse.error;
  }

  const delivery = deliveryResponse?.data as
    | {
        id: string;
        account_owner_user_id: string;
        provider_status: string;
        sent_at: string | null;
        delivered_at: string | null;
        failed_at: string | null;
      }
    | null;

  if (!delivery) {
    return { outcome: "ignored_unknown_message" };
  }

  const normalizedStatus = TWILIO_STATUS_NORMALIZATION[rawStatus] ?? "unknown";
  const currentRank = PROVIDER_STATUS_RANK[asTrimmed(delivery.provider_status)] ?? 0;
  const incomingRank = PROVIDER_STATUS_RANK[normalizedStatus] ?? 0;

  if (incomingRank < currentRank) {
    return {
      outcome: "ignored_stale_status",
      deliveryId: delivery.id,
      normalizedStatus,
    };
  }

  const now = asTrimmed(input.now) || new Date().toISOString();

  const update: Record<string, unknown> = {
    provider_status: normalizedStatus,
    provider_raw_status: rawStatus,
    provider_last_event_at: now,
    provider_callback_payload_snapshot: buildSafeSnapshot(input.params, now),
  };

  if ((normalizedStatus === "sent" || normalizedStatus === "delivered") && !delivery.sent_at) {
    update.sent_at = now;
  }

  if (normalizedStatus === "delivered" && !delivery.delivered_at) {
    update.delivered_at = now;
  }

  if ((normalizedStatus === "failed" || normalizedStatus === "undelivered") && !delivery.failed_at) {
    update.failed_at = now;
  }

  const errorCode = asTrimmed(input.params.ErrorCode);
  if (errorCode && (normalizedStatus === "failed" || normalizedStatus === "undelivered")) {
    update.provider_error_code = sanitizeProviderText(errorCode);
    const errorMessage = asTrimmed(input.params.ErrorMessage);
    if (errorMessage) {
      update.provider_error_message = sanitizeProviderText(errorMessage);
    }
  }

  const updateResponse = await input.admin
    .from("sms_provider_deliveries")
    .update(update)
    .eq("id", delivery.id)
    .eq("account_owner_user_id", delivery.account_owner_user_id)
    .eq("provider_message_id", messageSid);

  if (updateResponse?.error) {
    throw updateResponse.error;
  }

  return {
    outcome: "updated",
    deliveryId: delivery.id,
    normalizedStatus,
  };
}
