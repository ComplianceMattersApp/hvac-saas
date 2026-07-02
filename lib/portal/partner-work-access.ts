export function shouldShowPartnerWorkMenuItem(input: {
  isInternalUser: boolean;
  hasPartnerWorkAccess: boolean;
}) {
  return input.hasPartnerWorkAccess;
}
