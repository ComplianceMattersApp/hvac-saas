import { CalendarView } from '@/components/calendar/calendar-view';

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
    tech?: string;
  }>;
}) {
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const date = String(sp.date ?? '').trim() || todayYmdLA();

  return (
    <div className="min-h-screen w-full bg-gray-50 px-3 py-4 sm:px-6 sm:py-5">
      <CalendarView view={sp.view} date={date} banner={sp.banner} job={sp.job} tech={sp.tech} />
    </div>
  );
}
