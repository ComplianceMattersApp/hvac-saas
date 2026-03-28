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
    expect(result.statusLabel).toBe("In Progress");
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

  it("uses retest scheduled override only for failed and retest_needed states", () => {
    const result = resolveContractorIssues({
      job: {
        id: "job-4",
        ops_status: "failed",
      },
      chain: {
        hasOpenRetestChild: true,
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
