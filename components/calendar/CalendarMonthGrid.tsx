
import React from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO } from 'date-fns';
import { DispatchJob } from '@/lib/actions/calendar';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

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
    // All jobs here are canonical scheduled jobs
    if (!job.scheduled_date) continue;
    if (!map.has(job.scheduled_date)) map.set(job.scheduled_date, []);
    map.get(job.scheduled_date)?.push(job);
  }
  return map;
}

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  need_to_schedule: 'warning',
  scheduled: 'info',
  pending_information: 'warning',
  failed: 'danger',
  completed: 'success',
  pending: 'default',
  completed_paperwork_pending: 'warning',
  failed_retest_needed: 'danger',
  closed: 'info',
};

function shortTitle(job: DispatchJob) {
  const title = String(job.title ?? '').trim();
  if (!title) return `Job ${job.id.slice(0, 8)}`;
  return title.length > 32 ? `${title.slice(0, 29)}...` : title;
}

export default function CalendarMonthGrid({ monthDate, jobs }: CalendarMonthGridProps) {
  const days = getMonthDays(monthDate);
  const jobMap = jobsByDate(jobs);
  const month = parseISO(monthDate);
  const maxJobsPerCell = 3;

  return (
    <div className="grid grid-cols-7 gap-2 bg-white rounded-xl border border-gray-200 p-4 shadow-md">
      {days.map((day) => {
        const ymd = format(day, 'yyyy-MM-dd');
        const dayJobs = jobMap.get(ymd) || [];
        return (
          <div
            key={ymd}
            className={`min-h-24 border border-gray-200 rounded-xl p-3 flex flex-col transition-colors ${isToday(day) ? 'bg-blue-50' : ''} ${isSameMonth(day, month) ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-50`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-lg font-bold ${isToday(day) ? 'bg-blue-600 text-white rounded-full px-2' : 'text-gray-900'}`}>{format(day, 'd')}</span>
              {dayJobs.length > 0 && (
                <span className="text-xs font-semibold text-emerald-700">{dayJobs.length} job{dayJobs.length > 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {dayJobs.slice(0, maxJobsPerCell).map((job) => {
                const needsTech = job.scheduled_date && (!job.assignments || job.assignments.length === 0);
                return (
                  <Link
                    key={job.id}
                    href={`/calendar?view=month&date=${monthDate}&job=${job.id}`}
                    className="group flex items-center gap-2 truncate rounded-md bg-gray-100 px-2 py-1 text-xs font-medium hover:bg-gray-200 border border-gray-200 min-h-[32px]"
                    title={job.title || job.id}
                  >
                    <Badge variant={statusColors[job.status ?? 'pending'] || 'default'} className="mr-1 text-[10px] px-1 py-0.5">
                      {job.status ? job.status.replace(/_/g, ' ') : 'pending'}
                    </Badge>
                    <span className="truncate text-gray-900">{shortTitle(job)}</span>
                    {needsTech && (
                      <span className="ml-1 inline-block rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200 opacity-80">Needs Tech</span>
                    )}
                  </Link>
                );
              })}
              {dayJobs.length > maxJobsPerCell && (
                <div className="text-center text-xs text-gray-500 mt-1">+{dayJobs.length - maxJobsPerCell} more</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
