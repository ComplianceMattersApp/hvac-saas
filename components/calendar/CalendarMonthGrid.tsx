import React from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO } from 'date-fns';
import { DispatchJob } from '@/lib/actions/calendar';
import Link from 'next/link';
import { displayWindowLA } from '@/lib/utils/schedule-la';

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

function normalizedLifecycleStatus(job: DispatchJob) {
  const raw = String(job.status ?? job.ops_status ?? '').trim().toLowerCase();

  if (!raw) return 'scheduled';
  if (raw === 'open') return 'scheduled';
  if (raw === 'need_to_schedule') return 'scheduled';
  if (raw === 'pending') return 'scheduled';
  if (raw === 'pending_information') return 'scheduled';

  if (raw === 'on_my_way') return 'on_my_way';
  if (raw === 'in_progress') return 'in_progress';

  if (raw === 'field_complete') return 'field_complete';
  if (raw === 'completed') return 'field_complete';
  if (raw === 'completed_paperwork_pending') return 'field_complete';

  if (raw === 'closed') return 'closed';

  return raw;
}

function statusDotClass(status: string) {
  if (status === 'scheduled') return 'bg-gray-400';
  if (status === 'on_my_way') return 'bg-blue-500';
  if (status === 'in_progress') return 'bg-indigo-600';
  if (status === 'field_complete') return 'bg-amber-500';
  if (status === 'closed') return 'bg-green-600';
  return 'bg-gray-300';
}

function formatStatus(status: string) {
  const map: Record<string, string> = {
    scheduled: 'Scheduled',
    on_my_way: 'On My Way',
    in_progress: 'In Progress',
    field_complete: 'Field Complete',
    closed: 'Closed',
  };

  return map[status] || status;
}

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
    <div className="grid grid-cols-7 gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-md">
      {days.map((day) => {
        const ymd = format(day, 'yyyy-MM-dd');
        const dayJobs = jobMap.get(ymd) || [];

        return (
          <div
            key={ymd}
            className={`min-h-24 rounded-xl border border-gray-200 p-3 transition-colors ${
              isToday(day) ? 'bg-blue-50' : isSameMonth(day, month) ? 'bg-white' : 'bg-gray-50'
            } hover:bg-gray-50`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span
                className={`text-lg font-bold ${
                  isToday(day) ? 'rounded-full bg-blue-600 px-2 text-white' : 'text-gray-900'
                }`}
              >
                {format(day, 'd')}
              </span>
              {dayJobs.length > 0 ? (
                <span className="text-xs font-semibold text-emerald-700">
                  {dayJobs.length} job{dayJobs.length > 1 ? 's' : ''}
                </span>
              ) : null}
            </div>

            <div className="flex flex-col gap-1">
              {dayJobs.slice(0, maxJobsPerCell).map((job) => {
                const needsTech = !!job.scheduled_date && (!job.assignments || job.assignments.length === 0);
                const lifecycle = normalizedLifecycleStatus(job);
                const dotClass = statusDotClass(lifecycle);
                const faded = lifecycle === 'closed' ? 'opacity-50' : '';
                const primaryLine = job.job_address || shortTitle(job);
                const secondaryLine = job.job_type || job.title || 'Job';

                return (
                  <div key={job.id} className="group relative">
                    <Link
                      href={`/calendar?view=month&date=${monthDate}&job=${job.id}`}
                      className={`flex min-h-[32px] items-start gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow-sm hover:bg-slate-50 ${faded}`}
                      scroll={false}
                    >
                      <div className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-slate-900">{primaryLine}</div>
                        <div className="truncate text-[10px] text-slate-500">{secondaryLine}</div>
                      </div>
                      {needsTech ? (
                        <span className="ml-auto shrink-0 rounded border border-amber-200 bg-amber-100 px-1 py-0.5 text-[9px] font-semibold text-amber-800">
                          Needs Tech
                        </span>
                      ) : null}
                    </Link>

                    <div className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-72 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-900 shadow-lg group-hover:block group-focus-within:block">
                      <div className="mb-1 font-semibold">{job.title || shortTitle(job)}</div>
                      <div className="mb-1 text-slate-700">{job.job_address || 'No address'}</div>

                      {job.customer_first_name || job.customer_last_name ? (
                        <div className="mb-1 text-slate-600">
                          Customer: {[job.customer_first_name, job.customer_last_name].filter(Boolean).join(' ')}
                        </div>
                      ) : null}

                      {job.contractor_name ? (
                        <div className="mb-1 text-slate-600">Contractor: {job.contractor_name}</div>
                      ) : null}

                      <div className="mb-1 flex items-center gap-1 text-slate-600">
                        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
                        <span>{formatStatus(lifecycle)}</span>
                      </div>

                      <div className="mb-1 text-slate-600">Type: {job.job_type || 'N/A'}</div>
                      <div className="mb-1 text-slate-600">Scheduled: {job.scheduled_date || 'N/A'}</div>
                      <div className="mb-1 text-slate-600">
                        Window: {displayWindowLA(job.window_start, job.window_end) || 'No window'}
                      </div>

                      {needsTech ? (
                        <div className="mt-1 inline-block rounded border border-amber-200 bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800">
                          Needs Tech
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {dayJobs.length > maxJobsPerCell ? (
                <div className="mt-1 text-center text-xs text-gray-500">+{dayJobs.length - maxJobsPerCell} more</div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}