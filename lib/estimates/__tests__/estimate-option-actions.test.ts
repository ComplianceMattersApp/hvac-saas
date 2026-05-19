// lib/estimates/__tests__/estimate-option-actions.test.ts
// Compliance Matters: Estimate option package action tests.
// Covers default package creation and draft-only option metadata editing.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultEstimateOptions,
  updateEstimateOptionMetadata,
} from "@/lib/estimates/estimate-actions";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const isEstimatesEnabledMock = vi.fn();

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

// ---------------------------------------------------------------------------
// Test fixtures and helpers
// ---------------------------------------------------------------------------

const ACCOUNT_OWNER = "owner-aaa";
const USER_ID = "user-111";
const ESTIMATE_ID = "est-001";
const OPTION_ID = "opt-001";

function makeInternalUser(accountOwnerUserId = ACCOUNT_OWNER) {
  return {
    internalUser: {
      user_id: USER_ID,
      account_owner_user_id: accountOwnerUserId,
      role: "admin" as const,
      is_active: true,
      created_by: null,
    },
  };
}

function makeThenableResult(result: unknown) {
  const chain: any = {
    eq: vi.fn(() => chain),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

function makeSupabaseClient(
  options: {
    estimateExists?: boolean;
    estimateStatus?: string;
    flatLinesCount?: number;
    existingOptionsCount?: number;
    optionsUnavailable?: boolean;
    optionExists?: boolean;
  } = {}
) {
  const {
    estimateExists = true,
    estimateStatus = "draft",
    flatLinesCount = 0,
    existingOptionsCount = 0,
    optionsUnavailable = false,
    optionExists = true,
  } = options;

  const insertedRows: Array<{ table: string; payload: unknown }> = [];
  const updatedRows: Array<{ table: string; payload: Record<string, unknown> }> = [];

  const estimateQuery = {
    maybeSingle: vi.fn(async () => ({
      data: estimateExists
        ? {
            id: ESTIMATE_ID,
            status: estimateStatus,
            account_owner_user_id: ACCOUNT_OWNER,
          }
        : null,
      error: null,
    })),
    eq: vi.fn(() => estimateQuery),
  };

  function makeOptionSelectChain() {
    const listResult = {
      data: optionsUnavailable
        ? null
        : existingOptionsCount > 0
          ? [{ id: OPTION_ID }]
          : [],
      error: optionsUnavailable
        ? {
            code: "PGRST205",
            message: "Could not find estimate_options",
          }
        : null,
    };

    const chain: any = {
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({
        data:
          !optionsUnavailable && optionExists
            ? {
                id: OPTION_ID,
                estimate_id: ESTIMATE_ID,
                default_label_key: "good",
                slot_index: 1,
                sort_order: 1,
                subtotal_cents: 12300,
                total_cents: 12300,
              }
            : null,
        error: optionsUnavailable
          ? {
              code: "PGRST205",
              message: "Could not find estimate_options",
            }
          : null,
      })),
      then: (resolve: any, reject: any) => Promise.resolve(listResult).then(resolve, reject),
    };
    return chain;
  }

  return {
    from: vi.fn(function (table: string) {
      if (table === "estimates") {
        return {
          select: vi.fn(() => estimateQuery),
        };
      }

      if (table === "estimate_line_items") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(async () => ({
                data: flatLinesCount > 0 ? [{ id: "line-001" }] : [],
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "estimate_options") {
        return {
          select: vi.fn(() => makeOptionSelectChain()),
          insert: vi.fn(async (payload: unknown) => {
            insertedRows.push({ table, payload });
            return { data: null, error: null };
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            updatedRows.push({ table, payload });
            return makeThenableResult({ data: null, error: null });
          }),
        };
      }

      if (table === "estimate_events") {
        return {
          insert: vi.fn(async (payload: unknown) => {
            insertedRows.push({ table, payload });
            return { data: null, error: null };
          }),
        };
      }

      return {
        select: vi.fn(async () => ({
          data: [],
          error: null,
        })),
      };
    }),
    __insertedRows: insertedRows,
    __updatedRows: updatedRows,
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createDefaultEstimateOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isEstimatesEnabledMock.mockReturnValue(true);
  });

  it("creates exactly three default options for eligible empty draft estimate", async () => {
    const supabase = makeSupabaseClient({
      estimateExists: true,
      estimateStatus: "draft",
      flatLinesCount: 0,
      existingOptionsCount: 0,
    });

    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);

    const result = await createDefaultEstimateOptions({ estimateId: ESTIMATE_ID });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.createdOptions).toBe(3);
      expect(result.estimateId).toBe(ESTIMATE_ID);
    }
  });

  it("blocks if flat estimate_line_items exist", async () => {
    const supabase = makeSupabaseClient({
      estimateExists: true,
      estimateStatus: "draft",
      flatLinesCount: 1,
      existingOptionsCount: 0,
    });

    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);

    const result = await createDefaultEstimateOptions({ estimateId: ESTIMATE_ID });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("flat line items");
    }
  });

  it("blocks if options already exist", async () => {
    const supabase = makeSupabaseClient({
      estimateExists: true,
      estimateStatus: "draft",
      flatLinesCount: 0,
      existingOptionsCount: 1,
    });

    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);

    const result = await createDefaultEstimateOptions({ estimateId: ESTIMATE_ID });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("already has option packages");
    }
  });

  it("blocks if estimate is not draft", async () => {
    const supabase = makeSupabaseClient({
      estimateExists: true,
      estimateStatus: "sent",
      flatLinesCount: 0,
      existingOptionsCount: 0,
    });

    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);

    const result = await createDefaultEstimateOptions({ estimateId: ESTIMATE_ID });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("draft");
    }
  });

  it("blocks cross-account access", async () => {
    const supabase = makeSupabaseClient({
      estimateExists: false,
    });

    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);

    const result = await createDefaultEstimateOptions({ estimateId: ESTIMATE_ID });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not found");
    }
  });

  it("respects ENABLE_ESTIMATES feature flag", async () => {
    isEstimatesEnabledMock.mockReturnValue(false);

    const result = await createDefaultEstimateOptions({ estimateId: ESTIMATE_ID });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("unavailable");
    }
  });

  it("handles missing option schema gracefully", async () => {
    const supabase = makeSupabaseClient({
      estimateExists: true,
      estimateStatus: "draft",
      flatLinesCount: 0,
      existingOptionsCount: 0,
      optionsUnavailable: true,
    });

    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);

    const result = await createDefaultEstimateOptions({ estimateId: ESTIMATE_ID });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not available");
    }
  });

  it("requires estimate_id parameter", async () => {
    const supabase = makeSupabaseClient();

    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);

    const result = await createDefaultEstimateOptions({ estimateId: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("required");
    }
  });
});

