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

function makeStaffingFixture() {
  const writes: Array<{ table: string; op: string; payload?: Record<string, unknown> }> = [];

  const supabase = {
    from(table: string) {
      if (table === "internal_users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      user_id: "internal-user-2",
                      role: "tech",
                      is_active: true,
                      account_owner_user_id: "owner-1",
                    },
                    error: null,
                  })),
                })),
              })),
            })),
          })),
        };
      }

      if (table === "job_assignments") {
        return {
          select: vi.fn((selection?: string) => {
            const normalized = String(selection ?? "");
            if (normalized.includes("assigned_by")) {
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                    })),
                  })),
                })),
              };
            }

            if (normalized.includes("id, is_primary")) {
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({
                        data: {
                          id: "assignment-1",
                          is_primary: false,
                        },
                        error: null,
                      })),
                    })),
                  })),
                })),
              };
            }

            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                  })),
                })),
              })),
            };
          }),
          insert: vi.fn((payload: Record<string, unknown>) => {
            writes.push({ table, op: "insert", payload });
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
                    created_at: "2026-04-29T00:00:00.000Z",
                    removed_at: null,
                    removed_by: null,
                  },
                  error: null,
                })),
              })),
            };
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            writes.push({ table, op: "update", payload });
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(async () => ({ data: [{ id: "assignment-1" }], error: null })),
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
            writes.push({ table, op: "insert", payload });
            return Promise.resolve({ error: null });
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { supabase, writes };
}

