import { describe, expect, it, vi } from "vitest";
import { reconcileServiceCaseStatusAfterJobChange } from "@/lib/actions/service-case-reconciliation";

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalServiceCaseForMutation: vi.fn(),
}));

import { loadScopedInternalServiceCaseForMutation } from "@/lib/auth/internal-job-scope";

type MockJob = {
  id: string;
  service_case_id: string;
  customer_id: string;
  status: string;
  ops_status: string;
  created_at?: string | null;
  field_complete_at?: string | null;
};

function makeSupabaseMock(params: {
  jobs: MockJob[];
  onServiceCaseUpdate?: (payload: Record<string, unknown>) => void;
}) {
  return {
    from(table: string) {
      const eqFilters = new Map<string, unknown>();
      return {
        select: () => ({
          eq: (col: string, val: unknown) => {
            eqFilters.set(col, val);
            return {
              is: async () => {
                if (table !== "jobs") return { data: [], error: null };
                let rows = [...params.jobs];
                const serviceCaseId = String(eqFilters.get("service_case_id") ?? "");
                if (serviceCaseId) rows = rows.filter((j) => j.service_case_id === serviceCaseId);
                return { data: rows, error: null };
              },
            };
          },
        }),
        update: (payload: Record<string, unknown>) => ({
          eq: async () => {
            if (table === "service_cases") {
              params.onServiceCaseUpdate?.(payload);
            }
            return { error: null };
          },
        }),
      };
    },
  };
}

