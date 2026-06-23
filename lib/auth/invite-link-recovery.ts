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
