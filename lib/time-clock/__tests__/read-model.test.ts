import { describe, expect, it, vi } from "vitest";

import {
  getCurrentInternalUserClockState,
  listRecentTimeEntriesForAccount,
  listTeamClockStatusPreview,
  listTodayTimeEntriesForAccount,
  listNeedsReviewTimeEntriesForAccount,
  INTERNAL_USER_TIME_ENTRY_ACTIVE_STATUSES,
} from "@/lib/time-clock/read-model";

type TimeEntryFixture = {
  id: string;
  account_owner_user_id: string;
  internal_user_id: string;
  status: string;
  clock_in_at: string;
  lunch_start_at: string | null;
  lunch_end_at: string | null;
  clock_out_at: string | null;
  adjusted_by_user_id: string | null;
  adjusted_at: string | null;
  adjustment_reason: string | null;
  created_at: string;
  updated_at: string;
};

function makeTimeEntry(input: Partial<TimeEntryFixture> & { id: string }): TimeEntryFixture {
  const { id, ...rest } = input;

  return {
    id,
    account_owner_user_id: "owner-1",
    internal_user_id: "tech-1",
    status: "open",
    clock_in_at: "2026-05-24T08:00:00Z",
    lunch_start_at: null,
    lunch_end_at: null,
    clock_out_at: null,
    adjusted_by_user_id: null,
    adjusted_at: null,
    adjustment_reason: null,
    created_at: "2026-05-24T08:00:00Z",
    updated_at: "2026-05-24T08:00:00Z",
    ...rest,
  };
}

