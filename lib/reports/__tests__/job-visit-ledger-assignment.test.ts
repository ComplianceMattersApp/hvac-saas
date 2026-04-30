/**
 * Focused tests for Jobs Report assignment filtering.
 *
 * Coverage:
 * 1. Assignment filter returns only jobs assigned to the selected user.
 * 2. A job with multiple assigned users is included when the selected user is one of them.
 * 3. Jobs assigned to a different user are excluded.
 * 4. "Unassigned" filter returns jobs with no active assignments.
 * 5. Jobs with an active assignment are excluded from the "Unassigned" filter.
 * 6. Closed visits (ops_status=closed) are excluded from the unassigned drilldown (scope=active default).
 * 7. Cancelled visits (status=cancelled) are excluded from the unassigned drilldown (scope=active default).
 * 8. Dashboard Unassigned Open Visits card href points to /reports/jobs?assignee=unassigned.
 * 9. Dashboard unassigned count definition matches the Jobs Report unassigned filter definition.
 * 10. Existing account-scope protections remain intact (assignment filter cannot expose cross-account jobs).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted by Vitest)
// ---------------------------------------------------------------------------

vi.mock("@/lib/reports/report-account-scope", () => ({
  accountScopeInList: (ids: string[]) => ids,
  resolveReportAccountContractorIds: vi.fn(async () => ["contractor-1"]),
}));

vi.mock("@/lib/staffing/human-layer", () => ({
  getActiveJobAssignmentDisplayMap: vi.fn(async () => ({})),
  getAssignableInternalUsers: vi.fn(async () => []),
}));

vi.mock("@/lib/utils/closeout", () => ({
  getCloseoutNeeds: vi.fn(() => ({ needsInvoice: false, needsPaperwork: false })),
  isInCloseoutQueue: vi.fn(() => false),
}));

vi.mock("@/lib/utils/job-title-display", () => ({
  normalizeRetestLinkedJobTitle: vi.fn((v: string) => v),
}));

vi.mock("@/lib/business/job-billing-state", () => ({
  buildBillingTruthCloseoutProjectionMap: vi.fn(async () => ({
    billingMode: "external_billing",
    projectionsByJobId: new Map(),
  })),
}));

vi.mock("@/lib/business/internal-business-profile", () => ({
  resolveBillingModeByAccountOwnerId: vi.fn(async () => "external_billing"),
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
        { key: "repeat_visit_cases", currentValue: "0" },
        { key: "cases_resolved", currentValue: "0" },
        { key: "cases_created", currentValue: "0" },
      ],
      bucketColumns: [],
      bucketRows: [],
    },
  ]),
}));

vi.mock("@/lib/reports/kpi-foundation", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/reports/kpi-foundation")>();
  return {
    ...original,
    getKpiRange: vi.fn(() => ({ startMs: 0, endMs: Date.now() + 1e10 })),
  };
});

// ---------------------------------------------------------------------------
// Static imports (after mocks)
// ---------------------------------------------------------------------------

import { resolveReportAccountContractorIds } from "@/lib/reports/report-account-scope";
import { getActiveJobAssignmentDisplayMap } from "@/lib/staffing/human-layer";
import {
  listJobVisitLedgerRows,
  parseJobVisitLedgerFilters,
  buildJobVisitLedgerSearchParams,
} from "@/lib/reports/job-visit-ledger";
import { buildReportCenterDashboardReadModel } from "@/lib/reports/report-center-dashboard";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_TERRY = "user-terry";
const USER_EDDIE = "user-eddie";
const CONTRACTOR_1 = "contractor-1";

const baseJob = (id: string, overrides?: Partial<typeof JOB_A>) => ({ ...JOB_A, id, ...overrides });

const JOB_A = {
  id: "job-a",
  contractor_id: CONTRACTOR_1,
  customer_id: "customer-1",
  status: "open",
  ops_status: "need_to_schedule",
  created_at: "2026-01-15T10:00:00Z",
  field_complete: false,
  field_complete_at: null as string | null,
  job_type: "service",
  invoice_complete: false,
  certs_complete: false,
  service_case_id: null as string | null,
  title: "Job A",
  visit_scope_summary: null as string | null,
  location_id: null as string | null,
  customer_first_name: "Jane",
  customer_last_name: "Doe",
  job_address: "1 Main St",
  city: "LA",
  contractors: { name: "Contractor 1" },
  scheduled_date: null as string | null,
};

const JOB_B = baseJob("job-b", { customer_first_name: "Bob", customer_last_name: "Smith" });
const JOB_C = baseJob("job-c", { customer_first_name: "Carol", customer_last_name: "King" });

const JOB_CLOSED = baseJob("job-closed", { ops_status: "closed" });
const JOB_CANCELLED = baseJob("job-cancelled", { status: "cancelled" });

type Assignment = { job_id: string; user_id: string; is_active: boolean };

// ---------------------------------------------------------------------------
// Supabase mock factory
// ---------------------------------------------------------------------------

/**
 * Builds a minimal supabase mock covering the tables used by
 * listJobVisitLedgerRows and buildReportCenterDashboardReadModel.
 *
 * - contractors: always returns CONTRACTOR_1 owned by "owner-1"
 * - job_assignments: filter-aware; honours is_active=true and optional user_id eq
 * - jobs: applies neq (scope), in (contractor/assignment), not-in (unassigned), eq filters
 * - customers/locations/internal_invoices: return empty
 */
