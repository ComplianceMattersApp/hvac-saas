export type SetPasswordInviteState = "ready" | "expired";

export function isInviteSetPasswordMode(search: string | URLSearchParams): boolean {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return String(params.get("mode") ?? "").trim().toLowerCase() === "invite";
}

export function getSetPasswordInviteState(search: string | URLSearchParams): SetPasswordInviteState {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const state = String(params.get("invite_state") ?? params.get("invite_status") ?? "")
    .trim()
    .toLowerCase();

  return state === "expired" || state === "invalid" || state === "used" ? "expired" : "ready";
}

export function shouldShowExpiredInviteRecovery(search: string | URLSearchParams): boolean {
  return isInviteSetPasswordMode(search) && getSetPasswordInviteState(search) === "expired";
}

export function isInviteOrRecoveryCallbackError(params: URLSearchParams): boolean {
  const type = String(params.get("type") ?? "").trim().toLowerCase();
  const error = String(params.get("error") ?? "").trim();
  const errorCode = String(params.get("error_code") ?? "").trim();
  const errorDescription = String(params.get("error_description") ?? "").trim();

  if (!error && !errorCode && !errorDescription) return false;
  if (type === "invite" || type === "recovery") return true;
  return false;
}

export function parseAuthCallbackHashParams(hash: string): URLSearchParams {
  const raw = String(hash ?? "").replace(/^#/, "").replace(/#/g, "&");
  return new URLSearchParams(raw);
}

export function hasExpiredInviteOrRecoveryError(params: URLSearchParams): boolean {
  const error = String(params.get("error") ?? "").trim().toLowerCase();
  const errorCode = String(params.get("error_code") ?? "").trim().toLowerCase();
  const errorDescription = String(params.get("error_description") ?? "").trim().toLowerCase();
  const type = String(params.get("type") ?? "").trim().toLowerCase();

  const hasInviteIntent = type === "invite" || type === "recovery" || hasInviteSetPasswordIntent(params);
  const looksExpired =
    errorCode === "otp_expired" ||
    errorCode === "token_expired" ||
    errorCode === "token_invalid" ||
    errorCode === "bad_code_verifier" ||
    error.includes("access_denied") ||
    errorDescription.includes("expired") ||
    errorDescription.includes("invalid") ||
    errorDescription.includes("used");

  return looksExpired && (hasInviteIntent || !type);
}

export function hasInviteSetPasswordIntent(params: URLSearchParams): boolean {
  if (isInviteSetPasswordMode(params)) return true;

  const next = String(params.get("next") ?? "").trim();
  if (!next) return false;

  try {
    const parsed = next.startsWith("http://") || next.startsWith("https://")
      ? new URL(next)
      : new URL(next, "https://example.test");
    return parsed.pathname === "/set-password" && isInviteSetPasswordMode(parsed.searchParams);
  } catch {
    return next.includes("/set-password") && next.includes("mode=invite");
  }
}
