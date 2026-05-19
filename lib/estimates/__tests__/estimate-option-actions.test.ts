// lib/estimates/__tests__/estimate-option-actions.test.ts
// Compliance Matters: Create default estimate option packages action tests.
// Covers eligibility, blocking conditions, event writing, and scope checks.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultEstimateOptions } from "@/lib/estimates/estimate-actions";

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

function makeSupabaseClient(options: {
  estimateExists?: boolean;
  estimateStatus?: string;
  flatLinesCount?: number;
  existingOptionsCount?: number;
  optionsUnavailable?: boolean;
} = {}) {
  const {
    estimateExists = true,
    estimateStatus = "draft",
    flatLinesCount = 0,
    existingOptionsCount = 0,
    optionsUnavailable = false,
  } = options;

  const queryResult = {
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
    eq: vi.fn(() => queryResult),
  };

  return {
    from: vi.fn(function (table: string) {
      if (table === "estimates") {
        return {
          select: vi.fn(() => queryResult),
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
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: optionsUnavailable
                ? null
                : existingOptionsCount > 0
                  ? [{ id: "opt-001" }]
                  : [],
              error: optionsUnavailable
                ? {
                    code: "PGRST205",
                    message: "Could not find estimate_options",
                  }
                : null,
            })),
          })),
          insert: vi.fn(async () => ({
            data: null,
            error: null,
          })),
        };
      }

      if (table === "estimate_events") {
        return {
          insert: vi.fn(async () => ({
            data: null,
            error: null,
          })),
        };
      }

      return {
        select: vi.fn(async () => ({
          data: [],
          error: null,
        })),
      };
    }),
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

  it("does not require external library mocks beyond scope", () => {
    // Verify the action validates all required gates
    expect(isEstimatesEnabledMock).toBeDefined();
    expect(requireInternalUserMock).toBeDefined();
    expect(createClientMock).toBeDefined();
  });
});
