import { describe, expect, it } from "vitest";

import {
  buildOpsStatusEnteredAtByJob,
  resolveLifecycleAging,
} from "@/lib/utils/lifecycle-aging";

describe("lifecycle-aging resolver", () => {
  const now = new Date("2026-06-02T12:00:00.000Z");

  it("need_to_schedule uses state-entry timestamp when available", () => {
    const result = resolveLifecycleAging({
      status: "open",
      opsStatus: "need_to_schedule",
      createdAt: "2026-06-01T08:00:00.000Z",
      stateEnteredAtByStatus: {
        need_to_schedule: "2026-06-02T09:00:00.000Z",
      },
      now,
    });

    expect(result.label).toBe("Unscheduled for 3 hours");
    expect(result.sourceKind).toBe("state_entry");
    expect(result.usedFallback).toBe(false);
  });

  it("need_to_schedule falls back to created_at", () => {
    const result = resolveLifecycleAging({
      status: "open",
      opsStatus: "need_to_schedule",
      createdAt: "2026-06-01T12:00:00.000Z",
      now,
    });

    expect(result.label).toBe("Unscheduled for 1 day");
    expect(result.sourceKind).toBe("created_at");
    expect(result.usedFallback).toBe(true);
  });

  it("scheduled shows schedule timing and not intake age", () => {
    const today = "2026-06-02";
    expect(
      resolveLifecycleAging({
        opsStatus: "scheduled",
        scheduledDate: "2026-06-02",
        createdAt: "2026-05-20T12:00:00.000Z",
        todayDate: today,
        now,
      }).label,
    ).toBe("Scheduled today");

    expect(
      resolveLifecycleAging({
        opsStatus: "scheduled",
        scheduledDate: "2026-06-01",
        todayDate: today,
        now,
      }).label,
    ).toBe("Overdue by 1 day");
  });

  it("waiting states prefer state-entry before created_at", () => {
    const result = resolveLifecycleAging({
      opsStatus: "pending_info",
      createdAt: "2026-05-28T12:00:00.000Z",
      stateEnteredAtByStatus: {
        pending_info: "2026-06-02T10:00:00.000Z",
      },
      now,
    });

    expect(result.label).toBe("Waiting 2 hours");
    expect(result.sourceKind).toBe("state_entry");
  });

  it("failed and retest use state-entry or failed evidence before created_at", () => {
    const failedFromEvidence = resolveLifecycleAging({
      opsStatus: "failed",
      failedEvidenceAt: "2026-06-02T08:00:00.000Z",
      createdAt: "2026-05-30T08:00:00.000Z",
      now,
    });

    expect(failedFromEvidence.label).toBe("Failed 4 hours");
    expect(failedFromEvidence.sourceKind).toBe("failed_evidence");

    const retestFromStateEntry = resolveLifecycleAging({
      opsStatus: "retest_needed",
      stateEnteredAtByStatus: {
        retest_needed: "2026-06-01T12:00:00.000Z",
      },
      createdAt: "2026-05-30T08:00:00.000Z",
      now,
    });

    expect(retestFromStateEntry.label).toBe("Retest pending 1 day");
    expect(retestFromStateEntry.sourceKind).toBe("state_entry");
  });

  it("closeout uses closeout-entry then field_complete_at then scheduled_date", () => {
    const fromStateEntry = resolveLifecycleAging({
      opsStatus: "invoice_required",
      stateEnteredAtByStatus: {
        invoice_required: "2026-06-01T12:00:00.000Z",
      },
      fieldCompleteAt: "2026-05-31T12:00:00.000Z",
      scheduledDate: "2026-05-30",
      now,
    });
    expect(fromStateEntry.label).toBe("Closeout open 1 day");
    expect(fromStateEntry.sourceKind).toBe("state_entry");

    const fromFieldComplete = resolveLifecycleAging({
      opsStatus: "paperwork_required",
      fieldCompleteAt: "2026-06-02T06:00:00.000Z",
      scheduledDate: "2026-06-01",
      now,
    });
    expect(fromFieldComplete.label).toBe("Closeout open 6 hours");
    expect(fromFieldComplete.sourceKind).toBe("field_complete_at");

    const fromScheduledDate = resolveLifecycleAging({
      opsStatus: "paperwork_required",
      fieldCompleteAt: null,
      scheduledDate: "2026-06-01",
      createdAt: "2026-05-30T01:00:00.000Z",
      now,
    });
    expect(fromScheduledDate.label).toBe("Closeout open 1 day");
    expect(fromScheduledDate.sourceKind).toBe("scheduled_date");
  });

  it("returns safe neutral output for missing/invalid timestamps", () => {
    const result = resolveLifecycleAging({
      opsStatus: "failed",
      createdAt: "not-a-date",
      now,
    });

    expect(result.label).toBeNull();
    expect(result.confidence).toBe("partial");
  });

  it("buildOpsStatusEnteredAtByJob captures latest transition into each status", () => {
    const map = buildOpsStatusEnteredAtByJob([
      {
        job_id: "job-1",
        created_at: "2026-06-02T10:00:00.000Z",
        meta: {
          changes: [{ field: "ops_status", from: "scheduled", to: "pending_info" }],
        },
      },
      {
        job_id: "job-1",
        created_at: "2026-06-02T09:00:00.000Z",
        meta: {
          changes: [{ field: "ops_status", from: "need_to_schedule", to: "scheduled" }],
        },
      },
      {
        job_id: "job-1",
        created_at: "2026-06-02T08:00:00.000Z",
        meta: {
          changes: [{ field: "ops_status", from: "open", to: "pending_info" }],
        },
      },
    ]);

    expect(map.get("job-1")?.pending_info).toBe("2026-06-02T10:00:00.000Z");
    expect(map.get("job-1")?.scheduled).toBe("2026-06-02T09:00:00.000Z");
  });
});
