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

function NavLinks(props: { mode: DispatchViewMode; date: string }) {
  const { mode, date } = props;
  const offset = mode === 'week' ? 7 : 1;
  const prev = addDaysYmd(date, -offset);
  const next = addDaysYmd(date, offset);
  const today = todayYmdLA();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={buildReturnTo(mode, prev)} className="rounded border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
        Previous
      </Link>
      <Link href={buildReturnTo(mode, today)} className="rounded border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
        Today
      </Link>
      <Link href={buildReturnTo(mode, next)} className="rounded border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
        Next
      </Link>
    </div>
  );
}

function JobCard(props: {
  job: DispatchJob;
  returnTo: string;
  assignableUsers: Array<{ user_id: string; display_name: string }>;
}) {
  const { job, returnTo, assignableUsers } = props;

  return (
    <article className="rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/jobs/${job.id}`} className="text-sm font-semibold text-gray-900 hover:underline">
            {job.title || `Job ${job.id.slice(0, 8)}`}
          </Link>
          <p className="mt-1 text-xs text-gray-600">{customerName(job)} • {job.city || 'No city'} • {job.contractor_name || 'No contractor'}</p>
        </div>
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusPillClass(job.ops_status)}`}>
          {job.ops_status || 'unknown'}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-gray-700 md:grid-cols-2">
        <div>
          <span className="font-semibold">Scheduled:</span> {formatBusinessDateUS(job.scheduled_date) || 'Unscheduled'}
        </div>
        <div>
          <span className="font-semibold">Window:</span> {displayWindowLA(job.window_start, job.window_end) || 'Not set'}
        </div>
        <div className="md:col-span-2">
          <span className="font-semibold">Assignees:</span> {job.assignment_names.length ? job.assignment_names.join(', ') : 'Unassigned'}
        </div>
      </div>

      <div className="mt-3 border-t pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Schedule</p>
        <form action={updateJobScheduleFromForm} className="grid gap-2 md:grid-cols-5">
          <input type="hidden" name="job_id" value={job.id} />
          <input type="hidden" name="return_to" value={returnTo} />
          <input
            type="date"
            name="scheduled_date"
            defaultValue={job.scheduled_date ?? ''}
            className="rounded border px-2 py-2 text-sm md:col-span-2"
          />
          <input type="time" name="window_start" defaultValue={job.window_start ?? ''} className="rounded border px-2 py-2 text-sm" />
          <input type="time" name="window_end" defaultValue={job.window_end ?? ''} className="rounded border px-2 py-2 text-sm" />
          <SubmitButton className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white" loadingText="Saving...">
            Save
          </SubmitButton>
        </form>
      </div>

      <div className="mt-3 border-t pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Assignment</p>
        <form action={assignJobAssigneeFromForm} className="grid gap-2 md:grid-cols-5">
          <input type="hidden" name="job_id" value={job.id} />
          <input type="hidden" name="tab" value="ops" />
          <input type="hidden" name="return_to" value={returnTo} />
          <select name="user_id" className="rounded border px-2 py-2 text-sm md:col-span-3" defaultValue="">
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
            <input type="checkbox" name="make_primary" value="1" /> Primary
          </label>
          <SubmitButton className="rounded bg-gray-900 px-3 py-2 text-sm font-semibold text-white" loadingText="Assigning...">
            Assign
          </SubmitButton>
        </form>

        {job.assignments.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {job.assignments.map((assignment) => (
              <div key={`${job.id}-${assignment.user_id}`} className="inline-flex items-center gap-2 rounded border bg-gray-50 px-2 py-1 text-xs">
                <span>{assignment.display_name}{assignment.is_primary ? ' (primary)' : ''}</span>
                {!assignment.is_primary ? (
                  <form action={setPrimaryJobAssigneeFromForm}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="user_id" value={assignment.user_id} />
                    <input type="hidden" name="tab" value="ops" />
                    <input type="hidden" name="return_to" value={returnTo} />
                    <SubmitButton className="rounded border border-blue-200 bg-white px-2 py-1 text-xs text-blue-700" loadingText="...">
                      Set Primary
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
            ))}
          </div>
        ) : null}
      </div>
    </article>
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

  return (
    <div className="space-y-4">
      {banner ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{banner}</div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Dispatch</h2>
          <p className="text-sm text-gray-600">
            {data.mode === 'day'
              ? `Day view for ${formatBusinessDateUS(data.day.date)}`
              : `Week view ${formatBusinessDateUS(data.week.startDate)} - ${formatBusinessDateUS(data.week.endDate)}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={buildReturnTo('day', data.anchorDate)}
            className={`rounded px-3 py-2 text-sm font-medium ${data.mode === 'day' ? 'bg-gray-900 text-white' : 'border text-gray-700 hover:bg-gray-50'}`}
          >
            Day
          </Link>
          <Link
            href={buildReturnTo('week', data.anchorDate)}
            className={`rounded px-3 py-2 text-sm font-medium ${data.mode === 'week' ? 'bg-gray-900 text-white' : 'border text-gray-700 hover:bg-gray-50'}`}
          >
            Week
          </Link>
          <NavLinks mode={data.mode} date={data.anchorDate} />
        </div>
      </div>

      {data.mode === 'day' ? (
        <section className="space-y-3">
          {data.day.jobs.length ? (
            data.day.jobs.map((job) => (
              <JobCard key={job.id} job={job} returnTo={returnTo} assignableUsers={data.assignableUsers} />
            ))
          ) : (
            <div className="rounded-lg border bg-white p-6 text-sm text-gray-600">No scheduled jobs for this day.</div>
          )}
        </section>
      ) : (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.week.days.map((day) => (
            <div key={day.date} className="rounded-lg border bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-900">{formatBusinessDateUS(day.date)}</h3>
              <p className="mb-3 text-xs text-gray-500">{day.jobs.length} scheduled</p>
              <div className="space-y-3">
                {day.jobs.length ? (
                  day.jobs.map((job) => (
                    <JobCard key={job.id} job={job} returnTo={returnTo} assignableUsers={data.assignableUsers} />
                  ))
                ) : (
                  <div className="rounded border border-dashed p-3 text-xs text-gray-500">No jobs</div>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-lg border bg-white p-4">
        <h3 className="text-base font-semibold text-gray-900">Unassigned Scheduled Jobs</h3>
        <p className="mb-3 text-sm text-gray-600">Scheduled jobs without an active internal assignment.</p>

        <div className="space-y-3">
          {data.unassignedScheduledJobs.length ? (
            data.unassignedScheduledJobs.map((job) => (
              <JobCard key={`unassigned-${job.id}`} job={job} returnTo={returnTo} assignableUsers={data.assignableUsers} />
            ))
          ) : (
            <div className="rounded border border-dashed p-3 text-sm text-gray-500">No unassigned scheduled jobs.</div>
          )}
        </div>
      </section>
    </div>
  );
}
