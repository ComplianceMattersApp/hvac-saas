import { describe, expect, it, vi } from "vitest";

import {
  buildTimeClockReportCsv,
  buildTimeClockReportSearchParams,
  listTimeClockReportEntriesForAccount,
  parseTimeClockReportFilters,
} from "@/lib/reports/time-clock-report";

vi.mock("@/lib/staffing/human-layer", () => ({
  resolveUserDisplayMap: vi.fn(async ({ userIds }: { userIds: string[] }) =>
    Object.fromEntries(userIds.map((userId) => [userId, `Display ${userId}`])),
  ),
}));

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
};

function makeTimeEntry(input: Partial<TimeEntryFixture> & { id: string }): TimeEntryFixture {
  const { id, ...rest } = input;
  return {
    id,
    account_owner_user_id: "owner-1",
    internal_user_id: "user-1",
    status: "closed",
    clock_in_at: "2026-05-20T16:00:00Z",
    lunch_start_at: null,
    lunch_end_at: null,
    clock_out_at: "2026-05-20T20:00:00Z",
    adjusted_by_user_id: null,
    adjusted_at: null,
    adjustment_reason: null,
    ...rest,
  };
}

function makeSupabase(fixtures?: { timeEntries?: TimeEntryFixture[] }) {
  const timeEntries = fixtures?.timeEntries ?? [];
  const calls: Array<{ op: string; column?: string; value?: unknown }> = [];

  return {
    supabase: {
      from(table: string) {
        if (table !== "internal_user_time_entries") throw new Error(`Unexpected table: ${table}`);
        const eqFilters: Array<[string, unknown]> = [];
        const gteFilters: Array<[string, unknown]> = [];
        const ltFilters: Array<[string, unknown]> = [];
        const orderFilters: Array<[string, boolean]> = [];
        let cappedLimit: number | null = null;

        const getRows = () => {
          let data = [...timeEntries];
          for (const [column, value] of eqFilters) data = data.filter((row) => (row as any)[column] === value);
          for (const [column, value] of gteFilters) data = data.filter((row) => String((row as any)[column] ?? "") >= String(value ?? ""));
          for (const [column, value] of ltFilters) data = data.filter((row) => String((row as any)[column] ?? "") < String(value ?? ""));
          for (const [column, asc] of orderFilters) {
            data.sort((a, b) => {
              const cmp = String((a as any)[column] ?? "").localeCompare(String((b as any)[column] ?? ""));
              return asc ? cmp : -cmp;
            });
          }
          if (cappedLimit != null) data = data.slice(0, cappedLimit);
          return data;
        };

        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn((column: string, value: unknown) => {
            calls.push({ op: "eq", column, value });
            eqFilters.push([column, value]);
            return query;
          }),
          gte: vi.fn((column: string, value: unknown) => {
            calls.push({ op: "gte", column, value });
            gteFilters.push([column, value]);
            return query;
          }),
          lt: vi.fn((column: string, value: unknown) => {
            calls.push({ op: "lt", column, value });
            ltFilters.push([column, value]);
            return query;
          }),
          order: vi.fn((column: string, options?: { ascending?: boolean }) => {
            orderFilters.push([column, options?.ascending ?? true]);
            return query;
          }),
          limit: vi.fn((value: number) => {
            cappedLimit = value;
            return query;
          }),
          then: (onFulfilled: (value: { data: any[]; error: null; count: number }) => unknown, onRejected?: (reason: unknown) => unknown) =>
            Promise.resolve({ data: getRows(), error: null, count: getRows().length }).then(onFulfilled, onRejected),
        };

        return query;
      },
    },
    calls,
  };
}