function makeSupabase(fixtures?: { timeEntries?: TimeEntryFixture[] }) {
  const timeEntries = fixtures?.timeEntries ?? [];
  const calls: Array<{ table: string; op: string; column?: string; value?: unknown }> = [];

  const supabase = {
    from(table: string) {
      calls.push({ table, op: "from" });

      const eqFilters: Array<[string, unknown]> = [];
      const inFilters: Array<[string, unknown[]]> = [];
      const gteFilters: Array<[string, unknown]> = [];
      const ltFilters: Array<[string, unknown]> = [];
      const orderFilters: Array<[string, boolean]> = [];
      let cappedLimit: number | null = null;

      const getRows = () => {
        let data: any[] = table === "internal_user_time_entries" ? [...timeEntries] : [];

        for (const [column, value] of eqFilters) {
          data = data.filter((row) => row?.[column] === value);
        }

        for (const [column, values] of inFilters) {
          data = data.filter((row) => values.includes(row?.[column]));
        }

        for (const [column, value] of gteFilters) {
          data = data.filter((row) => String(row?.[column] ?? "") >= String(value ?? ""));
        }

        for (const [column, value] of ltFilters) {
          data = data.filter((row) => String(row?.[column] ?? "") < String(value ?? ""));
        }

        for (const [column, ascending] of orderFilters) {
          data.sort((left, right) => {
            const comparison = String(left?.[column] ?? "").localeCompare(String(right?.[column] ?? ""));
            return ascending ? comparison : comparison * -1;
          });
        }

        if (cappedLimit != null) {
          data = data.slice(0, cappedLimit);
        }

        return data;
      };

      const query: any = {
        select: vi.fn(() => {
          calls.push({ table, op: "select" });
          return query;
        }),
        eq: vi.fn((column: string, value: unknown) => {
          calls.push({ table, op: "eq", column, value });
          eqFilters.push([column, value]);
          return query;
        }),
        in: vi.fn((column: string, values: unknown[]) => {
          calls.push({ table, op: "in", column, value: values });
          inFilters.push([column, values]);
          return query;
        }),
        gte: vi.fn((column: string, value: unknown) => {
          calls.push({ table, op: "gte", column, value });
          gteFilters.push([column, value]);
          return query;
        }),
        lt: vi.fn((column: string, value: unknown) => {
          calls.push({ table, op: "lt", column, value });
          ltFilters.push([column, value]);
          return query;
        }),
        order: vi.fn((column: string, options?: { ascending?: boolean }) => {
          calls.push({ table, op: "order", column, value: options?.ascending ?? true });
          orderFilters.push([column, options?.ascending ?? true]);
          return query;
        }),
        limit: vi.fn((value: number) => {
          calls.push({ table, op: "limit", value });
          cappedLimit = value;
          return query;
        }),
        maybeSingle: vi.fn(async () => {
          const rows = getRows();
          return { data: rows[0] ?? null, error: null };
        }),
        then: (onFulfilled: (value: { data: any[]; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) =>
          Promise.resolve({ data: getRows(), error: null }).then(onFulfilled, onRejected),
      };

      return query;
    },
  };

  return { supabase, calls };
}

describe("time clock read helpers", () => {
  it("returns safe empty current state when scope is missing", async () => {
    const { supabase, calls } = makeSupabase();

    const result = await getCurrentInternalUserClockState({
      supabase: supabase as any,
      accountOwnerUserId: "",
      internalUserId: "tech-1",
    });

    expect(result.displayState).toBe("clocked_out");
    expect(result.activeEntry).toBeNull();
    expect(calls.some((call) => call.op === "from")).toBe(false);
  });

  it("derives clocked_out when no active entry exists", async () => {
    const { supabase } = makeSupabase({
      timeEntries: [
        makeTimeEntry({
          id: "closed-1",
          status: "closed",
          clock_out_at: "2026-05-24T15:00:00Z",
        }),
      ],
    });

    const result = await getCurrentInternalUserClockState({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      internalUserId: "tech-1",
    });

    expect(result.displayState).toBe("clocked_out");
    expect(result.activeEntry).toBeNull();
  });

  it("maps open status to clocked_in", async () => {
    const { supabase } = makeSupabase({
      timeEntries: [makeTimeEntry({ id: "open-1", status: "open" })],
    });

    const result = await getCurrentInternalUserClockState({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      internalUserId: "tech-1",
    });

    expect(result.displayState).toBe("clocked_in");
    expect(result.activeEntry?.status).toBe("open");
  });

  it("maps on_lunch status to on_lunch", async () => {
    const { supabase } = makeSupabase({
      timeEntries: [
        makeTimeEntry({
          id: "lunch-1",
          status: "on_lunch",
          lunch_start_at: "2026-05-24T12:00:00Z",
        }),
      ],
    });

    const result = await getCurrentInternalUserClockState({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      internalUserId: "tech-1",
    });

    expect(result.displayState).toBe("on_lunch");
    expect(result.activeEntry?.status).toBe("on_lunch");
  });

  it("enforces account scope in helper queries", async () => {
    const { supabase } = makeSupabase({
      timeEntries: [
        makeTimeEntry({ id: "foreign-1", account_owner_user_id: "owner-2", status: "open" }),
        makeTimeEntry({ id: "owned-1", account_owner_user_id: "owner-1", status: "open" }),
      ],
    });

    const result = await getCurrentInternalUserClockState({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      internalUserId: "tech-1",
    });

    expect(result.activeEntry?.id).toBe("owned-1");
    expect(result.activeEntry?.account_owner_user_id).toBe("owner-1");
  });

  it("returns preview rows only for active statuses in account scope", async () => {
    const { supabase } = makeSupabase({
      timeEntries: [
        makeTimeEntry({ id: "open-1", status: "open" }),
        makeTimeEntry({ id: "lunch-1", status: "on_lunch", lunch_start_at: "2026-05-24T12:00:00Z" }),
        makeTimeEntry({ id: "closed-1", status: "closed", clock_out_at: "2026-05-24T16:00:00Z" }),
        makeTimeEntry({ id: "foreign-1", account_owner_user_id: "owner-2", status: "open" }),
      ],
    });

    const result = await listTeamClockStatusPreview({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.map((row) => row.entryId)).toEqual(["open-1", "lunch-1"]);
    expect(result.every((row) => row.accountOwnerUserId === "owner-1")).toBe(true);
    expect(result.every((row) => INTERNAL_USER_TIME_ENTRY_ACTIVE_STATUSES.includes(row.status))).toBe(true);
  });

  it("returns safe empty preview when account scope is missing", async () => {
    const { supabase, calls } = makeSupabase();

    const result = await listTeamClockStatusPreview({
      supabase: supabase as any,
      accountOwnerUserId: "",
    });

    expect(result).toEqual([]);
    expect(calls.some((call) => call.op === "from")).toBe(false);
  });

  it("returns today entries only for LA day boundaries", async () => {
    const now = new Date("2026-05-24T20:00:00Z");
    const { supabase } = makeSupabase({
      timeEntries: [
        makeTimeEntry({ id: "today-1", clock_in_at: "2026-05-24T16:00:00Z", status: "closed", clock_out_at: "2026-05-24T18:00:00Z" }),
        makeTimeEntry({ id: "prior-1", clock_in_at: "2026-05-23T23:59:00Z", status: "open" }),
        makeTimeEntry({ id: "next-1", clock_in_at: "2026-05-25T08:00:00Z", status: "open" }),
      ],
    });

    const result = await listTodayTimeEntriesForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      now,
    });

    expect(result.map((row) => row.entryId)).toEqual(["today-1"]);
  });

  it("returns recent entries inside the rolling 7-day window newest first", async () => {
    const now = new Date("2026-05-24T20:00:00Z");
    const { supabase } = makeSupabase({
      timeEntries: [
        makeTimeEntry({ id: "today-1", clock_in_at: "2026-05-24T16:00:00Z", status: "closed" }),
        makeTimeEntry({ id: "day-2", clock_in_at: "2026-05-23T16:00:00Z", status: "open" }),
        makeTimeEntry({ id: "day-7", clock_in_at: "2026-05-18T16:00:00Z", status: "voided" }),
      ],
    });

    const result = await listRecentTimeEntriesForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      now,
      days: 7,
    });

    expect(result.map((row) => row.entryId)).toEqual(["today-1", "day-2", "day-7"]);
  });

  it("excludes entries older than the rolling 7-day window", async () => {
    const now = new Date("2026-05-24T20:00:00Z");
    const { supabase } = makeSupabase({
      timeEntries: [
        makeTimeEntry({ id: "inside-window", clock_in_at: "2026-05-18T16:00:00Z", status: "closed" }),
        makeTimeEntry({ id: "older-than-7", clock_in_at: "2026-05-17T06:59:00Z", status: "closed" }),
      ],
    });

    const result = await listRecentTimeEntriesForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      now,
      days: 7,
    });

    expect(result.map((row) => row.entryId)).toEqual(["inside-window"]);
  });

  it("returns safe empty recent review when account scope is missing", async () => {
    const { supabase, calls } = makeSupabase();

    const result = await listRecentTimeEntriesForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "",
      now: new Date("2026-05-24T20:00:00Z"),
    });

    expect(result).toEqual([]);
    expect(calls.some((call) => call.op === "from")).toBe(false);
  });

  it("keeps recent review account scoped", async () => {
    const now = new Date("2026-05-24T20:00:00Z");
    const { supabase } = makeSupabase({
      timeEntries: [
        makeTimeEntry({ id: "owned-1", account_owner_user_id: "owner-1", clock_in_at: "2026-05-24T16:00:00Z" }),
        makeTimeEntry({ id: "foreign-1", account_owner_user_id: "owner-2", clock_in_at: "2026-05-24T17:00:00Z" }),
      ],
    });

    const result = await listRecentTimeEntriesForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      now,
      days: 7,
    });

    expect(result.map((row) => row.entryId)).toEqual(["owned-1"]);
    expect(result.every((row) => row.accountOwnerUserId === "owner-1")).toBe(true);
  });

  it("returns needs-review rows for prior-day active and incomplete entries", async () => {
    const now = new Date("2026-05-24T20:00:00Z");
    const { supabase } = makeSupabase({
      timeEntries: [
        makeTimeEntry({ id: "prior-open", status: "open", clock_in_at: "2026-05-23T18:00:00Z" }),
        makeTimeEntry({ id: "marked-review", status: "needs_review", clock_in_at: "2026-05-24T14:00:00Z" }),
        makeTimeEntry({ id: "missing-out", status: "closed", clock_in_at: "2026-05-24T10:00:00Z", clock_out_at: null }),
        makeTimeEntry({ id: "clean-closed", status: "closed", clock_in_at: "2026-05-24T10:00:00Z", clock_out_at: "2026-05-24T14:00:00Z" }),
      ],
    });

    const result = await listNeedsReviewTimeEntriesForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      now,
    });

    expect(result.map((row) => row.entryId)).toEqual(["marked-review", "missing-out", "prior-open"]);
  });
});
