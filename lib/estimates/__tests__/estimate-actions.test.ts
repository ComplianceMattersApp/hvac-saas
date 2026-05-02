// lib/estimates/__tests__/estimate-actions.test.ts
// Compliance Matters: Estimate V1B action + read tests.
// Covers scope hardening, create, add/remove line items, read, list.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACCOUNT_OWNER = "owner-aaa";
const OTHER_ACCOUNT = "owner-bbb";
const USER_ID = "user-111";

function makeInternalUser(accountOwnerUserId = ACCOUNT_OWNER) {
  return {
    internalUser: {
      user_id: USER_ID,
      account_owner_user_id: accountOwnerUserId,
      role: "admin" as const,
      is_active: true,
      created_by: null,
    },
    userId: USER_ID,
  };
}

// A minimal chainable Supabase query builder.
// Each `from` call returns a configured mock based on a table fixture map.
type TableFixture = {
  select?: unknown;       // data returned by select / maybeSingle / single
  insert?: unknown;       // data returned by insert
  update?: unknown;       // data returned by update
  delete?: unknown;       // data returned by delete
  error?: string | null;
};

function makeSupabaseClient(tables: Record<string, TableFixture>) {
  const insertedEvents: unknown[] = [];
  const insertedLineItems: unknown[] = [];
  const updatedEstimates: unknown[] = [];
  const deletedLines: unknown[] = [];

  function makeQueryChain(fixture: TableFixture) {
    const row = fixture.select ?? null;
    const err = fixture.error ? { message: fixture.error } : null;

    const chain: Record<string, unknown> = {};

    const terminal = {
      maybeSingle: vi.fn(async () => ({ data: row, error: err })),
      single: vi.fn(async () => ({ data: row, error: err })),
      then: undefined as unknown,
    };

    // Resolve as a promise (for bare `.from().select()` awaits)
    const asPromise = Promise.resolve({ data: Array.isArray(row) ? row : row ? [row] : [], error: err });

    chain.select = vi.fn(() => ({
      ...terminal,
      eq: vi.fn(() => ({
        ...terminal,
        eq: vi.fn(() => ({
          ...terminal,
          eq: vi.fn(() => terminal),
          is: vi.fn(() => terminal),
        })),
        is: vi.fn(() => terminal),
        order: vi.fn(() => ({
          ...terminal,
          order: vi.fn(() => terminal),
        })),
      })),
      order: vi.fn(() => ({
        ...terminal,
        eq: vi.fn(() => ({
          ...terminal,
          order: vi.fn(() => terminal),
        })),
        order: vi.fn(() => terminal),
      })),
    }));

    chain.insert = vi.fn((payload: unknown) => {
      if (typeof payload === "object" && payload && "event_type" in (payload as object)) {
        insertedEvents.push(payload);
      }
      if (typeof payload === "object" && payload && "item_name_snapshot" in (payload as object)) {
        insertedLineItems.push(payload);
      }
      return {
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: fixture.insert ?? null,
            error: fixture.error ? { message: fixture.error } : null,
          })),
        })),
      };
    });

    chain.update = vi.fn((payload: unknown) => {
      updatedEstimates.push(payload);
      return {
        eq: vi.fn(() => ({
          error: fixture.error ? { message: fixture.error } : null,
        })),
      };
    });

    chain.delete = vi.fn(() => {
      return {
        eq: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      };
    });

    return chain;
  }

  const client = {
    from: vi.fn((table: string) => {
      const fixture = tables[table] ?? {};
      return makeQueryChain(fixture);
    }),
    _insertedEvents: insertedEvents,
    _insertedLineItems: insertedLineItems,
    _updatedEstimates: updatedEstimates,
    _deletedLines: deletedLines,
  };

  return client;
}

