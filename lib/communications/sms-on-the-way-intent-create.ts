import {
  evaluateOnTheWayIntentEligibility,
  type OnTheWayIntentDecisionStatus,
  type OnTheWayIntentEligibilityResult,
} from "@/lib/communications/sms-on-the-way-intent-eligibility";
import { getSmsEligibilityInputsForRecipient } from "@/lib/communications/sms-eligibility-inputs-read";
import { renderOnTheWayMessageBody } from "@/lib/communications/sms-on-the-way-token-renderer";

type SupabaseLike = {
  from(table: string): any;
};

const ON_THE_WAY_MESSAGE_CLASS = "on_the_way" as const;
const ON_THE_WAY_TEMPLATE_KEY = "on_the_way" as const;
// v2: rows written after real-token rendering carry actual customer/tech/company/appointment
// values in message_body_snapshot (v1 stored the sample-preview placeholder text).
const DECISION_POLICY_VERSION = "f5c-b-on-the-way-intent-create-v2-real-tokens";

export type CreateOnTheWayIntentFromEventParams = {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
  actingUserId: string | null | undefined;
  jobId: string | null | undefined;
  jobEventId: string | null | undefined;
  now?: Date;
  // Real token values for message-body rendering. Optional — when absent, the helper
  // falls back to the eligibility sample preview (backward compatible with other callers).
  tokenValues?: {
    recipientFirstName?: string | null;
    operatorOrTechName?: string | null;
    companyName?: string | null;
    appointmentOrJobContext?: string | null;
  };
};

export type CreateOnTheWayIntentFromEventResult = {
  created: boolean;
  deduped: boolean;
  intentId?: string;
  decisionStatus: OnTheWayIntentDecisionStatus;
  decisionOutcomeWritten?: "ready_for_provider" | "blocked";
  blockedReasons: string[];
  warnings: string[];
  writeSkippedReason?: string;
  liveSendEnabled: false;
};

function asTrimmed(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => asTrimmed(value)).filter(Boolean)));
}

function hasBlockedReason(result: OnTheWayIntentEligibilityResult, reason: string) {
  return result.blockedReasons.some((item) => asTrimmed(item) === reason);
}

function mapConsentDecision(consentStatus: string) {
  const normalized = asTrimmed(consentStatus).toLowerCase();
  if (
    normalized === "missing" ||
    normalized === "unknown" ||
    normalized === "opted_in" ||
    normalized === "opted_out" ||
    normalized === "revoked"
  ) {
    return normalized;
  }

  return "unknown";
}

function mapSuppressionDecision(input: {
  activeRecipientSuppressionFound: boolean;
  activePhoneSuppressionFound: boolean;
}) {
  if (input.activeRecipientSuppressionFound && input.activePhoneSuppressionFound) {
    return "active_both";
  }

  if (input.activeRecipientSuppressionFound) {
    return "active_recipient";
  }

  if (input.activePhoneSuppressionFound) {
    return "active_phone";
  }

  return "none_active";
}

function isIdempotencyConflict(error: any) {
  const code = asTrimmed(error?.code);
  if (code === "23505") {
    return true;
  }

  const message = asTrimmed(error?.message).toLowerCase();
  return message.includes("sms_message_intents_account_idempotency_uidx") || message.includes("idempotency");
}

async function insertIntentRow(params: {
  supabase: SupabaseLike;
  payload: Record<string, unknown>;
}) {
  try {
    const response = await params.supabase
      .from("sms_message_intents")
      .insert(params.payload)
      .select("id")
      .single();

    if (response?.error) {
      if (isIdempotencyConflict(response.error)) {
        return {
          created: false,
          deduped: true,
          intentId: undefined as string | undefined,
        };
      }
      throw response.error;
    }

    return {
      created: true,
      deduped: false,
      intentId: asTrimmed(response?.data?.id) || undefined,
    };
  } catch (error) {
    if (isIdempotencyConflict(error)) {
      return {
        created: false,
        deduped: true,
        intentId: undefined as string | undefined,
      };
    }
    throw error;
  }
}

function writeSkippedResult(input: {
  eligibility: OnTheWayIntentEligibilityResult;
  writeSkippedReason: string;
}): CreateOnTheWayIntentFromEventResult {
  return {
    created: false,
    deduped: false,
    decisionStatus: input.eligibility.decisionStatus,
    blockedReasons: uniqueStrings(input.eligibility.blockedReasons),
    warnings: uniqueStrings(input.eligibility.warnings),
    writeSkippedReason: input.writeSkippedReason,
    liveSendEnabled: false,
  };
}

