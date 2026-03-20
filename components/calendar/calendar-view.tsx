import Link from 'next/link';
import { X } from 'lucide-react';

import SubmitButton from '@/components/SubmitButton';
import {
  assignJobAssigneeFromForm,
  removeJobAssigneeFromForm,
  setPrimaryJobAssigneeFromForm,
  updateJobScheduleFromForm,
} from '@/lib/actions/job-actions';
import { getDispatchCalendarData, type DispatchJob, type DispatchViewMode } from '@/lib/actions/calendar';
import { displayWindowLA, formatBusinessDateUS } from '@/lib/utils/schedule-la';

type CalendarUIView = 'day' | 'week' | 'list';

type Props = {
  view?: string;
  date?: string;
  banner?: string;
  job?: string;
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

function bannerMessage(banner?: string) {
  const map: Record<string, string> = {
    schedule_saved: 'Schedule updated.',
    schedule_already_saved: 'Schedule was already up to date.',
    assignment_added: 'Assignee added.',
    assignment_added_primary: 'Assignee added and set as primary.',
    assignment_primary_set: 'Primary assignee updated.',
    assignment_removed: 'Assignee removed.',
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
  if (value === 'closed') return 'border-slate-300 border-dashed bg-slate-100 text-slate-500';
  if (value === 'scheduled') return 'border-blue-200 bg-blue-100 text-blue-900';
  return 'border-indigo-200 bg-indigo-50 text-indigo-900';
}

function customerName(job: DispatchJob) {
  const name = `${String(job.customer_first_name ?? '').trim()} ${String(job.customer_last_name ?? '').trim()}`.trim();
  return name || 'Customer not set';
}

function buildReturnTo(view: CalendarUIView, date: string) {
  const q = new URLSearchParams();
  q.set('view', view);
  q.set('date', date);
  return `/calendar?${q.toString()}`;
}

function buildCalendarHref(view: CalendarUIView, date: string, params?: { banner?: string; job?: string | null }) {
  const q = new URLSearchParams();
  q.set('view', view);
  q.set('date', date);
  if (params?.banner) q.set('banner', params.banner);
  if (params?.job) q.set('job', params.job);
  return `/calendar?${q.toString()}`;
}

function normalizeView(view?: string): CalendarUIView {
  const raw = String(view ?? '').trim().toLowerCase();
  if (raw === 'day') return 'day';
  if (raw === 'week') return 'week';
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

function NavLinks(props: { view: CalendarUIView; date: string }) {
  const { view, date } = props;
  const offset = view === 'week' ? 7 : 1;
  const prev = addDaysYmd(date, -offset);
  const next = addDaysYmd(date, offset);
  const today = todayYmdLA();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={buildCalendarHref(view, prev)} className="rounded px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
        Previous
      </Link>
      <Link href={buildCalendarHref(view, today)} className="rounded px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
        Today
      </Link>
      <Link href={buildCalendarHref(view, next)} className="rounded px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
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
        )})}

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
  mode: DispatchViewMode;
  date: string;
}) {
  const { jobs, mode, date } = props;

  const listJobs = jobs
    .filter((job) => (mode === 'day' ? String(job.scheduled_date) === date : true))
    .slice()
    .sort((a, b) => {
      const at = parseMinutes(a.window_start) ?? 0;
      const bt = parseMinutes(b.window_start) ?? 0;
      return at - bt;
    });

  if (!listJobs.length) {
    return <div className="py-8 text-sm text-slate-500">No scheduled assigned jobs for this period.</div>;
  }

  return (
    <div className="space-y-1">
      {listJobs.map((job) => (
        <Link
          key={`list-${job.id}`}
          href={buildCalendarHref('list', date, { job: job.id })}
          scroll={false}
          className="block rounded px-3 py-2 hover:bg-slate-50"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{shortTitle(job)}</p>
              <p className="text-xs text-slate-600">{job.city || job.contractor_name || 'No city or contractor'}</p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>{displayWindowLA(job.window_start, job.window_end) || 'No window'}</p>
              <p>{job.assignment_names.join(', ')}</p>
            </div>
          </div>
        </Link>
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
  className?: string;
}) {
  const { job, returnTo, assignableUsers, view, date, className = '' } = props;

  return (
    <aside className={`overflow-y-auto bg-white p-4 ${className}`}>
        <div className="mb-3 flex items-start justify-between gap-2 border-b pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Job Details</p>
            <h3 className="text-base font-semibold text-gray-900">{job.title || `Job ${job.id.slice(0, 8)}`}</h3>
            <p className="mt-1 text-xs text-gray-600">{customerName(job)} • {job.city || 'No city'}</p>
          </div>
          <Link
            href={buildCalendarHref(view, date)}
            scroll={false}
            aria-label="Close details"
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <X className="h-4 w-4" />
          </Link>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <Link href={`/jobs/${job.id}`} className="rounded border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            Open Job
          </Link>
          <Link href={`/jobs/${job.id}`} className="rounded border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            Open Customer
          </Link>
          <Link href={`/jobs/${job.id}`} className="rounded border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            Open Location
          </Link>
        </div>

        <div className="space-y-4">
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Schedule</p>
            <form action={updateJobScheduleFromForm} className="grid gap-2">
              <input type="hidden" name="job_id" value={job.id} />
              <input type="hidden" name="return_to" value={returnTo} />
              <input type="date" name="scheduled_date" defaultValue={job.scheduled_date ?? ''} className="rounded border px-2 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input type="time" name="window_start" defaultValue={job.window_start ?? ''} className="rounded border px-2 py-2 text-sm" />
                <input type="time" name="window_end" defaultValue={job.window_end ?? ''} className="rounded border px-2 py-2 text-sm" />
              </div>
              <SubmitButton className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white" loadingText="Saving...">
                Save Schedule
              </SubmitButton>
            </form>
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Assignment</p>
            <form action={assignJobAssigneeFromForm} className="grid gap-2">
              <input type="hidden" name="job_id" value={job.id} />
              <input type="hidden" name="tab" value="ops" />
              <input type="hidden" name="return_to" value={returnTo} />
              <select name="user_id" className="rounded border px-2 py-2 text-sm" defaultValue="">
                <option value="" disabled>
                  Select internal user
                </option>
                {assignableUsers.map((user) => (
                  <option key={user.user_id} value={user.user_id}>
                    {user.display_name}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-2 rounded border px-2 py-2 text-xs text-gray-700">
                <input type="checkbox" name="make_primary" value="1" /> Make primary
              </label>
              <SubmitButton className="rounded bg-gray-900 px-3 py-2 text-sm font-semibold text-white" loadingText="Assigning...">
                Assign Technician
              </SubmitButton>
            </form>

            {job.assignments.length ? (
              <div className="mt-3 space-y-2">
                {job.assignments.map((assignment) => (
                  <div key={`${job.id}-${assignment.user_id}`} className="flex items-center justify-between rounded border bg-gray-50 px-2 py-1.5 text-xs">
                    <span>{assignment.display_name}{assignment.is_primary ? ' (primary)' : ''}</span>
                    <div className="flex items-center gap-1.5">
                      {!assignment.is_primary ? (
                        <form action={setPrimaryJobAssigneeFromForm}>
                          <input type="hidden" name="job_id" value={job.id} />
                          <input type="hidden" name="user_id" value={assignment.user_id} />
                          <input type="hidden" name="tab" value="ops" />
                          <input type="hidden" name="return_to" value={returnTo} />
                          <SubmitButton className="rounded border border-blue-200 bg-white px-2 py-1 text-xs text-blue-700" loadingText="...">
                            Primary
                          </SubmitButton>
                        </form>
                      ) : null}
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
  const mode: DispatchViewMode = uiView === 'week' ? 'week' : 'day';
  const data = await getDispatchCalendarData({
    mode,
    anchorDate: props.date,
  });

  const returnTo = buildReturnTo(uiView, data.anchorDate);
  const banner = bannerMessage(props.banner);
  const selectedJobId = String(props.job ?? '').trim();

  const jobsForRange =
    data.mode === 'day'
      ? data.day.jobs
      : data.week.days.flatMap((day) => day.jobs);

  const canonicalDispatchJobsForRange = jobsForRange.filter((job) => isDispatchVisibleForLayout(job));

  const canonicalDispatchJobsByDay = data.week.days.map((day) => ({
    date: day.date,
    jobs: day.jobs.filter((job) => isDispatchVisibleForLayout(job)),
  }));

  const selectedJob =
    (selectedJobId ? canonicalDispatchJobsForRange.find((job) => job.id === selectedJobId) : null) ||
    data.unassignedScheduledJobs.find((job) => job.id === selectedJobId) ||
    null;

  return (
    <div className="space-y-4 pb-6">
      {banner ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{banner}</div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Dispatch Workspace</h2>
          <p className="mt-1 text-xs text-slate-600">
            {mode === 'day'
              ? `Day view for ${formatBusinessDateUS(data.day.date)}`
              : `Week view ${formatBusinessDateUS(data.week.startDate)} - ${formatBusinessDateUS(data.week.endDate)}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded bg-slate-100 p-1">
            {(['day', 'week', 'list'] as CalendarUIView[]).map((viewValue) => (
              <Link
                key={viewValue}
                href={buildCalendarHref(viewValue, data.anchorDate)}
                className={`rounded px-3 py-1.5 text-sm font-medium ${uiView === viewValue ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'}`}
              >
                {viewValue.charAt(0).toUpperCase() + viewValue.slice(1)}
              </Link>
            ))}
          </div>
          <NavLinks view={uiView} date={data.anchorDate} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unscheduled Jobs</h3>
          <div className="mt-2 max-h-[70vh] space-y-1 overflow-y-auto pr-1">
              {data.unassignedScheduledJobs.length ? (
                data.unassignedScheduledJobs.map((job) => (
                  <Link
                    key={`unassigned-${job.id}`}
                    href={buildCalendarHref(uiView, data.anchorDate, { job: job.id })}
                    scroll={false}
                    className="block rounded px-2 py-2 hover:bg-slate-50"
                  >
                    <p className="truncate text-xs font-semibold text-slate-900">{shortTitle(job)}</p>
                    <p className="truncate text-[11px] text-slate-600">{job.city || job.contractor_name || 'No city or contractor'}</p>
                  </Link>
                ))
              ) : (
                <div className="py-2 text-xs text-slate-500">No unscheduled jobs.</div>
              )}
          </div>

        </aside>

        <main className="min-w-0 space-y-4">
          {uiView === 'list' ? (
            <section className="px-1">
              <AgendaList jobs={canonicalDispatchJobsForRange} mode={mode} date={data.anchorDate} />
            </section>
          ) : mode === 'day' ? (
            <section className="overflow-x-auto">
              <DispatchGrid
                jobs={data.day.jobs.filter((job) => isDispatchVisibleForLayout(job))}
                mode={mode}
                date={data.day.date}
                selectedJobId={selectedJobId}
              />
            </section>
          ) : (
            <section className="space-y-6 overflow-x-auto">
              {canonicalDispatchJobsByDay.map((day) => (
                <div key={day.date}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">{formatBusinessDateUS(day.date)}</h3>
                    <p className="text-xs text-slate-500">{day.jobs.length} jobs</p>
                  </div>
                  <DispatchGrid
                    jobs={day.jobs}
                    mode={mode}
                    date={day.date}
                    selectedJobId={selectedJobId}
                  />
                </div>
              ))}
            </section>
          )}
        </main>
      </div>

      {selectedJob ? (
        <div className="fixed inset-y-4 right-3 z-30 hidden w-[380px] xl:block">
          <DetailPanel
            job={selectedJob}
            returnTo={returnTo}
            assignableUsers={data.assignableUsers}
            view={uiView}
            date={data.anchorDate}
            className="h-full rounded-md border border-slate-200 bg-white shadow-xl"
          />
        </div>
      ) : null}

      {selectedJob ? (
        <div className="fixed inset-0 z-40 bg-black/30 p-3 xl:hidden">
          <DetailPanel
            job={selectedJob}
            returnTo={returnTo}
            assignableUsers={data.assignableUsers}
            view={uiView}
            date={data.anchorDate}
            className="ml-auto h-full max-w-md border-l border-slate-200"
          />
        </div>
      ) : null}
    </div>
  );
}
