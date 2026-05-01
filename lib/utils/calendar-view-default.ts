type ResolveCalendarDefaultViewHrefArgs = {
  href: string;
  isMobile: boolean;
};

export function resolveCalendarDefaultView(isMobile: boolean) {
  return isMobile ? 'list' : 'month';
}

export function isLikelyMobileUserAgent(userAgent?: string | null) {
  const ua = String(userAgent ?? '').toLowerCase();
  if (!ua) return false;

  return /android|iphone|ipad|ipod|mobile|windows phone|opera mini|blackberry/.test(ua);
}

export function resolveCalendarDefaultViewHref(args: ResolveCalendarDefaultViewHrefArgs): string | null {
  const { href, isMobile } = args;
  const url = new URL(href);

  const existingView = String(url.searchParams.get('view') ?? '').trim().toLowerCase();
  if (existingView) return null;

  url.searchParams.set('view', resolveCalendarDefaultView(isMobile));
  return `${url.pathname}?${url.searchParams.toString()}`;
}
