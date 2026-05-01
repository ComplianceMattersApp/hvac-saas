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
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    if (isAuthSessionMissingError(userErr)) {
      return buildUnauthenticatedActorContext(supabase);
    }
    throw userErr;
  }

  if (!user) {
    return buildUnauthenticatedActorContext(supabase);
  }

  const [{ data: contractorUser, error: contractorErr }, internalUser] = await Promise.all([
    supabase
      .from("contractor_users")
      .select("contractor_id")
      .eq("user_id", user.id)
      .maybeSingle(),
    getInternalUser({ supabase, userId: user.id }),
  ]);

  if (contractorErr) throw contractorErr;

  const contractorId = String(contractorUser?.contractor_id ?? "").trim() || null;

  if (contractorId) {
    return {
      supabase,
      user,
      kind: "contractor",
      internalUser: null,
      contractorId,
      accountOwnerUserId: null,
    };
  }

  if (internalUser?.is_active) {
    return {
      supabase,
      user,
      kind: "internal",
      internalUser,
      contractorId: null,
      accountOwnerUserId: String(internalUser.account_owner_user_id ?? "").trim() || null,
    };
  }

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