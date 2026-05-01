import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalEccJobForMutationMock = vi.fn();
const loadScopedInternalEccTestRunForMutationMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const evaluateEccOpsStatusMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  refresh: vi.fn(),
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

vi.mock("@/lib/actions/ecc-status", () => ({
  evaluateEccOpsStatus: (...args: unknown[]) => evaluateEccOpsStatusMock(...args),
}));

function makeSessionClientFixture() {
  const updateCalls: Array<{ table: string; values: Record<string, unknown>; eq: Array<[string, unknown]> }> = [];
  const insertCalls: Array<{ table: string; values: Record<string, unknown> }> = [];
  const deleteCalls: Array<{ table: string; eq: Array<[string, unknown]> }> = [];

  const supabase = {
    from(table: string) {
      if (table === "ecc_test_runs") {
        return {
          update(values: Record<string, unknown>) {
            const record = { table, values, eq: [] as Array<[string, unknown]> };
            updateCalls.push(record);
            return {
              eq(column: string, value: unknown) {
                record.eq.push([column, value]);
                return {
                  eq(nextColumn: string, nextValue: unknown) {
                    record.eq.push([nextColumn, nextValue]);
                    return {
                      select: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => ({
                          data: {
                            id: String(value),
                            job_id: String(nextValue),
                            test_type: "duct_leakage",
                            override_pass: values.override_pass ?? null,
                            override_reason: values.override_reason ?? null,
                          },
                          error: null,
                        })),
                      })),
                    };
                  },
                };
              },
            };
          },
          insert(values: Record<string, unknown>) {
            insertCalls.push({ table, values });
            return Promise.resolve({ error: null });
          },
          delete() {
            const record = { table, eq: [] as Array<[string, unknown]> };
            deleteCalls.push(record);
            return {
              eq(column: string, value: unknown) {
                record.eq.push([column, value]);
                return {
                  eq(nextColumn: string, nextValue: unknown) {
                    record.eq.push([nextColumn, nextValue]);
                    return {
                      select: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => ({
                          data: {
                            system_id: "system-1",
                          },
                          error: null,
                        })),
                      })),
                    };
                  },
                };
              },
            };
          },
          select(columns?: string, options?: Record<string, unknown>) {
            if (columns === "system_id") {
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    single: vi.fn(async () => ({
                      data: { system_id: "system-1" },
                      error: null,
                    })),
                    maybeSingle: vi.fn(async () => ({
                      data: { system_id: "system-1" },
                      error: null,
                    })),
                  })),
                })),
              };
            }

            if (columns === "id" && options?.count === "exact" && options?.head === true) {
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(async () => ({
                    count: 0,
                    error: null,
                  })),
                })),
              };
            }

            if (columns === "id") {
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      limit: vi.fn(async () => ({
                        data: [],
                        error: null,
                      })),
                    })),
                  })),
                })),
              };
            }

            throw new Error(`Unexpected ecc_test_runs select shape: ${String(columns)}`);
          },
        };
      }

      if (table === "job_visits") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { id: "visit-1", visit_number: 1 },
                  error: null,
                })),
              })),
            })),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: "visit-1" },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "job_equipment") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({
                count: 0,
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "job_systems") {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({
                error: null,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { supabase, updateCalls, insertCalls, deleteCalls };
}

describe("ECC management entitlement hardening", () => {
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
    loadScopedInternalEccTestRunForMutationMock.mockResolvedValue({
      job: { id: "job-1", job_type: "ecc" },
      testRun: { id: "run-1", job_id: "job-1", system_id: "system-1", test_type: "duct_leakage" },
    });
    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  describe("saveEccTestOverrideFromForm", () => {
    function buildFormData() {
      const formData = new FormData();
      formData.set("job_id", "job-1");
      formData.set("test_run_id", "run-1");
      formData.set("system_id", "system-1");
      formData.set("test_type", "duct_leakage");
      formData.set("override", "pass");
      formData.set("override_reason", "Manual review passed");
      return formData;
    }

    it("allows active account override save", async () => {
      const { supabase, updateCalls } = makeSessionClientFixture();
      createClientMock.mockResolvedValue(supabase);

      const { saveEccTestOverrideFromForm } = await import("@/lib/actions/job-actions");

      await expect(saveEccTestOverrideFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/jobs/job-1/tests?t=duct_leakage&s=system-1",
      );

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(updateCalls).toHaveLength(1);
    });

    it("allows valid trial override save", async () => {
      const { supabase, updateCalls } = makeSessionClientFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: true, reason: "allowed_trial" });

      const { saveEccTestOverrideFromForm } = await import("@/lib/actions/job-actions");

      await expect(saveEccTestOverrideFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/jobs/job-1/tests?t=duct_leakage&s=system-1",
      );

      expect(updateCalls).toHaveLength(1);
    });

    it("blocks expired trial override save before writes", async () => {
      const { supabase, updateCalls, insertCalls, deleteCalls } = makeSessionClientFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: false, reason: "blocked_trial_expired" });

      const { saveEccTestOverrideFromForm } = await import("@/lib/actions/job-actions");

      await expect(saveEccTestOverrideFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
      );

      expect(updateCalls).toHaveLength(0);
      expect(insertCalls).toHaveLength(0);
      expect(deleteCalls).toHaveLength(0);
      expect(evaluateEccOpsStatusMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("blocks null-ended trial override save before writes", async () => {
      const { supabase, updateCalls, insertCalls, deleteCalls } = makeSessionClientFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: false, reason: "blocked_trial_missing_end" });

      const { saveEccTestOverrideFromForm } = await import("@/lib/actions/job-actions");

      await expect(saveEccTestOverrideFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
      );

      expect(updateCalls).toHaveLength(0);
      expect(insertCalls).toHaveLength(0);
      expect(deleteCalls).toHaveLength(0);
      expect(evaluateEccOpsStatusMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("allows internal comped override save", async () => {
      const { supabase, updateCalls } = makeSessionClientFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: true, reason: "allowed_internal_comped" });

      const { saveEccTestOverrideFromForm } = await import("@/lib/actions/job-actions");

      await expect(saveEccTestOverrideFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/jobs/job-1/tests?t=duct_leakage&s=system-1",
      );

      expect(updateCalls).toHaveLength(1);
    });

    it("blocks missing entitlement override save before writes", async () => {
      const { supabase, updateCalls, insertCalls, deleteCalls } = makeSessionClientFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: false, reason: "blocked_missing_entitlement" });

      const { saveEccTestOverrideFromForm } = await import("@/lib/actions/job-actions");

      await expect(saveEccTestOverrideFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
      );

      expect(updateCalls).toHaveLength(0);
      expect(insertCalls).toHaveLength(0);
      expect(deleteCalls).toHaveLength(0);
      expect(evaluateEccOpsStatusMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });

  describe("addEccTestRunFromForm", () => {
    function buildFormData() {
      const formData = new FormData();
      formData.set("job_id", "job-1");
      formData.set("system_id", "system-1");
      formData.set("test_type", "duct_leakage");
      return formData;
    }

    it("allows active account add run", async () => {
      const { supabase, insertCalls } = makeSessionClientFixture();
      createClientMock.mockResolvedValue(supabase);

      const { addEccTestRunFromForm } = await import("@/lib/actions/job-actions");

      await expect(addEccTestRunFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/jobs/job-1/tests?t=duct_leakage&s=system-1",
      );

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(insertCalls).toHaveLength(1);
      expect(insertCalls[0].table).toBe("ecc_test_runs");
    });

    it("allows valid trial add run", async () => {
      const { supabase, insertCalls } = makeSessionClientFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: true, reason: "allowed_trial" });

      const { addEccTestRunFromForm } = await import("@/lib/actions/job-actions");

      await expect(addEccTestRunFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/jobs/job-1/tests?t=duct_leakage&s=system-1",
      );

      expect(insertCalls).toHaveLength(1);
    });

    it("blocks expired trial add run before writes", async () => {
      const { supabase, updateCalls, insertCalls, deleteCalls } = makeSessionClientFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: false, reason: "blocked_trial_expired" });

      const { addEccTestRunFromForm } = await import("@/lib/actions/job-actions");

      await expect(addEccTestRunFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
      );

      expect(updateCalls).toHaveLength(0);
      expect(insertCalls).toHaveLength(0);
      expect(deleteCalls).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("blocks null-ended trial add run before writes", async () => {
      const { supabase, updateCalls, insertCalls, deleteCalls } = makeSessionClientFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: false, reason: "blocked_trial_missing_end" });

      const { addEccTestRunFromForm } = await import("@/lib/actions/job-actions");

      await expect(addEccTestRunFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
      );

      expect(updateCalls).toHaveLength(0);
      expect(insertCalls).toHaveLength(0);
      expect(deleteCalls).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("allows internal comped add run", async () => {
      const { supabase, insertCalls } = makeSessionClientFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: true, reason: "allowed_internal_comped" });

      const { addEccTestRunFromForm } = await import("@/lib/actions/job-actions");

      await expect(addEccTestRunFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/jobs/job-1/tests?t=duct_leakage&s=system-1",
      );

      expect(insertCalls).toHaveLength(1);
    });

    it("blocks missing entitlement add run before writes", async () => {
      const { supabase, updateCalls, insertCalls, deleteCalls } = makeSessionClientFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: false, reason: "blocked_missing_entitlement" });

      const { addEccTestRunFromForm } = await import("@/lib/actions/job-actions");

      await expect(addEccTestRunFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
      );

      expect(updateCalls).toHaveLength(0);
      expect(insertCalls).toHaveLength(0);
      expect(deleteCalls).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });

  describe("deleteEccTestRunFromForm", () => {
    function buildFormData() {
      const formData = new FormData();
      formData.set("job_id", "job-1");
      formData.set("test_run_id", "run-1");
      return formData;
    }

    it("allows active account delete run", async () => {
      const { supabase, deleteCalls } = makeSessionClientFixture();
      createClientMock.mockResolvedValue(supabase);

      const { deleteEccTestRunFromForm } = await import("@/lib/actions/job-actions");

      await expect(deleteEccTestRunFromForm(buildFormData())).resolves.toBeUndefined();

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0].table).toBe("ecc_test_runs");
      expect(evaluateEccOpsStatusMock).toHaveBeenCalled();
      expect(revalidatePathMock).toHaveBeenCalled();
    });

    it("allows valid trial delete run", async () => {
      const { supabase, deleteCalls } = makeSessionClientFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: true, reason: "allowed_trial" });

      const { deleteEccTestRunFromForm } = await import("@/lib/actions/job-actions");

      await expect(deleteEccTestRunFromForm(buildFormData())).resolves.toBeUndefined();

      expect(deleteCalls).toHaveLength(1);
    });

    it("blocks expired trial delete run before writes", async () => {
      const { supabase, updateCalls, insertCalls, deleteCalls } = makeSessionClientFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: false, reason: "blocked_trial_expired" });

      const { deleteEccTestRunFromForm } = await import("@/lib/actions/job-actions");

      await expect(deleteEccTestRunFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
      );

      expect(updateCalls).toHaveLength(0);
      expect(insertCalls).toHaveLength(0);
      expect(deleteCalls).toHaveLength(0);
      expect(evaluateEccOpsStatusMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("blocks null-ended trial delete run before writes", async () => {
      const { supabase, updateCalls, insertCalls, deleteCalls } = makeSessionClientFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: false, reason: "blocked_trial_missing_end" });

      const { deleteEccTestRunFromForm } = await import("@/lib/actions/job-actions");

      await expect(deleteEccTestRunFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
      );

      expect(updateCalls).toHaveLength(0);
      expect(insertCalls).toHaveLength(0);
      expect(deleteCalls).toHaveLength(0);
      expect(evaluateEccOpsStatusMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("allows internal comped delete run", async () => {
      const { supabase, deleteCalls } = makeSessionClientFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: true, reason: "allowed_internal_comped" });

      const { deleteEccTestRunFromForm } = await import("@/lib/actions/job-actions");

      await expect(deleteEccTestRunFromForm(buildFormData())).resolves.toBeUndefined();

      expect(deleteCalls).toHaveLength(1);
    });

    it("blocks missing entitlement delete run before writes", async () => {
      const { supabase, updateCalls, insertCalls, deleteCalls } = makeSessionClientFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: false, reason: "blocked_missing_entitlement" });

      const { deleteEccTestRunFromForm } = await import("@/lib/actions/job-actions");

      await expect(deleteEccTestRunFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
      );

      expect(updateCalls).toHaveLength(0);
      expect(insertCalls).toHaveLength(0);
      expect(deleteCalls).toHaveLength(0);
      expect(evaluateEccOpsStatusMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });
});
