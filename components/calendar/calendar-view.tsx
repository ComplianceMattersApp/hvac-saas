"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getCalendarEvents } from "@/lib/actions/calendar";

/**
 * This component expects getCalendarEvents(currentMonth) to return:
 * {
 *   jobs:    { id, title, city, status, scheduled_date }[]
 *   services:{ id, title, city, status, scheduled_date }[]
 *   events:  { id, title, description, start_at, end_at, status }[]
 * }
 */

type JobItem = {
  id: string;
  title: string;
  city: string | null;
  status: string | null;
  scheduled_date: string | null;
};

type ServiceItem = {
  id: string;
  title: string;
  city: string | null;
  status: string | null;
  scheduled_date: string | null;
};

type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  status: string | null;
  job_id: string | null;
  service_id: string | null;
  contractor_name?: string | null;
  permit_number?: string | null;
  window_start?: string | null;
  window_end?: string | null;
};

type CalendarData = {
  jobs: JobItem[];
  services: ServiceItem[];
  events: CalendarEvent[];
};

function statusClass(status?: string | null) {
  switch (status) {
    case "open":
      return "bg-blue-100 text-blue-900";

    case "on_the_way":
      return "bg-green-100 text-green-900";

    case "in_process":
      return "bg-yellow-100 text-yellow-900";

    case "completed":
      return "bg-gray-100 text-gray-900";

    case "failed":
      return "bg-red-100 text-red-900";

    case "cancelled":
      return "bg-slate-200 text-slate-700 line-through";

    // legacy safety (in case older rows exist somewhere)
    case "in_progress":
      return "bg-yellow-100 text-yellow-900";
    case "closed":
      return "bg-green-100 text-green-900";

    default:
      return "bg-gray-50 text-gray-700";
  }
}

export function CalendarView() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [data, setData] = useState<CalendarData>({
    jobs: [],
    services: [],
    events: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const result = await getCalendarEvents(currentMonth);
        setData({
          jobs: result?.jobs ?? [],
          services: result?.services ?? [],
          events: result?.events ?? [],
        });
        
      } catch (err) {
        console.error("Failed to load calendar data:", err);
        setData({ jobs: [], services: [], events: [] });
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [currentMonth]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const days: Date[] = [];
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
    days.push(d);
  }

function getEventsForDay(day: Date) {
const dayStr = format(day, "yyyy-MM-dd");


return {
events: (data.events ?? []).filter((e) => e.start_at?.startsWith(dayStr)),
};
}

  const renderDayHeaders = () => {
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return (
      
      <div className="grid grid-cols-7 border-b">
        {labels.map((label) => (
          <div
            key={label}
            className="border-r p-3 text-center text-sm font-semibold text-gray-700"
          >
            {label}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="rounded-lg border bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-6">
        <h2 className="text-xl font-semibold">
          {format(currentMonth, "MMMM yyyy")}
        </h2>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>
            Today
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Day headers */}
      {renderDayHeaders()}

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <p className="text-sm text-gray-500">Loading calendar...</p>
        </div>
      ) : (
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const isCurrent = isSameMonth(day, monthStart);
            const dayEvents = getEventsForDay(day);

            return (
              <div
                key={day.toISOString()}
                className={`min-h-[120px] border-b border-r p-2 ${
                  isCurrent ? "bg-white" : "bg-gray-50"
                }`}
              >
                {/* Day number */}
                <div
                  className={`mb-1 text-sm font-semibold ${
                    isCurrent ? "text-gray-900" : "text-gray-400"
                  }`}
                >
                  {format(day, "d")}
                </div>

{/* Calendar events */}
{dayEvents.events.map((event) => {
  const windowLine =
    event.window_start && event.window_end
      ? `Window: ${new Date(event.window_start).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })} – ${new Date(event.window_end).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })}`
      : null;

  const permitLine = event.permit_number ? `Permit: ${event.permit_number}` : null;

  const tooltip = [
  event.title,
  `Status: ${event.status ?? "—"}`,
  event.contractor_name || "Compliance Matters",
  windowLine,
  permitLine,
]
  .filter(Boolean)
  .join("\n");
  
  return (
  <div
    key={`event-${event.id}`}
    className={`mt-1 rounded px-2 py-1 text-xs cursor-pointer hover:opacity-90 ${statusClass(
      event.status
    )}`}
    title={tooltip}
    role="button"
    tabIndex={0}
    onClick={() => {
      // click anywhere on the block opens detail (same as before)
      if (event.job_id) router.push(`/jobs/${event.job_id}`);
      else if (event.service_id) router.push(`/services/${event.service_id}`);
    }}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        if (event.job_id) router.push(`/jobs/${event.job_id}`);
        else if (event.service_id) router.push(`/services/${event.service_id}`);
      }
    }}
  >
    <div className="flex items-center justify-between gap-2">
      <div className="truncate">{event.title}</div>

      
    </div>
  </div>
);
})}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
