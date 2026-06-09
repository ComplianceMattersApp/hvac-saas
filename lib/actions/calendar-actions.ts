'use server';

import { requireInternalUser } from '@/lib/auth/internal-user';
import { createClient } from '@/lib/supabase/server';
import { getActiveJobAssignmentDisplayMap, getAssignableInternalUsers } from '@/lib/staffing/human-layer';
import { buildVisitScopeIncludesReadModel } from '@/lib/jobs/visit-scope';
import { displayDateLA, displayTimeLA, laDateTimeToUtcIso } from '@/lib/utils/schedule-la';

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
  customer_phone: string | null;
  contractor_id: string | null;
  contractor_name?: string | null;
  work_context_label: string | null;
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
  range: {
    startDate: string;
    endDate: string;
    days: Array<{ date: string; jobs: DispatchJob[] }>;
  };
  day: {
    date: string;
    jobs: DispatchJob[];
  };
  week: {
    startDate: string;
    endDate: string;
    days: Array<{ date: string; jobs: DispatchJob[] }>;
  };
  scheduledAttentionWindowJobs: DispatchJob[];
  unassignedScheduledJobs: DispatchJob[];
  calendarBlockEvents: DispatchCalendarBlockEvent[];
  assignableUsers: Array<{
    user_id: string;
    display_name: string;
  }>;
};

export type DispatchCalendarBlockEvent = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  internal_user_id: string;
  start_at: string;
  end_at: string;
  calendar_date: string;
  start_time: string;
  end_time: string;
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
  customer_phone: string | null;
  contractor_id: string | null;
  contractors: { name: string | null } | { name: string | null }[] | null;
  customers: { phone: string | null } | { phone: string | null }[] | null;
  locations: { city: string | null } | { city: string | null }[] | null;
  visit_scope_summary?: string | null;
  visit_scope_items?: unknown;
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

type CalendarEventRow = {
  id: string | null;
  title: string | null;
  description: string | null;
  status: string | null;
  internal_user_id: string | null;
  start_at: string | null;
  end_at: string | null;
  event_type: string | null;
};

type CustomerScopeRow = {
  id: string | null;
};

type InternalUserIdRow = {
  user_id: string | null;
};

type DispatchDateRange = {
  startDate: string;
  endDate: string;
};

export type DispatchCalendarBoardData = Omit<
  DispatchCalendarData,
  'scheduledAttentionWindowJobs' | 'unassignedScheduledJobs' | 'assignableUsers'
>;

export type DispatchCalendarQueueData = Pick<
  DispatchCalendarData,
  'scheduledAttentionWindowJobs' | 'unassignedScheduledJobs'
>;

export type DispatchCalendarRosterData = Pick<DispatchCalendarData, 'assignableUsers'>;

type CalendarTimingDebugView = 'day' | 'week' | 'list' | 'month' | 'unknown';
type CalendarTimingDebugTechFilter = 'all' | 'unassigned' | 'specific';

function isCalendarTimingDebugEnabled() {
  return String(process.env.CALENDAR_TIMING_DEBUG ?? '').trim().toLowerCase() === 'true';
}

function nowMs() {
  return Date.now();
}

async function timeCalendarStep<T>(
  enabled: boolean,
  timings: Record<string, number>,
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!enabled) return fn();
  const startedAt = nowMs();
  try {
    return await fn();
  } finally {
    timings[label] = nowMs() - startedAt;
  }
}

function normalizeTimingDebugView(view?: string | null): CalendarTimingDebugView {
  const raw = String(view ?? '').trim().toLowerCase();
  if (raw === 'day' || raw === 'week' || raw === 'list' || raw === 'month') return raw;
  return 'unknown';
}

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
  const canonicalCity = Array.isArray(row.locations)
    ? String(row.locations[0]?.city ?? '').trim()
    : String(row.locations?.city ?? '').trim();
  const canonicalPhone = Array.isArray(row.customers)
    ? String(row.customers[0]?.phone ?? '').trim()
    : String(row.customers?.phone ?? '').trim();
  const snapshotCity = String(row?.city ?? '').trim();
  const snapshotPhone = String(row?.customer_phone ?? '').trim();
  const workContext = buildVisitScopeIncludesReadModel(
    row?.visit_scope_summary,
    row?.visit_scope_items,
    { leadMaxLength: 48 },
  );

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
    city: canonicalCity || snapshotCity || null,
    job_address: row?.job_address ? String(row.job_address) : null,
    customer_first_name: row?.customer_first_name ? String(row.customer_first_name) : null,
    customer_last_name: row?.customer_last_name ? String(row.customer_last_name) : null,
    customer_phone: canonicalPhone || snapshotPhone || null,
    contractor_id: row?.contractor_id ? String(row.contractor_id) : null,
    contractor_name: Array.isArray(row.contractors)
      ? (row.contractors[0]?.name ? String(row.contractors[0].name) : null)
      : (row.contractors?.name ? String(row.contractors.name) : null),
    work_context_label: workContext.label || null,
    assignments: assignment.assignments,
    assignment_names: assignment.assignment_names,
    assignment_primary_name: assignment.assignment_primary_name,
    latest_event_type: latestEvent?.event_type ?? null,
    latest_event_at: latestEvent?.created_at ?? null,
  };
}

