import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  EXCEPTION_QUEUE_STATUSES,
  WAITING_QUEUE_STATUSES,
  buildExceptionQueueRows,
  buildWaitingQueueRows,
  buildWithoutTechQueueRows,
  formatAssignmentSummaryForJob,
  formatFailedEccQueueReasonFromRun,
  getExceptionQueueDisplayLabel,
  getOpsQueueCardStatusReason,
  getWaitingQueueDisplay,
  getWaitingQueueRecommendedNextStep,
} from "@/lib/ops/focused-queues";
import {
  isActiveFieldWorkStatus,
  isCloseoutBlockingQueueStatus,
  isExceptionQueueStatus,
  isOfficeReviewQueueStatus,
  isScheduledAssignedMyWorkEligible,
  isWaitingQueueStatus,
} from "@/lib/ops/queue-status-contracts";

const waitingQueuePageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/queues/waiting/page.tsx"),
  "utf-8",
);

const exceptionsQueuePageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/queues/exceptions/page.tsx"),
  "utf-8",
);

const withoutTechQueuePageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/queues/without-tech/page.tsx"),
  "utf-8",
);

const opsFieldPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/field/page.tsx"),
  "utf-8",
);

const fieldQueueLibSource = readFileSync(
  resolve(__dirname, "../field-queue.ts"),
  "utf-8",
);

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf-8",
);

const opsRowCardSource = readFileSync(
  resolve(__dirname, "../../../app/ops/_components/OpsQueueRowCard.tsx"),
  "utf-8",
);

describe("focused ops queue filtering", () => {
  it("waiting queue includes waiting states but not office review exceptions", () => {
    const rows = buildWaitingQueueRows([
      { id: "j1", ops_status: "pending_info", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "j2", ops_status: "on_hold", created_at: "2026-01-02T00:00:00.000Z" },
      { id: "j3", ops_status: "waiting", created_at: "2026-01-03T00:00:00.000Z" },
      { id: "j4", ops_status: "pending_office_review", created_at: "2026-01-04T00:00:00.000Z" },
      { id: "j5", ops_status: "failed", created_at: "2026-01-05T00:00:00.000Z" },
      { id: "j6", ops_status: "closed", created_at: "2026-01-06T00:00:00.000Z" },
      { id: "j7", ops_status: "scheduled", created_at: "2026-01-07T00:00:00.000Z" },
    ]);

    expect(rows.map((row) => row.id)).toEqual(["j1", "j2", "j3"]);
  });

  it("suppresses service follow-up parents already continued through a linked child", () => {
    const rows = buildWaitingQueueRows([
      {
        id: "parent-1",
        ops_status: "pending_info",
        pending_info_reason: "Materials Needed: Need 45/5 capacitor",
        service_follow_up_continued: true,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "parent-2",
        ops_status: "pending_info",
        pending_info_reason: "Approval Needed: Waiting on approval",
        created_at: "2026-01-02T00:00:00.000Z",
      },
    ]);

    expect(rows.map((row) => row.id)).toEqual(["parent-2"]);
  });

  it("exceptions queue includes failed/retest/review/problem states", () => {
    const rows = buildExceptionQueueRows([
      { id: "j1", ops_status: "failed", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "j2", ops_status: "retest_needed", created_at: "2026-01-02T00:00:00.000Z" },
      { id: "j3", ops_status: "pending_office_review", created_at: "2026-01-03T00:00:00.000Z" },
      { id: "j4", ops_status: "problem", created_at: "2026-01-04T00:00:00.000Z" },
      { id: "j5", ops_status: "on_hold", created_at: "2026-01-05T00:00:00.000Z" },
      { id: "j6", ops_status: "closed", created_at: "2026-01-06T00:00:00.000Z" },
      { id: "j7", ops_status: "scheduled", created_at: "2026-01-07T00:00:00.000Z" },
    ]);

    expect(rows.map((row) => row.id)).toEqual(["j1", "j2", "j3", "j4"]);
  });

  it("without-tech queue includes the same today-counted unassigned rows", () => {
    const rows = buildWithoutTechQueueRows({
      jobs: [
        {
          id: "j1",
          account_owner_user_id: "owner-1",
          ops_status: "in_process",
          status: "in_process",
          field_complete: false,
          scheduled_date: "2026-05-25",
          window_start: "08:00:00",
        },
        {
          id: "j2",
          account_owner_user_id: "owner-1",
          ops_status: "scheduled",
          status: "open",
          field_complete: false,
          scheduled_date: "2026-05-25",
          window_start: "09:00:00",
        },
        {
          id: "j3",
          account_owner_user_id: "owner-1",
          ops_status: "need_to_schedule",
          status: "open",
          field_complete: false,
          scheduled_date: "2026-05-25",
          window_start: "10:00:00",
        },
        {
          id: "j4",
          account_owner_user_id: "owner-1",
          ops_status: "scheduled",
          status: "cancelled",
          field_complete: false,
          scheduled_date: "2026-05-25",
          window_start: "11:00:00",
        },
        {
          id: "j5",
          account_owner_user_id: "owner-1",
          ops_status: "scheduled",
          status: "open",
          field_complete: true,
          scheduled_date: "2026-05-25",
          window_start: "12:00:00",
        },
      ],
      assignmentDisplayMap: {
        j2: [{ is_active: true, is_primary: true }],
      },
      accountOwnerUserId: "owner-1",
      today: "2026-05-25",
    });

    expect(rows.map((row) => row.id)).toEqual(["j1", "j3"]);
  });
});

