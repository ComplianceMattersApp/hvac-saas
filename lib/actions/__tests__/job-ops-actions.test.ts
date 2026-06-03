import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const evaluateEccOpsStatusMock = vi.fn();
const evaluateJobOpsStatusMock = vi.fn();
const healStalePaperworkOpsStatusMock = vi.fn();
const revalidatePathMock = vi.fn();
const redirectMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  isInternalAccessError: vi.fn(() => false),
}));

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) =>
    loadScopedInternalJobForMutationMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

vi.mock("@/lib/actions/ecc-status", () => ({
  evaluateEccOpsStatus: (...args: unknown[]) => evaluateEccOpsStatusMock(...args),
}));

vi.mock("@/lib/actions/job-evaluator", () => ({
  evaluateJobOpsStatus: (...args: unknown[]) => evaluateJobOpsStatusMock(...args),
  healStalePaperworkOpsStatus: (...args: unknown[]) => healStalePaperworkOpsStatusMock(...args),
}));

vi.mock("@/lib/actions/ops-status", () => ({
  forceSetOpsStatus: vi.fn(),
}));

type JobSnapshot = {
  id: string;
  status: string;
  job_type: string;
  ops_status: string;
  field_complete: boolean;
  certs_complete: boolean;
  invoice_complete: boolean;
  scheduled_date: string | null;
  window_start: string | null;
  window_end: string | null;
  pending_info_reason: string | null;
  on_hold_reason: string | null;
  follow_up_date: string | null;
  next_action_note: string | null;
  action_required_by: string | null;
};

