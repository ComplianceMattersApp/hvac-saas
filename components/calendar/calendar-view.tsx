import Link from 'next/link';
import { X } from 'lucide-react';
import { eachWeekOfInterval, endOfMonth, format as formatDate, parseISO, startOfMonth } from 'date-fns';

import CalendarMonthGrid from './CalendarMonthGrid';
import { calendarStatusDotClass, formatCalendarDisplayStatus, getCalendarDisplayStatus } from './calendar-status';
import SubmitButton from '@/components/SubmitButton';
import {
  assignJobAssigneeFromForm,
  removeJobAssigneeFromForm,
  updateJobScheduleFromForm,
} from '@/lib/actions/job-actions';
import { logCustomerContactAttemptFromForm } from '@/lib/actions/job-contact-actions';
import { getDispatchCalendarData, type DispatchJob, type DispatchViewMode } from '@/lib/actions/calendar';
import { displayWindowLA, formatBusinessDateUS } from '@/lib/utils/schedule-la';

type CalendarUIView = 'day' | 'week' | 'list' | 'month';

type Props = {
  view?: string;
  date?: string;
  banner?: string;
  job?: string;
  tech?: string;
  prefillDate?: string;
};

const TECH_COLOR_PALETTE = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-orange-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-lime-500',
  'bg-sky-500',
  'bg-fuchsia-500',
  'bg-amber-500',
];

const STATUS_LEGEND = [
  { key: 'scheduled', label: 'Scheduled', dot: 'bg-sky-500' },
  { key: 'on_my_way', label: 'On My Way', dot: 'bg-blue-500' },
  { key: 'in_progress', label: 'In Progress', dot: 'bg-indigo-600' },
  { key: 'field_complete', label: 'Field Complete', dot: 'bg-amber-500' },
  { key: 'closed', label: 'Closed', dot: 'bg-green-600' },
  { key: 'cancelled', label: 'Cancelled', dot: 'bg-slate-400' },
];

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
  };

  const key = String(banner ?? '').trim();
  if (!key) return null;
  return map[key] ?? null;
}

function dispatchBlockClass(status?: string | null) {
  const value = String(status ?? '').toLowerCase();
  if (value === 'failed') return 'border-red-200 bg-red-100 text-red-900';
  if (value === 'pending_info') return 'border-amber-200 bg-amber-100 text-amber-900';
  if (value === 'on_hold') return 'border-slate-300 bg-slate-100 text-slate-900';
  if (value === 'cancelled') return 'border-slate-300 border-dashed bg-slate-100 text-slate-500';
  if (value === 'closed') return 'border-slate-300 border-dashed bg-slate-100 text-slate-500';
  if (value === 'scheduled') return 'border-blue-200 bg-blue-100 text-blue-900';
  return 'border-indigo-200 bg-indigo-50 text-indigo-900';
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
  return String(extended.customer_phone ?? extended.customer_phone_number ?? extended.phone ?? '').trim();
}

function phoneHrefValue(rawPhone: string) {
  return rawPhone.replace(/[^\d+]/g, '');
}

function buildReturnTo(view: CalendarUIView, date: string, tech?: string | null) {
  const q = new URLSearchParams();
  q.set('view', view);
  q.set('date', date);
  if (tech) q.set('tech', tech);
  return `/calendar?${q.toString()}`;
}