describe("canonical queue status contracts", () => {
  it("classifies waiting and exception statuses from the B2-A contract", () => {
    expect(isWaitingQueueStatus("pending_info")).toBe(true);
    expect(isWaitingQueueStatus("on_hold")).toBe(true);
    expect(isWaitingQueueStatus("waiting")).toBe(true);
    expect(isWaitingQueueStatus("pending_office_review")).toBe(false);
    expect(isWaitingQueueStatus("failed")).toBe(false);
    expect(isWaitingQueueStatus("retest_needed")).toBe(false);
    expect(isWaitingQueueStatus("problem")).toBe(false);
    expect(isWaitingQueueStatus("closed")).toBe(false);
    expect(isWaitingQueueStatus("scheduled")).toBe(false);

    expect(isExceptionQueueStatus("pending_info")).toBe(false);
    expect(isExceptionQueueStatus("on_hold")).toBe(false);
    expect(isExceptionQueueStatus("waiting")).toBe(false);
    expect(isExceptionQueueStatus("pending_office_review")).toBe(true);
    expect(isExceptionQueueStatus("failed")).toBe(true);
    expect(isExceptionQueueStatus("retest_needed")).toBe(true);
    expect(isExceptionQueueStatus("problem")).toBe(true);
    expect(isExceptionQueueStatus("closed")).toBe(false);
    expect(isExceptionQueueStatus("scheduled")).toBe(false);
  });

  it("keeps office review and closeout-blocking contracts explicit", () => {
    expect(isOfficeReviewQueueStatus("pending_office_review")).toBe(true);
    expect(isOfficeReviewQueueStatus("pending_info")).toBe(false);

    expect(isCloseoutBlockingQueueStatus("pending_info")).toBe(true);
    expect(isCloseoutBlockingQueueStatus("on_hold")).toBe(true);
    expect(isCloseoutBlockingQueueStatus("waiting")).toBe(false);
    expect(isCloseoutBlockingQueueStatus("pending_office_review")).toBe(false);
  });

  it("keeps scheduled assigned My Work eligibility conservative", () => {
    expect(isActiveFieldWorkStatus("on_the_way")).toBe(true);
    expect(isActiveFieldWorkStatus("in_process")).toBe(true);
    expect(isActiveFieldWorkStatus("scheduled")).toBe(false);

    expect(isScheduledAssignedMyWorkEligible({
      status: "on_the_way",
      scheduledDate: null,
      fieldComplete: false,
    })).toBe(true);
    expect(isScheduledAssignedMyWorkEligible({
      status: "open",
      scheduledDate: "2026-05-25",
      fieldComplete: false,
    })).toBe(true);
    expect(isScheduledAssignedMyWorkEligible({
      status: "open",
      scheduledDate: null,
      fieldComplete: false,
    })).toBe(false);
    expect(isScheduledAssignedMyWorkEligible({
      status: "in_process",
      scheduledDate: "2026-05-25",
      fieldComplete: true,
    })).toBe(false);
  });

  it("keeps generic assigned unscheduled jobs out of field My Work", () => {
    expect(isScheduledAssignedMyWorkEligible({
      status: "open",
      scheduledDate: null,
      fieldComplete: false,
    })).toBe(false);
    expect(isScheduledAssignedMyWorkEligible({
      status: "open",
      scheduledDate: "",
      fieldComplete: false,
    })).toBe(false);
    expect(isScheduledAssignedMyWorkEligible({
      status: "scheduled",
      scheduledDate: "2026-05-25",
      fieldComplete: false,
    })).toBe(true);
    expect(isScheduledAssignedMyWorkEligible({
      status: "on_the_way",
      scheduledDate: null,
      fieldComplete: false,
    })).toBe(true);
    expect(isScheduledAssignedMyWorkEligible({
      status: "in_process",
      scheduledDate: null,
      fieldComplete: false,
    })).toBe(true);
  });
});