function suppressRetestParentRows(rows: JobDispatchRow[], hiddenFailedParentIds: Set<string>) {
  return rows.filter((row) => {
    const jobId = String(row?.id ?? '').trim();
    if (!jobId) return false;

    const ops = String(row?.ops_status ?? '').toLowerCase();
    if (ops !== 'failed') return true;

    if (hiddenFailedParentIds.has(jobId)) return false;
    return true;
  });
}

async function loadScopedDispatchJobRows(params: {
  supabase: any;
  scopedCustomerIds: string[];
  baseSelect: string;
  scheduledDateRange?: DispatchDateRange;
  unscheduledOnly?: boolean;
}): Promise<JobDispatchRow[]> {
  const { supabase, scopedCustomerIds, baseSelect, scheduledDateRange, unscheduledOnly } = params;

  if (!scopedCustomerIds.length) return [];

  let query = supabase
    .from('jobs')
    .select(baseSelect)
    .in('customer_id', scopedCustomerIds)
    .is('deleted_at', null);

  if (unscheduledOnly) {
    query = query.is('scheduled_date', null);
  } else if (scheduledDateRange) {
    query = query
      .not('scheduled_date', 'is', null)
      .gte('scheduled_date', scheduledDateRange.startDate)
      .lte('scheduled_date', scheduledDateRange.endDate);
  }

  const { data: scopedRows, error: scopedErr } = await query
    .order('scheduled_date', { ascending: true })
    .order('window_start', { ascending: true })
    .order('created_at', { ascending: true });

  if (scopedErr) throw scopedErr;

  return (scopedRows ?? []) as JobDispatchRow[];
}

