// lib/estimates/__tests__/estimate-option-actions.test.ts
// Compliance Matters: Estimate option package action tests.
// Covers default package creation and draft-only option metadata editing.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addEstimateOptionLineItem,
  createDefaultEstimateOptions,
  removeEstimateOptionLineItem,
  updateEstimateOptionMetadata,
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

function makePricebookAdminClient(pricebookItem: Record<string, unknown> | null = null) {
  return {
    from: vi.fn((table: string) => {
      if (table !== "pricebook_items") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
          })),
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: pricebookItem,
                  error: null,
                })),
              })),
            })),
          })),
        })),
      };
    }),
  } as any;
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

function makeOptionLineSupabaseClient(
  options: {
    estimateExists?: boolean;
    estimateStatus?: string;
    flatLinesCount?: number;
    optionExists?: boolean;
    optionLineSubtotals?: number[];
  } = {}
) {
  const {
    estimateExists = true,
    estimateStatus = "draft",
    flatLinesCount = 0,
    optionExists = true,
    optionLineSubtotals = [],
  } = options;

  const insertedRows: Array<{ table: string; payload: any }> = [];
  const updatedRows: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const deletedRows: Array<{ table: string; filters: Record<string, unknown>; deleted: number }> = [];
  const estimateUpdates: Array<Record<string, unknown>> = [];

  let optionLines = optionLineSubtotals.map((subtotal, index) => ({
    id: `opt-line-${index + 1}`,
    estimate_option_id: OPTION_ID,
    estimate_id: ESTIMATE_ID,
    sort_order: index + 1,
    item_name_snapshot: `Line ${index + 1}`,
    line_subtotal_cents: subtotal,
  }));
  let nextLineId = optionLines.length + 1;

  function matchesFilters(row: Record<string, unknown>, filters: Record<string, unknown>) {
    return Object.entries(filters).every(([key, value]) => row[key] === value);
  }

  function makeOptionLineSelectChain(selectClause: string) {
    const filters: Record<string, unknown> = {};
    const chain: any = {
      eq: vi.fn((key: string, value: unknown) => {
        filters[key] = value;
        return chain;
      }),
      order: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => {
        const row = optionLines.find((line) => matchesFilters(line, filters)) ?? null;
        if (!row) return { data: null, error: null };

        if (selectClause.includes("item_name_snapshot")) {
          return {
            data: {
              id: row.id,
              item_name_snapshot: row.item_name_snapshot,
            },
            error: null,
          };
        }

        if (selectClause === "id") {
          return { data: { id: row.id }, error: null };
        }

        return { data: row, error: null };
      }),
      then: (resolve: any, reject: any) => {
        const filtered = optionLines.filter((line) => matchesFilters(line, filters));
        const data = filtered.map((line) => {
          if (selectClause.includes("line_subtotal_cents")) {
            return { line_subtotal_cents: line.line_subtotal_cents };
          }
          if (selectClause === "id") {
            return { id: line.id };
          }
          return line;
        });
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return chain;
  }

  return {
    from: vi.fn((table: string) => {
      if (table === "estimates") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
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
              })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            estimateUpdates.push(payload);
            return makeThenableResult({ data: null, error: null });
          }),
        };
      }

      if (table === "estimate_line_items") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(async () => ({
                data: flatLinesCount > 0 ? [{ id: "line-flat-1" }] : [],
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "estimate_options") {
        const filters: Record<string, unknown> = {};
        const selectChain: any = {
          eq: vi.fn((key: string, value: unknown) => {
            filters[key] = value;
            return selectChain;
          }),
          maybeSingle: vi.fn(async () => ({
            data:
              optionExists && filters.id === OPTION_ID && filters.estimate_id === ESTIMATE_ID
                ? { id: OPTION_ID, estimate_id: ESTIMATE_ID }
                : null,
            error: null,
          })),
        };

        return {
          select: vi.fn(() => selectChain),
          update: vi.fn((payload: Record<string, unknown>) => {
            updatedRows.push({ table, payload });
            return makeThenableResult({ data: null, error: null });
          }),
        };
      }

      if (table === "estimate_option_line_items") {
        return {
          select: vi.fn((selectClause: string) => makeOptionLineSelectChain(selectClause)),
          insert: vi.fn((payload: any) => {
            insertedRows.push({ table, payload });
            const id = `opt-line-${nextLineId++}`;
            optionLines.push({
              id,
              estimate_option_id: payload.estimate_option_id,
              estimate_id: payload.estimate_id,
              sort_order: payload.sort_order,
              item_name_snapshot: payload.item_name_snapshot,
              line_subtotal_cents: payload.line_subtotal_cents,
            });
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id }, error: null })),
              })),
            };
          }),
          delete: vi.fn(() => {
            const filters: Record<string, unknown> = {};
            const chain: any = {
              eq: vi.fn((key: string, value: unknown) => {
                filters[key] = value;
                return chain;
              }),
              then: (resolve: any, reject: any) => {
                const before = optionLines.length;
                optionLines = optionLines.filter((line) => !matchesFilters(line, filters));
                const deleted = before - optionLines.length;
                deletedRows.push({ table, filters: { ...filters }, deleted });
                return Promise.resolve({ error: null }).then(resolve, reject);
              },
            };
            return chain;
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
        select: vi.fn(async () => ({ data: [], error: null })),
      };
    }),
    __insertedRows: insertedRows,
    __updatedRows: updatedRows,
    __deletedRows: deletedRows,
    __estimateUpdates: estimateUpdates,
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

