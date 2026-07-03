import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const getActiveJobAssignmentDisplayMapMock = vi.fn();
const getAssignableInternalUsersMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock('@/lib/auth/internal-user', () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

vi.mock('@/lib/staffing/human-layer', () => ({
  getActiveJobAssignmentDisplayMap: (...args: unknown[]) => getActiveJobAssignmentDisplayMapMock(...args),
  getAssignableInternalUsers: (...args: unknown[]) => getAssignableInternalUsersMock(...args),
}));

vi.mock('@/lib/utils/schedule-la', () => ({
  displayDateLA: (iso: string) => String(iso).slice(0, 10),
  displayTimeLA: (iso: string) => String(iso).slice(11, 16),
  laDateTimeToUtcIso: (date: string, time: string) => `${date}T${time}:00.000Z`,
}));

type JobRow = {
  id: string;
  customer_id: string;
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
  customer_phone: string | null;
  job_address: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  contractor_id: string | null;
  contractors: { name: string | null } | null;
  customers: { phone: string | null } | null;
  locations: { city: string | null } | null;
  visit_scope_summary: string | null;
  visit_scope_items: Array<{ title: string; details: string | null; kind: string }> | null;
  created_at: string;
  deleted_at: string | null;
};

type JobEventRow = {
  job_id: string;
  event_type: string;
  created_at: string;
};

function makeFixture() {
  const customers = [{ id: 'cust-1', owner_user_id: 'owner-1' }];
  const internalUsers = [
    { user_id: 'tech-1', account_owner_user_id: 'owner-1', is_active: true },
    { user_id: 'tech-inactive', account_owner_user_id: 'owner-1', is_active: false },
    { user_id: 'tech-other-account', account_owner_user_id: 'owner-2', is_active: true },
  ];

  const jobs: JobRow[] = [
    {
      id: 'job-assigned-canonical',
      customer_id: 'cust-1',
      location_id: 'loc-1',
      title: 'Attic Duct Repair',
      job_type: 'service',
      status: 'open',
      ops_status: 'scheduled',
      parent_job_id: null,
      scheduled_date: '2026-04-29',
      window_start: '09:00',
      window_end: '11:00',
      city: 'Snapshot City',
      customer_phone: null,
      job_address: '111 Main St',
      customer_first_name: 'Alex',
      customer_last_name: 'Kim',
      contractor_id: null,
      contractors: null,
      customers: { phone: '555-1000' },
      locations: { city: 'Canonical City' },
      visit_scope_summary: null,
      visit_scope_items: [
        { title: 'Diagnostic', details: null, kind: 'primary' },
        { title: 'Replace contactor', details: null, kind: 'primary' },
        { title: 'Filter replacement', details: null, kind: 'companion_service' },
      ],
      created_at: '2026-04-29T08:00:00.000Z',
      deleted_at: null,
    },
    {
      id: 'job-unassigned-fallback',
      customer_id: 'cust-1',
      location_id: 'loc-2',
      title: 'Condenser Check',
      job_type: 'service',
      status: 'open',
      ops_status: 'scheduled',
      parent_job_id: null,
      scheduled_date: '2026-04-29',
      window_start: '12:00',
      window_end: '13:00',
      city: 'Snapshot Fallback City',
      customer_phone: '555-2000',
      job_address: '222 Main St',
      customer_first_name: 'Jordan',
      customer_last_name: 'Lee',
      contractor_id: null,
      contractors: null,
      customers: { phone: null },
      locations: { city: null },
      visit_scope_summary: null,
      visit_scope_items: null,
      created_at: '2026-04-29T08:30:00.000Z',
      deleted_at: null,
    },
    {
      id: 'job-assigned-tech-2',
      customer_id: 'cust-1',
      location_id: 'loc-2',
      title: 'Heat Pump Tuneup',
      job_type: 'service',
      status: 'open',
      ops_status: 'scheduled',
      parent_job_id: null,
      scheduled_date: '2026-04-29',
      window_start: '14:00',
      window_end: '15:00',
      city: 'Snapshot City',
      customer_phone: '555-4000',
      job_address: '444 Main St',
      customer_first_name: 'Morgan',
      customer_last_name: 'Patel',
      contractor_id: null,
      contractors: null,
      customers: { phone: null },
      locations: { city: null },
      visit_scope_summary: null,
      visit_scope_items: null,
      created_at: '2026-04-29T09:00:00.000Z',
      deleted_at: null,
    },
    {
      id: 'job-on-hold-scheduled',
      customer_id: 'cust-1',
      location_id: 'loc-4',
      title: 'Paused But Scheduled Visit',
      job_type: 'service',
      status: 'open',
      ops_status: 'on_hold',
      parent_job_id: null,
      scheduled_date: '2026-04-29',
      window_start: '15:00',
      window_end: '16:00',
      city: 'Hold City',
      customer_phone: '555-5000',
      job_address: '555 Main St',
      customer_first_name: 'Riley',
      customer_last_name: 'Chen',
      contractor_id: null,
      contractors: null,
      customers: { phone: null },
      locations: { city: null },
      visit_scope_summary: null,
      visit_scope_items: null,
      created_at: '2026-04-29T09:15:00.000Z',
      deleted_at: null,
    },
    {
      id: 'job-failed-scheduled',
      customer_id: 'cust-1',
      location_id: 'loc-5',
      title: 'Failed But Scheduled Visit',
      job_type: 'ecc',
      status: 'open',
      ops_status: 'failed',
      parent_job_id: null,
      scheduled_date: '2026-04-29',
      window_start: '16:00',
      window_end: '17:00',
      city: 'Failure City',
      customer_phone: '555-6000',
      job_address: '666 Main St',
      customer_first_name: 'Casey',
      customer_last_name: 'Diaz',
      contractor_id: null,
      contractors: null,
      customers: { phone: null },
      locations: { city: null },
      visit_scope_summary: null,
      visit_scope_items: null,
      created_at: '2026-04-29T09:20:00.000Z',
      deleted_at: null,
    },
    {
      id: 'job-pending-info-scheduled',
      customer_id: 'cust-1',
      location_id: 'loc-6',
      title: 'Pending Info Scheduled Visit',
      job_type: 'service',
      status: 'open',
      ops_status: 'pending_info',
      parent_job_id: null,
      scheduled_date: '2026-04-29',
      window_start: '17:00',
      window_end: '18:00',
      city: 'Pending City',
      customer_phone: '555-7000',
      job_address: '777 Main St',
      customer_first_name: 'Avery',
      customer_last_name: 'Singh',
      contractor_id: null,
      contractors: null,
      customers: { phone: null },
      locations: { city: null },
      visit_scope_summary: null,
      visit_scope_items: null,
      created_at: '2026-04-29T09:25:00.000Z',
      deleted_at: null,
    },
    {
      id: 'job-closed-scheduled',
      customer_id: 'cust-1',
      location_id: 'loc-7',
      title: 'Closed Historical Visit',
      job_type: 'service',
      status: 'completed',
      ops_status: 'closed',
      parent_job_id: null,
      scheduled_date: '2026-04-29',
      window_start: '18:00',
      window_end: '19:00',
      city: 'Closed City',
      customer_phone: '555-8000',
      job_address: '888 Main St',
      customer_first_name: 'Quinn',
      customer_last_name: 'Moore',
      contractor_id: null,
      contractors: null,
      customers: { phone: null },
      locations: { city: null },
      visit_scope_summary: null,
      visit_scope_items: null,
      created_at: '2026-04-29T09:30:00.000Z',
      deleted_at: null,
    },
    {
      id: 'job-cancelled-scheduled',
      customer_id: 'cust-1',
      location_id: 'loc-8',
      title: 'Cancelled Historical Visit',
      job_type: 'service',
      status: 'cancelled',
      ops_status: 'cancelled',
      parent_job_id: null,
      scheduled_date: '2026-04-29',
      window_start: '19:00',
      window_end: '20:00',
      city: 'Cancelled City',
      customer_phone: '555-9000',
      job_address: '999 Main St',
      customer_first_name: 'Drew',
      customer_last_name: 'Hall',
      contractor_id: null,
      contractors: null,
      customers: { phone: null },
      locations: { city: null },
      visit_scope_summary: null,
      visit_scope_items: null,
      created_at: '2026-04-29T09:35:00.000Z',
      deleted_at: null,
    },
    {
      id: 'job-deleted-scheduled',
      customer_id: 'cust-1',
      location_id: 'loc-9',
      title: 'Deleted Scheduled Visit',
      job_type: 'service',
      status: 'open',
      ops_status: 'scheduled',
      parent_job_id: null,
      scheduled_date: '2026-04-29',
      window_start: '20:00',
      window_end: '21:00',
      city: 'Deleted City',
      customer_phone: '555-0000',
      job_address: '000 Main St',
      customer_first_name: 'Deleted',
      customer_last_name: 'Row',
      contractor_id: null,
      contractors: null,
      customers: { phone: null },
      locations: { city: null },
      visit_scope_summary: null,
      visit_scope_items: null,
      created_at: '2026-04-29T09:40:00.000Z',
      deleted_at: '2026-04-29T10:00:00.000Z',
    },
    {
      id: 'job-needs-scheduling',
      customer_id: 'cust-1',
      location_id: 'loc-3',
      title: 'Needs Scheduling Visit',
      job_type: 'service',
      status: 'open',
      ops_status: 'need_to_schedule',
      parent_job_id: null,
      scheduled_date: null,
      window_start: null,
      window_end: null,
      city: 'Queue City',
      customer_phone: '555-3000',
      job_address: '333 Main St',
      customer_first_name: 'Taylor',
      customer_last_name: 'Nguyen',
      contractor_id: null,
      contractors: null,
      customers: { phone: null },
      locations: { city: null },
      visit_scope_summary: null,
      visit_scope_items: null,
      created_at: '2026-04-29T09:30:00.000Z',
      deleted_at: null,
    },
  ];

  const jobEvents: JobEventRow[] = [
    { job_id: 'job-assigned-canonical', event_type: 'scheduled', created_at: '2026-04-29T08:05:00.000Z' },
    { job_id: 'job-unassigned-fallback', event_type: 'scheduled', created_at: '2026-04-29T08:35:00.000Z' },
  ];

  function customersQuery() {
    let ownerFilter = '';
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        if (column === 'owner_user_id') ownerFilter = String(value ?? '').trim();
        return query;
      }),
      then: (onFulfilled: (value: { data: Array<{ id: string }>; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) => {
        const data = customers.filter((row) => row.owner_user_id === ownerFilter).map((row) => ({ id: row.id }));
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
      },
    };
    return query;
  }

  function jobsQuery() {
    let customerIds: string[] = [];
    let scheduledDateStart: string | null = null;
    let scheduledDateEnd: string | null = null;
    let onlyScheduledNull = false;
    let requireScheduledDate = false;
    let onlyDeletedNull = false;

    const query: any = {
      select: vi.fn(() => query),
      in: vi.fn((column: string, value: unknown) => {
        if (column === 'customer_id') {
          customerIds = Array.isArray(value) ? value.map((v) => String(v)) : [];
        }
        return query;
      }),
      is: vi.fn((column: string, value: unknown) => {
        if (column === 'scheduled_date' && value === null) {
          onlyScheduledNull = true;
        }
        if (column === 'deleted_at' && value === null) {
          onlyDeletedNull = true;
        }
        return query;
      }),
      not: vi.fn((column: string, op: string, value: unknown) => {
        if (column === 'scheduled_date' && op === 'is' && value === null) {
          requireScheduledDate = true;
        }
        return query;
      }),
      gte: vi.fn((column: string, value: unknown) => {
        if (column === 'scheduled_date') scheduledDateStart = String(value ?? '').trim() || null;
        return query;
      }),
      lte: vi.fn((column: string, value: unknown) => {
        if (column === 'scheduled_date') scheduledDateEnd = String(value ?? '').trim() || null;
        return query;
      }),
      order: vi.fn(() => query),
      then: (onFulfilled: (value: { data: JobRow[]; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) => {
        const data = jobs.filter((row) => {
          if (!customerIds.includes(row.customer_id)) return false;
          if (onlyDeletedNull && row.deleted_at) return false;

          const scheduledDate = String(row.scheduled_date ?? '').trim();
          if (onlyScheduledNull && scheduledDate) return false;
          if (requireScheduledDate && !scheduledDate) return false;
          if (scheduledDateStart && scheduledDate && scheduledDate < scheduledDateStart) return false;
          if (scheduledDateEnd && scheduledDate && scheduledDate > scheduledDateEnd) return false;

          return true;
        });
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
      },
    };
    return query;
  }

  function jobEventsQuery() {
    let jobIds: string[] = [];
    const query: any = {
      select: vi.fn(() => query),
      in: vi.fn((column: string, value: unknown) => {
        if (column === 'job_id') {
          jobIds = Array.isArray(value) ? value.map((v) => String(v)) : [];
        }
        return query;
      }),
      order: vi.fn(() => query),
      then: (onFulfilled: (value: { data: JobEventRow[]; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) => {
        const data = jobEvents.filter((row) => jobIds.includes(row.job_id));
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
      },
    };
    return query;
  }

  function internalUsersQuery() {
    let accountOwnerFilter = '';
    let isActiveFilter: boolean | null = null;
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        if (column === 'account_owner_user_id') accountOwnerFilter = String(value ?? '').trim();
        if (column === 'is_active') isActiveFilter = Boolean(value);
        return query;
      }),
      then: (onFulfilled: (value: { data: Array<{ user_id: string }>; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) => {
        const data = internalUsers
          .filter((row) => row.account_owner_user_id === accountOwnerFilter)
          .filter((row) => isActiveFilter === null || row.is_active === isActiveFilter)
          .map((row) => ({ user_id: row.user_id }));
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
      },
    };
    return query;
  }

  function calendarEventsQuery() {
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      in: vi.fn(() => query),
      gte: vi.fn(() => query),
      lt: vi.fn(() => query),
      order: vi.fn(() => query),
      then: (onFulfilled: (value: { data: never[]; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) => {
        return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
      },
    };
    return query;
  }

  const supabase = {
    from(table: string) {
      if (table === 'customers') return customersQuery();
      if (table === 'jobs') return jobsQuery();
      if (table === 'job_events') return jobEventsQuery();
      if (table === 'internal_users') return internalUsersQuery();
      if (table === 'calendar_events') return calendarEventsQuery();
      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { supabase };
}

describe('calendar action wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: 'internal-1',
      internalUser: {
        user_id: 'internal-1',
        role: 'office',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    getAssignableInternalUsersMock.mockResolvedValue([
      { user_id: 'tech-1', display_name: 'Tech One' },
      { user_id: 'tech-2', display_name: 'Tech Two' },
    ]);

    getActiveJobAssignmentDisplayMapMock.mockResolvedValue({
      'job-assigned-canonical': [
        {
          user_id: 'tech-1',
          display_name: 'Tech One',
          is_primary: true,
        },
      ],
      'job-unassigned-fallback': [],
      'job-assigned-tech-2': [
        {
          user_id: 'tech-2',
          display_name: 'Tech Two',
          is_primary: true,
        },
      ],
      'job-on-hold-scheduled': [],
    });
  });

  it('splits primary board data from secondary queue data', async () => {
    createClientMock.mockResolvedValue(makeFixture().supabase);

    const { getDispatchCalendarBoardData, getDispatchCalendarQueueData, getDispatchCalendarRosterData } = await import('@/lib/actions/calendar-actions');

    const board = await getDispatchCalendarBoardData({
      mode: 'day',
      anchorDate: '2026-04-29',
    });
    const queue = await getDispatchCalendarQueueData({
      mode: 'day',
      anchorDate: '2026-04-29',
    });
    const roster = await getDispatchCalendarRosterData({
      mode: 'day',
      anchorDate: '2026-04-29',
    });

    expect(board.day.jobs.map((job) => job.id)).toEqual([
      'job-assigned-canonical',
      'job-unassigned-fallback',
      'job-assigned-tech-2',
      'job-on-hold-scheduled',
      'job-failed-scheduled',
      'job-pending-info-scheduled',
      'job-closed-scheduled',
      'job-cancelled-scheduled',
    ]);
    expect(board.day.jobs.map((job) => job.latest_event_type)).toEqual([null, null, null, null, null, null, null, null]);
    expect(board.day.jobs.find((job) => job.id === 'job-on-hold-scheduled')?.ops_status).toBe('on_hold');
    expect(board.day.jobs.find((job) => job.id === 'job-failed-scheduled')?.ops_status).toBe('failed');
    expect(board.day.jobs.find((job) => job.id === 'job-pending-info-scheduled')?.ops_status).toBe('pending_info');
    expect(board.day.jobs.find((job) => job.id === 'job-closed-scheduled')?.ops_status).toBe('closed');
    expect(board.day.jobs.find((job) => job.id === 'job-cancelled-scheduled')?.status).toBe('cancelled');
    expect(board.day.jobs.some((job) => job.id === 'job-deleted-scheduled')).toBe(false);
    expect('unassignedScheduledJobs' in board).toBe(false);
    expect('scheduledAttentionWindowJobs' in board).toBe(false);
    expect('assignableUsers' in board).toBe(false);
    expect(queue.unassignedScheduledJobs.map((job) => job.id)).toEqual(['job-needs-scheduling']);
    expect(queue.scheduledAttentionWindowJobs.map((job) => job.id)).toEqual([
      'job-assigned-canonical',
      'job-unassigned-fallback',
      'job-assigned-tech-2',
      'job-failed-scheduled',
      'job-pending-info-scheduled',
    ]);
    expect(roster.assignableUsers).toEqual([
      { user_id: 'tech-1', display_name: 'Tech One', email: null, calendar_label: 'Tech One' },
      { user_id: 'tech-2', display_name: 'Tech Two', email: null, calendar_label: 'Tech Two' },
    ]);
    expect(getAssignableInternalUsersMock).toHaveBeenCalledTimes(3);
  });

  it('filters office board data to selected allowed calendar users', async () => {
    createClientMock.mockResolvedValue(makeFixture().supabase);

    const { getDispatchCalendarBoardData } = await import('@/lib/actions/calendar-actions');

    const board = await getDispatchCalendarBoardData({
      mode: 'day',
      anchorDate: '2026-04-29',
      selectedUserIds: ['tech-1', 'tech-2', 'tech-outside-account'],
      techFilterType: 'specific',
    });

    expect(board.day.jobs.map((job) => job.id)).toEqual(['job-assigned-canonical', 'job-assigned-tech-2']);
  });

  it('falls back to the safe default when office selected user ids are invalid', async () => {
    createClientMock.mockResolvedValue(makeFixture().supabase);

    const { getDispatchCalendarBoardData } = await import('@/lib/actions/calendar-actions');

    const board = await getDispatchCalendarBoardData({
      mode: 'day',
      anchorDate: '2026-04-29',
      selectedUserIds: ['tech-outside-account'],
      techFilterType: 'specific',
    });

    expect(board.day.jobs.map((job) => job.id)).toEqual([
      'job-assigned-canonical',
      'job-unassigned-fallback',
      'job-assigned-tech-2',
      'job-on-hold-scheduled',
      'job-failed-scheduled',
      'job-pending-info-scheduled',
      'job-closed-scheduled',
      'job-cancelled-scheduled',
    ]);
  });

  it('forces technicians to their own calendar even when the URL requests another user', async () => {
    createClientMock.mockResolvedValue(makeFixture().supabase);
    requireInternalUserMock.mockResolvedValue({
      userId: 'tech-1',
      internalUser: {
        user_id: 'tech-1',
        role: 'tech',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    const { getDispatchCalendarBoardData, getDispatchCalendarRosterData } = await import('@/lib/actions/calendar-actions');

    const board = await getDispatchCalendarBoardData({
      mode: 'day',
      anchorDate: '2026-04-29',
      selectedUserIds: ['tech-2'],
      techFilterType: 'specific',
    });
    const roster = await getDispatchCalendarRosterData({
      mode: 'day',
      anchorDate: '2026-04-29',
      selectedUserIds: ['tech-2'],
    });

    expect(board.day.jobs.map((job) => job.id)).toEqual(['job-assigned-canonical']);
    expect(roster.assignableUsers).toEqual([{ user_id: 'tech-1', display_name: 'My calendar', calendar_label: 'My calendar', email: null }]);
  });
});
