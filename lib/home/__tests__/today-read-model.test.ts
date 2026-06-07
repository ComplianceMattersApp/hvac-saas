import { describe, expect, it } from "vitest";

import {
  buildTodayGreetingLine,
  buildDailyBriefing,
  buildFollowUpGroups,
  buildPriorityChips,
  buildTeamCoverageSnapshot,
  canViewBusinessPulseForRole,
  derivePreferredGreetingName,
  followUpReason,
  selectNextBestAction,
  type FollowUpItem,
  type TodayJobSummary,
} from "@/lib/home/today-read-model";

const baseCounts = {
  scheduledTodayWithoutTech: 0,
  needScheduling: 0,
  scheduledToday: 0,
  pendingInfo: 0,
  onHold: 0,
  failed: 0,
  closeoutReady: 0,
};

function job(overrides: Partial<TodayJobSummary> = {}): TodayJobSummary {
  return {
    id: "job-1",
    title: "Test Job",
    status: null,
    opsStatus: null,
    scheduledDate: null,
    windowStart: null,
    windowEnd: null,
    jobAddress: null,
    city: null,
    customerFirstName: null,
    customerLastName: null,
    customerPhone: null,
    fieldComplete: false,
    fieldCompleteAt: null,
    ...overrides,
  };
}

function nbaInput(overrides: Partial<Parameters<typeof selectNextBestAction>[0]> = {}) {
  return {
    role: "admin" as const,
    productMode: "hybrid" as const,
    todayJobs: [],
    priorityCounts: baseCounts,
    openInvoiceCount: 0,
    openInvoiceBalanceCents: 0,
    servicePlansOverdue: 0,
    resumeRecentCount: 0,
    ...overrides,
  };
}

describe("canViewBusinessPulseForRole", () => {
  it("permits admin and billing", () => {
    expect(canViewBusinessPulseForRole("admin")).toBe(true);
    expect(canViewBusinessPulseForRole("billing")).toBe(true);
  });

  it("denies office and tech", () => {
    expect(canViewBusinessPulseForRole("office")).toBe(false);
    expect(canViewBusinessPulseForRole("tech")).toBe(false);
  });
});

describe("today greeting helpers", () => {
  it("prefers metadata first_name for greeting", () => {
    expect(
      derivePreferredGreetingName({ user_metadata: { first_name: "Eddie", full_name: "Someone Else" } }),
    ).toBe("Eddie");
    expect(buildTodayGreetingLine({ user_metadata: { first_name: "Eddie" } })).toBe("Welcome back, Eddie.");
  });

  it("falls back to display/full/name token and then generic greeting", () => {
    expect(buildTodayGreetingLine({ user_metadata: { display_name: "Rory Williams" } })).toBe("Welcome back, Rory.");
    expect(buildTodayGreetingLine({ user_metadata: { full_name: "Amy Pond" } })).toBe("Welcome back, Amy.");
    expect(buildTodayGreetingLine({ user_metadata: { name: "Clara Oswald" } })).toBe("Welcome back, Clara.");
    expect(buildTodayGreetingLine({ user_metadata: {} })).toBe("Welcome back.");
  });
});

