import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/staffing/human-layer", () => ({
  getActiveJobAssignmentDisplayMap: vi.fn(async () => ({})),
}));

vi.mock("@/lib/reports/kpi-foundation", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/reports/kpi-foundation")>();
  return {
    ...original,
    getKpiRange: vi.fn(() => ({ startMs: 0, endMs: Date.now() + 1e10 })),
    incrementBucketValue: vi.fn(),
    initializeBucketRows: vi.fn(() => []),
    formatMetricValue: vi.fn((value: number) => String(value)),
  };
});

import { buildContinuityKpiReadModel } from "@/lib/reports/continuity-kpis";
import { listServiceCaseContinuityRows } from "@/lib/reports/service-case-continuity";

const ACCOUNT_OWNER = "owner-1";
const CUSTOMER_ID = "customer-1";

type MockJob = {
  id: string;
  contractor_id: string | null;
  customer_id: string | null;
  service_case_id: string | null;
  status: string | null;
  ops_status: string | null;
  created_at: string | null;
  scheduled_date: string | null;
  title?: string | null;
  service_visit_reason?: string | null;
  contractors?: { name?: string | null } | null;
  deleted_at?: string | null;
};

type MockServiceCase = {
  id: string;
  customer_id: string | null;
  location_id: string | null;
  problem_summary: string | null;
  case_kind: string | null;
  status: string | null;
  created_at: string | null;
  resolved_at: string | null;
  resolved_by_job_id: string | null;
};

function makeSupabaseMock(input: {
  customerOwner?: Record<string, string>;
  jobs: MockJob[];
  serviceCases: MockServiceCase[];
}) {
  const customerOwner = input.customerOwner ?? { [CUSTOMER_ID]: ACCOUNT_OWNER };

  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const inFilters: Array<[string, string[]]> = [];

      const exec = () => {
        let rows: any[] = [];

        if (table === "service_cases") {
          rows = [...input.serviceCases];
        } else if (table === "jobs") {
          rows = [...input.jobs];
        } else if (table === "customers") {
          rows = Object.entries(customerOwner).map(([id, owner_user_id]) => ({
            id,
            owner_user_id,
            full_name: `Customer ${id}`,
            first_name: "Customer",
            last_name: id,
            deleted_at: null,
          }));
        } else if (table === "locations") {
          rows = [];
        } else if (table === "job_assignments") {
          rows = [];
        }

        for (const [column, value] of filters) {
          rows = rows.filter((row) => row[column] === value);
        }

        for (const [column, values] of inFilters) {
          rows = rows.filter((row) => values.includes(String(row[column] ?? "")));
        }

        return { data: rows, error: null, count: rows.length };
      };

      const build = (): any => ({
        select: () => build(),
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return build();
        },
        in: (column: string, values: string[]) => {
          inFilters.push([column, values]);
          return build();
        },
        is: () => build(),
        not: () => build(),
        order: () => build(),
        limit: () => build(),
        gte: () => build(),
        lt: () => build(),
        maybeSingle: async () => exec(),
        then: (resolve: any, reject?: any) => Promise.resolve(exec()).then(resolve, reject),
      });

      return build();
    },
    auth: { getUser: vi.fn() },
  };
}

const DEFAULT_FILTERS = {
  caseStatus: "open",
  caseKind: "",
  contractorId: "",
  dateField: "created" as const,
  fromDate: "",
  toDate: "",
  repeatOnly: false,
  activeRepeatOnly: false,
  sort: "created_desc" as const,
};

function makeServiceCase(id: string, status: "open" | "resolved" = "open"): MockServiceCase {
  return {
    id,
    customer_id: CUSTOMER_ID,
    location_id: null,
    problem_summary: `Problem ${id}`,
    case_kind: "reactive",
    status,
    created_at: "2026-01-10T10:00:00Z",
    resolved_at: status === "resolved" ? "2026-01-12T10:00:00Z" : null,
    resolved_by_job_id: status === "resolved" ? `job-${id}` : null,
  };
}

