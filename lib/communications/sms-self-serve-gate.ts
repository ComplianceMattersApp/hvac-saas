/**
 * Entitlement gate for SMS self-serve provisioning.
 *
 * The lane spec's hard lock: provisioning must be gated BEFORE any Twilio spend
 * is incurred on a tenant's behalf. Every step of the wizard costs real money —
 * a phone number is ~$1.15/mo the moment it is purchased, and a brand
 * registration is a non-refundable TCR fee — so an account that is not
 * explicitly enabled must not be able to reach a single Twilio call.
 *
 * v1 is an owner-controlled allowlist, matching the permit-workflow gate. A
 * billing add-on replaces it in a later slice; the call sites do not change
 * when it does.
 */

const SMS_SELF_SERVE_ALLOWLIST_ENV = "ENABLE_SMS_SELF_SERVE_ACCOUNT_OWNER_IDS";

function normalizeAccountOwnerId(value: unknown) {
  return String(value ?? "").trim();
}

export function parseSmsSelfServeEnabledAccountOwnerIds(rawValue?: string | null) {
  const source = rawValue ?? process.env[SMS_SELF_SERVE_ALLOWLIST_ENV];
  return new Set(
    String(source ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function isSmsSelfServeEnabledForAccountOwner(
  accountOwnerUserId: string | null | undefined,
  rawAllowlist?: string | null,
) {
  const normalized = normalizeAccountOwnerId(accountOwnerUserId);
  if (!normalized) return false;

  const allowlist = parseSmsSelfServeEnabledAccountOwnerIds(rawAllowlist);
  if (!allowlist.size) return false;

  return allowlist.has(normalized);
}

/**
 * Throw unless this account may provision. Called at the top of every
 * provisioning action — including the ones that only read — so there is no
 * ordering in which a non-entitled account reaches Twilio.
 */
export function assertSmsSelfServeEnabledForAccountOwner(
  accountOwnerUserId: string | null | undefined,
  message = "SMS self-serve provisioning is not enabled for this account.",
  rawAllowlist?: string | null,
) {
  if (!isSmsSelfServeEnabledForAccountOwner(accountOwnerUserId, rawAllowlist)) {
    throw new Error(message);
  }
}

const SMS_ADVANCED_CONSOLE_ALLOWLIST_ENV = "ENABLE_SMS_ADVANCED_CONSOLE_ACCOUNT_OWNER_IDS";

/**
 * Who may see the engineering console on /ops/admin/communications.
 *
 * Default empty = hidden for everyone, including the owner until they add
 * themselves. That is deliberate: the console asks for Messaging Service SIDs,
 * exposes template-version review machinery and the sandbox queue, and shows a
 * compliance checklist that is meaningful only to whoever operates the
 * platform. A tenant admin seeing it learns nothing and can break things.
 *
 * Nothing is deleted by this gate — it is visibility only, so the owner's
 * existing concierge workflow keeps working exactly as before once their
 * account id is listed.
 */
export function isSmsAdvancedConsoleEnabledForAccountOwner(
  accountOwnerUserId: string | null | undefined,
  rawAllowlist?: string | null,
) {
  const normalized = normalizeAccountOwnerId(accountOwnerUserId);
  if (!normalized) return false;

  const source = rawAllowlist ?? process.env[SMS_ADVANCED_CONSOLE_ALLOWLIST_ENV];
  const allowlist = new Set(
    String(source ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return allowlist.size > 0 && allowlist.has(normalized);
}

export { SMS_SELF_SERVE_ALLOWLIST_ENV, SMS_ADVANCED_CONSOLE_ALLOWLIST_ENV };

/**
 * Which Twilio registration environment new registrations use.
 *
 * NOT a tenant choice and never read from a form: sandbox (the default) makes
 * every brand `Mock=true` — free, never reaching TCR/carriers — so preview and
 * staging deployments can walk the whole wizard without spend. The owner sets
 * `SMS_PROVISIONING_ENVIRONMENT=production` on the production deployment,
 * which is the only place real registrations should ever originate.
 */
export function resolveSmsProvisioningEnvironment(): "sandbox" | "production" {
  return String(process.env.SMS_PROVISIONING_ENVIRONMENT ?? "").trim() === "production"
    ? "production"
    : "sandbox";
}