async function loadScopedCustomerIds(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<string[]> {
  const { supabase, accountOwnerUserId } = params;

  const { data: customerRows, error: customerErr } = await supabase
    .from('customers')
    .select('id')
    .eq('owner_user_id', accountOwnerUserId);

  if (customerErr) throw customerErr;

  return (customerRows ?? [])
    .map((row: CustomerScopeRow) => String(row?.id ?? '').trim())
    .filter(Boolean);
}

async function getActiveInternalUserIdsForCalendarBlocks(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<string[]> {
  const { supabase, accountOwnerUserId } = params;

  const { data: userRows, error: userErr } = await supabase
    .from('internal_users')
    .select('user_id')
    .eq('account_owner_user_id', accountOwnerUserId)
    .eq('is_active', true);

  if (userErr) throw userErr;

  return (userRows ?? [])
    .map((row: InternalUserIdRow) => String(row?.user_id ?? '').trim())
    .filter(Boolean);
}

function resolveDispatchDateRange(params: {
  mode: DispatchViewMode;
  anchorDate: string;
  rangeStartDate?: string | null;
  rangeEndDate?: string | null;
}): DispatchDateRange {
  const { mode, anchorDate, rangeStartDate, rangeEndDate } = params;

  let startDate = mode === 'week' ? startOfWeekYmd(anchorDate) : anchorDate;
  let endDate = mode === 'week' ? addDaysYmd(startDate, 6) : anchorDate;

  const requestedStart = normalizeAnchorDate(rangeStartDate);
  const requestedEnd = normalizeAnchorDate(rangeEndDate);

  if (String(rangeStartDate ?? '').trim()) startDate = requestedStart;
  if (String(rangeEndDate ?? '').trim()) endDate = requestedEnd;

  if (startDate > endDate) {
    return {
      startDate: endDate,
      endDate: startDate,
    };
  }

  return { startDate, endDate };
}

function buildRangeDays(params: {
  startDate: string;
  endDate: string;
  jobs: DispatchJob[];
}) {
  const { startDate, endDate, jobs } = params;
  const jobsByDate = new Map<string, DispatchJob[]>();

  for (const job of jobs) {
    const date = String(job.scheduled_date ?? '').trim();
    if (!date) continue;
    const current = jobsByDate.get(date) ?? [];
    current.push(job);
    jobsByDate.set(date, current);
  }

  const days: Array<{ date: string; jobs: DispatchJob[] }> = [];
  for (let cursor = startDate; cursor <= endDate; cursor = addDaysYmd(cursor, 1)) {
    days.push({
      date: cursor,
      jobs: jobsByDate.get(cursor) ?? [],
    });
  }

  return days;
}

export async function getDispatchCalendarData(params: {
  mode: DispatchViewMode;
  anchorDate?: string | null;
  rangeStartDate?: string | null;
  rangeEndDate?: string | null;
  view?: string | null;
  techFilterType?: CalendarTimingDebugTechFilter;
}): Promise<DispatchCalendarData> {
  const timingEnabled = isCalendarTimingDebugEnabled();
  const totalStartedAt = timingEnabled ? nowMs() : 0;
  const timings: Record<string, number> = {};

  const { supabase, internalUser } = await timeCalendarStep(timingEnabled, timings, 'auth_internal_user_ms', async () => {
    const scopedSupabase = await createClient();
    const internalResult = await requireInternalUser({ supabase: scopedSupabase });
    return {
      supabase: scopedSupabase,
      internalUser: internalResult.internalUser,
    };
  });

  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? '').trim();
  if (!accountOwnerUserId) {
    throw new Error('NOT_AUTHORIZED');
  }
  const mode = params.mode === 'week' ? 'week' : 'day';
  const anchorDate = normalizeAnchorDate(params.anchorDate);
  const dispatchAttentionWindowStart = addDaysYmd(anchorDate, -7);
  const dispatchAttentionWindowEnd = addDaysYmd(anchorDate, 21);
  const dispatchRange = resolveDispatchDateRange({
    mode,
    anchorDate,
    rangeStartDate: params.rangeStartDate,
    rangeEndDate: params.rangeEndDate,
  });

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
    'customer_phone',
    'job_address',
    'customer_first_name',
    'customer_last_name',
    'contractor_id',
    'contractors(name)',
    'customers:customer_id(phone)',
    'locations:location_id(city)',
    'visit_scope_summary',
    'visit_scope_items',
    'created_at',
    'deleted_at',
  ].join(', ');

  const scopedCustomerIds = await timeCalendarStep(timingEnabled, timings, 'scoped_customer_lookup_ms', () =>
    loadScopedCustomerIds({
      supabase,
      accountOwnerUserId,
    }),
  );

  const [scheduledRangeRows, scheduledAttentionRows, unscheduledRows] = await Promise.all([
    timeCalendarStep(timingEnabled, timings, 'scheduled_range_jobs_query_ms', () =>
      loadScopedDispatchJobRows({
        supabase,
        scopedCustomerIds,
        baseSelect,
        scheduledDateRange: dispatchRange,
      }),
    ),
    timeCalendarStep(timingEnabled, timings, 'attention_window_jobs_query_ms', () =>
      loadScopedDispatchJobRows({
        supabase,
        scopedCustomerIds,
        baseSelect,
        scheduledDateRange: {
          startDate: dispatchAttentionWindowStart,
          endDate: dispatchAttentionWindowEnd,
        },
      }),
    ),
    timeCalendarStep(timingEnabled, timings, 'unscheduled_jobs_query_ms', () =>
      loadScopedDispatchJobRows({
        supabase,
        scopedCustomerIds,
        baseSelect,
        unscheduledOnly: true,
      }),
    ),
  ]);

  function isOnHold(job: JobDispatchRow) {
    const ops = String(job.ops_status ?? '').toLowerCase();
    const status = String(job.status ?? '').toLowerCase();
    return ops === 'on_hold' || status === 'on_hold';
  }

  // Active queue semantics remain separate from calendar historical visibility.
  function isActive(job: JobDispatchRow) {
    const ops = String(job.ops_status ?? '').toLowerCase();
    const status = String(job.status ?? '').toLowerCase();
    if (isOnHold(job)) return false;
    if (ops === 'closed' || ops === 'cancelled') return false;
    if (status === 'closed' || status === 'cancelled') return false;
    return true;
  }

  function isCalendarScheduled(job: JobDispatchRow) {
    if (!job.scheduled_date) return false;
    // Calendar is a record-of-truth schedule surface; keep historical scheduled rows.
    // On-hold rows remain excluded from calendar layout by existing dispatch behavior.
    if (isOnHold(job)) return false;
    return true;
  }

  // Type guard for JobDispatchRow
  function isJobDispatchRow(row: any): row is JobDispatchRow {
    return row && typeof row.id === 'string' && typeof row.status !== 'undefined' && typeof row.ops_status !== 'undefined';
  }

  const validScheduledRangeRows = (scheduledRangeRows ?? []).filter(isJobDispatchRow) as JobDispatchRow[];
  const validScheduledAttentionRows = (scheduledAttentionRows ?? []).filter(isJobDispatchRow) as JobDispatchRow[];
  const validUnscheduledRows = (unscheduledRows ?? []).filter(isJobDispatchRow) as JobDispatchRow[];

  const validRows = [
    ...validScheduledRangeRows,
    ...validScheduledAttentionRows,
    ...validUnscheduledRows,
  ];

  const activeRetestParentIds = new Set(
    validRows
      .filter((row) => isActive(row) && !!String(row.parent_job_id ?? '').trim())
      .map((row) => String(row.parent_job_id ?? '').trim())
      .filter(Boolean)
  );

  // Canonical scheduled calendar jobs include historical scheduled rows.
  const scheduledCalendarRows = validScheduledRangeRows.filter((row) => isCalendarScheduled(row));
  const scheduledAttentionCalendarRows = validScheduledAttentionRows.filter((row) => isCalendarScheduled(row));

  // Canonical unscheduled active jobs
  const unscheduledActiveRows = suppressRetestParentRows(
    validUnscheduledRows.filter((row) => isActive(row) && !row.scheduled_date),
    activeRetestParentIds,
  );

  // Assignment and event mapping
  const allJobIds = Array.from(
    new Set(
      [
        ...scheduledCalendarRows,
        ...scheduledAttentionCalendarRows,
        ...unscheduledActiveRows,
      ]
        .map((row) => String(row?.id ?? '').trim())
        .filter(Boolean),
    ),
  );
  const assignmentMap = await timeCalendarStep(timingEnabled, timings, 'assignment_query_ms', () =>
    getActiveJobAssignmentDisplayMap({
      supabase,
      jobIds: allJobIds,
    }),
  );
  const assignmentRowCount = Object.values(assignmentMap).reduce((total, rows) => total + rows.length, 0);

  const latestEventByJob = new Map<string, { event_type: string | null; created_at: string | null }>();
  let eventRowCount = 0;
  if (allJobIds.length) {
    const { data: eventRows, error: eventErr } = await timeCalendarStep(timingEnabled, timings, 'latest_job_events_query_ms', async () =>
      await supabase
        .from('job_events')
        .select('job_id, event_type, created_at')
        .in('job_id', allJobIds)
        .order('created_at', { ascending: false }),
    );
    if (eventErr) throw eventErr;
    eventRowCount = (eventRows ?? []).length;

    for (const event of (eventRows ?? []) as JobEventRow[]) {
      const jobId = String(event?.job_id ?? '').trim();
      if (!jobId || latestEventByJob.has(jobId)) continue;
      latestEventByJob.set(jobId, {
        event_type: event?.event_type ? String(event.event_type) : null,
        created_at: event?.created_at ? String(event.created_at) : null,
      });
    }
  }

  // Canonical scheduled jobs (normalized)
  const scheduledCalendarJobs = scheduledCalendarRows.map((row) =>
    mergeJobRow({ row, assignmentMap, latestEventByJob })
  );

  // Canonical unscheduled jobs (normalized)
  const unscheduledActiveJobs = unscheduledActiveRows.map((row) =>
    mergeJobRow({ row, assignmentMap, latestEventByJob })
  );

  const scheduledAttentionJobs = scheduledAttentionCalendarRows.map((row) =>
    mergeJobRow({ row, assignmentMap, latestEventByJob })
  );

  const scheduledAttentionWindowJobs = scheduledAttentionJobs.filter((job) => {
    const scheduledDate = String(job.scheduled_date ?? '').trim();
    if (!scheduledDate) return false;
    return scheduledDate >= dispatchAttentionWindowStart && scheduledDate <= dispatchAttentionWindowEnd;
  });

  // Build day/week/range from canonical scheduled jobs
  const dayJobs = scheduledCalendarJobs.filter((job) => String(job.scheduled_date) === anchorDate);
  const weekDays = Array.from({ length: 7 }).map((_, index) => {
    const date = addDaysYmd(weekStart, index);
    const jobs = scheduledCalendarJobs.filter((job) => String(job.scheduled_date ?? '') === date);
    return { date, jobs };
  });

  const rangeDays = buildRangeDays({
    startDate: dispatchRange.startDate,
    endDate: dispatchRange.endDate,
    jobs: scheduledCalendarJobs,
  });

  const assignableUsers = (await timeCalendarStep(timingEnabled, timings, 'assignable_users_profile_resolution_ms', () =>
    getAssignableInternalUsers({
      supabase,
      accountOwnerUserId,
    }),
  )).map((user) => ({
    user_id: String(user.user_id),
    display_name: String(user.display_name),
  }));

  const assignableUserIds = assignableUsers.map((user) => user.user_id);
  const calendarBlockEvents: DispatchCalendarBlockEvent[] = [];

  if (assignableUserIds.length) {
    const blockRangeStart = laDateTimeToUtcIso(dispatchRange.startDate, '00:00');
    const blockRangeEnd = laDateTimeToUtcIso(addDaysYmd(dispatchRange.endDate, 1), '00:00');

    const { data: eventRows, error: eventErr } = await timeCalendarStep(timingEnabled, timings, 'calendar_block_events_query_ms', async () =>
      await supabase
        .from('calendar_events')
        .select('id, title, description, status, internal_user_id, start_at, end_at, event_type')
        .eq('owner_user_id', internalUser.account_owner_user_id)
        .eq('event_type', 'block')
        .in('internal_user_id', assignableUserIds)
        .gte('start_at', blockRangeStart)
        .lt('start_at', blockRangeEnd)
        .order('start_at', { ascending: true }),
    );

    if (eventErr) throw eventErr;

    for (const row of (eventRows ?? []) as CalendarEventRow[]) {
      const id = String(row?.id ?? '').trim();
      const internalUserId = String(row?.internal_user_id ?? '').trim();
      const startAt = String(row?.start_at ?? '').trim();
      const endAt = String(row?.end_at ?? '').trim();
      if (!id || !internalUserId || !startAt || !endAt) continue;

      const calendarDate = displayDateLA(startAt);
      const endDate = displayDateLA(endAt);
      const startTime = displayTimeLA(startAt);
      const endTime = displayTimeLA(endAt);

      if (!calendarDate || !startTime || !endTime) continue;
      if (calendarDate !== endDate) continue;

      calendarBlockEvents.push({
        id,
        title: String(row?.title ?? '').trim() || 'Blocked',
        description: row?.description ? String(row.description).trim() || null : null,
        status: row?.status ? String(row.status) : null,
        internal_user_id: internalUserId,
        start_at: startAt,
        end_at: endAt,
        calendar_date: calendarDate,
        start_time: startTime,
        end_time: endTime,
      });
    }
  }

  if (timingEnabled) {
    const totalMs = nowMs() - totalStartedAt;
    console.log(JSON.stringify({
      marker: 'calendar_timing_debug',
      view: normalizeTimingDebugView(params.view),
      mode,
      tech_filter_type: params.techFilterType ?? 'all',
      range: {
        start: dispatchRange.startDate,
        end: dispatchRange.endDate,
      },
      attention_range: {
        start: dispatchAttentionWindowStart,
        end: dispatchAttentionWindowEnd,
      },
      timings_ms: {
        total_getDispatchCalendarData: totalMs,
        ...timings,
      },
      counts: {
        scoped_customer_count: scopedCustomerIds.length,
        scheduled_range_query_rows: validScheduledRangeRows.length,
        attention_window_query_rows: validScheduledAttentionRows.length,
        unscheduled_query_rows: validUnscheduledRows.length,
        final_collected_job_count: allJobIds.length,
        final_scheduled_count: scheduledCalendarJobs.length,
        final_attention_count: scheduledAttentionWindowJobs.length,
        final_unscheduled_count: unscheduledActiveJobs.length,
        final_assignment_row_count: assignmentRowCount,
        final_event_row_count: eventRowCount,
        final_block_event_count: calendarBlockEvents.length,
        assignable_user_count: assignableUsers.length,
      },
    }));
  }

  return {
    mode,
    anchorDate,
    range: {
      startDate: dispatchRange.startDate,
      endDate: dispatchRange.endDate,
      days: rangeDays,
    },
    day: {
      date: anchorDate,
      jobs: dayJobs,
    },
    week: {
      startDate: weekStart,
      endDate: weekEnd,
      days: weekDays,
    },
    scheduledAttentionWindowJobs,
    // All calendar consumers must use these canonical collections
    unassignedScheduledJobs: unscheduledActiveJobs,
    calendarBlockEvents,
    assignableUsers,
  };
}

