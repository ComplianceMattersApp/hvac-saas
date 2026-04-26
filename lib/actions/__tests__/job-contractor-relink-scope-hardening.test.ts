import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const loadScopedInternalContractorForMutationMock = vi.fn();
const loadScopedActiveInternalContractorForMutationMock = vi.fn();
const revalidatePathMock = vi.fn();
const refreshMock = vi.fn();

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

vi.mock("@/lib/auth/internal-contractor-scope", () => ({
  loadScopedInternalContractorForMutation: (...args: unknown[]) =>
    loadScopedInternalContractorForMutationMock(...args),
  loadScopedActiveInternalContractorForMutation: (...args: unknown[]) =>
    loadScopedActiveInternalContractorForMutationMock(...args),
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
  buildStaffingSnapshotMeta: vi.fn(() => ({ source: "test" })),
}));

function buildFormData(values?: Partial<Record<string, string>>) {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("tab", "info");
  formData.set("contractor_id", "contractor-2");
  if (values) {
    for (const [key, value] of Object.entries(values)) {
      if (value != null) formData.set(key, value);
    }
  }
  return formData;
}

function makeWriteTrackingSupabaseFixture() {
  const jobsWrites: Array<Record<string, unknown>> = [];
  const jobEventWrites: Array<Record<string, unknown>> = [];

  const supabase = {
    from(table: string) {
      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { contractor_id: "contractor-1" },
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

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { supabase, jobsWrites, jobEventWrites };
}

describe("job contractor relink same-account hardening", () => {
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

    loadScopedInternalContractorForMutationMock.mockResolvedValue({ id: "contractor-2" });
    loadScopedActiveInternalContractorForMutationMock.mockResolvedValue({ id: "contractor-2" });
  });

  it("denies cross-account internal updateJobContractorFromForm before jobs/job_events writes", async () => {
    const { supabase, jobsWrites, jobEventWrites } = makeWriteTrackingSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { updateJobContractorFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobContractorFromForm(buildFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?tab=info&banner=not_authorized",
    );

    expect(jobsWrites).toHaveLength(0);
    expect(jobEventWrites).toHaveLength(0);
  });

  it("denies forged cross-account contractor_id before jobs/job_events writes", async () => {
    const { supabase, jobsWrites, jobEventWrites } = makeWriteTrackingSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    loadScopedActiveInternalContractorForMutationMock.mockResolvedValue(null);

    const { updateJobContractorFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      updateJobContractorFromForm(
        buildFormData({
          contractor_id: "contractor-cross-account",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?tab=info&banner=not_authorized");

    expect(jobsWrites).toHaveLength(0);
    expect(jobEventWrites).toHaveLength(0);
  });

  it("allows same-account internal updateJobContractorFromForm and writes jobs/job_events", async () => {
    const { supabase, jobsWrites, jobEventWrites } = makeWriteTrackingSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    loadScopedActiveInternalContractorForMutationMock.mockResolvedValue({ id: "contractor-2" });

    const { updateJobContractorFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobContractorFromForm(buildFormData())).rejects.toThrow(
      /REDIRECT:\/jobs\/job-1\?tab=info&banner=contractor_updated&rv=/,
    );

    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(loadScopedActiveInternalContractorForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", contractorId: "contractor-2" }),
    );
    expect(jobsWrites).toHaveLength(1);
    expect(jobsWrites[0]).toMatchObject({ contractor_id: "contractor-2" });
    expect(jobEventWrites).toHaveLength(1);
    expect(jobEventWrites[0]).toMatchObject({ event_type: "ops_update", job_id: "job-1" });
  });
});
