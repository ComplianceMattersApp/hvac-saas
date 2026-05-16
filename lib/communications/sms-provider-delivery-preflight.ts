import type { OnTheWayIntentEligibilityResult } from "@/lib/communications/sms-on-the-way-intent-eligibility";

type SupabaseLike = {
  from(table: string): any;
};

export type PrepareSmsProviderDeliveryPreflightParams = {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
  smsMessageIntentId: string | null | undefined;
  actingUserId?: string | null | undefined;
};

export type PrepareSmsProviderDeliveryPreflightResult = {
  created: boolean;
  deduped: boolean;
  deliveryId?: string;
  readyForProviderSubmit: boolean;
  blockedReasons: string[];
  warnings: string[];
  providerName: "twilio";
  providerStatus?: "not_submitted";
  liveSendEnabled: false;
};

function asTrimmed(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => asTrimmed(value)).filter(Boolean)));
}

function isIdempotencyConflict(error: any) {
  const code = asTrimmed(error?.code);
  if (code === "23505") {
    return true;
  }

  const message = asTrimmed(error?.message).toLowerCase();
  return message.includes("sms_provider_deliveries") && (message.includes("idempotency") || message.includes("unique"));
}

async function readMessageIntent(params: {
  supabase: SupabaseLike;
  intentId: string;
  accountOwnerUserId: string;
}) {
  try {
    const response = await params.supabase
      .from("sms_message_intents")
      .select("*")
      .eq("id", params.intentId)
      .eq("account_owner_user_id", params.accountOwnerUserId)
      .maybeSingle();

    if (response?.error) {
      throw response.error;
    }

    return response?.data || null;
  } catch (error) {
    throw error;
  }
}

async function checkExistingDelivery(params: {
  supabase: SupabaseLike;
  intentId: string;
  accountOwnerUserId: string;
}) {
  try {
    const response = await params.supabase
      .from("sms_provider_deliveries")
      .select("id")
      .eq("sms_message_intent_id", params.intentId)
      .eq("account_owner_user_id", params.accountOwnerUserId)
      .maybeSingle();

    if (response?.error) {
      throw response.error;
    }

    return response?.data || null;
  } catch (error) {
    throw error;
  }
}

async function insertProviderDelivery(params: {
  supabase: SupabaseLike;
  payload: Record<string, unknown>;
}) {
  try {
    const response = await params.supabase
      .from("sms_provider_deliveries")
      .insert(params.payload)
      .select("id")
      .single();

    if (response?.error) {
      if (isIdempotencyConflict(response.error)) {
        return {
          created: false,
          deduped: true,
          deliveryId: undefined as string | undefined,
        };
      }
      throw response.error;
    }

    return {
      created: true,
      deduped: false,
      deliveryId: asTrimmed(response?.data?.id) || undefined,
    };
  } catch (error) {
    if (isIdempotencyConflict(error)) {
      return {
        created: false,
        deduped: true,
        deliveryId: undefined as string | undefined,
      };
    }
    throw error;
  }
}

function blockedResult(input: {
  blockedReasons: string[];
  warnings: string[];
}): PrepareSmsProviderDeliveryPreflightResult {
  return {
    created: false,
    deduped: false,
    readyForProviderSubmit: false,
    blockedReasons: uniqueStrings(input.blockedReasons),
    warnings: uniqueStrings(input.warnings),
    providerName: "twilio",
    liveSendEnabled: false,
  };
}

