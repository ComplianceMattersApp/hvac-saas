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

  it("groups future-dated jobs as upcoming in chronological order", () => {
    const jobs = [
      { id: "later", status: "scheduled", scheduled_date: "2026-07-10" },
      { id: "sooner", status: "scheduled", scheduled_date: "2026-07-06" },
    ];

    const grouped = groupFieldJobs(jobs, TODAY);
    expect(grouped.upcoming.map((j) => j.id)).toEqual(["sooner", "later"]);
  });

  it("excludes completed/closed/cancelled lifecycle and field-complete jobs", () => {
    const jobs = [
      { id: "completed", status: "completed", scheduled_date: TODAY },
      { id: "closed", status: "closed", scheduled_date: TODAY },
      { id: "cancelled", status: "cancelled", scheduled_date: TODAY },
      { id: "field-complete", status: "scheduled", scheduled_date: TODAY, field_complete: true },
      { id: "visible", status: "scheduled", scheduled_date: TODAY },
    ];

    const grouped = groupFieldJobs(jobs, TODAY);
    expect(grouped.today.map((j) => j.id)).toEqual(["visible"]);
  });

  it("excludes unscheduled jobs that aren't already active field work", () => {
    const jobs = [{ id: "unscheduled", status: "scheduled", scheduled_date: null }];

    const grouped = groupFieldJobs(jobs, TODAY);
    expect(grouped).toEqual({ inProgress: [], today: [], overdue: [], upcoming: [] });
  });
});
