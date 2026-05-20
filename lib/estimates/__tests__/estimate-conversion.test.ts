import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const isEstimatesEnabledMock = vi.fn();
const getEstimateToJobConversionSchemaReadyMock = vi.fn();
const isEstimateToJobConversionSchemaReadyMock = vi.fn();
const getEstimateToInvoiceConversionSchemaReadyMock = vi.fn();
const isEstimateToInvoiceConversionSchemaReadyMock = vi.fn();

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
  getEstimateConvertedInvoiceId: (row: any) =>
    row && Object.prototype.hasOwnProperty.call(row, "converted_invoice_id")
      ? row.converted_invoice_id ?? null
      : null,
  isEstimateToJobConversionSchemaReady: (...args: unknown[]) =>
    isEstimateToJobConversionSchemaReadyMock(...args),
  getEstimateToJobConversionSchemaReady: (...args: unknown[]) =>
    getEstimateToJobConversionSchemaReadyMock(...args),
  isEstimateToInvoiceConversionSchemaReady: (...args: unknown[]) =>
    isEstimateToInvoiceConversionSchemaReadyMock(...args),
  getEstimateToInvoiceConversionSchemaReady: (...args: unknown[]) =>
    getEstimateToInvoiceConversionSchemaReadyMock(...args),
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
    getEstimateToInvoiceConversionSchemaReadyMock.mockResolvedValue(true);
    isEstimateToInvoiceConversionSchemaReadyMock.mockReturnValue(true);
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

// ---------------------------------------------------------------------------
// Action B: Estimate → Invoice Draft Conversion (Section 2F)
// ---------------------------------------------------------------------------