type DispatchCalendarLoadParams = {
  mode: DispatchViewMode;
  anchorDate?: string | null;
  rangeStartDate?: string | null;
  rangeEndDate?: string | null;
  view?: string | null;
  techFilterType?: CalendarTimingDebugTechFilter;
};

async function loadCalendarContext(
  params: DispatchCalendarLoadParams,
  timingEnabled: boolean,
  timings: Record<string, number>,
) {
  const { supabase, internalUser } = await timeCalendarStep(timingEnabled, timings, 'auth_internal_user_ms', async () => {
    const scopedSupabase = await createClient();
    const internalResult = await requireInternalUser({ supabase: scopedSupabase });
    return {
      supabase: scopedSupabase,
      internalUser: internalResult.internalUser,
    };
  });

  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? '').trim();
  if (!accountOwnerUserId) {
    throw new Error('NOT_AUTHORIZED');
  }

  const mode: DispatchViewMode = params.mode === 'week' ? 'week' : 'day';
  const anchorDate = normalizeAnchorDate(params.anchorDate);
  const dispatchAttentionWindowStart = addDaysYmd(anchorDate, -7);
  const dispatchAttentionWindowEnd = addDaysYmd(anchorDate, 21);
  const dispatchRange = resolveDispatchDateRange({
    mode,
    anchorDate,
    rangeStartDate: params.rangeStartDate,
    rangeEndDate: params.rangeEndDate,
  });

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
    'customer_phone',
    'job_address',
    'customer_first_name',
    'customer_last_name',
    'contractor_id',
    'contractors(name)',
    'customers:customer_id(phone)',
    'locations:location_id(city)',
    'visit_scope_summary',
    'visit_scope_items',
    'created_at',
    'deleted_at',
  ].join(', ');

  const scopedCustomerIds = await timeCalendarStep(timingEnabled, timings, 'scoped_customer_lookup_ms', () =>
    loadScopedCustomerIds({
      supabase,
      accountOwnerUserId,
    }),
  );

  return {
    supabase,
    internalUser,
    accountOwnerUserId,
    mode,
    anchorDate,
    dispatchAttentionWindowStart,
    dispatchAttentionWindowEnd,
    dispatchRange,
    weekStart: startOfWeekYmd(anchorDate),
    baseSelect,
    scopedCustomerIds,
  };
}

