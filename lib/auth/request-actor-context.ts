import { cache } from "react";
import type { InternalUserRow } from "@/lib/auth/internal-user";
import { resolveDualContextAccess } from "@/lib/auth/dual-context-access";
import { isSessionInvalidError } from "@/lib/auth/session-error";
import { createClient } from "@/lib/supabase/server";

export type RequestActorKind =
  | "unauthenticated"
  | "internal"
  | "contractor"
  | "unauthorized";

export type RequestActorContext = {
  supabase: any;
  user: any | null;
  kind: RequestActorKind;
  internalUser: InternalUserRow | null;
  contractorId: string | null;
  accountOwnerUserId: string | null;
};

function isOpsTimingEnabled() {
  return process.env.OPS_TIMING_DEBUG === "true";
}

function finishOpsTiming(label: string, startedAt: number) {
  if (!startedAt) return;
  console.log(`[${label}] ${Date.now() - startedAt}ms`);
}

function buildUnauthenticatedActorContext(supabase: any): RequestActorContext {
  return {
    supabase,
    user: null,
    kind: "unauthenticated",
    internalUser: null,
    contractorId: null,
    accountOwnerUserId: null,
  };
}

async function resolveRequestActorContextUncached(): Promise<RequestActorContext> {
  const supabase = await createClient();
  const _t_getUser = isOpsTimingEnabled() ? Date.now() : 0;
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  finishOpsTiming("ops:requestActorContext:getUser", _t_getUser);

  if (userErr) {
    if (isSessionInvalidError(userErr)) {
      return buildUnauthenticatedActorContext(supabase);
    }
    throw userErr;
  }

  if (!user) {
    return buildUnauthenticatedActorContext(supabase);
  }

  const _t_assembly = isOpsTimingEnabled() ? Date.now() : 0;
  const access = await resolveDualContextAccess({ supabase, user });

  // Dual-membership users land in app context only when app entitlement is active.
  // Portal access remains available independently when app access is inactive.
  if (access.hasActiveAppAccess && access.internalUser) {
    const internalUser: InternalUserRow = {
      user_id: access.internalUser.userId,
      role: access.internalUser.role,
      is_active: access.internalUser.isActive,
      account_owner_user_id: access.internalUser.accountOwnerUserId,
      created_by: access.internalUser.createdBy,
    };
    finishOpsTiming("ops:requestActorContext:assembly", _t_assembly);
    return {
      supabase,
      user,
      kind: "internal",
      internalUser,
      contractorId: null,
      accountOwnerUserId: String(access.internalUser.accountOwnerUserId ?? "").trim() || null,
    };
  }

  if (access.portal?.contractorId) {
    finishOpsTiming("ops:requestActorContext:assembly", _t_assembly);
    return {
      supabase,
      user,
      kind: "contractor",
      internalUser: null,
      contractorId: access.portal.contractorId,
      accountOwnerUserId: null,
    };
  }

  finishOpsTiming("ops:requestActorContext:assembly", _t_assembly);

  return {
    supabase,
    user,
    kind: "unauthorized",
    internalUser: null,
    contractorId: null,
    accountOwnerUserId: null,
  };
}

export const getRequestActorContext = cache(resolveRequestActorContextUncached);
