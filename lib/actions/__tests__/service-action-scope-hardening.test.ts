import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveBillingModeByAccountOwnerIdMock = vi.fn();
const revalidatePathMock = vi.fn();
const setOpsStatusIfNotManualMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  isInternalAccessError: (error: unknown) => {
    return Boolean(error) && typeof error === "object" && "code" in (error as Record<string, unknown>);
  },
}));

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) =>
    loadScopedInternalJobForMutationMock(...args),
}));

vi.mock("@/lib/business/internal-business-profile", () => ({
  resolveBillingModeByAccountOwnerId: (...args: unknown[]) =>
    resolveBillingModeByAccountOwnerIdMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/actions/ops-status", () => ({
  setOpsStatusIfNotManual: (...args: unknown[]) => setOpsStatusIfNotManualMock(...args),
}));

vi.mock("@/lib/actions/job-event-meta", () => ({
  buildMovementEventMeta: vi.fn(() => ({})),
}));

function makeDenySupabaseFixture() {
  const writeCalls: Array<{ table: string; method: "update" | "insert" }> = [];

  const supabase = {
    from(table: string) {
      return {
        update: vi.fn(() => {
          writeCalls.push({ table, method: "update" });
          return {
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { id: "job-1", invoice_complete: true, data_entry_completed_at: new Date().toISOString() },
                  error: null,
                })),
              })),
              then: undefined,
            })),
          };
        }),
        insert: vi.fn(() => {
          writeCalls.push({ table, method: "insert" });
          return Promise.resolve({ error: null });
        }),
      };
    },
  };

  return { supabase, writeCalls };
}

function makeAllowSupabaseFixture() {
  const supabase = {
    from(_table: string) {
      throw new Error("ALLOW_PATH_REACHED");
    },
  };

  return { supabase };
}

describe("internal same-account service closeout mutation hardening", () => {
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

    resolveBillingModeByAccountOwnerIdMock.mockResolvedValue("external_billing");
    setOpsStatusIfNotManualMock.mockResolvedValue({ updated: true, manualLockPrevented: false });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  it("denies cross-account internal markServiceComplete before writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { markServiceComplete } = await import("@/lib/actions/service-actions");

    await expect(markServiceComplete("job-1")).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(writeCalls.filter((call) => ["jobs", "service_cases", "job_events"].includes(call.table))).toHaveLength(0);
  });

  it("denies cross-account internal markInvoiceSent before writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { markInvoiceSent } = await import("@/lib/actions/service-actions");

    await expect(markInvoiceSent("job-1")).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(writeCalls.filter((call) => ["jobs", "service_cases", "job_events"].includes(call.table))).toHaveLength(0);
  });

  it("allows same-account internal markServiceComplete past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({
      id: "job-1",
      job_type: "service",
      ops_status: null,
      status: "in_progress",
      field_complete: false,
      service_case_id: null,
      service_visit_outcome: null,
    });

    const { markServiceComplete } = await import("@/lib/actions/service-actions");

    await expect(markServiceComplete("job-1")).rejects.toThrow("ALLOW_PATH_REACHED");

    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
  });

  it("allows same-account internal markInvoiceSent past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({
      id: "job-1",
      job_type: "service",
      ops_status: null,
      invoice_complete: false,
      data_entry_completed_at: null,
    });

    const { markInvoiceSent } = await import("@/lib/actions/service-actions");

    await expect(markInvoiceSent("job-1")).rejects.toThrow("ALLOW_PATH_REACHED");

    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
  });

  it("allows valid trial internal markInvoiceSent past entitlement preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({
      id: "job-1",
      job_type: "service",
      ops_status: null,
      invoice_complete: false,
      data_entry_completed_at: null,
    });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: true,
      reason: "allowed_trial",
    });

    const { markInvoiceSent } = await import("@/lib/actions/service-actions");

    await expect(markInvoiceSent("job-1")).rejects.toThrow("ALLOW_PATH_REACHED");
  });

  it("blocks expired trial internal markInvoiceSent before writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({
      id: "job-1",
      job_type: "service",
      ops_status: null,
      invoice_complete: false,
      data_entry_completed_at: null,
    });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_trial_expired",
    });

    const { markInvoiceSent } = await import("@/lib/actions/service-actions");

    await expect(markInvoiceSent("job-1")).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
    );

    expect(writeCalls.filter((call) => ["jobs", "service_cases", "job_events"].includes(call.table))).toHaveLength(0);
    expect(resolveBillingModeByAccountOwnerIdMock).not.toHaveBeenCalled();
    expect(setOpsStatusIfNotManualMock).not.toHaveBeenCalled();
  });

  it("blocks null-ended trial internal markInvoiceSent before writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({
      id: "job-1",
      job_type: "service",
      ops_status: null,
      invoice_complete: false,
      data_entry_completed_at: null,
    });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_trial_missing_end",
    });

    const { markInvoiceSent } = await import("@/lib/actions/service-actions");

    await expect(markInvoiceSent("job-1")).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
    );

    expect(writeCalls.filter((call) => ["jobs", "service_cases", "job_events"].includes(call.table))).toHaveLength(0);
    expect(resolveBillingModeByAccountOwnerIdMock).not.toHaveBeenCalled();
    expect(setOpsStatusIfNotManualMock).not.toHaveBeenCalled();
  });

  it("allows internal comped markInvoiceSent past entitlement preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({
      id: "job-1",
      job_type: "service",
      ops_status: null,
      invoice_complete: false,
      data_entry_completed_at: null,
    });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: true,
      reason: "allowed_internal_comped",
    });

    const { markInvoiceSent } = await import("@/lib/actions/service-actions");

    await expect(markInvoiceSent("job-1")).rejects.toThrow("ALLOW_PATH_REACHED");
  });

  it("blocks missing entitlement internal markInvoiceSent before writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({
      id: "job-1",
      job_type: "service",
      ops_status: null,
      invoice_complete: false,
      data_entry_completed_at: null,
    });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_missing_entitlement",
    });

    const { markInvoiceSent } = await import("@/lib/actions/service-actions");

    await expect(markInvoiceSent("job-1")).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
    );

    expect(writeCalls.filter((call) => ["jobs", "service_cases", "job_events"].includes(call.table))).toHaveLength(0);
    expect(resolveBillingModeByAccountOwnerIdMock).not.toHaveBeenCalled();
    expect(setOpsStatusIfNotManualMock).not.toHaveBeenCalled();
  });
});
