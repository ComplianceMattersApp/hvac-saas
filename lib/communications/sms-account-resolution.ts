/**
 * Which Twilio account a given tenant's traffic belongs to — server-only.
 *
 * Two callers need this and must agree:
 *  - the send path, to POST under the tenant's subaccount;
 *  - the webhook routes, to validate a signature with the right auth token,
 *    because Twilio signs a subaccount's callbacks with THAT subaccount's
 *    token, not the platform one.
 *
 * SECURITY NOTE on webhook use. The payload is used ONLY to select which key to
 * check the signature with. Trust is still established solely by the signature:
 * an attacker choosing which key we try gains nothing, because they still
 * cannot produce a valid HMAC for it. A missing or wrong key yields no
 * signature match and the route rejects exactly as before.
 *
 * Tenants with no subaccount (the platform's own concierge setup, and every
 * account provisioned before this lane) resolve to the platform credentials, so
 * their behavior is byte-identical to before.
 */

import { decryptSmsCredential, hasSmsCredentialsEncryptionKey } from "./sms-credentials-encryption";

export type ResolvedTwilioAccount = {
  accountSid: string;
  authToken: string;
  /** False when this resolved to the platform account rather than a subaccount. */
  isSubaccount: boolean;
};

function platformAccount(): ResolvedTwilioAccount | null {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID ?? "").trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN ?? "").trim();
  if (!accountSid || !authToken) return null;
  return { accountSid, authToken, isSubaccount: false };
}

/**
 * The subaccount credential for one account owner, or null when there is none
 * (or the key is unavailable, or the stored value is unusable).
 *
 * Never throws: a webhook that 500s because a credential could not be decrypted
 * would make Twilio retry forever against a route that can never succeed.
 */
export async function resolveSubaccountCredential(params: {
  admin: any;
  accountOwnerUserId: string;
}): Promise<ResolvedTwilioAccount | null> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  if (!accountOwnerUserId) return null;
  if (!hasSmsCredentialsEncryptionKey()) return null;

  try {
    const { data, error } = await params.admin
      .from("sms_provider_subaccount_credentials")
      .select("subaccount_sid, auth_token_encrypted")
      .eq("account_owner_user_id", accountOwnerUserId)
      .maybeSingle();
    if (error || !data?.subaccount_sid || !data?.auth_token_encrypted) return null;
    return {
      accountSid: String(data.subaccount_sid),
      authToken: decryptSmsCredential(String(data.auth_token_encrypted)),
      isSubaccount: true,
    };
  } catch {
    return null;
  }
}

/**
 * The account to act as for one tenant: their subaccount if provisioned,
 * otherwise the platform account.
 */
export async function resolveTwilioAccountForOwner(params: {
  admin: any;
  accountOwnerUserId: string | null | undefined;
}): Promise<ResolvedTwilioAccount | null> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  if (accountOwnerUserId) {
    const subaccount = await resolveSubaccountCredential({
      admin: params.admin,
      accountOwnerUserId,
    });
    if (subaccount) return subaccount;
  }
  return platformAccount();
}

/**
 * Candidate accounts for an INBOUND webhook, keyed by the receiving number.
 *
 * `To` is already the tenant routing key for inbound SMS, so the same lookup
 * that decides whose message this is also decides whose token signs it.
 */
export async function resolveTwilioAccountForInboundNumber(params: {
  admin: any;
  toPhoneE164: string;
}): Promise<ResolvedTwilioAccount | null> {
  const toPhone = String(params.toPhoneE164 ?? "").trim();
  if (!toPhone) return platformAccount();

  try {
    const { data, error } = await params.admin
      .from("sms_sender_identities")
      .select("account_owner_user_id")
      .eq("phone_e164", toPhone)
      .limit(1)
      .maybeSingle();
    if (error || !data?.account_owner_user_id) return platformAccount();
    return await resolveTwilioAccountForOwner({
      admin: params.admin,
      accountOwnerUserId: String(data.account_owner_user_id),
    });
  } catch {
    return platformAccount();
  }
}

/**
 * Candidate account for a STATUS CALLBACK, found via the delivery row that
 * recorded the outbound message.
 */
export async function resolveTwilioAccountForMessageSid(params: {
  admin: any;
  messageSid: string;
}): Promise<ResolvedTwilioAccount | null> {
  const messageSid = String(params.messageSid ?? "").trim();
  if (!messageSid) return platformAccount();

  try {
    const { data, error } = await params.admin
      .from("sms_provider_deliveries")
      .select("account_owner_user_id")
      .eq("provider_name", "twilio")
      .eq("provider_message_id", messageSid)
      .maybeSingle();
    if (error || !data?.account_owner_user_id) return platformAccount();
    return await resolveTwilioAccountForOwner({
      admin: params.admin,
      accountOwnerUserId: String(data.account_owner_user_id),
    });
  } catch {
    return platformAccount();
  }
}
