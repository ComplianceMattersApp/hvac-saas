/**
 * The account's REAL SMS activation and readiness state, read from the row.
 *
 * Exists because `sms-provider-readiness-read.ts` returns an `activationSummary`
 * whose type is the literal `"disabled"` — it can never report anything else,
 * which is why a live account's page says "SMS is not enabled". Anything that
 * needs to branch on whether this account actually sends live must read here,
 * not there.
 *
 * Two callers depend on it agreeing with itself: the live-send eligibility gate
 * (which template version may be used) and the readiness display. Reading the
 * same row through the same helper is what keeps them from contradicting.
 */

export type SmsActivationState = {
  activationStatus: string;
  readinessStatus: string;
  /** True when this account is actually sending live SMS right now. */
  isLive: boolean;
};

const NOT_CONFIGURED: SmsActivationState = {
  activationStatus: "disabled",
  readinessStatus: "draft",
  isLive: false,
};

/**
 * Used when the state cannot be READ (error, exception) — as opposed to read
 * and found inactive.
 *
 * `isLive: true` on purpose. It drives which template rules apply, and the two
 * ways to be wrong are not symmetric: treating a live account as sandbox would
 * let a sandbox-only template go to real customers, while treating a sandbox
 * account as live merely blocks intent creation until a template is properly
 * promoted. Fail toward the stricter rule.
 */
const UNKNOWN: SmsActivationState = {
  activationStatus: "unknown",
  readinessStatus: "unknown",
  isLive: true,
};

export async function readSmsActivationState(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<SmsActivationState> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  if (!accountOwnerUserId) return NOT_CONFIGURED;

  try {
    const { data, error } = await params.supabase
      .from("sms_provider_configurations")
      .select("activation_status, readiness_status")
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("provider_name", "twilio")
      .maybeSingle();
    if (error) return UNKNOWN;
    if (!data) return NOT_CONFIGURED;

    const activationStatus = String(data.activation_status ?? "").trim().toLowerCase() || "disabled";
    return {
      activationStatus,
      readinessStatus: String(data.readiness_status ?? "").trim().toLowerCase() || "draft",
      isLive: activationStatus === "active",
    };
  } catch {
    return UNKNOWN;
  }
}
