export function shouldShowPortalMenuItem(input: {
  hasActiveAppAccess: boolean;
  hasExistingPortalAccess: boolean;
}) {
  return input.hasActiveAppAccess && input.hasExistingPortalAccess;
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
