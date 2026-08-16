import { describe, expect, it } from "vitest";

import { buildWaitingExceptionQueueSnapshot } from "@/lib/ops/waiting-exception-loader";

describe("waiting and exception queue snapshot", () => {
  it("counts waiting states while excluding superseded retest parents", () => {
    const snapshot = buildWaitingExceptionQueueSnapshot({
      pendingInfoRows: [
        { id: "pending", ops_status: "pending_info" },
        { id: "continued", ops_status: "pending_info", service_follow_up_continued: true },
      ],
      onHoldCount: 2,
      waitingCount: 3,
      exceptionRows: [
        { id: "failed-parent", ops_status: "failed" },
        { id: "active-failed", ops_status: "failed" },
        { id: "review", ops_status: "pending_office_review" },
        { id: "problem", ops_status: "problem" },
      ],
      retestContinuationRows: [{ parent_job_id: "failed-parent" }],
    });

    expect(Object.fromEntries(snapshot.statusCounts)).toEqual({
      pending_info: 1,
      on_hold: 2,
      waiting: 3,
      pending_office_review: 1,
      failed: 1,
      retest_needed: 0,
      problem: 1,
    });
    expect(snapshot.retestContinuationParentIds).toEqual(new Set(["failed-parent"]));
  });

  it("normalizes absent count results to zero", () => {
    const snapshot = buildWaitingExceptionQueueSnapshot({
      pendingInfoRows: [],
      onHoldCount: null,
      waitingCount: null,
      exceptionRows: [],
      retestContinuationRows: [],
    });

    expect([...snapshot.statusCounts.values()].every((count) => count === 0)).toBe(true);
  });
});
