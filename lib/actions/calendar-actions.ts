'use server';

import { createClient } from '@/lib/supabase/server';
import { getActiveJobAssignmentDisplayMap, getAssignableInternalUsers } from '@/lib/staffing/human-layer';

export type DispatchViewMode = 'day' | 'week';

export type DispatchJob = {
  id: string;
  customer_id: string | null;
  location_id: string | null;
  title: string;
  job_type: string | null;
  status: string | null;
  ops_status: string | null;
  parent_job_id: string | null;
  scheduled_date: string | null;
  window_start: string | null;
  window_end: string | null;
  city: string | null;
  job_address: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  contractor_id: string | null;
  contractor_name?: string | null;
  assignments: Array<{
    user_id: string;
    display_name: string;
    is_primary: boolean;
  }>;
  assignment_names: string[];
  assignment_primary_name: string | null;
  latest_event_type: string | null;
  latest_event_at: string | null;
};

export type DispatchCalendarData = {
  mode: DispatchViewMode;
  anchorDate: string;
  day: {
    date: string;
    jobs: DispatchJob[];
  };
  week: {
    startDate: string;
    endDate: string;
    days: Array<{ date: string; jobs: DispatchJob[] }>;
  };
  unassignedScheduledJobs: DispatchJob[];
  assignableUsers: Array<{
    user_id: string;
    display_name: string;
  }>;
};

type JobDispatchRow = {
  id: string;
  customer_id: string | null;
  location_id: string | null;
  title: string | null;
  job_type: string | null;
  status: string | null;
  ops_status: string | null;
  parent_job_id: string | null;
  scheduled_date: string | null;
  window_start: string | null;
  window_end: string | null;
  city: string | null;
  job_address: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  contractor_id: string | null;
  contractors: { name: string | null } | { name: string | null }[] | null;
  created_at: string | null;
};

type ParentIdRow = {
  parent_job_id: string | null;
};

type JobEventRow = {
  job_id: string | null;
  event_type: string | null;
  created_at: string | null;
};

function laTodayYmd(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function parseYmd(value: string) {
  const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function ymdToUtcDate(value: string): Date | null {
  const parsed = parseYmd(value);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0));
}

function dateToYmdUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const d = ymdToUtcDate(ymd);
  if (!d) return ymd;
  d.setUTCDate(d.getUTCDate() + days);
  return dateToYmdUtc(d);
}

function startOfWeekYmd(ymd: string): string {
  const d = ymdToUtcDate(ymd);
  if (!d) return ymd;
  const weekday = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - weekday);
  return dateToYmdUtc(d);
}

