import { CalendarView } from '@/components/calendar/calendar-view';

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: Promise<{
    view?: string;
    date?: string;
    banner?: string;
    job?: string;
  }>;
}) {
  const sp = (searchParams ? await searchParams : {}) ?? {};

  return (
    <div className="min-h-screen w-full bg-gray-50 px-6 py-5">
      <CalendarView view={sp.view} date={sp.date} banner={sp.banner} job={sp.job} />
    </div>
  );
}