describe("focused queue display labels", () => {
  it("maps structured waiting reasons to office-friendly labels", () => {
    expect(getWaitingQueueDisplay({
      ops_status: "pending_info",
      pending_info_reason: "Waiting on part: Compressor lead time",
    })).toEqual({
      label: "Waiting on Part",
      reason: "Compressor lead time",
    });

    expect(getWaitingQueueDisplay({
      ops_status: "pending_info",
      pending_info_reason: "Waiting on customer approval: Estimate sent",
    })).toEqual({
      label: "Approval Needed",
      reason: "Estimate sent",
    });

    expect(getWaitingQueueDisplay({
      ops_status: "on_hold",
      on_hold_reason: "Waiting on access: Gate code missing",
    })).toEqual({
      label: "Waiting on Access",
      reason: "Gate code missing",
    });

    expect(getWaitingQueueDisplay({
      ops_status: "pending_info",
      pending_info_reason: "Waiting on information: Customer not home",
    })).toEqual({
      label: "Unable to Complete / Waiting on Information",
      reason: "Customer not home",
    });

    expect(getWaitingQueueDisplay({
      ops_status: "pending_info",
      pending_info_reason: "Materials Needed: Need 45/5 capacitor",
    })).toEqual({
      label: "Materials Needed",
      reason: "Need 45/5 capacitor",
    });

    expect(getWaitingQueueDisplay({
      ops_status: "waiting",
    })).toEqual({
      label: "Waiting on Information",
      reason: "Dependency pending",
    });

    expect(getWaitingQueueRecommendedNextStep({
      ops_status: "pending_info",
      pending_info_reason: "Waiting on part: Compressor lead time",
    })).toBe("Confirm part sourcing status and plan return scheduling.");

    expect(getWaitingQueueRecommendedNextStep({
      ops_status: "pending_info",
      pending_info_reason: "Waiting on customer approval: Estimate sent",
    })).toBe("Contact customer/decision-maker and capture approval outcome.");

    expect(getWaitingQueueRecommendedNextStep({
      ops_status: "pending_info",
      pending_info_reason: "Waiting on information: Customer not home",
    })).toBe("Review visit note and decide contact, reschedule, or office review next step.");

    expect(getWaitingQueueRecommendedNextStep({
      ops_status: "waiting",
    })).toBe("Review blocker details and set next office action.");
  });

  it("maps exception statuses to office review labels without changing membership", () => {
    expect(getExceptionQueueDisplayLabel({ ops_status: "pending_office_review" })).toBe("Office Review Needed");
    expect(getExceptionQueueDisplayLabel({ job_type: "ecc", ops_status: "pending_office_review" })).toBe("Corrections Submitted / Under Review");
    expect(getExceptionQueueDisplayLabel({ ops_status: "failed" })).toBe("Failed Test");
    expect(getExceptionQueueDisplayLabel({ job_type: "ecc", ops_status: "failed" })).toBe("Failed / Correction Required");
    expect(getExceptionQueueDisplayLabel({ ops_status: "retest_needed" })).toBe("Retest Needed");
    expect(getExceptionQueueDisplayLabel({ job_type: "ecc", ops_status: "retest_needed" })).toBe("Retest Ready");
    expect(getExceptionQueueDisplayLabel({ ops_status: "problem" })).toBe("Operational Issue");

    expect(EXCEPTION_QUEUE_STATUSES).toEqual([
      "failed",
      "retest_needed",
      "pending_office_review",
      "problem",
    ]);
    expect(WAITING_QUEUE_STATUSES).toEqual([
      "pending_info",
      "on_hold",
      "waiting",
    ]);
  });

  it("formats Operations Workspace queue card status/reason without raw ops_status keys", () => {
    expect(getOpsQueueCardStatusReason({
      ops_status: "pending_info",
      pending_info_reason: "Need updated T24",
    })).toBe("Waiting on Information: Need updated T24");

    expect(getOpsQueueCardStatusReason({
      ops_status: "pending_info",
      pending_info_reason: "Permit Needed",
    })).toBe("Permit Needed");

    expect(getOpsQueueCardStatusReason({
      ops_status: "pending_info",
      pending_info_reason: "Materials Needed: Need 45/5 capacitor",
      service_follow_up_progress_label: "Part Ordered",
    })).toBe("Materials Needed: Need 45/5 capacitor • Progress: Part Ordered");

    expect(getOpsQueueCardStatusReason({
      ops_status: "pending_info",
      pending_info_reason: "Materials Needed: Need 45/5 capacitor",
      service_follow_up_progress_label: "Part Arrived",
    })).toBe("Part Arrived - Ready to Schedule Return: Materials Needed: Need 45/5 capacitor");

    expect(getOpsQueueCardStatusReason({
      ops_status: "pending_info",
      pending_info_reason: "Approval Needed: Customer must approve added work",
      service_follow_up_progress_label: "Approval Received",
    })).toBe("Approval Received - Ready to Schedule Return: Approval Needed: Customer must approve added work");

    expect(getOpsQueueCardStatusReason({
      ops_status: "pending_info",
      pending_info_reason: "Materials Needed: Need 45/5 capacitor",
    })).toBe("Materials Needed: Need 45/5 capacitor");

    expect(getOpsQueueCardStatusReason({
      ops_status: "pending_info",
      pending_info_reason: "Approval Needed: Customer must approve added work",
    })).toBe("Approval Needed: Customer must approve added work");

    expect(getOpsQueueCardStatusReason({
      ops_status: "pending_info",
      pending_info_reason: "Other: Customer asked us to pause until Friday",
    })).toBe("Other: Customer asked us to pause until Friday");

    expect(getOpsQueueCardStatusReason({
      ops_status: "pending_info",
      pending_info_reason: "Waiting on part",
    })).toBe("Waiting on Part");

    expect(getOpsQueueCardStatusReason({
      ops_status: "pending_info",
      pending_info_reason: "Waiting on part: Capacitor needed",
    })).toBe("Waiting on Part: Capacitor needed");

    expect(getOpsQueueCardStatusReason({
      ops_status: "pending_info",
      pending_info_reason: "Waiting on customer approval: Customer needs to approve compressor",
    })).toBe("Approval Needed: Customer needs to approve compressor");

    expect(getOpsQueueCardStatusReason({
      ops_status: "pending_info",
      pending_info_reason: "Waiting on information: Need updated T24",
    })).toBe("Waiting on Information: Need updated T24");

    expect(getOpsQueueCardStatusReason({
      ops_status: "on_hold",
      on_hold_reason: "Dependency pending",
    })).toBe("On Hold: Dependency pending");

    expect(getOpsQueueCardStatusReason({
      ops_status: "failed",
      pending_info_reason: "Failed - needs review/correction",
    })).toBe("Failed: Needs review/correction");

    expect(getOpsQueueCardStatusReason({
      job_type: "ecc",
      ops_status: "failed",
      pending_info_reason: "Failed - needs review/correction",
    })).toBe("Failed / Correction Required");

    expect(getOpsQueueCardStatusReason({
      job_type: "ecc",
      ops_status: "failed",
      ops_board_failure_note: "Waiting on correction photos",
      pending_info_reason: "Failed - needs review/correction",
    })).toBe("Failed / Correction Required: Waiting on correction photos");

    expect(getOpsQueueCardStatusReason({
      job_type: "ecc",
      ops_status: "pending_office_review",
    })).toBe("Corrections Submitted / Under Review");

    expect(getOpsQueueCardStatusReason({
      job_type: "service",
      ops_status: "pending_office_review",
    })).toBe("Office Review Needed");

    expect(getOpsQueueCardStatusReason({
      job_type: "ecc",
      ops_status: "retest_needed",
    })).toBe("Retest Ready");

    expect(getOpsQueueCardStatusReason({ ops_status: "paperwork_required" })).toBe("Closeout: Paperwork Required");
    expect(getOpsQueueCardStatusReason({ ops_status: "invoice_required" })).toBe("Closeout: Invoice Required");
    expect(getOpsQueueCardStatusReason({
      ops_status: "custom_status",
      pending_info_reason: "Needs coordinator review",
    })).toBe("Needs coordinator review");
  });

  it("Operations Workspace cards use formatted status/reason copy instead of raw Ops Status", () => {
    expect(opsPageSource).toContain("getOpsQueueCardStatusReason");
    expect(opsRowCardSource).toContain('label: "Reason"');
    expect(opsPageSource).not.toContain("Ops Status:");
  });

  it("waiting queue shows resolved service follow-ups as ready to schedule while preserving original reason", () => {
    expect(waitingQueuePageSource).toContain("readyToScheduleLabel");
    expect(waitingQueuePageSource).toContain("Ready to Schedule Return");
    expect(waitingQueuePageSource).toContain('"Original reason"');
    expect(waitingQueuePageSource).toContain("buildServiceFollowUpProgressState");
  });

  it("formats Operations Workspace assignment summaries without closing over render-order state", () => {
    expect(formatAssignmentSummaryForJob("job-1", {})).toBe("Unassigned");
    expect(formatAssignmentSummaryForJob("job-1", {
      "job-1": [{ display_name: "jane TECH" }],
    })).toBe("Jane Tech");
    expect(formatAssignmentSummaryForJob("job-1", {
      "job-1": [
        { display_name: "jane TECH" },
        { display_name: "sam helper" },
        { display_name: "alex helper" },
      ],
    })).toBe("Jane Tech +2");
    expect(formatAssignmentSummaryForJob("job-1", {
      "job-1": [{ display_name: "Service Account" }],
    })).toBe("Unassigned");
    expect(formatAssignmentSummaryForJob("job-1", {
      "job-1": [
        { display_name: "Service Account" },
        { display_name: "alex TECH" },
      ],
    })).toBe("Alex Tech");
  });

  it("formats specific ECC failed reasons from failed test-run evidence", () => {
    expect(formatFailedEccQueueReasonFromRun({ test_type: "duct_leakage" })).toBe("Duct Leakage Failed");
    expect(formatFailedEccQueueReasonFromRun({ test_type: "refrigerant_charge" })).toBe("Refrigerant Charge Failed");
    expect(formatFailedEccQueueReasonFromRun({ test_type: "airflow" })).toBe("Airflow Failed");
    expect(formatFailedEccQueueReasonFromRun({ test_type: "custom" })).toBe("");
  });

  it("early Operations Workspace preview cards use an initialized preview assignment map", () => {
    expect(opsPageSource).toContain("selectedPreviewAssignmentDisplayMap");
    expect(opsPageSource).toContain(
      "formatAssignmentSummaryForJob(jobId, selectedPreviewAssignmentDisplayMap)",
    );
  });

  it("Operations Workspace rows include contractor context only when a job contractor exists", () => {
    expect(opsPageSource).toContain("contractors(name)");
    expect(opsPageSource).toContain("workspaceContractorName(job)");
    expect(opsRowCardSource).toContain("Contractor");
    expect(opsPageSource).not.toContain("Contractor:</span> -");
    expect(opsPageSource).not.toContain("formatCityNamePart(workspaceContractorName");
    expect(opsPageSource).not.toContain("formatPersonNamePart(workspaceContractorName");
  });

  it("Operations Workspace failed rows use specific ECC failure evidence and fall back safely", () => {
    expect(opsPageSource).toContain("formatFailedEccQueueReasonFromRun");
    expect(opsPageSource).toContain("primaryFailureReasonByJob.get(jobId)");
    expect(opsPageSource).toContain('|| "Failed"');
    expect(opsPageSource).toContain('"Correction Required"');
    expect(opsPageSource).toContain('"Retest Needed"');
  });

  it("Operations Workspace rows normalize person and city casing without touching companies", () => {
    expect(opsPageSource).toContain("formatPersonNamePart(job?.customer_first_name)");
    expect(opsPageSource).toContain("formatCityNamePart(job?.city)");
    expect(opsPageSource).toContain("contractorName: workspaceContractorName(job)");
  });

  it("Operations Workspace rows keep queue/action timing and avoid dash-only metadata fallbacks", () => {
    expect(opsPageSource).toContain("In queue");
    expect(opsRowCardSource).toContain("Last Action");
    expect(opsPageSource).toContain("workspaceQueueAgeChipLabel");
    expect(opsPageSource).toContain("workspaceLastActionTag");
    expect(opsPageSource).toContain("resolveLifecycleDaysAgingLabel");
    expect(opsPageSource).toContain("Not available");
    expect(opsPageSource).not.toContain("Age/Time:");
    expect(opsPageSource).not.toContain('?? "-"');
  });
});

