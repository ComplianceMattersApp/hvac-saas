// lib/estimates/__tests__/estimate-read-helper.test.ts
// Compliance Matters: Estimate read helper V1B - multi-option support tests.
// Covers: proposalMode discriminator, flat vs. multi-option reading,
// option nesting, sort order preservation, empty safety.

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { InternalUserRow } from "@/lib/auth/internal-user";
import { getEstimateById, listEstimatesByAccount } from "../estimate-read";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const createAdminClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockInternalUser: Pick<InternalUserRow, "account_owner_user_id"> = {
  account_owner_user_id: "owner-123",
};

const mockEstimateBase = {
  id: "est-1",
  account_owner_user_id: "owner-123",
  estimate_number: "EST-20260519-ABC12345",
  customer_id: "cust-1",
  location_id: "loc-1",
  service_case_id: null,
  origin_job_id: null,
  status: "draft",
  title: "Multi-option proposal",
  notes: null,
  subtotal_cents: 50000,
  total_cents: 50000,
  sent_at: null,
  approved_at: null,
  declined_at: null,
  expired_at: null,
  cancelled_at: null,
  converted_at: null,
  created_by_user_id: "user-1",
  updated_by_user_id: "user-1",
  created_at: "2026-05-19T10:00:00Z",
  updated_at: "2026-05-19T10:00:00Z",
};

const mockLineItem = {
  id: "line-1",
  estimate_id: "est-1",
  sort_order: 1,
  source_pricebook_item_id: null,
  item_name_snapshot: "Service item",
  description_snapshot: null,
  item_type_snapshot: "service",
  category_snapshot: null,
  unit_label_snapshot: "ea",
  quantity: 1,
  unit_price_cents: 50000,
  line_subtotal_cents: 50000,
  created_at: "2026-05-19T10:00:00Z",
  updated_at: "2026-05-19T10:00:00Z",
};

const mockOption = {
  id: "opt-1",
  estimate_id: "est-1",
  slot_index: 1,
  default_label_key: "good",
  label: "Good",
  sort_order: 1,
  summary: null,
  notes: null,
  subtotal_cents: 25000,
  total_cents: 25000,
  created_at: "2026-05-19T10:00:00Z",
  updated_at: "2026-05-19T10:00:00Z",
};

const mockOptionLineItem = {
  id: "opt-line-1",
  estimate_option_id: "opt-1",
  estimate_id: "est-1",
  sort_order: 1,
  source_pricebook_item_id: null,
  item_name_snapshot: "Option service",
  description_snapshot: null,
  item_type_snapshot: "service",
  category_snapshot: null,
  unit_label_snapshot: "ea",
  quantity: 1,
  unit_price_cents: 25000,
  line_subtotal_cents: 25000,
  created_at: "2026-05-19T10:00:00Z",
  updated_at: "2026-05-19T10:00:00Z",
};

// ---------------------------------------------------------------------------
// Helper to build Supabase mock
// ---------------------------------------------------------------------------

function buildFlatEstimateSupabaseMock() {
  const secondEqChain = {
    maybeSingle: vi.fn().mockResolvedValue({
      data: mockEstimateBase,
      error: null,
    }),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "estimates") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue(secondEqChain),
            }),
          }),
        };
      } else if (table === "estimate_line_items") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [mockLineItem],
                  error: null,
                }),
              }),
            }),
          }),
        };
      } else if (table === "estimate_options") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    }),
  };
}

function buildMultiOptionSupabaseMock() {
  const secondEqChain = {
    maybeSingle: vi.fn().mockResolvedValue({
      data: mockEstimateBase,
      error: null,
    }),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "estimates") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue(secondEqChain),
            }),
          }),
        };
      } else if (table === "estimate_line_items") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }),
        };
      } else if (table === "estimate_options") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [mockOption],
                  error: null,
                }),
              }),
            }),
          }),
        };
      } else if (table === "estimate_option_line_items") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [mockOptionLineItem],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("estimate read helper - flat estimates (single_option_flat mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads as proposalMode 'single_option_flat'", async () => {
    const mockSupabase = buildFlatEstimateSupabaseMock();
    const result = await getEstimateById({
      estimateId: "est-1",
      internalUser: mockInternalUser,
      supabase: mockSupabase,
    });

    expect(result?.proposalMode).toBe("single_option_flat");
  });

  it("includes line_items array", async () => {
    const mockSupabase = buildFlatEstimateSupabaseMock();
    const result = await getEstimateById({
      estimateId: "est-1",
      internalUser: mockInternalUser,
      supabase: mockSupabase,
    });

    expect(Array.isArray(result?.line_items)).toBe(true);
  });

  it("does not include options field in single_option_flat mode", async () => {
    const mockSupabase = buildFlatEstimateSupabaseMock();
    const result = await getEstimateById({
      estimateId: "est-1",
      internalUser: mockInternalUser,
      supabase: mockSupabase,
    });

    expect(result?.options).toBeUndefined();
  });

  it("parent total_cents is not calculated from line items", async () => {
    const mockSupabase = buildFlatEstimateSupabaseMock();
    const result = await getEstimateById({
      estimateId: "est-1",
      internalUser: mockInternalUser,
      supabase: mockSupabase,
    });

    expect(result?.total_cents).toBe(mockEstimateBase.total_cents);
  });
});