export async function createOnTheWayIntentFromEvent(
  params: CreateOnTheWayIntentFromEventParams,
): Promise<CreateOnTheWayIntentFromEventResult> {
  const accountOwnerUserId = asTrimmed(params.accountOwnerUserId);
  const actingUserId = asTrimmed(params.actingUserId) || null;
  const jobId = asTrimmed(params.jobId);
  const jobEventId = asTrimmed(params.jobEventId);

  const eligibility = await evaluateOnTheWayIntentEligibility({
    supabase: params.supabase,
    accountOwnerUserId,
    jobId,
    jobEventId,
    now: params.now,
  });

  if (eligibility.decisionStatus === "skipped") {
    return writeSkippedResult({
      eligibility,
      writeSkippedReason: "skipped_non_target_event",
    });
  }

  if (
    hasBlockedReason(eligibility, "missing_job_event_id") ||
    hasBlockedReason(eligibility, "job_event_not_found") ||
    !asTrimmed(eligibility.jobEventId)
  ) {
    return writeSkippedResult({
      eligibility,
      writeSkippedReason: "missing_durable_event_anchor",
    });
  }

  const contactRecipientId = asTrimmed(eligibility.recipientRef);
  if (!contactRecipientId) {
    return writeSkippedResult({
      eligibility,
      writeSkippedReason: "missing_recipient_truth",
    });
  }

  const templateVersion =
    eligibility.templateVersion === undefined || eligibility.templateVersion === null
      ? ""
      : asTrimmed(String(eligibility.templateVersion));

  if (!templateVersion) {
    return writeSkippedResult({
      eligibility,
      writeSkippedReason: "missing_template_version",
    });
  }

  // Default to the eligibility sample preview (placeholder text). When real token values
  // and the raw template body are available on a ready decision, render the real body.
  let messageBodySnapshot = asTrimmed(eligibility.messageBodySnapshot);

  if (
    params.tokenValues &&
    asTrimmed(eligibility.bodyTemplate) &&
    eligibility.decisionStatus === "ready"
  ) {
    const rendered = asTrimmed(
      renderOnTheWayMessageBody(String(eligibility.bodyTemplate), {
        recipientFirstName: asTrimmed(params.tokenValues.recipientFirstName) || "there",
        operatorOrTechName: asTrimmed(params.tokenValues.operatorOrTechName) || "your technician",
        companyName: asTrimmed(params.tokenValues.companyName) || "our team",
        appointmentOrJobContext:
          asTrimmed(params.tokenValues.appointmentOrJobContext) || "your service appointment",
      }),
    );

    if (rendered) {
      messageBodySnapshot = rendered;
    }
  }

  if (!messageBodySnapshot) {
    return writeSkippedResult({
      eligibility,
      writeSkippedReason: "missing_message_body_snapshot",
    });
  }

  const eligibilityInputs = await getSmsEligibilityInputsForRecipient({
    supabase: params.supabase,
    accountOwnerUserId,
    contactRecipientId,
    messageClass: ON_THE_WAY_MESSAGE_CLASS,
  });

  const recipientPhoneSnapshot = asTrimmed(eligibilityInputs.phoneE164);
  if (!recipientPhoneSnapshot) {
    return writeSkippedResult({
      eligibility,
      writeSkippedReason: "missing_recipient_phone_snapshot",
    });
  }

  const recipientRoleSnapshot = asTrimmed(eligibilityInputs.recipientRole);
  if (!recipientRoleSnapshot) {
    return writeSkippedResult({
      eligibility,
      writeSkippedReason: "missing_recipient_role_snapshot",
    });
  }

  const consentDecision = mapConsentDecision(eligibilityInputs.consentStatus);
  const suppressionDecision = mapSuppressionDecision({
    activeRecipientSuppressionFound: eligibilityInputs.activeRecipientSuppressionFound,
    activePhoneSuppressionFound: eligibilityInputs.activePhoneSuppressionFound,
  });

  const blockedReasons = uniqueStrings(eligibility.blockedReasons);
  const decisionOutcome = eligibility.decisionStatus === "ready" ? "ready_for_provider" : "blocked";

  if (decisionOutcome === "blocked" && blockedReasons.length === 0) {
    return writeSkippedResult({
      eligibility,
      writeSkippedReason: "missing_required_schema_fields",
    });
  }

  const idempotencyKey = `${accountOwnerUserId}:${eligibility.jobEventId}:${ON_THE_WAY_MESSAGE_CLASS}:${contactRecipientId}`;

  const { created, deduped, intentId } = await insertIntentRow({
    supabase: params.supabase,
    payload: {
      account_owner_user_id: accountOwnerUserId,
      job_id: asTrimmed(eligibility.jobId) || null,
      job_event_id: asTrimmed(eligibility.jobEventId),
      contact_recipient_id: contactRecipientId,
      message_class: ON_THE_WAY_MESSAGE_CLASS,
      template_key: ON_THE_WAY_TEMPLATE_KEY,
      template_version: templateVersion,
      message_body_snapshot: messageBodySnapshot,
      send_requested_by_user_id: actingUserId,
      send_requested_at: (params.now ?? new Date()).toISOString(),
      recipient_phone_snapshot: recipientPhoneSnapshot,
      recipient_role_snapshot: recipientRoleSnapshot,
      consent_decision: consentDecision,
      suppression_decision: suppressionDecision,
      quiet_hours_decision: "not_checked",
      decision_outcome: decisionOutcome,
      blocked_reason_codes: decisionOutcome === "blocked" ? blockedReasons : [],
      decision_policy_version: DECISION_POLICY_VERSION,
      sender_identity_ref: null,
      idempotency_key: idempotencyKey,
    },
  });

  return {
    created,
    deduped,
    intentId,
    decisionStatus: eligibility.decisionStatus,
    decisionOutcomeWritten: decisionOutcome,
    blockedReasons,
    warnings: uniqueStrings(eligibility.warnings),
    liveSendEnabled: false,
  };
}