describe("updateEstimateOptionMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isEstimatesEnabledMock.mockReturnValue(true);
  });

  it("updates trimmed label and summary for draft multi-option estimate", async () => {
    const supabase = makeSupabaseClient();

    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);

    const result = await updateEstimateOptionMetadata({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      label: "  Repair Only  ",
      summary: "  Replace the failed component and preserve existing equipment.  ",
    });

    expect(result).toEqual({
      success: true,
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      label: "Repair Only",
      summary: "Replace the failed component and preserve existing equipment.",
    });
    expect(supabase.__updatedRows).toHaveLength(1);
    expect(supabase.__updatedRows[0].payload).toMatchObject({
      label: "Repair Only",
      summary: "Replace the failed component and preserve existing equipment.",
      updated_by_user_id: USER_ID,
    });
  });

  it("rejects empty label", async () => {
    const result = await updateEstimateOptionMetadata({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      label: "   ",
      summary: "Summary",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("label is required");
    }
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("blocks non-draft estimate", async () => {
    const supabase = makeSupabaseClient({ estimateStatus: "sent" });

    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);

    const result = await updateEstimateOptionMetadata({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      label: "Repair Only",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("draft");
    }
    expect(supabase.__updatedRows).toHaveLength(0);
  });

  it("blocks cross-account/out-of-scope estimate", async () => {
    const supabase = makeSupabaseClient({ estimateExists: false });

    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);

    const result = await updateEstimateOptionMetadata({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      label: "Repair Only",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not found");
    }
    expect(supabase.__updatedRows).toHaveLength(0);
  });

  it("blocks option not belonging to estimate", async () => {
    const supabase = makeSupabaseClient({ optionExists: false });

    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);

    const result = await updateEstimateOptionMetadata({
      estimateId: ESTIMATE_ID,
      estimateOptionId: "opt-other",
      label: "Repair Only",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not found");
    }
    expect(supabase.__updatedRows).toHaveLength(0);
  });

  it("preserves option identity, order, and totals by omitting them from update payload", async () => {
    const supabase = makeSupabaseClient();

    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);

    await updateEstimateOptionMetadata({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      label: "Repair Only",
      summary: null,
    });

    const payload = supabase.__updatedRows[0].payload;
    expect(payload).not.toHaveProperty("default_label_key");
    expect(payload).not.toHaveProperty("slot_index");
    expect(payload).not.toHaveProperty("sort_order");
    expect(payload).not.toHaveProperty("subtotal_cents");
    expect(payload).not.toHaveProperty("total_cents");
  });

  it("writes updated_by_user_id and estimate_option_updated event", async () => {
    const supabase = makeSupabaseClient();

    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);

    await updateEstimateOptionMetadata({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      label: "Repair Only",
      summary: "Short version",
    });

    expect(supabase.__updatedRows[0].payload.updated_by_user_id).toBe(USER_ID);
    expect(supabase.__insertedRows).toContainEqual({
      table: "estimate_events",
      payload: expect.objectContaining({
        estimate_id: ESTIMATE_ID,
        event_type: "estimate_option_updated",
        user_id: USER_ID,
        meta: expect.objectContaining({
          estimate_option_id: OPTION_ID,
          default_label_key: "good",
          slot_index: 1,
          label: "Repair Only",
          has_summary: true,
        }),
      }),
    });
  });

  it("respects ENABLE_ESTIMATES fail-closed behavior", async () => {
    isEstimatesEnabledMock.mockReturnValue(false);

    const result = await updateEstimateOptionMetadata({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      label: "Repair Only",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("unavailable");
    }
    expect(createClientMock).not.toHaveBeenCalled();
  });
});
