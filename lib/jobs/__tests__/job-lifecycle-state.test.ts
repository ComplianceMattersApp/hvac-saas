import { describe, expect, it } from "vitest";
import {
  isJobLifecycleExceptionState,
  isTerminalJobLifecycleState,
  resolveJobLifecycleState,
} from "@/lib/jobs/job-lifecycle-state";

// A job keeps its appointment date forever, so hasScheduledAppointment stays true for
// the rest of its life. Every case below therefore sets it — that is precisely the
// condition under which the desktop pill used to claim SCHEDULED over the truth.
const SCHEDULED = { hasScheduledAppointment: true };

describe("resolveJobLifecycleState", () => {
  it("ranks a closed job above its lingering appointment", () => {
    expect(
      resolveJobLifecycleState({ status: "completed", opsStatus: "closed", ...SCHEDULED }),
    ).toBe("closed");
  });

  it("ranks cancelled and archived above scheduling", () => {
    expect(resolveJobLifecycleState({ status: "cancelled", ...SCHEDULED })).toBe("cancelled");
    expect(resolveJobLifecycleState({ opsStatus: "archived", ...SCHEDULED })).toBe("archived");
    expect(
      resolveJobLifecycleState({ status: "scheduled", deletedAt: "2026-08-01", ...SCHEDULED }),
    ).toBe("archived");
  });

  it.each([
    ["failed", "failed"],
    ["pending_office_review", "pending_office_review"],
    ["retest_needed", "retest_needed"],
    ["pending_info", "waiting"],
    ["on_hold", "waiting"],
    ["waiting", "waiting"],
    ["invoice_required", "invoice_required"],
    ["paperwork_required", "paperwork_required"],
  ])("ranks the %s exception above scheduling", (opsStatus, expected) => {
    expect(resolveJobLifecycleState({ status: "open", opsStatus, ...SCHEDULED })).toBe(expected);
  });

  it("ranks exceptions above an in-flight field status", () => {
    // A job on hold should not announce itself as in progress because a status field
    // was left behind.
    expect(
      resolveJobLifecycleState({ status: "in_process", opsStatus: "on_hold", ...SCHEDULED }),
    ).toBe("waiting");
    expect(
      resolveJobLifecycleState({ status: "on_the_way", opsStatus: "failed", ...SCHEDULED }),
    ).toBe("failed");
  });

  it("still reports live field work when nothing is blocking it", () => {
    expect(
      resolveJobLifecycleState({ status: "on_the_way", opsStatus: "scheduled", ...SCHEDULED }),
    ).toBe("on_the_way");
    expect(
      resolveJobLifecycleState({ status: "in_process", opsStatus: "scheduled", ...SCHEDULED }),
    ).toBe("in_process");
  });

  it("reports scheduling only once nothing more urgent applies", () => {
    expect(resolveJobLifecycleState({ status: "scheduled", ...SCHEDULED })).toBe("scheduled");
    expect(resolveJobLifecycleState({ opsStatus: "scheduled" })).toBe("scheduled");
    expect(resolveJobLifecycleState({ status: "open" })).toBe("needs_schedule");
    expect(resolveJobLifecycleState({ opsStatus: "need_to_schedule" })).toBe("needs_schedule");
    expect(resolveJobLifecycleState({})).toBe("needs_schedule");
  });

  it("treats a linked follow-up as superseding every other state", () => {
    expect(
      resolveJobLifecycleState({
        status: "in_process",
        opsStatus: "failed",
        isLinkedToActiveJob: true,
        ...SCHEDULED,
      }),
    ).toBe("linked_active");
  });

  it("normalizes casing and stray whitespace", () => {
    expect(resolveJobLifecycleState({ opsStatus: "  CLOSED " })).toBe("closed");
    expect(resolveJobLifecycleState({ status: " Cancelled " })).toBe("cancelled");
  });

  it("falls back to in-progress for an unrecognized status with no appointment", () => {
    expect(resolveJobLifecycleState({ status: "completed", opsStatus: "field_complete" })).toBe(
      "in_progress",
    );
  });
});

describe("state classification", () => {
  it("classifies states needing attention as exceptions", () => {
    for (const state of [
      "linked_active",
      "archived",
      "cancelled",
      "closed",
      "failed",
      "pending_office_review",
      "retest_needed",
      "waiting",
      "invoice_required",
      "paperwork_required",
    ] as const) {
      expect(isJobLifecycleExceptionState(state)).toBe(true);
    }
  });

  it("does not treat ordinary progress as an exception", () => {
    for (const state of [
      "on_the_way",
      "in_process",
      "scheduled",
      "needs_schedule",
      "in_progress",
    ] as const) {
      expect(isJobLifecycleExceptionState(state)).toBe(false);
    }
  });

  it("identifies terminal states", () => {
    expect(isTerminalJobLifecycleState("closed")).toBe(true);
    expect(isTerminalJobLifecycleState("cancelled")).toBe(true);
    expect(isTerminalJobLifecycleState("archived")).toBe(true);
    expect(isTerminalJobLifecycleState("waiting")).toBe(false);
    expect(isTerminalJobLifecycleState("scheduled")).toBe(false);
  });
});
