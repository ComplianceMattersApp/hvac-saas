import { Sidebar } from '@/components/layout/sidebar';
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
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 overflow-auto">
        <div className="border-b bg-white px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
          <p className="mt-1 text-sm text-gray-500">
            Dispatch scheduling and assignment for jobs
          </p>
        </div>

        <div className="p-8">
          <CalendarView view={sp.view} date={sp.date} banner={sp.banner} job={sp.job} />
        </div>
      </div>
    </div>
  );
}
