import { describe, expect, it } from "vitest";

import { groupFieldJobs } from "@/lib/ops/field-queue";

const TODAY = "2026-07-05";

describe("groupFieldJobs", () => {
  it("returns empty groups for an empty job list", () => {
    expect(groupFieldJobs([], TODAY)).toEqual({
      inProgress: [],
      today: [],
      overdue: [],
      upcoming: [],
      completed: [],
    });
  });

  it("puts jobs with an active field-work status in progress regardless of date", () => {
    const jobs = [
      { id: "a", status: "on_the_way", scheduled_date: "2026-07-01" },
      { id: "b", status: "in_process", scheduled_date: TODAY },
    ];

    const grouped = groupFieldJobs(jobs, TODAY);
    expect(grouped.inProgress.map((j) => j.id)).toEqual(["a", "b"]);
    expect(grouped.today).toEqual([]);
    expect(grouped.overdue).toEqual([]);
  });

  it("groups jobs scheduled for today (that aren't already in progress)", () => {
    const jobs = [
      { id: "a", status: "scheduled", scheduled_date: TODAY },
      { id: "b", status: "scheduled", scheduled_date: "2026-07-06" },
    ];

    const grouped = groupFieldJobs(jobs, TODAY);
    expect(grouped.today.map((j) => j.id)).toEqual(["a"]);
    expect(grouped.upcoming.map((j) => j.id)).toEqual(["b"]);
  });

  it("groups past-dated jobs as overdue, most recently overdue first", () => {
    const jobs = [
      { id: "oldest", status: "scheduled", scheduled_date: "2026-07-01" },
      { id: "most-recent", status: "scheduled", scheduled_date: "2026-07-04" },
      { id: "middle", status: "scheduled", scheduled_date: "2026-07-02" },
    ];

    const grouped = groupFieldJobs(jobs, TODAY);
    expect(grouped.overdue.map((j) => j.id)).toEqual(["most-recent", "middle", "oldest"]);
  });

  it.each(["pending_info", "on_hold", "waiting"])(
    "routes past-scheduled %s work out of My Work",
    (opsStatus) => {
      const grouped = groupFieldJobs([
        {
          id: opsStatus,
          status: "open",
          ops_status: opsStatus,
          scheduled_date: "2026-07-04",
          field_complete: false,
        },
      ], TODAY);

      expect(grouped.overdue).toEqual([]);
      expect(grouped.today).toEqual([]);
      expect(grouped.upcoming).toEqual([]);
    },
  );

  it.each(["failed", "retest_needed", "pending_office_review", "problem"])(
    "routes past-scheduled %s exceptions out of My Work",
    (opsStatus) => {
      const grouped = groupFieldJobs([
        {
          id: opsStatus,
          status: "open",
          ops_status: opsStatus,
          scheduled_date: "2026-07-04",
          field_complete: false,
        },
      ], TODAY);

      expect(grouped.overdue).toEqual([]);
    },
  );

  it("gives On Hold precedence over a stale in-process field status", () => {
    const grouped = groupFieldJobs([
      {
        id: "held-in-process",
        status: "in_process",
        ops_status: "on_hold",
        scheduled_date: "2026-07-04",
        field_complete: false,
      },
    ], TODAY);

    expect(grouped.inProgress).toEqual([]);
    expect(grouped.overdue).toEqual([]);
  });

  it("returns released scheduled work to My Work", () => {
    const grouped = groupFieldJobs([
      {
        id: "released",
        status: "open",
        ops_status: "scheduled",
        scheduled_date: TODAY,
        field_complete: false,
      },
    ], TODAY);

    expect(grouped.today.map((job) => job.id)).toEqual(["released"]);
  });

  it("keeps reminder-owned follow-up work out of My Work", () => {
    const grouped = groupFieldJobs([
      {
        id: "follow-up",
        status: "open",
        ops_status: "scheduled",
        scheduled_date: "2026-07-04",
        field_complete: false,
        follow_up_date: TODAY,
      },
    ], TODAY);

    expect(grouped.overdue).toEqual([]);
  });

  it("groups future-dated jobs as upcoming in chronological order", () => {
    const jobs = [
      { id: "later", status: "scheduled", scheduled_date: "2026-07-10" },
      { id: "sooner", status: "scheduled", scheduled_date: "2026-07-06" },
    ];

    const grouped = groupFieldJobs(jobs, TODAY);
    expect(grouped.upcoming.map((j) => j.id)).toEqual(["sooner", "later"]);
  });

  it("excludes lifecycle-complete and old or undated field-complete jobs from active work", () => {
    const jobs = [
      { id: "completed", status: "completed", scheduled_date: TODAY },
      { id: "closed", status: "closed", scheduled_date: TODAY },
      { id: "cancelled", status: "cancelled", scheduled_date: TODAY },
      { id: "field-complete", status: "scheduled", scheduled_date: TODAY, field_complete: true },
      { id: "visible", status: "scheduled", scheduled_date: TODAY },
    ];

    const grouped = groupFieldJobs(jobs, TODAY);
    expect(grouped.today.map((j) => j.id)).toEqual(["visible"]);
    expect(grouped.completed).toEqual([]);
  });

  it("shows only jobs field-completed today in Los Angeles, newest first", () => {
    const jobs = [
      {
        id: "today-earlier",
        status: "completed",
        scheduled_date: TODAY,
        field_complete: true,
        field_complete_at: "2026-07-05T15:00:00.000Z",
      },
      {
        id: "today-later",
        status: "completed",
        scheduled_date: TODAY,
        field_complete: true,
        field_complete_at: "2026-07-06T01:00:00.000Z",
      },
      {
        id: "yesterday-la",
        status: "completed",
        scheduled_date: TODAY,
        field_complete: true,
        field_complete_at: "2026-07-05T06:59:59.000Z",
      },
      {
        id: "timestamp-only",
        status: "completed",
        scheduled_date: TODAY,
        field_complete: false,
        field_complete_at: "2026-07-05T16:00:00.000Z",
      },
    ];

    const grouped = groupFieldJobs(jobs, TODAY);
    expect(grouped.completed.map((j) => j.id)).toEqual(["today-later", "today-earlier"]);
  });

  it("excludes unscheduled jobs that aren't already active field work", () => {
    const jobs = [{ id: "unscheduled", status: "scheduled", scheduled_date: null }];

    const grouped = groupFieldJobs(jobs, TODAY);
    expect(grouped).toEqual({ inProgress: [], today: [], overdue: [], upcoming: [], completed: [] });
  });
});
