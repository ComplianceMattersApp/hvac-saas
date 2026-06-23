import { describe, expect, it, vi } from "vitest";
import {
  CONTRACTOR_SAFE_REQUIRED_MESSAGE,
  buildOpsQueueCsv,
  buildOpsQueueExport,
  escapeCsvCell,
} from "@/lib/ops/ops-queue-export";

vi.mock("@/lib/staffing/human-layer", () => ({
  getActiveJobAssignmentDisplayMap: vi.fn(async () => ({
    "job-1": [{ display_name: "Ava Tech" }],
  })),
}));

vi.mock("@/lib/business/job-billing-state", () => ({
  buildBillingTruthCloseoutProjectionMap: vi.fn(async () => ({
    projectionsByJobId: new Map(),
  })),
}));

function queryResult(data: any[]) {
  return {
    data,
    error: null,
    select: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then(resolve: any) {
      return Promise.resolve(resolve({ data, error: null }));
    },
  };
}

function makeSupabase(jobs: any[]) {
  return {
    from: vi.fn((table: string) => {
      if (table === "jobs") return queryResult(jobs);
      if (table === "ecc_test_runs") return queryResult([]);
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

const job = {
  id: "job-1",
  title: "Job, Alpha",
  status: "open",
  job_type: "ecc",
  ops_status: "need_to_schedule",
  scheduled_date: "2026-06-22",
  window_start: "09:00:00",
  window_end: "11:00:00",
  city: "Fresno",
  job_address: "10 Main St",
  customer_first_name: "Dana",
  customer_last_name: "Quinn",
  pending_info_reason: 'Customer said "call again"\nFriday',
  on_hold_reason: null,
  permit_number: "P-123",
  field_complete: false,
  field_complete_at: null,
  invoice_complete: false,
  billing_disposition: "internal-only",
  certs_complete: false,
  contractor_id: "contractor-1",
  contractors: { name: "ACME HVAC" },
  created_at: "2026-06-20T10:00:00Z",
};

describe("ops queue CSV export", () => {
  it("escapes commas, quotes, and newlines", () => {
    expect(escapeCsvCell('A, "quoted"\nvalue')).toBe('"A, ""quoted""\nvalue"');
    expect(buildOpsQueueCsv([{ A: "plain", B: "two, parts" }])).toBe("A,B\r\nplain,\"two, parts\"");
  });

  it("requires one contractor for contractor-safe export", async () => {
    const result = await buildOpsQueueExport({
      supabase: makeSupabase([job]),
      accountOwnerUserId: "owner-1",
      mode: "contractor_safe",
      queueKey: "need_to_schedule",
      contractorId: null,
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      message: CONTRACTOR_SAFE_REQUIRED_MESSAGE,
    });
  });

  it("builds contractor-safe CSV without internal-only export columns", async () => {
    const result = await buildOpsQueueExport({
      supabase: makeSupabase([job]),
      accountOwnerUserId: "owner-1",
      mode: "contractor_safe",
      queueKey: "need_to_schedule",
      contractorId: "contractor-1",
      sort: "oldest",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.csv).toContain("Queue,Contractor,Job Number / Job Reference");
    expect(result.csv).toContain('"Job, Alpha"');
    expect(result.csv).not.toContain("Internal Job Link");
    expect(result.csv).not.toContain("Assigned Team");
    expect(result.csv).not.toContain("billing_disposition");
    expect(result.csv).not.toContain("internal-only");
  });

  it("builds internal CSV with operational columns", async () => {
    const result = await buildOpsQueueExport({
      supabase: makeSupabase([job]),
      accountOwnerUserId: "owner-1",
      mode: "internal",
      queueKey: "need_to_schedule",
      contractorId: null,
      sort: "oldest",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.csv).toContain("Assigned Team");
    expect(result.csv).toContain("Internal Job Link");
    expect(result.csv).toContain("/jobs/job-1?tab=ops");
  });

  it("exports valid headers only for empty results", async () => {
    const result = await buildOpsQueueExport({
      supabase: makeSupabase([]),
      accountOwnerUserId: "owner-1",
      mode: "internal",
      queueKey: "waiting",
      contractorId: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.csv).toContain("Queue,Contractor");
    expect(result.csv).not.toContain("\r\n");
  });
});
