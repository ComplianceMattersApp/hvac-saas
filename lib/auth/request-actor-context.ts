import { cache } from "react";
import { getInternalUser, type InternalUserRow } from "@/lib/auth/internal-user";
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

function isAuthSessionMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const name = String((error as { name?: unknown }).name ?? "").trim();
  const message = String((error as { message?: unknown }).message ?? "").trim();

  return name === "AuthSessionMissingError" || /auth session missing/i.test(message);
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
    if (isAuthSessionMissingError(userErr)) {
      return buildUnauthenticatedActorContext(supabase);
    }
    throw userErr;
  }

  if (!user) {
    return buildUnauthenticatedActorContext(supabase);
  }

  const contractorLookup = async () => {
    const _t_contractorLookup = isOpsTimingEnabled() ? Date.now() : 0;
    try {
      return await supabase
        .from("contractor_users")
        .select("contractor_id")
        .eq("user_id", user.id)
        .maybeSingle();
    } finally {
      finishOpsTiming("ops:requestActorContext:contractorLookup", _t_contractorLookup);
    }
  };

  const internalLookup = getInternalUser({
    supabase,
    userId: user.id,
    timing: (phase, elapsedMs) => {
      if (!isOpsTimingEnabled()) return;
      if (phase === "internalUserLookup") {
        console.log(`[ops:requestActorContext:internalLookup] ${elapsedMs}ms`);
      }
    },
  });

  const [{ data: contractorUser, error: contractorErr }, internalUser] = await Promise.all([
    contractorLookup(),
    internalLookup,
  ]);
  const _t_assembly = isOpsTimingEnabled() ? Date.now() : 0;

  if (contractorErr) throw contractorErr;

  const contractorId = String(contractorUser?.contractor_id ?? "").trim() || null;

  // Dual-membership users must be able to land in internal workspace paths.
  // Prefer active internal access, then fall back to contractor membership.
  if (internalUser?.is_active) {
    finishOpsTiming("ops:requestActorContext:assembly", _t_assembly);
    return {
      supabase,
      user,
      kind: "internal",
      internalUser,
      contractorId: null,
      accountOwnerUserId: String(internalUser.account_owner_user_id ?? "").trim() || null,
    };
  }

  if (contractorId) {
    finishOpsTiming("ops:requestActorContext:assembly", _t_assembly);
    return {
      supabase,
      user,
      kind: "contractor",
      internalUser: null,
      contractorId,
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