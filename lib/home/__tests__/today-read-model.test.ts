import { describe, expect, it } from "vitest";

import {
  buildPriorityChips,
  canViewBusinessPulseForRole,
  selectNextBestAction,
  type TodayJobSummary,
} from "@/lib/home/today-read-model";

const baseCounts = {
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

describe("selectNextBestAction", () => {
  it("tech: prefers in-progress job over scheduled", () => {
    const result = selectNextBestAction({
      role: "tech",
      productMode: "hvac_service",
      todayJobs: [
        job({ id: "scheduled", status: "scheduled" }),
        job({ id: "live", status: "in_process", title: "Live Visit" }),
      ],
      priorityCounts: baseCounts,
      openInvoiceCount: 0,
      servicePlansOverdue: 0,
    });
    expect(result.kind).toBe("tech_next_job");
    expect(result.job?.id).toBe("live");
    expect(result.primaryHref).toBe("/jobs/live?tab=ops");
  });

  it("tech: returns empty action when no assigned jobs", () => {
    const result = selectNextBestAction({
      role: "tech",
      productMode: "hvac_service",
      todayJobs: [],
      priorityCounts: baseCounts,
      openInvoiceCount: 0,
      servicePlansOverdue: 0,
    });
    expect(result.kind).toBe("empty");
    expect(result.primaryHref).toBe("/ops/field");
  });

  it("office: surfaces unscheduled work before exceptions", () => {
    const result = selectNextBestAction({
      role: "office",
      productMode: "hybrid",
      todayJobs: [],
      priorityCounts: { ...baseCounts, needScheduling: 4, failed: 2 },
      openInvoiceCount: 0,
      servicePlansOverdue: 0,
    });
    expect(result.kind).toBe("dispatcher_schedule");
    expect(result.headline).toContain("4 jobs need scheduling");
  });

  it("office: falls through to compliance exceptions in non-hvac_service modes", () => {
    const result = selectNextBestAction({
      role: "office",
      productMode: "ecc_hers",
      todayJobs: [],
      priorityCounts: { ...baseCounts, failed: 1 },
      openInvoiceCount: 0,
      servicePlansOverdue: 0,
    });
    expect(result.kind).toBe("compliance_exception");
  });

  it("billing: prioritizes open invoices", () => {
    const result = selectNextBestAction({
      role: "billing",
      productMode: "hybrid",
      todayJobs: [],
      priorityCounts: baseCounts,
      openInvoiceCount: 7,
      servicePlansOverdue: 0,
    });
    expect(result.kind).toBe("billing_money_stuck");
    expect(result.headline).toContain("7 open invoices");
  });

  it("admin (ecc_hers): prioritizes failed compliance jobs over invoices", () => {
    const result = selectNextBestAction({
      role: "admin",
      productMode: "ecc_hers",
      todayJobs: [],
      priorityCounts: { ...baseCounts, failed: 2 },
      openInvoiceCount: 1,
      servicePlansOverdue: 0,
    });
    expect(result.kind).toBe("compliance_exception");
  });

  it("admin (hvac_service): surfaces service plan overdue when nothing else stuck", () => {
    const result = selectNextBestAction({
      role: "admin",
      productMode: "hvac_service",
      todayJobs: [],
      priorityCounts: baseCounts,
      openInvoiceCount: 0,
      servicePlansOverdue: 3,
    });
    expect(result.kind).toBe("service_plan_due");
  });

  it("admin: calm fallback when nothing urgent", () => {
    const result = selectNextBestAction({
      role: "admin",
      productMode: "hybrid",
      todayJobs: [],
      priorityCounts: baseCounts,
      openInvoiceCount: 0,
      servicePlansOverdue: 0,
    });
    expect(result.kind).toBe("empty");
    expect(result.primaryHref).toBe("/ops");
  });
});

describe("buildPriorityChips", () => {
  it("hides zero-count chips and respects business pulse gating", () => {
    const chips = buildPriorityChips({
      productMode: "hybrid",
      role: "tech",
      priorityCounts: { ...baseCounts, needScheduling: 2, failed: 1 },
      servicePlansOverdue: 1,
      openInvoiceCount: 4,
      canViewBusinessPulse: false,
    });

    const keys = chips.map((c) => c.key);
    expect(keys).toContain("need_scheduling");
    expect(keys).toContain("exceptions");
    expect(keys).toContain("service_plans_due");
    expect(keys).not.toContain("open_invoices");
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
  });
});
