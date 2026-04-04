import { CalendarView } from '@/components/calendar/calendar-view';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

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
    tech?: string;
    prefill_date?: string;
  }>;
}) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (userData?.user?.id) {
    const { data: contractorUser, error: contractorErr } = await supabase
      .from('contractor_users')
      .select('contractor_id')
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (contractorErr) throw contractorErr;
    if (contractorUser?.contractor_id) redirect('/portal');
  }

  const sp = (searchParams ? await searchParams : {}) ?? {};
  const date = String(sp.date ?? '').trim() || todayYmdLA();

  return (
    <div className="min-h-screen w-full bg-gray-50 px-3 py-4 sm:px-6 sm:py-5">
      <CalendarView view={sp.view} date={date} banner={sp.banner} job={sp.job} block={sp.block} tech={sp.tech} prefillDate={sp.prefill_date} />
    </div>
  );
}
