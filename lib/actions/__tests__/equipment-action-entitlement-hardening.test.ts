import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalEquipmentJobForMutationMock = vi.fn();
const loadScopedInternalJobEquipmentForMutationMock = vi.fn();
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
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  requireInternalRole: vi.fn(),
}));

vi.mock("@/lib/auth/internal-equipment-scope", () => ({
  loadScopedInternalEquipmentJobForMutation: (...args: unknown[]) =>
    loadScopedInternalEquipmentJobForMutationMock(...args),
  loadScopedInternalJobEquipmentForMutation: (...args: unknown[]) =>
    loadScopedInternalJobEquipmentForMutationMock(...args),
  loadScopedInternalJobSystemForMutation: vi.fn(),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

function makeSessionClientFixture(fixture?: {
  systemsByName?: Record<string, { id: string; name: string }>;
  equipmentById?: Record<string, { id: string; job_id: string; system_id: string }>;
  equipmentCountBySystem?: Record<string, number>;
  testRunCountBySystem?: Record<string, number>;
}) {
  const systemsByName = fixture?.systemsByName ?? {};
  const equipmentById = fixture?.equipmentById ?? {};
  const equipmentCountBySystem = fixture?.equipmentCountBySystem ?? {};
  const testRunCountBySystem = fixture?.testRunCountBySystem ?? {};

  const systemInsertCalls: Array<Record<string, unknown>> = [];
  const systemDeleteCalls: Array<Array<[string, unknown]>> = [];
  const equipmentInsertCalls: Array<Record<string, unknown>> = [];
  const equipmentUpdateCalls: Array<{ values: Record<string, unknown>; eq: Array<[string, unknown]> }> = [];
  const equipmentDeleteCalls: Array<Array<[string, unknown]>> = [];

  const supabase = {
    from(table: string) {
      if (table === "platform_account_entitlements") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  entitlement_status: "active",
                  seat_limit: null,
                  trial_ends_at: null,
                  notes: null,
                  stripe_customer_id: "cus_123",
                  stripe_subscription_id: "sub_123",
                  stripe_subscription_status: "active",
                },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "job_systems") {
        return {
          select: vi.fn((_columns?: string) => ({
            eq: vi.fn((column: string, _value: unknown) => ({
              eq: vi.fn((nextColumn: string, nextValue: unknown) => ({
                maybeSingle: vi.fn(async () => {
                  if (column !== "job_id") {
                    throw new Error(`Unexpected first job_systems eq column: ${column}`);
                  }

                  if (nextColumn === "name") {
                    const row = systemsByName[String(nextValue ?? "").trim()] ?? null;
                    return { data: row, error: null };
                  }

                  return { data: null, error: null };
                }),
              })),
            })),
          })),
          insert(values: Record<string, unknown>) {
            systemInsertCalls.push(values);
            const nextId = `system-new-${systemInsertCalls.length}`;
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { id: nextId },
                  error: null,
                })),
              })),
            };
          },
          delete() {
            const eqCalls: Array<[string, unknown]> = [];
            systemDeleteCalls.push(eqCalls);
            return {
              eq(column: string, value: unknown) {
                eqCalls.push([column, value]);
                return {
                  eq(nextColumn: string, nextValue: unknown) {
                    eqCalls.push([nextColumn, nextValue]);
                    return Promise.resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      }

      if (table === "job_equipment") {
        return {
          insert(values: Record<string, unknown>) {
            equipmentInsertCalls.push(values);
            return Promise.resolve({ error: null });
          },
          select: vi.fn((columns?: string, options?: Record<string, unknown>) => {
            if (columns === "system_id") {
              return {
                eq: vi.fn((column: string, value: unknown) => ({
                  eq: vi.fn((nextColumn: string, nextValue: unknown) => ({
                    maybeSingle: vi.fn(async () => {
                      if (column !== "id" || nextColumn !== "job_id") {
                        throw new Error("Unexpected job_equipment lookup shape");
                      }

                      const row = equipmentById[String(value ?? "").trim()] ?? null;
                      if (!row || row.job_id !== String(nextValue ?? "").trim()) {
                        return { data: null, error: null };
                      }

                      return { data: { system_id: row.system_id }, error: null };
                    }),
                  })),
                })),
              };
            }

            if (columns === "id" && options?.count === "exact" && options?.head === true) {
              return {
                eq: vi.fn((_column: string, _value: unknown) => ({
                  eq: vi.fn((_nextColumn: string, nextValue: unknown) =>
                    Promise.resolve({
                      count: equipmentCountBySystem[String(nextValue ?? "").trim()] ?? 0,
                      error: null,
                    }),
                  ),
                })),
              };
            }

            throw new Error(`Unexpected job_equipment select shape: ${String(columns)}`);
          }),
          update(values: Record<string, unknown>) {
            const record = { values, eq: [] as Array<[string, unknown]> };
            equipmentUpdateCalls.push(record);
            return {
              eq(column: string, value: unknown) {
                record.eq.push([column, value]);
                return {
                  eq(nextColumn: string, nextValue: unknown) {
                    record.eq.push([nextColumn, nextValue]);
                    return Promise.resolve({ error: null });
                  },
                };
              },
            };
          },
          delete() {
            const eqCalls: Array<[string, unknown]> = [];
            equipmentDeleteCalls.push(eqCalls);
            return {
              eq(column: string, value: unknown) {
                eqCalls.push([column, value]);
                return {
                  eq(nextColumn: string, nextValue: unknown) {
                    eqCalls.push([nextColumn, nextValue]);
                    return {
                      select: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => {
                          const row = equipmentById[String(value ?? "").trim()] ?? null;
                          if (!row || row.job_id !== String(nextValue ?? "").trim()) {
                            return { data: null, error: null };
                          }

                          return { data: { system_id: row.system_id }, error: null };
                        }),
                      })),
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "ecc_test_runs") {
        return {
          select: vi.fn((columns?: string, options?: Record<string, unknown>) => {
            if (columns === "id" && options?.count === "exact" && options?.head === true) {
              return {
                eq: vi.fn((_column: string, _value: unknown) => ({
                  eq: vi.fn((_nextColumn: string, nextValue: unknown) =>
                    Promise.resolve({
                      count: testRunCountBySystem[String(nextValue ?? "").trim()] ?? 0,
                      error: null,
                    }),
                  ),
                })),
              };
            }

            throw new Error(`Unexpected ecc_test_runs select shape: ${String(columns)}`);
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return {
    supabase,
    systemInsertCalls,
    systemDeleteCalls,
    equipmentInsertCalls,
    equipmentUpdateCalls,
    equipmentDeleteCalls,
  };
}

describe("equipment action entitlement hardening", () => {
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
    loadScopedInternalEquipmentJobForMutationMock.mockResolvedValue({ id: "job-1", customer_id: "cust-1" });
    loadScopedInternalJobEquipmentForMutationMock.mockResolvedValue({
      job: { id: "job-1", customer_id: "cust-1" },
      equipment: { id: "equipment-1", job_id: "job-1", system_id: "system-old" },
    });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  describe("addJobEquipmentFromForm", () => {
    function buildFormData() {
      const formData = new FormData();
      formData.set("job_id", "job-1");
      formData.set("equipment_role", "condenser");
      formData.set("system_location", "Upstairs");
      formData.set("manufacturer", "Carrier");
      return formData;
    }

    it("allows active account equipment add", async () => {
      const fixture = makeSessionClientFixture({
        systemsByName: { Upstairs: { id: "system-1", name: "Upstairs" } },
      });
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue({});

      const { addJobEquipmentFromForm } = await import("@/lib/actions/job-actions");
      await expect(addJobEquipmentFromForm(buildFormData())).rejects.toThrow("REDIRECT:/jobs/job-1/info?f=equipment");

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(fixture.equipmentInsertCalls).toHaveLength(1);
      expect(revalidatePathMock).toHaveBeenCalled();
    });

    it("allows valid trial equipment add", async () => {
      const fixture = makeSessionClientFixture({
        systemsByName: { Upstairs: { id: "system-1", name: "Upstairs" } },
      });
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue({});
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: true, reason: "allowed_trial" });

      const { addJobEquipmentFromForm } = await import("@/lib/actions/job-actions");
      await expect(addJobEquipmentFromForm(buildFormData())).rejects.toThrow("REDIRECT:/jobs/job-1/info?f=equipment");

      expect(fixture.equipmentInsertCalls).toHaveLength(1);
    });

    it("blocks expired trial equipment add before writes", async () => {
      const fixture = makeSessionClientFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue({});
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: false, reason: "blocked_trial_expired" });

      const { addJobEquipmentFromForm } = await import("@/lib/actions/job-actions");
      await expect(addJobEquipmentFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
      );

      expect(fixture.systemInsertCalls).toHaveLength(0);
      expect(fixture.equipmentInsertCalls).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("blocks null-ended trial equipment add before writes", async () => {
      const fixture = makeSessionClientFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue({});
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: false, reason: "blocked_trial_missing_end" });

      const { addJobEquipmentFromForm } = await import("@/lib/actions/job-actions");
      await expect(addJobEquipmentFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
      );

      expect(fixture.systemInsertCalls).toHaveLength(0);
      expect(fixture.equipmentInsertCalls).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("allows internal comped equipment add", async () => {
      const fixture = makeSessionClientFixture({
        systemsByName: { Upstairs: { id: "system-1", name: "Upstairs" } },
      });
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue({});
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: true, reason: "allowed_internal_comped" });

      const { addJobEquipmentFromForm } = await import("@/lib/actions/job-actions");
      await expect(addJobEquipmentFromForm(buildFormData())).rejects.toThrow("REDIRECT:/jobs/job-1/info?f=equipment");

      expect(fixture.equipmentInsertCalls).toHaveLength(1);
    });

    it("blocks missing entitlement equipment add before writes", async () => {
      const fixture = makeSessionClientFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue({});
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: false, reason: "blocked_missing_entitlement" });

      const { addJobEquipmentFromForm } = await import("@/lib/actions/job-actions");
      await expect(addJobEquipmentFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
      );

      expect(fixture.systemInsertCalls).toHaveLength(0);
      expect(fixture.equipmentInsertCalls).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });

  describe("updateJobEquipmentFromForm", () => {
    function buildFormData() {
      const formData = new FormData();
      formData.set("job_id", "job-1");
      formData.set("equipment_id", "equipment-1");
      formData.set("equipment_role", "furnace");
      formData.set("system_location", "Hallway");
      return formData;
    }

    it("allows active account equipment update", async () => {
      const fixture = makeSessionClientFixture({
        equipmentById: {
          "equipment-1": { id: "equipment-1", job_id: "job-1", system_id: "system-old" },
        },
        equipmentCountBySystem: {
          "system-old": 0,
        },
        testRunCountBySystem: {
          "system-old": 0,
        },
      });
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue({});

      const { updateJobEquipmentFromForm } = await import("@/lib/actions/job-actions");
      await expect(updateJobEquipmentFromForm(buildFormData())).rejects.toThrow("REDIRECT:/jobs/job-1/info?f=equipment");

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(fixture.equipmentUpdateCalls).toHaveLength(1);
      expect(revalidatePathMock).toHaveBeenCalled();
    });

    it("allows valid trial equipment update", async () => {
      const fixture = makeSessionClientFixture({
        equipmentById: {
          "equipment-1": { id: "equipment-1", job_id: "job-1", system_id: "system-old" },
        },
        equipmentCountBySystem: {
          "system-old": 0,
        },
        testRunCountBySystem: {
          "system-old": 0,
        },
      });
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue({});
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: true, reason: "allowed_trial" });

      const { updateJobEquipmentFromForm } = await import("@/lib/actions/job-actions");
      await expect(updateJobEquipmentFromForm(buildFormData())).rejects.toThrow("REDIRECT:/jobs/job-1/info?f=equipment");

      expect(fixture.equipmentUpdateCalls).toHaveLength(1);
    });

    it("blocks expired trial equipment update before writes", async () => {
      const fixture = makeSessionClientFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue({});
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: false, reason: "blocked_trial_expired" });

      const { updateJobEquipmentFromForm } = await import("@/lib/actions/job-actions");
      await expect(updateJobEquipmentFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
      );

      expect(fixture.systemInsertCalls).toHaveLength(0);
      expect(fixture.equipmentUpdateCalls).toHaveLength(0);
      expect(fixture.systemDeleteCalls).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("blocks null-ended trial equipment update before writes", async () => {
      const fixture = makeSessionClientFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue({});
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: false, reason: "blocked_trial_missing_end" });

      const { updateJobEquipmentFromForm } = await import("@/lib/actions/job-actions");
      await expect(updateJobEquipmentFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
      );

      expect(fixture.systemInsertCalls).toHaveLength(0);
      expect(fixture.equipmentUpdateCalls).toHaveLength(0);
      expect(fixture.systemDeleteCalls).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("allows internal comped equipment update", async () => {
      const fixture = makeSessionClientFixture({
        equipmentById: {
          "equipment-1": { id: "equipment-1", job_id: "job-1", system_id: "system-old" },
        },
        equipmentCountBySystem: {
          "system-old": 0,
        },
        testRunCountBySystem: {
          "system-old": 0,
        },
      });
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue({});
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: true, reason: "allowed_internal_comped" });

      const { updateJobEquipmentFromForm } = await import("@/lib/actions/job-actions");
      await expect(updateJobEquipmentFromForm(buildFormData())).rejects.toThrow("REDIRECT:/jobs/job-1/info?f=equipment");

      expect(fixture.equipmentUpdateCalls).toHaveLength(1);
    });

    it("blocks missing entitlement equipment update before writes", async () => {
      const fixture = makeSessionClientFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue({});
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: false, reason: "blocked_missing_entitlement" });

      const { updateJobEquipmentFromForm } = await import("@/lib/actions/job-actions");
      await expect(updateJobEquipmentFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
      );

      expect(fixture.systemInsertCalls).toHaveLength(0);
      expect(fixture.equipmentUpdateCalls).toHaveLength(0);
      expect(fixture.systemDeleteCalls).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });

  describe("deleteJobEquipmentFromForm", () => {
    function buildFormData() {
      const formData = new FormData();
      formData.set("job_id", "job-1");
      formData.set("equipment_id", "equipment-1");
      return formData;
    }

    it("allows active account equipment delete", async () => {
      const fixture = makeSessionClientFixture({
        equipmentById: {
          "equipment-1": { id: "equipment-1", job_id: "job-1", system_id: "system-1" },
        },
        equipmentCountBySystem: {
          "system-1": 0,
        },
        testRunCountBySystem: {
          "system-1": 0,
        },
      });
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue({});

      const { deleteJobEquipmentFromForm } = await import("@/lib/actions/job-actions");
      await expect(deleteJobEquipmentFromForm(buildFormData())).resolves.toBeUndefined();

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(fixture.equipmentDeleteCalls).toHaveLength(1);
      expect(revalidatePathMock).toHaveBeenCalled();
    });

    it("allows valid trial equipment delete", async () => {
      const fixture = makeSessionClientFixture({
        equipmentById: {
          "equipment-1": { id: "equipment-1", job_id: "job-1", system_id: "system-1" },
        },
        equipmentCountBySystem: {
          "system-1": 0,
        },
        testRunCountBySystem: {
          "system-1": 0,
        },
      });
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue({});
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: true, reason: "allowed_trial" });

      const { deleteJobEquipmentFromForm } = await import("@/lib/actions/job-actions");
      await expect(deleteJobEquipmentFromForm(buildFormData())).resolves.toBeUndefined();

      expect(fixture.equipmentDeleteCalls).toHaveLength(1);
    });

    it("blocks expired trial equipment delete before writes", async () => {
      const fixture = makeSessionClientFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue({});
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: false, reason: "blocked_trial_expired" });

      const { deleteJobEquipmentFromForm } = await import("@/lib/actions/job-actions");
      await expect(deleteJobEquipmentFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
      );

      expect(fixture.equipmentDeleteCalls).toHaveLength(0);
      expect(fixture.systemDeleteCalls).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("blocks null-ended trial equipment delete before writes", async () => {
      const fixture = makeSessionClientFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue({});
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: false, reason: "blocked_trial_missing_end" });

      const { deleteJobEquipmentFromForm } = await import("@/lib/actions/job-actions");
      await expect(deleteJobEquipmentFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
      );

      expect(fixture.equipmentDeleteCalls).toHaveLength(0);
      expect(fixture.systemDeleteCalls).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("allows internal comped equipment delete", async () => {
      const fixture = makeSessionClientFixture({
        equipmentById: {
          "equipment-1": { id: "equipment-1", job_id: "job-1", system_id: "system-1" },
        },
        equipmentCountBySystem: {
          "system-1": 0,
        },
        testRunCountBySystem: {
          "system-1": 0,
        },
      });
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue({});
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: true, reason: "allowed_internal_comped" });

      const { deleteJobEquipmentFromForm } = await import("@/lib/actions/job-actions");
      await expect(deleteJobEquipmentFromForm(buildFormData())).resolves.toBeUndefined();

      expect(fixture.equipmentDeleteCalls).toHaveLength(1);
    });

    it("blocks missing entitlement equipment delete before writes", async () => {
      const fixture = makeSessionClientFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      createAdminClientMock.mockReturnValue({});
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({ authorized: false, reason: "blocked_missing_entitlement" });

      const { deleteJobEquipmentFromForm } = await import("@/lib/actions/job-actions");
      await expect(deleteJobEquipmentFromForm(buildFormData())).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
      );

      expect(fixture.equipmentDeleteCalls).toHaveLength(0);
      expect(fixture.systemDeleteCalls).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });
});
