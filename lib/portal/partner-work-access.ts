export function shouldShowPartnerWorkMenuItem(input: {
  isInternalUser: boolean;
  hasPartnerWorkAccess: boolean;
}) {
  return input.isInternalUser && input.hasPartnerWorkAccess;
}
