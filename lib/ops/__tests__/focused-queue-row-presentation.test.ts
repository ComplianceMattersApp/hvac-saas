import { describe, expect, it } from "vitest";

import { buildFocusedQueueRowPresentation } from "@/lib/ops/focused-queue-row-presentation";
import { buildServiceFollowUpQueueStateByJob } from "@/lib/ops/service-follow-up-queue-state";

describe("focused queue row presentation", () => {
  it("derives waiting identity, reason, age, progress, and actions once", () => {
    const job = {
      id: "waiting-job",
      title: "Compressor follow-up",
      job_type: "service_repair",
      ops_status: "pending_info",
      customer_first_name: "JANE",
      customer_last_name: "DOE",
      job_address: "123 Main St",
      city: "LOS ANGELES",
      pending_info_reason: "Materials Needed: blower motor",
      created_at: "2026-07-01T12:00:00.000Z",
    };
    const serviceFollowUpByJob = buildServiceFollowUpQueueStateByJob([job], [
      {
        job_id: job.id,
        created_at: "2026-08-10T12:00:00.000Z",
        meta: { service_follow_up_progress: "part_arrived" },
      },
    ]);

    const presentation = buildFocusedQueueRowPresentation({
      job,
      queueKey: "waiting",
      serviceFollowUpByJob,
      stateEnteredAtByStatus: { pending_info: "2026-08-01T12:00:00.000Z" },
      assignmentSummary: "Unassigned",
      now: new Date("2026-08-16T12:00:00.000Z"),
    });

    expect(presentation).toMatchObject({
      jobId: "waiting-job",
      href: "/jobs/waiting-job?tab=ops",
      title: "Compressor follow-up",
      jobTypeLabel: "service repair",
      customerName: "Jane Doe",
      address: "123 Main St, Los Angeles",
      customerLocation: "Jane Doe · 123 Main St, Los Angeles",
      queueStatusLabel: "Part Arrived - Ready to Schedule Return",
      ageLabel: "In queue 15d",
      ageDays: 15,
      isAged: true,
      isReadyToSchedule: true,
      progressLabel: "Part Arrived",
      nextStepText: "Add to Scheduling Queue",
      primaryActionLabel: "Open Job",
      secondaryAction: {
        label: "Add to Scheduling Queue",
        href: "/jobs/waiting-job?tab=ops#followup",
      },
      tone: "amber",
    });
    expect(presentation.visibleReason).toEqual({
      label: "Waiting on parts",
      detail: "blower motor",
      source: "mapped",
    });
    expect(presentation.stateChips).toEqual([
      { label: "Part Arrived", tone: "green" },
      { label: "Unassigned", tone: "amber" },
    ]);
  });

  it("derives exception evidence, age, status, and review action consistently", () => {
    const presentation = buildFocusedQueueRowPresentation({
      job: {
        id: "failed-job",
        title: "ECC verification",
        job_type: "ecc",
        ops_status: "failed",
        customer_first_name: "sam",
        customer_last_name: "SMITH",
        city: "LONG BEACH",
        created_at: "2026-07-01T12:00:00.000Z",
      },
      queueKey: "exceptions",
      stateEnteredAtByStatus: { failed: "2026-08-05T12:00:00.000Z" },
      failedEvidenceAt: "2026-07-20T12:00:00.000Z",
      primaryFailureReason: "Duct Leakage Failed",
      failureReportSent: false,
      now: new Date("2026-08-16T12:00:00.000Z"),
    });

    expect(presentation).toMatchObject({
      queueStatusLabel: "Failed / Correction Required",
      ageLabel: "In queue 11d",
      ageDays: 11,
      isAged: false,
      primaryActionLabel: "Review Exception",
      secondaryAction: null,
      tone: "rose",
    });
    expect(presentation.visibleReason).toEqual({
      label: "Failed ECC test",
      detail: "Duct Leakage Failed",
      source: "mapped",
    });
    expect(presentation.stateChips).toEqual([
      { label: "Failed ECC", tone: "rose" },
      { label: "Failure report not sent", tone: "amber" },
    ]);
  });

  it("falls back to failure evidence and then creation time for queue aging", () => {
    const fromFailure = buildFocusedQueueRowPresentation({
      job: {
        id: "failure-aged",
        ops_status: "problem",
        created_at: "2026-08-01T12:00:00.000Z",
      },
      queueKey: "exceptions",
      failedEvidenceAt: "2026-08-10T12:00:00.000Z",
      now: new Date("2026-08-16T12:00:00.000Z"),
    });
    const fromCreation = buildFocusedQueueRowPresentation({
      job: {
        id: "created-aged",
        ops_status: "on_hold",
        created_at: "2026-08-14T12:00:00.000Z",
      },
      queueKey: "waiting",
      now: new Date("2026-08-16T12:00:00.000Z"),
    });

    expect(fromFailure.ageDays).toBe(6);
    expect(fromCreation.ageDays).toBe(2);
    expect(fromCreation.queueStatusLabel).toBe("On Hold");
    expect(fromCreation.visibleReason.label).toBe("On hold");
  });
});