describe("recordEstimateToInvoiceDraftConversion", () => {
  beforeEach(() => {
    createClientMock.mockClear();
    requireInternalUserMock.mockClear();
    isEstimatesEnabledMock.mockClear();
    getEstimateToJobConversionSchemaReadyMock.mockClear();
    isEstimateToJobConversionSchemaReadyMock.mockClear();
    getEstimateToInvoiceConversionSchemaReadyMock.mockClear();
    isEstimateToInvoiceConversionSchemaReadyMock.mockClear();
    getEstimateToInvoiceConversionSchemaReadyMock.mockResolvedValue(true);
    isEstimateToInvoiceConversionSchemaReadyMock.mockReturnValue(true);
  });

  it("blocks when feature flag is disabled", async () => {
    isEstimatesEnabledMock.mockReturnValue(false);
    const { recordEstimateToInvoiceDraftConversion } = await import(
      "@/lib/estimates/estimate-actions"
    );
    const result = await recordEstimateToInvoiceDraftConversion({ estimateId: "est-1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Estimates are currently unavailable.");
    }
  });

  it("blocks when invoice conversion schema is unavailable", async () => {
    isEstimatesEnabledMock.mockReturnValue(true);
    requireInternalUserMock.mockResolvedValue({
      internalUser: { user_id: "user-1", account_owner_user_id: "owner-1" },
    });
    getEstimateToInvoiceConversionSchemaReadyMock.mockResolvedValue(false);

    const { recordEstimateToInvoiceDraftConversion } = await import(
      "@/lib/estimates/estimate-actions"
    );
    const result = await recordEstimateToInvoiceDraftConversion({ estimateId: "est-1" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("invoice_conversion_schema_unavailable");
    }
  });

  it("blocks when estimate has no converted_job_id", async () => {
    isEstimatesEnabledMock.mockReturnValue(true);
    requireInternalUserMock.mockResolvedValue({
      internalUser: { user_id: "user-1", account_owner_user_id: "owner-1" },
    });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "estimates") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi
              .fn()
              .mockReturnThis()
              .mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "est-1",
                status: "converted",
                converted_job_id: null,
                converted_invoice_id: null,
              },
              error: null,
            }),
          };
        }
        return {};
      }),
    };

    createClientMock.mockResolvedValue(supabase);

    const { recordEstimateToInvoiceDraftConversion } = await import(
      "@/lib/estimates/estimate-actions"
    );
    const result = await recordEstimateToInvoiceDraftConversion({ estimateId: "est-1" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("converted to a job first");
    }
  });

  it("creates draft internal invoice from converted job visit_scope_items", async () => {
    isEstimatesEnabledMock.mockReturnValue(true);
    requireInternalUserMock.mockResolvedValue({
      internalUser: { user_id: "user-1", account_owner_user_id: "owner-1" },
    });

    const visitScopeItems = [
      {
        id: "vsi-1",
        title: "HVAC Service",
        details: "Annual maintenance",
        item_type: "service",
        category: "HVAC",
        unit_label: "visit",
        expected_unit_price: 500,
        source_pricebook_item_id: "pb-1",
      },
    ];

    let insertedInvoice: any = null;
    let insertedLines: any[] = [];

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "estimates") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi
              .fn()
              .mockReturnThis()
              .mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "est-1",
                status: "converted",
                title: "Test Proposal",
                customer_id: "cust-1",
                location_id: "loc-1",
                total_cents: 50000,
                selected_option_id: null,
                selected_option_label_snapshot: null,
                selected_option_total_cents: null,
                converted_job_id: "job-1",
                converted_invoice_id: null,
              },
              error: null,
            }),
            update: vi
              .fn()
              .mockReturnThis()
              .mockReturnValue({
                eq: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ error: null }),
              }),
          };
        } else if (table === "jobs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi
              .fn()
              .mockReturnThis()
              .mockReturnThis(),
            neq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "job-1",
                account_owner_user_id: "owner-1",
                customer_id: "cust-1",
                location_id: "loc-1",
                status: "open",
                visit_scope_items: visitScopeItems,
                origin_estimate_id: "est-1",
              },
              error: null,
            }),
          };
        } else if (table === "internal_invoices") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi
              .fn()
              .mockReturnThis()
              .mockReturnThis(),
            neq: vi
              .fn()
              .mockReturnThis()
              .mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn((payload: any) => {
              insertedInvoice = payload;
              return {
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({
                  data: { id: "inv-1" },
                  error: null,
                }),
              };
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
            }),
          };
        } else if (table === "internal_invoice_line_items") {
          return {
            insert: vi.fn((items: any[]) => {
              insertedLines = items;
              return Promise.resolve({ error: null });
            }),
          };
        } else if (table === "estimate_events") {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      }),
    };

    createClientMock.mockResolvedValue(supabase);

    const { recordEstimateToInvoiceDraftConversion } = await import(
      "@/lib/estimates/estimate-actions"
    );
    const result = await recordEstimateToInvoiceDraftConversion({ estimateId: "est-1" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.invoiceId).toBe("inv-1");
    }
    expect(insertedInvoice).toMatchObject({
      status: "draft",
      source_type: "estimate",
      source_estimate_id: "est-1",
      job_id: "job-1",
    });
    expect(insertedLines).toHaveLength(1);
    expect(insertedLines[0]).toMatchObject({
      source_kind: "visit_scope",
      source_visit_scope_item_id: "vsi-1",
      source_pricebook_item_id: "pb-1",
      item_name_snapshot: "HVAC Service",
    });
  });

  it("blocks when job already has active non-void invoice", async () => {
    isEstimatesEnabledMock.mockReturnValue(true);
    requireInternalUserMock.mockResolvedValue({
      internalUser: { user_id: "user-1", account_owner_user_id: "owner-1" },
    });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "estimates") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi
              .fn()
              .mockReturnThis()
              .mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "est-1",
                status: "converted",
                converted_job_id: "job-1",
                converted_invoice_id: null,
              },
              error: null,
            }),
          };
        } else if (table === "jobs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi
              .fn()
              .mockReturnThis()
              .mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "job-1",
                account_owner_user_id: "owner-1",
                visit_scope_items: [{ id: "vsi-1" }],
                origin_estimate_id: "est-1",
              },
              error: null,
            }),
          };
        } else if (table === "internal_invoices") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi
              .fn()
              .mockReturnThis()
              .mockReturnThis(),
            neq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "inv-existing", status: "draft" },
              error: null,
            }),
          };
        }
        return {};
      }),
    };

    createClientMock.mockResolvedValue(supabase);

    const { recordEstimateToInvoiceDraftConversion } = await import(
      "@/lib/estimates/estimate-actions"
    );
    const result = await recordEstimateToInvoiceDraftConversion({ estimateId: "est-1" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("active non-void invoice");
      expect(result.existingInvoiceId).toBe("inv-existing");
    }
  });

  it("does not change estimate status or converted_at when updating converted_invoice_id", async () => {
    isEstimatesEnabledMock.mockReturnValue(true);
    requireInternalUserMock.mockResolvedValue({
      internalUser: { user_id: "user-1", account_owner_user_id: "owner-1" },
    });

    let updatePayload: any = null;

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "estimates") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi
              .fn()
              .mockReturnThis()
              .mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "est-1",
                status: "converted",
                title: "Test",
                customer_id: "cust-1",
                location_id: "loc-1",
                total_cents: 50000,
                selected_option_id: null,
                selected_option_label_snapshot: null,
                selected_option_total_cents: null,
                converted_job_id: "job-1",
                converted_invoice_id: null,
                converted_at: "2026-05-20T10:00:00Z",
              },
              error: null,
            }),
            update: vi.fn((payload: any) => {
              updatePayload = payload;
              return {
                eq: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
          };
        } else if (table === "jobs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi
              .fn()
              .mockReturnThis()
              .mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "job-1",
                account_owner_user_id: "owner-1",
                visit_scope_items: [{ id: "vsi-1", title: "Scope 1", expected_unit_price: 500 }],
              },
              error: null,
            }),
          };
        } else if (table === "internal_invoices") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi
              .fn()
              .mockReturnThis()
              .mockReturnThis(),
            neq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { id: "inv-1" }, error: null }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
            }),
          };
        } else if (table === "internal_invoice_line_items") {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        } else if (table === "estimate_events") {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return {};
      }),
    };

    createClientMock.mockResolvedValue(supabase);

    const { recordEstimateToInvoiceDraftConversion } = await import(
      "@/lib/estimates/estimate-actions"
    );
    await recordEstimateToInvoiceDraftConversion({ estimateId: "est-1" });

    expect(updatePayload).toBeDefined();
    expect(updatePayload).not.toHaveProperty("status");
    expect(updatePayload).not.toHaveProperty("converted_at");
    expect(updatePayload).toHaveProperty("converted_invoice_id", "inv-1");
  });

  it("writes estimate_converted_to_invoice event with full metadata", async () => {
    isEstimatesEnabledMock.mockReturnValue(true);
    requireInternalUserMock.mockResolvedValue({
      internalUser: { user_id: "user-1", account_owner_user_id: "owner-1" },
    });

    let eventPayload: any = null;

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "estimates") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi
              .fn()
              .mockReturnThis()
              .mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "est-1",
                status: "converted",
                title: "Test",
                customer_id: "cust-1",
                location_id: "loc-1",
                total_cents: 50000,
                selected_option_id: "opt-1",
                selected_option_label_snapshot: "Better",
                selected_option_total_cents: 50000,
                converted_job_id: "job-1",
                converted_invoice_id: null,
              },
              error: null,
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        } else if (table === "jobs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi
              .fn()
              .mockReturnThis()
              .mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "job-1",
                account_owner_user_id: "owner-1",
                visit_scope_items: [{ id: "vsi-1", title: "Scope 1", expected_unit_price: 500 }],
              },
              error: null,
            }),
          };
        } else if (table === "internal_invoices") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi
              .fn()
              .mockReturnThis()
              .mockReturnThis(),
            neq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { id: "inv-1" }, error: null }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
            }),
          };
        } else if (table === "internal_invoice_line_items") {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        } else if (table === "estimate_events") {
          return {
            insert: vi.fn((payload: any) => {
              eventPayload = payload;
              return Promise.resolve({ error: null });
            }),
          };
        }
        return {};
      }),
    };

    createClientMock.mockResolvedValue(supabase);

    const { recordEstimateToInvoiceDraftConversion } = await import(
      "@/lib/estimates/estimate-actions"
    );
    await recordEstimateToInvoiceDraftConversion({ estimateId: "est-1" });

    expect(eventPayload).toBeDefined();
    expect(eventPayload.event_type).toBe("estimate_converted_to_invoice");
    expect(eventPayload.meta).toMatchObject({
      invoice_id: "inv-1",
      job_id: "job-1",
      source_estimate_id: "est-1",
      converted_by_user_id: "user-1",
      proposal_mode: "multi_option_packages",
      selected_option_id: "opt-1",
      selected_option_label_snapshot: "Better",
    });
  });

  it("does not perform issue/send/payment/QBO/SMS behavior", async () => {
    isEstimatesEnabledMock.mockReturnValue(true);
    requireInternalUserMock.mockResolvedValue({
      internalUser: { user_id: "user-1", account_owner_user_id: "owner-1" },
    });

    const captured = { tables: new Set<string>() };
    const supabase = {
      from: vi.fn((table: string) => {
        captured.tables.add(table);

        if (table === "estimates") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi
              .fn()
              .mockReturnThis()
              .mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "est-1",
                status: "converted",
                title: "Test",
                customer_id: "cust-1",
                location_id: "loc-1",
                total_cents: 50000,
                selected_option_id: null,
                selected_option_label_snapshot: null,
                selected_option_total_cents: null,
                converted_job_id: "job-1",
                converted_invoice_id: null,
              },
              error: null,
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        } else if (table === "jobs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi
              .fn()
              .mockReturnThis()
              .mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "job-1",
                account_owner_user_id: "owner-1",
                visit_scope_items: [{ id: "vsi-1", title: "Scope 1", expected_unit_price: 500 }],
              },
              error: null,
            }),
          };
        } else if (table === "internal_invoices") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi
              .fn()
              .mockReturnThis()
              .mockReturnThis(),
            neq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { id: "inv-1" }, error: null }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
            }),
          };
        } else if (table === "internal_invoice_line_items") {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        } else if (table === "estimate_events") {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return {};
      }),
    };

    createClientMock.mockResolvedValue(supabase);

    const { recordEstimateToInvoiceDraftConversion } = await import(
      "@/lib/estimates/estimate-actions"
    );
    const result = await recordEstimateToInvoiceDraftConversion({ estimateId: "est-1" });

    expect(result.success).toBe(true);
    expect(captured.tables).not.toContain("internal_invoice_payments");
    expect(captured.tables).not.toContain("stripe");
    expect(captured.tables).not.toContain("qbo");
    expect(captured.tables).not.toContain("sms");
    expect(captured.tables).not.toContain("email");
  });
});
