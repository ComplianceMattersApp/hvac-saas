import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const revalidatePathMock = vi.fn();
const refreshMock = vi.fn();
const sendEmailMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  refresh: (...args: unknown[]) => refreshMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  requireInternalRole: vi.fn(),
}));

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) =>
    loadScopedInternalJobForMutationMock(...args),
  loadScopedInternalServiceCaseForMutation: vi.fn(),
}));

vi.mock("@/lib/actions/job-evaluator", () => ({
  evaluateJobOpsStatus: vi.fn(async () => undefined),
  healStalePaperworkOpsStatus: vi.fn(async () => true),
}));

vi.mock("@/lib/actions/ecc-status", () => ({
  evaluateEccOpsStatus: vi.fn(async () => undefined),
}));

vi.mock("@/lib/actions/ops-status", () => ({
  forceSetOpsStatus: vi.fn(async () => undefined),
}));

vi.mock("@/lib/actions/job-ops-actions", () => ({
  releasePendingInfoAndRecompute: vi.fn(async () => null),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/actions/job-event-meta", () => ({
  buildMovementEventMeta: vi.fn(() => ({})),
  buildStaffingSnapshotMeta: vi.fn(() => ({})),
}));

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

function makeDenySupabaseFixture() {
  const writeCalls: Array<{ table: string; method: "update" | "insert" }> = [];

  const supabase = {
    from(table: string) {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: null })),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          })),
        })),
        update: vi.fn(() => {
          writeCalls.push({ table, method: "update" });
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  select: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                  })),
                })),
                not: vi.fn(() => ({
                  select: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                  })),
                })),
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
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

function buildJobOnlyFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  return formData;
}

function buildRevertFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("tab", "info");
  return formData;
}

function buildScheduleFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("scheduled_date", "2026-04-23");
  formData.set("window_start", "08:00");
  formData.set("window_end", "10:00");
  return formData;
}

describe("internal same-account lifecycle scheduling hardening", () => {
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

    sendEmailMock.mockResolvedValue(undefined);
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  it("denies cross-account internal advanceJobStatusFromForm before writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { advanceJobStatusFromForm } = await import("@/lib/actions/job-actions");

    await expect(advanceJobStatusFromForm(buildJobOnlyFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
  });

  it("denies cross-account internal revertOnTheWayFromForm before writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { revertOnTheWayFromForm } = await import("@/lib/actions/job-actions");

    await expect(revertOnTheWayFromForm(buildRevertFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
  });

  it("denies cross-account internal updateJobScheduleFromForm before writes or emails", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobScheduleFromForm(buildScheduleFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?banner=not_authorized",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("allows same-account internal advanceJobStatusFromForm past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { advanceJobStatusFromForm } = await import("@/lib/actions/job-actions");

    await expect(advanceJobStatusFromForm(buildJobOnlyFormData())).rejects.toThrow("ALLOW_PATH_REACHED");
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
  });

  it("allows same-account internal revertOnTheWayFromForm past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { revertOnTheWayFromForm } = await import("@/lib/actions/job-actions");

    await expect(revertOnTheWayFromForm(buildRevertFormData())).rejects.toThrow("ALLOW_PATH_REACHED");
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
  });

  it("allows same-account internal updateJobScheduleFromForm past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobScheduleFromForm(buildScheduleFormData())).rejects.toThrow("ALLOW_PATH_REACHED");
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
  });

  it("allows same-account internal markJobFailedFromForm past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { markJobFailedFromForm } = await import("@/lib/actions/job-actions");

    await expect(markJobFailedFromForm(buildJobOnlyFormData())).rejects.toThrow("ALLOW_PATH_REACHED");
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
  });

  it("allows valid trial internal updateJobScheduleFromForm past entitlement preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: true,
      reason: "allowed_trial",
    });

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobScheduleFromForm(buildScheduleFormData())).rejects.toThrow("ALLOW_PATH_REACHED");
  });

  it("blocks expired trial internal updateJobScheduleFromForm before writes or emails", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_trial_expired",
    });

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobScheduleFromForm(buildScheduleFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("blocks null-ended trial internal updateJobScheduleFromForm before writes or emails", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_trial_missing_end",
    });

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobScheduleFromForm(buildScheduleFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("allows internal comped updateJobScheduleFromForm past entitlement preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: true,
      reason: "allowed_internal_comped",
    });

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobScheduleFromForm(buildScheduleFormData())).rejects.toThrow("ALLOW_PATH_REACHED");
  });

  it("blocks missing entitlement internal updateJobScheduleFromForm before writes or emails", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_missing_entitlement",
    });

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobScheduleFromForm(buildScheduleFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