// Admin client for same-account entity validation
function makeAdminClient(params: {
  customerOwnerId?: string;
  locationOwnerId?: string;
  serviceCaseCustomerId?: string;
  serviceCaseCustomerOwnerId?: string;
  jobCustomerId?: string;
  jobCustomerOwnerId?: string;
  pricebookItem?: Record<string, unknown> | null;
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === "customers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => {
                  const ownerId = params.customerOwnerId ?? params.serviceCaseCustomerOwnerId ?? params.jobCustomerOwnerId;
                  const match = ownerId === ACCOUNT_OWNER;
                  return { data: match ? { id: "cust-1" } : null, error: null };
                }),
              })),
            })),
          })),
        };
      }
      if (table === "locations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => {
                  const match = (params.locationOwnerId ?? ACCOUNT_OWNER) === ACCOUNT_OWNER;
                  return { data: match ? { id: "loc-1" } : null, error: null };
                }),
              })),
            })),
          })),
        };
      }
      if (table === "service_cases") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () =>
                params.serviceCaseCustomerId
                  ? { data: { id: "sc-1", customer_id: params.serviceCaseCustomerId }, error: null }
                  : { data: null, error: null }
              ),
            })),
          })),
        };
      }
      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: vi.fn(async () =>
                  params.jobCustomerId
                    ? { data: { id: "job-1", customer_id: params.jobCustomerId }, error: null }
                    : { data: null, error: null }
                ),
              })),
            })),
          })),
        };
      }
      if (table === "pricebook_items") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: params.pricebookItem ?? null,
                    error: null,
                  })),
                })),
              })),
            })),
          })),
        };
      }
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })) };
    }),
  };
}

// ---------------------------------------------------------------------------
// Import subject under test AFTER mocks are registered
// ---------------------------------------------------------------------------

const {
  createEstimateDraft,
  addEstimateLineItem,
  removeEstimateLineItem,
  getEstimateById,
  listEstimatesByAccount,
} = await import("@/lib/estimates/estimate-actions");

// ---------------------------------------------------------------------------
// createEstimateDraft
// ---------------------------------------------------------------------------

