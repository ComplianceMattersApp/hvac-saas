// Error codes from @supabase/auth-js that mean "the session/token is no longer
// valid" rather than "something unexpected broke". See
// node_modules/@supabase/auth-js/dist/main/lib/error-codes.d.ts for the full list.
const SESSION_INVALID_ERROR_CODES = new Set([
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_not_found",
  "session_expired",
  "user_not_found",
  "bad_jwt",
]);

function readErrorStringField(error: unknown, field: "name" | "message" | "code"): string {
  if (!error || typeof error !== "object") return "";
  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" ? value : "";
}

/**
 * True when `error` represents an expired/invalid/missing session (the user
 * needs to log in again), as opposed to an unexpected server/auth error that
 * should surface normally. Used to decide whether to redirect to /login
 * instead of throwing.
 *
 * Matches by `.name`/`.code` (duck-typed) rather than `instanceof`, the same
 * convention already used elsewhere in this codebase, since Supabase auth
 * errors and test fixtures are both plain-shaped objects.
 */
export function isSessionInvalidError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const name = readErrorStringField(error, "name");
  const message = readErrorStringField(error, "message");
  const code = readErrorStringField(error, "code");

  if (name === "AuthSessionMissingError" || /auth session missing/i.test(message)) {
    return true;
  }

  if (name === "AuthApiError" && SESSION_INVALID_ERROR_CODES.has(code)) {
    return true;
  }

  return false;
}