function buildCalendarHref(
  view: CalendarUIView,
  date: string,
  params?: { banner?: string; job?: string | null; tech?: string | null; prefillDate?: string | null },
) {
  const q = new URLSearchParams();
  q.set('view', view);
  q.set('date', date);
  if (params?.banner) q.set('banner', params.banner);
  if (params?.job) q.set('job', params.job);
  if (params?.tech) q.set('tech', params.tech);
  if (params?.prefillDate) q.set('prefill_date', params.prefillDate);
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

function currentMinutesLA(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function parseMinutes(value?: string | null): number | null {
  const raw = String(value ?? '').trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function isDispatchVisibleForLayout(job: DispatchJob) {
  const ops = String(job.ops_status ?? '').toLowerCase();
  if (!job.scheduled_date || !job.window_start) return false;
  if (!Array.isArray(job.assignments) || job.assignments.length === 0) return false;
  if (ops === 'on_hold') return false;
  return true;
}

function blockTimeLabel(startMinutes: number, endMinutes: number) {
  const toLabel = (minutes: number) => {
    const h24 = Math.floor(minutes / 60);
    const m = minutes % 60;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const suffix = h24 >= 12 ? 'PM' : 'AM';
    return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
  };
  return `${toLabel(startMinutes)} - ${toLabel(endMinutes)}`;
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
  const title = String(job.title ?? '').trim();
  if (!title) return `Job ${job.id.slice(0, 8)}`;
  return title.length > 42 ? `${title.slice(0, 39)}...` : title;
}

function uniqueById(users: Array<{ user_id: string; display_name: string }>) {
  const seen = new Set<string>();
  const out: Array<{ user_id: string; display_name: string }> = [];
  for (const user of users) {
    const id = String(user.user_id ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ user_id: id, display_name: String(user.display_name ?? '').trim() || 'Tech' });
  }
  return out;
}

function splitTechnicianLabel(displayName: string, userId: string) {
  const rawName = String(displayName ?? '').trim() || 'Technician';
  const emailMatch = rawName.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  const emailFromName = emailMatch ? emailMatch[1] : '';
  const userIsEmail = /@/.test(String(userId ?? '')) ? String(userId) : '';
  const email = emailFromName || userIsEmail || 'email unavailable';
  const name = emailFromName ? rawName.replace(emailFromName, '').replace(/[()]/g, '').trim() || 'Technician' : rawName;
  return { name, email };
}

function colorClassForUserId(userId: string) {
  let hash = 0;
  const raw = String(userId ?? '');
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return TECH_COLOR_PALETTE[hash % TECH_COLOR_PALETTE.length];
}

function initialsFromName(name: string) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'T';
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? '';
  const letters = `${first}${second}`.trim();
  return (letters || first || 'T').toUpperCase();
}

function dispatchVisibilityIssueLabels(job: DispatchJob) {
  const labels: string[] = [];
  if (String(job.ops_status ?? '').trim().toLowerCase() === 'on_hold') labels.push('On hold');
  if (!job.window_start) labels.push('Time not set');
  if (!Array.isArray(job.assignments) || job.assignments.length === 0) labels.push('Needs tech');
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
    <div className="flex flex-wrap items-center gap-2">
      <Link href={buildCalendarHref(view, prev, { tech })} className="rounded px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
        Previous
      </Link>
      <Link href={buildCalendarHref(view, todayTarget, { tech })} className="rounded px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
        Today
      </Link>
      <Link href={buildCalendarHref(view, next, { tech })} className="rounded px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
        Next
      </Link>
    </div>
  );
}

