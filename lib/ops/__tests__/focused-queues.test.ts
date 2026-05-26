import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  buildExceptionQueueRows,
  buildWaitingQueueRows,
  buildWithoutTechQueueRows,
} from "@/lib/ops/focused-queues";

const waitingQueuePageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/queues/waiting/page.tsx"),
  "utf-8",
);

const exceptionsQueuePageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/queues/exceptions/page.tsx"),
  "utf-8",
);

const withoutTechQueuePageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/queues/without-tech/page.tsx"),
  "utf-8",
);

describe("focused ops queue filtering", () => {
  it("waiting queue includes pending info, on hold, waiting, and pending office review", () => {
    const rows = buildWaitingQueueRows([
      { id: "j1", ops_status: "pending_info", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "j2", ops_status: "on_hold", created_at: "2026-01-02T00:00:00.000Z" },
      { id: "j3", ops_status: "waiting", created_at: "2026-01-03T00:00:00.000Z" },
      { id: "j4", ops_status: "pending_office_review", created_at: "2026-01-04T00:00:00.000Z" },
      { id: "j5", ops_status: "failed", created_at: "2026-01-05T00:00:00.000Z" },
    ]);

    expect(rows.map((row) => row.id)).toEqual(["j1", "j2", "j3", "j4"]);
  });

  it("exceptions queue includes failed/retest/problem states", () => {
    const rows = buildExceptionQueueRows([
      { id: "j1", ops_status: "failed", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "j2", ops_status: "retest_needed", created_at: "2026-01-02T00:00:00.000Z" },
      { id: "j3", ops_status: "pending_office_review", created_at: "2026-01-03T00:00:00.000Z" },
      { id: "j4", ops_status: "problem", created_at: "2026-01-04T00:00:00.000Z" },
      { id: "j5", ops_status: "on_hold", created_at: "2026-01-05T00:00:00.000Z" },
    ]);

    expect(rows.map((row) => row.id)).toEqual(["j1", "j2", "j4"]);
  });

  it("without-tech queue includes only scheduled open jobs without active assignment", () => {
    const rows = buildWithoutTechQueueRows({
      jobs: [
        {
          id: "j1",
          account_owner_user_id: "owner-1",
          ops_status: "scheduled",
          status: "open",
          scheduled_date: "2026-05-25",
          window_start: "08:00:00",
        },
        {
          id: "j2",
          account_owner_user_id: "owner-1",
          ops_status: "scheduled",
          status: "open",
          scheduled_date: "2026-05-25",
          window_start: "09:00:00",
        },
        {
          id: "j3",
          account_owner_user_id: "owner-1",
          ops_status: "need_to_schedule",
          status: "open",
          scheduled_date: "2026-05-25",
          window_start: "10:00:00",
        },
      ],
      assignmentDisplayMap: {
        j2: [{ is_active: true, is_primary: true }],
      },
      accountOwnerUserId: "owner-1",
    });

    expect(rows.map((row) => row.id)).toEqual(["j1"]);
  });
});

describe("focused ops queue pages", () => {
  it("waiting page includes safe empty state and return navigation", () => {
    expect(waitingQueuePageSource).toContain("No waiting work right now.");
    expect(waitingQueuePageSource).toContain("Return to Operations");
    expect(waitingQueuePageSource).toContain('href="/ops"');
  });

  it("exceptions page includes safe empty state and return navigation", () => {
    expect(exceptionsQueuePageSource).toContain("No exceptions are waiting right now.");
    expect(exceptionsQueuePageSource).toContain("Return to Operations");
    expect(exceptionsQueuePageSource).toContain('href="/ops"');
  });

  it("without-tech page includes safe empty state and return navigation", () => {
    expect(withoutTechQueuePageSource).toContain("No coverage gaps right now.");
    expect(withoutTechQueuePageSource).toContain("Return to Operations");
    expect(withoutTechQueuePageSource).toContain('href="/ops"');
  });
});
