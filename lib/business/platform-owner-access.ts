function toCleanString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeEmail(value: unknown) {
  return toCleanString(value).toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseCsvAllowlist(value: unknown) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export type PlatformOwnerConfig = {
  emailAllowlist: Set<string>;
  userIdAllowlist: Set<string>;
  hasAnyAllowlist: boolean;
};

export function resolvePlatformOwnerConfig(
  env: NodeJS.ProcessEnv = process.env,
): PlatformOwnerConfig {
  const emailAllowlist = new Set(
    parseCsvAllowlist(env.PLATFORM_OWNER_EMAILS)
      .map((email) => normalizeEmail(email))
      .filter((email) => isValidEmail(email)),
  );

  const userIdAllowlist = new Set(
    parseCsvAllowlist(env.PLATFORM_OWNER_USER_IDS).map((userId) => toCleanString(userId)),
  );

  return {
    emailAllowlist,
    userIdAllowlist,
    hasAnyAllowlist: emailAllowlist.size > 0 || userIdAllowlist.size > 0,
  };
}

export function isPlatformOwnerActor(params: {
  userId?: string | null;
  email?: string | null;
  env?: NodeJS.ProcessEnv;
}) {
  const config = resolvePlatformOwnerConfig(params.env);
  if (!config.hasAnyAllowlist) {
    return false;
  }

  const userId = toCleanString(params.userId);
  if (userId && config.userIdAllowlist.has(userId)) {
    return true;
  }

  const email = normalizeEmail(params.email);
  if (email && config.emailAllowlist.has(email)) {
    return true;
  }

  return false;
}

export function resolvePlatformOwnerSignupNotificationRecipient(
  env: NodeJS.ProcessEnv = process.env,
) {
  const configuredRecipient = normalizeEmail(env.PLATFORM_OWNER_SIGNUP_NOTIFY_EMAIL);
  if (configuredRecipient && isValidEmail(configuredRecipient)) {
    return configuredRecipient;
  }

  const config = resolvePlatformOwnerConfig(env);
  const firstAllowlistedEmail = config.emailAllowlist.values().next().value;
  return typeof firstAllowlistedEmail === "string" ? firstAllowlistedEmail : null;
}
