import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  EXCEPTION_QUEUE_STATUSES,
  WAITING_QUEUE_STATUSES,
  buildExceptionQueueRows,
  buildWaitingQueueRows,
  buildWithoutTechQueueRows,
  getExceptionQueueDisplayLabel,
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
    expect(getExceptionQueueDisplayLabel({ ops_status: "failed" })).toBe("Failed Test");
    expect(getExceptionQueueDisplayLabel({ ops_status: "retest_needed" })).toBe("Retest Needed");
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
    expect(waitingQueuePageSource).toContain("Next step:");
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
  });

  it("field My Work uses the scheduled/actionable contract and no unscheduled section", () => {
    expect(opsFieldPageSource).toContain("isScheduledAssignedMyWorkEligible");
    expect(opsFieldPageSource).toContain("isActiveFieldWorkStatus");
    expect(opsFieldPageSource).toContain("Unscheduled work is managed by dispatch");
    expect(opsFieldPageSource).not.toContain('key: "unscheduled"');
    expect(opsFieldPageSource).not.toContain('title: "Unscheduled"');
  });
});