function makeJob(input: {
  id: string;
  serviceCaseId: string;
  status?: string;
  opsStatus: string;
  createdAt?: string;
  title?: string | null;
  serviceVisitReason?: string | null;
  scheduledDate?: string | null;
}): MockJob {
  return {
    id: input.id,
    contractor_id: "contractor-1",
    customer_id: CUSTOMER_ID,
    service_case_id: input.serviceCaseId,
    status: input.status ?? "open",
    ops_status: input.opsStatus,
    created_at: input.createdAt ?? "2026-01-11T10:00:00Z",
    scheduled_date: input.scheduledDate ?? null,
    title: input.title === undefined ? `Job ${input.id}` : input.title,
    service_visit_reason: input.serviceVisitReason ?? null,
    contractors: { name: "Contractor 1" },
    deleted_at: null,
  };
}

describe("service case open continuity reporting", () => {
  it("excludes a service case with zero linked visits from case_status=open", async () => {
    const supabase = makeSupabaseMock({
      serviceCases: [makeServiceCase("case-empty")],
      jobs: [],
    });

    const result = await listServiceCaseContinuityRows({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      filters: DEFAULT_FILTERS,
      internalBusinessDisplayName: "Compliance Matters",
    });

    expect(result.rows).toHaveLength(0);
  });

  it("excludes a stored-open case with only closed linked jobs from case_status=open", async () => {
    const supabase = makeSupabaseMock({
      serviceCases: [makeServiceCase("case-closed")],
      jobs: [makeJob({ id: "job-closed", serviceCaseId: "case-closed", opsStatus: "closed" })],
    });

    const result = await listServiceCaseContinuityRows({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      filters: DEFAULT_FILTERS,
      internalBusinessDisplayName: "Compliance Matters",
    });

    expect(result.rows).toHaveLength(0);
  });

  it("excludes a single ordinary need-to-schedule visit from case_status=open", async () => {
    const supabase = makeSupabaseMock({
      serviceCases: [makeServiceCase("case-active")],
      jobs: [makeJob({ id: "job-active", serviceCaseId: "case-active", opsStatus: "need_to_schedule" })],
    });

    const result = await listServiceCaseContinuityRows({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      filters: DEFAULT_FILTERS,
      internalBusinessDisplayName: "Compliance Matters",
    });

    expect(result.rows).toHaveLength(0);
  });

  it("excludes a single ordinary scheduled visit from case_status=open", async () => {
    const supabase = makeSupabaseMock({
      serviceCases: [makeServiceCase("case-scheduled")],
      jobs: [makeJob({ id: "job-scheduled", serviceCaseId: "case-scheduled", opsStatus: "scheduled" })],
    });

    const result = await listServiceCaseContinuityRows({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      filters: DEFAULT_FILTERS,
      internalBusinessDisplayName: "Compliance Matters",
    });

    expect(result.rows).toHaveLength(0);
  });

  it("keeps a single failed or pending-office-review case included", async () => {
    const serviceCases = [makeServiceCase("case-failed"), makeServiceCase("case-review")];
    const jobs = [
      makeJob({ id: "job-failed", serviceCaseId: "case-failed", opsStatus: "failed" }),
      makeJob({ id: "job-review", serviceCaseId: "case-review", opsStatus: "pending_office_review" }),
    ];
    const supabase = makeSupabaseMock({ serviceCases, jobs });

    const result = await listServiceCaseContinuityRows({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      filters: DEFAULT_FILTERS,
      internalBusinessDisplayName: "Compliance Matters",
    });

    expect(result.rows.map((row) => row.serviceCaseId).sort()).toEqual(["case-failed", "case-review"]);
  });

  it("keeps a multi-visit chain with any active linked visit included", async () => {
    const supabase = makeSupabaseMock({
      serviceCases: [makeServiceCase("case-multi-active")],
      jobs: [
        makeJob({ id: "job-multi-active-a", serviceCaseId: "case-multi-active", opsStatus: "closed", createdAt: "2026-01-11T10:00:00Z" }),
        makeJob({ id: "job-multi-active-b", serviceCaseId: "case-multi-active", opsStatus: "invoice_required", createdAt: "2026-01-12T10:00:00Z" }),
      ],
    });

    const result = await listServiceCaseContinuityRows({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      filters: DEFAULT_FILTERS,
      internalBusinessDisplayName: "Compliance Matters",
    });

    expect(result.rows.map((row) => row.serviceCaseId)).toEqual(["case-multi-active"]);
    expect(result.rows[0]?.visitCount).toBe(2);
    expect(result.rows[0]?.activeLinkedVisitCount).toBe(1);
  });

  it("excludes a fully closed multi-visit chain", async () => {
    const supabase = makeSupabaseMock({
      serviceCases: [makeServiceCase("case-multi-closed")],
      jobs: [
        makeJob({ id: "job-multi-closed-a", serviceCaseId: "case-multi-closed", opsStatus: "closed", createdAt: "2026-01-11T10:00:00Z" }),
        makeJob({ id: "job-multi-closed-b", serviceCaseId: "case-multi-closed", opsStatus: "closed", createdAt: "2026-01-12T10:00:00Z" }),
      ],
    });

    const result = await listServiceCaseContinuityRows({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      filters: DEFAULT_FILTERS,
      internalBusinessDisplayName: "Compliance Matters",
    });

    expect(result.rows).toHaveLength(0);
  });

  it("uses the same refined continuity-open rule for the KPI and report", async () => {
    const supabase = makeSupabaseMock({
      serviceCases: [
        makeServiceCase("case-empty"),
        makeServiceCase("case-scheduled"),
        makeServiceCase("case-failed"),
        makeServiceCase("case-multi-active"),
        makeServiceCase("case-multi-closed"),
      ],
      jobs: [
        makeJob({ id: "job-scheduled", serviceCaseId: "case-scheduled", opsStatus: "scheduled" }),
        makeJob({ id: "job-failed", serviceCaseId: "case-failed", opsStatus: "failed" }),
        makeJob({ id: "job-multi-active-a", serviceCaseId: "case-multi-active", opsStatus: "closed", createdAt: "2026-01-11T10:00:00Z" }),
        makeJob({ id: "job-multi-active-b", serviceCaseId: "case-multi-active", opsStatus: "pending_info", createdAt: "2026-01-12T10:00:00Z" }),
        makeJob({ id: "job-multi-closed-a", serviceCaseId: "case-multi-closed", opsStatus: "closed", createdAt: "2026-01-11T10:00:00Z" }),
        makeJob({ id: "job-multi-closed-b", serviceCaseId: "case-multi-closed", opsStatus: "closed", createdAt: "2026-01-12T10:00:00Z" }),
      ],
    });

    const [report, kpi] = await Promise.all([
      listServiceCaseContinuityRows({
        supabase,
        accountOwnerUserId: ACCOUNT_OWNER,
        filters: DEFAULT_FILTERS,
        internalBusinessDisplayName: "Compliance Matters",
      }),
      buildContinuityKpiReadModel({
        supabase,
        accountOwnerUserId: ACCOUNT_OWNER,
        filters: { fromDate: "", toDate: "", granularity: "monthly" },
        buckets: [],
      }),
    ]);

    expect(report.rows.map((row) => row.serviceCaseId).sort()).toEqual(["case-failed", "case-multi-active"]);
    expect(kpi.metrics.find((metric) => metric.key === "open_service_cases")?.currentValue).toBe("2");
  });

  it("multiple-visits filter includes historical closed multi-visit chains", async () => {
    const supabase = makeSupabaseMock({
      serviceCases: [
        makeServiceCase("case-multi-closed"),
        makeServiceCase("case-single-active"),
      ],
      jobs: [
        makeJob({ id: "job-multi-closed-a", serviceCaseId: "case-multi-closed", opsStatus: "closed", createdAt: "2026-01-11T10:00:00Z" }),
        makeJob({ id: "job-multi-closed-b", serviceCaseId: "case-multi-closed", opsStatus: "closed", createdAt: "2026-01-12T10:00:00Z" }),
        makeJob({ id: "job-single-active", serviceCaseId: "case-single-active", opsStatus: "scheduled", createdAt: "2026-01-12T10:00:00Z" }),
      ],
    });

    const result = await listServiceCaseContinuityRows({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      filters: {
        ...DEFAULT_FILTERS,
        caseStatus: "",
        repeatOnly: true,
      },
      internalBusinessDisplayName: "Compliance Matters",
    });

    expect(result.rows.map((row) => row.serviceCaseId)).toEqual(["case-multi-closed"]);
    expect(result.rows[0]?.activeLinkedVisitCount).toBe(0);
  });

  it("active-repeat report mode and KPI both count only multi-visit cases with active linked work", async () => {
    const supabase = makeSupabaseMock({
      serviceCases: [
        makeServiceCase("case-multi-closed"),
        makeServiceCase("case-multi-active"),
        makeServiceCase("case-single-active"),
      ],
      jobs: [
        makeJob({ id: "job-multi-closed-a", serviceCaseId: "case-multi-closed", opsStatus: "closed", createdAt: "2026-01-11T10:00:00Z" }),
        makeJob({ id: "job-multi-closed-b", serviceCaseId: "case-multi-closed", opsStatus: "closed", createdAt: "2026-01-12T10:00:00Z" }),
        makeJob({ id: "job-multi-active-a", serviceCaseId: "case-multi-active", opsStatus: "closed", createdAt: "2026-01-11T10:00:00Z" }),
        makeJob({ id: "job-multi-active-b", serviceCaseId: "case-multi-active", opsStatus: "pending_info", createdAt: "2026-01-12T10:00:00Z" }),
        makeJob({ id: "job-single-active", serviceCaseId: "case-single-active", opsStatus: "scheduled", createdAt: "2026-01-12T10:00:00Z" }),
      ],
    });

    const [reportRows, continuityKpi] = await Promise.all([
      listServiceCaseContinuityRows({
        supabase,
        accountOwnerUserId: ACCOUNT_OWNER,
        filters: {
          ...DEFAULT_FILTERS,
          caseStatus: "",
          repeatOnly: true,
          activeRepeatOnly: true,
        },
        internalBusinessDisplayName: "Compliance Matters",
      }),
      buildContinuityKpiReadModel({
        supabase,
        accountOwnerUserId: ACCOUNT_OWNER,
        filters: { fromDate: "", toDate: "", granularity: "monthly" },
        buckets: [],
      }),
    ]);

    expect(reportRows.rows.map((row) => row.serviceCaseId)).toEqual(["case-multi-active"]);
    expect(continuityKpi.metrics.find((metric) => metric.key === "repeat_visit_cases")?.currentValue).toBe("1");
  });

  it("includes latest visit title in row output and keeps case summary separate", async () => {
    const supabase = makeSupabaseMock({
      serviceCases: [
        {
          ...makeServiceCase("case-latest-title"),
          problem_summary: "ECC alteration — Stockton",
        },
      ],
      jobs: [
        makeJob({
          id: "job-old",
          serviceCaseId: "case-latest-title",
          opsStatus: "closed",
          createdAt: "2026-01-10T10:00:00Z",
          title: "Initial diagnosis",
        }),
        makeJob({
          id: "job-new",
          serviceCaseId: "case-latest-title",
          opsStatus: "scheduled",
          createdAt: "2026-01-12T10:00:00Z",
          scheduledDate: "2026-01-15",
          title: "Follow-up: Follow up Smoke Test",
          serviceVisitReason: "Follow up Smoke Test",
        }),
      ],
    });

    const result = await listServiceCaseContinuityRows({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      filters: {
        ...DEFAULT_FILTERS,
        caseStatus: "",
        repeatOnly: true,
        activeRepeatOnly: true,
      },
      internalBusinessDisplayName: "Compliance Matters",
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.problemSummary).toBe("ECC alteration — Stockton");
    expect(result.rows[0]?.latestVisitLabel).toBe("Follow-up: Follow up Smoke Test");
    expect(result.rows[0]?.latestVisitOrdinal).toBe(2);
    expect(result.rows[0]?.latestVisitDisplayTitle).toBe("Follow up Smoke Test");
    expect(result.rows[0]?.latestVisitDisplayTitle).not.toMatch(/^Visit\s+\d+\s*-/i);
    expect(result.rows[0]?.latestVisitKindLabel).toBe("Follow-up");
    expect(result.rows[0]?.latestVisitDateDisplay).toBe("Scheduled: 01-15-2026");
    expect(result.rows[0]?.activeLinkedVisitCount).toBe(1);
    expect(result.rows[0]?.visitCount).toBe(2);
  });

  it("falls back to latest service_visit_reason when latest title is missing", async () => {
    const supabase = makeSupabaseMock({
      serviceCases: [makeServiceCase("case-latest-reason")],
      jobs: [
        makeJob({
          id: "job-old",
          serviceCaseId: "case-latest-reason",
          opsStatus: "closed",
          createdAt: "2026-01-10T10:00:00Z",
          title: "Legacy visit",
        }),
        makeJob({
          id: "job-new",
          serviceCaseId: "case-latest-reason",
          opsStatus: "need_to_schedule",
          createdAt: "2026-01-13T10:00:00Z",
          title: null,
          serviceVisitReason: "Follow up Smoke Test",
        }),
      ],
    });

    const result = await listServiceCaseContinuityRows({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      filters: {
        ...DEFAULT_FILTERS,
        caseStatus: "",
        repeatOnly: true,
        activeRepeatOnly: true,
      },
      internalBusinessDisplayName: "Compliance Matters",
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.latestVisitLabel).toBe("Follow up Smoke Test");
    expect(result.rows[0]?.latestVisitDisplayTitle).toBe("Follow up Smoke Test");
    expect(result.rows[0]?.latestVisitDisplayTitle).not.toMatch(/^Visit\s+\d+\s*-/i);
    expect(result.rows[0]?.latestVisitKindLabel).toBeNull();
    expect(result.rows[0]?.latestVisitDateDisplay).toBe("Created: 01-13-2026");
    expect(result.rows[0]?.visitCount).toBe(2);
  });

  it("cleans duplicate retest prefixes while preserving retest meaning", async () => {
    const supabase = makeSupabaseMock({
      serviceCases: [makeServiceCase("case-retest")],
      jobs: [
        makeJob({
          id: "job-old",
          serviceCaseId: "case-retest",
          opsStatus: "closed",
          createdAt: "2026-01-10T10:00:00Z",
          title: "Initial visit",
        }),
        makeJob({
          id: "job-new",
          serviceCaseId: "case-retest",
          opsStatus: "scheduled",
          createdAt: "2026-01-13T10:00:00Z",
          title: "Retest - Retest - ECC alteration - Stockton",
        }),
      ],
    });

    const result = await listServiceCaseContinuityRows({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      filters: {
        ...DEFAULT_FILTERS,
        caseStatus: "",
        repeatOnly: true,
        activeRepeatOnly: true,
      },
      internalBusinessDisplayName: "Compliance Matters",
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.latestVisitDisplayTitle).toBe("ECC alteration - Stockton");
    expect(result.rows[0]?.latestVisitDisplayTitle).not.toMatch(/^Visit\s+\d+\s*-/i);
    expect(result.rows[0]?.latestVisitKindLabel).toBe("Retest");
    expect(result.rows[0]?.latestVisitOrdinal).toBe(2);
  });

  it("computes latest visit ordinal by created_at ascending order", async () => {
    const supabase = makeSupabaseMock({
      serviceCases: [makeServiceCase("case-ordinal")],
      jobs: [
        makeJob({
          id: "job-1",
          serviceCaseId: "case-ordinal",
          opsStatus: "closed",
          createdAt: "2026-01-10T10:00:00Z",
          title: "Visit one",
        }),
        makeJob({
          id: "job-2",
          serviceCaseId: "case-ordinal",
          opsStatus: "closed",
          createdAt: "2026-01-11T10:00:00Z",
          title: "Visit two",
        }),
        makeJob({
          id: "job-3",
          serviceCaseId: "case-ordinal",
          opsStatus: "scheduled",
          createdAt: "2026-01-12T10:00:00Z",
          title: "Visit three",
        }),
      ],
    });

    const result = await listServiceCaseContinuityRows({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      filters: {
        ...DEFAULT_FILTERS,
        caseStatus: "",
        repeatOnly: true,
        activeRepeatOnly: true,
      },
      internalBusinessDisplayName: "Compliance Matters",
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.latestVisitOrdinal).toBe(3);
    expect(result.rows[0]?.latestVisitDisplayTitle).toBe("Visit three");
  });
});