function DispatchGrid(props: {
  jobs: DispatchJob[];
  mode: DispatchViewMode;
  date: string;
  selectedJobId?: string;
}) {
  const { jobs, mode, date, selectedJobId } = props;
  const startHour = 6;
  const endHour = 18;
  const hourHeight = 50;
  const gridStartMinutes = startHour * 60;
  const gridEndMinutes = endHour * 60;

  const gridJobs = jobs
    .flatMap((job) =>
      job.assignments.map((assignment) => ({
        job,
        user_id: assignment.user_id,
      })),
    )
    .filter((item) => {
      if (mode === 'day') return String(item.job.scheduled_date) === date;
      return true;
    });

  type LaneItem = {
    id: string;
    user_id: string;
    job: DispatchJob;
    start: number;
    end: number;
    lane: number;
    laneCount: number;
  };

  const laneItemsByUser = new Map<string, LaneItem[]>();

  for (const item of gridJobs) {
    const start = parseMinutes(item.job.window_start);
    const parsedEnd = parseMinutes(item.job.window_end);
    if (start == null) continue;

    const clampedStart = Math.max(start, gridStartMinutes);
    const clampedEnd = Math.min(
      Math.max(parsedEnd ?? clampedStart + 60, clampedStart + 30),
      gridEndMinutes,
    );

    const row: LaneItem = {
      id: `${item.job.id}-${item.user_id}`,
      user_id: item.user_id,
      job: item.job,
      start: clampedStart,
      end: clampedEnd,
      lane: 0,
      laneCount: 1,
    };

    if (!laneItemsByUser.has(item.user_id)) laneItemsByUser.set(item.user_id, []);
    laneItemsByUser.get(item.user_id)!.push(row);
  }

  for (const [userId, rows] of laneItemsByUser.entries()) {
    rows.sort((a, b) => (a.start - b.start) || (a.end - b.end));

    const laneEndTimes: number[] = [];
    let groupStart = 0;
    let groupEnd = -1;

    const finalizeGroup = (startIndex: number, endIndex: number) => {
      if (endIndex < startIndex) return;
      let maxLane = 0;
      for (let i = startIndex; i <= endIndex; i += 1) {
        if (rows[i].lane > maxLane) maxLane = rows[i].lane;
      }
      const count = Math.max(maxLane + 1, 1);
      for (let i = startIndex; i <= endIndex; i += 1) {
        rows[i].laneCount = count;
      }
    };

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];

      let laneIndex = laneEndTimes.findIndex((end) => end <= row.start);
      if (laneIndex < 0) {
        laneIndex = laneEndTimes.length;
        laneEndTimes.push(row.end);
      } else {
        laneEndTimes[laneIndex] = row.end;
      }
      row.lane = laneIndex;

      if (i === 0) {
        groupStart = 0;
        groupEnd = row.end;
      } else if (row.start < groupEnd) {
        groupEnd = Math.max(groupEnd, row.end);
      } else {
        finalizeGroup(groupStart, i - 1);
        groupStart = i;
        groupEnd = row.end;
      }
    }

    finalizeGroup(groupStart, rows.length - 1);
    laneItemsByUser.set(userId, rows);
  }

  const techMap = new Map<string, string>();
  for (const item of gridJobs) {
    const techName = item.job.assignments.find((a) => a.user_id === item.user_id)?.display_name ?? 'Tech';
    techMap.set(item.user_id, techName);
  }

  const columns = uniqueById(
    Array.from(techMap.entries()).map(([user_id, display_name]) => ({ user_id, display_name })),
  );

  const totalGridHeight = (endHour - startHour) * hourHeight;

  const isTodayColumn = String(date) === todayYmdLA();
  const nowMinutes = currentMinutesLA();
  const showNowLine = isTodayColumn && nowMinutes != null && nowMinutes >= gridStartMinutes && nowMinutes <= gridEndMinutes;
  const nowTop = showNowLine ? ((Number(nowMinutes) - gridStartMinutes) / 60) * hourHeight : 0;

  if (!columns.length) {
    return <div className="py-10 text-sm text-slate-500">No assigned scheduled jobs for this {mode}.</div>;
  }

  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  return (
    <div className="overflow-hidden bg-white">
      <div className="grid" style={{ gridTemplateColumns: `84px repeat(${columns.length}, minmax(190px, 1fr))` }}>
        <div className="border-b border-r border-slate-100 bg-slate-50 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Time</div>
        {columns.map((col) => {
          const tech = splitTechnicianLabel(col.display_name, col.user_id);
          return (
            <div key={col.user_id} className="border-b border-r border-slate-100 bg-slate-50 px-3 py-2.5">
              <p className="truncate text-sm font-semibold text-slate-900">{tech.name}</p>
              <p className="truncate text-[11px] text-slate-500">{tech.email}</p>
            </div>
          );
        })}

        <div className="relative border-r border-slate-100 bg-white" style={{ height: `${totalGridHeight}px` }}>
          {Array.from({ length: endHour - startHour }, (_, i) => (
            <div
              key={`shade-${i}`}
              className={i % 2 === 0 ? 'absolute left-0 right-0 bg-slate-50/40' : 'absolute left-0 right-0 bg-white'}
              style={{ top: `${i * hourHeight}px`, height: `${hourHeight}px` }}
            />
          ))}
          {hours.map((hour) => {
            const y = (hour - startHour) * hourHeight;
            const label = hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
            return (
              <div key={hour} className="absolute left-0 right-0" style={{ top: `${y}px` }}>
                <div className="-translate-y-1/2 px-3 text-xs text-slate-500">{label}</div>
              </div>
            );
          })}
          {showNowLine ? (
            <>
              <div className="absolute left-0 right-0 border-t border-rose-400/70" style={{ top: `${nowTop}px` }} />
              <div className="absolute left-2 -translate-y-1/2 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700" style={{ top: `${nowTop}px` }}>
                Now
              </div>
            </>
          ) : null}
        </div>

        {columns.map((col) => (
          <div key={col.user_id} className="relative border-r border-slate-100 bg-white" style={{ height: `${totalGridHeight}px` }}>
            {Array.from({ length: endHour - startHour }, (_, i) => (
              <div
                key={`col-${col.user_id}-shade-${i}`}
                className={i % 2 === 0 ? 'absolute left-0 right-0 bg-slate-50/35' : 'absolute left-0 right-0 bg-white'}
                style={{ top: `${i * hourHeight}px`, height: `${hourHeight}px` }}
              />
            ))}
            {hours.map((hour) => {
              const y = (hour - startHour) * hourHeight;
              return <div key={hour} className="absolute left-0 right-0 border-t border-slate-100/70" style={{ top: `${y}px` }} />;
            })}
            {showNowLine ? <div className="absolute left-0 right-0 border-t border-rose-400/70" style={{ top: `${nowTop}px` }} /> : null}

            {(laneItemsByUser.get(col.user_id) ?? []).map((row) => {
              const { job } = row;
              const top = ((row.start - gridStartMinutes) / 60) * hourHeight;
              const height = Math.max(((row.end - row.start) / 60) * hourHeight, 36);
              const isSelected = selectedJobId === job.id;
              const assignees = Array.isArray(job.assignments) ? job.assignments : [];
              const colorBars = assignees.slice(0, 3);
              const overflowCount = Math.max(assignees.length - colorBars.length, 0);
              const initials = assignees.slice(0, 2).map((a) => initialsFromName(a.display_name)).join(' ');
              const lifecycle = getCalendarDisplayStatus(job);
              const isCancelled = lifecycle === 'cancelled';

              const laneWidthPct = 100 / Math.max(row.laneCount, 1);
              const laneLeftPct = row.lane * laneWidthPct;
              const laneGapPx = 3;

              return (
                <Link
                  key={row.id}
                  href={buildCalendarHref(mode, date, { job: job.id })}
                  scroll={false}
                  className={`absolute left-1 right-1 rounded-md border py-0.5 pr-1.5 pl-5 shadow-sm transition hover:cursor-pointer hover:shadow-md hover:brightness-[1.03] ${dispatchBlockClass(job.ops_status)} ${isSelected ? 'ring-2 ring-slate-800/45 border-slate-700' : ''}`}
                  style={{
                    top: `${top}px`,
                    height: `${height}px`,
                    left: `calc(${laneLeftPct}% + ${laneGapPx}px)`,
                    width: `calc(${laneWidthPct}% - ${laneGapPx * 2}px)`,
                    right: 'auto',
                  }}
                >
                  <div className="absolute inset-y-1 left-1 flex items-start gap-0.5">
                    {colorBars.map((assignment) => (
                      <span
                        key={`${job.id}-${assignment.user_id}-bar`}
                        className={`inline-block rounded-sm ${colorClassForUserId(assignment.user_id)} ${isSelected ? 'w-1.5' : 'w-1'} h-full`}
                        title={assignment.display_name}
                      />
                    ))}
                    {overflowCount > 0 ? (
                      <span className="inline-flex h-3 min-w-3 items-center justify-center rounded-sm bg-slate-700/75 px-0.5 text-[9px] font-semibold text-white">
                        +{overflowCount}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs font-semibold leading-4">{shortTitle(job)}</p>
                  {isCancelled ? (
                    <span className="ml-1 inline-block rounded border border-slate-300 bg-slate-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600">
                      Cancelled
                    </span>
                  ) : null}
                  {job.scheduled_date && (!job.assignments || job.assignments.length === 0) ? (
                    <span className="ml-2 inline-block rounded border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      Needs Tech
                    </span>
                  ) : null}
                  <p className="truncate text-[11px] leading-4 opacity-90">{job.city || job.contractor_name || 'No city or contractor'}</p>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className="truncate text-[10px] font-medium uppercase tracking-wide opacity-80">{blockTimeLabel(row.start, row.end)}</p>
                    {initials ? <p className="truncate text-[9px] font-semibold uppercase tracking-wide opacity-70">{initials}</p> : null}
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function AgendaList(props: {
  jobs: DispatchJob[];
  date: string;
  tech?: string | null;
}) {
  const { jobs, date, tech } = props;

  const grouped = new Map<string, DispatchJob[]>();
  for (const job of jobs) {
    if (!job.scheduled_date) continue;
    if (!grouped.has(job.scheduled_date)) grouped.set(job.scheduled_date, []);
    grouped.get(job.scheduled_date)?.push(job);
  }

  const sortedDates = Array.from(grouped.keys()).sort();

  if (!sortedDates.length) {
    return <div className="py-8 text-sm text-slate-500">No scheduled jobs for this month.</div>;
  }

  return (
    <div className="space-y-6">
      {sortedDates.map((dateKey) => (
        <div key={dateKey}>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700">{formatDayDateHeader(dateKey)}</span>
            <span className="text-xs text-slate-400">
              {(grouped.get(dateKey)?.length ?? 0)} job{(grouped.get(dateKey)?.length ?? 0) > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-1">
            {(grouped.get(dateKey) ?? []).map((job) => {
              const needsTech = job.scheduled_date && (!job.assignments || job.assignments.length === 0);
              const lifecycle = getCalendarDisplayStatus(job);
              const dotClass = calendarStatusDotClass(lifecycle);
              const faded = lifecycle === 'closed' || lifecycle === 'cancelled' ? 'opacity-50' : '';

              return (
                <Link
                  key={job.id}
                  href={buildCalendarHref('list', date, { job: job.id, tech })}
                  scroll={false}
                  className={`block rounded border border-slate-200 bg-white px-3 py-2 shadow-sm hover:bg-slate-50 ${faded}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{job.job_address || shortTitle(job)}</div>
                      <div className="truncate text-[11px] text-slate-600">{job.city || 'No city'}</div>
                      <div className="truncate text-[11px] text-slate-600">{listTimeWindowLabel(job.window_start, job.window_end)}</div>
                      <div className="truncate text-[11px] text-slate-500">{job.job_type || job.title}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{formatCalendarDisplayStatus(lifecycle)}</span>
                      {needsTech ? (
                        <span className="inline-block rounded border border-amber-200 bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800">
                          Needs Tech
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailPanel(props: {
  job: DispatchJob;
  returnTo: string;
  assignableUsers: Array<{ user_id: string; display_name: string }>;
  view: CalendarUIView;
  date: string;
  tech?: string | null;
  prefillDate?: string | null;
  className?: string;
}) {
  const { job, returnTo, assignableUsers, view, date, tech, prefillDate, className = '' } = props;
  const phone = customerPhone(job);
  const phoneHref = phoneHrefValue(phone);
  const hasPhone = Boolean(phoneHref);
  const customerId = String(job.customer_id ?? '').trim() || null;
  const locationId = String(job.location_id ?? '').trim() || null;

  return (
    <aside className={`overflow-y-auto bg-white p-4 pt-5 pr-5 sm:p-5 sm:pt-6 sm:pr-6 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-2 border-b pb-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Job Details</p>
          <h3 className="text-base font-semibold text-gray-900">{job.title || `Job ${job.id.slice(0, 8)}`}</h3>
          <p className="mt-1 text-xs text-gray-600">
            {customerName(job)} • {job.city || 'No city'}
          </p>
          <p className="mt-2 truncate text-xs text-gray-600">{customerAddressLine1(job)}</p>
          <p className="mt-0.5 truncate text-xs text-gray-500">{customerAddressLine2(job)}</p>
          <p className="mt-1.5 text-xs text-gray-700">{phone || 'Phone not available'}</p>
          <div className="mt-2.5">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Contact Actions</p>
            <div className="grid grid-cols-2 gap-2">
              {hasPhone ? (
                <a href={`tel:${phoneHref}`} className="rounded border px-2.5 py-1 text-center text-xs font-medium text-gray-700 hover:bg-gray-50">
                  Call Customer
                </a>
              ) : (
                <span className="rounded border px-2.5 py-1 text-center text-xs font-medium text-gray-400">Call Customer</span>
              )}

              {hasPhone ? (
                <a href={`sms:${phoneHref}`} className="rounded border px-2.5 py-1 text-center text-xs font-medium text-gray-700 hover:bg-gray-50">
                  Send Text
                </a>
              ) : (
                <span className="rounded border px-2.5 py-1 text-center text-xs font-medium text-gray-400">Send Text</span>
              )}

              <form action={logCustomerContactAttemptFromForm}>
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="method" value="call" />
                <input type="hidden" name="result" value="spoke" />
                <input type="hidden" name="return_to" value={buildCalendarHref(view, date, { job: job.id, tech })} />
                <input type="hidden" name="success_banner" value="contact_attempt_logged_call" />
                <SubmitButton className="rounded border px-2.5 py-1 text-center text-xs font-medium text-gray-700 hover:bg-gray-50" loadingText="...">
                  Called
                </SubmitButton>
              </form>
              <form action={logCustomerContactAttemptFromForm}>
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="method" value="text" />
                <input type="hidden" name="result" value="sent" />
                <input type="hidden" name="return_to" value={buildCalendarHref(view, date, { job: job.id, tech })} />
                <input type="hidden" name="success_banner" value="contact_attempt_logged_text" />
                <SubmitButton className="rounded border px-2.5 py-1 text-center text-xs font-medium text-gray-700 hover:bg-gray-50" loadingText="...">
                  Text Sent
                </SubmitButton>
              </form>
            </div>
          </div>
        </div>
        <Link
          href={buildCalendarHref(view, date, { tech })}
          scroll={false}
          aria-label="Close details"
          className="mr-1 mt-1 shrink-0 rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <X className="h-4 w-4" />
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap gap-2.5">
        <Link href={`/jobs/${job.id}`} className="rounded border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          Open Job
        </Link>
        {customerId ? (
          <Link href={`/customers/${customerId}`} className="rounded border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            Open Customer
          </Link>
        ) : null}
        {locationId ? (
          <Link href={`/locations/${locationId}`} className="rounded border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            Open Location
          </Link>
        ) : null}
      </div>

      <div className="space-y-5">
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Schedule</p>
          {job.scheduled_date ? (
            <p className="mb-3 rounded bg-sky-50 px-2 py-1.5 text-xs text-sky-800">
              {formatBusinessDateUS(job.scheduled_date)}
              {job.window_start ? ` · ${displayWindowLA(job.window_start, job.window_end) ?? ''}` : ''}
            </p>
          ) : (
            <p className="mb-3 text-xs text-slate-400">Not yet scheduled</p>
          )}
          <form action={updateJobScheduleFromForm} className="grid gap-3">
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="return_to" value={returnTo} />
            <input type="date" name="scheduled_date" defaultValue={prefillDate ?? job.scheduled_date ?? ''} className="rounded border px-2 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <input type="time" name="window_start" defaultValue={job.window_start ?? ''} className="rounded border px-2 py-2 text-sm" />
              <input type="time" name="window_end" defaultValue={job.window_end ?? ''} className="rounded border px-2 py-2 text-sm" />
            </div>
            <SubmitButton className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white" loadingText="Saving...">
              Save Schedule
            </SubmitButton>
          </form>
          {job.scheduled_date ? (
            <form action={updateJobScheduleFromForm} className="mt-3">
              <input type="hidden" name="job_id" value={job.id} />
              <input type="hidden" name="return_to" value={returnTo} />
              <input type="hidden" name="unschedule" value="1" />
              <SubmitButton className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-500 hover:border-red-200 hover:text-red-700" loadingText="Removing...">
                Unschedule
              </SubmitButton>
            </form>
          ) : null}
        </section>

        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Assignment</p>
          <form action={assignJobAssigneeFromForm} className="grid gap-3">
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="tab" value="ops" />
            <input type="hidden" name="return_to" value={returnTo} />
            <select name="user_id" className="rounded border px-2 py-2 text-sm" defaultValue="" required>
              <option value="" disabled>
                Select internal user
              </option>
              {assignableUsers.map((user) => (
                <option key={user.user_id} value={user.user_id}>
                  {user.display_name}
                </option>
              ))}
            </select>
            <SubmitButton className="rounded bg-gray-900 px-3 py-2 text-sm font-semibold text-white" loadingText="Assigning...">
              Assign Technician
            </SubmitButton>
          </form>

          {job.assignments.length ? (
            <div className="mt-4 space-y-2.5">
              {job.assignments.map((assignment) => (
                <div key={`${job.id}-${assignment.user_id}`} className="flex items-center justify-between gap-2 rounded border bg-gray-50 px-2.5 py-2 text-xs">
                  <span>
                    {assignment.display_name}
                    {assignment.is_primary ? ' (primary)' : ''}
                  </span>
                  <div className="flex items-center gap-2">
                    <form action={removeJobAssigneeFromForm}>
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="hidden" name="user_id" value={assignment.user_id} />
                      <input type="hidden" name="tab" value="ops" />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <SubmitButton className="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-700" loadingText="...">
                        Remove
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </aside>
  );
}

export async function CalendarView(props: Props) {
  const uiView = normalizeView(props.view);
  const todayDate = todayYmdLA();
  const baseMode: DispatchViewMode = uiView === 'week' ? 'week' : 'day';

  const data = await getDispatchCalendarData({
    mode: baseMode,
    anchorDate: props.date,
  });

  const activeTech = String(props.tech ?? '').trim() || null;
  const returnTo = buildReturnTo(uiView, data.anchorDate, activeTech);
  const banner = bannerMessage(props.banner);
  const selectedJobId = String(props.job ?? '').trim();
  const prefillDate = normalizeYmd(props.prefillDate);

  let canonicalDispatchJobsByDay = data.week.days.map((day) => ({
    date: day.date,
    jobs: day.jobs,
  }));

  let canonicalDispatchJobsForRange: DispatchJob[] =
    data.mode === 'day' ? data.day.jobs : data.week.days.flatMap((day) => day.jobs);

  if (uiView === 'month' || uiView === 'list') {
    const anchor = parseISO(data.anchorDate);
    const monthStart = startOfMonth(anchor);
    const monthEnd = endOfMonth(anchor);
    const weekAnchors = eachWeekOfInterval({ start: monthStart, end: monthEnd });

    const weekResults = await Promise.all(
      weekAnchors.map((weekDate) =>
        getDispatchCalendarData({
          mode: 'week',
          anchorDate: formatDate(weekDate, 'yyyy-MM-dd'),
        }),
      ),
    );

    const dayMap = new Map<string, DispatchJob[]>();

    for (const result of weekResults) {
      for (const day of result.week.days) {
        const existing = dayMap.get(day.date) ?? [];
        const merged = new Map(existing.map((job) => [job.id, job]));
        for (const job of day.jobs) merged.set(job.id, job);
        dayMap.set(day.date, Array.from(merged.values()));
      }
    }

    const monthNumber = anchor.getMonth();
    const yearNumber = anchor.getFullYear();

    canonicalDispatchJobsByDay = Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, jobs]) => ({
        date,
        jobs: jobs.filter((job) => {
          if (!job.scheduled_date) return false;
          const jobDate = parseISO(job.scheduled_date);
          return jobDate.getMonth() === monthNumber && jobDate.getFullYear() === yearNumber;
        }),
      }))
      .filter((day) => day.jobs.length > 0);

    canonicalDispatchJobsForRange = canonicalDispatchJobsByDay.flatMap((day) => day.jobs);
  }

  const selectedJob =
    (selectedJobId ? canonicalDispatchJobsForRange.find((job) => job.id === selectedJobId) : null) ||
    data.unassignedScheduledJobs.find((job) => job.id === selectedJobId) ||
    null;

  const techFilteredScheduledJobsByDay = activeTech
    ? canonicalDispatchJobsByDay.map((day) => ({
        ...day,
        jobs: day.jobs.filter((job) => job.assignments.some((a) => a.user_id === activeTech)),
      }))
    : canonicalDispatchJobsByDay;

  const consistentlyVisibleJobsByDay = techFilteredScheduledJobsByDay.map((day) => ({
    ...day,
    jobs: day.jobs.filter((job) => isDispatchVisibleForLayout(job)),
  }));

  const hiddenScheduledJobs = techFilteredScheduledJobsByDay
    .flatMap((day) => day.jobs.filter((job) => !isDispatchVisibleForLayout(job)))
    .sort((a, b) => {
      const dateA = String(a.scheduled_date ?? '');
      const dateB = String(b.scheduled_date ?? '');
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return String(a.window_start ?? '').localeCompare(String(b.window_start ?? ''));
    });

  // Tech filter — applied at the presentation layer only, no backend change.
  const filteredJobsByDay = consistentlyVisibleJobsByDay;

  const filteredJobsForRange = filteredJobsByDay.flatMap((day) => day.jobs);
  const filteredDayJobs = filteredJobsByDay.find((day) => day.date === data.day.date)?.jobs ?? [];
  const selectedDayJobs = techFilteredScheduledJobsByDay.find((day) => day.date === data.anchorDate)?.jobs ?? [];
  const mondayAnchorDate = startOfWeekMondayYmd(data.anchorDate);
  const showDesktopInspectorColumn = uiView === 'month' || Boolean(selectedJob);

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

  const unscheduledJobs = data.unassignedScheduledJobs;

  return (
    <div className="space-y-6 pb-8">
      {banner ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-base text-emerald-900">{banner}</div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dispatch Calendar</h2>
          <p className="mt-2 text-sm font-medium text-gray-500">{headerLabel}</p>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-xl bg-gray-100 p-2">
              {(['day', 'week', 'month', 'list'] as CalendarUIView[]).map((viewValue) => (
                <Link
                  key={viewValue}
                  href={buildCalendarHref(viewValue, targetDateForView(viewValue), { tech: activeTech, job: selectedJobId || null })}
                  className={`rounded-lg px-4 py-2 text-base font-semibold ${
                    uiView === viewValue ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {viewValue.charAt(0).toUpperCase() + viewValue.slice(1)}
                </Link>
              ))}
            </div>
            <NavLinks view={uiView} date={data.anchorDate} tech={activeTech} />
          </div>

          {data.assignableUsers.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={buildCalendarHref(uiView, data.anchorDate)}
                className={`rounded px-2.5 py-1 text-xs font-medium ${
                  !activeTech ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                All technicians
              </Link>
              {data.assignableUsers.map((user) => (
                <Link
                  key={user.user_id}
                  href={buildCalendarHref(uiView, data.anchorDate, { tech: user.user_id })}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    activeTech === user.user_id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {user.display_name}
                </Link>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            {STATUS_LEGEND.map((item) => (
              <span key={item.key} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${item.dot}`} />
                <span>{item.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className={`grid gap-5 ${showDesktopInspectorColumn ? 'xl:grid-cols-[260px_minmax(0,1fr)_360px]' : 'xl:grid-cols-[260px_minmax(0,1fr)]'}`}>
        <aside className="order-2 xl:order-1">
          {hiddenScheduledJobs.length ? (
            <>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Scheduled Jobs Needing Attention</h3>
              <div className="mt-2 max-h-[32vh] space-y-1 overflow-y-auto pr-1">
                {hiddenScheduledJobs.map((job) => {
                  const issueSummary = dispatchVisibilityIssueLabels(job).join(' · ') || 'Needs review';

                  return (
                    <Link
                      key={`hidden-scheduled-${job.id}`}
                      href={buildCalendarHref(uiView, job.scheduled_date ?? data.anchorDate, { job: job.id, tech: activeTech })}
                      draggable
                      scroll={false}
                      className="group block cursor-grab rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 shadow-sm transition hover:-translate-y-px hover:border-amber-300 hover:bg-amber-100 hover:shadow active:cursor-grabbing active:opacity-85"
                    >
                      <p className="truncate text-xs font-semibold text-slate-900">{shortTitle(job)}</p>
                      <p className="truncate text-[11px] text-slate-600">{formatBusinessDateUS(job.scheduled_date ?? data.anchorDate)}</p>
                      <p className="truncate text-[11px] text-amber-800">{issueSummary}</p>
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-amber-700/90 group-hover:text-amber-800">Drag to a day</p>
                    </Link>
                  );
                })}
              </div>
            </>
          ) : null}

          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unscheduled Jobs</h3>
          <div className="mt-2 max-h-[70vh] space-y-1 overflow-y-auto pr-1">
            {unscheduledJobs.length ? (
              unscheduledJobs.map((job) => (
                <Link
                  key={`unassigned-${job.id}`}
                  href={buildCalendarHref(uiView, data.anchorDate, { job: job.id, tech: activeTech })}
                  draggable
                  scroll={false}
                  className="group block cursor-grab rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-sm transition hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50 hover:shadow active:cursor-grabbing active:opacity-85"
                >
                  <p className="truncate text-xs font-semibold text-slate-900">{shortTitle(job)}</p>
                  <p className="truncate text-[11px] text-slate-600">{job.city || job.contractor_name || 'No city or contractor'}</p>
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-500 group-hover:text-slate-700">Drag to a day</p>
                </Link>
              ))
            ) : (
              <div className="py-2 text-xs text-slate-500">No unscheduled jobs.</div>
            )}
          </div>
        </aside>

        <main className="order-1 min-w-0 space-y-4 xl:order-2">
          {uiView === 'list' ? (
            <section className="overflow-x-auto px-1">
              <AgendaList jobs={filteredJobsForRange} date={data.anchorDate} tech={activeTech} />
            </section>
          ) : uiView === 'month' ? (
            <section>
              <div className="lg:hidden px-1">
                <AgendaList jobs={filteredJobsForRange} date={data.anchorDate} tech={activeTech} />
              </div>
              <div className="hidden overflow-x-auto lg:block">
                <CalendarMonthGrid
                  monthDate={data.anchorDate}
                  jobs={filteredJobsForRange}
                  tech={activeTech}
                  selectedDate={data.anchorDate}
                  selectedJobId={selectedJobId}
                />
              </div>
            </section>
          ) : baseMode === 'day' ? (
            <section className="overflow-x-auto">
              <DispatchGrid
                jobs={filteredDayJobs}
                mode={baseMode}
                date={data.day.date}
                selectedJobId={selectedJobId}
              />
            </section>
          ) : (
            <section className="space-y-6 overflow-x-auto">
              {filteredJobsByDay.map((day) => (
                <div key={day.date}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">{formatDayDateHeader(day.date)}</h3>
                    <p className="text-xs text-slate-500">{day.jobs.length} jobs</p>
                  </div>
                  <DispatchGrid
                    jobs={day.jobs}
                    mode={baseMode}
                    date={day.date}
                    selectedJobId={selectedJobId}
                  />
                </div>
              ))}
            </section>
          )}
        </main>

        {showDesktopInspectorColumn ? (
          <aside className="order-3 hidden xl:block">
            {selectedJob ? (
              <DetailPanel
                job={selectedJob}
                returnTo={returnTo}
                assignableUsers={data.assignableUsers}
                view={uiView}
                date={data.anchorDate}
                tech={activeTech}
                prefillDate={prefillDate}
                className="sticky top-24 max-h-[calc(100vh-7rem)] rounded-md border border-slate-200 bg-white shadow-lg"
              />
            ) : uiView === 'month' ? (
              <div className="sticky top-24 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inspector</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-900">{formatDayDateHeader(data.anchorDate)}</h3>
                <p className="mt-2 text-xs text-slate-600">
                  {selectedDayJobs.length} scheduled job{selectedDayJobs.length === 1 ? '' : 's'} in this day context.
                </p>
                <p className="mt-3 text-xs text-slate-500">Select a job chip to open schedule and assignment controls.</p>
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>

      {selectedJob ? (
        <div className="fixed inset-0 z-50 bg-black/30 px-3 pb-4 pt-24 sm:px-4 sm:pb-5 sm:pt-28 xl:hidden">
          <DetailPanel
            job={selectedJob}
            returnTo={returnTo}
            assignableUsers={data.assignableUsers}
            view={uiView}
            date={data.anchorDate}
            tech={activeTech}
            prefillDate={prefillDate}
            className="ml-auto max-h-[calc(100vh-8rem)] max-w-md rounded-xl border border-slate-200 shadow-xl"
          />
        </div>
      ) : null}
    </div>
  );
}