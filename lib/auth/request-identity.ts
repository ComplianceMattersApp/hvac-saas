import { cache } from "react";
import {
  resolveDualContextAccess,
  type DualContextAccess,
} from "@/lib/auth/dual-context-access";
import { isSessionInvalidError } from "@/lib/auth/session-error";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * Request-scoped, memoized auth user resolution.
 *
 * `auth.getUser()` is a network round-trip to Supabase Auth on every call, and
 * the same user is resolved several times across nested Server Components in a
 * single request (~123 call sites). React `cache()` memoizes per server request
 * so every caller in the same request shares one getUser.
 *
 * Session-invalid errors resolve to a null user (unauthenticated); any other
 * error is re-thrown. This mirrors the handling inside `resolveDualContextAccess`
 * exactly, so behavior is unchanged — a transient/unexpected auth error is NOT
 * silently masked as a logout.
 *
 * Do NOT use this in Server Actions / form actions or in security gates where a
 * fresh network validation after a mutation is the point — those must call
 * `supabase.auth.getUser()` directly.
 */
export const getRequestUser = cache(async (): Promise<any | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    if (isSessionInvalidError(error)) return null;
    throw error;
  }
  return data?.user ?? null;
});

/**
 * Request-scoped, memoized dual-context access resolution.
 *
 * `resolveDualContextAccess` performs several serial Supabase round-trips
 * (auth.getUser -> internal_users -> portal membership -> entitlement). Prior
 * to this helper it was resolved independently in the root layout AND again in
 * each page (directly or via `getRequestActorContext`), so a single hard load
 * paid for the whole identity chain two or more times.
 *
 * React `cache()` memoizes per server request (one render pass), so every
 * caller in the same request now shares a single resolution. It consumes the
 * shared `getRequestUser()` so the getUser round-trip is shared with any direct
 * `getRequestUser()` callers in the same request rather than resolved twice.
 * Server Actions run in their own request context and therefore still resolve
 * fresh identity after a mutation — behavior is unchanged, only duplicate work
 * is removed.
 */
export const getRequestDualContextAccess = cache(
  async (): Promise<DualContextAccess> => {
    const supabase = await createClient();
    const user = await getRequestUser();
    return resolveDualContextAccess({ supabase, user, getPortalAdmin: createAdminClient });
  },
);
