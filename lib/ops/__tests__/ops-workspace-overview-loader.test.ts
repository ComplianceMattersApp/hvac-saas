import { describe, expect, it } from "vitest";

import { buildOpsWorkspaceOverview } from "@/lib/ops/ops-workspace-overview-loader";
import type { OpsWorkspaceJob } from "@/lib/ops/ops-workspace-job-contract";
import type { WaitingExceptionQueueSnapshot } from "@/lib/ops/waiting-exception-loader";

function job(id: string, values: Partial<OpsWorkspaceJob> = {}): OpsWorkspaceJob {
  return { id, ...values };
}

function assignment(jobId: string) {
  return {
    job_id: jobId,
    user_id: "tech-1",
    display_name: "Tech One",
    is_primary: true,
    created_at: "2026-08-16T12:00:00.000Z",
  };
}

function waitingSnapshot(): WaitingExceptionQueueSnapshot {
  return {
    statusCounts: new Map([
      ["pending_info", 2],
      ["on_hold", 1],
      ["waiting", 4],
      ["pending_office_review", 3],
      ["failed", 1],
      ["retest_needed", 2],
      ["problem", 4],
    ]),
    retestContinuationParentIds: new Set(["historical-parent"]),
    serviceFollowUpByJob: new Map(),
  };
}

describe("Operations workspace overview read model", () => {
  it("builds all queue counts and gates from one typed snapshot", () => {
    const overview = buildOpsWorkspaceOverview({
      activePermitRequestsResult: { schemaAvailable: false, rows: [] },
      closeoutProjectionByJobId: new Map(),
      closeoutSourceRows: [],
      contractorIntakeCount: 5,
      contractorIntakeQueueAvailable: true,
      contractorScopeFilter: "contractor-1",
      fieldWorkAssignmentMap: {
        "field-current": [assignment("field-current")],
        "field-held": [assignment("field-held")],
      },
      fieldWorkRows: [
        job("field-current", { status: "open", ops_status: "scheduled", field_complete: false }),
        job("field-held", { status: "open", ops_status: "on_hold", field_complete: false }),
        job("field-unassigned", { status: "open", ops_status: "scheduled", field_complete: false }),
      ],
      followUpReminderRows: [
        job("follow-up", { status: "open", ops_status: "scheduled", follow_up_date: "2026-08-20" }),
        job("held", { status: "open", ops_status: "on_hold", follow_up_date: "2026-08-20" }),
      ],
      needToScheduleCount: 3,
      permitWorkflowEnabled: true,
      productMode: "ecc_hers",
      requestedBucket: "closeout",
      scheduledAssignmentMap: {
        assigned: [assignment("assigned")],
      },
      scheduledOpenRows: [
        job("assigned", { status: "open", ops_status: "scheduled" }),
        job("unassigned", { status: "open", ops_status: "scheduled" }),
      ],
      unreadContractorUpdateCount: 2,
      unreadNewWorkRequestCount: 5,
      waitingExceptionSnapshot: waitingSnapshot(),
      startTodayUtc: "2026-08-16T07:00:00.000Z",
      startTomorrowUtc: "2026-08-17T07:00:00.000Z",
    });

    expect(Object.fromEntries(overview.workspaceTabs.map((tab) => [tab.key, tab.count]))).toMatchObject({
      need_to_schedule: 3,
      field_work: 1,
      without_tech: 1,
      waiting: 7,
      exceptions: 10,
      closeout: 0,
      follow_ups: 1,
      contractor_intake: 5,
      updates: 7,
    });
    expect(overview.workspaceTabs.some((tab) => tab.key === "permits")).toBe(false);
    expect(overview.effectiveBoardBucketFilter).toBe("closeout");
    expect(overview.coreBoardWorkspaceKeys).toContain("contractor_intake");
    expect(overview.coreBoardWorkspaceKeys).not.toContain("permits");
    expect(overview.waitingExceptionSnapshot.retestContinuationParentIds).toContain(
      "historical-parent",
    );
  });

  it("falls back from an unavailable permit bucket without manufacturing permit rows", () => {
    const overview = buildOpsWorkspaceOverview({
      activePermitRequestsResult: { schemaAvailable: true, rows: [] },
      closeoutProjectionByJobId: new Map(),
      closeoutSourceRows: [],
      contractorIntakeCount: 0,
      contractorIntakeQueueAvailable: false,
      contractorScopeFilter: null,
      fieldWorkAssignmentMap: {},
      fieldWorkRows: [],
      followUpReminderRows: [],
      needToScheduleCount: 0,
      permitWorkflowEnabled: false,
      productMode: "hvac_service",
      requestedBucket: "permits",
      scheduledAssignmentMap: {},
      scheduledOpenRows: [],
      unreadContractorUpdateCount: 0,
      unreadNewWorkRequestCount: 0,
      waitingExceptionSnapshot: waitingSnapshot(),
      startTodayUtc: "2026-08-16T07:00:00.000Z",
      startTomorrowUtc: "2026-08-17T07:00:00.000Z",
    });

    expect(overview.effectiveBoardBucketFilter).toBe("pending");
    expect(overview.activePermitRequestRows).toEqual([]);
    expect(overview.workspaceTabs.some((tab) => tab.key === "permits")).toBe(false);
  });
});