describe("selectNextBestAction", () => {
  it("tech: prefers in-progress job over scheduled", () => {
    const result = selectNextBestAction(nbaInput({
      role: "tech",
      productMode: "hvac_service",
      todayJobs: [
        job({ id: "scheduled", status: "scheduled" }),
        job({ id: "live", status: "in_process", title: "Live Visit" }),
      ],
    }));
    expect(result.kind).toBe("tech_next_job");
    expect(result.job?.id).toBe("live");
    expect(result.primaryHref).toBe("/jobs/live?tab=ops");
  });

  it("tech: returns empty action when no assigned jobs", () => {
    const result = selectNextBestAction(nbaInput({
      role: "tech",
      productMode: "hvac_service",
      todayJobs: [],
    }));
    expect(result.kind).toBe("empty");
    expect(result.primaryHref).toBe("/ops/field");
  });

  it("office: surfaces unscheduled work before non-urgent invoices", () => {
    const result = selectNextBestAction(nbaInput({
      role: "office",
      priorityCounts: { ...baseCounts, needScheduling: 4 },
      openInvoiceCount: 1,
      openInvoiceBalanceCents: 10000,
    }));
    expect(result.kind).toBe("dispatcher_schedule");
    expect(result.headline).toContain("4 jobs need scheduling");
    expect(result.primaryLabel).toBe("Open Scheduling Queue");
  });

  it("office: surfaces without-tech before need-to-schedule", () => {
    const result = selectNextBestAction(nbaInput({
      role: "office",
      priorityCounts: { ...baseCounts, scheduledTodayWithoutTech: 2, needScheduling: 8 },
    }));
    expect(result.kind).toBe("dispatcher_schedule");
    expect(result.headline).toContain("unassigned");
    expect(result.primaryLabel).toBe("Assign Technicians");
    expect(result.primaryHref).toBe("/ops/queues/without-tech");
  });

  it("office: critical exceptions outrank everything else", () => {
    const result = selectNextBestAction(nbaInput({
      role: "office",
      productMode: "ecc_hers",
      priorityCounts: { ...baseCounts, failed: 1, needScheduling: 8 },
      openInvoiceCount: 9,
    }));
    expect(result.kind).toBe("compliance_exception");
    expect(result.primaryHref).toBe("/ops/queues/exceptions");
  });

  it("billing: prioritizes open invoices", () => {
    const result = selectNextBestAction(nbaInput({
      role: "billing",
      openInvoiceCount: 7,
    }));
    expect(result.kind).toBe("billing_money_stuck");
    expect(result.headline).toContain("7 open invoices");
    expect(result.primaryLabel).toBe("Review Open Invoices");
  });

  it("admin: keeps scheduling ahead of a normal small open invoice", () => {
    const result = selectNextBestAction(nbaInput({
      role: "admin",
      priorityCounts: { ...baseCounts, needScheduling: 12, closeoutReady: 4 },
      openInvoiceCount: 1,
      openInvoiceBalanceCents: 12000,
    }));
    expect(result.kind).toBe("dispatcher_schedule");
    expect(result.primaryLabel).toBe("Open Scheduling Queue");
  });

  it("admin (ecc_hers): prioritizes failed compliance jobs over invoices", () => {
    const result = selectNextBestAction(nbaInput({
      productMode: "ecc_hers",
      priorityCounts: { ...baseCounts, failed: 2 },
      openInvoiceCount: 1,
    }));
    expect(result.kind).toBe("compliance_exception");
  });

  it("admin (hvac_service): surfaces service plan overdue when nothing else stuck", () => {
    const result = selectNextBestAction(nbaInput({
      role: "admin",
      productMode: "hvac_service",
      servicePlansOverdue: 3,
    }));
    expect(result.kind).toBe("service_plan_due");
    expect(result.primaryLabel).toBe("Review Service Plans");
  });

  it("admin: calm fallback when nothing urgent", () => {
    const result = selectNextBestAction(nbaInput({ role: "admin" }));
    expect(result.kind).toBe("empty");
    expect(result.primaryHref).toBe("/ops");
  });
});