function makeSupabaseMock(opts: { jobs: typeof JOB_A[]; assignments: Assignment[] }) {
  return {
    from(table: string) {
      const eqFilters: Array<{ col: string; val: unknown }> = [];
      const neqFilters: Array<{ col: string; val: unknown }> = [];
      const inFilters: Array<{ col: string; vals: string[] }> = [];
      const notInFilters: Array<{ col: string; vals: string[] }> = [];

      const build = (): any => ({
        select: () => build(),
        is: () => build(),
        eq: (col: string, val: unknown) => { eqFilters.push({ col, val }); return build(); },
        neq: (col: string, val: unknown) => { neqFilters.push({ col, val }); return build(); },
        in: (col: string, vals: string[]) => { inFilters.push({ col, vals }); return build(); },
        not: (col: string, operator: string, val: string) => {
          if (operator === "in") {
            const ids = val.replace(/^\(|\)$/g, "").split(",").map((s) => s.trim()).filter(Boolean);
            notInFilters.push({ col, vals: ids });
          }
          return build();
        },
        or: () => build(),
        order: () => build(),
        limit: () => build(),
        gte: () => build(),
        lt: () => build(),
        lte: () => build(),
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve: any, reject?: any) => {
          let rows: any[] = [];

          if (table === "contractors") {
            rows = [{ id: CONTRACTOR_1, owner_user_id: "owner-1", name: "Contractor 1" }];
          } else if (table === "job_assignments") {
            rows = opts.assignments.filter((a) => a.is_active);
            // Apply eq filters (e.g. user_id=X, is_active=true already applied above)
            for (const { col, val } of eqFilters) {
              if (col !== "is_active") rows = rows.filter((r) => (r as any)[col] === val);
            }
          } else if (table === "jobs") {
            rows = [...opts.jobs];
            // Apply scope (neq filters: status !== cancelled, ops_status !== closed)
            for (const { col, val } of neqFilters) {
              rows = rows.filter((r) => (r as any)[col] !== val);
            }
            // Apply in filters (contractor scope + include-mode assignment)
            for (const { col, vals } of inFilters) {
              rows = rows.filter((r) => vals.includes((r as any)[col]));
            }
            // Apply not-in filters (unassigned mode)
            for (const { col, vals } of notInFilters) {
              if (vals.length > 0) {
                rows = rows.filter((r) => !vals.includes((r as any)[col]));
              }
            }
          } else if (table === "customers") {
            rows = [{ id: "customer-1", full_name: "Jane Doe", first_name: "Jane", last_name: "Doe" }];
          } else if (table === "internal_invoices") {
            rows = [];
          }

          return Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve, reject);
        },
      });
      return build();
    },
  };
}

const DEFAULT_FILTERS = parseJobVisitLedgerFilters(new URLSearchParams());

// ---------------------------------------------------------------------------
// 1. Specific user filter returns only their assigned jobs
// ---------------------------------------------------------------------------