describe("time clock report helper", () => {
  it("returns safe empty when account scope is missing", async () => {
    const { supabase } = makeSupabase();
    const result = await listTimeClockReportEntriesForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "",
      filters: { fromDate: "", toDate: "", internalUserId: "", status: "" },
    });
    expect(result).toEqual({ rows: [], totalCount: 0, truncated: false });
  });

  it("filters by date range, employee, and status in account scope newest first", async () => {
    const { supabase } = makeSupabase({
      timeEntries: [
        makeTimeEntry({ id: "older", clock_in_at: "2026-05-19T16:00:00Z", internal_user_id: "user-1", status: "closed" }),
        makeTimeEntry({ id: "kept-newest", clock_in_at: "2026-05-21T18:00:00Z", internal_user_id: "user-2", status: "open" }),
        makeTimeEntry({ id: "kept-older", clock_in_at: "2026-05-20T18:00:00Z", internal_user_id: "user-2", status: "open", adjusted_by_user_id: "admin-1", adjusted_at: "2026-05-20T20:00:00Z", adjustment_reason: "Correction" }),
        makeTimeEntry({ id: "foreign", account_owner_user_id: "owner-2", clock_in_at: "2026-05-21T19:00:00Z", internal_user_id: "user-2", status: "open" }),
      ],
    });

    const result = await listTimeClockReportEntriesForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      filters: { fromDate: "2026-05-20", toDate: "2026-05-21", internalUserId: "user-2", status: "open" },
    });

    expect(result.rows.map((row) => row.entryId)).toEqual(["kept-newest", "kept-older"]);
    expect(result.rows[1]?.adjusted).toBe(true);
    expect(result.rows.every((row) => row.employeeDisplay === "Display user-2")).toBe(true);
  });

  it("builds stable search params and csv output", () => {
    const params = buildTimeClockReportSearchParams({ fromDate: "2026-05-20", toDate: "2026-05-21", internalUserId: "user-2", status: "open" });
    expect(params.toString()).toBe("from=2026-05-20&to=2026-05-21&internal_user_id=user-2&status=open");

    const csv = buildTimeClockReportCsv([
      {
        entryId: "entry-1",
        employeeDisplay: "Display user-2",
        statusLabel: "Open",
        clockInDisplay: "05-21-2026 11:00",
        lunchStartDisplay: "-",
        lunchEndDisplay: "-",
        clockOutDisplay: "-",
        durationDisplay: "-",
        adjusted: true,
        adjustmentReason: "Manual correction",
        adjustedByDisplay: "Display admin-1",
        adjustedAtDisplay: "05-21-2026 13:00",
      },
    ]);

    const [header, row] = csv.split("\r\n");
    expect(header).toContain("employee,status,clock_in");
    expect(row).toContain("Display user-2");
    expect(row).toContain("Manual correction");
  });

  it("buildTimeClockReportCsv keeps history-only headers and returns header-only csv for empty results", () => {
    const sampleCsv = buildTimeClockReportCsv([
      {
        entryId: "entry-1",
        employeeDisplay: "Display user-7",
        statusLabel: "Closed",
        clockInDisplay: "05-21-2026 08:00",
        lunchStartDisplay: "05-21-2026 12:00",
        lunchEndDisplay: "05-21-2026 12:30",
        clockOutDisplay: "05-21-2026 16:30",
        durationDisplay: "8h 0m",
        adjusted: false,
        adjustmentReason: "",
        adjustedByDisplay: "-",
        adjustedAtDisplay: "-",
      },
    ]);

    const [headerLine, rowLine] = sampleCsv.split("\r\n");
    expect(headerLine).toBe(
      "employee,status,clock_in,lunch_start,lunch_end,clock_out,duration,adjusted,adjustment_reason,adjusted_by,adjusted_at",
    );
    expect(rowLine).toContain("Display user-7");
    expect(rowLine).toContain("Closed");
    expect(rowLine).not.toContain("payroll");
    expect(rowLine).not.toContain("wage");
    expect(rowLine).not.toContain("overtime");
    expect(headerLine).not.toContain("payroll");
    expect(headerLine).not.toContain("wage");
    expect(headerLine).not.toContain("overtime");

    const emptyCsv = buildTimeClockReportCsv([]);
    expect(emptyCsv).toBe(headerLine);
    expect(emptyCsv.split("\r\n")).toHaveLength(1);
  });

  it("parses only valid report filters", () => {
    expect(parseTimeClockReportFilters({ from: "2026-05-20", to: "2026-05-21", internal_user_id: " user-1 ", status: "OPEN" })).toEqual({
      fromDate: "2026-05-20",
      toDate: "2026-05-21",
      internalUserId: "user-1",
      status: "open",
    });
  });
});