describe("buildPriorityChips", () => {
  it("returns no queue chips for tech role", () => {
    const chips = buildPriorityChips({
      productMode: "hybrid",
      role: "tech",
      priorityCounts: { ...baseCounts, needScheduling: 2, failed: 1 },
      servicePlansOverdue: 1,
      openInvoiceCount: 4,
      canViewBusinessPulse: false,
    });
    expect(chips).toEqual([]);
  });

  it("exposes open invoices chip for admin/billing", () => {
    const chips = buildPriorityChips({
      productMode: "hybrid",
      role: "admin",
      priorityCounts: baseCounts,
      servicePlansOverdue: null,
      openInvoiceCount: 2,
      canViewBusinessPulse: true,
    });
    expect(chips.find((c) => c.key === "open_invoices")?.count).toBe(2);
  });

  it("suppresses need-scheduling chip when it is the primary action focus", () => {
    const chips = buildPriorityChips({
      productMode: "hybrid",
      role: "office",
      priorityCounts: { ...baseCounts, needScheduling: 12, closeoutReady: 2 },
      servicePlansOverdue: 0,
      openInvoiceCount: 1,
      canViewBusinessPulse: false,
      primaryFocusKey: "need_scheduling",
    });
    expect(chips.find((c) => c.key === "need_scheduling")).toBeUndefined();
    expect(chips.find((c) => c.key === "closeout")?.count).toBe(2);
  });

  it("suppresses open-invoices chip when billing action is primary", () => {
    const chips = buildPriorityChips({
      productMode: "hybrid",
      role: "billing",
      priorityCounts: baseCounts,
      servicePlansOverdue: 0,
      openInvoiceCount: 3,
      canViewBusinessPulse: true,
      primaryFocusKey: "open_invoices",
    });
    expect(chips.find((c) => c.key === "open_invoices")).toBeUndefined();
  });

  it("limits billing chips to billing-safe signals", () => {
    const chips = buildPriorityChips({
      productMode: "hybrid",
      role: "billing",
      priorityCounts: {
        ...baseCounts,
        needScheduling: 5,
        failed: 2,
        pendingInfo: 3,
        closeoutReady: 2,
      },
      servicePlansOverdue: 4,
      openInvoiceCount: 7,
      canViewBusinessPulse: true,
    });

    const keys = chips.map((c) => c.key);
    expect(keys).toContain("open_invoices");
    expect(keys).toContain("closeout");
    expect(keys).not.toContain("need_scheduling");
    expect(keys).not.toContain("exceptions");
    expect(keys).not.toContain("waiting");
    expect(keys).not.toContain("service_plans_due");
  });

  it("adds without-tech chip when scheduled coverage is missing", () => {
    const chips = buildPriorityChips({
      productMode: "hybrid",
      role: "admin",
      priorityCounts: { ...baseCounts, scheduledTodayWithoutTech: 3 },
      servicePlansOverdue: 0,
      openInvoiceCount: 0,
      canViewBusinessPulse: true,
    });
    const withoutTech = chips.find((c) => c.key === "without_tech");
    expect(withoutTech?.count).toBe(3);
    expect(withoutTech?.urgent).toBe(true);
    expect(withoutTech?.href).toBe("/ops/queues/without-tech");
  });

  it("flags exceptions chip as urgent", () => {
    const chips = buildPriorityChips({
      productMode: "hybrid",
      role: "office",
      priorityCounts: { ...baseCounts, failed: 1 },
      servicePlansOverdue: 0,
      openInvoiceCount: 0,
      canViewBusinessPulse: false,
    });
    const exceptions = chips.find((c) => c.key === "exceptions");
    expect(exceptions?.urgent).toBe(true);
    expect(exceptions?.tone).toBe("danger");
    expect(exceptions?.href).toBe("/ops/queues/exceptions");
  });

  it("maps waiting and on-hold chips to the waiting queue", () => {
    const chips = buildPriorityChips({
      productMode: "hybrid",
      role: "office",
      priorityCounts: { ...baseCounts, pendingInfo: 2, onHold: 1 },
      servicePlansOverdue: 0,
      openInvoiceCount: 0,
      canViewBusinessPulse: false,
    });
    expect(chips.find((c) => c.key === "waiting")?.href).toBe("/ops/queues/waiting");
    expect(chips.find((c) => c.key === "on_hold")?.href).toBe("/ops/queues/waiting");
  });
});

