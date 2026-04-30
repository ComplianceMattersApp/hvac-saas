import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/reports/report-account-scope", () => ({
  accountScopeInList: (ids: string[]) => ids,
  resolveReportAccountContractorIds: vi.fn(async () => ["contractor-1"]),
}));

vi.mock("@/lib/reports/report-center-kpis", () => ({
  listReportCenterKpiFamilies: vi.fn(async () => [
    {
      familyKey: "operational",
      familyLabel: "Operational KPIs",
      familyDescription: "",
      sourceSummary: "",
      metrics: [
        { key: "active_open_visits", currentValue: "0" },
        { key: "need_to_schedule_backlog", currentValue: "0" },
        { key: "closeout_backlog", currentValue: "0" },
        { key: "visits_completed", currentValue: "0" },
        { key: "closeout_aging_7_plus_days", currentValue: "0" },
        { key: "paperwork_required_backlog", currentValue: "0" },
        { key: "invoice_required_backlog", currentValue: "0" },
      ],
      bucketColumns: [],
      bucketRows: [],
    },
    {
      familyKey: "continuity",
      familyLabel: "Continuity KPIs",
      familyDescription: "",
      sourceSummary: "",
      metrics: [
        { key: "open_service_cases", currentValue: "0" },
        { key: "repeat_visit_cases", currentValue: "1" },
        { key: "cases_resolved", currentValue: "0" },
        { key: "cases_created", currentValue: "0" },
      ],
      bucketColumns: [],
      bucketRows: [],
    },
  ]),
}));

vi.mock("@/lib/business/job-billing-state", () => ({
  buildBillingTruthCloseoutProjectionMap: vi.fn(async () => ({ projectionsByJobId: new Map() })),
}));

vi.mock("@/lib/staffing/human-layer", () => ({
  getActiveJobAssignmentDisplayMap: vi.fn(async () => ({})),
}));

vi.mock("@/lib/reports/kpi-foundation", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/reports/kpi-foundation")>();
  return {
    ...original,
    getKpiRange: vi.fn(() => ({ startMs: 0, endMs: Date.now() + 1e10 })),
  };
});

import { buildReportCenterDashboardReadModel } from "@/lib/reports/report-center-dashboard";

function makeSupabaseMock() {
  return {
    from(table: string) {
      const build = (): any => ({
        select: () => build(),
        is: () => build(),
        in: () => build(),
        eq: () => build(),
        then: (resolve: any, reject?: any) => {
          const data = table === "jobs" || table === "internal_invoices" ? [] : [];
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      });
      return build();
    },
  };
}

describe("report-center dashboard active repeat visits link", () => {
  it("points Active Repeat Visits cards to active multi-visit report state", async () => {
    const result = await buildReportCenterDashboardReadModel({
      supabase: makeSupabaseMock(),
      accountOwnerUserId: "owner-1",
      filters: { fromDate: "", toDate: "", granularity: "monthly" },
    });

    const topCard = result.topCards.find((card) => card.label === "Active Repeat Visits");
    const continuityCard = result.continuity.cards.find((card) => card.label === "Active Repeat Visits");

    expect(topCard?.href).toBe("/reports/service-cases?repeat_only=1&active_repeat_visits=1");
    expect(continuityCard?.href).toBe("/reports/service-cases?repeat_only=1&active_repeat_visits=1");
  });
});
