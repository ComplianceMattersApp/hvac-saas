import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  refresh: vi.fn(),
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

function makeDenySupabaseFixture() {
  const writeCalls: Array<{ table: string; method: "update" | "insert" }> = [];

  const supabase = {
    from(table: string) {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: null })),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            is: vi.fn(() => ({
              neq: vi.fn(() => ({
                neq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                    })),
                  })),
                })),
              })),
            })),
          })),
        })),
        update: vi.fn(() => {
          writeCalls.push({ table, method: "update" });
          return {
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          };
        }),
        insert: vi.fn(() => {
          writeCalls.push({ table, method: "insert" });
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: null, error: null })),
            })),
          };
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

function buildUpdateJobTypeFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("job_type", "service");
  return formData;
}

function buildPromoteCompanionFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("item_index", "0");
  formData.set("tab", "info");
  formData.set("return_to", "/jobs/job-1?tab=info");
  return formData;
}

function buildCreateRetestFormData() {
  const formData = new FormData();
  formData.set("parent_job_id", "job-1");
  return formData;
}

describe("legacy job-detail entrypoint same-account hardening", () => {
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
  });

  it("denies cross-account internal updateJobTypeFromForm before jobs/job_events writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { updateJobTypeFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobTypeFromForm(buildUpdateJobTypeFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
  });

  it("allows same-account internal updateJobTypeFromForm past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { updateJobTypeFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobTypeFromForm(buildUpdateJobTypeFormData())).rejects.toThrow("ALLOW_PATH_REACHED");
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
  });

  it("denies non-internal updateJobTypeFromForm before jobs/job_events writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockRejectedValue(new Error("Active internal user required."));

    const { updateJobTypeFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobTypeFromForm(buildUpdateJobTypeFormData())).rejects.toThrow(
      "Active internal user required.",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
  });

  it("denies cross-account internal promoteCompanionScopeToServiceJobFromForm before jobs/job_events writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { promoteCompanionScopeToServiceJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(promoteCompanionScopeToServiceJobFromForm(buildPromoteCompanionFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?tab=info&banner=not_authorized",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
  });

  it("allows same-account internal promoteCompanionScopeToServiceJobFromForm past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { promoteCompanionScopeToServiceJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(promoteCompanionScopeToServiceJobFromForm(buildPromoteCompanionFormData())).rejects.toThrow(
      "ALLOW_PATH_REACHED",
    );
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
  });

  it("denies non-internal promoteCompanionScopeToServiceJobFromForm before jobs/job_events writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockRejectedValue(new Error("Active internal user required."));

    const { promoteCompanionScopeToServiceJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(promoteCompanionScopeToServiceJobFromForm(buildPromoteCompanionFormData())).rejects.toThrow(
      "Active internal user required.",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
  });

  it("denies cross-account internal createRetestJobFromForm before jobs/job_events writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { createRetestJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(createRetestJobFromForm(buildCreateRetestFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
  });

  it("allows same-account internal createRetestJobFromForm past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { createRetestJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(createRetestJobFromForm(buildCreateRetestFormData())).rejects.toThrow("ALLOW_PATH_REACHED");
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
  });

  it("denies non-internal createRetestJobFromForm before jobs/job_events writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockRejectedValue(new Error("Active internal user required."));

    const { createRetestJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(createRetestJobFromForm(buildCreateRetestFormData())).rejects.toThrow(
      "Active internal user required.",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
  });
});
