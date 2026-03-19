import Link from 'next/link';

import SubmitButton from '@/components/SubmitButton';
import {
  assignJobAssigneeFromForm,
  removeJobAssigneeFromForm,
  setPrimaryJobAssigneeFromForm,
  updateJobScheduleFromForm,
} from '@/lib/actions/job-actions';
import { getDispatchCalendarData, type DispatchJob, type DispatchViewMode } from '@/lib/actions/calendar';
import { displayWindowLA, formatBusinessDateUS } from '@/lib/utils/schedule-la';

type Props = {
  view?: string;
  date?: string;
  banner?: string;
  job?: string;
};

function bannerMessage(banner?: string) {
  const map: Record<string, string> = {
    schedule_saved: 'Schedule updated.',
    assignment_added: 'Assignee added.',
    assignment_added_primary: 'Assignee added and set as primary.',
    assignment_primary_set: 'Primary assignee updated.',
    assignment_removed: 'Assignee removed.',
  };

  const key = String(banner ?? '').trim();
  if (!key) return null;
  return map[key] ?? null;
}

function statusPillClass(status?: string | null) {
  const value = String(status ?? '').toLowerCase();
  if (value === 'failed') return 'bg-red-100 text-red-800 border-red-200';
  if (value === 'retest_needed') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (value === 'scheduled') return 'bg-blue-100 text-blue-800 border-blue-200';
  if (value === 'need_to_schedule') return 'bg-gray-100 text-gray-800 border-gray-200';
  if (value === 'pending_info') return 'bg-orange-100 text-orange-800 border-orange-200';
  return 'bg-slate-100 text-slate-800 border-slate-200';
}

function statusBlockClass(status?: string | null) {
  const value = String(status ?? '').toLowerCase();
  if (value === 'failed') return 'border-red-300 bg-red-100 text-red-900';
  if (value === 'on_hold') return 'border-gray-300 bg-gray-100 text-gray-900';
  if (value === 'pending_info') return 'border-amber-300 bg-amber-100 text-amber-900';
  if (value === 'scheduled') return 'border-blue-300 bg-blue-100 text-blue-900';
  return 'border-slate-300 bg-slate-100 text-slate-900';
}

function customerName(job: DispatchJob) {
  const name = `${String(job.customer_first_name ?? '').trim()} ${String(job.customer_last_name ?? '').trim()}`.trim();
  return name || 'Customer not set';
}

function buildReturnTo(mode: DispatchViewMode, date: string) {
  const q = new URLSearchParams();
  q.set('view', mode);
  q.set('date', date);
  return `/calendar?${q.toString()}`;
}

function buildCalendarHref(mode: DispatchViewMode, date: string, params?: { banner?: string; job?: string | null }) {
  const q = new URLSearchParams();
  q.set('view', mode);
  q.set('date', date);
  if (params?.banner) q.set('banner', params.banner);
  if (params?.job) q.set('job', params.job);
  return `/calendar?${q.toString()}`;
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

function NavLinks(props: { mode: DispatchViewMode; date: string }) {
  const { mode, date } = props;
  const offset = mode === 'week' ? 7 : 1;
  const prev = addDaysYmd(date, -offset);
  const next = addDaysYmd(date, offset);
  const today = todayYmdLA();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={buildCalendarHref(mode, prev)} className="rounded border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
        Previous
      </Link>
      <Link href={buildCalendarHref(mode, today)} className="rounded border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
        Today
      </Link>
      <Link href={buildCalendarHref(mode, next)} className="rounded border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
        Next
      </Link>
    </div>
  );
}

