import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveManualEstimateLineToPricebook } from "@/lib/estimates/estimate-actions";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

type LineScope = "flat" | "option";

type Fixtures = {
  estimateStatus?: string;
  estimateExists?: boolean;
  lineScope?: LineScope;
  lineExists?: boolean;
  lineSourcePricebookItemId?: string | null;
  lineItemType?: string;
  lineItemName?: string;
  lineUnitPriceCents?: number;
  lineCategory?: string | null;
  lineUnitLabel?: string | null;
  lineDescription?: string | null;
  duplicateRows?: Array<{ id: string; item_name: string; category: string | null }>;
  insertFails?: boolean;
};

function makeInternalUser() {
  return {
    internalUser: {
      user_id: "user-1",
      account_owner_user_id: "owner-1",
      role: "admin",
      is_active: true,
      created_by: null,
    },
  };
}

function makeAwaitableRows(rows: unknown[] | null, error: string | null = null) {
  const response = {
    data: rows,
    error: error ? { message: error } : null,
  };
  const chain: any = {
    eq: vi.fn(() => chain),
    then: (resolve: (v: typeof response) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  return chain;
}

function makeScopedMaybeSingleRow(row: unknown, error: string | null = null) {
  const response = {
    data: row,
    error: error ? { message: error } : null,
  };
  const chain: any = {
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => response),
  };
  return chain;
}

function makeSupabase(fixtures: Fixtures = {}) {
  const lineScope = fixtures.lineScope ?? "flat";
  const estimateStatus = fixtures.estimateStatus ?? "draft";
  const estimateExists = fixtures.estimateExists ?? true;
  const lineExists = fixtures.lineExists ?? true;
  const lineSourcePricebookItemId = fixtures.lineSourcePricebookItemId ?? null;
  const lineItemType = fixtures.lineItemType ?? "service";
  const lineItemName = fixtures.lineItemName ?? "Manual Line";
  const lineUnitPriceCents = fixtures.lineUnitPriceCents ?? 1234;
  const lineCategory = fixtures.lineCategory ?? "Compliance";
  const lineUnitLabel = fixtures.lineUnitLabel ?? "each";
  const lineDescription = fixtures.lineDescription ?? "line description";
  const duplicateRows = fixtures.duplicateRows ?? [];
  const insertFails = fixtures.insertFails ?? false;

  const insertedPricebookPayloads: Array<Record<string, unknown>> = [];
  const insertedEvents: Array<Record<string, unknown>> = [];

  const estimateRow = estimateExists
    ? {
        id: "est-1",
        status: estimateStatus,
        account_owner_user_id: "owner-1",
      }
    : null;

  const lineRow = lineExists
    ? {
        id: "line-1",
        estimate_id: "est-1",
        estimate_option_id: lineScope === "option" ? "opt-1" : undefined,
        source_pricebook_item_id: lineSourcePricebookItemId,
        item_name_snapshot: lineItemName,
        description_snapshot: lineDescription,
        item_type_snapshot: lineItemType,
        category_snapshot: lineCategory,
        unit_label_snapshot: lineUnitLabel,
        unit_price_cents: lineUnitPriceCents,
      }
    : null;

  return {
    from: vi.fn((table: string) => {
      if (table === "estimates") {
        return {
          select: vi.fn(() => makeScopedMaybeSingleRow(estimateRow)),
        };
      }

      if (table === "estimate_line_items") {
        return {
          select: vi.fn(() => makeScopedMaybeSingleRow(lineScope === "flat" ? lineRow : null)),
        };
      }

      if (table === "estimate_option_line_items") {
        return {
          select: vi.fn(() => makeScopedMaybeSingleRow(lineScope === "option" ? lineRow : null)),
        };
      }

      if (table === "pricebook_items") {
        return {
          select: vi.fn(() => makeAwaitableRows(duplicateRows)),
          insert: vi.fn((payload: Record<string, unknown>) => {
            insertedPricebookPayloads.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () =>
                  insertFails
                    ? { data: null, error: { message: "insert failed" } }
                    : { data: { id: "pb-new-1" }, error: null }
                ),
              })),
            };
          }),
        };
      }

      if (table === "estimate_events") {
        return {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            insertedEvents.push(payload);
            return { data: null, error: null };
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    __insertedPricebookPayloads: insertedPricebookPayloads,
    __insertedEvents: insertedEvents,
  } as any;
}

