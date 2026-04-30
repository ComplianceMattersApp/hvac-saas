/**
 * Focused alignment tests for "Invoice Follow-Up Needed":
 * dashboard card count vs destination report /reports/closeout?invoice_only=1.
 *
 * Proves:
 * 1. invoice_required_backlog only counts field_complete active jobs — matching
 *    the report's mandatory field_complete pre-filter.
 * 2. Dashboard card href is /reports/closeout?invoice_only=1.
 * 3. Dashboard card label is plain ("Invoice Follow-Up Needed"), helper is plain.
 * 4. Non-field_complete active job with outstanding invoice does NOT count.
 * 5. Cancelled / ops-closed jobs do NOT count.
 * 6. Internal invoicing billing-truth: issued invoice satisfies needsInvoice.
 * 7. parseCloseoutFollowUpLedgerFilters maps invoice_only=1 correctly.
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
  getAssignableInternalUsers: vi.fn(async () => []),
  getActiveJobAssignmentDisplayMap: vi.fn(async () => ({})),
}));

vi.mock("@/lib/reports/kpi-foundation", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/reports/kpi-foundation")>();
  return {
    ...original,
    getKpiRange: vi.fn(() => ({ startMs: 0, endMs: Date.now() + 1e10 })),
  };
});

vi.mock("@/lib/business/internal-business-profile", () => ({
  resolveBillingModeByAccountOwnerId: vi.fn(async () => "external_billing"),
}));

// Spy on buildBillingTruthCloseoutProjectionMap so individual tests can override
vi.mock("@/lib/business/job-billing-state", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/business/job-billing-state")>();
  return {
    ...original,
    buildBillingTruthCloseoutProjectionMap: vi.fn(original.buildBillingTruthCloseoutProjectionMap),
  };
});

// Dashboard card-link test mocks
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
        { key: "invoice_required_backlog", currentValue: "7" },
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

// ---------------------------------------------------------------------------
// Static imports (after mocks)
// ---------------------------------------------------------------------------

import { buildOperationalKpiReadModel } from "@/lib/reports/operational-kpis";
import { buildBillingTruthCloseoutProjectionMap } from "@/lib/business/job-billing-state";
import { buildReportCenterDashboardReadModel } from "@/lib/reports/report-center-dashboard";
import { parseCloseoutFollowUpLedgerFilters } from "@/lib/reports/closeout-follow-up-ledger";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const JOB_FIELD_COMPLETE_INVOICE_NEEDED = {
  id: "job-fc-inv",
  contractor_id: "contractor-1",
  status: "open",
  ops_status: "invoice_required",
  created_at: "2026-01-10T10:00:00Z",
  field_complete: true,
  field_complete_at: "2026-01-12T18:00:00Z",
  job_type: "service",
  invoice_complete: false,
  certs_complete: true,
};

const JOB_NOT_FIELD_COMPLETE_INVOICE_NEEDED = {
  id: "job-pre-fc",
  contractor_id: "contractor-1",
  status: "open",
  ops_status: "need_to_schedule",
  created_at: "2026-01-10T10:00:00Z",
  field_complete: false,
  field_complete_at: null as string | null,
  job_type: "service",
  invoice_complete: false,
  certs_complete: true,
};

const JOB_FIELD_COMPLETE_INVOICE_DONE = {
  id: "job-fc-done",
  contractor_id: "contractor-1",
  status: "open",
  ops_status: "paperwork_required",
  created_at: "2026-01-10T10:00:00Z",
  field_complete: true,
  field_complete_at: "2026-01-12T18:00:00Z",
  job_type: "service",
  invoice_complete: true,
  certs_complete: true,
};

const JOB_CANCELLED = {
  ...JOB_FIELD_COMPLETE_INVOICE_NEEDED,
  id: "job-cancelled",
  status: "cancelled",
};

const JOB_OPS_CLOSED = {
  ...JOB_FIELD_COMPLETE_INVOICE_NEEDED,
  id: "job-ops-closed",
  ops_status: "closed",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type JobFixture = {
  id: string;
  contractor_id: string;
  status: string;
  ops_status: string;
  created_at: string;
  field_complete: boolean;
  field_complete_at: string | null;
  job_type: string;
  invoice_complete: boolean;
  certs_complete: boolean;
};

function makeExternalBillingProjection(job: JobFixture) {
  return {
    id: job.id,
    field_complete: Boolean(job.field_complete),
    job_type: job.job_type ?? null,
    ops_status: job.ops_status ?? null,
    invoice_complete: Boolean(job.invoice_complete),
    certs_complete: Boolean(job.certs_complete),
    billingState: {
      billingMode: "external_billing" as const,
      usesExternalBilling: true,
      usesInternalInvoicing: false,
      hasInternalInvoice: false,
      internalInvoiceStatus: "missing" as const,
      billedTruthSatisfied: Boolean(job.invoice_complete),
      jobInvoiceCompleteProjection: Boolean(job.invoice_complete),
      projectionMatchesBilledTruth: true,
      lightweightBillingAllowed: true,
      internalInvoicePanelEnabled: false,
      statusLabel: Boolean(job.invoice_complete) ? "Invoice Complete" : "Billing Pending",
      statusTone: Boolean(job.invoice_complete) ? ("emerald" as const) : ("amber" as const),
    },
  };
}

function makeSupabaseMock(jobs: JobFixture[]) {
  return {
    from(table: string) {
      const build = (): any => ({
        select: () => build(),
        is: () => build(),
        in: () => build(),
        eq: () => build(),
        neq: () => build(),
        not: () => build(),
        or: () => build(),
        order: () => build(),
        limit: () => build(),
        gte: () => build(),
        lt: () => build(),
        lte: () => build(),
        then: (resolve: any, reject?: any) => {
          let data: any[] = [];
          if (table === "jobs") data = [...jobs];
          return Promise.resolve({ data, error: null, count: data.length }).then(resolve, reject);
        },
      });
      return build();
    },
  };
}

function getMetric(
  result: Awaited<ReturnType<typeof buildOperationalKpiReadModel>>,
  key: string,
): number {
  return Number(result.metrics.find((m) => m.key === key)?.currentValue ?? -1);
}

// ---------------------------------------------------------------------------
// 1–5. invoice_required_backlog field_complete guard
// ---------------------------------------------------------------------------

describe("invoice_required_backlog — field_complete guard (external billing)", () => {
  beforeEach(() => {
    vi.mocked(buildBillingTruthCloseoutProjectionMap).mockImplementation(async (params) => ({
      billingMode: "external_billing",
      projectionsByJobId: new Map(
        (params.jobs ?? []).map((job) => [job.id, makeExternalBillingProjection(job as JobFixture)]),
      ),
    }));
  });

  it("counts a field_complete active job with outstanding invoice", async () => {
    const result = await buildOperationalKpiReadModel({
      supabase: makeSupabaseMock([JOB_FIELD_COMPLETE_INVOICE_NEEDED]),
      accountOwnerUserId: "owner-1",
      filters: { fromDate: "", toDate: "", granularity: "monthly" },
      buckets: [],
    });
    expect(getMetric(result, "invoice_required_backlog")).toBe(1);
  });

  it("does NOT count a non-field_complete job even if invoice is outstanding", async () => {
    const result = await buildOperationalKpiReadModel({
      supabase: makeSupabaseMock([JOB_NOT_FIELD_COMPLETE_INVOICE_NEEDED]),
      accountOwnerUserId: "owner-1",
      filters: { fromDate: "", toDate: "", granularity: "monthly" },
      buckets: [],
    });
    expect(getMetric(result, "invoice_required_backlog")).toBe(0);
  });

  it("does NOT count a field_complete job where invoice is already done", async () => {
    const result = await buildOperationalKpiReadModel({
      supabase: makeSupabaseMock([JOB_FIELD_COMPLETE_INVOICE_DONE]),
      accountOwnerUserId: "owner-1",
      filters: { fromDate: "", toDate: "", granularity: "monthly" },
      buckets: [],
    });
    expect(getMetric(result, "invoice_required_backlog")).toBe(0);
  });

  it("does NOT count a cancelled job", async () => {
    const result = await buildOperationalKpiReadModel({
      supabase: makeSupabaseMock([JOB_CANCELLED]),
      accountOwnerUserId: "owner-1",
      filters: { fromDate: "", toDate: "", granularity: "monthly" },
      buckets: [],
    });
    expect(getMetric(result, "invoice_required_backlog")).toBe(0);
  });

  it("does NOT count an ops-closed job", async () => {
    const result = await buildOperationalKpiReadModel({
      supabase: makeSupabaseMock([JOB_OPS_CLOSED]),
      accountOwnerUserId: "owner-1",
      filters: { fromDate: "", toDate: "", granularity: "monthly" },
      buckets: [],
    });
    expect(getMetric(result, "invoice_required_backlog")).toBe(0);
  });

  it("counts only the field_complete needing-invoice job from a mixed set", async () => {
    // field_complete + invoice needed → counted
    // not field_complete + invoice needed → NOT counted
    // field_complete + invoice done → NOT counted
    const result = await buildOperationalKpiReadModel({
      supabase: makeSupabaseMock([
        JOB_FIELD_COMPLETE_INVOICE_NEEDED,
        JOB_NOT_FIELD_COMPLETE_INVOICE_NEEDED,
        JOB_FIELD_COMPLETE_INVOICE_DONE,
      ]),
      accountOwnerUserId: "owner-1",
      filters: { fromDate: "", toDate: "", granularity: "monthly" },
      buckets: [],
    });
    expect(getMetric(result, "invoice_required_backlog")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Internal invoicing billing-truth
// ---------------------------------------------------------------------------

describe("invoice_required_backlog — internal invoicing billing-truth", () => {
  it("counts a field_complete job when internal invoice is not yet issued", async () => {
    vi.mocked(buildBillingTruthCloseoutProjectionMap).mockResolvedValue({
      billingMode: "internal_invoicing",
      projectionsByJobId: new Map([
        [
          JOB_FIELD_COMPLETE_INVOICE_NEEDED.id,
          {
            id: JOB_FIELD_COMPLETE_INVOICE_NEEDED.id,
            field_complete: true,
            job_type: "service",
            ops_status: "invoice_required",
            invoice_complete: false,
            certs_complete: true,
            billingState: {
              billingMode: "internal_invoicing" as const,
              usesExternalBilling: false,
              usesInternalInvoicing: true,
              hasInternalInvoice: false,
              internalInvoiceStatus: "missing" as const,
              billedTruthSatisfied: false,
              jobInvoiceCompleteProjection: false,
              projectionMatchesBilledTruth: true,
              lightweightBillingAllowed: false,
              internalInvoicePanelEnabled: true,
              statusLabel: "Not Started",
              statusTone: "slate" as const,
            },
          },
        ],
      ]),
    });

    const result = await buildOperationalKpiReadModel({
      supabase: makeSupabaseMock([JOB_FIELD_COMPLETE_INVOICE_NEEDED]),
      accountOwnerUserId: "owner-1",
      filters: { fromDate: "", toDate: "", granularity: "monthly" },
      buckets: [],
    });
    expect(getMetric(result, "invoice_required_backlog")).toBe(1);
  });

  it("does NOT count a field_complete job when internal invoice is issued (billing-truth overrides DB column)", async () => {
    vi.mocked(buildBillingTruthCloseoutProjectionMap).mockResolvedValue({
      billingMode: "internal_invoicing",
      projectionsByJobId: new Map([
        [
          JOB_FIELD_COMPLETE_INVOICE_NEEDED.id,
          {
            id: JOB_FIELD_COMPLETE_INVOICE_NEEDED.id,
            field_complete: true,
            job_type: "service",
            ops_status: "invoice_required",
            invoice_complete: true, // billing-truth: issued internal invoice overrides DB column
            certs_complete: true,
            billingState: {
              billingMode: "internal_invoicing" as const,
              usesExternalBilling: false,
              usesInternalInvoicing: true,
              hasInternalInvoice: true,
              internalInvoiceStatus: "issued" as const,
              billedTruthSatisfied: true,
              jobInvoiceCompleteProjection: false, // DB column not yet updated
              projectionMatchesBilledTruth: false,
              lightweightBillingAllowed: false,
              internalInvoicePanelEnabled: true,
              statusLabel: "Issued",
              statusTone: "emerald" as const,
            },
          },
        ],
      ]),
    });

    const result = await buildOperationalKpiReadModel({
      supabase: makeSupabaseMock([JOB_FIELD_COMPLETE_INVOICE_NEEDED]),
      accountOwnerUserId: "owner-1",
      filters: { fromDate: "", toDate: "", granularity: "monthly" },
      buckets: [],
    });
    expect(getMetric(result, "invoice_required_backlog")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Dashboard card link, label, and helper text
// ---------------------------------------------------------------------------

describe("Invoice Follow-Up Needed dashboard card", () => {
  beforeEach(() => {
    vi.mocked(buildBillingTruthCloseoutProjectionMap).mockResolvedValue({
      billingMode: "external_billing",
      projectionsByJobId: new Map(),
    });
  });

  it("closeout card has correct href, plain label, and plain-language helper text", async () => {
    const result = await buildReportCenterDashboardReadModel({
      supabase: makeSupabaseMock([]),
      accountOwnerUserId: "owner-1",
      filters: { fromDate: "", toDate: "", granularity: "monthly" },
    });

    const card = result.closeout.cards.find((c: any) =>
      (c.label as string).toLowerCase().includes("invoice"),
    );

    if (!card) throw new Error("Invoice Follow-Up Needed card not found in closeout section");
    expect(card.label).toBe("Invoice Follow-Up Needed");
    expect(card.href).toBe("/reports/closeout?invoice_only=1");
    expect(card.helperText).toBe("Visits still waiting on invoice action.");
    expect(card.helperText).not.toMatch(/billing-aware/i);
    expect(card.helperText).not.toMatch(/finance collection/i);
  });

  it("invoice_required_backlog metric value flows through to the card", async () => {
    const result = await buildReportCenterDashboardReadModel({
      supabase: makeSupabaseMock([]),
      accountOwnerUserId: "owner-1",
      filters: { fromDate: "", toDate: "", granularity: "monthly" },
    });

    const card = result.closeout.cards.find((c: any) =>
      (c.label as string).toLowerCase().includes("invoice"),
    );
    if (!card) throw new Error("Invoice Follow-Up Needed card not found in closeout section");
    // Mocked kpis return "7" for invoice_required_backlog; getMetricValue passes the string through
    expect(card.value).toBe("7");
  });
});

// ---------------------------------------------------------------------------
// 8. Filter parsing — invoice_only=1
// ---------------------------------------------------------------------------

describe("parseCloseoutFollowUpLedgerFilters — invoice_only param", () => {
  it("maps invoice_only=1 to invoiceOnly: true", () => {
    const filters = parseCloseoutFollowUpLedgerFilters(new URLSearchParams("invoice_only=1"));
    expect(filters.invoiceOnly).toBe(true);
    expect(filters.closeoutOnly).toBe(false);
    expect(filters.paperworkOnly).toBe(false);
  });

  it("defaults invoiceOnly to false when param is absent", () => {
    const filters = parseCloseoutFollowUpLedgerFilters(new URLSearchParams());
    expect(filters.invoiceOnly).toBe(false);
  });

  it("defaults scope to active when not specified", () => {
    const filters = parseCloseoutFollowUpLedgerFilters(new URLSearchParams("invoice_only=1"));
    expect(filters.scope).toBe("active");
  });
});
