'use server';

import { requireInternalUser } from '@/lib/auth/internal-user';
import { createClient } from '@/lib/supabase/server';
import { getActiveJobAssignmentDisplayMap, getAssignableInternalUsers } from '@/lib/staffing/human-layer';
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

type DispatchDateRange = {
  startDate: string;
  endDate: string;
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
  const canonicalCity = Array.isArray(row.locations)
    ? String(row.locations[0]?.city ?? '').trim()
    : String(row.locations?.city ?? '').trim();
  const canonicalPhone = Array.isArray(row.customers)
    ? String(row.customers[0]?.phone ?? '').trim()
    : String(row.customers?.phone ?? '').trim();
  const snapshotCity = String(row?.city ?? '').trim();
  const snapshotPhone = String(row?.customer_phone ?? '').trim();

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
}): Promise<DispatchCalendarData> {
  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });
  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? '').trim();
  if (!accountOwnerUserId) {
    throw new Error('NOT_AUTHORIZED');
  }
  const mode = params.mode === 'week' ? 'week' : 'day';
  const anchorDate = normalizeAnchorDate(params.anchorDate);
  const dispatchAttentionWindowStart = addDaysYmd(laTodayYmd(), -7);
  const dispatchAttentionWindowEnd = addDaysYmd(laTodayYmd(), 21);
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
    'created_at',
    'deleted_at',
  ].join(', ');

  const scopedCustomerIds = await loadScopedCustomerIds({
    supabase,
    accountOwnerUserId,
  });

  const [scheduledRangeRows, scheduledAttentionRows, unscheduledRows] = await Promise.all([
    loadScopedDispatchJobRows({
      supabase,
      scopedCustomerIds,
      baseSelect,
      scheduledDateRange: dispatchRange,
    }),
    loadScopedDispatchJobRows({
      supabase,
      scopedCustomerIds,
      baseSelect,
      scheduledDateRange: {
        startDate: dispatchAttentionWindowStart,
        endDate: dispatchAttentionWindowEnd,
      },
    }),
    loadScopedDispatchJobRows({
      supabase,
      scopedCustomerIds,
      baseSelect,
      unscheduledOnly: true,
    }),
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
  const assignmentMap = await getActiveJobAssignmentDisplayMap({
    supabase,
    jobIds: allJobIds,
  });

  const latestEventByJob = new Map<string, { event_type: string | null; created_at: string | null }>();
  if (allJobIds.length) {
    const { data: eventRows, error: eventErr } = await supabase
      .from('job_events')
      .select('job_id, event_type, created_at')
      .in('job_id', allJobIds)
      .order('created_at', { ascending: false });
    if (eventErr) throw eventErr;

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

  const assignableUsers = (await getAssignableInternalUsers({
    supabase,
    accountOwnerUserId,
  })).map((user) => ({
    user_id: String(user.user_id),
    display_name: String(user.display_name),
  }));

  const assignableUserIds = assignableUsers.map((user) => user.user_id);
  const calendarBlockEvents: DispatchCalendarBlockEvent[] = [];

  if (assignableUserIds.length) {
    const blockRangeStart = laDateTimeToUtcIso(dispatchRange.startDate, '00:00');
    const blockRangeEnd = laDateTimeToUtcIso(addDaysYmd(dispatchRange.endDate, 1), '00:00');

    const { data: eventRows, error: eventErr } = await supabase
      .from('calendar_events')
      .select('id, title, description, status, internal_user_id, start_at, end_at, event_type')
      .eq('owner_user_id', internalUser.account_owner_user_id)
      .eq('event_type', 'block')
      .in('internal_user_id', assignableUserIds)
      .gte('start_at', blockRangeStart)
      .lt('start_at', blockRangeEnd)
      .order('start_at', { ascending: true });

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
