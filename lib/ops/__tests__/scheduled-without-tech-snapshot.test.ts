import { describe, expect, it } from "vitest";

import { buildScheduledWithoutTechSnapshot } from "@/lib/ops/scheduled-without-tech-snapshot";

describe("buildScheduledWithoutTechSnapshot", () => {
  it("includes scheduled open job with no assigned tech", () => {
    const result = buildScheduledWithoutTechSnapshot({
      jobs: [
        {
          id: "job-1",
          ops_status: "scheduled",
          status: "open",
          scheduled_date: "2026-05-20",
          window_start: "09:00:00",
        },
      ],
      assignmentDisplayMap: {},
    });

    expect(result.count).toBe(1);
    expect(result.preview.map((job) => job.id)).toEqual(["job-1"]);
  });

  it("excludes scheduled open job with primary assigned tech", () => {
    const result = buildScheduledWithoutTechSnapshot({
      jobs: [
        {
          id: "job-1",
          ops_status: "scheduled",
          status: "open",
          scheduled_date: "2026-05-20",
          window_start: "09:00:00",
        },
      ],
      assignmentDisplayMap: {
        "job-1": [{ is_primary: true }],
      },
    });

    expect(result.count).toBe(0);
    expect(result.preview).toEqual([]);
  });

  it("excludes unscheduled jobs", () => {
    const result = buildScheduledWithoutTechSnapshot({
      jobs: [
        {
          id: "job-1",
          ops_status: "need_to_schedule",
          status: "open",
          scheduled_date: "2026-05-20",
          window_start: "09:00:00",
        },
      ],
      assignmentDisplayMap: {},
    });

    expect(result.count).toBe(0);
    expect(result.preview).toEqual([]);
  });

  it("treats jobs with assignments but no primary tech as scheduled without tech", () => {
    const result = buildScheduledWithoutTechSnapshot({
      jobs: [
        {
          id: "job-1",
          ops_status: "scheduled",
          status: "open",
          scheduled_date: "2026-05-20",
          window_start: "09:00:00",
        },
      ],
      assignmentDisplayMap: {
        "job-1": [{ is_primary: false }],
      },
    });

    expect(result.count).toBe(1);
    expect(result.preview.map((job) => job.id)).toEqual(["job-1"]);
  });

  it("applies account scope when provided", () => {
    const result = buildScheduledWithoutTechSnapshot({
      jobs: [
        {
          id: "job-1",
          account_owner_user_id: "owner-a",
          ops_status: "scheduled",
          status: "open",
          scheduled_date: "2026-05-20",
          window_start: "09:00:00",
        },
        {
          id: "job-2",
          account_owner_user_id: "owner-b",
          ops_status: "scheduled",
          status: "open",
          scheduled_date: "2026-05-21",
          window_start: "10:00:00",
        },
      ],
      assignmentDisplayMap: {},
      accountOwnerUserId: "owner-a",
    });

    expect(result.count).toBe(1);
    expect(result.preview.map((job) => job.id)).toEqual(["job-1"]);
  });
});
