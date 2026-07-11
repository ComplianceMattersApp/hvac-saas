import { cache } from "react";
import {
  resolveDualContextAccess,
  type DualContextAccess,
} from "@/lib/auth/dual-context-access";
import { createAdminClient, createClient } from "@/lib/supabase/server";

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
 * caller in the same request now shares a single resolution. Server Actions run
 * in their own request context and therefore still resolve fresh identity after
 * a mutation — behavior is unchanged, only duplicate work is removed.
 */
export const getRequestDualContextAccess = cache(
  async (): Promise<DualContextAccess> => {
    const supabase = await createClient();
    return resolveDualContextAccess({ supabase, getPortalAdmin: createAdminClient });
  },
);
