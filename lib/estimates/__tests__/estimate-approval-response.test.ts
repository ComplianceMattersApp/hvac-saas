// lib/estimates/__tests__/estimate-approval-response.test.ts
// Compliance Matters: Estimate approval response V1 tests.
// Covers: flat estimate approval, multi-option approval with option selection,
//         guard failures, missing/wrong option, already-terminal estimates.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  recordEstimateApprovalResponse,
} from "@/lib/estimates/estimate-actions";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const isEstimatesEnabledMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

vi.mock("@/lib/estimates/estimate-exposure", () => ({
  isEstimatesEnabled: (...args: unknown[]) => isEstimatesEnabledMock(...args),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACCOUNT_OWNER = "owner-aaa";
const USER_ID = "user-111";
const ESTIMATE_ID = "est-001";
const OPTION_ID = "opt-good";

function makeInternalUser() {
  return {
    internalUser: {
      user_id: USER_ID,
      account_owner_user_id: ACCOUNT_OWNER,
      role: "admin" as const,
      is_active: true,
      created_by: null,
    },
  };
}

/**
 * Build a mock Supabase client that supports the query chains used in
 * recordEstimateApprovalResponse.
 *
 * estimateRow: the estimate to return from the main select, or null
 * optionCountRows: rows from estimate_options count query ([] = flat, [{}] = multi-option)
 * optionRow: option row to return when loading a specific option by id
 * updateError: simulate update failure
 * insertEventError: simulate event insert failure
 */
function buildSupabaseMock(options: {
  estimateRow: Record<string, unknown> | null;
  optionCountRows?: Array<Record<string, unknown>>;
  optionRow?: Record<string, unknown> | null;
  updateError?: string | null;
  insertEventError?: string | null;
}) {
  const {
    estimateRow,
    optionCountRows = [],
    optionRow = null,
    updateError = null,
    insertEventError = null,
  } = options;

  let callIndex = 0;

  const makeChain = (returnData: unknown, returnError: unknown = null) => {
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: returnData, error: returnError })),
      update: vi.fn(() => chain),
      insert: vi.fn(() => chain),
      then: (resolve: any) =>
        Promise.resolve({ data: returnData, error: returnError }).then(resolve),
    };
    return chain;
  };

  const supabase: any = {
    from: vi.fn((table: string) => {
      if (table === "estimates") {
        // Could be select or update
        const estimateChain: any = {
          select: vi.fn(() => {
            const selectChain: any = {
              eq: vi.fn(() => selectChain),
              maybeSingle: vi.fn(async () => ({
                data: estimateRow,
                error: null,
              })),
            };
            return selectChain;
          }),
          update: vi.fn(() => {
            const updateChain: any = {
              eq: vi.fn(() => updateChain),
              then: (resolve: any) =>
                Promise.resolve({ data: null, error: updateError ? { message: updateError } : null }).then(resolve),
            };
            return updateChain;
          }),
        };
        return estimateChain;
      }

      if (table === "estimate_options") {
        callIndex++;
        // First call: count query (limit(1)) → returns optionCountRows
        // Second call: load specific option by id → returns optionRow
        if (callIndex === 1) {
          // Count query chain
          const countChain: any = {
            select: vi.fn(() => countChain),
            eq: vi.fn(() => countChain),
            limit: vi.fn(() => ({
              then: (resolve: any) =>
                Promise.resolve({ data: optionCountRows, error: null }).then(resolve),
            })),
          };
          return countChain;
        } else {
          // Option load chain
          const optChain: any = {
            select: vi.fn(() => optChain),
            eq: vi.fn(() => optChain),
            maybeSingle: vi.fn(async () => ({
              data: optionRow,
              error: null,
            })),
          };
          return optChain;
        }
      }

      if (table === "estimate_events") {
        return {
          insert: vi.fn(async () => ({
            data: null,
            error: insertEventError ? { message: insertEventError } : null,
          })),
        };
      }

      return makeChain(null);
    }),
  };

  return supabase;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("recordEstimateApprovalResponse — feature flag guard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    callIndexReset();
  });

  it("returns unavailable when flag is off", async () => {
    isEstimatesEnabledMock.mockReturnValue(false);

    const result = await recordEstimateApprovalResponse({ estimateId: ESTIMATE_ID });

    expect(result).toEqual({
      success: false,
      error: "Estimates are currently unavailable.",
    });
    expect(requireInternalUserMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

let _callIndex = 0;
function callIndexReset() {
  _callIndex = 0;
}

// ---------------------------------------------------------------------------
// Flat estimate approval
// ---------------------------------------------------------------------------

describe("recordEstimateApprovalResponse — flat estimate (single_option_flat)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    callIndexReset();
    isEstimatesEnabledMock.mockReturnValue(true);
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
  });

  it("approves a flat sent estimate without option selection", async () => {
    const supabase = buildSupabaseMock({
      estimateRow: {
        id: ESTIMATE_ID,
        status: "sent",
        account_owner_user_id: ACCOUNT_OWNER,
      },
      optionCountRows: [],   // no options → flat mode
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await recordEstimateApprovalResponse({ estimateId: ESTIMATE_ID });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.proposalMode).toBe("single_option_flat");
      expect(result.selectedOptionId).toBeNull();
      expect(result.selectedOptionLabelSnapshot).toBeNull();
      expect(result.selectedOptionTotalCents).toBeNull();
      expect(result.responseNote).toBeNull();
    }
  });

  it("records optional response note on flat approval", async () => {
    const supabase = buildSupabaseMock({
      estimateRow: {
        id: ESTIMATE_ID,
        status: "sent",
        account_owner_user_id: ACCOUNT_OWNER,
      },
      optionCountRows: [],
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await recordEstimateApprovalResponse({
      estimateId: ESTIMATE_ID,
      responseNote: "Customer verbally agreed on the phone.",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.responseNote).toBe("Customer verbally agreed on the phone.");
    }
  });

  it("rejects flat approval when selectedOptionId is incorrectly provided", async () => {
    const supabase = buildSupabaseMock({
      estimateRow: {
        id: ESTIMATE_ID,
        status: "sent",
        account_owner_user_id: ACCOUNT_OWNER,
      },
      optionCountRows: [], // flat mode
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await recordEstimateApprovalResponse({
      estimateId: ESTIMATE_ID,
      selectedOptionId: OPTION_ID, // should not be provided for flat
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/must not be provided for flat/i);
    }
  });

  it("rejects approval when estimate is not in sent status", async () => {
    const supabase = buildSupabaseMock({
      estimateRow: {
        id: ESTIMATE_ID,
        status: "draft",
        account_owner_user_id: ACCOUNT_OWNER,
      },
      optionCountRows: [],
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await recordEstimateApprovalResponse({ estimateId: ESTIMATE_ID });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/requires estimate status 'sent'/i);
    }
  });

  it("rejects approval when estimate is already approved (terminal)", async () => {
    const supabase = buildSupabaseMock({
      estimateRow: {
        id: ESTIMATE_ID,
        status: "approved",
        account_owner_user_id: ACCOUNT_OWNER,
      },
      optionCountRows: [],
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await recordEstimateApprovalResponse({ estimateId: ESTIMATE_ID });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/requires estimate status 'sent'/i);
    }
  });

  it("rejects when estimate is not found in this account", async () => {
    const supabase = buildSupabaseMock({ estimateRow: null });
    createClientMock.mockResolvedValue(supabase);

    const result = await recordEstimateApprovalResponse({ estimateId: ESTIMATE_ID });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/not found/i);
    }
  });

  it("returns error when estimate_id is missing", async () => {
    isEstimatesEnabledMock.mockReturnValue(true);
    requireInternalUserMock.mockResolvedValue(makeInternalUser());

    const result = await recordEstimateApprovalResponse({ estimateId: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/required/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Multi-option estimate approval
// ---------------------------------------------------------------------------

describe("recordEstimateApprovalResponse — multi-option proposal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    callIndexReset();
    isEstimatesEnabledMock.mockReturnValue(true);
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
  });

  it("approves a multi-option estimate with valid option selection and snapshots the label and total", async () => {
    const supabase = buildSupabaseMock({
      estimateRow: {
        id: ESTIMATE_ID,
        status: "sent",
        account_owner_user_id: ACCOUNT_OWNER,
      },
      optionCountRows: [{ id: OPTION_ID }], // multi-option mode
      optionRow: {
        id: OPTION_ID,
        label: "Better",
        total_cents: 375000,
      },
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await recordEstimateApprovalResponse({
      estimateId: ESTIMATE_ID,
      selectedOptionId: OPTION_ID,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.proposalMode).toBe("multi_option_packages");
      expect(result.selectedOptionId).toBe(OPTION_ID);
      expect(result.selectedOptionLabelSnapshot).toBe("Better");
      expect(result.selectedOptionTotalCents).toBe(375000);
    }
  });

  it("snapshots label and total even when a custom label is used (not default_label_key)", async () => {
    const supabase = buildSupabaseMock({
      estimateRow: {
        id: ESTIMATE_ID,
        status: "sent",
        account_owner_user_id: ACCOUNT_OWNER,
      },
      optionCountRows: [{ id: OPTION_ID }],
      optionRow: {
        id: OPTION_ID,
        label: "Premium Comfort Package",
        total_cents: 480000,
      },
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await recordEstimateApprovalResponse({
      estimateId: ESTIMATE_ID,
      selectedOptionId: OPTION_ID,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.selectedOptionLabelSnapshot).toBe("Premium Comfort Package");
      expect(result.selectedOptionTotalCents).toBe(480000);
    }
  });

  it("rejects multi-option approval when selectedOptionId is omitted", async () => {
    const supabase = buildSupabaseMock({
      estimateRow: {
        id: ESTIMATE_ID,
        status: "sent",
        account_owner_user_id: ACCOUNT_OWNER,
      },
      optionCountRows: [{ id: OPTION_ID }],
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await recordEstimateApprovalResponse({ estimateId: ESTIMATE_ID });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/selected_option_id is required/i);
    }
  });

  it("rejects when selectedOptionId does not belong to this estimate", async () => {
    const supabase = buildSupabaseMock({
      estimateRow: {
        id: ESTIMATE_ID,
        status: "sent",
        account_owner_user_id: ACCOUNT_OWNER,
      },
      optionCountRows: [{ id: OPTION_ID }],
      optionRow: null, // option not found
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await recordEstimateApprovalResponse({
      estimateId: ESTIMATE_ID,
      selectedOptionId: "opt-does-not-exist",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/not found on this estimate/i);
    }
  });

  it("records optional response note with multi-option approval", async () => {
    const supabase = buildSupabaseMock({
      estimateRow: {
        id: ESTIMATE_ID,
        status: "sent",
        account_owner_user_id: ACCOUNT_OWNER,
      },
      optionCountRows: [{ id: OPTION_ID }],
      optionRow: {
        id: OPTION_ID,
        label: "Good",
        total_cents: 150000,
      },
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await recordEstimateApprovalResponse({
      estimateId: ESTIMATE_ID,
      selectedOptionId: OPTION_ID,
      responseNote: "Owner selected basic repair option.",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.responseNote).toBe("Owner selected basic repair option.");
    }
  });
});

// ---------------------------------------------------------------------------
// buildEstimateApprovalViewModel (domain helper)
// ---------------------------------------------------------------------------

describe("buildEstimateApprovalViewModel", () => {
  describe("estimate read schema-missing compatibility", () => {
    it("normalizes missing approval columns to null and readiness false", async () => {
      const { getEstimateById } = await import("@/lib/estimates/estimate-read");
      // Simulate a row missing the new columns
      const fakeRow = {
        id: ESTIMATE_ID,
        account_owner_user_id: ACCOUNT_OWNER,
        status: "sent",
        approved_at: null,
        declined_at: null,
        // no selected_option_id, selected_option_label_snapshot, selected_option_total_cents, response_note
      };
      // Mock supports .from().select().eq().eq().maybeSingle()
      const supabase = {
        from: (table: string) => {
          if (table === "estimates") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: fakeRow, error: null }),
                  }),
                }),
              }),
            };
          }
          // For options/line_items, must support .select().eq().order().order()
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  order: () => ({
                    // Simulate no options/line_items
                    data: [],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        },
      };
      const result = await getEstimateById({ estimateId: ESTIMATE_ID, internalUser: { account_owner_user_id: ACCOUNT_OWNER }, supabase });
      expect(result).not.toBeNull();
      // @ts-expect-error test: result is not null
      expect(result.selected_option_id).toBeNull();
      // @ts-expect-error test: result is not null
      expect(result.selected_option_label_snapshot).toBeNull();
      // @ts-expect-error test: result is not null
      expect(result.selected_option_total_cents).toBeNull();
      // @ts-expect-error test: result is not null
      expect(result.response_note).toBeNull();
      // @ts-expect-error test: result is not null
      expect(result.approvalResponseSchemaReady).toBe(false);
    });

    it("sets approvalResponseSchemaReady true when all columns present", async () => {
      const { getEstimateById } = await import("@/lib/estimates/estimate-read");
      const fakeRow = {
        id: ESTIMATE_ID,
        account_owner_user_id: ACCOUNT_OWNER,
        status: "sent",
        approved_at: null,
        declined_at: null,
        selected_option_id: null,
        selected_option_label_snapshot: null,
        selected_option_total_cents: null,
        response_note: null,
      };
      // Mock supports .from().select().eq().eq().maybeSingle()
      const supabase = {
        from: (table: string) => {
          if (table === "estimates") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: fakeRow, error: null }),
                  }),
                }),
              }),
            };
          }
          // For options/line_items, must support .select().eq().order().order()
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  order: () => ({
                    // Simulate no options/line_items
                    data: [],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        },
      };
      const result = await getEstimateById({ estimateId: ESTIMATE_ID, internalUser: { account_owner_user_id: ACCOUNT_OWNER }, supabase });
      expect(result).not.toBeNull();
      // @ts-expect-error test: result is not null
      expect(result.approvalResponseSchemaReady).toBe(true);
    });
  });

  describe("recordEstimateApprovalResponse — schema-missing error handling", () => {
    beforeEach(() => {
      vi.resetAllMocks();
      isEstimatesEnabledMock.mockReturnValue(true);
      requireInternalUserMock.mockResolvedValue(makeInternalUser());
    });

    it("returns approval_response_schema_unavailable on missing-column error (42703)", async () => {
      createClientMock.mockResolvedValue({
        from(table: string) {
          if (table === "estimates") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { id: ESTIMATE_ID, status: "sent", account_owner_user_id: ACCOUNT_OWNER }, error: null }),
                  }),
                }),
              }),
              update: () => ({
                eq: () => ({
                  error: { code: "42703", message: "column does not exist" },
                }),
              }),
            };
          }
          if (table === "estimate_options") {
            return {
              select: () => ({
                eq: () => ({
                  limit: () => ({
                    then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
                  }),
                  order: () => ({
                    order: () => ({
                      data: [],
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  order: () => ({
                    data: [],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        },
      });
      const result = await recordEstimateApprovalResponse({ estimateId: ESTIMATE_ID });
      expect(result).toEqual({ success: false, error: "approval_response_schema_unavailable" });
    });

    it("returns approval_response_schema_unavailable on missing-column error (message only)", async () => {
      createClientMock.mockResolvedValue({
        from(table: string) {
          if (table === "estimates") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { id: ESTIMATE_ID, status: "sent", account_owner_user_id: ACCOUNT_OWNER }, error: null }),
                  }),
                }),
              }),
              update: () => ({
                eq: () => ({
                  error: { message: "column selected_option_id does not exist" },
                }),
              }),
            };
          }
          if (table === "estimate_options") {
            return {
              select: () => ({
                eq: () => ({
                  limit: () => ({
                    then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
                  }),
                  order: () => ({
                    order: () => ({
                      data: [],
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  order: () => ({
                    data: [],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        },
      });
      const result = await recordEstimateApprovalResponse({ estimateId: ESTIMATE_ID });
      expect(result).toEqual({ success: false, error: "approval_response_schema_unavailable" });
    });
  });
  it("returns no_response for draft estimate", async () => {
    const { buildEstimateApprovalViewModel } = await import(
      "@/lib/estimates/estimate-domain"
    );

    const vm = buildEstimateApprovalViewModel({
      estimate: {
        status: "draft",
        approved_at: null,
        declined_at: null,
        selected_option_id: null,
        selected_option_label_snapshot: null,
        selected_option_total_cents: null,
        response_note: null,
      },
      proposalMode: "single_option_flat",
    });

    expect(vm.approvalStatus).toBe("no_response");
    expect(vm.responseSource).toBeNull();
    expect(vm.selectedOptionId).toBeNull();
  });

  it("returns approved with responseSource=internal for approved estimate", async () => {
    const { buildEstimateApprovalViewModel } = await import(
      "@/lib/estimates/estimate-domain"
    );

    const vm = buildEstimateApprovalViewModel({
      estimate: {
        status: "approved",
        approved_at: "2026-05-20T12:00:00Z",
        declined_at: null,
        selected_option_id: OPTION_ID,
        selected_option_label_snapshot: "Better",
        selected_option_total_cents: 375000,
        response_note: null,
      },
      proposalMode: "multi_option_packages",
    });

    expect(vm.approvalStatus).toBe("approved");
    expect(vm.responseSource).toBe("internal");
    expect(vm.selectedOptionId).toBe(OPTION_ID);
    expect(vm.selectedOptionLabel).toBe("Better");
    expect(vm.selectedOptionTotalCents).toBe(375000);
  });

  it("returns declined with responseSource=internal for declined estimate", async () => {
    const { buildEstimateApprovalViewModel } = await import(
      "@/lib/estimates/estimate-domain"
    );

    const vm = buildEstimateApprovalViewModel({
      estimate: {
        status: "declined",
        approved_at: null,
        declined_at: "2026-05-20T14:00:00Z",
        selected_option_id: null,
        selected_option_label_snapshot: null,
        selected_option_total_cents: null,
        response_note: "Customer chose competitor.",
      },
      proposalMode: "single_option_flat",
    });

    expect(vm.approvalStatus).toBe("declined");
    expect(vm.responseSource).toBe("internal");
    expect(vm.declinedAt).toBe("2026-05-20T14:00:00Z");
    expect(vm.responseNote).toBe("Customer chose competitor.");
  });

  it("returns no_response for sent estimate awaiting response", async () => {
    const { buildEstimateApprovalViewModel } = await import(
      "@/lib/estimates/estimate-domain"
    );

    const vm = buildEstimateApprovalViewModel({
      estimate: {
        status: "sent",
        approved_at: null,
        declined_at: null,
        selected_option_id: null,
        selected_option_label_snapshot: null,
        selected_option_total_cents: null,
        response_note: null,
      },
      proposalMode: "multi_option_packages",
    });

    expect(vm.approvalStatus).toBe("no_response");
    expect(vm.responseSource).toBeNull();
  });

  it("preserves proposalMode in output", async () => {
    const { buildEstimateApprovalViewModel } = await import(
      "@/lib/estimates/estimate-domain"
    );

    const flatVm = buildEstimateApprovalViewModel({
      estimate: {
        status: "approved",
        approved_at: "2026-05-20T10:00:00Z",
        declined_at: null,
        selected_option_id: null,
        selected_option_label_snapshot: null,
        selected_option_total_cents: null,
        response_note: null,
      },
      proposalMode: "single_option_flat",
    });
    expect(flatVm.proposalMode).toBe("single_option_flat");
    expect(flatVm.isFlatEstimate).toBe(true);

    const multiVm = buildEstimateApprovalViewModel({
      estimate: {
        status: "approved",
        approved_at: "2026-05-20T10:00:00Z",
        declined_at: null,
        selected_option_id: OPTION_ID,
        selected_option_label_snapshot: "Best",
        selected_option_total_cents: 600000,
        response_note: null,
      },
      proposalMode: "multi_option_packages",
    });
    expect(multiVm.proposalMode).toBe("multi_option_packages");
    expect(multiVm.isFlatEstimate).toBe(false);
  });
});