function isJobDispatchRow(row: any): row is JobDispatchRow {
  return row && typeof row.id === 'string' && typeof row.status !== 'undefined' && typeof row.ops_status !== 'undefined';
}

function isOnHoldDispatchRow(job: JobDispatchRow) {
  const ops = String(job.ops_status ?? '').toLowerCase();
  const status = String(job.status ?? '').toLowerCase();
  return ops === 'on_hold' || status === 'on_hold';
}

function isActiveDispatchRow(job: JobDispatchRow) {
  const ops = String(job.ops_status ?? '').toLowerCase();
  const status = String(job.status ?? '').toLowerCase();
  if (isOnHoldDispatchRow(job)) return false;
  if (ops === 'closed' || ops === 'cancelled') return false;
  if (status === 'closed' || status === 'cancelled') return false;
  return true;
}

function isCalendarScheduledDispatchRow(job: JobDispatchRow) {
  if (!job.scheduled_date) return false;
  if (isOnHoldDispatchRow(job)) return false;
  return true;
}

function latestEventMapFromRows(eventRows: JobEventRow[] | null | undefined) {
  const latestEventByJob = new Map<string, { event_type: string | null; created_at: string | null }>();
  for (const event of (eventRows ?? []) as JobEventRow[]) {
    const jobId = String(event?.job_id ?? '').trim();
    if (!jobId || latestEventByJob.has(jobId)) continue;
    latestEventByJob.set(jobId, {
      event_type: event?.event_type ? String(event.event_type) : null,
      created_at: event?.created_at ? String(event.created_at) : null,
    });
  }
  return latestEventByJob;
}