function normalizeAnchorDate(input?: string | null): string {
  const raw = String(input ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return laTodayYmd();
}

function assignmentFieldsFromMap(
  map: Record<string, Array<{ user_id: string; display_name: string; is_primary: boolean }>>,
  jobId: string,
) {
  const rows = map[jobId] ?? [];
  const assignments = rows
    .map((row) => ({
      user_id: String(row.user_id ?? '').trim(),
      display_name: String(row.display_name ?? '').trim(),
      is_primary: Boolean(row.is_primary),
    }))
    .filter((row) => row.user_id && row.display_name);
  const assignment_names = assignments.map((row) => row.display_name);
  return {
    assignments,
    assignment_names,
    assignment_primary_name: assignment_names[0] ?? null,
  };
}

function mergeJobRow(params: {
  row: JobDispatchRow;
  assignmentMap: Record<string, Array<{ user_id: string; display_name: string; is_primary: boolean }>>;
  latestEventByJob: Map<string, { event_type: string | null; created_at: string | null }>;
}): DispatchJob {
  const { row, assignmentMap, latestEventByJob } = params;
  const jobId = String(row?.id ?? '');
  const assignment = assignmentFieldsFromMap(assignmentMap, jobId);
  const latestEvent = latestEventByJob.get(jobId);

  return {
    id: jobId,
    customer_id: row?.customer_id ? String(row.customer_id) : null,
    location_id: row?.location_id ? String(row.location_id) : null,
    title: String(row?.title ?? ''),
    job_type: row?.job_type ? String(row.job_type) : null,
    status: row?.status ? String(row.status) : null,
    ops_status: row?.ops_status ? String(row.ops_status) : null,
    parent_job_id: row?.parent_job_id ? String(row.parent_job_id) : null,
    scheduled_date: row?.scheduled_date ? String(row.scheduled_date) : null,
    window_start: row?.window_start ? String(row.window_start) : null,
    window_end: row?.window_end ? String(row.window_end) : null,
    city: row?.city ? String(row.city) : null,
    job_address: row?.job_address ? String(row.job_address) : null,
    customer_first_name: row?.customer_first_name ? String(row.customer_first_name) : null,
    customer_last_name: row?.customer_last_name ? String(row.customer_last_name) : null,
    contractor_id: row?.contractor_id ? String(row.contractor_id) : null,
    contractor_name: Array.isArray(row.contractors)
      ? (row.contractors[0]?.name ? String(row.contractors[0].name) : null)
      : (row.contractors?.name ? String(row.contractors.name) : null),
    assignments: assignment.assignments,
    assignment_names: assignment.assignment_names,
    assignment_primary_name: assignment.assignment_primary_name,
    latest_event_type: latestEvent?.event_type ?? null,
    latest_event_at: latestEvent?.created_at ?? null,
  };
}

function suppressRetestParentRows(rows: JobDispatchRow[], params: {
  openRetestParentIds: Set<string>;
  resolvedFailedParentIds: Set<string>;
}) {
  return rows.filter((row) => {
    const jobId = String(row?.id ?? '').trim();
    if (!jobId) return false;

    const ops = String(row?.ops_status ?? '').toLowerCase();
    if (ops !== 'failed') return true;

    if (params.openRetestParentIds.has(jobId)) return false;
    if (params.resolvedFailedParentIds.has(jobId)) return false;
    return true;
  });
}

export async function getDispatchCalendarData(params: {
  mode: DispatchViewMode;
  anchorDate?: string | null;
}): Promise<DispatchCalendarData> {
  const supabase = await createClient();
  const mode = params.mode === 'week' ? 'week' : 'day';
  const anchorDate = normalizeAnchorDate(params.anchorDate);

  const weekStart = startOfWeekYmd(anchorDate);
  const weekEnd = addDaysYmd(weekStart, 6);

  const baseSelect = [
    'id',
    'customer_id',
    'location_id',
    'title',
    'job_type',
    'status',
    'ops_status',
    'parent_job_id',
    'scheduled_date',
    'window_start',
    'window_end',
    'city',
    'job_address',
    'customer_first_name',
    'customer_last_name',
    'contractor_id',
    'contractors(name)',
    'created_at',
    'deleted_at',
  ].join(', ');

  // Fetch all jobs in the relevant window
  const { data: allRows, error: allErr } = await supabase
    .from('jobs')
    .select(baseSelect)
    .is('deleted_at', null)
    .order('scheduled_date', { ascending: true })
    .order('window_start', { ascending: true })
    .order('created_at', { ascending: true });
  if (allErr) throw allErr;

  function isOnHold(job: JobDispatchRow) {
    const ops = String(job.ops_status ?? '').toLowerCase();
    const status = String(job.status ?? '').toLowerCase();
    return ops === 'on_hold' || status === 'on_hold';
  }

  // Calendar is a scheduling record surface for runnable work only.
  function isActive(job: JobDispatchRow) {
    const ops = String(job.ops_status ?? '').toLowerCase();
    const status = String(job.status ?? '').toLowerCase();
    if (isOnHold(job)) return false;
    if (ops === 'closed' || ops === 'cancelled') return false;
    if (status === 'closed' || status === 'cancelled') return false;
    return true;
  }

  function isCalendarScheduled(job: JobDispatchRow) {
    return !!job.scheduled_date && !isOnHold(job);
  }

  // Type guard for JobDispatchRow
  function isJobDispatchRow(row: any): row is JobDispatchRow {
    return row && typeof row.id === 'string' && typeof row.status !== 'undefined' && typeof row.ops_status !== 'undefined';
  }

  // Filter out any rows that are not valid JobDispatchRow
  const validRows = (allRows ?? []).filter(isJobDispatchRow) as unknown as JobDispatchRow[];

  // Canonical scheduled calendar jobs exclude on-hold work from dispatch surfaces.
  const scheduledCalendarRows = validRows.filter((row) => isCalendarScheduled(row));

  // Canonical unscheduled active jobs
  const unscheduledActiveRows = validRows.filter(
    (row) => isActive(row) && !row.scheduled_date
  );

  // Assignment and event mapping
  const allJobIds = [...scheduledCalendarRows, ...unscheduledActiveRows].map((row) => String(row?.id ?? '').trim()).filter(Boolean);
  const assignmentMap = await getActiveJobAssignmentDisplayMap({
    supabase,
    jobIds: allJobIds,
  });

  const { data: eventRows, error: eventErr } = await supabase
    .from('job_events')
    .select('job_id, event_type, created_at')
    .in('job_id', allJobIds.length ? allJobIds : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: false });
  if (eventErr) throw eventErr;
  const latestEventByJob = new Map<string, { event_type: string | null; created_at: string | null }>();
  for (const event of (eventRows ?? []) as JobEventRow[]) {
    const jobId = String(event?.job_id ?? '').trim();
    if (!jobId || latestEventByJob.has(jobId)) continue;
    latestEventByJob.set(jobId, {
      event_type: event?.event_type ? String(event.event_type) : null,
      created_at: event?.created_at ? String(event.created_at) : null,
    });
  }

  // Canonical scheduled jobs (normalized)
  const scheduledCalendarJobs = scheduledCalendarRows.map((row) =>
    mergeJobRow({ row, assignmentMap, latestEventByJob })
  );

  // Canonical unscheduled jobs (normalized)
  const unscheduledActiveJobs = unscheduledActiveRows.map((row) =>
    mergeJobRow({ row, assignmentMap, latestEventByJob })
  );

  // Build day/week/month/list from canonical scheduled jobs
  const dayJobs = scheduledCalendarJobs.filter((job) => String(job.scheduled_date) === anchorDate);
  const weekDays = Array.from({ length: 7 }).map((_, index) => {
    const date = addDaysYmd(weekStart, index);
    const jobs = scheduledCalendarJobs.filter((job) => String(job.scheduled_date ?? '') === date);
    return { date, jobs };
  });

  const assignableUsers = (await getAssignableInternalUsers({ supabase })).map((user) => ({
    user_id: String(user.user_id),
    display_name: String(user.display_name),
  }));

  return {
    mode,
    anchorDate,
    day: {
      date: anchorDate,
      jobs: dayJobs,
    },
    week: {
      startDate: weekStart,
      endDate: weekEnd,
      days: weekDays,
    },
    // All calendar consumers must use these canonical collections
    unassignedScheduledJobs: unscheduledActiveJobs,
    assignableUsers,
  };
}
