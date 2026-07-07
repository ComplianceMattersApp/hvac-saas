import { describe, expect, it } from "vitest";

import { resolveContractorIssues } from "@/lib/portal/resolveContractorIssues";

describe("resolveContractorIssues", () => {
  it("does not collapse scheduled jobs to needs_info when only signal fields exist", () => {
    const result = resolveContractorIssues({
      job: {
        id: "job-1",
        ops_status: "scheduled",
        pending_info_reason: "Need permit image",
        next_action_note: "Upload permit",
      },
    });

    expect(result.primaryIssue.group).toBe("in_progress");
    expect(result.primaryIssue.headline).toBe("Scheduled");
    expect(result.statusLabel).toBe("Scheduled");
    expect(result.bucket).toBe("in_progress");
  });

  it("maps pending_info ops status to needs_info", () => {
    const result = resolveContractorIssues({
      job: {
        id: "job-2",
        ops_status: "pending_info",
        pending_info_reason: "Missing permit number",
        next_action_note: "Please provide permit details",
      },
    });

    expect(result.primaryIssue.group).toBe("needs_info");
    expect(result.statusLabel).toBe("Needs Info");
    expect(result.bucket).toBe("action_required");
  });

  it("keeps closed jobs as passed even when stale note fields exist", () => {
    const result = resolveContractorIssues({
      job: {
        id: "job-3",
        ops_status: "closed",
        pending_info_reason: "Old stale note",
        next_action_note: "Old stale action",
      },
    });

    expect(result.primaryIssue.group).toBe("passed");
    expect(result.statusLabel).toBe("Passed");
    expect(result.bucket).toBe("passed");
  });

  it("keeps paperwork_required in in_progress bucket", () => {
    const result = resolveContractorIssues({
      job: {
        id: "job-5",
        ops_status: "paperwork_required",
      },
    });

    expect(result.primaryIssue.group).toBe("in_progress");
    expect(result.bucket).toBe("in_progress");
  });

  it("keeps invoice_required in in_progress bucket", () => {
    const result = resolveContractorIssues({
      job: {
        id: "job-6",
        ops_status: "invoice_required",
      },
    });

    expect(result.primaryIssue.group).toBe("in_progress");
    expect(result.bucket).toBe("in_progress");
  });

  it("maps pending_office_review to under review in_progress state", () => {
    const result = resolveContractorIssues({
      job: {
        id: "job-7",
        ops_status: "pending_office_review",
      },
      failureReasons: ["Failed - airflow below target"],
    });

    expect(result.primaryIssue.group).toBe("in_progress");
    expect(result.primaryIssue.headline).toBe("Under review");
    expect(result.statusLabel).toBe("Under Review");
    expect(result.bucket).toBe("in_progress");
  });

  it("shows final processing wording for evidence-accepted failed jobs still in closeout", () => {
    const result = resolveContractorIssues({
      job: {
        id: "job-evidence-processing",
        ops_status: "paperwork_required",
        field_complete: true,
        certs_complete: false,
        invoice_complete: false,
      },
      events: [
        {
          event_type: "failure_resolved_by_correction_review",
          created_at: "2026-05-01T10:00:00.000Z",
        },
      ],
    });

    expect(result.primaryIssue.group).toBe("in_progress");
    expect(result.primaryIssue.headline).toBe("Final processing");
    expect(result.primaryIssue.explanation).toBe("Accepted by review. Final paperwork is being completed.");
    expect(result.statusLabel).toBe("Final processing");
    expect(result.bucket).toBe("in_progress");
  });

  it("shows resolved wording when evidence-accepted failed jobs are fully closed", () => {
    const result = resolveContractorIssues({
      job: {
        id: "job-evidence-closed",
        ops_status: "closed",
        field_complete: true,
        certs_complete: true,
        invoice_complete: true,
      },
      events: [
        {
          event_type: "failure_resolved_by_correction_review",
          created_at: "2026-05-01T10:00:00.000Z",
        },
      ],
    });

    expect(result.primaryIssue.group).toBe("passed");
    expect(result.primaryIssue.headline).toBe("Resolved");
    expect(result.primaryIssue.explanation).toBe("Accepted by review and closed.");
    expect(result.statusLabel).toBe("Resolved");
    expect(result.bucket).toBe("passed");
  });

  it("keeps unresolved failed jobs in failed/action-required state", () => {
    const result = resolveContractorIssues({
      job: {
        id: "job-failed-unresolved",
        ops_status: "failed",
        field_complete: true,
      },
      failureReasons: ["Failed - duct leakage over threshold"],
    });

    expect(result.primaryIssue.group).toBe("failed");
    expect(result.statusLabel).toBe("Failed");
    expect(result.bucket).toBe("action_required");
    expect(result.actionRequired).toBe(true);
  });

  it("projects failed jobs with contractor retest-ready request as internal review needed", () => {
    const result = resolveContractorIssues({
      job: {
        id: "job-failed-retest-requested",
        ops_status: "failed",
      },
      failureReasons: ["Failed - duct leakage over threshold"],
      chain: {
        hasRetestReadyRequest: true,
      },
    });

    expect(result.primaryIssue.group).toBe("in_progress");
    expect(result.primaryIssue.headline).toBe("Retest Review Requested");
    expect(result.primaryIssue.stage).toBe("retest_review_requested");
    expect(result.statusLabel).toBe("Retest Review Requested");
    expect(result.nextStep).toBe("Corrections marked complete. Our team will review and schedule the retest.");
    expect(result.bucket).toBe("in_progress");
    expect(result.actionRequired).toBe(false);
  });

  it("shows internally confirmed retest_needed as Retest Ready without contractor action required", () => {
    const result = resolveContractorIssues({
      job: {
        id: "job-retest-ready",
        ops_status: "retest_needed",
        field_complete: true,
      },
      failureReasons: ["Failed - duct leakage over threshold"],
    });

    expect(result.primaryIssue.group).toBe("in_progress");
    expect(result.primaryIssue.headline).toBe("Retest Ready");
    expect(result.statusLabel).toBe("Retest Ready");
    expect(result.bucket).toBe("in_progress");
    expect(result.nextStep).toBe("Internal review confirmed this job is ready for retest scheduling.");
    expect(result.actionRequired).toBe(false);
  });

  it("keeps normal closed jobs as passed when not evidence-accepted", () => {
    const result = resolveContractorIssues({
      job: {
        id: "job-normal-closed",
        ops_status: "closed",
        field_complete: true,
        certs_complete: true,
        invoice_complete: true,
      },
      events: [],
    });

    expect(result.primaryIssue.group).toBe("passed");
    expect(result.primaryIssue.headline).toBe("Passed");
    expect(result.statusLabel).toBe("Passed");
    expect(result.bucket).toBe("passed");
  });

  it("keeps retest scheduled child override above retest-ready request", () => {
    const result = resolveContractorIssues({
      job: {
        id: "job-4",
        ops_status: "failed",
      },
      chain: {
        hasOpenRetestChild: true,
        hasRetestReadyRequest: true,
        retestScheduledDate: "2026-03-30",
        retestWindowStart: "08:00",
        retestWindowEnd: "10:00",
      },
    });

    expect(result.primaryIssue.group).toBe("in_progress");
    expect(result.statusLabel).toBe("Retest Scheduled");
    expect(result.bucket).toBe("in_progress");
  });
});
