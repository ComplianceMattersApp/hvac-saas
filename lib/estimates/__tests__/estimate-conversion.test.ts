import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const isEstimatesEnabledMock = vi.fn();
const getEstimateToJobConversionSchemaReadyMock = vi.fn();
const isEstimateToJobConversionSchemaReadyMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

vi.mock("@/lib/estimates/estimate-exposure", () => ({
  isEstimatesEnabled: (...args: unknown[]) => isEstimatesEnabledMock(...args),
}));

vi.mock("@/lib/jobs/visit-scope", () => ({
  sanitizeVisitScopeItems: (items: unknown[]) => items,
}));

vi.mock("@/lib/estimates/estimate-read", () => ({
  buildEstimateNumber: vi.fn(),
  loadScopedCustomerForEstimate: vi.fn(),
  loadScopedLocationForEstimate: vi.fn(),
  loadScopedServiceCaseForEstimate: vi.fn(),
  loadScopedJobForEstimate: vi.fn(),
  loadScopedPricebookItemForEstimate: vi.fn(),
  recomputeEstimateTotals: vi.fn(),
  getEstimateById: vi.fn(),
  listEstimatesByAccount: vi.fn(),
  getEstimateConvertedJobId: (row: any) =>
    row && Object.prototype.hasOwnProperty.call(row, "converted_job_id")
      ? row.converted_job_id ?? null
      : null,
  isEstimateToJobConversionSchemaReady: (...args: unknown[]) =>
    isEstimateToJobConversionSchemaReadyMock(...args),
  getEstimateToJobConversionSchemaReady: (...args: unknown[]) =>
    getEstimateToJobConversionSchemaReadyMock(...args),
}));

function makeInternalUser() {
  return {
    internalUser: {
      user_id: "user-1",
      account_owner_user_id: "owner-1",
      role: "admin",
      is_active: true,
    },
  } as any;
}

type Scenario = {
  estimateStatus?: string;
  hasOptions?: boolean;
  selectedOptionId?: string | null;
  selectedOptionExists?: boolean;
  estimateConvertedJobId?: string | null;
  jobInsertError?: { code?: string; message?: string } | null;
  updateError?: { code?: string; message?: string } | null;
  flatLines?: Array<Record<string, unknown>>;
  optionLines?: Array<Record<string, unknown>>;
};

