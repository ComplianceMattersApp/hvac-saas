import { describe, expect, it } from "vitest";
import {
  hasActiveFollowUpReminder,
  resolvePrimaryOpsQueue,
} from "@/lib/ops/queue-membership";
import { isInCloseoutQueue } from "@/lib/utils/closeout";
import { resolveOpsStatus } from "@/lib/utils/ops-status";

describe("primary operations queue matrix", () => {
  it("gives exceptions and waiting precedence over reminder metadata", () => {
    expect(resolvePrimaryOpsQueue({
      status: "completed",
      ops_status: "pending_office_review",
      follow_up_date: "2026-08-15",
    })).toBe("exceptions");

    expect(resolvePrimaryOpsQueue({
      status: "completed",
      ops_status: "on_hold",
      next_action_note: "Call customer",
    })).toBe("waiting");
  });

  it("routes reminders to Follow Ups and removes them from Needs Scheduling", () => {
    const job = {
      status: "open",
      ops_status: "need_to_schedule",
      follow_up_date: "2026-08-15",
    };

    expect(hasActiveFollowUpReminder(job)).toBe(true);
    expect(resolvePrimaryOpsQueue(job)).toBe("follow_ups");
  });

  it("keeps terminal work out of every primary queue despite stale reminders", () => {
    expect(resolvePrimaryOpsQueue({
      status: "completed",
      ops_status: "closed",
      follow_up_date: "2026-08-15",
      next_action_note: "Legacy reminder",
    })).toBeNull();

    expect(resolvePrimaryOpsQueue({
      status: "cancelled",
      ops_status: "follow_up",
      action_required_by: "customer",
    })).toBeNull();
  });

  it("lets invoice work overlap a primary queue, then removes only Closeout", () => {
    const heldJob = {
      status: "completed",
      field_complete: true,
      job_type: "service",
      ops_status: "on_hold",
      invoice_complete: false,
    };

    expect(resolvePrimaryOpsQueue(heldJob)).toBe("waiting");
    expect(isInCloseoutQueue(heldJob)).toBe(true);
    expect(isInCloseoutQueue({ ...heldJob, invoice_complete: true })).toBe(false);
    expect(resolvePrimaryOpsQueue({
      status: heldJob.status,
      ops_status: heldJob.ops_status,
    })).toBe("waiting");
  });

  it("protects primary responsibility while lifecycle closeout is recomputed", () => {
    expect(resolveOpsStatus({
      status: "completed",
      job_type: "service",
      field_complete: true,
      invoice_complete: true,
      current_ops_status: "follow_up",
    })).toBe("follow_up");

    expect(resolveOpsStatus({
      status: "completed",
      job_type: "ecc",
      field_complete: true,
      certs_complete: true,
      invoice_complete: true,
      current_ops_status: "pending_office_review",
    })).toBe("pending_office_review");
  });
});