describe("addEstimateOptionLineItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isEstimatesEnabledMock.mockReturnValue(true);
  });

  it("adds a manual line, computes option totals, and keeps parent totals isolated", async () => {
    const supabase = makeOptionLineSupabaseClient({ optionLineSubtotals: [5000] });
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);

    const result = await addEstimateOptionLineItem({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      itemName: "Repair Labor",
      itemType: "service",
      quantity: 2,
      unitPriceCents: 1500,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.subtotal_cents).toBe(8000);
      expect(result.total_cents).toBe(8000);
    }

    const lineInsert = supabase.__insertedRows.find((row: any) => row.table === "estimate_option_line_items");
    expect(lineInsert?.payload).toMatchObject({
      estimate_option_id: OPTION_ID,
      estimate_id: ESTIMATE_ID,
      source_pricebook_item_id: null,
      sort_order: 2,
      item_name_snapshot: "Repair Labor",
      item_type_snapshot: "service",
      quantity: 2,
      unit_price_cents: 1500,
      line_subtotal_cents: 3000,
      created_by_user_id: USER_ID,
      updated_by_user_id: USER_ID,
    });

    expect(supabase.__updatedRows).toContainEqual({
      table: "estimate_options",
      payload: expect.objectContaining({
        subtotal_cents: 8000,
        total_cents: 8000,
        updated_by_user_id: USER_ID,
      }),
    });

    expect(supabase.__estimateUpdates).toHaveLength(0);
    expect(supabase.__insertedRows).toContainEqual({
      table: "estimate_events",
      payload: expect.objectContaining({
        estimate_id: ESTIMATE_ID,
        event_type: "estimate_option_line_item_added",
        user_id: USER_ID,
      }),
    });
  });

  it("adds a pricebook-backed line with source provenance, overrides, and fallback snapshots", async () => {
    const supabase = makeOptionLineSupabaseClient({ optionLineSubtotals: [1000] });
    const admin = makePricebookAdminClient({
      id: "pb-1",
      item_name: "Catalog Compressor",
      item_type: "material",
      default_description: "Catalog description",
      category: "HVAC",
      unit_label: "ea",
      default_unit_price: 2500,
    });
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(admin);

    const result = await addEstimateOptionLineItem({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      sourcePricebookItemId: "pb-1",
      itemName: "  Installed Compressor  ",
      quantity: 2,
      unitPriceCents: 2500,
      description: "  Installed with startup  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.subtotal_cents).toBe(6000);
      expect(result.total_cents).toBe(6000);
    }

    const lineInsert = supabase.__insertedRows.find(
      (row: any) => row.table === "estimate_option_line_items"
    );
    expect(lineInsert?.payload).toMatchObject({
      estimate_option_id: OPTION_ID,
      estimate_id: ESTIMATE_ID,
      source_pricebook_item_id: "pb-1",
      item_name_snapshot: "Installed Compressor",
      description_snapshot: "Installed with startup",
      item_type_snapshot: "material",
      category_snapshot: "HVAC",
      unit_label_snapshot: "ea",
      quantity: 2,
      unit_price_cents: 2500,
      line_subtotal_cents: 5000,
    });

    expect(supabase.__estimateUpdates).toHaveLength(0);
    expect(supabase.__insertedRows).toContainEqual({
      table: "estimate_events",
      payload: expect.objectContaining({
        estimate_id: ESTIMATE_ID,
        event_type: "estimate_option_line_item_added",
        user_id: USER_ID,
        meta: expect.objectContaining({
          estimate_option_id: OPTION_ID,
          source: "pricebook",
          source_pricebook_item_id: "pb-1",
          item_name: "Installed Compressor",
          line_subtotal_cents: 5000,
          option_total_cents: 6000,
        }),
      }),
    });
  });

  it("rejects missing pricebook item", async () => {
    const supabase = makeOptionLineSupabaseClient({ optionLineSubtotals: [1000] });
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makePricebookAdminClient(null));

    const result = await addEstimateOptionLineItem({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      sourcePricebookItemId: "pb-missing",
      quantity: 1,
      unitPriceCents: 1000,
    });

    expect(result).toEqual({
      success: false,
      error: "Pricebook item not found in this account or is inactive.",
    });
  });

  it("rejects inactive pricebook item", async () => {
    const supabase = makeOptionLineSupabaseClient({ optionLineSubtotals: [1000] });
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makePricebookAdminClient(null));

    const result = await addEstimateOptionLineItem({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      sourcePricebookItemId: "pb-inactive",
      quantity: 1,
      unitPriceCents: 1000,
    });

    expect(result).toEqual({
      success: false,
      error: "Pricebook item not found in this account or is inactive.",
    });
  });

  it("rejects cross-account or out-of-scope pricebook item", async () => {
    const supabase = makeOptionLineSupabaseClient({ optionLineSubtotals: [1000] });
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makePricebookAdminClient(null));

    const result = await addEstimateOptionLineItem({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      sourcePricebookItemId: "pb-other-account",
      quantity: 1,
      unitPriceCents: 1000,
    });

    expect(result).toEqual({
      success: false,
      error: "Pricebook item not found in this account or is inactive.",
    });
  });

  it("blocks non-draft estimate", async () => {
    const supabase = makeOptionLineSupabaseClient({ estimateStatus: "sent" });
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);

    const result = await addEstimateOptionLineItem({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      itemName: "Repair Labor",
      itemType: "service",
      quantity: 1,
      unitPriceCents: 100,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("draft");
    }
  });

  it("blocks when flat line items exist", async () => {
    const supabase = makeOptionLineSupabaseClient({ flatLinesCount: 1 });
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);

    const result = await addEstimateOptionLineItem({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      itemName: "Repair Labor",
      itemType: "service",
      quantity: 1,
      unitPriceCents: 100,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("flat estimate lines");
    }
  });

  it("blocks out-of-scope estimate and unknown option", async () => {
    const supabase = makeOptionLineSupabaseClient({ estimateExists: false, optionExists: false });
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);

    const estimateResult = await addEstimateOptionLineItem({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      itemName: "Repair Labor",
      itemType: "service",
      quantity: 1,
      unitPriceCents: 100,
    });

    expect(estimateResult.success).toBe(false);
    if (!estimateResult.success) {
      expect(estimateResult.error).toContain("not found");
    }

    const supabase2 = makeOptionLineSupabaseClient({ optionExists: false });
    createClientMock.mockResolvedValue(supabase2);
    const optionResult = await addEstimateOptionLineItem({
      estimateId: ESTIMATE_ID,
      estimateOptionId: "opt-other",
      itemName: "Repair Labor",
      itemType: "service",
      quantity: 1,
      unitPriceCents: 100,
    });
    expect(optionResult.success).toBe(false);
    if (!optionResult.success) {
      expect(optionResult.error).toContain("Option package not found");
    }
  });

  it("validates required and numeric inputs", async () => {
    const missingItem = await addEstimateOptionLineItem({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      itemName: "  ",
      itemType: "service",
      quantity: 1,
      unitPriceCents: 100,
    });
    expect(missingItem.success).toBe(false);

    const invalidQty = await addEstimateOptionLineItem({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      itemName: "Repair",
      itemType: "service",
      quantity: 0,
      unitPriceCents: 100,
    });
    expect(invalidQty.success).toBe(false);

    const invalidUnitPrice = await addEstimateOptionLineItem({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      itemName: "Repair",
      itemType: "service",
      quantity: 1,
      unitPriceCents: -1,
    });
    expect(invalidUnitPrice.success).toBe(false);
  });

  it("fails closed when estimates feature is disabled", async () => {
    isEstimatesEnabledMock.mockReturnValue(false);

    const result = await addEstimateOptionLineItem({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      itemName: "Repair",
      itemType: "service",
      quantity: 1,
      unitPriceCents: 100,
    });

    expect(result.success).toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
  });
});

