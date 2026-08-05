/**
 * Sandbox send queue read model for the Admin Communications page — read-only.
 *
 * Lists recent On-The-Way message intents with their provider delivery state so
 * an admin can walk an intent through prepare -> dry run -> sandbox submit.
 * Output is browser-safe: phone numbers are masked to last-4 and no provider
 * refs/secrets are returned.
 */

type SupabaseLike = {
  from(table: string): any;
};

export type SmsSandboxQueueDelivery = {
  deliveryId: string;
  providerStatus: string;
  providerStatusLabel: string;
  hasProviderMessageId: boolean;
  submittedAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  providerErrorCode: string | null;
  lastEventAt: string | null;
};

export type SmsSandboxQueueIntent = {
  intentId: string;
  createdAt: string | null;
  decisionOutcome: string;
  decisionOutcomeLabel: string;
  maskedRecipientPhone: string;
  templateKey: string;
  templateVersion: string;
  blockedReasonCodes: string[];
  canPrepareDelivery: boolean;
  delivery: SmsSandboxQueueDelivery | null;
};

export type SmsSandboxQueueResult = {
  hasIntents: boolean;
  intents: SmsSandboxQueueIntent[];
};

const INTENT_LIMIT = 15;

const PROVIDER_STATUS_LABELS: Record<string, string> = {
  not_submitted: "Prepared (not submitted)",
  queued: "Queued by provider",
  submitted: "Sandbox submit attempted",
  sent: "Accepted by carrier",
  delivered: "Delivered (callback confirmed)",
  failed: "Failed",
  undelivered: "Undelivered",
  blocked: "Blocked",
  unknown: "Unknown",
};

const DECISION_OUTCOME_LABELS: Record<string, string> = {
  ready_for_provider: "Ready for provider",
  blocked: "Blocked",
  skipped: "Skipped",
};

function asTrimmed(value: unknown): string {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

function maskPhone(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  if (digits.length < 4) {
    return phoneE164 ? "•••" : "No phone";
  }
  return `•••-${digits.slice(-4)}`;
}

function emptyResult(): SmsSandboxQueueResult {
  return { hasIntents: false, intents: [] };
}

export async function getSmsSandboxQueueForAccount(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
}): Promise<SmsSandboxQueueResult> {
  const accountOwnerUserId = asTrimmed(params.accountOwnerUserId);
  if (!accountOwnerUserId) {
    return emptyResult();
  }

  const intentResponse = await params.supabase
    .from("sms_message_intents")
    .select(
      "id, created_at, decision_outcome, recipient_phone_snapshot, template_key, template_version, blocked_reason_codes",
    )
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("message_class", "on_the_way")
    .order("created_at", { ascending: false })
    .limit(INTENT_LIMIT);

  if (intentResponse?.error) {
    throw intentResponse.error;
  }

  const intentRows: any[] = Array.isArray(intentResponse?.data) ? intentResponse.data : [];
  if (intentRows.length === 0) {
    return emptyResult();
  }

  const intentIds = intentRows.map((row) => asTrimmed(row?.id)).filter(Boolean);

  const deliveryResponse = await params.supabase
    .from("sms_provider_deliveries")
    .select(
      "id, sms_message_intent_id, provider_status, provider_message_id, provider_error_code, provider_last_event_at, submitted_at, sent_at, delivered_at, failed_at",
    )
    .eq("account_owner_user_id", accountOwnerUserId)
    .in("sms_message_intent_id", intentIds);

  if (deliveryResponse?.error) {
    throw deliveryResponse.error;
  }

  const deliveryRows: any[] = Array.isArray(deliveryResponse?.data) ? deliveryResponse.data : [];
  const deliveriesByIntentId = new Map<string, any>();
  for (const row of deliveryRows) {
    const intentId = asTrimmed(row?.sms_message_intent_id);
    if (intentId && !deliveriesByIntentId.has(intentId)) {
      deliveriesByIntentId.set(intentId, row);
    }
  }

  const intents: SmsSandboxQueueIntent[] = intentRows.map((row) => {
    const intentId = asTrimmed(row?.id);
    const decisionOutcome = asTrimmed(row?.decision_outcome) || "unknown";
    const deliveryRow = deliveriesByIntentId.get(intentId) ?? null;

    let delivery: SmsSandboxQueueDelivery | null = null;
    if (deliveryRow) {
      const providerStatus = asTrimmed(deliveryRow.provider_status) || "unknown";
      delivery = {
        deliveryId: asTrimmed(deliveryRow.id),
        providerStatus,
        providerStatusLabel: PROVIDER_STATUS_LABELS[providerStatus] ?? providerStatus,
        hasProviderMessageId: Boolean(asTrimmed(deliveryRow.provider_message_id)),
        submittedAt: asTrimmed(deliveryRow.submitted_at) || null,
        sentAt: asTrimmed(deliveryRow.sent_at) || null,
        deliveredAt: asTrimmed(deliveryRow.delivered_at) || null,
        failedAt: asTrimmed(deliveryRow.failed_at) || null,
        providerErrorCode: asTrimmed(deliveryRow.provider_error_code) || null,
        lastEventAt: asTrimmed(deliveryRow.provider_last_event_at) || null,
      };
    }

    const blockedReasonCodes = Array.isArray(row?.blocked_reason_codes)
      ? row.blocked_reason_codes.map((code: unknown) => asTrimmed(code)).filter(Boolean)
      : [];

    return {
      intentId,
      createdAt: asTrimmed(row?.created_at) || null,
      decisionOutcome,
      decisionOutcomeLabel: DECISION_OUTCOME_LABELS[decisionOutcome] ?? decisionOutcome,
      maskedRecipientPhone: maskPhone(asTrimmed(row?.recipient_phone_snapshot)),
      templateKey: asTrimmed(row?.template_key),
      templateVersion: asTrimmed(row?.template_version),
      blockedReasonCodes,
      canPrepareDelivery: decisionOutcome === "ready_for_provider" && !delivery,
      delivery,
    };
  });

  return { hasIntents: true, intents };
}