describe("job staffing entitlement hardening", () => {
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

  describe("assignJobAssigneeFromForm", () => {
    it("allows active account assignment mutation", async () => {
      const fixture = makeStaffingFixture();
      createClientMock.mockResolvedValue(fixture.supabase);

      const { assignJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

      await expect(assignJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
        "REDIRECT:/jobs/job-1?tab=ops&banner=assignment_added",
      );

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(fixture.writes.some((w) => w.table === "job_assignments" && w.op === "insert")).toBe(true);
      expect(fixture.writes.some((w) => w.table === "job_events" && w.op === "insert")).toBe(true);
      expect(revalidatePathMock).toHaveBeenCalled();
    });

    it("allows valid trial assignment mutation", async () => {
      const fixture = makeStaffingFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_trial",
      });

      const { assignJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

      await expect(assignJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
        "REDIRECT:/jobs/job-1?tab=ops&banner=assignment_added",
      );

      expect(fixture.writes.some((w) => w.table === "job_assignments" && w.op === "insert")).toBe(true);
    });

    it("blocks expired trial assignment mutation before writes", async () => {
      const fixture = makeStaffingFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_expired",
      });

      const { assignJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

      await expect(assignJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
      );

      expect(fixture.writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("blocks null-ended trial assignment mutation before writes", async () => {
      const fixture = makeStaffingFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_missing_end",
      });

      const { assignJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

      await expect(assignJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
      );

      expect(fixture.writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("allows internal comped assignment mutation", async () => {
      const fixture = makeStaffingFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_internal_comped",
      });

      const { assignJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

      await expect(assignJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
        "REDIRECT:/jobs/job-1?tab=ops&banner=assignment_added",
      );

      expect(fixture.writes.some((w) => w.table === "job_assignments" && w.op === "insert")).toBe(true);
    });

    it("blocks missing entitlement assignment mutation before writes", async () => {
      const fixture = makeStaffingFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_missing_entitlement",
      });

      const { assignJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

      await expect(assignJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
      );

      expect(fixture.writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });

  describe("setPrimaryJobAssigneeFromForm", () => {
    it("allows active account primary-assignee mutation", async () => {
      const fixture = makeStaffingFixture();
      createClientMock.mockResolvedValue(fixture.supabase);

      const { setPrimaryJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

      await expect(setPrimaryJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
        "REDIRECT:/jobs/job-1?tab=ops&banner=assignment_primary_set",
      );

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(fixture.writes.some((w) => w.table === "job_assignments" && w.op === "update")).toBe(true);
      expect(fixture.writes.some((w) => w.table === "job_events" && w.op === "insert")).toBe(true);
      expect(revalidatePathMock).toHaveBeenCalled();
    });

    it("allows valid trial primary-assignee mutation", async () => {
      const fixture = makeStaffingFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_trial",
      });

      const { setPrimaryJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

      await expect(setPrimaryJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
        "REDIRECT:/jobs/job-1?tab=ops&banner=assignment_primary_set",
      );

      expect(fixture.writes.some((w) => w.table === "job_assignments" && w.op === "update")).toBe(true);
    });

    it("blocks expired trial primary-assignee mutation before writes", async () => {
      const fixture = makeStaffingFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_expired",
      });

      const { setPrimaryJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

      await expect(setPrimaryJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
      );

      expect(fixture.writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("blocks null-ended trial primary-assignee mutation before writes", async () => {
      const fixture = makeStaffingFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_missing_end",
      });

      const { setPrimaryJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

      await expect(setPrimaryJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
      );

      expect(fixture.writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("allows internal comped primary-assignee mutation", async () => {
      const fixture = makeStaffingFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_internal_comped",
      });

      const { setPrimaryJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

      await expect(setPrimaryJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
        "REDIRECT:/jobs/job-1?tab=ops&banner=assignment_primary_set",
      );

      expect(fixture.writes.some((w) => w.table === "job_assignments" && w.op === "update")).toBe(true);
    });

    it("blocks missing entitlement primary-assignee mutation before writes", async () => {
      const fixture = makeStaffingFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_missing_entitlement",
      });

      const { setPrimaryJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

      await expect(setPrimaryJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
      );

      expect(fixture.writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });

  describe("removeJobAssigneeFromForm", () => {
    it("allows active account remove-assignee mutation", async () => {
      const fixture = makeStaffingFixture();
      createClientMock.mockResolvedValue(fixture.supabase);

      const { removeJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

      await expect(removeJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
        "REDIRECT:/jobs/job-1?tab=ops&banner=assignment_removed",
      );

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(fixture.writes.some((w) => w.table === "job_assignments" && w.op === "update")).toBe(true);
      expect(fixture.writes.some((w) => w.table === "job_events" && w.op === "insert")).toBe(true);
      expect(revalidatePathMock).toHaveBeenCalled();
    });

    it("allows valid trial remove-assignee mutation", async () => {
      const fixture = makeStaffingFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_trial",
      });

      const { removeJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

      await expect(removeJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
        "REDIRECT:/jobs/job-1?tab=ops&banner=assignment_removed",
      );

      expect(fixture.writes.some((w) => w.table === "job_assignments" && w.op === "update")).toBe(true);
    });

    it("blocks expired trial remove-assignee mutation before writes", async () => {
      const fixture = makeStaffingFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_expired",
      });

      const { removeJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

      await expect(removeJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
      );

      expect(fixture.writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("blocks null-ended trial remove-assignee mutation before writes", async () => {
      const fixture = makeStaffingFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_missing_end",
      });

      const { removeJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

      await expect(removeJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
      );

      expect(fixture.writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("allows internal comped remove-assignee mutation", async () => {
      const fixture = makeStaffingFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_internal_comped",
      });

      const { removeJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

      await expect(removeJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
        "REDIRECT:/jobs/job-1?tab=ops&banner=assignment_removed",
      );

      expect(fixture.writes.some((w) => w.table === "job_assignments" && w.op === "update")).toBe(true);
    });

    it("blocks missing entitlement remove-assignee mutation before writes", async () => {
      const fixture = makeStaffingFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_missing_entitlement",
      });

      const { removeJobAssigneeFromForm } = await import("@/lib/actions/job-actions");

      await expect(removeJobAssigneeFromForm(buildAssignFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
      );

      expect(fixture.writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });
});
