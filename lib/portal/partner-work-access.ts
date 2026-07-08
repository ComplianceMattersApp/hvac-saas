export function shouldShowPortalMenuItem(input: {
  hasActiveAppAccess: boolean;
  hasExistingPortalAccess: boolean;
  isPrimaryPortalAccount?: boolean;
}) {
  return input.hasExistingPortalAccess && !input.isPrimaryPortalAccount;
}

export function shouldShowPartnerWorkMenuItem(input: {
  isInternalUser: boolean;
  hasPartnerWorkAccess: boolean;
}) {
  return shouldShowPortalMenuItem({
    hasActiveAppAccess: input.isInternalUser,
    hasExistingPortalAccess: input.hasPartnerWorkAccess,
  });
}