function makeSupabaseScenario(s: Scenario = {}) {
  const estimate = {
    id: "est-1",
    account_owner_user_id: "owner-1",
    estimate_number: "EST-20260520-ABCDEF12",
    status: s.estimateStatus ?? "approved",
    title: "Compressor replacement",
    customer_id: "cust-1",
    location_id: "loc-1",
    service_case_id: "sc-1",
    total_cents: 42000,
    selected_option_id: s.selectedOptionId ?? null,
    selected_option_label_snapshot: s.selectedOptionId ? "Better" : null,
    selected_option_total_cents: s.selectedOptionId ? 39000 : null,
    converted_job_id: s.estimateConvertedJobId ?? null,
  };

  const flatLines =
    s.flatLines ??
    [
      {
        id: "line-1",
        source_pricebook_item_id: "pb-1",
        item_name_snapshot: "Labor",
        description_snapshot: "Install condenser",
        item_type_snapshot: "service",
        category_snapshot: "install",
        unit_label_snapshot: "ea",
        unit_price_cents: 20000,
      },
    ];

  const optionLines =
    s.optionLines ??
    [
      {
        id: "opt-line-1",
        source_pricebook_item_id: "pb-2",
        item_name_snapshot: "Option labor",
        description_snapshot: "Better package labor",
        item_type_snapshot: "service",
        category_snapshot: "install",
        unit_label_snapshot: "ea",
        unit_price_cents: 25000,
      },
    ];

  const captured = {
    tables: [] as string[],
    jobInsertPayload: null as any,
    estimateUpdatePayload: null as any,
    events: [] as any[],
  };

  const supabase: any = {
    from: vi.fn((table: string) => {
      captured.tables.push(table);

      if (table === "estimates") {
        return {
          select: (columns: string) => {
            if (columns.includes("account_owner_user_id")) {
              return {
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: estimate, error: null }),
                  }),
                }),
              };
            }

            return {
              eq: () => ({
                maybeSingle: async () => ({ data: { converted_job_id: estimate.converted_job_id }, error: null }),
              }),
            };
          },
          update: (payload: Record<string, unknown>) => {
            captured.estimateUpdatePayload = payload;
            return {
              eq: () => ({
                eq: async () => ({ error: s.updateError ?? null }),
              }),
            };
          },
        };
      }

      if (table === "estimate_options") {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({ data: s.hasOptions ? [{ id: "opt-1" }] : [], error: null }),
              eq: () => ({
                maybeSingle: async () => ({
                  data: s.selectedOptionExists === false ? null : { id: s.selectedOptionId ?? "opt-1" },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === "estimate_option_line_items") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  order: async () => ({ data: optionLines, error: null }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === "estimate_line_items") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                order: async () => ({ data: flatLines, error: null }),
              }),
            }),
          }),
        };
      }

      if (table === "customers") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    first_name: "Ava",
                    last_name: "Smith",
                    email: "ava@example.com",
                    phone: "555-1111",
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === "locations") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { address_line1: "123 Main", city: "San Jose" },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === "jobs") {
        return {
          insert: (payload: Record<string, unknown>) => {
            captured.jobInsertPayload = payload;
            return {
              select: () => ({
                single: async () => ({
                  data: s.jobInsertError ? null : { id: "job-1" },
                  error: s.jobInsertError ?? null,
                }),
              }),
            };
          },
        };
      }

      if (table === "estimate_events") {
        return {
          insert: async (payload: Record<string, unknown>) => {
            captured.events.push(payload);
            return { error: null };
          },
        };
      }

      if (table === "internal_invoices") {
        throw new Error("internal_invoices should not be accessed in Action A");
      }

      throw new Error(`Unhandled table in test mock: ${table}`);
    }),
  };

  return { supabase, captured };
}