describe("focused ops queue pages", () => {
  it("focused queue pages use canonical status constants for route filters", () => {
    expect(waitingQueuePageSource).toContain("WAITING_QUEUE_STATUSES");
    expect(exceptionsQueuePageSource).toContain("EXCEPTION_QUEUE_STATUSES");

    for (const status of WAITING_QUEUE_STATUSES) {
      expect(isWaitingQueueStatus(status)).toBe(true);
    }

    for (const status of EXCEPTION_QUEUE_STATUSES) {
      expect(isExceptionQueueStatus(status)).toBe(true);
    }
  });

  it("waiting page reads both pending info and on-hold reasons", () => {
    expect(waitingQueuePageSource).toContain("pending_info_reason");
    expect(waitingQueuePageSource).toContain("on_hold_reason");
  });

  it("waiting and exception pages use focused queue display labels", () => {
    expect(waitingQueuePageSource).toContain("getWaitingQueueDisplay");
    expect(waitingQueuePageSource).toContain("getWaitingQueueRecommendedNextStep");
    expect(waitingQueuePageSource).toContain("buildServiceFollowUpProgressState");
    expect(waitingQueuePageSource).toContain("followUpProgress.progressLabel");
    expect(waitingQueuePageSource).toContain("Next step:");
    expect(waitingQueuePageSource).toContain("#next-service-action");
    expect(waitingQueuePageSource).toContain("Create Return Visit");
    expect(exceptionsQueuePageSource).toContain("getExceptionQueueDisplayLabel");
  });

  it("waiting page includes safe empty state and return navigation", () => {
    expect(waitingQueuePageSource).toContain("No waiting work right now.");
    expect(waitingQueuePageSource).toContain("Return to Operations");
    expect(waitingQueuePageSource).toContain('href="/ops"');
  });

  it("exceptions page includes safe empty state and return navigation", () => {
    expect(exceptionsQueuePageSource).toContain("No exceptions are waiting right now.");
    expect(exceptionsQueuePageSource).toContain("Return to Operations");
    expect(exceptionsQueuePageSource).toContain('href="/ops"');
  });

  it("without-tech page includes safe empty state and return navigation", () => {
    expect(withoutTechQueuePageSource).toContain("No coverage gaps right now.");
    expect(withoutTechQueuePageSource).toContain("Return to Operations");
    expect(withoutTechQueuePageSource).toContain('href="/ops"');
    expect(withoutTechQueuePageSource).toContain("Needs Assignment");
    expect(withoutTechQueuePageSource).toContain("buildScheduledWithoutTechSnapshot");
    expect(withoutTechQueuePageSource).toContain('.eq("status", "open")');
    expect(withoutTechQueuePageSource).toContain('.eq("ops_status", "scheduled")');
  });

  it("field My Work uses the scheduled/actionable contract and no unscheduled section", () => {
    expect(fieldQueueLibSource).toContain("isScheduledAssignedMyWorkEligible");
    expect(fieldQueueLibSource).toContain("isActiveFieldWorkStatus");
    expect(opsFieldPageSource).toContain("All caught up");
    expect(opsFieldPageSource).not.toContain('key: "unscheduled"');
    expect(opsFieldPageSource).not.toContain('title: "Unscheduled"');
  });
});