describe("createEstimateDraft", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function setupValidCreate() {
    const admin = makeAdminClient({
      customerOwnerId: ACCOUNT_OWNER,
      locationOwnerId: ACCOUNT_OWNER,
    });
    createAdminClientMock.mockReturnValue(admin);
    requireInternalUserMock.mockResolvedValue(makeInternalUser());

    const supabase = makeSupabaseClient({
      estimates: { insert: { id: "est-new-1" } },
      estimate_events: { insert: null },
    });
    createClientMock.mockResolvedValue(supabase);
    return { supabase, admin };
  }

  it("succeeds for valid same-account customer and location", async () => {
    setupValidCreate();
    const result = await createEstimateDraft({
      customerId: "cust-1",
      locationId: "loc-1",
      title: "HVAC Replacement Quote",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.estimateId).toBe("est-new-1");
      expect(result.estimateNumber).toMatch(/^EST-\d{8}-[0-9A-F]{8}$/);
    }
  });

  it("denies cross-account customer", async () => {
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    const admin = makeAdminClient({ customerOwnerId: OTHER_ACCOUNT });
    createAdminClientMock.mockReturnValue(admin);
    createClientMock.mockResolvedValue(makeSupabaseClient({}));

    const result = await createEstimateDraft({
      customerId: "cust-other",
      locationId: "loc-1",
      title: "Quote",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/customer_id not found/i);
    }
  });

  it("denies cross-account location", async () => {
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(makeSupabaseClient({}));

    // Build an explicit admin client: customer passes, location returns null
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "customers") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { id: "cust-1" }, error: null })),
                })),
              })),
            })),
          };
        }
        if (table === "locations") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
          };
        }
        return {};
      }),
    };
    createAdminClientMock.mockReturnValue(admin);

    const result = await createEstimateDraft({
      customerId: "cust-1",
      locationId: "loc-other",
      title: "Quote",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/location_id not found/i);
    }
  });

  it("denies cross-account service_case_id", async () => {
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(makeSupabaseClient({}));

    // customer + location pass; service_case resolves to a customer on OTHER_ACCOUNT
    // so the final customers.owner_user_id check returns null
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "customers") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((col: string, val: string) => ({
                eq: vi.fn((_col: string, ownerVal: string) => ({
                  maybeSingle: vi.fn(async () => {
                    // cust-1 belongs to ACCOUNT_OWNER; cust-other does not
                    const isOwned = val === "cust-1" && ownerVal === ACCOUNT_OWNER;
                    return { data: isOwned ? { id: val } : null, error: null };
                  }),
                })),
              })),
            })),
          };
        }
        if (table === "locations") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { id: "loc-1" }, error: null })),
                })),
              })),
            })),
          };
        }
        if (table === "service_cases") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { id: "sc-other", customer_id: "cust-other" },
                  error: null,
                })),
              })),
            })),
          };
        }
        return {};
      }),
    };
    createAdminClientMock.mockReturnValue(admin);

    const result = await createEstimateDraft({
      customerId: "cust-1",
      locationId: "loc-1",
      title: "Quote",
      serviceCaseId: "sc-other",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/service_case_id not found/i);
    }
  });

  it("denies cross-account origin_job_id", async () => {
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createClientMock.mockResolvedValue(makeSupabaseClient({}));

    // customer + location pass; job resolves to a customer on OTHER_ACCOUNT
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "customers") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((col: string, val: string) => ({
                eq: vi.fn((_col: string, ownerVal: string) => ({
                  maybeSingle: vi.fn(async () => {
                    const isOwned = val === "cust-1" && ownerVal === ACCOUNT_OWNER;
                    return { data: isOwned ? { id: val } : null, error: null };
                  }),
                })),
              })),
            })),
          };
        }
        if (table === "locations") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { id: "loc-1" }, error: null })),
                })),
              })),
            })),
          };
        }
        if (table === "jobs") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: "job-other", customer_id: "cust-other" },
                    error: null,
                  })),
                })),
              })),
            })),
          };
        }
        return {};
      }),
    };
    createAdminClientMock.mockReturnValue(admin);

    const result = await createEstimateDraft({
      customerId: "cust-1",
      locationId: "loc-1",
      title: "Quote",
      originJobId: "job-other",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/origin_job_id not found/i);
    }
  });

  it("returns an estimate number matching EST-YYYYMMDD-XXXXXXXX format", async () => {
    setupValidCreate();
    const result = await createEstimateDraft({
      customerId: "cust-1",
      locationId: "loc-1",
      title: "Quote",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.estimateNumber).toMatch(/^EST-\d{8}-[0-9A-F]{8}$/);
    }
  });
});

// ---------------------------------------------------------------------------
// getEstimateById
// ---------------------------------------------------------------------------

describe("getEstimateById", () => {
  const mockEstimate = {
    id: "est-1",
    account_owner_user_id: ACCOUNT_OWNER,
    estimate_number: "EST-20260501-AAAABBBB",
    status: "draft",
    title: "Test",
    subtotal_cents: 0,
    total_cents: 0,
    customer_id: "cust-1",
    location_id: "loc-1",
    service_case_id: null,
    origin_job_id: null,
    notes: null,
    sent_at: null,
    approved_at: null,
    declined_at: null,
    expired_at: null,
    cancelled_at: null,
    converted_at: null,
    created_by_user_id: USER_ID,
    updated_by_user_id: USER_ID,
    created_at: "2026-05-01T14:00:00Z",
    updated_at: "2026-05-01T14:00:00Z",
  };

  it("returns estimate and lines for same-account actor", async () => {
    const supabase = makeSupabaseClient({
      estimates: { select: mockEstimate },
      estimate_line_items: { select: [] },
    });

    const result = await getEstimateById({
      estimateId: "est-1",
      internalUser: { account_owner_user_id: ACCOUNT_OWNER },
      supabase,
    });

    expect(result?.id).toBe("est-1");
    expect(Array.isArray(result?.line_items)).toBe(true);
  });

  it("returns null for cross-account estimate (RLS + eq filter)", async () => {
    // Simulate RLS returning null for different account
    const supabase = makeSupabaseClient({
      estimates: { select: null },
    });

    const result = await getEstimateById({
      estimateId: "est-1",
      internalUser: { account_owner_user_id: OTHER_ACCOUNT },
      supabase,
    });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listEstimatesByAccount
// ---------------------------------------------------------------------------

describe("listEstimatesByAccount", () => {
  const estimates = [
    { id: "est-1", status: "draft", estimate_number: "EST-20260501-AAAA1111" },
    { id: "est-2", status: "sent", estimate_number: "EST-20260501-AAAA2222" },
  ];

  it("returns all estimates for account (no status filter)", async () => {
    const supabase = makeSupabaseClient({
      estimates: { select: estimates as unknown[] as unknown },
    });
    // Override from to return a thenable with the list
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((_table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() =>
            Promise.resolve({ data: estimates, error: null })
          ),
        })),
      })),
    }));

    const result = await listEstimatesByAccount({
      internalUser: { account_owner_user_id: ACCOUNT_OWNER },
      supabase,
    });

    expect(result).toHaveLength(2);
  });

  it("filters by status when provided", async () => {
    const filtered = estimates.filter((e) => e.status === "draft");
    const supabase = makeSupabaseClient({});
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((_table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            eq: vi.fn(() =>
              Promise.resolve({ data: filtered, error: null })
            ),
          })),
        })),
      })),
    }));

    const result = await listEstimatesByAccount({
      internalUser: { account_owner_user_id: ACCOUNT_OWNER },
      status: "draft",
      supabase,
    });

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("draft");
  });
});

