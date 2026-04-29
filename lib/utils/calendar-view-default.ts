type ResolveCalendarDefaultViewHrefArgs = {
  href: string;
  isMobile: boolean;
};

export function resolveCalendarDefaultViewHref(args: ResolveCalendarDefaultViewHrefArgs): string | null {
  const { href, isMobile } = args;
  const url = new URL(href);

  const existingView = String(url.searchParams.get('view') ?? '').trim().toLowerCase();
  if (existingView) return null;

  url.searchParams.set('view', isMobile ? 'list' : 'month');
  return `${url.pathname}?${url.searchParams.toString()}`;
}
