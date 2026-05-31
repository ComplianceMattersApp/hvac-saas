type MaintenanceAgreementInternalUserLike = {
  user_id?: string | null;
  role?: string | null;
  is_active?: boolean | null;
  account_owner_user_id?: string | null;
} | null | undefined;

type MaintenanceAgreementAuthorityParams = {
  actorUserId?: string | null;
  internalUser?: MaintenanceAgreementInternalUserLike;
};

function normalize(value: unknown) {
  return String(value ?? "").trim();
}

export function canManageMaintenanceAgreementPolicy(
  params: MaintenanceAgreementAuthorityParams,
) {
  const internalUser = params.internalUser;
  if (!internalUser?.is_active) {
    return false;
  }

  const actorUserId = normalize(params.actorUserId) || normalize(internalUser.user_id);
  const accountOwnerUserId = normalize(internalUser.account_owner_user_id);
  const role = normalize(internalUser.role).toLowerCase();

  if (!actorUserId || !accountOwnerUserId) {
    return false;
  }

  const isStructuralOwner = actorUserId === accountOwnerUserId;
  const isAdminRole = role === "admin";

  return isStructuralOwner || isAdminRole;
}