describe("followUpReason", () => {
  const today = "2026-03-15";

  it("returns a reason for each stuck ops_status", () => {
    const cases: Array<[string, string]> = [
      ["need_to_schedule", "Needs scheduling"],
      ["pending_info", "Pending info"],
      ["on_hold", "On hold"],
      ["failed", "Failed — needs review"],
      ["retest_needed", "Retest needed"],
      ["pending_office_review", "Pending office review"],
      ["invoice_required", "Closeout — invoice required"],
      ["paperwork_required", "Closeout — paperwork required"],
    ];
    for (const [opsStatus, expected] of cases) {
      expect(
        followUpReason({
          opsStatus,
          scheduledDate: null,
          today,
          fieldComplete: false,
        }),
      ).toBe(expected);
    }
  });

  it("flags past-scheduled, not-completed jobs even when ops_status is benign", () => {
    expect(
      followUpReason({
        opsStatus: "scheduled",
        scheduledDate: "2026-03-10",
        today,
        fieldComplete: false,
      }),
    ).toBe("Past scheduled date — not completed");
  });

  it("ignores past-scheduled jobs that are field-complete", () => {
    expect(
      followUpReason({
        opsStatus: "scheduled",
        scheduledDate: "2026-03-10",
        today,
        fieldComplete: true,
      }),
    ).toBeNull();
  });

  it("ignores future-scheduled benign jobs", () => {
    expect(
      followUpReason({
        opsStatus: "scheduled",
        scheduledDate: "2026-03-20",
        today,
        fieldComplete: false,
      }),
    ).toBeNull();
  });

  it("ignores closed jobs scheduled in the past", () => {
    expect(
      followUpReason({
        opsStatus: "closed",
        scheduledDate: "2026-03-10",
        today,
        fieldComplete: false,
      }),
    ).toBeNull();
  });
});

describe("buildDailyBriefing", () => {
  it("summarizes scheduled, scheduling, and closeout in one line", () => {
    const text = buildDailyBriefing({
      role: "admin",
      todayJobsCount: 1,
      priorityCounts: {
        ...baseCounts,
        scheduledToday: 1,
        needScheduling: 12,
        closeoutReady: 4,
      },
      openInvoiceCount: 1,
      servicePlansOverdue: 0,
      followUpsCount: 2,
    });
    expect(text).toContain("1 scheduled visit");
    expect(text).toContain("12 waiting to be scheduled");
    expect(text).toContain("4 ready for closeout");
  });

  it("keeps technician briefing scoped to assigned route only", () => {
    const text = buildDailyBriefing({
      role: "tech",
      todayJobsCount: 2,
      priorityCounts: {
        ...baseCounts,
        scheduledToday: 2,
        pendingInfo: 8,
        needScheduling: 11,
      },
      openInvoiceCount: 5,
      servicePlansOverdue: 3,
      followUpsCount: 9,
    });

    expect(text).toContain("assigned route");
    expect(text).not.toContain("scheduled");
    expect(text).not.toContain("invoice");
  });

  it("keeps billing briefing focused on money/closeout", () => {
    const text = buildDailyBriefing({
      role: "billing",
      todayJobsCount: 0,
      priorityCounts: {
        ...baseCounts,
        needScheduling: 10,
        closeoutReady: 4,
      },
      openInvoiceCount: 3,
      servicePlansOverdue: 0,
      followUpsCount: 0,
    });

    expect(text).toContain("open invoice");
    expect(text).not.toContain("waiting to be scheduled");
  });
});

