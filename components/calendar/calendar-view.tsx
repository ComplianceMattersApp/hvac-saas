import Link from 'next/link';
import { Suspense } from 'react';
import { CalendarPlus, ChevronDown } from 'lucide-react';
import { endOfMonth, format as formatDate, parseISO, startOfMonth } from 'date-fns';

import CalendarLayoutShell from './CalendarLayoutShell';
import CalendarInspectorCloseButton from './CalendarInspectorCloseButton';
import CalendarMonthGrid from './CalendarMonthGrid';
import CalendarDispatchGrid from './CalendarDispatchGrid';
import CalendarDragJobLink from './CalendarDragJobLink';
import CalendarOpenJobButton from './CalendarOpenJobButton';
import CalendarMobileListAnchor from './CalendarMobileListAnchor';
import CalendarResponsiveJobLink from './CalendarResponsiveJobLink';
import { buildCalendarHref } from './calendar-href';
import { CALENDAR_STATUS_LEGEND, calendarStatusDotClass, formatCalendarDisplayStatus, getCalendarDisplayStatus } from './calendar-status';
import {
  CALENDAR_TECH_FILTER_UNASSIGNED,
  filterJobsForTechnician,
  isUnassignedTechFilter,
  normalizeCalendarTechFilter,
  parseCalendarSelectedUserIds,
} from './calendar-filtering';
import SubmitButton from '@/components/SubmitButton';
import { createCalendarBlockEventFromForm, deleteCalendarBlockEventFromForm, updateCalendarBlockEventFromForm } from '@/lib/actions/calendar-event-actions';
import {
  assignJobAssigneeFromForm,
  reassignAndRescheduleJobFromForm,
  removeJobAssigneeFromForm,
  updateJobScheduleFromForm,
} from '@/lib/actions/job-actions';
import { logCustomerContactAttemptFromForm } from '@/lib/actions/job-contact-actions';
import {
  getDispatchCalendarBoardData,
  getDispatchCalendarQueueData,
  getDispatchCalendarRosterData,
  type DispatchCalendarBlockEvent,
  type DispatchCalendarQueueData,
  type DispatchCalendarRosterData,
  type DispatchJob,
  type DispatchViewMode,
} from '@/lib/actions/calendar';
import { mergeAgendaDateKeys } from '@/lib/calendar/agenda-date-range';
import { getMonthVisibleRange } from '@/lib/calendar/month-visible-range';
import { normalizeRetestLinkedJobTitle } from '@/lib/utils/job-title-display';
import { displayWindowLA, formatBusinessDateUS } from '@/lib/utils/schedule-la';

type CalendarUIView = 'day' | 'week' | 'list' | 'month';

type AssignableCalendarUser = { user_id: string; display_name: string; calendar_label?: string | null; email?: string | null };

type Props = {
  view?: string;
  date?: string;
  banner?: string;
  job?: string;
  block?: string;
  tech?: string | string[];
  prefillDate?: string;
  inspector?: string;
};

function bannerMessage(banner?: string) {
  const map: Record<string, string> = {
    schedule_saved: 'Schedule updated.',
    schedule_already_saved: 'Schedule was already up to date.',
    assignment_added: 'Assignee added.',
    assignment_added_primary: 'Assignee added and set as primary.',
    assignment_primary_set: 'Primary assignee updated.',
    assignment_removed: 'Assignee removed.',
    assignment_user_required: 'Select a technician before assigning.',
    contact_attempt_logged_call: 'Call attempt logged.',
    contact_attempt_logged_text: 'Text attempt logged.',
    calendar_block_created: 'Calendar block added.',
    calendar_block_updated: 'Calendar block updated.',
    calendar_block_deleted: 'Calendar block removed.',
    calendar_block_delete_invalid: 'Select a valid calendar block to remove.',
    calendar_block_delete_missing: 'That calendar block no longer exists.',
    calendar_block_update_missing: 'That calendar block no longer exists.',
    calendar_block_invalid: 'Enter a title, date, and valid start/end times.',
    calendar_block_invalid_range: 'End time must be after start time.',
    calendar_block_user_required: 'Select an internal user for the block.',
  };

  const key = String(banner ?? '').trim();
  if (!key) return null;
  return map[key] ?? null;
}

function customerName(job: DispatchJob) {
  const name = `${String(job.customer_first_name ?? '').trim()} ${String(job.customer_last_name ?? '').trim()}`.trim();
  return name || 'Customer not set';
}

function customerAddressLine1(job: DispatchJob) {
  return String(job.job_address ?? '').trim() || 'Address not available';
}

function customerAddressLine2(job: DispatchJob) {
  const extended = job as DispatchJob & {
    state?: string | null;
    zip?: string | null;
    customer_state?: string | null;
    customer_zip?: string | null;
  };
  const city = String(job.city ?? '').trim();
  const state = String(extended.customer_state ?? extended.state ?? '').trim();
  const zip = String(extended.customer_zip ?? extended.zip ?? '').trim();
  const stateZip = [state, zip].filter(Boolean).join(' ');
  return [city, stateZip].filter(Boolean).join(', ') || 'City/state/zip not available';
}

function customerPhone(job: DispatchJob) {
  const extended = job as DispatchJob & {
    phone?: string | null;
    customer_phone?: string | null;
    customer_phone_number?: string | null;
  };
  return String(
    job.customer_phone ??
      extended.customer_phone ??
      extended.customer_phone_number ??
      extended.phone ??
      '',
  ).trim();
}

function phoneHrefValue(rawPhone: string) {
  return rawPhone.replace(/[^\d+]/g, '');
}

function buildReturnTo(view: CalendarUIView, date: string, tech?: string | string[] | null) {
  const q = new URLSearchParams();
  q.set('view', view);
  q.set('date', date);
  const techValues = Array.isArray(tech) ? tech : tech ? [tech] : [];
  for (const value of techValues) {
    const clean = String(value ?? '').trim();
    if (clean) q.append('tech', clean);
  }
  return `/calendar?${q.toString()}`;
}

