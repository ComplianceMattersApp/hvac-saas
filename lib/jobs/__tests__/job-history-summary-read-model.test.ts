import { describe, expect, it } from "vitest";

import {
  buildJobHistorySummary,
  type BuildJobHistorySummaryInput,
} from "@/lib/jobs/job-history-summary-read-model";

function makeInput(overrides?: Partial<BuildJobHistorySummaryInput>): BuildJobHistorySummaryInput {
  const baseJob: BuildJobHistorySummaryInput["job"] = {
    id: "job-1",
    status: "open",
    ops_status: "need_to_schedule",
    field_complete: false,
    scheduled_date: null,
    window_start: null,
    window_end: null,
    parent_job_id: null,
    pending_info_reason: null,
    on_hold_reason: null,
  };

  return {
    job: {
      ...baseJob,
      ...(overrides?.job ?? {}),
    },
    events: overrides?.events ?? [],
    linkedJobs: overrides?.linkedJobs ?? [],
  };
}

describe("buildJobHistorySummary", () => {
  it("A) summarizes currently scheduled jobs", () => {
    const summary = buildJobHistorySummary(
      makeInput({
        job: {
          id: "job-1",
          status: "open",
          ops_status: "scheduled",
          field_complete: false,
          scheduled_date: "2026-06-15",
          window_start: "09:00",
          window_end: "11:00",
        },
      }),
    );

    expect(summary.headline).toBe("Scheduled");
    expect(summary.currentState).toBe("scheduled");
    expect(summary.story).toContain("Currently scheduled for 2026-06-15 09:00-11:00.");
    expect(summary.nextAction).toBe("Execute scheduled field work and capture field notes.");
    expect(summary.gaps).not.toContain("missing_schedule_change_event");
  });

  it("B) summarizes reschedule details from normalized scheduling metadata", () => {
    const summary = buildJobHistorySummary(
      makeInput({
        job: {
          id: "job-1",
          status: "open",
          ops_status: "scheduled",
          field_complete: false,
          scheduled_date: "2026-06-18",
          window_start: "10:00",
          window_end: "12:00",
        },
        events: [
          {
            event_type: "schedule_updated",
            created_at: "2026-06-14T16:00:00.000Z",
            meta: {
              timeline_v: 1,
              event_family: "scheduling",
              actor_user_id: "user-1",
              previous: {
                scheduled_date: "2026-06-15",
                window_start: "09:00",
                window_end: "11:00",
              },
              next: {
                scheduled_date: "2026-06-18",
                window_start: "10:00",
                window_end: "12:00",
              },
            },
          },
        ],
      }),
    );

    expect(summary.headline).toBe("Scheduled");
    expect(summary.story).toContain("Rescheduled from 2026-06-15 09:00-11:00 to 2026-06-18 10:00-12:00.");
    expect(summary.confidence).toBe("high");
    expect(summary.gaps).not.toContain("missing_actor");
  });

  it("C) summarizes on-hold status with normalized reason", () => {
    const summary = buildJobHistorySummary(
      makeInput({
        job: {
          id: "job-1",
          status: "open",
          ops_status: "on_hold",
          field_complete: false,
          scheduled_date: null,
          window_start: null,
          window_end: null,
          on_hold_reason: null,
        },
        events: [
          {
            event_type: "ops_update",
            created_at: "2026-06-14T10:00:00.000Z",
            meta: {
              timeline_v: 1,
              event_family: "ops_blocker",
              actor_user_id: "ops-1",
              reason: "Awaiting permit clarification",
              next: { ops_status: "on_hold" },
            },
          },
        ],
      }),
    );

    expect(summary.headline).toBe("On hold");
    expect(summary.story).toContain("Job is on hold: Awaiting permit clarification.");
    expect(summary.nextAction).toBe("Release hold and update schedule when ready.");
  });

  it("D) summarizes pending-info state and context", () => {
    const summary = buildJobHistorySummary(
      makeInput({
        job: {
          id: "job-1",
          status: "open",
          ops_status: "pending_info",
          field_complete: false,
          scheduled_date: null,
          window_start: null,
          window_end: null,
          pending_info_reason: "Need test document",
        },
        events: [
          {
            event_type: "ops_update",
            created_at: "2026-06-13T10:00:00.000Z",
            meta: {
              timeline_v: 1,
              event_family: "ops_blocker",
              actor_user_id: "ops-1",
              blocker_context: {
                pending_reason: "Need test document",
              },
            },
          },
        ],
      }),
    );

    expect(summary.headline).toBe("Waiting on information");
    expect(summary.story).toContain("Job is waiting on info: Need test document.");
    expect(summary.nextAction).toBe("Collect missing information and clear pending-info blocker.");
  });

  it("E) summarizes field-complete but closeout/invoice work still open", () => {
    const summary = buildJobHistorySummary(
      makeInput({
        job: {
          id: "job-1",
          status: "completed",
          ops_status: "invoice_required",
          field_complete: true,
          scheduled_date: "2026-06-10",
          window_start: "08:00",
          window_end: "10:00",
        },
      }),
    );

    expect(summary.headline).toBe("Invoice follow-up needed");
    expect(summary.story).toContain("Field work is complete, but closeout steps are still open.");
    expect(summary.story).toContain("Invoice follow-up is still required.");
    expect(summary.story[0]).toBe("Field work is complete, but closeout steps are still open.");
    expect(summary.story[1]).toBe("Invoice follow-up is still required.");
    expect(summary.story[2]).toBe("Currently scheduled for 2026-06-10 08:00-10:00.");
    expect(summary.nextAction).toBe("Complete invoice follow-up to finish closeout.");
  });

  it("F) summarizes failed state without inferring pass", () => {
    const summary = buildJobHistorySummary(
      makeInput({
        job: {
          id: "job-1",
          status: "failed",
          ops_status: "failed",
          field_complete: true,
          scheduled_date: null,
          window_start: null,
          window_end: null,
        },
      }),
    );

    expect(summary.headline).toBe("Correction or retest needed");
    expect(summary.story).toContain("Job is in failed/exception state and needs correction or retest attention.");
    expect(summary.story.join(" ").toLowerCase()).not.toContain("passed");
    expect(summary.story.join(" ").toLowerCase()).not.toContain("closed/completed");
    expect(summary.nextAction).toBe("Review failure details and schedule correction or retest steps.");
  });

  it("G) summarizes retest linkage and linked child completion safely", () => {
    const summary = buildJobHistorySummary(
      makeInput({
        events: [
          {
            event_type: "retest_created",
            created_at: "2026-06-11T09:00:00.000Z",
            meta: {
              child_job_id: "job-2",
            },
          },
        ],
        linkedJobs: [
          {
            id: "job-2",
            status: "completed",
            ops_status: "closed",
            parent_job_id: "job-1",
          },
        ],
      }),
    );

    expect(summary.headline).toBe("Needs scheduling");
    expect(summary.story).toContain("A linked retest/follow-up job exists.");
    expect(summary.story).toContain("A linked retest/follow-up job is complete.");
    expect(summary.story.join(" ")).not.toContain("job-2");
    expect(summary.facts).toContainEqual({
      code: "linked_retest_closed",
      value: "job-2",
      source: "linked_job",
    });
    expect(summary.story.join(" ").toLowerCase()).not.toContain("parent passed");
  });

  it("H) handles sparse legacy state safely with lower confidence and gaps", () => {
    const summary = buildJobHistorySummary(
      makeInput({
        job: {
          id: "job-1",
          status: "open",
          ops_status: "on_hold",
          field_complete: false,
          scheduled_date: "2026-06-20",
          window_start: null,
          window_end: null,
          on_hold_reason: null,
        },
        events: [],
      }),
    );

    expect(summary.headline).toBe("On hold");
    expect(summary.confidence).toBe("low");
    expect(summary.gaps).toContain("missing_hold_reason");
    expect(summary.gaps).toContain("missing_schedule_change_event");
  });

  it("I) remains backward compatible when events lack timeline_v", () => {
    const summary = buildJobHistorySummary(
      makeInput({
        job: {
          id: "job-1",
          status: "open",
          ops_status: "scheduled",
          field_complete: false,
          scheduled_date: "2026-06-21",
          window_start: "09:00",
          window_end: "11:00",
        },
        events: [
          {
            event_type: "schedule_updated",
            created_at: "2026-06-14T16:00:00.000Z",
            meta: {
              before: {
                scheduled_date: "2026-06-19",
                window_start: "09:00",
                window_end: "11:00",
              },
              after: {
                scheduled_date: "2026-06-21",
                window_start: "09:00",
                window_end: "11:00",
              },
            },
          },
        ],
      }),
    );

    expect(summary.headline).toBe("Scheduled");
    expect(summary.story).toContain("Rescheduled from 2026-06-19 09:00-11:00 to 2026-06-21 09:00-11:00.");
    expect(summary.confidence).toBe("medium");
  });
});