import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  buildCloseoutProjectionInputs,
  buildOpsWorkspacePreviewEnrichmentReadModels,
} from "@/lib/ops/ops-workspace-data-loader";

describe("Operations workspace data-loader read models", () => {
  it("reuses the overview closeout rows instead of reloading projected membership", () => {
    const source = readFileSync(resolve(__dirname, "../ops-workspace-data-loader.ts"), "utf8");

    expect(source).toContain("if (context.closeoutQueueRows)");
    expect(source).toContain("queueRows = [...context.closeoutQueueRows]");
    expect(source).toContain('params.selectedWorkspaceKey === "closeout" && hasJobs && !params.closeoutProjectionByJob');
  });

  it("projects only canonical closeout membership and billing fields", () => {
    const [projection] = buildCloseoutProjectionInputs([
      {
        id: "job-1",
        title: "Keep out of projection",
        field_complete: true,
        job_type: "ecc_testing",
        ops_status: "invoice_required",
        pending_info_reason: "Waiting on document",
        on_hold_reason: "Customer hold",
        permit_number: "P-100",
        invoice_complete: false,
        billing_disposition: "externally_billed",
        certs_complete: true,
        contractor_id: "contractor-1",
        contractors: { name: "Contractor One" },
      },
    ]);

    expect(projection).toEqual({
      id: "job-1",
      field_complete: true,
      job_type: "ecc_testing",
      ops_status: "invoice_required",
      pending_info_reason: "Waiting on document",
      on_hold_reason: "Customer hold",
      permit_number: "P-100",
      invoice_complete: false,
      billing_disposition: "externally_billed",
      certs_complete: true,
    });
    expect(projection).not.toHaveProperty("contractor_id");
    expect(projection).not.toHaveProperty("title");
  });

  it("builds lifecycle, evidence, and contact indexes from one enrichment snapshot", () => {
    const readModels = buildOpsWorkspacePreviewEnrichmentReadModels({
      jobEvents: [
        {
          job_id: "job-1",
          event_type: "ops_update",
          created_at: "2026-08-15T18:00:00.000Z",
          message: "Placed on hold",
          meta: {
            changes: [
              { field: "ops_status", to: "on_hold" },
              { field: "next_action_note", to: "Call customer" },
            ],
          },
        },
        {
          job_id: "job-1",
          event_type: "note",
          created_at: "2026-08-16T18:00:00.000Z",
          message: "Customer confirmed delay",
        },
      ],
      contractorReportEvents: [
        {
          job_id: "job-1",
          event_type: "contractor_report_sent",
          created_at: "2026-08-16T19:00:00.000Z",
          meta: { sent_at_iso: "2026-08-16T19:05:00.000Z" },
        },
      ],
      failedRuns: [
        {
          job_id: "job-1",
          test_type: "duct_leakage",
          created_at: "2026-08-14T18:00:00.000Z",
        },
      ],
      customerAttemptEvents: [
        { job_id: "job-1", created_at: "2026-08-14T12:00:00.000Z" },
        { job_id: "job-1", created_at: "2026-08-16T12:00:00.000Z" },
      ],
    });

    expect(readModels.opsStatusEnteredAtByJob.get("job-1")?.on_hold).toBe(
      "2026-08-15T18:00:00.000Z",
    );
    expect(readModels.workspaceEvidence.followUpEnteredAtByJob.get("job-1")).toBe(
      "2026-08-15T18:00:00.000Z",
    );
    expect(readModels.workspaceEvidence.latestJobEventByJob.get("job-1")?.message).toBe(
      "Customer confirmed delay",
    );
    expect(readModels.workspaceEvidence.latestContractorReportSentAtByJob.get("job-1")).toBe(
      "2026-08-16T19:05:00.000Z",
    );
    expect(readModels.workspaceEvidence.primaryFailureReasonByJob.get("job-1")).toBe(
      "Duct Leakage Failed",
    );
    expect(readModels.latestCustomerAttemptByJob.get("job-1")).toBe(
      "2026-08-16T12:00:00.000Z",
    );
  });

  it("ignores malformed enrichment rows without manufacturing queue state", () => {
    const readModels = buildOpsWorkspacePreviewEnrichmentReadModels({
      jobEvents: [null, "bad", {}, { event_type: "ops_update" }],
      contractorReportEvents: [{}],
      failedRuns: [{}],
      customerAttemptEvents: [],
    });

    expect(readModels.opsStatusEnteredAtByJob.size).toBe(0);
    expect(readModels.workspaceEvidence.latestJobEventByJob.size).toBe(0);
    expect(readModels.workspaceEvidence.primaryFailureReasonByJob.size).toBe(0);
    expect(readModels.latestCustomerAttemptByJob.size).toBe(0);
  });
});