function makeSupabaseForRelease(before: JobSnapshot, afterOpsStatus: string) {
  let jobsSelectCount = 0;

  return {
    from(table: string) {
      if (table === "jobs") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          single: vi.fn(async () => {
            jobsSelectCount += 1;

            if (jobsSelectCount === 1) {
              return { data: before, error: null };
            }

            return { data: { ops_status: afterOpsStatus }, error: null };
          }),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        };

        return query;
      }

      if (table === "job_events") {
        return {
          insert: vi.fn(async () => ({ error: null })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function makeSupabaseForOpsUpdate(params: {
  before: Pick<
    JobSnapshot,
    | "ops_status"
    | "pending_info_reason"
    | "on_hold_reason"
    | "follow_up_date"
    | "next_action_note"
    | "action_required_by"
  >;
}) {
  const jobEvents: Record<string, unknown>[] = [];
  const jobUpdates: Record<string, unknown>[] = [];

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "internal-user-1" } } })),
    },
    from(table: string) {
      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: params.before, error: null })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            jobUpdates.push(payload);
            return {
              eq: vi.fn(async () => ({ error: null })),
            };
          }),
        };
      }

      if (table === "job_events") {
        return {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            jobEvents.push(payload);
            return { error: null };
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { supabase, jobEvents, jobUpdates };
}

function makeSupabaseForReleaseFromForm(before: JobSnapshot, afterOpsStatus: string) {
  const jobEvents: Record<string, unknown>[] = [];
  const jobUpdates: Record<string, unknown>[] = [];

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "internal-user-1" } } })),
    },
    from(table: string) {
      if (table === "jobs") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          single: vi.fn(async () => ({ data: before, error: null })),
          update: vi.fn((payload: Record<string, unknown>) => {
            jobUpdates.push(payload);
            return {
              eq: vi.fn(async () => ({ error: null })),
            };
          }),
        };
        return query;
      }

      if (table === "job_events") {
        return {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            jobEvents.push(payload);
            return { error: null };
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { supabase, jobEvents, jobUpdates, afterOpsStatus };
}

describe("releaseAndReevaluate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
    evaluateJobOpsStatusMock.mockResolvedValue(undefined);
    healStalePaperworkOpsStatusMock.mockResolvedValue(true);
    revalidatePathMock.mockReturnValue(undefined);
    redirectMock.mockReturnValue(undefined);
    requireInternalUserMock.mockResolvedValue({
      userId: "internal-user-1",
      internalUser: {
        user_id: "internal-user-1",
        account_owner_user_id: "owner-1",
        role: "office",
        is_active: true,
      },
    });
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  it("heals fully complete ECC jobs to closed after release reevaluation", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseForRelease(
        {
          id: "job-1",
          status: "completed",
          job_type: "ecc",
          ops_status: "paperwork_required",
          field_complete: true,
          certs_complete: true,
          invoice_complete: true,
          scheduled_date: "2026-04-10",
          window_start: "08:00",
          window_end: "10:00",
          pending_info_reason: null,
          on_hold_reason: null,
          follow_up_date: null,
          next_action_note: null,
          action_required_by: null,
        },
        "closed",
      ),
    );

    const { releaseAndReevaluate } = await import("@/lib/actions/job-ops-actions");
    const nextOps = await releaseAndReevaluate("job-1", "unit_test");

    expect(evaluateEccOpsStatusMock).toHaveBeenCalledWith("job-1");
    expect(healStalePaperworkOpsStatusMock).toHaveBeenCalledWith("job-1");
    expect(healStalePaperworkOpsStatusMock).toHaveBeenCalledTimes(1);
    expect(nextOps).toBe("closed");
  });

  it("writes normalized ops blocker metadata for updateJobOpsFromForm", async () => {
    const { supabase, jobEvents } = makeSupabaseForOpsUpdate({
      before: {
        ops_status: "scheduled",
        pending_info_reason: null,
        on_hold_reason: null,
        follow_up_date: null,
        next_action_note: null,
        action_required_by: null,
      },
    });
    createClientMock.mockResolvedValue(supabase);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("interrupt_state", "pending_info");
    formData.set("status_reason", "Need permit confirmation");

    const { updateJobOpsFromForm } = await import("@/lib/actions/job-ops-actions");
    await updateJobOpsFromForm(formData);

    expect(jobEvents).toHaveLength(1);
    expect(jobEvents[0]).toEqual(
      expect.objectContaining({
        event_type: "ops_update",
        user_id: "internal-user-1",
        meta: expect.objectContaining({
          timeline_v: 1,
          event_family: "ops_blocker",
          actor_user_id: "internal-user-1",
          source_action: "updateJobOpsFromForm",
          previous: { ops_status: "scheduled" },
          next: { ops_status: "pending_info" },
          reason: "Need permit confirmation",
          blocker_context: expect.objectContaining({
            pending_reason: "Need permit confirmation",
            hold_reason: null,
          }),
        }),
      }),
    );
  });

  it("writes normalized ops blocker metadata for releaseAndReevaluateFromForm", async () => {
    const before: JobSnapshot = {
      id: "job-1",
      status: "open",
      job_type: "service",
      ops_status: "on_hold",
      field_complete: false,
      certs_complete: false,
      invoice_complete: false,
      scheduled_date: "2026-04-10",
      window_start: "08:00",
      window_end: "10:00",
      pending_info_reason: null,
      on_hold_reason: "Missing parts",
      follow_up_date: null,
      next_action_note: null,
      action_required_by: null,
    };

    const { supabase, jobEvents } = makeSupabaseForReleaseFromForm(before, "scheduled");
    createClientMock.mockResolvedValue(supabase);

    const formData = new FormData();
    formData.set("job_id", "job-1");

    const { releaseAndReevaluateFromForm } = await import("@/lib/actions/job-ops-actions");
    await releaseAndReevaluateFromForm(formData);

    expect(jobEvents).toHaveLength(1);
    expect(jobEvents[0]).toEqual(
      expect.objectContaining({
        event_type: "ops_update",
        user_id: "internal-user-1",
        meta: expect.objectContaining({
          timeline_v: 1,
          event_family: "ops_blocker",
          actor_user_id: "internal-user-1",
          source_action: "releaseAndReevaluateFromForm",
          previous: { ops_status: "on_hold" },
          next: { ops_status: "scheduled" },
        }),
      }),
    );
  });
});