describe("saveManualEstimateLineToPricebook", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.ENABLE_ESTIMATES = "true";

    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  it("creates a pricebook item from a manual flat line", async () => {
    const supabase = makeSupabase({ lineScope: "flat" });
    createClientMock.mockResolvedValue(supabase);

    const result = await saveManualEstimateLineToPricebook({
      lineScope: "flat",
      estimateId: "est-1",
      lineItemId: "line-1",
    });

    expect(result).toEqual({
      success: true,
      created: true,
      duplicate: false,
      pricebookItemId: "pb-new-1",
    });

    expect(supabase.__insertedPricebookPayloads).toHaveLength(1);
    expect(supabase.__insertedEvents).toContainEqual(
      expect.objectContaining({ event_type: "estimate_manual_line_saved_to_pricebook" })
    );
  });

  it("creates a pricebook item from a manual option line", async () => {
    const supabase = makeSupabase({ lineScope: "option" });
    createClientMock.mockResolvedValue(supabase);

    const result = await saveManualEstimateLineToPricebook({
      lineScope: "option",
      estimateId: "est-1",
      lineItemId: "line-1",
      estimateOptionId: "opt-1",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.created).toBe(true);
      expect(result.duplicate).toBe(false);
    }

    expect(supabase.__insertedPricebookPayloads).toHaveLength(1);
    expect(supabase.__insertedEvents).toContainEqual(
      expect.objectContaining({
        event_type: "estimate_manual_line_saved_to_pricebook",
        meta: expect.objectContaining({
          line_scope: "option",
          estimate_option_id: "opt-1",
        }),
      })
    );
  });

  it("returns duplicate without inserting a second item", async () => {
    const supabase = makeSupabase({
      duplicateRows: [{ id: "pb-existing-1", item_name: "manual line", category: "Compliance" }],
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await saveManualEstimateLineToPricebook({
      lineScope: "flat",
      estimateId: "est-1",
      lineItemId: "line-1",
    });

    expect(result).toEqual({
      success: true,
      created: false,
      duplicate: true,
      pricebookItemId: "pb-existing-1",
    });

    expect(supabase.__insertedPricebookPayloads).toHaveLength(0);
    expect(supabase.__insertedEvents).toContainEqual(
      expect.objectContaining({ event_type: "estimate_manual_line_save_to_pricebook_duplicate" })
    );
  });

  it("blocks pricebook-backed lines", async () => {
    const supabase = makeSupabase({ lineSourcePricebookItemId: "pb-1" });
    createClientMock.mockResolvedValue(supabase);

    const result = await saveManualEstimateLineToPricebook({
      lineScope: "flat",
      estimateId: "est-1",
      lineItemId: "line-1",
    });

    expect(result).toEqual({
      success: false,
      error: "Only manual line items can be saved to Pricebook.",
    });
  });

  it.each(["install", "other"])("blocks unsupported %s line item types", async (itemType) => {
    const supabase = makeSupabase({ lineItemType: itemType });
    createClientMock.mockResolvedValue(supabase);

    const result = await saveManualEstimateLineToPricebook({
      lineScope: "flat",
      estimateId: "est-1",
      lineItemId: "line-1",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("service, material, and diagnostic");
    }
  });

  it("blocks non-draft estimates", async () => {
    const supabase = makeSupabase({ estimateStatus: "sent" });
    createClientMock.mockResolvedValue(supabase);

    const result = await saveManualEstimateLineToPricebook({
      lineScope: "flat",
      estimateId: "est-1",
      lineItemId: "line-1",
    });

    expect(result).toEqual({
      success: false,
      error: "Save to Pricebook is available only on draft estimates.",
    });
  });

  it("blocks cross-account estimate access", async () => {
    const supabase = makeSupabase({ estimateExists: false });
    createClientMock.mockResolvedValue(supabase);

    const result = await saveManualEstimateLineToPricebook({
      lineScope: "flat",
      estimateId: "est-foreign",
      lineItemId: "line-1",
    });

    expect(result).toEqual({
      success: false,
      error: "Estimate not found in this account.",
    });
  });

  it("blocks when entitlement guard denies mutation", async () => {
    const supabase = makeSupabase({});
    createClientMock.mockResolvedValue(supabase);
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_trial_expired",
    });

    const result = await saveManualEstimateLineToPricebook({
      lineScope: "flat",
      estimateId: "est-1",
      lineItemId: "line-1",
    });

    expect(result).toEqual({
      success: false,
      error: "Pricebook mutation blocked: blocked_trial_expired",
    });
    expect(supabase.__insertedPricebookPayloads).toHaveLength(0);
  });
});
