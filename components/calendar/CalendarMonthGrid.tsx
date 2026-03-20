
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
                // Status color mapping
                const statusColor =
                  job.status === 'scheduled' ? 'bg-gray-400'
                  : job.status === 'on_my_way' ? 'bg-blue-500'
                  : job.status === 'in_progress' ? 'bg-indigo-600'
                  : job.status === 'field_complete' ? 'bg-amber-500'
                  : job.status === 'closed' ? 'bg-green-600'
                  : 'bg-gray-300';
                const faded = job.status === 'closed' ? 'opacity-50' : '';
                const primaryLine = job.job_address || shortTitle(job);
                return (
                  <Link
                    key={job.id}
                    href={`/calendar?view=month&date=${monthDate}&job=${job.id}`}
                    className={`
                      group flex items-start gap-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 px-2 py-1 text-xs shadow-sm min-h-[32px] ${faded}
                    `}
                    title={`${job.job_address || ''} — ${job.title || ''}`}
                  >
                    <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${statusColor}`} />
                    <div className="flex flex-col truncate">
                      <span className="truncate text-slate-900 font-medium">
                        {primaryLine}
                      </span>
                      <span className="truncate text-[10px] text-slate-500">
                        {job.job_type || job.title}
                      </span>
                    </div>
                    {needsTech && (
                      <span className="ml-auto shrink-0 inline-block rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold text-amber-800 border border-amber-200">
                        Needs Tech
                      </span>
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