async function loadAssignmentsAndLatestEvents(params: {
  supabase: any;
  jobIds: string[];
  timingEnabled: boolean;
  timings: Record<string, number>;
  assignmentTimingLabel: string;
  eventTimingLabel: string;
  includeLatestEvents?: boolean;
}) {
  const { supabase, jobIds, timingEnabled, timings, assignmentTimingLabel, eventTimingLabel } = params;
  const assignmentMap = await timeCalendarStep(timingEnabled, timings, assignmentTimingLabel, () =>
    getActiveJobAssignmentDisplayMap({
      supabase,
      jobIds,
    }),
  );
  const assignmentRowCount = Object.values(assignmentMap).reduce((total, rows) => total + rows.length, 0);

  let eventRowCount = 0;
  let latestEventByJob = new Map<string, { event_type: string | null; created_at: string | null }>();
  if (params.includeLatestEvents !== false && jobIds.length) {
    const { data: eventRows, error: eventErr } = await timeCalendarStep(timingEnabled, timings, eventTimingLabel, async () =>
      await supabase
        .from('job_events')
        .select('job_id, event_type, created_at')
        .in('job_id', jobIds)
        .order('created_at', { ascending: false }),
    );
    if (eventErr) throw eventErr;
    eventRowCount = (eventRows ?? []).length;
    latestEventByJob = latestEventMapFromRows(eventRows as JobEventRow[]);
  } else if (timingEnabled) {
    timings[eventTimingLabel] = 0;
  }

  return {
    assignmentMap,
    assignmentRowCount,
    latestEventByJob,
    eventRowCount,
  };
}