function normalizeYmd(value?: string | null) {
  const raw = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function normalizeView(view?: string): CalendarUIView {
  const raw = String(view ?? '').trim().toLowerCase();
  if (raw === 'day') return 'day';
  if (raw === 'week') return 'week';
  if (raw === 'month') return 'month';
  return 'list';
}

function addDaysYmd(ymd: string, days: number): string {
  const m = String(ymd).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function addMonthsYmd(ymd: string, months: number): string {
  const m = String(ymd).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  d.setUTCMonth(d.getUTCMonth() + months);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function startOfWeekMondayYmd(ymd: string): string {
  const m = String(ymd).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  const dayOfWeek = d.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function todayYmdLA(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function isDispatchVisibleForLayout(job: DispatchJob) {
  const ops = String(job.ops_status ?? '').toLowerCase();
  if (!job.scheduled_date || !job.window_start) return false;
  if (ops === 'on_hold') return false;
  return true;
}

function listTimeWindowLabel(windowStart?: string | null, windowEnd?: string | null) {
  const rendered = displayWindowLA(windowStart, windowEnd);
  if (!rendered) return 'Time not set';
  return rendered.replace(/\s-\s/g, ' – ');
}

function formatDayDateHeader(ymd: string) {
  const parsed = parseISO(ymd);
  return `${formatDate(parsed, 'EEEE')} — ${formatBusinessDateUS(ymd)}`;
}

function shortTitle(job: DispatchJob) {
  const title = normalizeRetestLinkedJobTitle(job.title);
  if (!title) return `Job ${job.id.slice(0, 8)}`;
  return title.length > 42 ? `${title.slice(0, 39)}...` : title;
}

function calendarJobTooltip(job: DispatchJob) {
  const lifecycle = formatCalendarDisplayStatus(getCalendarDisplayStatus(job));
  const summary = [
    shortTitle(job),
    customerName(job),
    customerAddressLine1(job),
    customerAddressLine2(job),
    `Window: ${listTimeWindowLabel(job.window_start, job.window_end)}`,
    `Field status: ${lifecycle}`,
  ];

  if (job.contractor_name) summary.push(`Contractor: ${job.contractor_name}`);
  if (String(job.work_context_label ?? '').trim()) summary.push(`Work: ${String(job.work_context_label ?? '').trim()}`);
  if (job.scheduled_date && (!job.assignments || job.assignments.length === 0)) summary.push('No tech assigned');

  return summary.filter((line) => String(line ?? '').trim()).join('\n');
}

function dispatchVisibilityIssueLabels(job: DispatchJob) {
  const labels: string[] = [];
  if (String(job.ops_status ?? '').trim().toLowerCase() === 'on_hold') labels.push('On hold');
  if (!job.window_start) labels.push('Time not set');
  if (!Array.isArray(job.assignments) || job.assignments.length === 0) labels.push('No tech assigned');
  return labels;
}

function unscheduledJobCueLabels(job: DispatchJob) {
  const labels: string[] = [];
  const jobType = String(job.job_type ?? '').trim();
  const contractorName = String(job.contractor_name ?? '').trim();
  const isRetest = Boolean(String(job.parent_job_id ?? '').trim());

  if (jobType) labels.push(jobType.replace(/_/g, ' '));
  if (contractorName) labels.push(contractorName);
  if (isRetest) labels.push('Retest');

  return labels;
}

function NavLinks(props: { view: CalendarUIView; date: string; tech?: string | null }) {
  const { view, date, tech } = props;
  const today = todayYmdLA();

  const prev =
    view === 'month' || view === 'list'
      ? addMonthsYmd(date, -1)
      : addDaysYmd(date, view === 'week' ? -7 : -1);

  const next =
    view === 'month' || view === 'list'
      ? addMonthsYmd(date, 1)
      : addDaysYmd(date, view === 'week' ? 7 : 1);

  const todayTarget =
    view === 'month'
      ? today.slice(0, 8) + '01'
      : today;

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <div className="grid min-w-0 flex-1 grid-cols-3 gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1.5 shadow-sm shadow-slate-950/5 sm:flex sm:flex-none">
        <Link href={buildCalendarHref(view, prev, { tech })} className="inline-flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-950/5 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 sm:flex-none">
          Previous
        </Link>
        <Link href={buildCalendarHref(view, todayTarget, { tech })} className="inline-flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-lg border border-[#0f1f35] bg-[#0f1f35] px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-slate-950/10 transition hover:bg-[#16263f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 sm:flex-none">
          Today
        </Link>
        <Link href={buildCalendarHref(view, next, { tech })} className="inline-flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-950/5 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 sm:flex-none">
          Next
        </Link>
      </div>
      <form action="/calendar" method="get" className="flex w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 sm:ml-1 sm:w-auto">
        <input type="hidden" name="view" value={view} />
        {tech ? <input type="hidden" name="tech" value={tech} /> : null}
        <label htmlFor={`calendar-jump-${view}`} className="text-xs font-medium text-slate-500">
          Jump to
        </label>
        <input
          id={`calendar-jump-${view}`}
          type="date"
          name="date"
          defaultValue={date}
          className="min-h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm shadow-slate-950/5 sm:flex-none"
          aria-label={view === 'week' ? 'Jump to week containing date' : 'Jump to date'}
        />
        <button
          type="submit"
          className="min-h-9 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
        >
          Go
        </button>
      </form>
    </div>
  );
}

function agendaJobLeftRailClass(lifecycle: string | null): string {
  if (lifecycle === 'in_progress') return 'border-l-indigo-500';
  if (lifecycle === 'on_my_way') return 'border-l-blue-500';
  if (lifecycle === 'scheduled') return 'border-l-cyan-500';
  if (lifecycle === 'field_complete') return 'border-l-amber-400';
  if (lifecycle === 'pending_info') return 'border-l-amber-400';
  if (lifecycle === 'on_hold') return 'border-l-slate-400';
  if (lifecycle === 'closed') return 'border-l-green-500';
  if (lifecycle === 'cancelled') return 'border-l-slate-300';
  return 'border-l-slate-300';
}

function AgendaList(props: {
  jobs: DispatchJob[];
  blockEvents: DispatchCalendarBlockEvent[];
  date: string;
  visibleDates?: string[];
  tech?: string | null;
  selectedBlockId?: string;
}) {
  const { jobs, blockEvents, date, visibleDates, tech, selectedBlockId } = props;

  const grouped = new Map<string, DispatchJob[]>();
  for (const job of jobs) {
    if (!job.scheduled_date) continue;
    if (!grouped.has(job.scheduled_date)) grouped.set(job.scheduled_date, []);
    grouped.get(job.scheduled_date)?.push(job);
  }

  const groupedBlocks = new Map<string, DispatchCalendarBlockEvent[]>();
  for (const event of blockEvents) {
    const eventDate = String(event.calendar_date ?? '').trim();
    if (!eventDate) continue;
    if (!groupedBlocks.has(eventDate)) groupedBlocks.set(eventDate, []);
    groupedBlocks.get(eventDate)?.push(event);
  }

  const occupiedDates = [...grouped.keys(), ...groupedBlocks.keys()];
  const sortedDates = mergeAgendaDateKeys({ occupiedDates, visibleDates });
  const hasOccupiedDates = occupiedDates.length > 0;

  if (!sortedDates.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300/80 bg-white px-4 py-10 text-center">
        <p className="text-sm font-semibold text-[#0f1f35]">No scheduled work in this range.</p>
        <p className="mt-1 text-sm text-slate-500">Use the planner queue to open an unscheduled job and place it on the calendar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!hasOccupiedDates ? (
        <div className="hidden rounded-xl border border-dashed border-slate-300/80 bg-white px-4 py-10 text-center md:block">
          <p className="text-sm font-semibold text-[#0f1f35]">No scheduled work in this range.</p>
          <p className="mt-1 text-sm text-slate-500">Use the planner queue to open an unscheduled job and place it on the calendar.</p>
        </div>
      ) : null}
      {sortedDates.map((dateKey) => {
        const dayJobs = grouped.get(dateKey) ?? [];
        const dayBlocks = groupedBlocks.get(dateKey) ?? [];
        const isEmptyDay = dayJobs.length === 0 && dayBlocks.length === 0;

        return (
          <div key={dateKey} id={`calendar-list-date-${dateKey}`} data-calendar-list-date={dateKey} className={`rounded-xl border border-l-4 border-l-blue-500 border-slate-200/80 bg-white p-3.5 shadow-[0_10px_28px_-20px_rgba(15,31,53,0.28)] ${isEmptyDay ? 'md:hidden' : ''}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-[#0f1f35]">{formatDayDateHeader(dateKey)}</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
              {(() => {
                const jobCount = dayJobs.length;
                const blockCount = dayBlocks.length;
                const parts: string[] = [];
                if (jobCount) parts.push(`${jobCount} job${jobCount > 1 ? 's' : ''}`);
                if (blockCount) parts.push(`${blockCount} block${blockCount > 1 ? 's' : ''}`);
                return parts.join(' · ') || 'No work scheduled';
              })()}
            </span>
          </div>
          <div className="space-y-2">
            {isEmptyDay ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3.5 py-3">
                <p className="text-sm font-semibold text-slate-700">No work scheduled</p>
                <p className="mt-0.5 text-xs text-slate-500">Open day for scheduling</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/jobs/new"
                    className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm shadow-slate-950/5 transition hover:border-slate-300 hover:bg-slate-100"
                  >
                    Schedule Work
                  </Link>
                  <Link
                    href="/ops?bucket=pending#ops-workspace"
                    className="inline-flex min-h-9 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 transition hover:bg-blue-100"
                  >
                    View Unscheduled
                  </Link>
                </div>
              </div>
            ) : null}

            {dayJobs.map((job) => {
              const needsTech = job.scheduled_date && (!job.assignments || job.assignments.length === 0);
              const lifecycle = getCalendarDisplayStatus(job);
              const dotClass = calendarStatusDotClass(lifecycle);
              const faded = lifecycle === 'closed' || lifecycle === 'cancelled' ? 'opacity-50' : '';

              return (
                <CalendarResponsiveJobLink
                  key={job.id}
                  mobileHref={`/jobs/${job.id}`}
                  desktopHref={buildCalendarHref('list', date, { job: job.id, tech, inspector: null })}
                  title={calendarJobTooltip(job)}
                  scroll={false}
                  className={`block rounded-xl border border-l-4 ${agendaJobLeftRailClass(lifecycle)} border-slate-200/80 bg-white px-3.5 py-3 shadow-[0_8px_22px_-18px_rgba(15,31,53,0.3)] transition hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50/80 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${faded}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-[#0f1f35]">{shortTitle(job)}</div>
                      <div className="mt-0.5 truncate text-[11px] font-medium text-slate-500">{customerName(job)} {job.city ? `· ${job.city}` : ''}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-semibold text-blue-800">{listTimeWindowLabel(job.window_start, job.window_end)}</span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                          <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                          {formatCalendarDisplayStatus(lifecycle)}
                        </span>
                        {needsTech ? (
                          <span className="inline-block rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                            No tech assigned
                          </span>
                        ) : null}
                      </div>
                      {String(job.work_context_label ?? '').trim() ? (
                        <div className="mt-1 truncate text-[11px] text-slate-500">Work: {String(job.work_context_label ?? '').trim()}</div>
                      ) : null}
                      <div className="mt-1 truncate text-[11px] text-slate-500">{job.job_address || customerName(job) || job.job_type || normalizeRetestLinkedJobTitle(job.title)}</div>
                    </div>
                  </div>
                </CalendarResponsiveJobLink>
              );
            })}

            {dayBlocks.map((event) => (
              <div
                key={event.id}
                className={`flex items-center gap-3 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/60 px-3.5 py-3 text-[13px] text-emerald-950 ${selectedBlockId === event.id ? 'ring-2 ring-emerald-300' : ''}`}
              >
                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                  Block
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-emerald-950">{event.title}</div>
                  <div className="mt-0.5 truncate text-[11px] text-emerald-800/80">
                    {event.start_time} - {event.end_time}
                    {event.description ? ` · ${event.description}` : ''}
                  </div>
                </div>
                <Link
                  href={buildCalendarHref('list', date, { block: event.id, tech })}
                  scroll={false}
                  className="shrink-0 rounded-lg border border-emerald-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700 transition hover:bg-emerald-100"
                >
                  Edit
                </Link>
              </div>
            ))}
          </div>
          </div>
        );
      })}
    </div>
  );
}

function DetailPanel(props: {
  job: DispatchJob;
  returnTo: string;
  closeHref: string;
  assignableUsers: AssignableCalendarUser[];
  view: CalendarUIView;
  date: string;
  tech?: string | null;
  prefillDate?: string | null;
  className?: string;
}) {
  const { job, returnTo, closeHref, assignableUsers, view, date, tech, prefillDate, className = '' } = props;
  const phone = customerPhone(job);
  const phoneHref = phoneHrefValue(phone);
  const hasPhone = Boolean(phoneHref);
  const customerId = String(job.customer_id ?? '').trim() || null;
  const locationId = String(job.location_id ?? '').trim() || null;
  const lifecycle = getCalendarDisplayStatus(job);
  const isCancelledJob = lifecycle === 'cancelled';
  const lifecycleLabel = lifecycle ? formatCalendarDisplayStatus(lifecycle) : 'Unknown';
  const lifecycleDotClass = lifecycle ? calendarStatusDotClass(lifecycle) : 'bg-slate-300';
  const normalizedTitle = normalizeRetestLinkedJobTitle(job.title) || `Job ${job.id.slice(0, 8)}`;
  const overviewChips = [job.job_type, job.contractor_name].map((value) => String(value ?? '').trim()).filter(Boolean);
  const workContextLabel = String(job.work_context_label ?? '').trim();

  return (
    <aside className={`overflow-y-auto bg-white p-4 sm:p-5 ${className}`}>
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-3">
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700/80">Job Inspector</p>
              <h3 className="text-lg font-semibold leading-tight text-[#0f1f35]">{normalizedTitle}</h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="font-medium text-slate-700">{customerName(job)}</span>
                <span className="text-slate-300">•</span>
                <span>{job.city || 'No city'}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                <span className={`h-2 w-2 rounded-full ${lifecycleDotClass}`} />
                {lifecycleLabel}
              </span>
              {overviewChips.map((chip) => (
                <span key={`${job.id}-${chip}`} className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  {chip}
                </span>
              ))}
            </div>
            {workContextLabel ? (
              <div className="mt-2 text-xs text-slate-500">
                <span className="font-medium text-slate-600">Work included:</span> {workContextLabel}
              </div>
            ) : null}
          </div>
          <CalendarInspectorCloseButton closeHref={closeHref} />
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <div className="space-y-1.5">
            <p className="truncate text-sm font-medium text-slate-800">{customerAddressLine1(job)}</p>
            <p className="truncate text-xs text-slate-500">{customerAddressLine2(job)}</p>
            <p className="text-sm text-slate-700">{phone || 'Phone not available'}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {hasPhone ? (
              <a href={`tel:${phoneHref}`} className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100">
                Call Customer
              </a>
            ) : (
              <span className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-2 text-center text-xs font-medium text-slate-400">Call Customer</span>
            )}

            {hasPhone ? (
              <a href={`sms:${phoneHref}`} className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100">
                Open SMS App
              </a>
            ) : (
              <span className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-2 text-center text-xs font-medium text-slate-400">Open SMS App</span>
            )}

            {isCancelledJob ? (
              <>
                <span className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-center text-xs font-medium text-slate-400">
                  Called
                </span>
                <span className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-center text-xs font-medium text-slate-400">
                  Text Attempt Logged
                </span>
              </>
            ) : (
              <>
                <form action={logCustomerContactAttemptFromForm}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="method" value="call" />
                  <input type="hidden" name="result" value="spoke" />
                  <input type="hidden" name="return_to" value={buildCalendarHref(view, date, { job: job.id, tech })} />
                  <input type="hidden" name="success_banner" value="contact_attempt_logged_call" />
                  <SubmitButton className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100" loadingText="...">
                    Called
                  </SubmitButton>
                </form>
                <form action={logCustomerContactAttemptFromForm}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="method" value="text" />
                  <input type="hidden" name="result" value="sent" />
                  <input type="hidden" name="return_to" value={buildCalendarHref(view, date, { job: job.id, tech })} />
                  <input type="hidden" name="success_banner" value="contact_attempt_logged_text" />
                  <SubmitButton className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100" loadingText="...">
                    Log Text Attempt
                  </SubmitButton>
                </form>
              </>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">Logs communication attempts only; does not confirm carrier delivery.</p>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-950/5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700/80">Work included</p>
          {workContextLabel ? (
            <p className="mt-2 text-sm text-slate-700">{workContextLabel}</p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No visit scope items added.</p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <CalendarOpenJobButton
            href={`/jobs/${job.id}`}
            className="inline-flex min-h-10 items-center rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
            loadingLabel="Opening..."
          >
            Open Job
          </CalendarOpenJobButton>
          {customerId ? (
            <Link href={`/customers/${customerId}`} className="inline-flex min-h-10 items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
              Open Customer
            </Link>
          ) : null}
          {locationId ? (
            <Link href={`/locations/${locationId}`} className="inline-flex min-h-10 items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
              Open Location
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {isCancelledJob ? (
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm shadow-slate-950/5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Read only</p>
            <p className="mt-1 text-xs text-slate-600">
              This cancelled job remains visible as a historical calendar record. Schedule and assignment edits are disabled in the calendar inspector.
            </p>
          </section>
        ) : (
          <>
        <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_28px_-20px_rgba(15,31,53,0.28)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700/80">Appointment</p>
              <p className="mt-1 text-xs text-slate-500">Set the visit date and arrival window.</p>
            </div>
            {job.scheduled_date ? (
              <p className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-800">
                {formatBusinessDateUS(job.scheduled_date)}
                {job.window_start ? ` · ${displayWindowLA(job.window_start, job.window_end) ?? ''}` : ''}
              </p>
            ) : (
              <p className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500">Appointment not set</p>
            )}
          </div>
          <form action={updateJobScheduleFromForm} className="grid gap-3">
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="return_to" value={returnTo} />
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Date
              <input type="date" name="scheduled_date" defaultValue={prefillDate ?? job.scheduled_date ?? ''} className="min-h-11 rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                Start
                <input type="time" name="window_start" defaultValue={job.window_start ?? ''} className="min-h-11 rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900" />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                End
                <input type="time" name="window_end" defaultValue={job.window_end ?? ''} className="min-h-11 rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900" />
              </label>
            </div>
            <SubmitButton className="min-h-11 rounded-md bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700" loadingText="Saving...">
              Save Schedule
            </SubmitButton>
          </form>
          {job.scheduled_date ? (
            <form action={updateJobScheduleFromForm} className="mt-3 border-t border-slate-100 pt-3">
              <input type="hidden" name="job_id" value={job.id} />
              <input type="hidden" name="return_to" value={returnTo} />
              <input type="hidden" name="unschedule" value="1" />
              <SubmitButton className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-500 transition hover:border-red-200 hover:text-red-700" loadingText="Removing...">
                Unschedule
              </SubmitButton>
            </form>
          ) : null}
        </section>

        <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_28px_-20px_rgba(15,31,53,0.28)]">
          <div className="mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700/80">Field Team</p>
            <p className="mt-1 text-xs text-slate-500">Assign or remove internal technicians for this visit.</p>
          </div>
          <form action={assignJobAssigneeFromForm} className="grid gap-3">
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="tab" value="ops" />
            <input type="hidden" name="return_to" value={returnTo} />
            <select name="user_id" className="min-h-11 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900" defaultValue="" required>
              <option value="" disabled>
                Select internal user
              </option>
              {assignableUsers.map((user) => (
                <option key={user.user_id} value={user.user_id}>
                  {user.display_name}
                </option>
              ))}
            </select>
            <SubmitButton className="min-h-11 rounded-md bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800" loadingText="Assigning...">
              Assign Technician
            </SubmitButton>
          </form>

          {job.assignments.length ? (
            <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-4">
              {job.assignments.map((assignment) => (
                <div key={`${job.id}-${assignment.user_id}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs">
                  <div className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">
                      {assignment.display_name}
                      {assignment.is_primary ? ' (primary)' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <form action={removeJobAssigneeFromForm}>
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="hidden" name="user_id" value={assignment.user_id} />
                      <input type="hidden" name="tab" value="ops" />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <SubmitButton className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:border-red-300 hover:bg-red-50" loadingText="...">
                        Remove
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
          </>
        )}
      </div>
    </aside>
  );
}

function MonthInspectorDaySummary(props: {
  date: string;
  jobs: DispatchJob[];
  tech?: string | null;
}) {
  const { date, jobs, tech } = props;

  if (!jobs.length) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-slate-200/80 bg-slate-50/70 px-3 py-4 text-xs text-slate-500">
        No scheduled jobs for this day.
      </div>
    );
  }

  const previewJobs = jobs.slice(0, 5);
  const remainingCount = Math.max(jobs.length - previewJobs.length, 0);

  return (
    <div className="mt-3 space-y-2.5">
      {previewJobs.map((job) => {
        const lifecycle = getCalendarDisplayStatus(job);
        const dotClass = calendarStatusDotClass(lifecycle);
        const needsTech = !!job.scheduled_date && (!job.assignments || job.assignments.length === 0);
        const cueParts = [listTimeWindowLabel(job.window_start, job.window_end), formatCalendarDisplayStatus(lifecycle)];

        return (
          <Link
            key={job.id}
            href={buildCalendarHref('month', date, { job: job.id, tech })}
            title={calendarJobTooltip(job)}
            scroll={false}
            className="block rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 shadow-[0_8px_22px_-18px_rgba(15,31,53,0.28)] transition hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50 hover:shadow-md"
          >
            <div className="flex items-start gap-2">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-slate-900">{normalizeRetestLinkedJobTitle(job.title) || shortTitle(job)}</div>
                <div className="mt-0.5 truncate text-[11px] text-slate-700">{job.city || 'City not available'}</div>
                <div className="truncate text-[11px] text-slate-500">{customerName(job)}</div>
                {String(job.work_context_label ?? '').trim() ? (
                  <div className="mt-0.5 truncate text-[11px] text-slate-500">Work: {String(job.work_context_label ?? '').trim()}</div>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">{cueParts.filter(Boolean).join(' · ')}</span>
                  {needsTech ? (
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">
                      No tech assigned
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </Link>
        );
      })}

      {remainingCount > 0 ? (
        <p className="px-1 text-[11px] text-slate-500">+{remainingCount} more scheduled job{remainingCount === 1 ? '' : 's'} for this day.</p>
      ) : null}
    </div>
  );
}

function CalendarQueueStatFallback() {
  return (
    <>
      <div className="rounded-xl border border-rose-100 bg-rose-50/60 px-3.5 py-3">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-rose-300" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-700/80">Needs Attention</p>
        </div>
        <div className="mt-2 h-8 w-14 rounded-md bg-white/80 shadow-inner" />
      </div>
      <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-3.5 py-3">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Unscheduled</p>
        </div>
        <div className="mt-2 h-8 w-14 rounded-md bg-white shadow-inner" />
      </div>
    </>
  );
}

async function CalendarQueueStats(props: {
  queuePromise: Promise<DispatchCalendarQueueData>;
  activeTech?: string | null;
  noTechScheduledCount: number;
}) {
  const queue = await props.queuePromise;
  const attentionWindowScheduledJobs = props.activeTech
    ? filterJobsForTechnician(queue.scheduledAttentionWindowJobs, props.activeTech)
    : queue.scheduledAttentionWindowJobs;
  const hiddenScheduledJobs = attentionWindowScheduledJobs.filter((job) => !isDispatchVisibleForLayout(job));
  const attentionCount = hiddenScheduledJobs.length + props.noTechScheduledCount;

  return (
    <>
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-800">Needs Attention</p>
        </div>
        <p className="mt-1.5 text-3xl font-bold tabular-nums text-[#0f1f35]">{attentionCount}</p>
      </div>
      <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-3.5 py-3">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-slate-400" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Unscheduled</p>
        </div>
        <p className="mt-1.5 text-3xl font-bold tabular-nums text-[#0f1f35]">{queue.unassignedScheduledJobs.length}</p>
      </div>
    </>
  );
}

function CalendarQueueSidebarFallback() {
  return (
    <>
      <section className="rounded-xl border border-l-4 border-l-rose-300 border-rose-100 bg-rose-50/50 p-3 shadow-[0_12px_30px_-24px_rgba(15,31,53,0.2)]">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-700/80">Scheduled Jobs Needing Attention</h3>
        <p className="mt-1 text-[11px] text-rose-800/70">Loading attention queue...</p>
        <div className="mt-3 space-y-2">
          <div className="h-16 rounded-xl border border-rose-100 bg-white/80" />
          <div className="h-16 rounded-xl border border-rose-100 bg-white/60" />
        </div>
      </section>
      <section className="rounded-xl border border-l-4 border-l-[#0f1f35]/50 border-slate-200/80 bg-white p-3 shadow-[0_12px_30px_-24px_rgba(15,31,53,0.3)]">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700/80">Needs Scheduling</h3>
        <p className="mt-1 text-[11px] text-slate-500">Loading scheduling queue...</p>
        <div className="mt-3 space-y-2">
          <div className="h-20 rounded-xl border border-slate-200/80 bg-slate-50" />
          <div className="h-20 rounded-xl border border-slate-200/80 bg-slate-50/70" />
        </div>
      </section>
    </>
  );
}

async function CalendarQueueSidebar(props: {
  queuePromise: Promise<DispatchCalendarQueueData>;
  uiView: CalendarUIView;
  anchorDate: string;
  activeTech?: string | null;
}) {
  const queue = await props.queuePromise;
  const attentionWindowScheduledJobs = props.activeTech
    ? filterJobsForTechnician(queue.scheduledAttentionWindowJobs, props.activeTech)
    : queue.scheduledAttentionWindowJobs;
  const hiddenScheduledJobs = attentionWindowScheduledJobs
    .filter((job) => !isDispatchVisibleForLayout(job))
    .sort((a, b) => {
      const dateA = String(a.scheduled_date ?? '');
      const dateB = String(b.scheduled_date ?? '');
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return String(a.window_start ?? '').localeCompare(String(b.window_start ?? ''));
    });
  const unscheduledJobs = queue.unassignedScheduledJobs;

  return (
    <>
      {hiddenScheduledJobs.length ? (
        <section className="rounded-xl border border-l-4 border-l-rose-500 border-rose-200/80 bg-rose-50/70 p-3 shadow-[0_12px_30px_-24px_rgba(15,31,53,0.2)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-800">Scheduled Jobs Needing Attention</h3>
              <p className="mt-0.5 text-[11px] text-rose-800/75">Scheduled but missing required info. Open each job before dispatching.</p>
            </div>
          </div>
          <div className="max-h-[32vh] space-y-2 overflow-y-auto pr-1">
            {hiddenScheduledJobs.map((job) => {
              const issueSummary = dispatchVisibilityIssueLabels(job).join(' Â· ') || 'Needs review';
              const lifecycle = getCalendarDisplayStatus(job);
              const isCancelledJob = lifecycle === 'cancelled';

              return (
                <CalendarDragJobLink
                  key={`hidden-scheduled-${job.id}`}
                  href={buildCalendarHref(props.uiView, job.scheduled_date ?? props.anchorDate, { job: job.id, tech: props.activeTech })}
                  mobileHref={`/jobs/${job.id}`}
                  title={calendarJobTooltip(job)}
                  draggable={!isCancelledJob}
                  jobId={job.id}
                  windowStart={job.window_start}
                  windowEnd={job.window_end}
                  jobTitle={shortTitle(job)}
                  jobCity={job.city}
                  assigneeSummary={Array.isArray(job.assignments) ? job.assignments.map((a) => a.display_name).filter(Boolean).join(', ') : null}
                  hasNoTechAssigned={!job.assignments || job.assignments.length === 0}
                  scroll={false}
                  className={`group block rounded-xl border border-rose-200/80 bg-white/90 px-3 py-3 transition ${isCancelledJob ? 'cursor-default opacity-80' : 'cursor-grab hover:-translate-y-px hover:border-rose-300 hover:bg-white hover:shadow-md active:cursor-grabbing active:opacity-85'}`}
                >
                  <p className="truncate text-xs font-semibold text-slate-900">{shortTitle(job)}</p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-600">{formatBusinessDateUS(job.scheduled_date ?? props.anchorDate)}</p>
                  <p className="mt-1 truncate text-[11px] font-medium text-rose-900">{issueSummary}</p>
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-rose-700/90 group-hover:text-rose-800">
                    {isCancelledJob
                      ? 'Historical cancelled record'
                      : props.uiView === 'list'
                      ? 'Open to review'
                      : 'Open to schedule'}
                  </p>
                </CalendarDragJobLink>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-l-4 border-l-[#0f1f35] border-slate-200/80 bg-white p-3 shadow-[0_12px_30px_-24px_rgba(15,31,53,0.3)]">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700/80">Needs Scheduling</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {'Open or drag a job to place it on the schedule.'}
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            {unscheduledJobs.length}
          </span>
        </div>
        <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
          {unscheduledJobs.length ? (
            unscheduledJobs.map((job) => {
              const cueLabels = unscheduledJobCueLabels(job);
              const customerLabel = customerName(job);
              const addressLine = customerAddressLine1(job);
              const cityLabel = String(job.city ?? '').trim();

              return (
                <CalendarDragJobLink
                  key={`unassigned-${job.id}`}
                  href={buildCalendarHref(props.uiView, props.anchorDate, { job: job.id, tech: props.activeTech, inspector: null })}
                  mobileHref={`/jobs/${job.id}`}
                  title={calendarJobTooltip(job)}
                  draggable
                  jobId={job.id}
                  windowStart={job.window_start}
                  windowEnd={job.window_end}
                  jobTitle={shortTitle(job)}
                  jobCity={job.city}
                  assigneeSummary={null}
                  hasNoTechAssigned={true}
                  scroll={false}
                  className="group block cursor-grab rounded-xl border border-slate-200/80 bg-white px-3 py-3 shadow-[0_8px_20px_-16px_rgba(15,31,53,0.28)] transition hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50 hover:shadow-md active:cursor-grabbing active:opacity-85"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-xs font-semibold text-slate-900">{shortTitle(job)}</p>
                    {cueLabels.length ? (
                      <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600">
                        {cueLabels[0]}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-[11px] font-medium text-slate-700">{customerLabel}</p>
                  <p className="truncate text-[11px] text-slate-600">{addressLine}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                    {cityLabel ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 truncate">{cityLabel}</span> : null}
                    {cueLabels.slice(1).map((label) => (
                      <span key={`${job.id}-${label}`} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 leading-none text-[9px] font-medium text-slate-600">
                        {label}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-500 group-hover:text-slate-700">
                    {'Open to schedule'}
                  </p>
                </CalendarDragJobLink>
              );
            })
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300/80 bg-slate-50/70 px-3 py-6 text-center text-xs text-slate-500">No unscheduled jobs.</div>
          )}
        </div>
      </section>
    </>
  );
}

function CalendarQueueInspectorFallback(props: { className?: string }) {
  return (
    <div className={`${props.className ?? ''} bg-white p-4`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700/80">Inspector</p>
      <div className="mt-3 space-y-2">
        <div className="h-4 w-2/3 rounded bg-slate-100" />
        <div className="h-20 rounded-xl border border-slate-200 bg-slate-50" />
        <div className="h-10 rounded-xl border border-slate-200 bg-slate-50" />
      </div>
    </div>
  );
}

function CalendarRosterControlsFallback(props: { activeFilterLabel: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700/80">Dispatch Focus</p>
          <p className="mt-0.5 text-xs text-slate-500">Loading technician filters...</p>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          {props.activeFilterLabel}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <span className="h-9 w-28 rounded-full border border-slate-200 bg-white" />
        <span className="h-9 w-24 rounded-full border border-slate-200 bg-white" />
        <span className="h-9 w-32 rounded-full border border-slate-200 bg-white" />
      </div>
    </div>
  );
}

async function CalendarDispatchFocusControls(props: {
  rosterPromise: Promise<DispatchCalendarRosterData>;
  uiView: CalendarUIView;
  anchorDate: string;
  activeTech?: string | null;
  selectedUserIds: string[];
  activeUnassignedFilter: boolean;
  activeFilterLabel: string;
}) {
  const roster = await props.rosterPromise;
  if (!roster.assignableUsers.length) return null;
  const selectedUserIds = props.activeUnassignedFilter ? [] : props.selectedUserIds;
  const selectedUserIdSet = new Set(selectedUserIds);
  const allUsersSelected = roster.assignableUsers.length > 0 && selectedUserIds.length === roster.assignableUsers.length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700/80">Dispatch Focus</p>
          <p className="mt-0.5 text-xs text-slate-500">Filter the board without changing the schedule or assignments.</p>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          {props.activeFilterLabel}
        </div>
      </div>

      <form action="/calendar" method="get" className="mt-2.5 space-y-2">
        <input type="hidden" name="view" value={props.uiView} />
        <input type="hidden" name="date" value={props.anchorDate} />
        <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:items-center">
          <button
            type="submit"
            className="inline-flex min-h-10 min-w-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 sm:min-h-9 sm:rounded-full"
          >
            Apply
          </button>
          <Link
            href={buildCalendarHref(props.uiView, props.anchorDate, {
              tech: roster.assignableUsers.map((user) => user.user_id),
            })}
            className={`inline-flex min-h-10 min-w-0 items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors sm:min-h-9 sm:rounded-full ${
              allUsersSelected && !props.activeUnassignedFilter
                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            All
          </Link>
          <Link
            href={buildCalendarHref(props.uiView, props.anchorDate)}
            className={`inline-flex min-h-10 min-w-0 items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors sm:min-h-9 sm:rounded-full ${
              !props.activeTech
                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            Clear
          </Link>
          <Link
            href={buildCalendarHref(props.uiView, props.anchorDate, { tech: CALENDAR_TECH_FILTER_UNASSIGNED })}
            className={`inline-flex min-h-10 min-w-0 items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors sm:min-h-9 sm:rounded-full ${
              props.activeUnassignedFilter
                ? 'border-rose-800 bg-rose-700 text-white shadow-sm'
                : 'border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50'
            }`}
          >
            Unassigned
          </Link>
        </div>
        <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto pr-1 min-[430px]:grid-cols-2 sm:flex sm:max-h-40 sm:flex-wrap">
          {roster.assignableUsers.map((user) => {
            const checked = selectedUserIdSet.has(user.user_id);
            return (
              <label
                key={user.user_id}
                title={user.display_name}
                className={`inline-flex min-h-10 min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors sm:min-h-9 sm:rounded-full ${
                  checked
                    ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  name="tech"
                  value={user.user_id}
                  defaultChecked={checked}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                />
                <span className="min-w-0 truncate">{user.display_name}</span>
              </label>
            );
          })}
        </div>
      </form>
    </div>
  );
}

function CalendarBlockControlsFallback() {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_12px_30px_-24px_rgba(15,31,53,0.28)]">
      <div className="flex items-center gap-3">
        <span className="h-9 w-9 rounded-md border border-slate-200 bg-slate-50" />
        <div className="min-w-0 flex-1">
          <div className="h-4 w-28 rounded bg-slate-100" />
          <div className="mt-2 h-3 w-40 rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

async function CalendarBlockControls(props: {
  rosterPromise: Promise<DispatchCalendarRosterData>;
  selectedBlock: DispatchCalendarBlockEvent | null;
  uiView: CalendarUIView;
  anchorDate: string;
  activeTech?: string | null;
  activeTechnicianUserId?: string | null;
}) {
  const roster = await props.rosterPromise;
  if (!roster.assignableUsers.length) return null;

  if (props.selectedBlock) {
    return (
      <div className="rounded-xl border border-emerald-200/80 bg-white p-3 shadow-[0_12px_30px_-24px_rgba(15,31,53,0.24)]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Edit Block</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Update the existing internal block and save your corrections.</p>
          </div>
          <Link
            href={buildCalendarHref(props.uiView, props.anchorDate, { tech: props.activeTech })}
            scroll={false}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 transition hover:bg-slate-100"
          >
            Close
          </Link>
        </div>
        <div className="mt-3 border-t border-slate-200 pt-3">
          <form action={updateCalendarBlockEventFromForm} className="grid gap-2">
            <input type="hidden" name="event_id" value={props.selectedBlock.id} />
            <input type="hidden" name="return_to" value={buildCalendarHref(props.uiView, props.anchorDate, { tech: props.activeTech })} />
            <input
              name="title"
              defaultValue={props.selectedBlock.title}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-900 placeholder:text-slate-400"
              placeholder="Event name"
              required
            />
            <select
              name="internal_user_id"
              defaultValue={props.selectedBlock.internal_user_id}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-900"
              required
            >
              {roster.assignableUsers.map((user) => (
                <option key={`edit-block-user-${user.user_id}`} value={user.user_id}>
                  {user.display_name}
                </option>
              ))}
            </select>
            <div className="grid gap-1.5 sm:grid-cols-2">
              <input
                type="date"
                name="date"
                defaultValue={props.selectedBlock.calendar_date}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-900 sm:col-span-2"
                required
              />
              <input
                type="time"
                name="start_time"
                defaultValue={props.selectedBlock.start_time}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-900"
                required
              />
              <input
                type="time"
                name="end_time"
                defaultValue={props.selectedBlock.end_time}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-900"
                required
              />
            </div>
            <textarea
              name="description"
              rows={2}
              defaultValue={props.selectedBlock.description ?? ''}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-900 placeholder:text-slate-400"
              placeholder="Optional details"
            />
            <SubmitButton className="rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-emerald-700" loadingText="Saving...">
              Save Block
            </SubmitButton>
          </form>
          <details className="group mt-2 border-t border-slate-200 pt-2">
            <summary className="flex cursor-pointer list-none items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-red-700 transition hover:bg-red-100 [&::-webkit-details-marker]:hidden">
              Delete Block
            </summary>
            <div className="mt-2 rounded-xl border border-red-200 bg-red-50/80 p-3">
              <p className="text-[12px] font-medium text-red-800">Delete this calendar block? This cannot be undone.</p>
              <form action={deleteCalendarBlockEventFromForm} className="mt-2">
                <input type="hidden" name="event_id" value={props.selectedBlock.id} />
                <input type="hidden" name="return_to" value={buildCalendarHref(props.uiView, props.anchorDate, { tech: props.activeTech })} />
                <SubmitButton className="w-full rounded-xl bg-red-600 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-red-700" loadingText="Deleting...">
                  Confirm Delete
                </SubmitButton>
              </form>
            </div>
          </details>
        </div>
      </div>
    );
  }

  if (props.uiView !== 'day' && props.uiView !== 'week' && props.uiView !== 'month') return null;

  return (
    <details id="calendar-add-block" className="group rounded-xl border border-slate-200/80 bg-white shadow-[0_12px_30px_-24px_rgba(15,31,53,0.28)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg border-l-4 border-l-emerald-500 px-3 py-3 text-left transition hover:border-slate-300 hover:bg-emerald-50/40 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700">
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">Add blocked time</p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
              {props.uiView === 'month'
                ? 'Hold the selected day for travel, lunch, parts pickup, or office time.'
                : 'Hold a schedule window for travel, lunch, parts pickup, or office time.'}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition group-open:bg-emerald-700">
          <span className="group-open:hidden">Add</span>
          <span className="hidden group-open:inline">Open</span>
        </span>
      </summary>
      <div className="border-t border-slate-200 px-3 pb-3 pt-3">
        <form action={createCalendarBlockEventFromForm} className="grid gap-2">
          <input type="hidden" name="return_to" value={buildCalendarHref(props.uiView, props.anchorDate, { tech: props.activeTech })} />
          <input
            name="title"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-900 placeholder:text-slate-400"
            placeholder="Event name"
            required
          />
          <select
            name="internal_user_id"
            defaultValue={props.activeTechnicianUserId ?? ''}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-900"
            required
          >
            <option value="" disabled>
              Select technician
            </option>
            {roster.assignableUsers.map((user) => (
              <option key={`block-user-${user.user_id}`} value={user.user_id}>
                {user.display_name}
              </option>
            ))}
          </select>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <input
              type="date"
              name="date"
              defaultValue={props.anchorDate}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-900 sm:col-span-2"
              required
            />
            <input
              type="time"
              name="start_time"
              defaultValue="08:00"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-900"
              required
            />
            <input
              type="time"
              name="end_time"
              defaultValue="09:00"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-900"
              required
            />
          </div>
          <textarea
            name="description"
            rows={2}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-900 placeholder:text-slate-400"
            placeholder="Optional details"
          />
          <SubmitButton className="rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-emerald-700" loadingText="Creating...">
            Add Block
          </SubmitButton>
        </form>
      </div>
    </details>
  );
}

async function CalendarSelectedJobInspector(props: {
  rosterPromise: Promise<DispatchCalendarRosterData>;
  job: DispatchJob;
  returnTo: string;
  closeHref: string;
  view: CalendarUIView;
  date: string;
  tech?: string | null;
  prefillDate?: string | null;
  className?: string;
}) {
  const roster = await props.rosterPromise;
  return (
    <DetailPanel
      job={props.job}
      returnTo={props.returnTo}
      closeHref={props.closeHref}
      assignableUsers={roster.assignableUsers}
      view={props.view}
      date={props.date}
      tech={props.tech}
      prefillDate={props.prefillDate}
      className={props.className}
    />
  );
}

async function CalendarQueueSelectedJobInspector(props: {
  queuePromise: Promise<DispatchCalendarQueueData>;
  rosterPromise: Promise<DispatchCalendarRosterData>;
  selectedJobId: string;
  returnTo: string;
  closeHref: string;
  view: CalendarUIView;
  date: string;
  tech?: string | null;
  prefillDate?: string | null;
  className?: string;
}) {
  const [queue, roster] = await Promise.all([props.queuePromise, props.rosterPromise]);
  const selectedJob =
    queue.unassignedScheduledJobs.find((job) => job.id === props.selectedJobId) ||
    queue.scheduledAttentionWindowJobs.find((job) => job.id === props.selectedJobId) ||
    null;

  if (!selectedJob) return null;

  return (
    <DetailPanel
      job={selectedJob}
      returnTo={props.returnTo}
      closeHref={props.closeHref}
      assignableUsers={roster.assignableUsers}
      view={props.view}
      date={props.date}
      tech={props.tech}
      prefillDate={props.prefillDate}
      className={props.className}
    />
  );
}

export async function CalendarView(props: Props) {
  const uiView = normalizeView(props.view);
  const todayDate = todayYmdLA();
  const baseMode: DispatchViewMode = uiView === 'week' ? 'week' : 'day';
  const activeTech = normalizeCalendarTechFilter(props.tech);
  const selectedCalendarUserIds = parseCalendarSelectedUserIds(activeTech);
  const activeUnassignedFilter = isUnassignedTechFilter(activeTech);
  const anchorForRange = parseISO(normalizeYmd(props.date) ?? todayDate);
  const monthStartDate = formatDate(startOfMonth(anchorForRange), 'yyyy-MM-dd');
  const monthEndDate = formatDate(endOfMonth(anchorForRange), 'yyyy-MM-dd');
  const monthVisibleRange = getMonthVisibleRange(formatDate(anchorForRange, 'yyyy-MM-dd'));

  const calendarLoadParams = {
    mode: baseMode,
    anchorDate: props.date,
    view: uiView,
    techFilterType: activeUnassignedFilter ? 'unassigned' : selectedCalendarUserIds.length ? 'specific' : 'all',
    selectedUserIds: selectedCalendarUserIds,
    ...(uiView === 'month'
      ? {
          rangeStartDate: monthVisibleRange.startDate,
          rangeEndDate: monthVisibleRange.endDate,
        }
      : uiView === 'list'
      ? {
          rangeStartDate: monthStartDate,
          rangeEndDate: monthEndDate,
        }
      : {}),
  } as const;

  const queuePromise = getDispatchCalendarQueueData(calendarLoadParams);
  const rosterPromise = getDispatchCalendarRosterData(calendarLoadParams);
  const [data, roster] = await Promise.all([
    getDispatchCalendarBoardData(calendarLoadParams),
    rosterPromise,
  ]);
  const selectedCalendarUserIdSet = new Set(selectedCalendarUserIds);
  const appliedSelectedCalendarUsers = activeUnassignedFilter
    ? []
    : selectedCalendarUserIds.length
    ? roster.assignableUsers.filter((user) => selectedCalendarUserIdSet.has(user.user_id))
    : [];
  const hasAppliedSelectedCalendarUsers = appliedSelectedCalendarUsers.length > 0;
  const appliedSelectedCalendarUserIds = appliedSelectedCalendarUsers.map((user) => user.user_id);
  const renderedCalendarUsers = activeUnassignedFilter
    ? []
    : hasAppliedSelectedCalendarUsers
    ? appliedSelectedCalendarUsers
    : roster.assignableUsers;
  const includeUnassignedColumn = activeUnassignedFilter || !hasAppliedSelectedCalendarUsers;
  const activeCalendarTechParam = activeUnassignedFilter
    ? CALENDAR_TECH_FILTER_UNASSIGNED
    : hasAppliedSelectedCalendarUsers
    ? appliedSelectedCalendarUserIds.join(',')
    : null;
  const activeCalendarTechnicianUserId = appliedSelectedCalendarUserIds.length === 1 ? appliedSelectedCalendarUserIds[0] : null;

  const returnTo = buildReturnTo(uiView, data.anchorDate, activeCalendarTechParam);
  const banner = bannerMessage(props.banner);
  const selectedJobId = String(props.job ?? '').trim();
  const selectedBlockId = String(props.block ?? '').trim();
  const prefillDate = normalizeYmd(props.prefillDate);
  let canonicalBlockEventsForRange = data.calendarBlockEvents;

  let canonicalDispatchJobsByDay = data.range.days.map((day) => ({
    date: day.date,
    jobs: day.jobs,
  }));

  let canonicalDispatchJobsForRange: DispatchJob[] =
    data.range.days.flatMap((day) => day.jobs);

  if (uiView === 'month' || uiView === 'list') {
    canonicalBlockEventsForRange = [...data.calendarBlockEvents].sort((a, b) => {
      if (a.calendar_date !== b.calendar_date) return a.calendar_date.localeCompare(b.calendar_date);
      if (a.start_time !== b.start_time) return a.start_time.localeCompare(b.start_time);
      return a.title.localeCompare(b.title);
    });

    canonicalDispatchJobsByDay = data.range.days
      .map((day) => ({
        date: day.date,
        jobs: day.jobs,
      }))
      .filter((day) => day.jobs.length > 0);

    canonicalDispatchJobsForRange = canonicalDispatchJobsByDay.flatMap((day) => day.jobs);
  }

  const techFilteredBlockEvents = activeUnassignedFilter
    ? []
    : hasAppliedSelectedCalendarUsers
    ? canonicalBlockEventsForRange.filter((event) => selectedCalendarUserIdSet.has(event.internal_user_id))
    : canonicalBlockEventsForRange;
  const selectedBlock = canonicalBlockEventsForRange.find((event) => event.id === selectedBlockId) ?? null;

  const selectedJob =
    (selectedJobId ? canonicalDispatchJobsForRange.find((job) => job.id === selectedJobId) : null) ||
    null;

  const inspectorStateRaw = String(props.inspector ?? '').trim().toLowerCase();
  const inspectorForcedOpen = inspectorStateRaw === '1' || inspectorStateRaw === 'open';
  const inspectorForcedClosed = inspectorStateRaw === '0' || inspectorStateRaw === 'closed';
  const inspectorOpen = inspectorForcedOpen || (Boolean(selectedJob) && !inspectorForcedClosed);

  const hideInspectorHref = buildCalendarHref(uiView, data.anchorDate, {
    tech: activeCalendarTechParam,
    job: selectedJobId || null,
    block: selectedBlockId || null,
    prefillDate,
    inspector: '0',
  });

  const techFilteredScheduledJobsByDay = activeCalendarTechParam
    ? canonicalDispatchJobsByDay.map((day) => ({
        ...day,
        jobs: filterJobsForTechnician(day.jobs, activeCalendarTechParam),
      }))
    : canonicalDispatchJobsByDay;

  const consistentlyVisibleJobsByDay = techFilteredScheduledJobsByDay.map((day) => ({
    ...day,
    jobs: day.jobs.filter((job) => isDispatchVisibleForLayout(job)),
  }));

  // Tech filter — applied at the presentation layer only, no backend change.
  const filteredJobsByDay = consistentlyVisibleJobsByDay;

  const filteredJobsForRange = filteredJobsByDay.flatMap((day) => day.jobs);
  const filteredDayJobs = filteredJobsByDay.find((day) => day.date === data.day.date)?.jobs ?? [];
  const selectedDayJobs = techFilteredScheduledJobsByDay.find((day) => day.date === data.anchorDate)?.jobs ?? [];
  const mondayAnchorDate = startOfWeekMondayYmd(data.anchorDate);
  const hasRightPanelContent = uiView === 'month' || Boolean(selectedJob) || Boolean(selectedJobId);
  const inspectorSelectedKey = `${selectedJobId}|${selectedBlockId}|${data.anchorDate}`;
  // Kept for the desktop right-aside fallback render below; the mobile xl:hidden
  // overlay further down still gates on inspectorOpen directly (untouched).
  const showDesktopInspectorColumn = hasRightPanelContent;

  const targetDateForView = (viewValue: CalendarUIView) => {
    if (viewValue === 'week' || viewValue === 'list') return mondayAnchorDate;
    return data.anchorDate;
  };

  let headerLabel = '';
  if (uiView === 'month') {
    const anchor = parseISO(data.anchorDate);
    headerLabel = `Month view for ${formatDate(anchor, 'MMMM yyyy')}`;
  } else if (uiView === 'list') {
    const anchor = parseISO(data.anchorDate);
    headerLabel = `List view for ${formatDate(anchor, 'MMMM yyyy')}`;
  } else if (baseMode === 'day') {
    headerLabel = `Day view for ${formatBusinessDateUS(data.day.date)}`;
  } else {
    headerLabel = `Week view ${formatBusinessDateUS(data.week.startDate)} - ${formatBusinessDateUS(data.week.endDate)}`;
  }

  const scheduledJobCount = filteredJobsForRange.length;
  const noTechScheduledCount = filteredJobsForRange.filter(
    (job) => job.scheduled_date && (!job.assignments || job.assignments.length === 0),
  ).length;
  const activeFilterLabel = activeUnassignedFilter
    ? 'Unassigned only'
    : hasAppliedSelectedCalendarUsers
    ? `${appliedSelectedCalendarUsers.length} technician${appliedSelectedCalendarUsers.length === 1 ? '' : 's'}`
    : 'All technicians + unassigned';

  const statusLegend = (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Status Legend
      </span>
      {CALENDAR_STATUS_LEGEND.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5 rounded-full border border-transparent bg-white/70 px-2.5 py-1">
          <span className={`h-2 w-2 rounded-full ${item.dot}`} />
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="space-y-5 pb-8">
      {banner ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-sm shadow-emerald-950/5">{banner}</div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200/70 shadow-[0_24px_52px_-30px_rgba(15,31,53,0.34)]">
        {/* ── Command identity band (dark) ── */}
        <div className="bg-gradient-to-br from-[#0f1f35] to-[#162640] px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-300/80">Dispatch Workspace</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">Calendar</h2>
              <p className="mt-1.5 max-w-xl text-sm leading-6 text-white/55">
                {headerLabel}. Review scheduled work, drag jobs into place, and keep unassigned visits visible.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-1 rounded-xl border border-white/10 bg-white/5 p-1 sm:self-start">
              {(['day', 'week', 'month', 'list'] as CalendarUIView[]).map((viewValue) => (
                <Link
                  key={viewValue}
                  href={buildCalendarHref(viewValue, targetDateForView(viewValue), { tech: activeCalendarTechParam, job: selectedJobId || null })}
                  className={`inline-flex min-h-9 items-center justify-center rounded-lg px-4 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                    uiView === viewValue
                      ? 'bg-white text-[#0f1f35] shadow-sm'
                      : 'text-white/65 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {viewValue.charAt(0).toUpperCase() + viewValue.slice(1)}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* ── Navigation + stats + filters (light) ── */}
        <div className="bg-white px-4 py-4 sm:px-5 sm:py-5">
          <NavLinks view={uiView} date={data.anchorDate} tech={activeCalendarTechParam} />

          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-800">Scheduled</p>
              </div>
              <p className="mt-1.5 text-3xl font-bold tabular-nums text-[#0f1f35]">{scheduledJobCount}</p>
            </div>
            <Suspense fallback={<CalendarQueueStatFallback />}>
              <CalendarQueueStats queuePromise={queuePromise} activeTech={activeCalendarTechParam} noTechScheduledCount={noTechScheduledCount} />
            </Suspense>
            <div className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Focus</p>
              </div>
              <p className="mt-1.5 truncate text-sm font-semibold text-[#0f1f35]">{activeFilterLabel}</p>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2.5 sm:hidden">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-800">Next dispatch action</p>
            <p className="mt-0.5 text-xs text-blue-900/90">Open a job in Needs Scheduling, then place it on today&apos;s board.</p>
          </div>

          <details open className="group mt-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-2 shadow-sm shadow-slate-950/5 sm:hidden">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm shadow-slate-950/5 transition hover:border-slate-300 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="block truncate">Filters &amp; Status</span>
                <span className="block text-[11px] font-medium text-slate-500 group-open:hidden">Show filters</span>
                <span className="hidden text-[11px] font-medium text-slate-500 group-open:block">Hide filters</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                {activeFilterLabel}
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
              </span>
            </summary>

            <div className="mt-3 space-y-3 px-1 pb-1">
              <Suspense fallback={<CalendarRosterControlsFallback activeFilterLabel={activeFilterLabel} />}>
                <CalendarDispatchFocusControls
                  rosterPromise={rosterPromise}
                  uiView={uiView}
                  anchorDate={data.anchorDate}
                  activeTech={activeCalendarTechParam}
                  selectedUserIds={appliedSelectedCalendarUserIds}
                  activeUnassignedFilter={activeUnassignedFilter}
                  activeFilterLabel={activeFilterLabel}
                />
              </Suspense>
              <div className="border-t border-slate-200 pt-3">{statusLegend}</div>
            </div>
          </details>

          <div className="mt-3 hidden rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 sm:block">
            <Suspense fallback={<CalendarRosterControlsFallback activeFilterLabel={activeFilterLabel} />}>
              <CalendarDispatchFocusControls
                rosterPromise={rosterPromise}
                uiView={uiView}
                anchorDate={data.anchorDate}
                activeTech={activeCalendarTechParam}
                selectedUserIds={appliedSelectedCalendarUserIds}
                activeUnassignedFilter={activeUnassignedFilter}
                activeFilterLabel={activeFilterLabel}
              />
            </Suspense>
            <div className="mt-3 border-t border-slate-200 pt-3">{statusLegend}</div>
          </div>
        </div>
      </div>

      <CalendarLayoutShell
        hasRightPanelContent={hasRightPanelContent}
        initialRightOpen={inspectorOpen}
        selectedKey={inspectorSelectedKey}
        leftPanel={
          <>
            <Suspense fallback={<CalendarBlockControlsFallback />}>
              <CalendarBlockControls
                rosterPromise={rosterPromise}
                selectedBlock={selectedBlock}
                uiView={uiView}
                anchorDate={data.anchorDate}
                activeTech={activeCalendarTechParam}
                activeTechnicianUserId={activeCalendarTechnicianUserId}
              />
            </Suspense>

            <Suspense fallback={<CalendarQueueSidebarFallback />}>
              <CalendarQueueSidebar queuePromise={queuePromise} uiView={uiView} anchorDate={data.anchorDate} activeTech={activeCalendarTechParam} />
            </Suspense>
          </>
        }
        rightPanel={
          showDesktopInspectorColumn ? (
            selectedJob ? (
              <Suspense fallback={<CalendarQueueInspectorFallback className="sticky top-24 max-h-[calc(100vh-7rem)] rounded-2xl border border-slate-200 shadow-lg shadow-slate-950/10" />}>
                <CalendarSelectedJobInspector
                  rosterPromise={rosterPromise}
                  job={selectedJob}
                  returnTo={returnTo}
                  closeHref={hideInspectorHref}
                  view={uiView}
                  date={data.anchorDate}
                  tech={activeCalendarTechParam}
                  prefillDate={prefillDate}
                  className="sticky top-24 max-h-[calc(100vh-7rem)] rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-950/10"
                />
              </Suspense>
            ) : selectedJobId ? (
              <Suspense fallback={<CalendarQueueInspectorFallback className="sticky top-24 max-h-[calc(100vh-7rem)] rounded-2xl border border-slate-200 shadow-lg shadow-slate-950/10" />}>
                <CalendarQueueSelectedJobInspector
                  queuePromise={queuePromise}
                  rosterPromise={rosterPromise}
                  selectedJobId={selectedJobId}
                  returnTo={returnTo}
                  closeHref={hideInspectorHref}
                  view={uiView}
                  date={data.anchorDate}
                  tech={activeCalendarTechParam}
                  prefillDate={prefillDate}
                  className="sticky top-24 max-h-[calc(100vh-7rem)] rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-950/10"
                />
              </Suspense>
            ) : uiView === 'month' ? (
              <div className="sticky top-24 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_20px_48px_-30px_rgba(15,31,53,0.3)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700/80">Inspector</p>
                <h3 className="mt-1 text-sm font-semibold text-[#0f1f35]">{formatDayDateHeader(data.anchorDate)}</h3>
                <p className="mt-2 text-xs text-slate-600">
                  {selectedDayJobs.length} scheduled job{selectedDayJobs.length === 1 ? '' : 's'} in this day context.
                </p>
                <MonthInspectorDaySummary date={data.anchorDate} jobs={selectedDayJobs} tech={activeCalendarTechParam} />
                <p className="mt-3 text-xs text-slate-600">
                  Use Add Block in the planner column to create an internal block for this selected day.
                </p>
                <p className="mt-3 text-xs text-slate-500">Select a preview row or job chip to open schedule and assignment controls.</p>
              </div>
            ) : null
          ) : null
        }
        mainContent={
          <>
          {uiView === 'list' ? (
            <section className="overflow-x-auto px-1">
              <CalendarMobileListAnchor
                rangeStartDate={monthStartDate}
                rangeEndDate={monthEndDate}
                currentDate={todayDate}
                focusedDate={data.anchorDate}
              />
              <AgendaList jobs={filteredJobsForRange} blockEvents={techFilteredBlockEvents} date={data.anchorDate} visibleDates={data.range.days.map((day) => day.date)} tech={activeCalendarTechParam} selectedBlockId={selectedBlockId} />
            </section>
          ) : uiView === 'month' ? (
            <section>
              <div className="lg:hidden px-1">
                <AgendaList jobs={filteredJobsForRange} blockEvents={techFilteredBlockEvents} date={data.anchorDate} tech={activeCalendarTechParam} selectedBlockId={selectedBlockId} />
              </div>
              <div className="hidden overflow-x-auto lg:block">
                <CalendarMonthGrid
                  monthDate={data.anchorDate}
                  jobs={filteredJobsForRange}
                  blockEvents={techFilteredBlockEvents}
                  tech={activeCalendarTechParam}
                  selectedDate={data.anchorDate}
                  selectedJobId={selectedJobId}
                  selectedBlockId={selectedBlockId}
                />
              </div>
            </section>
          ) : baseMode === 'day' ? (
            <section className="space-y-2 overflow-x-auto overscroll-x-contain pb-2 [-webkit-overflow-scrolling:touch]">
              <div className="flex items-center justify-between px-1">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700/80">Day Schedule</p>
                  <p className="mt-0.5 text-lg font-bold text-[#0f1f35]">{formatDayDateHeader(data.day.date)}</p>
                </div>
              </div>
              <CalendarDispatchGrid
                jobs={filteredDayJobs}
                blockEvents={techFilteredBlockEvents}
                assignableUsers={renderedCalendarUsers}
                includeUnassignedColumn={includeUnassignedColumn}
                mode={baseMode}
                date={data.day.date}
                tech={activeCalendarTechParam}
                selectedJobId={selectedJobId}
                dropReturnTo={buildCalendarHref(uiView, data.anchorDate, { tech: activeCalendarTechParam, inspector: '1' })}
                scheduleAction={updateJobScheduleFromForm}
                reassignAction={reassignAndRescheduleJobFromForm}
              />
            </section>
          ) : (
            <section className="space-y-5 overflow-x-auto overscroll-x-contain pb-2 [-webkit-overflow-scrolling:touch]">
              {filteredJobsByDay.map((day) => (
                <div key={day.date} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700/80">Weekday Schedule</p>
                      <h3 className="mt-0.5 text-lg font-bold text-[#0f1f35]">{formatDayDateHeader(day.date)}</h3>
                    </div>
                    <p className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">{day.jobs.length} jobs</p>
                  </div>
                  <CalendarDispatchGrid
                    jobs={day.jobs}
                    blockEvents={techFilteredBlockEvents}
                    assignableUsers={renderedCalendarUsers}
                    includeUnassignedColumn={includeUnassignedColumn}
                    mode={baseMode}
                    date={day.date}
                    tech={activeCalendarTechParam}
                    selectedJobId={selectedJobId}
                    dropReturnTo={buildCalendarHref(uiView, data.anchorDate, { tech: activeCalendarTechParam, inspector: '1' })}
                    scheduleAction={updateJobScheduleFromForm}
                    reassignAction={reassignAndRescheduleJobFromForm}
                  />
                </div>
              ))}
            </section>
          )}
          </>
        }
      />

      {inspectorOpen && (selectedJob || selectedJobId) ? (
        <div className="fixed inset-0 z-50 bg-black/30 px-3 pb-4 pt-24 sm:px-4 sm:pb-5 sm:pt-28 xl:hidden">
          {selectedJob ? (
            <Suspense fallback={<CalendarQueueInspectorFallback className="ml-auto max-h-[calc(100vh-8rem)] max-w-md rounded-2xl border border-slate-200 shadow-xl shadow-slate-950/10" />}>
              <CalendarSelectedJobInspector
                rosterPromise={rosterPromise}
                job={selectedJob}
                returnTo={returnTo}
                closeHref={hideInspectorHref}
                view={uiView}
                date={data.anchorDate}
                tech={activeCalendarTechParam}
                prefillDate={prefillDate}
                className="ml-auto max-h-[calc(100vh-8rem)] max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-950/10"
              />
            </Suspense>
          ) : (
            <Suspense fallback={<CalendarQueueInspectorFallback className="ml-auto max-h-[calc(100vh-8rem)] max-w-md rounded-2xl border border-slate-200 shadow-xl shadow-slate-950/10" />}>
              <CalendarQueueSelectedJobInspector
                queuePromise={queuePromise}
                rosterPromise={rosterPromise}
                selectedJobId={selectedJobId}
                returnTo={returnTo}
                closeHref={hideInspectorHref}
                view={uiView}
                date={data.anchorDate}
                tech={activeCalendarTechParam}
                prefillDate={prefillDate}
                className="ml-auto max-h-[calc(100vh-8rem)] max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-950/10"
              />
            </Suspense>
          )}
        </div>
      ) : null}
    </div>
  );
}