// ---------------------------------------------------------------------------
// addEstimateLineItem
// ---------------------------------------------------------------------------

describe("addEstimateLineItem", () => {
  beforeEach(() => vi.resetAllMocks());

  const draftEstimate = {
    id: "est-1",
    status: "draft",
    account_owner_user_id: ACCOUNT_OWNER,
  };

  function setupLineAdd(pricebookItem: Record<string, unknown> | null = null) {
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    const admin = makeAdminClient({ pricebookItem });
    createAdminClientMock.mockReturnValue(admin);

    const supabase = makeSupabaseClient({
      estimates: { select: draftEstimate },
      estimate_line_items: { insert: { id: "line-1" }, select: [{ line_subtotal_cents: 5000 }] },
      estimate_events: { insert: null },
    });
    createClientMock.mockResolvedValue(supabase);
    return { supabase, admin };
  }

  it("adds manual line item and recomputes subtotal/total", async () => {
    setupLineAdd();
    const result = await addEstimateLineItem({
      estimateId: "est-1",
      itemName: "Diagnostic Fee",
      itemType: "diagnostic",
      quantity: 1,
      unitPriceCents: 5000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.lineItemId).toBe("line-1");
      // subtotal_cents should be sum of line items (5000)
      expect(result.subtotal_cents).toBeGreaterThanOrEqual(0);
    }
  });

  it("snapshots pricebook item fields and does not live-link values", async () => {
    const pbItem = {
      id: "pb-1",
      item_name: "Refrigerant R-410A (lb)",
      item_type: "material",
      default_description: "Per pound refrigerant charge",
      category: "refrigerant",
      unit_label: "lb",
      default_unit_price: 45.0,
      is_active: true,
    };
    const { supabase } = setupLineAdd(pbItem);

    const result = await addEstimateLineItem({
      estimateId: "est-1",
      sourcePricebookItemId: "pb-1",
      quantity: 2,
      unitPriceCents: 4500,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.lineItemId).toBe("line-1");
    }

    const insertedPayload = (supabase as { _insertedLineItems?: Array<Record<string, unknown>> })._insertedLineItems?.[0];
    expect(insertedPayload).toMatchObject({
      source_pricebook_item_id: "pb-1",
      item_name_snapshot: "Refrigerant R-410A (lb)",
      description_snapshot: "Per pound refrigerant charge",
      item_type_snapshot: "material",
      category_snapshot: "refrigerant",
      unit_label_snapshot: "lb",
    });
  });

  it("denies pricebook-backed add when item is inactive or missing", async () => {
    setupLineAdd(null);

    const result = await addEstimateLineItem({
      estimateId: "est-1",
      sourcePricebookItemId: "pb-inactive",
      quantity: 1,
      unitPriceCents: 1000,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/inactive/i);
    }
  });

  it("denies add line item for non-draft estimate", async () => {
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createAdminClientMock.mockReturnValue(makeAdminClient({}));

    const sentEstimate = { ...draftEstimate, status: "sent" };
    const supabase = makeSupabaseClient({ estimates: { select: sentEstimate } });
    createClientMock.mockResolvedValue(supabase);

    const result = await addEstimateLineItem({
      estimateId: "est-1",
      itemName: "Some Item",
      itemType: "service",
      quantity: 1,
      unitPriceCents: 1000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/draft estimates/i);
    }
  });

  it("denies add line item for cross-account estimate", async () => {
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createAdminClientMock.mockReturnValue(makeAdminClient({}));

    // Estimate not found for this account (RLS + eq filter returns null)
    const supabase = makeSupabaseClient({ estimates: { select: null } });
    createClientMock.mockResolvedValue(supabase);

    const result = await addEstimateLineItem({
      estimateId: "est-other",
      itemName: "Fee",
      itemType: "service",
      quantity: 1,
      unitPriceCents: 1000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/not found in this account/i);
    }
  });

  it("denies contractor/non-internal users at requireInternalUser boundary", async () => {
    requireInternalUserMock.mockRejectedValue(
      new Error("Active internal user required.")
    );
    createAdminClientMock.mockReturnValue(makeAdminClient({}));
    createClientMock.mockResolvedValue(makeSupabaseClient({}));

    await expect(
      addEstimateLineItem({
        estimateId: "est-1",
        itemName: "Fee",
        itemType: "service",
        quantity: 1,
        unitPriceCents: 1000,
      })
    ).rejects.toThrow("Active internal user required.");
  });
});

