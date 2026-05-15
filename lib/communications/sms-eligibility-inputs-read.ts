type SupabaseLike = {
  from(table: string): any;
};

export const SMS_ALLOWED_MESSAGE_CLASSES = [
  "scheduling",
  "on_the_way",
  "appointment_reminder",
  "access_coordination",
  "follow_up_no_answer",
  "completion_notice",
  "invoice_ready_notice",
  "marketing_promotional",
] as const;

export type SmsMessageClass = (typeof SMS_ALLOWED_MESSAGE_CLASSES)[number];

export const SMS_NON_SENDING_BLOCKED_REASONS = [
  "scope_missing",
  "recipient_not_found",
  "recipient_inactive",
  "recipient_archived",
  "recipient_missing_phone",
  "suppression_active_recipient",
  "suppression_active_phone",
  "consent_missing",
  "consent_unknown",
  "consent_opted_out",
  "consent_revoked",
  "message_class_invalid_or_unsupported",
] as const;

export type SmsNonSendingBlockedReason = (typeof SMS_NON_SENDING_BLOCKED_REASONS)[number];

export type SmsNonSendingStatus = "not_found" | "blocked" | "eligible_inputs_present";

export type SmsEligibilityRecipientStatus = "active" | "inactive" | "archived" | "unknown";

export type SmsEligibilityConsentStatus =
  | "missing"
  | "unknown"
  | "opted_in"
  | "opted_out"
  | "revoked";

export type SmsEligibilityInputsReadResult = {
  accountOwnerUserId: string;
  contactRecipientId: string;
  messageClass: string;
  recipientFound: boolean;
  recipientStatus: SmsEligibilityRecipientStatus;
  recipientRole: string | null;
  phoneE164: string | null;
  consentFound: boolean;
  consentStatus: SmsEligibilityConsentStatus;
  activeRecipientSuppressionFound: boolean;
  activePhoneSuppressionFound: boolean;
  suppressionTypes: string[];
  nonSendingStatus: SmsNonSendingStatus;
  blockedReasons: SmsNonSendingBlockedReason[];
};

export type GetSmsEligibilityInputsForRecipientParams = {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
  contactRecipientId: string | null | undefined;
  messageClass: string | null | undefined;
};

