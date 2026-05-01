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
      created_at: '2026-04-29T08:30:00.000Z',
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

  const supabase = {
    from(table: string) {
      if (table === 'customers') return customersQuery();
      if (table === 'jobs') return jobsQuery();
      if (table === 'job_events') return jobEventsQuery();
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

    getAssignableInternalUsersMock.mockResolvedValue([]);

    getActiveJobAssignmentDisplayMapMock.mockResolvedValue({
      'job-assigned-canonical': [
        {
          user_id: 'tech-1',
          display_name: 'Tech One',
          is_primary: true,
        },
      ],
      'job-unassigned-fallback': [],
    });
  });

  it('returns canonical phone/city with snapshot fallback and keeps scheduled unassigned jobs in day dataset', async () => {
    createClientMock.mockResolvedValue(makeFixture().supabase);

    const { getDispatchCalendarData } = await import('@/lib/actions/calendar-actions');
    const result = await getDispatchCalendarData({
      mode: 'day',
      anchorDate: '2026-04-29',
    });

    expect(result.day.jobs.map((job) => job.id)).toEqual(['job-assigned-canonical', 'job-unassigned-fallback']);

    const assigned = result.day.jobs.find((job) => job.id === 'job-assigned-canonical');
    const unassigned = result.day.jobs.find((job) => job.id === 'job-unassigned-fallback');

    expect(assigned?.title).toBe('Attic Duct Repair');
    expect(assigned?.city).toBe('Canonical City');
    expect(assigned?.customer_phone).toBe('555-1000');
    expect(assigned?.assignments.map((a) => a.user_id)).toEqual(['tech-1']);

    expect(unassigned?.title).toBe('Condenser Check');
    expect(unassigned?.city).toBe('Snapshot Fallback City');
    expect(unassigned?.customer_phone).toBe('555-2000');
    expect(unassigned?.assignments).toEqual([]);

    expect(result.scheduledAttentionWindowJobs.map((job) => job.id)).toEqual([
      'job-assigned-canonical',
      'job-unassigned-fallback',
    ]);
  });
});
