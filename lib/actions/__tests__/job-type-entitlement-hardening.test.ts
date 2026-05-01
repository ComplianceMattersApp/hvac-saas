import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const revalidatePathMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  refresh: (...args: unknown[]) => refreshMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  requireInternalRole: vi.fn(),
  isInternalAccessError: vi.fn(() => false),
}));

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) =>
    loadScopedInternalJobForMutationMock(...args),
  loadScopedInternalServiceCaseForMutation: vi.fn(),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
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

vi.mock("@/lib/actions/job-event-meta", () => ({
  buildMovementEventMeta: vi.fn(() => ({})),
  buildStaffingSnapshotMeta: vi.fn(() => ({})),
}));

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

function buildUpdateJobTypeFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("job_type", "service");
  return formData;
}

function makeAllowSupabaseFixture() {
  const jobsWrites: Array<Record<string, unknown>> = [];
  const jobEventWrites: Array<Record<string, unknown>> = [];

  const supabase = {
    from(table: string) {
      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  job_type: "ecc",
                  title: "Existing title",
                  job_notes: "Existing notes",
                  service_visit_type: null,
                  service_visit_reason: null,
                  service_visit_outcome: null,
                },
                error: null,
              })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            jobsWrites.push(payload);
            return {
              eq: vi.fn(async () => ({ error: null })),
            };
          }),
        };
      }

      if (table === "job_events") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            jobEventWrites.push(payload);
            return Promise.resolve({ error: null });
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { supabase, jobsWrites, jobEventWrites };
}

function makeBlockedSupabaseFixture() {
  const writeCalls: Array<{ table: string; method: "update" | "insert" }> = [];

  const supabase = {
    from(table: string) {
      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
          update: vi.fn(() => {
            writeCalls.push({ table, method: "update" });
            return {
              eq: vi.fn(async () => ({ error: null })),
            };
          }),
        };
      }

      if (table === "job_events") {
        return {
          insert: vi.fn(() => {
            writeCalls.push({ table, method: "insert" });
            return Promise.resolve({ error: null });
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { supabase, writeCalls };
}

describe("job type entitlement hardening", () => {
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

    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  it("active account can update job type", async () => {
    const { supabase, jobsWrites, jobEventWrites } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);

    const { updateJobTypeFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobTypeFromForm(buildUpdateJobTypeFormData())).resolves.toBeUndefined();

    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
    expect(jobsWrites).toHaveLength(1);
    expect(jobEventWrites).toHaveLength(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/jobs/job-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/ops");
  });

  it("valid trial can update job type", async () => {
    const { supabase, jobsWrites, jobEventWrites } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: true,
      reason: "allowed_trial",
    });

    const { updateJobTypeFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobTypeFromForm(buildUpdateJobTypeFormData())).resolves.toBeUndefined();

    expect(jobsWrites).toHaveLength(1);
    expect(jobEventWrites).toHaveLength(1);
  });

  it("expired trial is blocked before writes/side effects", async () => {
    const { supabase, writeCalls } = makeBlockedSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_trial_expired",
    });

    const { updateJobTypeFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobTypeFromForm(buildUpdateJobTypeFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("trial with null trial_ends_at is blocked before writes/side effects", async () => {
    const { supabase, writeCalls } = makeBlockedSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_trial_missing_end",
    });

    const { updateJobTypeFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobTypeFromForm(buildUpdateJobTypeFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("internal/comped account can update job type", async () => {
    const { supabase, jobsWrites, jobEventWrites } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: true,
      reason: "allowed_internal_comped",
    });

    const { updateJobTypeFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobTypeFromForm(buildUpdateJobTypeFormData())).resolves.toBeUndefined();

    expect(jobsWrites).toHaveLength(1);
    expect(jobEventWrites).toHaveLength(1);
  });

  it("missing entitlement row is blocked before writes/side effects", async () => {
    const { supabase, writeCalls } = makeBlockedSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_missing_entitlement",
    });

    const { updateJobTypeFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobTypeFromForm(buildUpdateJobTypeFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
