import { CalendarView } from '@/components/calendar/calendar-view';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

import { createClient } from '@/lib/supabase/server';
import {
  landingPathForDualContextAccess,
  resolveDualContextAccess,
} from '@/lib/auth/dual-context-access';
import { getRequestUser } from '@/lib/auth/request-identity';
import { isLikelyMobileUserAgent, resolveCalendarDefaultView } from '@/lib/utils/calendar-view-default';

function todayYmdLA(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: Promise<{
    view?: string;
    date?: string;
    banner?: string;
    job?: string;
    block?: string;
    tech?: string | string[];
    inspector?: string;
    prefill_date?: string;
  }>;
}) {
  const supabase = await createClient();
  // Shared, request-scoped user (cache hit off the layout's getUser). The local
  // resolveDualContextAccess is kept as-is — without getPortalAdmin — to preserve
  // this page's exact portal/redirect semantics; only the getUser is deduped.
  const user = await getRequestUser();

  if (user?.id) {
    const access = await resolveDualContextAccess({
      supabase,
      user,
    });

    if (!access.hasActiveAppAccess) {
      redirect(landingPathForDualContextAccess(access));
    }
  }

  const sp = (searchParams ? await searchParams : {}) ?? {};
  const date = String(sp.date ?? '').trim() || todayYmdLA();
  const requestedView = String(sp.view ?? '').trim();
  const userAgent = (await headers()).get('user-agent');
  const defaultView = resolveCalendarDefaultView(isLikelyMobileUserAgent(userAgent));
  const view = requestedView || defaultView;

  return (
    <div className="min-h-screen w-full bg-slate-50 px-3 py-4 text-slate-950 sm:px-6 sm:py-5">
      <CalendarView view={view} date={date} banner={sp.banner} job={sp.job} block={sp.block} tech={sp.tech} inspector={sp.inspector} prefillDate={sp.prefill_date} />
    </div>
  );
}
