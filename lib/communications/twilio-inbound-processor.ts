/**
 * Twilio inbound message processor — server-only (F6D).
 *
 * Handles inbound SMS to a tenant's Twilio number. The tenant account is
 * resolved by matching the inbound `To` number against
 * `sms_sender_identities.phone_e164` — payload values are never trusted as
 * account identifiers.
 *
 * STOP keywords write a phone-level `contact_recipient_suppressions` row
 * (the app-side hard stop the eligibility gates already read). START does not
 * auto-lift local suppression: the schema requires a lifting user, so opt-back-in
 * stays a deliberate manual admin action — the failure direction is "don't send".
 * HELP is acknowledged with no local write; auto-replies for STOP/HELP are left
 * to the provider's Advanced Opt-Out handling so this route never double-replies.
 */

type SupabaseLike = {
  from(table: string): any;
};

export type TwilioInboundOutcome =
  | "stop_recorded"
  | "stop_already_recorded"
  | "start_received_no_auto_lift"
  | "help_received"
  | "ignored_non_keyword"
  | "ignored_missing_fields"
  | "ignored_no_account_match";

export type ProcessTwilioInboundResult = {
  outcome: TwilioInboundOutcome;
  accountOwnerUserId?: string;
};

const STOP_KEYWORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
const START_KEYWORDS = new Set(["start", "unstop", "yes"]);
const HELP_KEYWORDS = new Set(["help", "info"]);

function asTrimmed(value: unknown): string {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

function isUniqueViolation(error: any): boolean {
  return asTrimmed(error?.code) === "23505";
}

function normalizeKeyword(body: string): string {
  // Twilio matches opt-out keywords as a single word, case-insensitive.
  return body.trim().toLowerCase().replace(/[.!]+$/, "");
}

async function resolveAccountOwnerBySenderPhone(params: {
  admin: SupabaseLike;
  senderPhoneE164: string;
}): Promise<string | null> {
  const response = await params.admin
    .from("sms_sender_identities")
    .select("account_owner_user_id")
    .eq("phone_e164", params.senderPhoneE164)
    .limit(1);

  if (response?.error) {
    throw response.error;
  }

  const rows = Array.isArray(response?.data) ? response.data : [];
  const accountOwnerUserId = asTrimmed(rows[0]?.account_owner_user_id);
  return accountOwnerUserId || null;
}

export async function processTwilioInboundMessage(input: {
  admin: SupabaseLike;
  params: Record<string, string>;
  now?: string;
}): Promise<ProcessTwilioInboundResult> {
  const fromPhone = asTrimmed(input.params.From);
  const toPhone = asTrimmed(input.params.To);
  const body = asTrimmed(input.params.Body);
  const messageSid = asTrimmed(input.params.MessageSid ?? input.params.SmsSid);

  if (!fromPhone || !toPhone) {
    return { outcome: "ignored_missing_fields" };
  }

  const keyword = normalizeKeyword(body);
  const isStop = STOP_KEYWORDS.has(keyword);
  const isStart = START_KEYWORDS.has(keyword);
  const isHelp = HELP_KEYWORDS.has(keyword);

  if (!isStop && !isStart && !isHelp) {
    return { outcome: "ignored_non_keyword" };
  }

  const accountOwnerUserId = await resolveAccountOwnerBySenderPhone({
    admin: input.admin,
    senderPhoneE164: toPhone,
  });

  if (!accountOwnerUserId) {
    return { outcome: "ignored_no_account_match" };
  }

  if (isStart) {
    return { outcome: "start_received_no_auto_lift", accountOwnerUserId };
  }

  if (isHelp) {
    return { outcome: "help_received", accountOwnerUserId };
  }

  const now = asTrimmed(input.now) || new Date().toISOString();

  const insertResponse = await input.admin.from("contact_recipient_suppressions").insert({
    account_owner_user_id: accountOwnerUserId,
    phone_e164: fromPhone,
    suppression_type: "stop_keyword",
    suppression_reason: "Inbound STOP keyword received by provider webhook",
    source: "inbound_stop",
    is_active: true,
    suppressed_at: now,
    provider_name: "twilio",
    provider_message_id: messageSid || null,
    received_keyword: keyword.slice(0, 40),
  });

  if (insertResponse?.error) {
    if (isUniqueViolation(insertResponse.error)) {
      // An active stop_keyword suppression already exists for this phone.
      return { outcome: "stop_already_recorded", accountOwnerUserId };
    }
    throw insertResponse.error;
  }

  return { outcome: "stop_recorded", accountOwnerUserId };
}
