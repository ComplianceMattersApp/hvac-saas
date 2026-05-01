import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
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
  requireInternalRole: (...args: unknown[]) => requireInternalRoleMock(...args),
  requireInternalUser: vi.fn(),
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

type WriteCall = {
  table: "jobs" | "job_events";
  method: "update" | "insert";
  payload?: Record<string, unknown>;
};

function buildFormData(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

function makeDenySupabaseFixture() {
  const writeCalls: WriteCall[] = [];

  const supabase = {
    from(table: string) {
      if (table === "jobs") {
        const updateQuery: any = {
          error: null,
          eq: vi.fn(() => updateQuery),
          is: vi.fn(() => updateQuery),
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
          single: vi.fn(async () => ({ data: null, error: null })),
        };

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            writeCalls.push({ table: "jobs", method: "update", payload });
            return updateQuery;
          }),
        };
      }

      if (table === "job_events") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            writeCalls.push({ table: "job_events", method: "insert", payload });
            return Promise.resolve({ error: null });
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { supabase, writeCalls };
}

function makeAllowSupabaseFixture() {
  const writeCalls: WriteCall[] = [];

  const jobsUpdateQuery: any = {
    error: null,
    eq: vi.fn(() => jobsUpdateQuery),
    is: vi.fn(() => jobsUpdateQuery),
    select: vi.fn(() => ({
      maybeSingle: vi.fn(async () => ({
        data: { id: "job-1", deleted_at: "2026-04-24T10:00:00.000Z" },
        error: null,
      })),
    })),
  };

  const supabase = {
    from(table: string) {
      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: "job-1", status: "open", ops_status: "need_to_schedule" },
                error: null,
              })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            writeCalls.push({ table: "jobs", method: "update", payload });
            return jobsUpdateQuery;
          }),
        };
      }

      if (table === "job_events") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            writeCalls.push({ table: "job_events", method: "insert", payload });
            return Promise.resolve({ error: null });
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { supabase, writeCalls };
}

describe("admin terminal job mutation same-account hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-user-1",
      internalUser: {
        user_id: "admin-user-1",
        role: "admin",
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

  it("allows same-account admin archiveJobFromForm past scoped job preflight", async () => {
    const { supabase, writeCalls } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);

    const { archiveJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      archiveJobFromForm(
        buildFormData({
          job_id: "job-1",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/ops?saved=job_archived");

    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(writeCalls.filter((call) => call.table === "jobs")).toHaveLength(1);
    expect(writeCalls.filter((call) => call.table === "job_events")).toHaveLength(0);
  });

  it("allows same-account admin cancelJobFromForm past scoped job preflight", async () => {
    const { supabase, writeCalls } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);

    const { cancelJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      cancelJobFromForm(
        buildFormData({
          job_id: "job-1",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?banner=job_cancelled");

    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(writeCalls.filter((call) => call.table === "jobs")).toHaveLength(1);
    expect(writeCalls.filter((call) => call.table === "job_events")).toHaveLength(1);
  });

  it("denies cross-account admin archiveJobFromForm before jobs write", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { archiveJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      archiveJobFromForm(
        buildFormData({
          job_id: "job-1",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?notice=not_authorized");

    expect(writeCalls.filter((call) => call.table === "jobs")).toHaveLength(0);
    expect(writeCalls.filter((call) => call.table === "job_events")).toHaveLength(0);
  });

  it("denies cross-account admin cancelJobFromForm before jobs/job_events writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { cancelJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      cancelJobFromForm(
        buildFormData({
          job_id: "job-1",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?notice=not_authorized");

    expect(writeCalls.filter((call) => call.table === "jobs")).toHaveLength(0);
    expect(writeCalls.filter((call) => call.table === "job_events")).toHaveLength(0);
  });

  it("denies non-admin internal terminal job actions before jobs/job_events writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalRoleMock.mockRejectedValue(new Error("Active admin internal user required."));

    const { archiveJobFromForm, cancelJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      archiveJobFromForm(
        buildFormData({
          job_id: "job-1",
        }),
      ),
    ).rejects.toThrow("Active admin internal user required.");

    await expect(
      cancelJobFromForm(
        buildFormData({
          job_id: "job-1",
        }),
      ),
    ).rejects.toThrow("Active admin internal user required.");

    expect(writeCalls.filter((call) => call.table === "jobs")).toHaveLength(0);
    expect(writeCalls.filter((call) => call.table === "job_events")).toHaveLength(0);
  });

  it("denies non-internal terminal job actions before jobs/job_events writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalRoleMock.mockRejectedValue(new Error("Active internal user required."));

    const { archiveJobFromForm, cancelJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      archiveJobFromForm(
        buildFormData({
          job_id: "job-1",
        }),
      ),
    ).rejects.toThrow("Active internal user required.");

    await expect(
      cancelJobFromForm(
        buildFormData({
          job_id: "job-1",
        }),
      ),
    ).rejects.toThrow("Active internal user required.");

    expect(writeCalls.filter((call) => call.table === "jobs")).toHaveLength(0);
    expect(writeCalls.filter((call) => call.table === "job_events")).toHaveLength(0);
  });
});