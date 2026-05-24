import { describe, expect, it } from "vitest";

import {
  assertTimeClockWriteEnabled,
  runClockIn,
  runClockOut,
  runEndLunch,
  runStartLunch,
} from "@/lib/time-clock/mutations";

type TimeEntryFixture = {
  id: string;
  account_owner_user_id: string;
  internal_user_id: string;
  status: string;
  clock_in_at: string;
  lunch_start_at: string | null;
  lunch_end_at: string | null;
  clock_out_at: string | null;
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
    ...rest,
  };
}

function makeSupabase(fixtures?: { timeEntries?: TimeEntryFixture[] }) {
  const timeEntries = fixtures?.timeEntries ? [...fixtures.timeEntries] : [];

  const supabase = {
    from(table: string) {
      if (table !== "internal_user_time_entries") {
        throw new Error(`UNSUPPORTED_TABLE_${table}`);
      }

      const filters: Array<{ op: "eq" | "in"; column: string; value: unknown }> = [];
      let orderBy: { column: string; ascending: boolean } | null = null;
      let limitCount: number | null = null;

      function applyFilters(rows: TimeEntryFixture[]) {
        let data = [...rows];

        for (const filter of filters) {
          if (filter.op === "eq") {
            data = data.filter((row: any) => row?.[filter.column] === filter.value);
            continue;
          }

          const values = Array.isArray(filter.value) ? filter.value : [];
          data = data.filter((row: any) => values.includes(row?.[filter.column]));
        }

        if (orderBy) {
          const sortedBy = orderBy;
          data.sort((left: any, right: any) => {
            const comparison = String(left?.[sortedBy.column] ?? "").localeCompare(String(right?.[sortedBy.column] ?? ""));
            return sortedBy.ascending ? comparison : comparison * -1;
          });
        }

        if (limitCount != null) {
          data = data.slice(0, limitCount);
        }

        return data;
      }

      const query: any = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.push({ op: "eq", column, value });
          return query;
        },
        in: (column: string, value: unknown[]) => {
          filters.push({ op: "in", column, value });
          return query;
        },
        order: (column: string, options?: { ascending?: boolean }) => {
          orderBy = { column, ascending: options?.ascending ?? true };
          return query;
        },
        limit: (value: number) => {
          limitCount = value;
          return query;
        },
        maybeSingle: async () => {
          const rows = applyFilters(timeEntries);
          return { data: rows[0] ?? null, error: null };
        },
        insert: async (row: any) => {
          const duplicateActive = timeEntries.some(
            (entry) =>
              entry.internal_user_id === row.internal_user_id &&
              ["open", "on_lunch"].includes(entry.status),
          );

          if (duplicateActive) {
            return { data: null, error: { code: "23505", message: "duplicate active" } };
          }

          timeEntries.push(
            makeTimeEntry({
              id: `entry-${timeEntries.length + 1}`,
              ...row,
              lunch_start_at: null,
              lunch_end_at: null,
              clock_out_at: null,
            }),
          );

          return { data: null, error: null };
        },
        update: (payload: any) => {
          const updateFilters: Array<{ op: "eq" | "in"; column: string; value: unknown }> = [];

          const updateQuery: any = {
            eq: (column: string, value: unknown) => {
              updateFilters.push({ op: "eq", column, value });
              return updateQuery;
            },
            in: (column: string, value: unknown[]) => {
              updateFilters.push({ op: "in", column, value });
              return updateQuery;
            },
            then: (onFulfilled: (value: { data: null; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) => {
              for (const filter of updateFilters) {
                filters.push(filter);
              }

              const matchingRows = applyFilters(timeEntries);
              for (const row of matchingRows) {
                Object.assign(row, payload);
              }

              return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
            },
          };

          return updateQuery;
        },
      };

      return query;
    },
  };

  return { supabase, timeEntries };
}

