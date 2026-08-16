import { describe, expect, it } from "vitest";

import {
  buildFocusedOpsQueueRows,
  buildWaitingExceptionQueueSnapshot,
} from "@/lib/ops/waiting-exception-loader";
import { buildServiceFollowUpQueueStateByJob } from "@/lib/ops/service-follow-up-queue-state";

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
    expect(snapshot.serviceFollowUpByJob.get("pending")?.progressLabel).toBe("Part Ordered");
    expect(
      snapshot.serviceFollowUpByJob.get("continued")?.continuedThroughChildJobId,
    ).toBe("return-job");
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

  it("builds standalone and workspace rows through the same queue pipeline", () => {
    const rows = [
      {
        id: "continued-wait",
        ops_status: "pending_info",
        pending_info_reason: "Materials Needed: blower motor",
        created_at: "2026-08-13T10:00:00.000Z",
      },
      {
        id: "active-wait",
        ops_status: "on_hold",
        on_hold_reason: "Customer requested a pause",
        created_at: "2026-08-15T10:00:00.000Z",
      },
      {
        id: "wrong-queue",
        ops_status: "failed",
        created_at: "2026-08-14T10:00:00.000Z",
      },
    ];

    const serviceFollowUpByJob = buildServiceFollowUpQueueStateByJob(rows, [
      {
        job_id: "continued-wait",
        created_at: "2026-08-16T10:00:00.000Z",
        meta: {
          follow_up_bridge_action: "add_to_scheduling_queue",
          continued_through_child_job_id: "return-job",
        },
      },
    ]);
    const waitingRows = buildFocusedOpsQueueRows({
      rows,
      queueKey: "waiting",
      continuationParentIds: new Set(),
      serviceFollowUpByJob,
      sortKey: "oldest",
    });

    expect(waitingRows.map((row) => row.id)).toEqual(["active-wait"]);
  });

  it("suppresses historical retest parents before returning exception rows", () => {
    const rows = buildFocusedOpsQueueRows({
      rows: [
        { id: "old-parent", ops_status: "failed", created_at: "2026-08-13T10:00:00.000Z" },
        { id: "active", ops_status: "problem", created_at: "2026-08-15T10:00:00.000Z" },
        { id: "waiting", ops_status: "on_hold", created_at: "2026-08-14T10:00:00.000Z" },
      ],
      queueKey: "exceptions",
      continuationParentIds: new Set(["old-parent"]),
      serviceFollowUpByJob: new Map(),
      sortKey: "oldest",
    });

    expect(rows.map((row) => row.id)).toEqual(["active"]);
  });
});
