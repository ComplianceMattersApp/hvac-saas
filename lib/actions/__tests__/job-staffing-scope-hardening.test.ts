import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
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
  buildStaffingSnapshotMeta: vi.fn(() => ({ source: "test" })),
}));

function buildAssignFormData(values?: Partial<Record<string, string>>) {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("user_id", "internal-user-2");
  formData.set("tab", "ops");
  if (values) {
    for (const [key, value] of Object.entries(values)) {
      if (value != null) formData.set(key, value);
    }
  }
  return formData;
}

function makeDenySupabaseFixture() {
  const assignmentWrites: Array<{ method: string; payload?: Record<string, unknown> }> = [];
  const jobEventWrites: Array<Record<string, unknown>> = [];

  const supabase = {
    from(table: string) {
      if (table === "job_assignments") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          })),
          insert: vi.fn((payload: Record<string, unknown>) => {
            assignmentWrites.push({ method: "insert", payload });
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: null, error: null })),
              })),
            };
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            assignmentWrites.push({ method: "update", payload });
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(async () => ({ data: [], error: null })),
                  })),
                })),
              })),
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

      if (table === "internal_users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      user_id: "internal-user-2",
                      is_active: true,
                      account_owner_user_id: "owner-1",
                    },
                    error: null,
                  })),
                })),
                maybeSingle: vi.fn(async () => ({
                  data: {
                    user_id: "internal-user-2",
                    is_active: true,
                    account_owner_user_id: "owner-1",
                  },
                  error: null,
                })),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { supabase, assignmentWrites, jobEventWrites };
}

function makeAllowSupabaseFixture() {
  const calls: Array<{ table: string; op: string; payload?: Record<string, unknown> }> = [];
  let activeAssignmentSelectCount = 0;

  const makeEqChain = (result: { data: any; error: any }) => ({
    eq: vi.fn(() => makeEqChain(result)),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
    select: vi.fn(async () => ({ data: Array.isArray(result.data) ? result.data : [result.data], error: result.error })),
  });

  const supabase = {
    from(table: string) {
      if (table === "internal_users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() =>
              makeEqChain({
                data: {
                  user_id: "internal-user-2",
                  role: "tech",
                  is_active: true,
                  account_owner_user_id: "owner-1",
                },
                error: null,
              }),
            ),
          })),
        };
      }

      if (table === "job_assignments") {
        return {
          select: vi.fn((selection?: string) => {
            const normalizedSelection = String(selection ?? "");
            if (normalizedSelection.includes("assigned_by")) {
              activeAssignmentSelectCount += 1;
              const result =
                activeAssignmentSelectCount === 1
                  ? { data: null, error: null }
                  : {
                      data: {
                        id: "assignment-1",
                        job_id: "job-1",
                        user_id: "internal-user-2",
                        assigned_by: "internal-user-1",
                        is_active: true,
                        is_primary: false,
                        created_at: "2026-04-22T00:00:00.000Z",
                        removed_at: null,
                        removed_by: null,
                      },
                      error: null,
                    };

              return {
                eq: vi.fn(() => makeEqChain(result)),
              };
            }

            return {
              eq: vi.fn(() => makeEqChain({ data: { id: "assignment-1", is_primary: false }, error: null })),
            };
          }),
          insert: vi.fn((payload: Record<string, unknown>) => {
            calls.push({ table, op: "insert", payload });
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: "assignment-1",
                    job_id: "job-1",
                    user_id: String(payload.user_id ?? "internal-user-2"),
                    assigned_by: "internal-user-1",
                    is_active: true,
                    is_primary: false,
                    created_at: "2026-04-22T00:00:00.000Z",
                    removed_at: null,
                    removed_by: null,
                  },
                  error: null,
                })),
              })),
            };
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            calls.push({ table, op: "update", payload });
            return {
              eq: vi.fn(() =>
                makeEqChain({
                  data: [{ id: "assignment-1" }],
                  error: null,
                }),
              ),
            };
          }),
        };
      }

      if (table === "job_events") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            calls.push({ table, op: "insert", payload });
            return Promise.resolve({ error: null });
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { supabase, calls };
}

describe("internal staffing same-account hardening", () => {
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
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  it("denies cross-account internal assignJobAssigneeFromForm before assignment or staffing event writes", async () => {
    const { supabase, assignmentWrites, jobEventWrites } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { assignJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

    await expect(assignJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(assignmentWrites).toHaveLength(0);
    expect(jobEventWrites).toHaveLength(0);
  });

  it("denies cross-account internal setPrimaryJobAssigneeFromForm before assignment or staffing event writes", async () => {
    const { supabase, assignmentWrites, jobEventWrites } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { setPrimaryJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      setPrimaryJobAssigneeFromForm(buildAssignFormData()),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?notice=not_authorized");

    expect(assignmentWrites).toHaveLength(0);
    expect(jobEventWrites).toHaveLength(0);
  });

  it("denies cross-account internal removeJobAssigneeFromForm before assignment or staffing event writes", async () => {
    const { supabase, assignmentWrites, jobEventWrites } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { removeJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

    await expect(removeJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(assignmentWrites).toHaveLength(0);
    expect(jobEventWrites).toHaveLength(0);
  });

  it("allows same-account internal assignJobAssigneeFromForm and scopes assignable teammate validation", async () => {
    const { supabase, calls } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { assignJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

    await expect(assignJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?tab=ops&banner=assignment_added",
    );

    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(calls.some((call) => call.table === "job_assignments" && call.op === "insert")).toBe(true);
    expect(calls.some((call) => call.table === "job_events" && call.op === "insert")).toBe(true);
  });

  it("allows same-account internal setPrimaryJobAssigneeFromForm past scoped job preflight", async () => {
    const { supabase, calls } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { setPrimaryJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

    await expect(setPrimaryJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?tab=ops&banner=assignment_primary_set",
    );

    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(
      calls.filter((call) => call.table === "job_assignments" && call.op === "update").length,
    ).toBeGreaterThan(0);
    expect(calls.some((call) => call.table === "job_events" && call.op === "insert")).toBe(true);
  });

  it("allows same-account internal removeJobAssigneeFromForm past scoped job preflight", async () => {
    const { supabase, calls } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { removeJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

    await expect(removeJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?tab=ops&banner=assignment_removed",
    );

    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(
      calls.filter((call) => call.table === "job_assignments" && call.op === "update").length,
    ).toBeGreaterThan(0);
    expect(calls.some((call) => call.table === "job_events" && call.op === "insert")).toBe(true);
  });
});