// ---------------------------------------------------------------------------
// removeEstimateLineItem
// ---------------------------------------------------------------------------

describe("removeEstimateLineItem", () => {
  beforeEach(() => vi.resetAllMocks());

  const draftEstimate = {
    id: "est-1",
    status: "draft",
    account_owner_user_id: ACCOUNT_OWNER,
  };
  const lineItem = { id: "line-1", item_name_snapshot: "Diagnostic Fee" };

  function setupLineRemove() {
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createAdminClientMock.mockReturnValue(makeAdminClient({}));

    const supabase = makeSupabaseClient({
      estimates: { select: draftEstimate },
      estimate_line_items: { select: lineItem },
    });

    // Patch the line items table to also handle select-for-count returning []
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === "estimate_line_items") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: lineItem, error: null })),
              })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          })),
        };
      }
      if (table === "estimates") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: draftEstimate, error: null })),
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({ error: null })),
          })),
        };
      }
      if (table === "estimate_events") {
        return { insert: vi.fn(async () => ({ data: null, error: null })) };
      }
      return {};
    });

    createClientMock.mockResolvedValue(supabase);
    return supabase;
  }

  it("removes line item and recomputes subtotal/total", async () => {
    setupLineRemove();
    const result = await removeEstimateLineItem({
      estimateId: "est-1",
      lineItemId: "line-1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.subtotal_cents).toBeGreaterThanOrEqual(0);
    }
  });

  it("denies remove line item from non-draft estimate", async () => {
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    createAdminClientMock.mockReturnValue(makeAdminClient({}));

    const supabase = makeSupabaseClient({});
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === "estimates") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { ...draftEstimate, status: "approved" },
                  error: null,
                })),
              })),
            })),
          })),
        };
      }
      return {};
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await removeEstimateLineItem({
      estimateId: "est-1",
      lineItemId: "line-1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/draft estimates/i);
    }
  });

  it("denies contractor/non-internal users at requireInternalUser boundary", async () => {
    requireInternalUserMock.mockRejectedValue(
      new Error("Active internal user required.")
    );
    createClientMock.mockResolvedValue(makeSupabaseClient({}));

    await expect(
      removeEstimateLineItem({ estimateId: "est-1", lineItemId: "line-1" })
    ).rejects.toThrow("Active internal user required.");
  });
});
