export type ActiveContractorPortalMembership = {
  contractorId: string;
  contractorName: string | null;
  accountOwnerUserId: string;
  lifecycleState: string | null;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function uniqueNonEmpty(values: unknown[]) {
  return Array.from(
    new Set(values.map((value) => normalizeText(value)).filter(Boolean)),
  );
}

export async function resolveActiveContractorPortalMembership(input: {
  supabase: any;
  userId: string;
}): Promise<ActiveContractorPortalMembership | null> {
  const userId = normalizeText(input.userId);
  if (!userId) return null;

  const { data: membershipRows, error: membershipErr } = await input.supabase
    .from("contractor_users")
    .select("contractor_id")
    .eq("user_id", userId)
    .limit(20);

  if (membershipErr) throw membershipErr;

  const contractorIds = uniqueNonEmpty(
    (Array.isArray(membershipRows) ? membershipRows : [])
      .map((row: any) => row?.contractor_id),
  );
  if (contractorIds.length === 0) return null;

  const { data: contractorRows, error: contractorErr } = await input.supabase
    .from("contractors")
    .select("id, name, lifecycle_state, owner_user_id")
    .in("id", contractorIds)
    .limit(20);

  if (contractorErr) throw contractorErr;

  const activeContractor = (Array.isArray(contractorRows) ? contractorRows : [])
    .map((row: any) => {
      const contractorId = normalizeText(row?.id);
      const accountOwnerUserId = normalizeText(row?.owner_user_id);
      const lifecycleState = normalizeText(row?.lifecycle_state).toLowerCase() || null;
      if (!contractorId || !accountOwnerUserId) return null;
      if (lifecycleState && lifecycleState !== "active") return null;

      return {
        contractorId,
        contractorName: normalizeText(row?.name) || null,
        accountOwnerUserId,
        lifecycleState,
      };
    })
    .find(Boolean);

  return activeContractor ?? null;
}
