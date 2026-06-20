export function resolveCalendarDefaultView(isMobile: boolean) {
  return isMobile ? 'list' : 'month';
}

export function isLikelyMobileUserAgent(userAgent?: string | null) {
  const ua = String(userAgent ?? '').toLowerCase();
  if (!ua) return false;

  return /android|iphone|ipad|ipod|mobile|windows phone|opera mini|blackberry/.test(ua);
}
