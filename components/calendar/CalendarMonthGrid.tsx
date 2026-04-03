"use client";

import React, { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO } from 'date-fns';
import type { DispatchJob } from '@/lib/actions/calendar';
import Link from 'next/link';
import { displayWindowLA } from '@/lib/utils/schedule-la';
import { calendarStatusDotClass, formatCalendarDisplayStatus, getCalendarDisplayStatus } from './calendar-status';
import { useRouter } from 'next/navigation';

interface CalendarMonthGridProps {
  monthDate: string; // YYYY-MM-DD (first day of month)
  jobs: DispatchJob[];
  tech?: string | null;
  selectedDate?: string;
  selectedJobId?: string;
}

function buildCalendarHref(
  view: 'day' | 'week' | 'list' | 'month',
  date: string,
  params?: { job?: string | null; tech?: string | null; prefillDate?: string | null },
) {
  const q = new URLSearchParams();
  q.set('view', view);
  q.set('date', date);
  if (params?.job) q.set('job', params.job);
  if (params?.tech) q.set('tech', params.tech);
  if (params?.prefillDate) q.set('prefill_date', params.prefillDate);
  return `/calendar?${q.toString()}`;
}

function extractDraggedJobId(event: React.DragEvent<HTMLElement>) {
  const transfer = event.dataTransfer;

  const explicit = String(transfer.getData('application/x-cm-job-id') || '').trim();
  if (explicit) return explicit;

  const uriLike = String(transfer.getData('text/uri-list') || transfer.getData('text/plain') || '').trim();
  if (!uriLike) return null;

  try {
    const parsed = new URL(uriLike, window.location.origin);
    const job = String(parsed.searchParams.get('job') || '').trim();
    return job || null;
  } catch {
    return null;
  }
}

function getMonthDays(monthDate: string) {
  const date = parseISO(monthDate);
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  return eachDayOfInterval({ start, end });
}

function getLeadingEmptyCellCount(monthDate: string) {
  return startOfMonth(parseISO(monthDate)).getDay();
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

function shortTitle(job: DispatchJob) {
  const title = String(job.title ?? '').trim();
  if (!title) return `Job ${job.id.slice(0, 8)}`;
  return title.length > 32 ? `${title.slice(0, 29)}...` : title;
}

export default function CalendarMonthGrid({ monthDate, jobs, tech, selectedDate, selectedJobId }: CalendarMonthGridProps) {
  const router = useRouter();
  const [dropTargetDate, setDropTargetDate] = useState<string | null>(null);
  const days = getMonthDays(monthDate);
  const leadingEmptyCellCount = getLeadingEmptyCellCount(monthDate);
  const trailingEmptyCellCount = (7 - ((leadingEmptyCellCount + days.length) % 7)) % 7;
  const jobMap = jobsByDate(jobs);
  const month = parseISO(monthDate);
  const maxJobsPerCell = 3;
  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-md">
      <div className="mb-2 grid grid-cols-7 gap-2">
        {weekdayLabels.map((label) => (
          <div key={label} className="text-center text-[11px] font-medium uppercase tracking-wide text-gray-500">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: leadingEmptyCellCount }, (_, index) => (
          <div
            key={`leading-empty-${index}`}
            aria-hidden="true"
            className="min-h-24 rounded-xl border border-transparent bg-transparent p-3"
          />
        ))}
        {days.map((day) => {
          const ymd = format(day, 'yyyy-MM-dd');
          const dayJobs = jobMap.get(ymd) || [];
          const isSelectedDate = ymd === selectedDate;

          return (
            <div
              key={ymd}
              onDragOver={(event) => {
                if (!event.dataTransfer) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDropTargetDate(ymd);
              }}
              onDragLeave={() => {
                setDropTargetDate((current) => (current === ymd ? null : current));
              }}
              onDrop={(event) => {
                event.preventDefault();
                const droppedJobId = extractDraggedJobId(event);
                setDropTargetDate(null);
                if (!droppedJobId) return;

                router.push(
                  buildCalendarHref('month', ymd, {
                    job: droppedJobId,
                    tech,
                    prefillDate: ymd,
                  }),
                  { scroll: false },
                );
              }}
              className={`min-h-24 rounded-xl border border-gray-200 p-3 transition-colors ${
                isToday(day) ? 'bg-blue-50' : isSameMonth(day, month) ? 'bg-white' : 'bg-gray-50'
              } hover:bg-gray-50 ${isSelectedDate ? 'ring-2 ring-slate-800/45 border-slate-500' : ''} ${dropTargetDate === ymd ? 'ring-2 ring-blue-400 border-blue-500 bg-blue-50/80' : ''}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <Link
                  href={buildCalendarHref('month', ymd, { tech })}
                  className={`rounded-sm text-lg font-bold hover:underline ${
                    isToday(day) ? 'rounded-full bg-blue-600 px-2 text-white' : 'text-gray-900'
                  } ${isSelectedDate && !isToday(day) ? 'rounded bg-slate-100 px-2' : ''}`}
                >
                  {format(day, 'd')}
                </Link>
                {dayJobs.length > 0 ? (
                  <span className="text-xs font-semibold text-emerald-700">
                    {dayJobs.length} job{dayJobs.length > 1 ? 's' : ''}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-col gap-1">
                {dayJobs.slice(0, maxJobsPerCell).map((job) => {
                  const needsTech = !!job.scheduled_date && (!job.assignments || job.assignments.length === 0);
                  const lifecycle = getCalendarDisplayStatus(job);
                  const dotClass = calendarStatusDotClass(lifecycle);
                  const faded = lifecycle === 'closed' || lifecycle === 'cancelled' ? 'opacity-50' : '';
                  const primaryLine = job.job_address || shortTitle(job);
                  const secondaryLine = job.job_type || job.title || 'Job';

                  return (
                    <div key={job.id} className="group relative">
                      <Link
                        href={buildCalendarHref('month', ymd, { job: job.id, tech })}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData('application/x-cm-job-id', job.id);
                          event.dataTransfer.effectAllowed = 'move';
                        }}
                        className={`flex min-h-[32px] items-start gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow-sm hover:bg-slate-50 ${faded} ${selectedJobId === job.id ? 'ring-2 ring-slate-800/45 border-slate-700' : ''}`}
                        scroll={false}
                      >
                        <div className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-slate-900">{primaryLine}</div>
                          <div className="truncate text-[10px] text-slate-500">{secondaryLine}</div>
                          {lifecycle === 'cancelled' ? (
                            <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">Cancelled</div>
                          ) : null}
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
                          <span>{formatCalendarDisplayStatus(lifecycle)}</span>
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
        {Array.from({ length: trailingEmptyCellCount }, (_, index) => (
          <div
            key={`trailing-empty-${index}`}
            aria-hidden="true"
            className="min-h-24 rounded-xl border border-transparent bg-transparent p-3"
          />
        ))}
      </div>
    </div>
  );
}