describe("Jobs Report — specific user assignment filter", () => {
  beforeEach(() => {
    vi.mocked(resolveReportAccountContractorIds).mockResolvedValue([CONTRACTOR_1]);
  });

  it("returns only jobs assigned to the selected user", async () => {
    const supabase = makeSupabaseMock({
      jobs: [JOB_A, JOB_B, JOB_C],
      assignments: [
        { job_id: "job-a", user_id: USER_TERRY, is_active: true },
        { job_id: "job-b", user_id: USER_EDDIE, is_active: true },
      ],
    });

    const result = await listJobVisitLedgerRows({
      supabase,
      accountOwnerUserId: "owner-1",
      filters: { ...DEFAULT_FILTERS, assigneeUserId: USER_TERRY, scope: "all" },
      internalBusinessDisplayName: "Test Biz",
    });

    const ids = result.rows.map((r) => r.jobId);
    expect(ids).toContain("job-a");
    expect(ids).not.toContain("job-b");
    expect(ids).not.toContain("job-c");
  });

  // 2. Multi-assigned job is included when the selected user is one of them
  it("includes a job with multiple assigned users when the selected user is one of them", async () => {
    const supabase = makeSupabaseMock({
      jobs: [JOB_A],
      assignments: [
        { job_id: "job-a", user_id: USER_TERRY, is_active: true },
        { job_id: "job-a", user_id: USER_EDDIE, is_active: true },
      ],
    });

    const result = await listJobVisitLedgerRows({
      supabase,
      accountOwnerUserId: "owner-1",
      filters: { ...DEFAULT_FILTERS, assigneeUserId: USER_TERRY, scope: "all" },
      internalBusinessDisplayName: "Test Biz",
    });

    expect(result.rows.map((r) => r.jobId)).toContain("job-a");
  });

  // 3. Jobs assigned to a different user are excluded
  it("excludes jobs assigned to a different user", async () => {
    const supabase = makeSupabaseMock({
      jobs: [JOB_A, JOB_B],
      assignments: [
        { job_id: "job-a", user_id: USER_TERRY, is_active: true },
        { job_id: "job-b", user_id: USER_EDDIE, is_active: true },
      ],
    });

    const result = await listJobVisitLedgerRows({
      supabase,
      accountOwnerUserId: "owner-1",
      filters: { ...DEFAULT_FILTERS, assigneeUserId: USER_EDDIE, scope: "all" },
      internalBusinessDisplayName: "Test Biz",
    });

    const ids = result.rows.map((r) => r.jobId);
    expect(ids).not.toContain("job-a");
    expect(ids).toContain("job-b");
  });
});

// ---------------------------------------------------------------------------
// 4–7. Unassigned filter
// ---------------------------------------------------------------------------

describe("Jobs Report — unassigned filter", () => {
  beforeEach(() => {
    vi.mocked(resolveReportAccountContractorIds).mockResolvedValue([CONTRACTOR_1]);
  });

  // 4. Unassigned filter returns jobs with no assignments
  it("returns jobs with no active assignments", async () => {
    const supabase = makeSupabaseMock({
      jobs: [JOB_A, JOB_B, JOB_C],
      assignments: [
        { job_id: "job-a", user_id: USER_TERRY, is_active: true },
      ],
    });

    const result = await listJobVisitLedgerRows({
      supabase,
      accountOwnerUserId: "owner-1",
      filters: { ...DEFAULT_FILTERS, assigneeUserId: "unassigned", scope: "all" },
      internalBusinessDisplayName: "Test Biz",
    });

    const ids = result.rows.map((r) => r.jobId);
    expect(ids).not.toContain("job-a"); // assigned
    expect(ids).toContain("job-b");
    expect(ids).toContain("job-c");
  });

  // 5. Assigned visits are excluded from unassigned filter
  it("excludes jobs that have any active assignment", async () => {
    const supabase = makeSupabaseMock({
      jobs: [JOB_A, JOB_B],
      assignments: [
        { job_id: "job-a", user_id: USER_TERRY, is_active: true },
        { job_id: "job-b", user_id: USER_EDDIE, is_active: true },
      ],
    });

    const result = await listJobVisitLedgerRows({
      supabase,
      accountOwnerUserId: "owner-1",
      filters: { ...DEFAULT_FILTERS, assigneeUserId: "unassigned", scope: "all" },
      internalBusinessDisplayName: "Test Biz",
    });

    expect(result.rows).toHaveLength(0);
  });

  // 6. Closed visits excluded from unassigned drilldown (scope=active default)
  it("excludes ops_status=closed visits when scope=active (default)", async () => {
    const supabase = makeSupabaseMock({
      jobs: [JOB_A, JOB_CLOSED],
      assignments: [],
    });

    const result = await listJobVisitLedgerRows({
      supabase,
      accountOwnerUserId: "owner-1",
      // scope defaults to "active" via parseJobVisitLedgerFilters
      filters: { ...DEFAULT_FILTERS, assigneeUserId: "unassigned" },
      internalBusinessDisplayName: "Test Biz",
    });

    const ids = result.rows.map((r) => r.jobId);
    expect(ids).toContain("job-a");
    expect(ids).not.toContain("job-closed");
  });

  // 7. Cancelled visits excluded from unassigned drilldown (scope=active default)
  it("excludes status=cancelled visits when scope=active (default)", async () => {
    const supabase = makeSupabaseMock({
      jobs: [JOB_A, JOB_CANCELLED],
      assignments: [],
    });

    const result = await listJobVisitLedgerRows({
      supabase,
      accountOwnerUserId: "owner-1",
      filters: { ...DEFAULT_FILTERS, assigneeUserId: "unassigned" },
      internalBusinessDisplayName: "Test Biz",
    });

    const ids = result.rows.map((r) => r.jobId);
    expect(ids).toContain("job-a");
    expect(ids).not.toContain("job-cancelled");
  });

  // Returns all unassigned when no assignments exist in the system
  it("returns all active jobs when no assignments exist at all", async () => {
    const supabase = makeSupabaseMock({
      jobs: [JOB_A, JOB_B],
      assignments: [],
    });

    const result = await listJobVisitLedgerRows({
      supabase,
      accountOwnerUserId: "owner-1",
      filters: { ...DEFAULT_FILTERS, assigneeUserId: "unassigned" },
      internalBusinessDisplayName: "Test Biz",
    });

    expect(result.rows.map((r) => r.jobId)).toContain("job-a");
    expect(result.rows.map((r) => r.jobId)).toContain("job-b");
  });
});

