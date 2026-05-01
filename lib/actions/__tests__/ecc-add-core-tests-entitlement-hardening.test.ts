import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalEccJobForMutationMock = vi.fn();
const loadScopedInternalEccTestRunForMutationMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  refresh: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  requireInternalRole: vi.fn(),
}));

vi.mock("@/lib/auth/internal-ecc-scope", () => ({
  loadScopedInternalEccJobForMutation: (...args: unknown[]) =>
    loadScopedInternalEccJobForMutationMock(...args),
  loadScopedInternalEccTestRunForMutation: (...args: unknown[]) =>
    loadScopedInternalEccTestRunForMutationMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

function buildFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("system_id", "system-1");
  return formData;
}

function makeAllowSupabaseFixture() {
  const insertCalls: Array<{ table: string; values: unknown }> = [];

  const supabase = {
    from(table: string) {
      if (table === "job_visits") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { id: "visit-1", visit_number: 1 },
                    error: null,
                  })),
                })),
              })),
            })),
          })),
        };
      }

      if (table === "ecc_test_runs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [],
                error: null,
              })),
            })),
          })),
          insert: vi.fn((values: unknown) => {
            insertCalls.push({ table, values });
            return Promise.resolve({ error: null });
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { supabase, insertCalls };
}

function makeBlockedSupabaseFixture() {
  const fromCalls: string[] = [];

  const supabase = {
    from(table: string) {
      fromCalls.push(table);
      throw new Error(`UNEXPECTED_FROM:${table}`);
    },
  };

  return { supabase, fromCalls };
}

describe("ECC core-test seed entitlement hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: "internal-user-1",
      internalUser: {
        user_id: "internal-user-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    loadScopedInternalEccJobForMutationMock.mockResolvedValue({ id: "job-1", job_type: "ecc" });
    loadScopedInternalEccTestRunForMutationMock.mockResolvedValue(null);

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  it("allows active entitlement", async () => {
    const { supabase, insertCalls } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);

    const { addAlterationCoreTestsFromForm } = await import("@/lib/actions/job-actions");

    await expect(addAlterationCoreTestsFromForm(buildFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1/tests?s=system-1",
    );

    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
    expect(insertCalls).toHaveLength(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/jobs/job-1/tests");
  });

  it("allows valid trial entitlement", async () => {
    const { supabase, insertCalls } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: true,
      reason: "allowed_trial",
    });

    const { addAlterationCoreTestsFromForm } = await import("@/lib/actions/job-actions");

    await expect(addAlterationCoreTestsFromForm(buildFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1/tests?s=system-1",
    );

    expect(insertCalls).toHaveLength(1);
  });

  it("blocks expired trial before writes and side effects", async () => {
    const { supabase, fromCalls } = makeBlockedSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_trial_expired",
    });

    const { addAlterationCoreTestsFromForm } = await import("@/lib/actions/job-actions");

    await expect(addAlterationCoreTestsFromForm(buildFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
    );

    expect(fromCalls).toHaveLength(0);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("blocks null-ended trial before writes and side effects", async () => {
    const { supabase, fromCalls } = makeBlockedSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_trial_missing_end",
    });

    const { addAlterationCoreTestsFromForm } = await import("@/lib/actions/job-actions");

    await expect(addAlterationCoreTestsFromForm(buildFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
    );

    expect(fromCalls).toHaveLength(0);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("allows internal comped entitlement", async () => {
    const { supabase, insertCalls } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: true,
      reason: "allowed_internal_comped",
    });

    const { addAlterationCoreTestsFromForm } = await import("@/lib/actions/job-actions");

    await expect(addAlterationCoreTestsFromForm(buildFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1/tests?s=system-1",
    );

    expect(insertCalls).toHaveLength(1);
  });

  it("blocks missing entitlement before writes and side effects", async () => {
    const { supabase, fromCalls } = makeBlockedSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_missing_entitlement",
    });

    const { addAlterationCoreTestsFromForm } = await import("@/lib/actions/job-actions");

    await expect(addAlterationCoreTestsFromForm(buildFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
    );

    expect(fromCalls).toHaveLength(0);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
