"use client";

import React, { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, endOfWeek, isSameMonth, isToday, parseISO, startOfWeek } from 'date-fns';
import type { DispatchCalendarBlockEvent, DispatchJob } from '@/lib/actions/calendar';
import Link from 'next/link';
import { normalizeRetestLinkedJobTitle } from '@/lib/utils/job-title-display';
import { displayWindowLA } from '@/lib/utils/schedule-la';
import { calendarStatusDotClass, formatCalendarDisplayStatus, getCalendarDisplayStatus } from './calendar-status';
import { useRouter } from 'next/navigation';

interface CalendarMonthGridProps {
  monthDate: string; // YYYY-MM-DD (first day of month)
  jobs: DispatchJob[];
  blockEvents: DispatchCalendarBlockEvent[];
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

function getCalendarGridDays(monthDate: string) {
  const date = parseISO(monthDate);
  const start = startOfWeek(startOfMonth(date));
  const end = endOfWeek(endOfMonth(date));
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

function blockEventsByDate(blockEvents: DispatchCalendarBlockEvent[]) {
  const map = new Map<string, DispatchCalendarBlockEvent[]>();
  for (const event of blockEvents) {
    const date = String(event.calendar_date ?? '').trim();
    if (!date) continue;
    if (!map.has(date)) map.set(date, []);
    map.get(date)?.push(event);
  }
  return map;
}

function shortTitle(job: DispatchJob) {
  const title = normalizeRetestLinkedJobTitle(job.title);
  if (!title) return `Job ${job.id.slice(0, 8)}`;
  return title.length > 32 ? `${title.slice(0, 29)}...` : title;
}

function clickStartedInsideInteractiveElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('a, button, input, select, textarea, summary'));
}

export default function CalendarMonthGrid({ monthDate, jobs, blockEvents, tech, selectedDate, selectedJobId }: CalendarMonthGridProps) {
  const router = useRouter();
  const [dropTargetDate, setDropTargetDate] = useState<string | null>(null);
  const days = getCalendarGridDays(monthDate);
  const jobMap = jobsByDate(jobs);
  const blockEventMap = blockEventsByDate(blockEvents);
  const month = parseISO(monthDate);
  const maxEntriesPerCell = 4;
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
        {days.map((day) => {
          const ymd = format(day, 'yyyy-MM-dd');
          const dayJobs = jobMap.get(ymd) || [];
          const dayBlockEvents = blockEventMap.get(ymd) || [];
          const isSelectedDate = ymd === selectedDate;
          const isAdjacentMonthDay = !isSameMonth(day, month);
          const visibleJobs = dayJobs.slice(0, maxEntriesPerCell);
          const remainingSlots = Math.max(maxEntriesPerCell - visibleJobs.length, 0);
          const visibleBlockEvents = dayBlockEvents.slice(0, remainingSlots);
          const hiddenEntryCount = Math.max(dayJobs.length + dayBlockEvents.length - visibleJobs.length - visibleBlockEvents.length, 0);

          return (
            <div
              key={ymd}
              onClick={(event) => {
                if (event.defaultPrevented) return;
                if (clickStartedInsideInteractiveElement(event.target)) return;

                router.push(buildCalendarHref('month', ymd, { tech }), { scroll: false });
              }}
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
                isToday(day) ? 'bg-blue-50' : isAdjacentMonthDay ? 'bg-gray-50' : 'bg-white'
              } hover:bg-gray-50 ${isSelectedDate ? 'ring-2 ring-slate-800/45 border-slate-500' : ''} ${dropTargetDate === ymd ? 'ring-2 ring-blue-400 border-blue-500 bg-blue-50/80' : ''}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <Link
                  href={buildCalendarHref('month', ymd, { tech })}
                  className={`rounded-sm text-lg font-bold hover:underline ${
                    isToday(day) ? 'rounded-full bg-blue-600 px-2 text-white' : isAdjacentMonthDay ? 'text-gray-400' : 'text-gray-900'
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
                {visibleJobs.map((job) => {
                  const needsTech = !!job.scheduled_date && (!job.assignments || job.assignments.length === 0);
                  const lifecycle = getCalendarDisplayStatus(job);
                  const dotClass = calendarStatusDotClass(lifecycle);
                  const faded = lifecycle === 'closed' || lifecycle === 'cancelled' ? 'opacity-50' : '';
                  const primaryLine = job.job_address || shortTitle(job);
                  const secondaryLine = job.job_type || normalizeRetestLinkedJobTitle(job.title) || 'Job';

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
                        <div className="mb-1 font-semibold">{normalizeRetestLinkedJobTitle(job.title) || shortTitle(job)}</div>
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

                {visibleBlockEvents.map((event) => (
                  <div key={event.id} className="group relative">
                    <div className="flex min-h-[24px] items-center gap-2 rounded-md border border-emerald-200 border-dashed bg-emerald-50/70 px-2 py-1 text-[11px] text-emerald-950 shadow-sm">
                      <span className="inline-flex rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                        Block
                      </span>
                      <div className="min-w-0 flex-1 truncate font-medium">{event.title}</div>
                    </div>

                    <div className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-64 rounded-lg border border-emerald-200 bg-white p-3 text-xs text-slate-900 shadow-lg group-hover:block group-focus-within:block">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="inline-flex rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                          Block
                        </span>
                        <span className="text-slate-500">{event.calendar_date}</span>
                      </div>
                      <div className="mb-1 font-semibold text-slate-900">{event.title}</div>
                      <div className="mb-1 text-slate-600">Time: {event.start_time} - {event.end_time}</div>
                      {event.description ? (
                        <div className="text-slate-600">{event.description}</div>
                      ) : null}
                    </div>
                  </div>
                ))}

                {hiddenEntryCount > 0 ? (
                  <div className="mt-1 text-center text-xs text-gray-500">+{hiddenEntryCount} more</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}