// ---------------------------------------------------------------------------
// 8. Dashboard card href
// ---------------------------------------------------------------------------

describe("Dashboard — Unassigned Open Visits card href", () => {
  it("points to /reports/jobs?assignee=unassigned", async () => {
    const supabase = makeSupabaseMock({ jobs: [], assignments: [] });

    const result = await buildReportCenterDashboardReadModel({
      supabase,
      accountOwnerUserId: "owner-1",
      filters: { fromDate: "", toDate: "", granularity: "monthly" },
    });

    const card = result.operations.cards.find((c: any) =>
      (c.label as string).toLowerCase().includes("unassigned"),
    );

    if (!card) throw new Error("Unassigned Open Visits card not found in operations section");
    expect(card.href).toBe("/reports/jobs?assignee=unassigned");
  });

  it("card label is 'Unassigned Open Visits'", async () => {
    const supabase = makeSupabaseMock({ jobs: [], assignments: [] });

    const result = await buildReportCenterDashboardReadModel({
      supabase,
      accountOwnerUserId: "owner-1",
      filters: { fromDate: "", toDate: "", granularity: "monthly" },
    });

    const card = result.operations.cards.find((c: any) =>
      (c.label as string).toLowerCase().includes("unassigned"),
    );

    expect(card?.label).toBe("Unassigned Open Visits");
  });

  it("card helperText matches spec", async () => {
    const supabase = makeSupabaseMock({ jobs: [], assignments: [] });

    const result = await buildReportCenterDashboardReadModel({
      supabase,
      accountOwnerUserId: "owner-1",
      filters: { fromDate: "", toDate: "", granularity: "monthly" },
    });

    const card = result.operations.cards.find((c: any) =>
      (c.label as string).toLowerCase().includes("unassigned"),
    );

    expect(card?.helperText).toBe("Active visits with no assigned team member.");
  });
});

// ---------------------------------------------------------------------------
// 9. Dashboard count definition matches Jobs Report unassigned filter
// ---------------------------------------------------------------------------

