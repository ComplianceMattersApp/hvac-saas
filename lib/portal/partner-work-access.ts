export function shouldShowPortalMenuItem(input: {
  hasExistingPortalAccess: boolean;
}) {
  return input.hasExistingPortalAccess;
}

export function shouldShowPartnerWorkMenuItem(input: {
  isInternalUser: boolean;
  hasPartnerWorkAccess: boolean;
}) {
  return shouldShowPortalMenuItem({ hasExistingPortalAccess: input.hasPartnerWorkAccess });
}