function asTrimmed(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

function asOptionalTrimmed(value: unknown) {
  const text = asTrimmed(value);
  return text || null;
}

function asRecipientStatus(value: unknown): SmsEligibilityRecipientStatus {
  const normalized = asTrimmed(value).toLowerCase();
  if (normalized === "active" || normalized === "inactive" || normalized === "archived") {
    return normalized;
  }
  return "unknown";
}

function asConsentStatus(value: unknown): SmsEligibilityConsentStatus {
  const normalized = asTrimmed(value).toLowerCase();
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

function uniqueNonEmpty(values: string[]) {
  return Array.from(new Set(values.map((value) => asTrimmed(value)).filter(Boolean)));
}

function emptyResult(input: {
  accountOwnerUserId: string;
  contactRecipientId: string;
  messageClass: string;
}): SmsEligibilityInputsReadResult {
  return {
    accountOwnerUserId: input.accountOwnerUserId,
    contactRecipientId: input.contactRecipientId,
    messageClass: input.messageClass,
    recipientFound: false,
    recipientStatus: "unknown",
    recipientRole: null,
    phoneE164: null,
    consentFound: false,
    consentStatus: "missing",
    activeRecipientSuppressionFound: false,
    activePhoneSuppressionFound: false,
    suppressionTypes: [],
    nonSendingStatus: "blocked",
    blockedReasons: [],
  };
}

export async function getSmsEligibilityInputsForRecipient(
  params: GetSmsEligibilityInputsForRecipientParams,
): Promise<SmsEligibilityInputsReadResult> {
  const accountOwnerUserId = asTrimmed(params.accountOwnerUserId);
  const contactRecipientId = asTrimmed(params.contactRecipientId);
  const messageClass = asTrimmed(params.messageClass).toLowerCase();

  const result = emptyResult({
    accountOwnerUserId,
    contactRecipientId,
    messageClass,
  });

  if (!accountOwnerUserId) {
    result.blockedReasons = ["scope_missing"];
    return result;
  }

  if (!SMS_ALLOWED_MESSAGE_CLASSES.includes(messageClass as SmsMessageClass)) {
    result.blockedReasons = ["message_class_invalid_or_unsupported"];
    return result;
  }

  if (!contactRecipientId) {
    result.nonSendingStatus = "not_found";
    result.blockedReasons = ["recipient_not_found"];
    return result;
  }

  const recipientQuery = params.supabase
    .from("contact_recipients")
    .select("id, status, recipient_role, phone_e164")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("id", contactRecipientId)
    .limit(1);

  const { data: recipientRows, error: recipientError } = await recipientQuery;
  if (recipientError) throw recipientError;

  const recipientRow = Array.isArray(recipientRows) ? recipientRows[0] : null;
  if (!recipientRow) {
    result.nonSendingStatus = "not_found";
    result.blockedReasons = ["recipient_not_found"];
    return result;
  }

  result.recipientFound = true;
  result.recipientStatus = asRecipientStatus(recipientRow.status);
  result.recipientRole = asOptionalTrimmed(recipientRow.recipient_role);
  result.phoneE164 = asOptionalTrimmed(recipientRow.phone_e164);

  if (result.recipientStatus === "inactive") {
    result.blockedReasons = ["recipient_inactive"];
    return result;
  }

  if (result.recipientStatus === "archived") {
    result.blockedReasons = ["recipient_archived"];
    return result;
  }

  if (!result.phoneE164) {
    result.blockedReasons = ["recipient_missing_phone"];
    return result;
  }

  const recipientSuppressionQuery = params.supabase
    .from("contact_recipient_suppressions")
    .select("suppression_type")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("is_active", true)
    .eq("contact_recipient_id", contactRecipientId);

  const phoneSuppressionQuery = params.supabase
    .from("contact_recipient_suppressions")
    .select("suppression_type")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("is_active", true)
    .eq("phone_e164", result.phoneE164);

  const consentQuery = params.supabase
    .from("contact_recipient_consents")
    .select("consent_status")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("contact_recipient_id", contactRecipientId)
    .eq("message_class", messageClass)
    .limit(1);

  const [recipientSuppressionResult, phoneSuppressionResult, consentResult] = await Promise.all([
    recipientSuppressionQuery,
    phoneSuppressionQuery,
    consentQuery,
  ]);

  if (recipientSuppressionResult?.error) throw recipientSuppressionResult.error;
  if (phoneSuppressionResult?.error) throw phoneSuppressionResult.error;
  if (consentResult?.error) throw consentResult.error;

  const recipientSuppressionRows = Array.isArray(recipientSuppressionResult?.data)
    ? recipientSuppressionResult.data
    : [];
  const phoneSuppressionRows = Array.isArray(phoneSuppressionResult?.data)
    ? phoneSuppressionResult.data
    : [];

  result.activeRecipientSuppressionFound = recipientSuppressionRows.length > 0;
  result.activePhoneSuppressionFound = phoneSuppressionRows.length > 0;
  result.suppressionTypes = uniqueNonEmpty([
    ...recipientSuppressionRows.map((row: any) => asTrimmed(row?.suppression_type)),
    ...phoneSuppressionRows.map((row: any) => asTrimmed(row?.suppression_type)),
  ]);

  const blockedReasons: SmsNonSendingBlockedReason[] = [];
  if (result.activeRecipientSuppressionFound) {
    blockedReasons.push("suppression_active_recipient");
  }
  if (result.activePhoneSuppressionFound) {
    blockedReasons.push("suppression_active_phone");
  }

  const consentRows = Array.isArray(consentResult?.data) ? consentResult.data : [];
  const consentRow = consentRows[0] ?? null;
  if (!consentRow) {
    result.consentFound = false;
    result.consentStatus = "missing";
    blockedReasons.push("consent_missing");
  } else {
    result.consentFound = true;
    result.consentStatus = asConsentStatus(consentRow.consent_status);
    if (result.consentStatus === "unknown") blockedReasons.push("consent_unknown");
    if (result.consentStatus === "opted_out") blockedReasons.push("consent_opted_out");
    if (result.consentStatus === "revoked") blockedReasons.push("consent_revoked");
  }

  result.blockedReasons = blockedReasons;
  result.nonSendingStatus = blockedReasons.length > 0 ? "blocked" : "eligible_inputs_present";
  return result;
}
