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
  selectedBlockId?: string;
}

function buildCalendarHref(
  view: 'day' | 'week' | 'list' | 'month',
  date: string,
  params?: {
    job?: string | null;
    block?: string | null;
    tech?: string | null;
    prefillDate?: string | null;
    inspector?: string | null;
  },
) {
  const q = new URLSearchParams();
  q.set('view', view);
  q.set('date', date);
  if (params?.job) q.set('job', params.job);
  if (params?.block) q.set('block', params.block);
  if (params?.tech) q.set('tech', params.tech);
  if (params?.prefillDate) q.set('prefill_date', params.prefillDate);
  if (params?.inspector) q.set('inspector', params.inspector);
  else if (params?.job) q.set('inspector', '1');
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

export default function CalendarMonthGrid({ monthDate, jobs, blockEvents, tech, selectedDate, selectedJobId, selectedBlockId }: CalendarMonthGridProps) {
  const router = useRouter();
  const [dropTargetDate, setDropTargetDate] = useState<string | null>(null);
  const days = getCalendarGridDays(monthDate);
  const jobMap = jobsByDate(jobs);
  const blockEventMap = blockEventsByDate(blockEvents);
  const month = parseISO(monthDate);
  const maxEntriesPerCell = 4;
  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
      <div className="mb-3 grid grid-cols-7 gap-2">
        {weekdayLabels.map((label) => (
          <div key={label} className="rounded-xl bg-slate-50 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map((day, dayIndex) => {
          const ymd = format(day, 'yyyy-MM-dd');
          const dayJobs = jobMap.get(ymd) || [];
          const dayBlockEvents = blockEventMap.get(ymd) || [];
          const isSelectedDate = ymd === selectedDate;
          const isAdjacentMonthDay = !isSameMonth(day, month);
          const colIndex = dayIndex % 7;
          const rowIndex = Math.floor(dayIndex / 7);
          const tooltipHorizontalClass = colIndex >= 5 ? 'right-0' : colIndex <= 1 ? 'left-0' : 'left-1/2 -translate-x-1/2';
          const tooltipVerticalClass = rowIndex >= 4 ? 'bottom-full mb-2' : 'top-full mt-2';
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

                router.push(buildCalendarHref('month', ymd, { tech, inspector: '1' }), { scroll: false });
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
                    inspector: '1',
                  }),
                  { scroll: false },
                );
              }}
              className={`min-h-28 overflow-visible rounded-2xl border p-3 transition ${
                isToday(day)
                  ? 'border-blue-200 bg-blue-50/70'
                  : isAdjacentMonthDay
                  ? 'border-slate-200 bg-slate-50/70'
                  : 'border-slate-200 bg-white'
              } hover:border-slate-300 hover:bg-slate-50/80 hover:shadow-sm ${isSelectedDate ? 'ring-2 ring-slate-800/35 border-slate-400 bg-slate-50/80 shadow-sm' : ''} ${dropTargetDate === ymd ? 'ring-2 ring-blue-400 border-blue-500 bg-blue-50/80' : ''}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <Link
                  href={buildCalendarHref('month', ymd, { tech, inspector: '1' })}
                  className={`rounded-full px-2.5 py-1 text-lg font-bold transition hover:bg-slate-100 ${
                    isToday(day) ? 'bg-blue-600 text-white shadow-sm' : isAdjacentMonthDay ? 'text-slate-400' : 'text-slate-900'
                  } ${isSelectedDate && !isToday(day) ? 'bg-slate-100 text-slate-900' : ''}`}
                >
                  {format(day, 'd')}
                </Link>
                {dayJobs.length > 0 ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    {dayJobs.length} job{dayJobs.length > 1 ? 's' : ''}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-col gap-1 overflow-visible">
                {visibleJobs.map((job) => {
                  const needsTech = !!job.scheduled_date && (!job.assignments || job.assignments.length === 0);
                  const lifecycle = getCalendarDisplayStatus(job);
                  const isCancelledJob = lifecycle === 'cancelled';
                  const dotClass = calendarStatusDotClass(lifecycle);
                  const faded = lifecycle === 'closed' || lifecycle === 'cancelled' ? 'opacity-50' : '';
                  const primaryLine = shortTitle(job);
                  const secondaryLine = job.city || 'City not available';

                  return (
                    <div key={job.id} className="group relative overflow-visible">
                      <Link
                        href={buildCalendarHref('month', ymd, { job: job.id, tech })}
                        draggable={!isCancelledJob}
                        onDragStart={(event) => {
                          if (isCancelledJob) {
                            event.preventDefault();
                            return;
                          }
                          event.dataTransfer.setData('application/x-cm-job-id', job.id);
                          event.dataTransfer.effectAllowed = 'move';
                        }}
                        className={`flex min-h-[36px] min-w-0 items-start gap-2 overflow-hidden rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm shadow-slate-950/5 transition ${isCancelledJob ? 'cursor-default' : 'cursor-grab active:cursor-grabbing hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50 hover:shadow-md'} ${faded} ${selectedJobId === job.id ? 'ring-2 ring-slate-800/45 border-slate-700 shadow-md' : ''}`}
                        scroll={false}
                      >
                        <div className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-slate-900">{primaryLine}</div>
                          <div className="mt-0.5 truncate text-[10px] text-slate-500">{secondaryLine}</div>
                          {lifecycle === 'cancelled' ? (
                            <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">Cancelled</div>
                          ) : null}
                        </div>
                        {needsTech ? (
                          <span className="mt-0.5 max-w-[7rem] truncate rounded-full border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">
                            No tech assigned
                          </span>
                        ) : null}
                      </Link>

                      <div className={`pointer-events-none absolute z-30 w-72 max-w-[min(18rem,calc(100vw-1.5rem))] rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 opacity-0 shadow-xl shadow-slate-950/10 invisible translate-y-1 transition duration-150 ease-out group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 ${tooltipHorizontalClass} ${tooltipVerticalClass}`}>
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
                            No tech assigned
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}

                {visibleBlockEvents.map((event) => (
                  <div key={event.id} className="group relative overflow-visible">
                    <div className={`flex min-h-[28px] min-w-0 items-center gap-2 overflow-hidden rounded-xl border border-emerald-200 border-dashed bg-emerald-50/70 px-2.5 py-1.5 text-[11px] text-emerald-950 shadow-sm shadow-emerald-950/5 ${selectedBlockId === event.id ? 'ring-2 ring-emerald-300' : ''}`}>
                      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                        Block
                      </span>
                      <div className="min-w-0 flex-1 truncate font-medium">{event.title}</div>
                      <Link
                        href={buildCalendarHref('month', monthDate, { block: event.id, tech })}
                        scroll={false}
                        className="shrink-0 rounded-lg border border-emerald-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700 transition hover:bg-emerald-100"
                      >
                        Edit
                      </Link>
                    </div>

                    <div className={`pointer-events-none absolute z-30 w-64 max-w-[min(16rem,calc(100vw-1.5rem))] rounded-xl border border-emerald-200 bg-white p-3 text-xs text-slate-900 opacity-0 shadow-xl shadow-emerald-950/10 invisible translate-y-1 transition duration-150 ease-out group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 ${tooltipHorizontalClass} ${tooltipVerticalClass}`}>
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
                  <div className="mt-1 text-center text-[11px] font-medium text-slate-500">+{hiddenEntryCount} more</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}