describe("buildFollowUpGroups", () => {
  it("groups follow-ups by concern and keeps count truth", () => {
    const followUps: FollowUpItem[] = [
      {
        key: "j1",
        title: "HVAC Replacement",
        reason: "Needs scheduling",
        concernKey: "scheduling",
        href: "/jobs/j1?tab=ops",
        scheduledDateDisplay: null,
      },
      {
        key: "j2",
        title: "Permit Packet",
        reason: "Closeout — paperwork required",
        concernKey: "closeout",
        href: "/jobs/j2?tab=ops",
        scheduledDateDisplay: null,
      },
    ];

    const groups = buildFollowUpGroups({
      role: "admin",
      followUps,
      priorityCounts: { ...baseCounts, needScheduling: 12, closeoutReady: 4 },
      servicePlansOverdue: 0,
      openInvoiceCount: 1,
      canViewBusinessPulse: true,
    });

    expect(groups.find((g) => g.key === "scheduling")?.count).toBe(12);
    expect(groups.find((g) => g.key === "scheduling")?.label).toBe("Needs Scheduling");
    expect(groups.find((g) => g.key === "closeout")?.count).toBe(4);
    expect(groups.find((g) => g.key === "closeout")?.label).toBe("Closeout & Review");
    expect(groups.find((g) => g.key === "payments")?.count).toBe(1);
    expect(groups.find((g) => g.key === "payments")?.label).toBe("Payment Follow-Up");
  });

  it("maps waiting, exceptions, and without-tech groups to focused queue routes", () => {
    const groups = buildFollowUpGroups({
      role: "admin",
      followUps: [
        {
          key: "j1",
          title: "Follow-up",
          reason: "Pending info",
          concernKey: "waiting",
          href: "/jobs/j1?tab=ops",
          scheduledDateDisplay: null,
        },
      ],
      priorityCounts: {
        ...baseCounts,
        pendingInfo: 2,
        failed: 1,
        scheduledTodayWithoutTech: 3,
      },
      servicePlansOverdue: 0,
      openInvoiceCount: 0,
      canViewBusinessPulse: false,
    });

    expect(groups.find((g) => g.key === "without_tech")?.href).toBe("/ops/queues/without-tech");
    expect(groups.find((g) => g.key === "waiting")?.href).toBe("/ops/queues/waiting");
    expect(groups.find((g) => g.key === "exceptions")?.href).toBe("/ops/queues/exceptions");
  });

  it("labels service plan group as follow-up", () => {
    const groups = buildFollowUpGroups({
      role: "admin",
      followUps: [],
      priorityCounts: baseCounts,
      servicePlansOverdue: 2,
      openInvoiceCount: 0,
      canViewBusinessPulse: true,
    });

    expect(groups.find((g) => g.key === "service_plans")?.label).toBe("Service Plan Follow-Up");
  });

  it("maps waiting, exceptions, and without-tech groups to focused queue routes", () => {
    const groups = buildFollowUpGroups({
      role: "admin",
      followUps: [
        {
          key: "j1",
          title: "Follow-up",
          reason: "Pending info",
          concernKey: "waiting",
          href: "/jobs/j1?tab=ops",
          scheduledDateDisplay: null,
        },
      ],
      priorityCounts: {
        ...baseCounts,
        pendingInfo: 2,
        failed: 1,
        scheduledTodayWithoutTech: 3,
      },
      servicePlansOverdue: 0,
      openInvoiceCount: 0,
      canViewBusinessPulse: false,
    });

    expect(groups.find((g) => g.key === "without_tech")?.href).toBe("/ops/queues/without-tech");
    expect(groups.find((g) => g.key === "waiting")?.href).toBe("/ops/queues/waiting");
    expect(groups.find((g) => g.key === "exceptions")?.href).toBe("/ops/queues/exceptions");
  });

  it("labels service plan group as follow-up", () => {
    const groups = buildFollowUpGroups({
      role: "admin",
      followUps: [],
      priorityCounts: baseCounts,
      servicePlansOverdue: 2,
      openInvoiceCount: 0,
      canViewBusinessPulse: true,
    });

    expect(groups.find((g) => g.key === "service_plans")?.count).toBe(2);
  });

  it("returns no company follow-up groups for tech role", () => {
    const groups = buildFollowUpGroups({
      role: "tech",
      followUps: [
        {
          key: "j1",
          title: "Follow-up",
          reason: "Needs scheduling",
          concernKey: "scheduling",
          href: "/jobs/j1?tab=ops",
          scheduledDateDisplay: null,
        },
      ],
      priorityCounts: { ...baseCounts, needScheduling: 9 },
      servicePlansOverdue: 1,
      openInvoiceCount: 3,
      canViewBusinessPulse: false,
    });

    expect(groups).toEqual([]);
  });

  it("limits billing follow-up groups to closeout/payments", () => {
    const groups = buildFollowUpGroups({
      role: "billing",
      followUps: [
        {
          key: "j1",
          title: "Follow-up",
          reason: "Pending info",
          concernKey: "waiting",
          href: "/jobs/j1?tab=ops",
          scheduledDateDisplay: null,
        },
      ],
      priorityCounts: {
        ...baseCounts,
        needScheduling: 5,
        pendingInfo: 1,
        closeoutReady: 2,
      },
      servicePlansOverdue: 2,
      openInvoiceCount: 3,
      canViewBusinessPulse: true,
    });

    const keys = groups.map((g) => g.key);
    expect(keys).toContain("closeout");
    expect(keys).toContain("payments");
    expect(keys).not.toContain("scheduling");
    expect(keys).not.toContain("waiting");
    expect(keys).not.toContain("service_plans");
  });
});