describe("removeEstimateOptionLineItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isEstimatesEnabledMock.mockReturnValue(true);
  });

  it("removes a line item, recomputes option totals, and records event", async () => {
    const supabase = makeOptionLineSupabaseClient({ optionLineSubtotals: [4000, 2000] });
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(supabase);

    const result = await removeEstimateOptionLineItem({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      lineItemId: "opt-line-2",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.subtotal_cents).toBe(4000);
      expect(result.total_cents).toBe(4000);
    }

    expect(supabase.__deletedRows).toContainEqual(
      expect.objectContaining({ table: "estimate_option_line_items", deleted: 1 })
    );
    expect(supabase.__updatedRows).toContainEqual({
      table: "estimate_options",
      payload: expect.objectContaining({ subtotal_cents: 4000, total_cents: 4000 }),
    });
    expect(supabase.__estimateUpdates).toHaveLength(0);
    expect(supabase.__insertedRows).toContainEqual({
      table: "estimate_events",
      payload: expect.objectContaining({
        event_type: "estimate_option_line_item_removed",
        meta: expect.objectContaining({ line_item_id: "opt-line-2" }),
      }),
    });
  });

  it("blocks non-draft, missing line ownership, and feature-disabled paths", async () => {
    const nonDraftClient = makeOptionLineSupabaseClient({ estimateStatus: "approved" });
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(nonDraftClient);

    const nonDraft = await removeEstimateOptionLineItem({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      lineItemId: "opt-line-1",
    });
    expect(nonDraft.success).toBe(false);

    const missingLineClient = makeOptionLineSupabaseClient({ optionLineSubtotals: [] });
    createClientMock.mockResolvedValue(missingLineClient);
    const missingLine = await removeEstimateOptionLineItem({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      lineItemId: "opt-line-missing",
    });
    expect(missingLine.success).toBe(false);

    isEstimatesEnabledMock.mockReturnValue(false);
    const disabled = await removeEstimateOptionLineItem({
      estimateId: ESTIMATE_ID,
      estimateOptionId: OPTION_ID,
      lineItemId: "opt-line-1",
    });
    expect(disabled.success).toBe(false);
  });
});