describe("reconcileServiceCaseStatusAfterJobChange", () => {
  it("resolves a single-visit service case when the only linked job is terminal", async () => {
    vi.mocked(loadScopedInternalServiceCaseForMutation).mockResolvedValue({
      id: "case-1",
      customer_id: "customer-1",
      status: "open",
      resolved_at: null,
      resolved_by_job_id: null,
    } as any);

    const updates: Array<Record<string, unknown>> = [];
    const supabase = makeSupabaseMock({
      jobs: [
        {
          id: "job-1",
          service_case_id: "case-1",
          customer_id: "customer-1",
          status: "completed",
          ops_status: "closed",
        },
      ],
      onServiceCaseUpdate: (payload) => updates.push(payload),
    });

    await reconcileServiceCaseStatusAfterJobChange({
      supabase,
      accountOwnerUserId: "owner-1",
      serviceCaseId: "case-1",
      triggerJobId: "job-1",
      source: "test",
    });

    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe("resolved");
    expect(updates[0].resolved_by_job_id).toBe("job-1");
    expect(typeof updates[0].resolved_at).toBe("string");
  });

  it("keeps a multi-visit service case open when any linked visit is still active", async () => {
    vi.mocked(loadScopedInternalServiceCaseForMutation).mockResolvedValue({
      id: "case-1",
      customer_id: "customer-1",
      status: "open",
      resolved_at: null,
      resolved_by_job_id: null,
    } as any);

    const updates: Array<Record<string, unknown>> = [];
    const supabase = makeSupabaseMock({
      jobs: [
        {
          id: "job-closed",
          service_case_id: "case-1",
          customer_id: "customer-1",
          status: "completed",
          ops_status: "closed",
        },
        {
          id: "job-active",
          service_case_id: "case-1",
          customer_id: "customer-1",
          status: "open",
          ops_status: "invoice_required",
        },
      ],
      onServiceCaseUpdate: (payload) => updates.push(payload),
    });

    await reconcileServiceCaseStatusAfterJobChange({
      supabase,
      accountOwnerUserId: "owner-1",
      serviceCaseId: "case-1",
      triggerJobId: "job-closed",
      source: "test",
    });

    expect(updates).toHaveLength(0);
  });

  it("resolves when all linked visits are terminal (closed/cancelled)", async () => {
    vi.mocked(loadScopedInternalServiceCaseForMutation).mockResolvedValue({
      id: "case-1",
      customer_id: "customer-1",
      status: "open",
      resolved_at: null,
      resolved_by_job_id: null,
    } as any);

    const updates: Array<Record<string, unknown>> = [];
    const supabase = makeSupabaseMock({
      jobs: [
        {
          id: "job-1",
          service_case_id: "case-1",
          customer_id: "customer-1",
          status: "completed",
          ops_status: "closed",
        },
        {
          id: "job-2",
          service_case_id: "case-1",
          customer_id: "customer-1",
          status: "cancelled",
          ops_status: "need_to_schedule",
        },
      ],
      onServiceCaseUpdate: (payload) => updates.push(payload),
    });

    await reconcileServiceCaseStatusAfterJobChange({
      supabase,
      accountOwnerUserId: "owner-1",
      serviceCaseId: "case-1",
      triggerJobId: "job-1",
      source: "test",
    });

    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe("resolved");
  });

  it("treats failed/pending-office-review/invoice-required/paperwork-required as active and prevents resolution", async () => {
    const activeOpsStatuses = [
      "failed",
      "pending_office_review",
      "invoice_required",
      "paperwork_required",
    ];

    for (const opsStatus of activeOpsStatuses) {
      vi.mocked(loadScopedInternalServiceCaseForMutation).mockResolvedValue({
        id: "case-1",
        customer_id: "customer-1",
        status: "open",
        resolved_at: null,
        resolved_by_job_id: null,
      } as any);

      const updates: Array<Record<string, unknown>> = [];
      const supabase = makeSupabaseMock({
        jobs: [
          {
            id: "job-1",
            service_case_id: "case-1",
            customer_id: "customer-1",
            status: "open",
            ops_status: opsStatus,
          },
        ],
        onServiceCaseUpdate: (payload) => updates.push(payload),
      });

      await reconcileServiceCaseStatusAfterJobChange({
        supabase,
        accountOwnerUserId: "owner-1",
        serviceCaseId: "case-1",
        triggerJobId: "job-1",
        source: "test",
      });

      expect(updates).toHaveLength(0);
    }
  });

  it("reopens a resolved case when a new active linked visit exists", async () => {
    vi.mocked(loadScopedInternalServiceCaseForMutation).mockResolvedValue({
      id: "case-1",
      customer_id: "customer-1",
      status: "resolved",
      resolved_at: "2026-04-20T10:00:00Z",
      resolved_by_job_id: "old-job",
    } as any);

    const updates: Array<Record<string, unknown>> = [];
    const supabase = makeSupabaseMock({
      jobs: [
        {
          id: "new-job",
          service_case_id: "case-1",
          customer_id: "customer-1",
          status: "open",
          ops_status: "need_to_schedule",
        },
      ],
      onServiceCaseUpdate: (payload) => updates.push(payload),
    });

    await reconcileServiceCaseStatusAfterJobChange({
      supabase,
      accountOwnerUserId: "owner-1",
      serviceCaseId: "case-1",
      triggerJobId: "new-job",
      source: "create_next_service_visit",
    });

    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe("open");
    expect(updates[0].resolved_by_job_id).toBeNull();
    expect(updates[0].resolved_at).toBeNull();
  });

  it("ignores cross-account/unauthorized service case safely", async () => {
    vi.mocked(loadScopedInternalServiceCaseForMutation).mockResolvedValue(null);

    const updates: Array<Record<string, unknown>> = [];
    const supabase = makeSupabaseMock({
      jobs: [
        {
          id: "job-1",
          service_case_id: "case-1",
          customer_id: "customer-1",
          status: "completed",
          ops_status: "closed",
        },
      ],
      onServiceCaseUpdate: (payload) => updates.push(payload),
    });

    await reconcileServiceCaseStatusAfterJobChange({
      supabase,
      accountOwnerUserId: "owner-2",
      serviceCaseId: "case-1",
      triggerJobId: "job-1",
      source: "test",
    });

    expect(updates).toHaveLength(0);
  });
});
