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
}): MockJob {
  return {
    id: input.id,
    contractor_id: "contractor-1",
    customer_id: CUSTOMER_ID,
    service_case_id: input.serviceCaseId,
    status: input.status ?? "open",
    ops_status: input.opsStatus,
    created_at: input.createdAt ?? "2026-01-11T10:00:00Z",
    scheduled_date: null,
    title: `Job ${input.id}`,
    contractors: { name: "Contractor 1" },
    deleted_at: null,
  };
}

describe("service case effective-open reporting", () => {
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

  it("keeps a stored-open case with any active linked job in case_status=open", async () => {
    const supabase = makeSupabaseMock({
      serviceCases: [makeServiceCase("case-active")],
      jobs: [makeJob({ id: "job-active", serviceCaseId: "case-active", opsStatus: "scheduled" })],
    });

    const result = await listServiceCaseContinuityRows({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      filters: DEFAULT_FILTERS,
      internalBusinessDisplayName: "Compliance Matters",
    });

    expect(result.rows.map((row) => row.serviceCaseId)).toEqual(["case-active"]);
    expect(result.rows[0]?.activeLinkedVisitCount).toBe(1);
  });

  it("uses the same effective-open rule for the continuity KPI count", async () => {
    const supabase = makeSupabaseMock({
      serviceCases: [
        makeServiceCase("case-stale-open", "open"),
        makeServiceCase("case-live-open", "open"),
        makeServiceCase("case-stale-resolved", "resolved"),
      ],
      jobs: [
        makeJob({ id: "job-closed", serviceCaseId: "case-stale-open", opsStatus: "closed" }),
        makeJob({ id: "job-scheduled", serviceCaseId: "case-live-open", opsStatus: "scheduled" }),
        makeJob({ id: "job-failed", serviceCaseId: "case-stale-resolved", opsStatus: "failed" }),
      ],
    });

    const result = await buildContinuityKpiReadModel({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      filters: { fromDate: "", toDate: "", granularity: "monthly" },
      buckets: [],
    });

    expect(result.metrics.find((metric) => metric.key === "open_service_cases")?.currentValue).toBe("2");
  });

  it("keeps failed, retest, pending-office-review, paperwork-required, and invoice-required linked cases open", async () => {
    const serviceCases = [
      makeServiceCase("case-failed"),
      makeServiceCase("case-retest"),
      makeServiceCase("case-review"),
      makeServiceCase("case-paperwork"),
      makeServiceCase("case-invoice"),
    ];
    const jobs = [
      makeJob({ id: "job-failed", serviceCaseId: "case-failed", opsStatus: "failed" }),
      makeJob({ id: "job-retest", serviceCaseId: "case-retest", opsStatus: "retest_needed" }),
      makeJob({ id: "job-review", serviceCaseId: "case-review", opsStatus: "pending_office_review" }),
      makeJob({ id: "job-paperwork", serviceCaseId: "case-paperwork", opsStatus: "paperwork_required" }),
      makeJob({ id: "job-invoice", serviceCaseId: "case-invoice", opsStatus: "invoice_required" }),
    ];
    const supabase = makeSupabaseMock({ serviceCases, jobs });

    const result = await listServiceCaseContinuityRows({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      filters: DEFAULT_FILTERS,
      internalBusinessDisplayName: "Compliance Matters",
    });

    expect(result.rows.map((row) => row.serviceCaseId).sort()).toEqual(serviceCases.map((serviceCase) => serviceCase.id).sort());
  });

  it("handles single-visit and multi-visit cases correctly", async () => {
    const supabase = makeSupabaseMock({
      serviceCases: [
        makeServiceCase("case-single-closed"),
        makeServiceCase("case-single-active"),
        makeServiceCase("case-multi-closed"),
        makeServiceCase("case-multi-active"),
      ],
      jobs: [
        makeJob({ id: "job-single-closed", serviceCaseId: "case-single-closed", opsStatus: "closed", createdAt: "2026-01-11T10:00:00Z" }),
        makeJob({ id: "job-single-active", serviceCaseId: "case-single-active", opsStatus: "need_to_schedule", createdAt: "2026-01-11T10:00:00Z" }),
        makeJob({ id: "job-multi-closed-a", serviceCaseId: "case-multi-closed", opsStatus: "closed", createdAt: "2026-01-11T10:00:00Z" }),
        makeJob({ id: "job-multi-closed-b", serviceCaseId: "case-multi-closed", opsStatus: "closed", createdAt: "2026-01-12T10:00:00Z" }),
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

    expect(result.rows.map((row) => row.serviceCaseId).sort()).toEqual([
      "case-multi-active",
      "case-single-active",
    ]);
    expect(result.rows.find((row) => row.serviceCaseId === "case-single-active")?.visitCount).toBe(1);
    expect(result.rows.find((row) => row.serviceCaseId === "case-multi-active")?.visitCount).toBe(2);
  });
});