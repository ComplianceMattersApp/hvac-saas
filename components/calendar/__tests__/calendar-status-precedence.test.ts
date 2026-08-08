import { describe, expect, it } from "vitest";
import { getCalendarDisplayStatus } from "@/components/calendar/calendar-status";

// A paused job keeps the field status it stopped at, so every case here pairs a
// lingering on_the_way/in_process with the ops_status that actually applies. The
// calendar used to rank the field status higher and reported "On My Way" over jobs
// that were on hold, failed or closed.
const job = (status: string, ops_status: string, extra: Record<string, unknown> = {}) =>
  ({ id: "job-1", status, ops_status, scheduled_date: "2026-08-07", ...extra }) as any;

describe("getCalendarDisplayStatus", () => {
  it("reports the blocker over a lingering field status", () => {
    expect(getCalendarDisplayStatus(job("on_the_way", "on_hold"))).toBe("on_hold");
    expect(getCalendarDisplayStatus(job("in_process", "pending_info"))).toBe("pending_info");
    expect(getCalendarDisplayStatus(job("on_the_way", "failed"))).toBe("failed");
    expect(getCalendarDisplayStatus(job("in_process", "retest_needed"))).toBe("retest_needed");
  });

  it("reports a closed job as closed, not en route", () => {
    expect(getCalendarDisplayStatus(job("on_the_way", "closed"))).toBe("closed");
    expect(getCalendarDisplayStatus(job("completed", "closed"))).toBe("closed");
  });

  it("still shows live field work when nothing is blocking it", () => {
    expect(getCalendarDisplayStatus(job("on_the_way", "scheduled"))).toBe("on_my_way");
    expect(getCalendarDisplayStatus(job("in_process", "scheduled"))).toBe("in_process");
  });

  it("keeps cancelled ahead of everything else", () => {
    expect(getCalendarDisplayStatus(job("cancelled", "scheduled"))).toBe("cancelled");
    expect(getCalendarDisplayStatus(job("cancelled", "on_hold"))).toBe("cancelled");
  });

  it("distinguishes pending info from on hold, which the legend shows separately", () => {
    expect(getCalendarDisplayStatus(job("scheduled", "pending_info"))).toBe("pending_info");
    expect(getCalendarDisplayStatus(job("scheduled", "on_hold"))).toBe("on_hold");
  });

  it("maps closeout blockers to their own legend entries", () => {
    expect(getCalendarDisplayStatus(job("completed", "invoice_required"))).toBe("invoice_required");
    expect(getCalendarDisplayStatus(job("completed", "paperwork_required"))).toBe("paperwork_required");
  });

  it("falls back to scheduled for an unremarkable scheduled job", () => {
    expect(getCalendarDisplayStatus(job("scheduled", "scheduled"))).toBe("scheduled");
    expect(getCalendarDisplayStatus(job("", "", { scheduled_date: null }))).toBe("need_to_schedule");
  });
});