describe("Dashboard count and Jobs Report unassigned filter — same definition", () => {
  it("dashboard count excludes assigned jobs; report unassigned filter excludes the same jobs", async () => {
    // Set up: 3 active jobs. job-a assigned, job-b and job-c unassigned.
    const activeJobs = [JOB_A, JOB_B, JOB_C];
    const assignments: Assignment[] = [
      { job_id: "job-a", user_id: USER_TERRY, is_active: true },
    ];

    // The assignment map the dashboard uses
    vi.mocked(getActiveJobAssignmentDisplayMap).mockResolvedValue({
      "job-a": [{ job_id: "job-a", user_id: USER_TERRY, display_name: "Terry", is_primary: true, created_at: "" }],
    });

    const supabase = makeSupabaseMock({ jobs: activeJobs, assignments });

    const dashboard = await buildReportCenterDashboardReadModel({
      supabase,
      accountOwnerUserId: "owner-1",
      filters: { fromDate: "", toDate: "", granularity: "monthly" },
    });

    // Dashboard count: active jobs with no assignment
    const dashboardCount = dashboard.operations.unassignedOpenVisits;
    expect(dashboardCount).toBe(2); // job-b and job-c

    // Report: scope=active (default) + assignee=unassigned → same set
    const reportResult = await listJobVisitLedgerRows({
      supabase,
      accountOwnerUserId: "owner-1",
      filters: { ...DEFAULT_FILTERS, assigneeUserId: "unassigned" },
      internalBusinessDisplayName: "Test Biz",
    });

    expect(reportResult.rows).toHaveLength(dashboardCount);
    const reportIds = reportResult.rows.map((r) => r.jobId).sort();
    expect(reportIds).toEqual(["job-b", "job-c"]);
  });
});

// ---------------------------------------------------------------------------
// 10. Account-scope protection with assignment filter
// ---------------------------------------------------------------------------

describe("Jobs Report — assignment filter respects account scope", () => {
  it("cross-account job with matching user assignment is not returned (contractor scope enforces boundary)", async () => {
    // Contractor-2 belongs to a different account. Even if job-b has matching assignment, the
    // contractor_id filter will exclude it.
    vi.mocked(resolveReportAccountContractorIds).mockResolvedValue(["contractor-1"]);

    const JOB_CROSS_ACCOUNT = { ...JOB_B, id: "job-cross", contractor_id: "contractor-2" };

    const supabase = makeSupabaseMock({
      jobs: [JOB_A, JOB_CROSS_ACCOUNT],
      assignments: [
        { job_id: "job-cross", user_id: USER_TERRY, is_active: true },
      ],
    });

    const result = await listJobVisitLedgerRows({
      supabase,
      accountOwnerUserId: "owner-1",
      filters: { ...DEFAULT_FILTERS, assigneeUserId: USER_TERRY, scope: "all" },
      internalBusinessDisplayName: "Test Biz",
    });

    // job-cross has contractor-2, not in contractor-1 scope, must be excluded
    expect(result.rows.map((r) => r.jobId)).not.toContain("job-cross");
  });
});

// ---------------------------------------------------------------------------
// Filter parsing and serialization
// ---------------------------------------------------------------------------

describe("parseJobVisitLedgerFilters — assignment values", () => {
  it("parses assignee=unassigned to assigneeUserId: 'unassigned'", () => {
    const filters = parseJobVisitLedgerFilters(new URLSearchParams("assignee=unassigned"));
    expect(filters.assigneeUserId).toBe("unassigned");
  });

  it("parses a UUID to assigneeUserId", () => {
    const filters = parseJobVisitLedgerFilters(
      new URLSearchParams(`assignee=${USER_TERRY}`),
    );
    expect(filters.assigneeUserId).toBe(USER_TERRY);
  });

  it("parses missing assignee to empty string (all team members)", () => {
    const filters = parseJobVisitLedgerFilters(new URLSearchParams());
    expect(filters.assigneeUserId).toBe("");
  });
});

describe("buildJobVisitLedgerSearchParams — assignment serialization", () => {
  it("serializes assigneeUserId=unassigned to assignee=unassigned", () => {
    const params = buildJobVisitLedgerSearchParams({
      ...DEFAULT_FILTERS,
      assigneeUserId: "unassigned",
    });
    expect(params.get("assignee")).toBe("unassigned");
  });

  it("serializes a specific UUID assignee", () => {
    const params = buildJobVisitLedgerSearchParams({
      ...DEFAULT_FILTERS,
      assigneeUserId: USER_TERRY,
    });
    expect(params.get("assignee")).toBe(USER_TERRY);
  });

  it("omits the assignee param when assigneeUserId is empty (all team members)", () => {
    const params = buildJobVisitLedgerSearchParams({
      ...DEFAULT_FILTERS,
      assigneeUserId: "",
    });
    expect(params.has("assignee")).toBe(false);
  });
});