describe("convertApprovedEstimateToJob", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    isEstimatesEnabledMock.mockReturnValue(true);
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    getEstimateToJobConversionSchemaReadyMock.mockResolvedValue(true);
    isEstimateToJobConversionSchemaReadyMock.mockReturnValue(true);
  });

  it("converts flat approved estimate into job and writes audit event", async () => {
    const { supabase, captured } = makeSupabaseScenario({
      estimateStatus: "approved",
      hasOptions: false,
      selectedOptionId: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { convertApprovedEstimateToJob } = await import("@/lib/estimates/estimate-actions");
    const result = await convertApprovedEstimateToJob({ estimateId: "est-1" });

    expect(result.success).toBe(true);
    expect(captured.jobInsertPayload.origin_estimate_id).toBe("est-1");
    expect(captured.jobInsertPayload.customer_id).toBe("cust-1");
    expect(captured.jobInsertPayload.location_id).toBe("loc-1");
    expect(captured.jobInsertPayload.service_case_id).toBe("sc-1");
    expect(Array.isArray(captured.jobInsertPayload.visit_scope_items)).toBe(true);
    expect(captured.estimateUpdatePayload).toMatchObject({
      status: "converted",
      converted_job_id: "job-1",
      converted_by_user_id: "user-1",
    });
    expect(captured.events[0]?.event_type).toBe("estimate_converted_to_job");
    expect(captured.events[0]?.meta?.proposal_mode).toBe("single_option_flat");
    expect(captured.tables).not.toContain("internal_invoices");
  });

  it("converts selected multi-option lines only", async () => {
    const { supabase, captured } = makeSupabaseScenario({
      estimateStatus: "approved",
      hasOptions: true,
      selectedOptionId: "opt-1",
    });
    createClientMock.mockResolvedValue(supabase);

    const { convertApprovedEstimateToJob } = await import("@/lib/estimates/estimate-actions");
    const result = await convertApprovedEstimateToJob({ estimateId: "est-1" });

    expect(result.success).toBe(true);
    expect(captured.jobInsertPayload.visit_scope_items[0].title).toBe("Option labor");
    expect(captured.events[0]?.meta?.proposal_mode).toBe("multi_option_packages");
    expect(captured.events[0]?.meta?.selected_option_id).toBe("opt-1");
  });

  it("blocks multi-option conversion when selected option is missing", async () => {
    const { supabase } = makeSupabaseScenario({
      estimateStatus: "approved",
      hasOptions: true,
      selectedOptionId: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { convertApprovedEstimateToJob } = await import("@/lib/estimates/estimate-actions");
    const result = await convertApprovedEstimateToJob({ estimateId: "est-1" });

    expect(result).toEqual({
      success: false,
      error: "selected_option_id is required before converting multi-option estimates.",
    });
  });

  it("blocks non-approved statuses", async () => {
    const blockedStatuses = ["draft", "sent", "declined", "expired", "cancelled"];

    for (const status of blockedStatuses) {
      const { supabase } = makeSupabaseScenario({ estimateStatus: status });
      createClientMock.mockResolvedValue(supabase);

      const { convertApprovedEstimateToJob } = await import("@/lib/estimates/estimate-actions");
      const result = await convertApprovedEstimateToJob({ estimateId: "est-1" });

      expect(result.success).toBe(false);
    }
  });

  it("blocks duplicate conversion when converted_job_id already exists", async () => {
    const { supabase } = makeSupabaseScenario({
      estimateStatus: "approved",
      estimateConvertedJobId: "job-existing",
    });
    createClientMock.mockResolvedValue(supabase);

    const { convertApprovedEstimateToJob } = await import("@/lib/estimates/estimate-actions");
    const result = await convertApprovedEstimateToJob({ estimateId: "est-1" });

    expect(result).toEqual({
      success: false,
      error: "Estimate already converted.",
      existingJobId: "job-existing",
    });
  });

  it("fails safely when conversion schema is unavailable", async () => {
    getEstimateToJobConversionSchemaReadyMock.mockResolvedValue(false);
    const { supabase } = makeSupabaseScenario({ estimateStatus: "approved" });
    createClientMock.mockResolvedValue(supabase);

    const { convertApprovedEstimateToJob } = await import("@/lib/estimates/estimate-actions");
    const result = await convertApprovedEstimateToJob({ estimateId: "est-1" });

    expect(result).toEqual({
      success: false,
      error: "estimate_conversion_schema_unavailable",
    });
  });

  it("preserves provenance snapshots on converted visit scope items", async () => {
    const { supabase, captured } = makeSupabaseScenario({ estimateStatus: "approved" });
    createClientMock.mockResolvedValue(supabase);

    const { convertApprovedEstimateToJob } = await import("@/lib/estimates/estimate-actions");
    await convertApprovedEstimateToJob({ estimateId: "est-1" });

    expect(captured.jobInsertPayload.visit_scope_items[0]).toMatchObject({
      source_pricebook_item_id: "pb-1",
      item_type: "service",
      category: "install",
      unit_label: "ea",
    });
  });

  it("does not perform invoice conversion behavior in Action A", async () => {
    const { supabase, captured } = makeSupabaseScenario({ estimateStatus: "approved" });
    createClientMock.mockResolvedValue(supabase);

    const { convertApprovedEstimateToJob } = await import("@/lib/estimates/estimate-actions");
    const result = await convertApprovedEstimateToJob({ estimateId: "est-1" });

    expect(result.success).toBe(true);
    expect(captured.tables).not.toContain("internal_invoices");
  });
});
