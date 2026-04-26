import { createAdminClient } from "@/lib/supabase/server";

type ScopedInternalContractorLookupParams = {
  accountOwnerUserId: string;
  contractorId: string;
  select?: string;
  admin?: any;
};

function buildSelectClause(baseFields: string[], extraFields?: string) {
  const extra = String(extraFields ?? "").trim();
  return extra ? `${baseFields.join(", ")}, ${extra}` : baseFields.join(", ");
}

export async function loadScopedInternalContractorForMutation(
  params: ScopedInternalContractorLookupParams,
) {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  const contractorId = String(params.contractorId ?? "").trim();

  if (!accountOwnerUserId || !contractorId) return null;

  const admin = params.admin ?? createAdminClient();
  const { data: contractor, error: contractorErr } = await admin
    .from("contractors")
    .select(buildSelectClause(["id", "owner_user_id"], params.select))
    .eq("id", contractorId)
    .maybeSingle();

  if (contractorErr) throw contractorErr;
  if (!contractor?.id) return null;

  const ownerUserId = String((contractor as any)?.owner_user_id ?? "").trim();
  if (!ownerUserId || ownerUserId !== accountOwnerUserId) return null;

  return contractor;
}

function normalizeLifecycleState(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || "active";
}

export async function loadScopedActiveInternalContractorForMutation(
  params: ScopedInternalContractorLookupParams,
) {
  const contractor = await loadScopedInternalContractorForMutation({
    ...params,
    select: buildSelectClause(["lifecycle_state"], params.select),
  });

  if (!contractor?.id) return null;

  const lifecycleState = normalizeLifecycleState((contractor as any).lifecycle_state);
  if (lifecycleState !== "active") return null;

  return contractor;
}
