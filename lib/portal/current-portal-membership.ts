export type ActiveContractorPortalMembership = {
  contractorId: string;
  contractorName: string | null;
  accountOwnerUserId: string;
  lifecycleState: string | null;
  portalAccountOwnerUserId: string;
  sourceCompanyAccountOwnerUserId: string | null;
  membershipSource: "direct_contractor_user";
  eligibleRole: null;
};

export type CompanyPortalMembershipRole = "admin" | "office";

export type ActiveCompanyPortalMembership = {
  contractorId: null;
  contractorName: null;
  accountOwnerUserId: string;
  lifecycleState: null;
  portalAccountOwnerUserId: string;
  sourceCompanyAccountOwnerUserId: string;
  membershipSource: "company_account_handoff_connection";
  eligibleRole: CompanyPortalMembershipRole;
  connectionId: string;
};

export type ActivePortalMembership =
  | ActiveContractorPortalMembership
  | ActiveCompanyPortalMembership;

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function uniqueNonEmpty(values: unknown[]) {
  return Array.from(
    new Set(values.map((value) => normalizeText(value)).filter(Boolean)),
  );
}

function parseCompanyPortalMembershipRole(value: unknown): CompanyPortalMembershipRole | null {
  const role = normalizeText(value).toLowerCase();
  if (role === "admin" || role === "office") return role;
  return null;
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
        portalAccountOwnerUserId: accountOwnerUserId,
        sourceCompanyAccountOwnerUserId: null,
        membershipSource: "direct_contractor_user" as const,
        eligibleRole: null,
      };
    })
    .find(Boolean);

  return activeContractor ?? null;
}

export async function resolveActiveCompanyPortalMembership(input: {
  supabase: any;
  internalUser: {
    role: string;
    isActive: boolean;
    accountOwnerUserId: string;
  } | null;
}): Promise<ActiveCompanyPortalMembership | null> {
  const eligibleRole = parseCompanyPortalMembershipRole(input.internalUser?.role);
  const sourceCompanyAccountOwnerUserId = normalizeText(input.internalUser?.accountOwnerUserId);

  if (!input.internalUser?.isActive || !eligibleRole || !sourceCompanyAccountOwnerUserId) {
    return null;
  }

  const { data: connectionRows, error } = await input.supabase
    .from("account_handoff_connections")
    .select(
      "id, requesting_account_owner_user_id, recipient_account_owner_user_id, connection_status, handoff_kind",
    )
    .eq("requesting_account_owner_user_id", sourceCompanyAccountOwnerUserId)
    .eq("connection_status", "active")
    .eq("handoff_kind", "ecc")
    .limit(20);

  if (error) throw error;

  const activeConnection = (Array.isArray(connectionRows) ? connectionRows : [])
    .map((row: any) => {
      const connectionId = normalizeText(row?.id);
      const requestingAccountOwnerUserId = normalizeText(row?.requesting_account_owner_user_id);
      const portalAccountOwnerUserId = normalizeText(row?.recipient_account_owner_user_id);
      const status = normalizeText(row?.connection_status).toLowerCase();
      const handoffKind = normalizeText(row?.handoff_kind).toLowerCase();

      if (!connectionId || !portalAccountOwnerUserId) return null;
      if (requestingAccountOwnerUserId !== sourceCompanyAccountOwnerUserId) return null;
      if (portalAccountOwnerUserId === sourceCompanyAccountOwnerUserId) return null;
      if (status !== "active" || handoffKind !== "ecc") return null;

      return {
        contractorId: null,
        contractorName: null,
        accountOwnerUserId: portalAccountOwnerUserId,
        lifecycleState: null,
        portalAccountOwnerUserId,
        sourceCompanyAccountOwnerUserId,
        membershipSource: "company_account_handoff_connection" as const,
        eligibleRole,
        connectionId,
      };
    })
    .find(Boolean);

  return activeConnection ?? null;
}

export async function resolveCurrentPortalMembership(input: {
  supabase: any;
  userId: string;
  internalUser?: {
    role: string;
    isActive: boolean;
    accountOwnerUserId: string;
  } | null;
}): Promise<ActivePortalMembership | null> {
  const directMembership = await resolveActiveContractorPortalMembership({
    supabase: input.supabase,
    userId: input.userId,
  });
  if (directMembership) return directMembership;

  return resolveActiveCompanyPortalMembership({
    supabase: input.supabase,
    internalUser: input.internalUser ?? null,
  });
}