export async function getDispatchCalendarBoardData(params: DispatchCalendarLoadParams): Promise<DispatchCalendarBoardData> {
  const timingEnabled = isCalendarTimingDebugEnabled();
  const totalStartedAt = timingEnabled ? nowMs() : 0;
  const timings: Record<string, number> = {};
  const context = await loadCalendarContext(params, timingEnabled, timings);

  const scheduledRangeRows = await timeCalendarStep(timingEnabled, timings, 'primary_scheduled_range_jobs_query_ms', () =>
    loadScopedDispatchJobRows({
      supabase: context.supabase,
      scopedCustomerIds: context.scopedCustomerIds,
      baseSelect: context.baseSelect,
      scheduledDateRange: context.dispatchRange,
    }),
  );

  const validScheduledRangeRows = (scheduledRangeRows ?? []).filter(isJobDispatchRow) as JobDispatchRow[];
  const scheduledCalendarRows = validScheduledRangeRows.filter((row) => isCalendarScheduledDispatchRow(row));
  const primaryJobIds = Array.from(
    new Set(scheduledCalendarRows.map((row) => String(row?.id ?? '').trim()).filter(Boolean)),
  );

  const { assignmentMap, assignmentRowCount, latestEventByJob, eventRowCount } = await loadAssignmentsAndLatestEvents({
    supabase: context.supabase,
    jobIds: primaryJobIds,
    timingEnabled,
    timings,
    assignmentTimingLabel: 'primary_assignment_query_ms',
    eventTimingLabel: 'primary_latest_job_events_query_ms',
    includeLatestEvents: false,
  });

  const scheduledCalendarJobs = scheduledCalendarRows.map((row) =>
    mergeJobRow({ row, assignmentMap, latestEventByJob }),
  );

  const dayJobs = scheduledCalendarJobs.filter((job) => String(job.scheduled_date) === context.anchorDate);
  const weekEnd = addDaysYmd(context.weekStart, 6);
  const weekDays = Array.from({ length: 7 }).map((_, index) => {
    const date = addDaysYmd(context.weekStart, index);
    const jobs = scheduledCalendarJobs.filter((job) => String(job.scheduled_date ?? '') === date);
    return { date, jobs };
  });

  const rangeDays = buildRangeDays({
    startDate: context.dispatchRange.startDate,
    endDate: context.dispatchRange.endDate,
    jobs: scheduledCalendarJobs,
  });

  if (timingEnabled) {
    timings.primary_assignable_users_query_ms = 0;
    timings.primary_assignable_users_profile_resolution_ms = 0;
  }

  const activeInternalUserIdsForBlocks = await timeCalendarStep(
    timingEnabled,
    timings,
    'primary_active_user_ids_for_blocks_query_ms',
    () =>
      getActiveInternalUserIdsForCalendarBlocks({
        supabase: context.supabase,
        accountOwnerUserId: context.accountOwnerUserId,
      }),
  );

  const assignableUserIds = activeInternalUserIdsForBlocks;
  const calendarBlockEvents: DispatchCalendarBlockEvent[] = [];

  if (assignableUserIds.length) {
    const blockRangeStart = laDateTimeToUtcIso(context.dispatchRange.startDate, '00:00');
    const blockRangeEnd = laDateTimeToUtcIso(addDaysYmd(context.dispatchRange.endDate, 1), '00:00');

    const { data: eventRows, error: eventErr } = await timeCalendarStep(timingEnabled, timings, 'primary_calendar_block_events_query_ms', async () =>
      await context.supabase
        .from('calendar_events')
        .select('id, title, description, status, internal_user_id, start_at, end_at, event_type')
        .eq('owner_user_id', context.internalUser.account_owner_user_id)
        .eq('event_type', 'block')
        .in('internal_user_id', assignableUserIds)
        .gte('start_at', blockRangeStart)
        .lt('start_at', blockRangeEnd)
        .order('start_at', { ascending: true }),
    );

    if (eventErr) throw eventErr;

    for (const row of (eventRows ?? []) as CalendarEventRow[]) {
      const id = String(row?.id ?? '').trim();
      const internalUserId = String(row?.internal_user_id ?? '').trim();
      const startAt = String(row?.start_at ?? '').trim();
      const endAt = String(row?.end_at ?? '').trim();
      if (!id || !internalUserId || !startAt || !endAt) continue;

      const calendarDate = displayDateLA(startAt);
      const endDate = displayDateLA(endAt);
      const startTime = displayTimeLA(startAt);
      const endTime = displayTimeLA(endAt);

      if (!calendarDate || !startTime || !endTime) continue;
      if (calendarDate !== endDate) continue;

      calendarBlockEvents.push({
        id,
        title: String(row?.title ?? '').trim() || 'Blocked',
        description: row?.description ? String(row.description).trim() || null : null,
        status: row?.status ? String(row.status) : null,
        internal_user_id: internalUserId,
        start_at: startAt,
        end_at: endAt,
        calendar_date: calendarDate,
        start_time: startTime,
        end_time: endTime,
      });
    }
  }

  if (timingEnabled) {
    console.log(JSON.stringify({
      marker: 'calendar_timing_debug',
      loader: 'primary_board',
      view: normalizeTimingDebugView(params.view),
      mode: context.mode,
      tech_filter_type: params.techFilterType ?? 'all',
      range: {
        start: context.dispatchRange.startDate,
        end: context.dispatchRange.endDate,
      },
      timings_ms: {
        total_primary_board_ms: nowMs() - totalStartedAt,
        ...timings,
      },
      counts: {
        scoped_customer_count: context.scopedCustomerIds.length,
        primary_scheduled_range_query_rows: validScheduledRangeRows.length,
        primary_final_scheduled_count: scheduledCalendarJobs.length,
        primary_assignment_row_count: assignmentRowCount,
        primary_event_row_count: eventRowCount,
        primary_block_event_count: calendarBlockEvents.length,
        primary_active_user_id_count: activeInternalUserIdsForBlocks.length,
        primary_assignable_user_count: 0,
      },
    }));
  }

  return {
    mode: context.mode,
    anchorDate: context.anchorDate,
    range: {
      startDate: context.dispatchRange.startDate,
      endDate: context.dispatchRange.endDate,
      days: rangeDays,
    },
    day: {
      date: context.anchorDate,
      jobs: dayJobs,
    },
    week: {
      startDate: context.weekStart,
      endDate: weekEnd,
      days: weekDays,
    },
    calendarBlockEvents,
  };
}

export async function getDispatchCalendarRosterData(params: DispatchCalendarLoadParams): Promise<DispatchCalendarRosterData> {
  const timingEnabled = isCalendarTimingDebugEnabled();
  const totalStartedAt = timingEnabled ? nowMs() : 0;
  const timings: Record<string, number> = {};

  const { supabase, internalUser } = await timeCalendarStep(timingEnabled, timings, 'secondary_roster_auth_internal_user_ms', async () => {
    const scopedSupabase = await createClient();
    const internalResult = await requireInternalUser({ supabase: scopedSupabase });
    return {
      supabase: scopedSupabase,
      internalUser: internalResult.internalUser,
    };
  });

  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? '').trim();
  if (!accountOwnerUserId) {
    throw new Error('NOT_AUTHORIZED');
  }

  const assignableUsers = (await timeCalendarStep(timingEnabled, timings, 'secondary_assignable_users_query_ms', () =>
    getAssignableInternalUsers({
      supabase,
      accountOwnerUserId,
    }),
  )).map((user) => ({
    user_id: String(user.user_id),
    display_name: String(user.display_name),
  }));

  if (timingEnabled) {
    console.log(JSON.stringify({
      marker: 'calendar_timing_debug',
      loader: 'secondary_roster',
      view: normalizeTimingDebugView(params.view),
      mode: params.mode === 'week' ? 'week' : 'day',
      tech_filter_type: params.techFilterType ?? 'all',
      timings_ms: {
        total_secondary_roster_ms: nowMs() - totalStartedAt,
        ...timings,
      },
      counts: {
        secondary_assignable_user_count: assignableUsers.length,
      },
    }));
  }

  return {
    assignableUsers,
  };
}

