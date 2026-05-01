import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const getActiveJobAssignmentDisplayMapMock = vi.fn();
const getAssignableInternalUsersMock = vi.fn();

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

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

vi.mock("@/lib/staffing/human-layer", () => ({
  getActiveJobAssignmentDisplayMap: (...args: unknown[]) => getActiveJobAssignmentDisplayMapMock(...args),
  getAssignableInternalUsers: (...args: unknown[]) => getAssignableInternalUsersMock(...args),
}));

vi.mock("@/lib/utils/schedule-la", () => ({
  displayDateLA: (iso: string) => String(iso).slice(0, 10),
  displayTimeLA: (iso: string) => String(iso).slice(11, 16),
  laDateTimeToUtcIso: (date: string, time: string) => `${date}T${time}:00.000Z`,
}));

function makeCalendarFixture() {
  const calls: Array<{ table: string; op: string; value?: unknown }> = [];

  const customers = [
    { id: "cust-owner-1", owner_user_id: "owner-1" },
    { id: "cust-owner-2", owner_user_id: "owner-2" },
  ];

  const jobs: JobRow[] = [
    {
      id: "job-owner-1",
      customer_id: "cust-owner-1",
      location_id: "loc-1",
      title: "Scoped Job",
      job_type: "service",
      status: "open",
      ops_status: "need_to_schedule",
      parent_job_id: null,
      scheduled_date: "2026-04-24",
      window_start: "09:00",
      window_end: "11:00",
      city: "Los Angeles",
      customer_phone: null,
      job_address: "111 Scoped St",
      customer_first_name: "Alice",
      customer_last_name: "Scoped",
      contractor_id: null,
      contractors: null,
      customers: { phone: null },
      locations: { city: "Los Angeles" },
      created_at: "2026-04-24T08:00:00.000Z",
      deleted_at: null,
    },
    {
      id: "job-owner-2",
      customer_id: "cust-owner-2",
      location_id: "loc-2",
      title: "Cross Account Job",
      job_type: "service",
      status: "open",
      ops_status: "need_to_schedule",
      parent_job_id: null,
      scheduled_date: "2026-04-24",
      window_start: "12:00",
      window_end: "13:00",
      city: "Pasadena",
      customer_phone: null,
      job_address: "999 Cross Ave",
      customer_first_name: "Bob",
      customer_last_name: "Cross",
      contractor_id: null,
      contractors: null,
      customers: { phone: null },
      locations: { city: "Pasadena" },
      created_at: "2026-04-24T09:00:00.000Z",
      deleted_at: null,
    },
  ];

  const jobEvents: JobEventRow[] = [
    {
      job_id: "job-owner-1",
      event_type: "scoped_event",
      created_at: "2026-04-24T08:30:00.000Z",
    },
    {
      job_id: "job-owner-2",
      event_type: "cross_event",
      created_at: "2026-04-24T09:30:00.000Z",
    },
  ];

  function customersQuery() {
    let ownerFilter = "";

    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        if (column === "owner_user_id") {
          ownerFilter = String(value ?? "").trim();
        }
        return query;
      }),
      then: (onFulfilled: (value: { data: Array<{ id: string }>; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) => {
        const data = customers
          .filter((row) => row.owner_user_id === ownerFilter)
          .map((row) => ({ id: row.id }));
        calls.push({ table: "customers", op: "select", value: ownerFilter });
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
        if (column === "customer_id") {
          customerIds = Array.isArray(value) ? value.map((v) => String(v)) : [];
        }
        return query;
      }),
      is: vi.fn((column: string, value: unknown) => {
        if (column === "scheduled_date" && value === null) {
          onlyScheduledNull = true;
        }
        return query;
      }),
      not: vi.fn((column: string, op: string, value: unknown) => {
        if (column === "scheduled_date" && op === "is" && value === null) {
          requireScheduledDate = true;
        }
        return query;
      }),
      gte: vi.fn((column: string, value: unknown) => {
        if (column === "scheduled_date") scheduledDateStart = String(value ?? "").trim() || null;
        return query;
      }),
      lte: vi.fn((column: string, value: unknown) => {
        if (column === "scheduled_date") scheduledDateEnd = String(value ?? "").trim() || null;
        return query;
      }),
      order: vi.fn(() => query),
      then: (onFulfilled: (value: { data: JobRow[]; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) => {
        calls.push({ table: "jobs", op: "select", value: [...customerIds] });
        const data = jobs.filter((row) => {
          if (!customerIds.includes(row.customer_id)) return false;

          const scheduledDate = String(row.scheduled_date ?? "").trim();
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
        if (column === "job_id") {
          jobIds = Array.isArray(value) ? value.map((v) => String(v)) : [];
        }
        return query;
      }),
      order: vi.fn(() => query),
      then: (onFulfilled: (value: { data: JobEventRow[]; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) => {
        calls.push({ table: "job_events", op: "select", value: [...jobIds] });
        const data = jobEvents.filter((row) => jobIds.includes(row.job_id));
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
      },
    };

    return query;
  }

  const supabase = {
    from(table: string) {
      if (table === "customers") return customersQuery();
      if (table === "jobs") return jobsQuery();
      if (table === "job_events") return jobEventsQuery();
      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { supabase, calls };
}

describe("dispatch calendar same-account scope hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: "internal-1",
      internalUser: {
        user_id: "internal-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    getAssignableInternalUsersMock.mockResolvedValue([]);

    getActiveJobAssignmentDisplayMapMock.mockResolvedValue({
      "job-owner-1": [
        {
          user_id: "tech-1",
          display_name: "Scoped Tech",
          is_primary: true,
        },
      ],
      "job-owner-2": [
        {
          user_id: "tech-cross",
          display_name: "Cross Tech",
          is_primary: true,
        },
      ],
    });
  });

  it("allows same-account internal and excludes cross-account jobs/events/assignment expansion", async () => {
    const fixture = makeCalendarFixture();
    createClientMock.mockResolvedValue(fixture.supabase);

    const { getDispatchCalendarData } = await import("@/lib/actions/calendar-actions");

    const result = await getDispatchCalendarData({
      mode: "day",
      anchorDate: "2026-04-24",
    });

    expect(result.day.jobs.map((job) => job.id)).toEqual(["job-owner-1"]);
    expect(result.week.days.flatMap((day) => day.jobs).map((job) => job.id)).not.toContain("job-owner-2");
    expect(result.scheduledAttentionWindowJobs.map((job) => job.id)).toEqual(["job-owner-1"]);

    expect(result.day.jobs[0]?.latest_event_type).toBe("scoped_event");
    expect(result.day.jobs[0]?.assignment_names).toEqual(["Scoped Tech"]);

    expect(getActiveJobAssignmentDisplayMapMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jobIds: ["job-owner-1"],
      }),
    );

    const jobEventsCall = fixture.calls.find((call) => call.table === "job_events");
    expect(jobEventsCall?.value).toEqual(["job-owner-1"]);
  });

  it("denies non-internal before dispatch dataset assembly", async () => {
    const fixture = makeCalendarFixture();
    createClientMock.mockResolvedValue(fixture.supabase);
    requireInternalUserMock.mockRejectedValueOnce(new Error("Active internal user required."));

    const { getDispatchCalendarData } = await import("@/lib/actions/calendar-actions");

    await expect(
      getDispatchCalendarData({
        mode: "day",
        anchorDate: "2026-04-24",
      }),
    ).rejects.toThrow("Active internal user required.");

    expect(fixture.calls).toHaveLength(0);
    expect(getActiveJobAssignmentDisplayMapMock).not.toHaveBeenCalled();
  });
});