export async function prepareSmsProviderDeliveryPreflight(
  params: PrepareSmsProviderDeliveryPreflightParams,
): Promise<PrepareSmsProviderDeliveryPreflightResult> {
  const accountOwnerUserId = asTrimmed(params.accountOwnerUserId);
  const smsMessageIntentId = asTrimmed(params.smsMessageIntentId);

  if (!accountOwnerUserId) {
    return blockedResult({
      blockedReasons: ["missing_account_owner_user_id"],
      warnings: [],
    });
  }

  if (!smsMessageIntentId) {
    return blockedResult({
      blockedReasons: ["missing_sms_message_intent_id"],
      warnings: [],
    });
  }

  // Read the target intent row
  let intent: any;
  try {
    intent = await readMessageIntent({
      supabase: params.supabase,
      intentId: smsMessageIntentId,
      accountOwnerUserId,
    });
  } catch (error) {
    return blockedResult({
      blockedReasons: ["intent_read_failed"],
      warnings: [],
    });
  }

  if (!intent) {
    return blockedResult({
      blockedReasons: ["intent_not_found"],
      warnings: [],
    });
  }

  // Validate intent structure and readiness
  const messageClass = asTrimmed(intent.message_class);
  if (messageClass !== "on_the_way") {
    return blockedResult({
      blockedReasons: ["invalid_message_class"],
      warnings: [],
    });
  }

  const decisionOutcome = asTrimmed(intent.decision_outcome);
  if (decisionOutcome !== "ready_for_provider") {
    return blockedResult({
      blockedReasons: [`decision_outcome_not_ready: ${decisionOutcome}`],
      warnings: [],
    });
  }

  // At this point, decision_outcome is guaranteed to be "ready_for_provider"

  // Validate required snapshots
  const messageBodySnapshot = asTrimmed(intent.message_body_snapshot);
  if (!messageBodySnapshot) {
    return blockedResult({
      blockedReasons: ["missing_message_body_snapshot"],
      warnings: [],
    });
  }

  const contactRecipientId = asTrimmed(intent.contact_recipient_id);
  if (!contactRecipientId) {
    return blockedResult({
      blockedReasons: ["missing_contact_recipient_id"],
      warnings: [],
    });
  }

  const recipientPhoneSnapshot = asTrimmed(intent.recipient_phone_snapshot);
  if (!recipientPhoneSnapshot) {
    return blockedResult({
      blockedReasons: ["missing_recipient_phone_snapshot"],
      warnings: [],
    });
  }

  const templateKey = asTrimmed(intent.template_key);
  if (templateKey !== "on_the_way") {
    return blockedResult({
      blockedReasons: ["invalid_template_key"],
      warnings: [],
    });
  }

  const templateVersion = asTrimmed(String(intent.template_version ?? ""));
  if (!templateVersion) {
    return blockedResult({
      blockedReasons: ["missing_template_version"],
      warnings: [],
    });
  }

  const jobEventId = asTrimmed(intent.job_event_id);
  if (!jobEventId) {
    return blockedResult({
      blockedReasons: ["missing_job_event_id"],
      warnings: [],
    });
  }

  // Check for existing delivery (deduplication)
  let existingDelivery: any;
  try {
    existingDelivery = await checkExistingDelivery({
      supabase: params.supabase,
      intentId: smsMessageIntentId,
      accountOwnerUserId,
    });
  } catch (error) {
    return blockedResult({
      blockedReasons: ["existing_delivery_check_failed"],
      warnings: [],
    });
  }

  if (existingDelivery) {
    return {
      created: false,
      deduped: true,
      deliveryId: asTrimmed(existingDelivery.id) || undefined,
      readyForProviderSubmit: true,
      blockedReasons: [],
      warnings: [],
      providerName: "twilio",
      providerStatus: "not_submitted",
      liveSendEnabled: false,
    };
  }

  // Insert provider delivery row
  const { created, deduped, deliveryId } = await insertProviderDelivery({
    supabase: params.supabase,
    payload: {
      account_owner_user_id: accountOwnerUserId,
      sms_message_intent_id: smsMessageIntentId,
      provider_name: "twilio",
      provider_status: "not_submitted",
      // Do not set provider_message_id (null until real send)
      // Do not set submitted_at (null until real submit)
      // Do not set sent/delivered/failed status (null until real feedback)
    },
  });

  return {
    created,
    deduped,
    deliveryId,
    readyForProviderSubmit: created || deduped,
    blockedReasons: [],
    warnings: [],
    providerName: "twilio",
    providerStatus: "not_submitted",
    liveSendEnabled: false,
  };
}
