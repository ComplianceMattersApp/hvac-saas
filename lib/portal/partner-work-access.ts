export function shouldShowPortalMenuItem(input: {
  hasPortalAccess: boolean;
}) {
  return input.hasPortalAccess;
}

export function shouldShowPartnerWorkMenuItem(input: {
  isInternalUser: boolean;
  hasPartnerWorkAccess: boolean;
}) {
  return shouldShowPortalMenuItem({ hasPortalAccess: input.hasPartnerWorkAccess });
}
