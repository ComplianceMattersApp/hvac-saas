import { createAdminClient } from "@/lib/supabase/server";

type ResolveCanonicalOwnerParams = {
  actorUserId: string | null;
  defaultWriteClient: any;
  contractorId?: string | null;
};

export async function resolveCanonicalOwner(
  params: ResolveCanonicalOwnerParams,
) {
  const contractorId = String(params.contractorId ?? "").trim();

  if (contractorId) {
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("contractors")
      .select("owner_user_id")
      .eq("id", contractorId)
      .maybeSingle();

    if (error) throw error;

    const canonicalOwnerUserId = data?.owner_user_id ?? null;
    if (!canonicalOwnerUserId) {
      throw new Error("Contractor is not mapped to an internal owner_user_id");
    }

    return {
      canonicalOwnerUserId,
      canonicalWriteClient: admin,
    };
  }

  if (!params.actorUserId) {
    throw new Error("Missing actor user_id for canonical ownership.");
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("internal_users")
    .select("user_id, account_owner_user_id, is_active")
    .eq("user_id", params.actorUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.user_id || !data?.account_owner_user_id || !data?.is_active) {
    throw new Error("Active internal user required for canonical ownership.");
  }

  return {
    canonicalOwnerUserId: data.account_owner_user_id,
    canonicalWriteClient:
      data.account_owner_user_id === params.actorUserId
        ? params.defaultWriteClient
        : admin,
  };
}