describe("estimate read helper - multi-option estimates (multi_option_packages mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads as proposalMode 'multi_option_packages'", async () => {
    const mockSupabase = buildMultiOptionSupabaseMock();
    const result = await getEstimateById({
      estimateId: "est-1",
      internalUser: mockInternalUser,
      supabase: mockSupabase,
    });

    expect(result?.proposalMode).toBe("multi_option_packages");
  });

  it("includes options array", async () => {
    const mockSupabase = buildMultiOptionSupabaseMock();
    const result = await getEstimateById({
      estimateId: "est-1",
      internalUser: mockInternalUser,
      supabase: mockSupabase,
    });

    expect(Array.isArray(result?.options)).toBe(true);
    expect(result?.options?.length).toBe(1);
  });

  it("nests option line items under parent option", async () => {
    const mockSupabase = buildMultiOptionSupabaseMock();
    const result = await getEstimateById({
      estimateId: "est-1",
      internalUser: mockInternalUser,
      supabase: mockSupabase,
    });

    const option = result?.options?.[0];
    expect(option?.line_items?.length).toBe(1);
    expect(option?.line_items?.[0]?.estimate_option_id).toBe("opt-1");
  });

  it("parent total_cents is independent of option totals", async () => {
    const mockSupabase = buildMultiOptionSupabaseMock();
    const result = await getEstimateById({
      estimateId: "est-1",
      internalUser: mockInternalUser,
      supabase: mockSupabase,
    });

    expect(result?.total_cents).toBe(mockEstimateBase.total_cents);
    const optionTotalSum = result?.options?.reduce((sum, opt) => sum + opt.total_cents, 0) ?? 0;
    expect(result?.total_cents).not.toBe(optionTotalSum);
  });
});

describe("estimate read helper - safety and scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for estimate not in account scope", async () => {
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "estimates") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    const result = await getEstimateById({
      estimateId: "est-999",
      internalUser: { account_owner_user_id: "other-owner" },
      supabase: mockSupabase,
    });

    expect(result).toBeNull();
  });

  it("returns null for nonexistent estimate", async () => {
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "estimates") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    const result = await getEstimateById({
      estimateId: "99999999-9999-9999-9999-999999999999",
      internalUser: mockInternalUser,
      supabase: mockSupabase,
    });

    expect(result).toBeNull();
  });
});

describe("estimate read helper - type contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("EstimateReadResult always includes proposalMode", async () => {
    const mockSupabase = buildFlatEstimateSupabaseMock();
    const result = await getEstimateById({
      estimateId: "est-1",
      internalUser: mockInternalUser,
      supabase: mockSupabase,
    });

    expect(result?.proposalMode).toBeDefined();
    expect(["single_option_flat", "multi_option_packages"]).toContain(result?.proposalMode);
  });

  it("EstimateReadResult always includes line_items", async () => {
    const mockSupabase = buildFlatEstimateSupabaseMock();
    const result = await getEstimateById({
      estimateId: "est-1",
      internalUser: mockInternalUser,
      supabase: mockSupabase,
    });

    expect(Array.isArray(result?.line_items)).toBe(true);
  });
});

describe("estimate list helper - proposal mode summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks multi-option estimates while preserving flat rows", async () => {
    const estimates = [
      {
        id: "est-flat",
        estimate_number: "EST-20260519-AAAA1111",
        customer_id: null,
        location_id: null,
        status: "draft",
        title: "Flat estimate",
        subtotal_cents: 1000,
        total_cents: 1000,
        created_at: "2026-05-19T10:00:00Z",
        updated_at: "2026-05-19T10:00:00Z",
      },
      {
        id: "est-multi",
        estimate_number: "EST-20260519-BBBB2222",
        customer_id: null,
        location_id: null,
        status: "draft",
        title: "Multi-option estimate",
        subtotal_cents: 2000,
        total_cents: 2000,
        created_at: "2026-05-19T11:00:00Z",
        updated_at: "2026-05-19T11:00:00Z",
      },
    ];

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "estimates") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: estimates, error: null }),
              }),
            }),
          };
        }

        if (table === "estimate_options") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ estimate_id: "est-multi" }],
                error: null,
              }),
            }),
          };
        }

        return {};
      }),
    };

    const result = await listEstimatesByAccount({
      internalUser: { account_owner_user_id: "owner-123" },
      supabase: mockSupabase,
    });

    expect(result.map((estimate) => estimate.proposalMode)).toEqual([
      "single_option_flat",
      "multi_option_packages",
    ]);
  });
});