describe("time clock mutations", () => {
  it("blocks when account setting is disabled", () => {
    expect(() =>
      assertTimeClockWriteEnabled({
        accountTimeClockEnabled: false,
        userTimeTrackingEnabled: true,
      }),
    ).toThrow("TIME_CLOCK_ACCOUNT_DISABLED");
  });

  it("blocks when user tracking is disabled", () => {
    expect(() =>
      assertTimeClockWriteEnabled({
        accountTimeClockEnabled: true,
        userTimeTrackingEnabled: false,
      }),
    ).toThrow("TIME_CLOCK_USER_DISABLED");
  });

  it("clock in creates an open entry", async () => {
    const { supabase, timeEntries } = makeSupabase({ timeEntries: [] });

    await runClockIn({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      internalUserId: "tech-1",
      nowIso: "2026-05-24T09:00:00Z",
    });

    expect(timeEntries).toHaveLength(1);
    expect(timeEntries[0]?.status).toBe("open");
    expect(timeEntries[0]?.clock_in_at).toBe("2026-05-24T09:00:00Z");
  });

  it("prevents duplicate clock-in", async () => {
    const { supabase } = makeSupabase({
      timeEntries: [makeTimeEntry({ id: "open-1", status: "open" })],
    });

    await expect(
      runClockIn({
        supabase: supabase as any,
        accountOwnerUserId: "owner-1",
        internalUserId: "tech-1",
      }),
    ).rejects.toThrow("TIME_CLOCK_ACTIVE_ENTRY_EXISTS");
  });

  it("start lunch transitions open to on_lunch", async () => {
    const { supabase, timeEntries } = makeSupabase({
      timeEntries: [makeTimeEntry({ id: "open-1", status: "open" })],
    });

    await runStartLunch({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      internalUserId: "tech-1",
      nowIso: "2026-05-24T12:00:00Z",
    });

    expect(timeEntries[0]?.status).toBe("on_lunch");
    expect(timeEntries[0]?.lunch_start_at).toBe("2026-05-24T12:00:00Z");
  });

  it("end lunch transitions on_lunch to open", async () => {
    const { supabase, timeEntries } = makeSupabase({
      timeEntries: [
        makeTimeEntry({
          id: "lunch-1",
          status: "on_lunch",
          lunch_start_at: "2026-05-24T12:00:00Z",
        }),
      ],
    });

    await runEndLunch({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      internalUserId: "tech-1",
      nowIso: "2026-05-24T12:30:00Z",
    });

    expect(timeEntries[0]?.status).toBe("open");
    expect(timeEntries[0]?.lunch_end_at).toBe("2026-05-24T12:30:00Z");
  });

  it("clock out closes open and on_lunch entries", async () => {
    const { supabase, timeEntries } = makeSupabase({
      timeEntries: [
        makeTimeEntry({
          id: "lunch-1",
          status: "on_lunch",
          lunch_start_at: "2026-05-24T12:00:00Z",
          lunch_end_at: null,
        }),
      ],
    });

    await runClockOut({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      internalUserId: "tech-1",
      nowIso: "2026-05-24T16:00:00Z",
    });

    expect(timeEntries[0]?.status).toBe("closed");
    expect(timeEntries[0]?.clock_out_at).toBe("2026-05-24T16:00:00Z");
    expect(timeEntries[0]?.lunch_end_at).toBe("2026-05-24T16:00:00Z");
  });

  it("does not mutate out-of-account rows", async () => {
    const { supabase } = makeSupabase({
      timeEntries: [
        makeTimeEntry({ id: "foreign-1", account_owner_user_id: "owner-2", status: "open" }),
      ],
    });

    await expect(
      runStartLunch({
        supabase: supabase as any,
        accountOwnerUserId: "owner-1",
        internalUserId: "tech-1",
      }),
    ).rejects.toThrow("TIME_CLOCK_OPEN_ENTRY_REQUIRED");
  });
});
