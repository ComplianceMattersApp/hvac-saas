import { describe, expect, it } from "vitest";

import {
  OPS_BOARD_SORT_OPTIONS,
  normalizeOpsBoardSort,
  sortOpsBoardRows,
} from "@/lib/ops/ops-board-sorting";

describe("Operations Board sorting", () => {
  it("exposes the supported sort options and defaults to oldest first", () => {
    expect(OPS_BOARD_SORT_OPTIONS.map((option) => option.label)).toEqual([
      "Oldest first",
      "Newest first",
      "Scheduled soonest",
      "Contractor A-Z",
      "Customer A-Z",
    ]);

    expect(normalizeOpsBoardSort(null)).toBe("oldest");
    expect(normalizeOpsBoardSort("created")).toBe("oldest");
    expect(normalizeOpsBoardSort("recently_updated")).toBe("oldest");
  });

  it("sorts oldest unresolved work first by created date", () => {
    const rows = [
      { id: "newer", created_at: "2026-06-03T00:00:00.000Z" },
      { id: "oldest", created_at: "2026-06-01T00:00:00.000Z" },
      { id: "middle", created_at: "2026-06-02T00:00:00.000Z" },
    ];

    expect(sortOpsBoardRows(rows, "oldest").map((row) => row.id)).toEqual(["oldest", "middle", "newer"]);
  });

  it("sorts newest work first by created date", () => {
    const rows = [
      { id: "oldest", created_at: "2026-06-01T00:00:00.000Z" },
      { id: "newest", created_at: "2026-06-03T00:00:00.000Z" },
      { id: "middle", created_at: "2026-06-02T00:00:00.000Z" },
    ];

    expect(sortOpsBoardRows(rows, "newest").map((row) => row.id)).toEqual(["newest", "middle", "oldest"]);
  });

  it("sorts scheduled rows soonest first and leaves unscheduled rows last", () => {
    const rows = [
      { id: "unscheduled", created_at: "2026-06-01T00:00:00.000Z", scheduled_date: null, window_start: null },
      { id: "later", created_at: "2026-06-02T00:00:00.000Z", scheduled_date: "2026-06-18", window_start: "08:00:00" },
      { id: "earlier-window", created_at: "2026-06-03T00:00:00.000Z", scheduled_date: "2026-06-17", window_start: "09:00:00" },
      { id: "first-window", created_at: "2026-06-04T00:00:00.000Z", scheduled_date: "2026-06-17", window_start: "07:00:00" },
    ];

    expect(sortOpsBoardRows(rows, "scheduled_soonest").map((row) => row.id)).toEqual([
      "first-window",
      "earlier-window",
      "later",
      "unscheduled",
    ]);
  });

  it("sorts contractor names A-Z and places missing contractor names last", () => {
    const rows = [
      { id: "zeta", created_at: "2026-06-01T00:00:00.000Z", contractors: { name: "Zeta HVAC" } },
      { id: "missing", created_at: "2026-06-02T00:00:00.000Z", contractors: null },
      { id: "alpha", created_at: "2026-06-03T00:00:00.000Z", contractors: { name: "Alpha Air" } },
    ];

    expect(sortOpsBoardRows(rows, "contractor_az").map((row) => row.id)).toEqual(["alpha", "zeta", "missing"]);
  });

  it("sorts customer names A-Z and places missing customer names last", () => {
    const rows = [
      { id: "zendaya", created_at: "2026-06-01T00:00:00.000Z", customer_first_name: "Zendaya", customer_last_name: "Jones" },
      { id: "missing", created_at: "2026-06-02T00:00:00.000Z", customer_first_name: "", customer_last_name: "" },
      { id: "alex", created_at: "2026-06-03T00:00:00.000Z", customer_first_name: "Alex", customer_last_name: "Kim" },
    ];

    expect(sortOpsBoardRows(rows, "customer_az").map((row) => row.id)).toEqual(["alex", "zendaya", "missing"]);
  });
});