describe("buildTeamCoverageSnapshot", () => {
  it("shows assignment rows for admin and counts unassigned gaps", () => {
    const result = buildTeamCoverageSnapshot({
      role: "admin",
      todayScheduledJobs: [
        job({ id: "j1", title: "System Not Cooling", status: "scheduled", windowStart: "09:00:00" }),
        job({ id: "j2", title: "HVAC Replacement", status: "scheduled", windowStart: "11:00:00" }),
      ],
      assignmentDisplayMap: {
        j1: [
          {
            job_id: "j1",
            user_id: "u1",
            display_name: "Alex Tech",
            is_primary: true,
            created_at: "2026-05-25T10:00:00.000Z",
          },
        ],
      },
      maxRows: 5,
    });

    expect(result.visible).toBe(true);
    expect(result.assignments.length).toBe(1);
    expect(result.assignments[0].assigneeName).toBe("Alex Tech");
    expect(result.unassignedCount).toBe(1);
  });

  it("hides full team coverage for tech role", () => {
    const result = buildTeamCoverageSnapshot({
      role: "tech",
      todayScheduledJobs: [job({ id: "j1" })],
      assignmentDisplayMap: {
        j1: [
          {
            job_id: "j1",
            user_id: "u1",
            display_name: "Alex Tech",
            is_primary: true,
            created_at: "2026-05-25T10:00:00.000Z",
          },
        ],
      },
      maxRows: 5,
    });

    expect(result.visible).toBe(false);
    expect(result.assignments).toEqual([]);
  });

  it("returns assignment-needed empty state when only unassigned work exists", () => {
    const result = buildTeamCoverageSnapshot({
      role: "office",
      todayScheduledJobs: [job({ id: "j1", title: "Tune-up", status: "scheduled" })],
      assignmentDisplayMap: {},
      maxRows: 5,
    });

    expect(result.assignments.length).toBe(0);
    expect(result.unassignedCount).toBe(1);
    expect(result.emptyStateMessage).toBe("Scheduled work needs assignment.");
  });

  it("returns calm empty state only when no assigned or unassigned scheduled work exists", () => {
    const result = buildTeamCoverageSnapshot({
      role: "admin",
      todayScheduledJobs: [],
      assignmentDisplayMap: {},
      maxRows: 5,
    });

    expect(result.assignments.length).toBe(0);
    expect(result.unassignedCount).toBe(0);
    expect(result.emptyStateMessage).toBe("No assigned field work scheduled for today.");
  });
});