export async function getDispatchCalendarQueueData(params: DispatchCalendarLoadParams): Promise<DispatchCalendarQueueData> {
  const timingEnabled = isCalendarTimingDebugEnabled();
  const totalStartedAt = timingEnabled ? nowMs() : 0;
  const timings: Record<string, number> = {};
  const context = await loadCalendarContext(params, timingEnabled, timings);

  const [scheduledAttentionRows, unscheduledRows] = await Promise.all([
    timeCalendarStep(timingEnabled, timings, 'queue_attention_window_jobs_query_ms', () =>
      loadScopedDispatchJobRows({
        supabase: context.supabase,
        scopedCustomerIds: context.scopedCustomerIds,
        baseSelect: context.baseSelect,
        scheduledDateRange: {
          startDate: context.dispatchAttentionWindowStart,
          endDate: context.dispatchAttentionWindowEnd,
        },
      }),
    ),
    timeCalendarStep(timingEnabled, timings, 'queue_unscheduled_jobs_query_ms', () =>
      loadScopedDispatchJobRows({
        supabase: context.supabase,
        scopedCustomerIds: context.scopedCustomerIds,
        baseSelect: context.baseSelect,
        unscheduledOnly: true,
      }),
    ),
  ]);

  const validScheduledAttentionRows = (scheduledAttentionRows ?? []).filter(isJobDispatchRow) as JobDispatchRow[];
  const validUnscheduledRows = (unscheduledRows ?? []).filter(isJobDispatchRow) as JobDispatchRow[];
  const validRows = [...validScheduledAttentionRows, ...validUnscheduledRows];
  const activeRetestParentIds = new Set(
    validRows
      .filter((row) => isActiveDispatchRow(row) && !!String(row.parent_job_id ?? '').trim())
      .map((row) => String(row.parent_job_id ?? '').trim())
      .filter(Boolean),
  );

  const scheduledAttentionCalendarRows = validScheduledAttentionRows.filter((row) => isCalendarScheduledDispatchRow(row));
  const unscheduledActiveRows = suppressRetestParentRows(
    validUnscheduledRows.filter((row) => isActiveDispatchRow(row) && !row.scheduled_date),
    activeRetestParentIds,
  );

  const queueJobIds = Array.from(
    new Set(
      [...scheduledAttentionCalendarRows, ...unscheduledActiveRows]
        .map((row) => String(row?.id ?? '').trim())
        .filter(Boolean),
    ),
  );

  const { assignmentMap, assignmentRowCount, latestEventByJob, eventRowCount } = await loadAssignmentsAndLatestEvents({
    supabase: context.supabase,
    jobIds: queueJobIds,
    timingEnabled,
    timings,
    assignmentTimingLabel: 'queue_assignment_query_ms',
    eventTimingLabel: 'queue_latest_job_events_query_ms',
  });

  const scheduledAttentionJobs = scheduledAttentionCalendarRows.map((row) =>
    mergeJobRow({ row, assignmentMap, latestEventByJob }),
  );
  const scheduledAttentionWindowJobs = scheduledAttentionJobs.filter((job) => {
    const scheduledDate = String(job.scheduled_date ?? '').trim();
    if (!scheduledDate) return false;
    return scheduledDate >= context.dispatchAttentionWindowStart && scheduledDate <= context.dispatchAttentionWindowEnd;
  });

  const unscheduledActiveJobs = unscheduledActiveRows.map((row) =>
    mergeJobRow({ row, assignmentMap, latestEventByJob }),
  );

  if (timingEnabled) {
    console.log(JSON.stringify({
      marker: 'calendar_timing_debug',
      loader: 'secondary_queue',
      view: normalizeTimingDebugView(params.view),
      mode: context.mode,
      tech_filter_type: params.techFilterType ?? 'all',
      attention_range: {
        start: context.dispatchAttentionWindowStart,
        end: context.dispatchAttentionWindowEnd,
      },
      timings_ms: {
        total_secondary_queue_ms: nowMs() - totalStartedAt,
        ...timings,
      },
      counts: {
        scoped_customer_count: context.scopedCustomerIds.length,
        queue_attention_window_query_rows: validScheduledAttentionRows.length,
        queue_unscheduled_query_rows: validUnscheduledRows.length,
        queue_final_collected_job_count: queueJobIds.length,
        queue_final_attention_count: scheduledAttentionWindowJobs.length,
        queue_final_unscheduled_count: unscheduledActiveJobs.length,
        queue_assignment_row_count: assignmentRowCount,
        queue_event_row_count: eventRowCount,
      },
    }));
  }

  return {
    scheduledAttentionWindowJobs,
    unassignedScheduledJobs: unscheduledActiveJobs,
  };
}