function DispatchGrid(props: {
  jobs: DispatchJob[];
  mode: DispatchViewMode;
  date: string;
}) {
  const { jobs, mode, date } = props;
  const startHour = 6;
  const endHour = 18;
  const hourHeight = 56;
  const gridStartMinutes = startHour * 60;
  const gridEndMinutes = endHour * 60;

  const gridJobs = jobs
    .filter((job) => {
      if (!job.scheduled_date || !job.window_start) return false;
      return Array.isArray(job.assignments) && job.assignments.length > 0;
    })
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

  const techMap = new Map<string, string>();
  for (const item of gridJobs) {
    const techName = item.job.assignments.find((a) => a.user_id === item.user_id)?.display_name ?? 'Tech';
    techMap.set(item.user_id, techName);
  }

  const columns = uniqueById(
    Array.from(techMap.entries()).map(([user_id, display_name]) => ({ user_id, display_name })),
  );

  const totalGridHeight = (endHour - startHour) * hourHeight;

  if (!columns.length) {
    return (
      <div className="rounded-lg border bg-white p-8 text-sm text-gray-600">
        No assigned scheduled jobs for this {mode}.
      </div>
    );
  }

  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="grid" style={{ gridTemplateColumns: `84px repeat(${columns.length}, minmax(190px, 1fr))` }}>
        <div className="border-b border-r bg-gray-50 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Time</div>
        {columns.map((col) => (
          <div key={col.user_id} className="border-b border-r bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-800">
            {col.display_name}
          </div>
        ))}

        <div className="relative border-r bg-white" style={{ height: `${totalGridHeight}px` }}>
          {hours.map((hour) => {
            const y = (hour - startHour) * hourHeight;
            const label = hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
            return (
              <div key={hour} className="absolute left-0 right-0" style={{ top: `${y}px` }}>
                <div className="-translate-y-1/2 px-3 text-xs text-gray-500">{label}</div>
              </div>
            );
          })}
        </div>

        {columns.map((col) => (
          <div key={col.user_id} className="relative border-r bg-white" style={{ height: `${totalGridHeight}px` }}>
            {hours.map((hour) => {
              const y = (hour - startHour) * hourHeight;
              return <div key={hour} className="absolute left-0 right-0 border-t border-gray-100" style={{ top: `${y}px` }} />;
            })}

            {gridJobs
              .filter((item) => item.user_id === col.user_id)
              .map(({ job }) => {
                const start = parseMinutes(job.window_start);
                const end = parseMinutes(job.window_end) ?? (start != null ? start + 60 : null);
                if (start == null) return null;

                const clampedStart = Math.max(start, gridStartMinutes);
                const clampedEnd = Math.min(Math.max(end ?? clampedStart + 60, clampedStart + 30), gridEndMinutes);
                const top = ((clampedStart - gridStartMinutes) / 60) * hourHeight;
                const height = Math.max(((clampedEnd - clampedStart) / 60) * hourHeight, 36);

                return (
                  <Link
                    key={`${job.id}-${col.user_id}`}
                    href={buildCalendarHref(mode, date, { job: job.id })}
                    className={`absolute left-1 right-1 rounded-md border px-2 py-1 shadow-sm transition hover:brightness-95 ${statusBlockClass(job.ops_status)}`}
                    style={{ top: `${top}px`, height: `${height}px` }}
                  >
                    <p className="truncate text-xs font-semibold leading-4">{shortTitle(job)}</p>
                    <p className="truncate text-[11px] leading-4 opacity-90">{job.city || job.contractor_name || 'No city or contractor'}</p>
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-wide opacity-80">{blockTimeLabel(clampedStart, clampedEnd)}</p>
                  </Link>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailPanel(props: {
  job: DispatchJob;
  returnTo: string;
  assignableUsers: Array<{ user_id: string; display_name: string }>;
  mode: DispatchViewMode;
  date: string;
}) {
  const { job, returnTo, assignableUsers, mode, date } = props;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/25 p-0">
      <aside className="h-full w-full max-w-md overflow-y-auto border-l bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-2 border-b pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Job Details</p>
            <h3 className="text-base font-semibold text-gray-900">{job.title || `Job ${job.id.slice(0, 8)}`}</h3>
            <p className="mt-1 text-xs text-gray-600">{customerName(job)} • {job.city || 'No city'}</p>
          </div>
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusPillClass(job.ops_status)}`}>
            {job.ops_status || 'unknown'}
          </span>
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
          <Link href={buildCalendarHref(mode, date)} className="rounded border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            Close
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
    </div>
  );
}

export async function CalendarView(props: Props) {
  const mode: DispatchViewMode = props.view === 'week' ? 'week' : 'day';
  const data = await getDispatchCalendarData({
    mode,
    anchorDate: props.date,
  });

  const returnTo = buildReturnTo(data.mode, data.anchorDate);
  const banner = bannerMessage(props.banner);
  const selectedJobId = String(props.job ?? '').trim();

  const jobsForRange =
    data.mode === 'day'
      ? data.day.jobs
      : data.week.days.flatMap((day) => day.jobs);

  const selectedJob =
    (selectedJobId ? jobsForRange.find((job) => job.id === selectedJobId) : null) ||
    data.unassignedScheduledJobs.find((job) => job.id === selectedJobId) ||
    null;

  const assignedScheduledCount = jobsForRange.filter(
    (job) => job.scheduled_date && job.window_start && job.assignments.length > 0,
  ).length;

  const needsSchedulingCount = jobsForRange.filter(
    (job) => !job.scheduled_date || !job.window_start,
  ).length;

  const needsAttentionCount = jobsForRange.filter((job) => {
    const status = String(job.ops_status ?? '').toLowerCase();
    return status === 'failed' || status === 'pending_info' || status === 'on_hold';
  }).length;

  return (
    <div className="space-y-4">
      {banner ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{banner}</div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-lg border bg-white p-4">
            <h2 className="text-base font-semibold text-gray-900">Dispatch Board</h2>
            <p className="mt-1 text-xs text-gray-600">
              {data.mode === 'day'
                ? `Day view for ${formatBusinessDateUS(data.day.date)}`
                : `Week view ${formatBusinessDateUS(data.week.startDate)} - ${formatBusinessDateUS(data.week.endDate)}`}
            </p>

            <div className="mt-3 flex items-center gap-2">
              <Link
                href={buildCalendarHref('day', data.anchorDate)}
                className={`rounded px-3 py-2 text-sm font-medium ${data.mode === 'day' ? 'bg-gray-900 text-white' : 'border text-gray-700 hover:bg-gray-50'}`}
              >
                Day
              </Link>
              <Link
                href={buildCalendarHref('week', data.anchorDate)}
                className={`rounded px-3 py-2 text-sm font-medium ${data.mode === 'week' ? 'bg-gray-900 text-white' : 'border text-gray-700 hover:bg-gray-50'}`}
              >
                Week
              </Link>
            </div>

            <div className="mt-3">
              <NavLinks mode={data.mode} date={data.anchorDate} />
            </div>
          </section>

          <section className="rounded-lg border bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Queue Snapshot</h3>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded border bg-gray-50 px-2 py-2">
                <p className="text-xs text-gray-500">Assigned</p>
                <p className="text-lg font-semibold text-gray-900">{assignedScheduledCount}</p>
              </div>
              <div className="rounded border bg-amber-50 px-2 py-2">
                <p className="text-xs text-amber-700">Needs Scheduling</p>
                <p className="text-lg font-semibold text-amber-900">{needsSchedulingCount}</p>
              </div>
              <div className="rounded border bg-red-50 px-2 py-2">
                <p className="text-xs text-red-700">Needs Attention</p>
                <p className="text-lg font-semibold text-red-900">{needsAttentionCount}</p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Unassigned Jobs</h3>
            <p className="mt-1 text-xs text-gray-600">Scheduled jobs without internal technician assignment.</p>
            <div className="mt-3 space-y-2">
              {data.unassignedScheduledJobs.length ? (
                data.unassignedScheduledJobs.map((job) => (
                  <Link
                    key={`unassigned-${job.id}`}
                    href={buildCalendarHref(data.mode, data.anchorDate, { job: job.id })}
                    className="block rounded border bg-gray-50 px-3 py-2 hover:bg-gray-100"
                  >
                    <p className="truncate text-xs font-semibold text-gray-900">{shortTitle(job)}</p>
                    <p className="truncate text-[11px] text-gray-600">{job.city || job.contractor_name || 'No city or contractor'}</p>
                    <p className="mt-1 text-[11px] text-gray-500">{displayWindowLA(job.window_start, job.window_end) || 'No window'}</p>
                  </Link>
                ))
              ) : (
                <div className="rounded border border-dashed p-3 text-xs text-gray-500">No unassigned scheduled jobs.</div>
              )}
            </div>
          </section>

        </aside>

        <main className="space-y-4">
          {data.mode === 'day' ? (
            <section>
              <DispatchGrid jobs={data.day.jobs} mode={data.mode} date={data.day.date} />
            </section>
          ) : (
            <section className="space-y-4">
              {data.week.days.map((day) => (
                <div key={day.date}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">{formatBusinessDateUS(day.date)}</h3>
                    <p className="text-xs text-gray-500">{day.jobs.length} jobs</p>
                  </div>
                  <DispatchGrid jobs={day.jobs} mode={data.mode} date={day.date} />
                </div>
              ))}
            </section>
          )}
        </main>
      </div>

      {selectedJob ? (
        <DetailPanel
          job={selectedJob}
          returnTo={returnTo}
          assignableUsers={data.assignableUsers}
          mode={data.mode}
          date={data.anchorDate}
        />
      ) : null}
    </div>
  );
}
