import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const resolveEntitlementMock = vi.fn();
const isMaintenanceAgreementsEnabledMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) => resolveEntitlementMock(...args),
}));

vi.mock("@/lib/maintenance-agreements/agreement-exposure", () => ({
  isMaintenanceAgreementsEnabled: (...args: unknown[]) => isMaintenanceAgreementsEnabledMock(...args),
}));

function makeSupabaseClient() {
  const insertCalls: unknown[] = [];
  const updateCalls: unknown[] = [];

  const client = {
    from: vi.fn((table: string) => {
      if (table !== "maintenance_agreements") {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        insert: vi.fn((payload: unknown) => {
          insertCalls.push(payload);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: "agr-1" }, error: null })),
            })),
          };
        }),
        update: vi.fn((payload: unknown) => {
          updateCalls.push(payload);
          const eq = vi.fn(() => ({ eq }));
          const select = vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { id: "agr-1" }, error: null })),
          }));
          const thirdEq = vi.fn(() => ({ select }));
          const secondEq = vi.fn(() => ({ eq: thirdEq }));
          const firstEq = vi.fn(() => ({ eq: secondEq }));
          return { eq: firstEq };
        }),
      };
    }),
    _insertCalls: insertCalls,
    _updateCalls: updateCalls,
  };

  return client;
}

function makeAdminClient(params?: {
  customerFound?: boolean;
  locationFound?: boolean;
}) {
  const customerFound = params?.customerFound ?? true;
  const locationFound = params?.locationFound ?? true;

  return {
    from: vi.fn((table: string) => {
      if (table === "customers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: customerFound ? { id: "cust-1" } : null, error: null })),
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
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: locationFound ? { id: "loc-1" } : null, error: null })),
                })),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected admin table ${table}`);
    }),
  };
}

const { createMaintenanceAgreement, updateMaintenanceAgreement } = await import(
  "@/lib/maintenance-agreements/agreement-actions"
);

describe("maintenance agreement actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    isMaintenanceAgreementsEnabledMock.mockReturnValue(true);
    requireInternalUserMock.mockResolvedValue({
      internalUser: {
        user_id: "user-1",
        account_owner_user_id: "owner-1",
      },
    });
    resolveEntitlementMock.mockResolvedValue({ authorized: true, reason: "ok" });
  });

  it("fails closed when feature flag is disabled before any client is created", async () => {
    isMaintenanceAgreementsEnabledMock.mockReturnValue(false);

    const result = await createMaintenanceAgreement({
      customerId: "cust-1",
      agreementName: "Spring Tune-up",
      agreementType: "maintenance",
      frequency: "quarterly",
      nextDueDate: "2026-06-01",
      startDate: "2026-05-01",
    });

    expect(result).toEqual({
      success: false,
      error: "Maintenance Agreements are currently unavailable.",
    });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("rejects invalid enum and date values safely", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminClient());

    const result = await createMaintenanceAgreement({
      customerId: "cust-1",
      agreementName: "",
      agreementType: "invalid",
      frequency: "quarterly",
      nextDueDate: "2026/06/01",
      startDate: "2026-05-01",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Agreement name is required.");
    }
  });

  it("rejects out-of-scope primary location", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminClient({ locationFound: false }));

    const result = await createMaintenanceAgreement({
      customerId: "cust-1",
      agreementName: "Plan A",
      agreementType: "maintenance",
      frequency: "quarterly",
      nextDueDate: "2026-06-01",
      startDate: "2026-05-01",
      primaryLocationId: "loc-out-of-scope",
    });

    expect(result).toEqual({
      success: false,
      error: "Primary location must belong to this customer and account.",
    });
  });

  it("creates using server-scoped owner and user ids", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminClient());

    const result = await createMaintenanceAgreement({
      customerId: "cust-1",
      agreementName: "Plan B",
      agreementType: "service_plan",
      frequency: "annual",
      nextDueDate: "2026-10-01",
      startDate: "2026-05-01",
      renewalDate: "",
      defaultVisitScopeSummary: "Summary",
      internalNotes: "Internal",
    });

    expect(result).toEqual({ success: true, agreementId: "agr-1" });
    expect(supabase._insertCalls).toHaveLength(1);
    expect(supabase._insertCalls[0]).toMatchObject({
      account_owner_user_id: "owner-1",
      customer_id: "cust-1",
      created_by_user_id: "user-1",
      updated_by_user_id: "user-1",
      agreement_type: "service_plan",
      frequency: "annual",
      renewal_date: null,
    });
  });

  it("updates allowed fields and rejects invalid status", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminClient());

    const invalid = await updateMaintenanceAgreement({
      agreementId: "agr-1",
      customerId: "cust-1",
      agreementName: "Plan C",
      agreementType: "maintenance",
      frequency: "quarterly",
      nextDueDate: "2026-06-01",
      startDate: "2026-05-01",
      status: "deleted",
    });

    expect(invalid).toEqual({ success: false, error: "Status is invalid." });

    const ok = await updateMaintenanceAgreement({
      agreementId: "agr-1",
      customerId: "cust-1",
      agreementName: "Plan C",
      agreementType: "maintenance",
      frequency: "quarterly",
      nextDueDate: "2026-06-01",
      startDate: "2026-05-01",
      status: "active",
    });

    expect(ok).toEqual({ success: true, agreementId: "agr-1" });
    expect(supabase._updateCalls).toHaveLength(1);
    expect(supabase._updateCalls[0]).toMatchObject({
      agreement_name: "Plan C",
      status: "active",
      updated_by_user_id: "user-1",
    });
    expect(supabase._updateCalls[0]).not.toHaveProperty("customer_id");
    expect(supabase._updateCalls[0]).not.toHaveProperty("account_owner_user_id");
  });
});
