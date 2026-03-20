import React from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO } from 'date-fns';
import { DispatchJob } from '@/lib/actions/calendar';

interface CalendarMonthGridProps {
  monthDate: string; // YYYY-MM-DD (first day of month)
  jobs: DispatchJob[];
}

function getMonthDays(monthDate: string) {
  const date = parseISO(monthDate);
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  return eachDayOfInterval({ start, end });
}

function jobsByDate(jobs: DispatchJob[]) {
  const map = new Map<string, DispatchJob[]>();
  for (const job of jobs) {
    if (!job.scheduled_date) continue;
    if (!map.has(job.scheduled_date)) map.set(job.scheduled_date, []);
    map.get(job.scheduled_date)?.push(job);
  }
  return map;
}

export default function CalendarMonthGrid({ monthDate, jobs }: CalendarMonthGridProps) {
  const days = getMonthDays(monthDate);
  const jobMap = jobsByDate(jobs);
  const month = parseISO(monthDate);

  return (
    <div className="grid grid-cols-7 gap-1 bg-white rounded border p-2">
      {days.map((day) => {
        const ymd = format(day, 'yyyy-MM-dd');
        const dayJobs = jobMap.get(ymd) || [];
        return (
          <div
            key={ymd}
            className={`min-h-24 border rounded p-2 ${isToday(day) ? 'bg-blue-50' : ''} ${isSameMonth(day, month) ? 'bg-white' : 'bg-gray-50'}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className={`text-xs font-semibold ${isToday(day) ? 'bg-blue-600 text-white rounded-full px-2' : 'text-gray-900'}`}>{format(day, 'd')}</span>
              {dayJobs.length > 0 && (
                <span className="text-[10px] font-medium text-emerald-700">{dayJobs.length} job{dayJobs.length > 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="space-y-1">
              {dayJobs.map((job) => (
                <div key={job.id} className="text-xs truncate text-slate-700">
                  {job.title || `Job ${job.id.slice(0, 8)}`}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
