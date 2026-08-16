import { describe, expect, it } from "vitest";
import {
  buildOpsWorkspaceEvidenceIndex,
  opsWorkspaceEvidenceEpochMs,
} from "@/lib/ops/ops-workspace-evidence";

describe("Ops workspace evidence index", () => {
  it("selects the latest failed run regardless of result order and exposes its typed reason", () => {
    const older = {
      job_id: "job-1",
      created_at: "2026-08-01T10:00:00.000Z",
      test_type: "airflow",
      computed: { failures: ["Measured airflow was too low"] },
    };
    const newer = {
      job_id: "job-1",
      created_at: "2026-08-02T10:00:00.000Z",
      test_type: "duct_leakage",
      computed: { failures: ["Leakage exceeded the limit"] },
    };

    const evidence = buildOpsWorkspaceEvidenceIndex({ failedRuns: [older, newer] });

    expect(evidence.latestFailedRunByJob.get("job-1")).toBe(newer);
    expect(evidence.primaryFailureReasonByJob.get("job-1")).toBe("Duct Leakage Failed");
  });

  it("falls back to correction required when failure evidence has no known test label", () => {
    const evidence = buildOpsWorkspaceEvidenceIndex({
      failedRuns: [{
        job_id: "job-1",
        created_at: "2026-08-01T10:00:00.000Z",
        test_type: "custom_test",
        computed: { warnings: ["Needs office review"] },
      }],
    });

    expect(evidence.primaryFailureReasonByJob.get("job-1")).toBe("Correction Required");
  });

  it("indexes latest activity and latest follow-up entry without relying on query order", () => {
    const earlier = {
      job_id: "job-1",
      created_at: "2026-08-01T10:00:00.000Z",
      event_type: "ops_update",
      meta: { changes: [{ field: "follow_up_date", to: "2026-08-10" }] },
    };
    const later = {
      job_id: "job-1",
      created_at: "2026-08-03T10:00:00.000Z",
      event_type: "ops_update",
      meta: { changes: [{ field: "next_action_note", to: "Call customer" }] },
    };

    const evidence = buildOpsWorkspaceEvidenceIndex({ jobEvents: [earlier, later] });

    expect(evidence.latestJobEventByJob.get("job-1")).toBe(later);
    expect(evidence.followUpEnteredAtByJob.get("job-1")).toBe(later.created_at);
  });

  it("uses the newest contractor report timestamp and ignores unrelated events", () => {
    const evidence = buildOpsWorkspaceEvidenceIndex({
      contractorReportEvents: [
        {
          job_id: "job-1",
          event_type: "contractor_report_sent",
          created_at: "2026-08-03T10:00:00.000Z",
          meta: { sent_at_iso: "2026-08-03T10:05:00.000Z" },
        },
        {
          job_id: "job-1",
          event_type: "contractor_report_sent",
          created_at: "2026-08-01T10:00:00.000Z",
        },
        {
          job_id: "job-2",
          event_type: "customer_attempt",
          created_at: "2026-08-04T10:00:00.000Z",
        },
      ],
    });

    expect(evidence.latestContractorReportSentAtByJob.get("job-1")).toBe(
      "2026-08-03T10:05:00.000Z",
    );
    expect(evidence.latestContractorReportSentAtByJob.has("job-2")).toBe(false);
  });

  it("returns safe empty maps for missing or malformed evidence", () => {
    const evidence = buildOpsWorkspaceEvidenceIndex({
      jobEvents: [null, "bad", {}],
      contractorReportEvents: [42],
      failedRuns: [undefined],
    });

    expect(evidence.followUpEnteredAtByJob.size).toBe(0);
    expect(evidence.latestJobEventByJob.size).toBe(0);
    expect(evidence.latestContractorReportSentAtByJob.size).toBe(0);
    expect(evidence.latestFailedRunByJob.size).toBe(0);
    expect(evidence.primaryFailureReasonByJob.size).toBe(0);
    expect(opsWorkspaceEvidenceEpochMs("not-a-date")).toBe(0);
  });
});
