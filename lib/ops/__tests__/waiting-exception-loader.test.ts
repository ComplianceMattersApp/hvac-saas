import { describe, expect, it } from "vitest";

import { buildWaitingExceptionQueueSnapshot } from "@/lib/ops/waiting-exception-loader";

describe("waiting and exception queue snapshot", () => {
  it("counts waiting states while excluding superseded retest parents", () => {
    const snapshot = buildWaitingExceptionQueueSnapshot({
      pendingInfoRows: [
        {
          id: "pending",
          ops_status: "pending_info",
          pending_info_reason: "Materials Needed: blower motor",
        },
        {
          id: "continued",
          ops_status: "pending_info",
          pending_info_reason: "Materials Needed: control board",
        },
      ],
      serviceFollowUpEvents: [
        {
          job_id: "pending",
          created_at: "2026-08-15T10:00:00.000Z",
          meta: { service_follow_up_progress: "part_ordered" },
        },
        {
          job_id: "continued",
          created_at: "2026-08-15T11:00:00.000Z",
          meta: {
            follow_up_bridge_action: "add_to_scheduling_queue",
            continued_through_child_job_id: "return-job",
          },
        },
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
    expect(Object.fromEntries(snapshot.serviceFollowUpByJob)).toEqual({
      pending: { progressLabel: "Part Ordered", continued: false },
      continued: { progressLabel: null, continued: true },
    });
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
    expect(snapshot.serviceFollowUpByJob.size).toBe(0);
  });
});
