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
      if (table === "job_systems") {
        return {
          select: vi.fn((_columns?: string) => ({
            eq: vi.fn((column: string, value: unknown) => ({
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

describe("internal equipment/system same-account hardening", () => {
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

  it("allows same-account internal add equipment with coupled system reuse", async () => {
    const { supabase, systemInsertCalls, equipmentInsertCalls } = makeSessionClientFixture({
      systemsByName: {
        Upstairs: { id: "system-1", name: "Upstairs" },
      },
    });
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue({});
    loadScopedInternalEquipmentJobForMutationMock.mockResolvedValue({ id: "job-1", customer_id: "cust-1" });

    const { addJobEquipmentFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("equipment_role", "condenser");
    formData.set("system_location", "Upstairs");
    formData.set("manufacturer", "Carrier");

    await expect(addJobEquipmentFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-1/info?f=equipment",
    );

    expect(systemInsertCalls).toHaveLength(0);
    expect(equipmentInsertCalls).toContainEqual(
      expect.objectContaining({
        job_id: "job-1",
        system_id: "system-1",
        system_location: "Upstairs",
      }),
    );
  });

  it("allows same-account internal add equipment with coupled system creation", async () => {
    const { supabase, systemInsertCalls, equipmentInsertCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue({});
    loadScopedInternalEquipmentJobForMutationMock.mockResolvedValue({ id: "job-2", customer_id: "cust-2" });

    const { addJobEquipmentFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-2");
    formData.set("equipment_role", "air_handler");
    formData.set("system_location", "__new__");
    formData.set("system_location_custom", "Basement");

    await expect(addJobEquipmentFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-2/info?f=equipment",
    );

    expect(systemInsertCalls).toContainEqual({ job_id: "job-2", name: "Basement" });
    expect(equipmentInsertCalls).toContainEqual(
      expect.objectContaining({
        job_id: "job-2",
        system_id: "system-new-1",
        system_location: "Basement",
      }),
    );
  });

  it("denies cross-account internal add equipment before coupled system or equipment writes", async () => {
    const { supabase, systemInsertCalls, equipmentInsertCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue({});
    loadScopedInternalEquipmentJobForMutationMock.mockResolvedValue(null);

    const { addJobEquipmentFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-3");
    formData.set("equipment_role", "condenser");
    formData.set("system_location", "Garage");

    await expect(addJobEquipmentFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-3?notice=not_authorized",
    );

    expect(systemInsertCalls).toHaveLength(0);
    expect(equipmentInsertCalls).toHaveLength(0);
  });

  it("allows same-account internal update equipment with coupled system creation and orphan delete", async () => {
    const { supabase, systemInsertCalls, systemDeleteCalls, equipmentUpdateCalls } = makeSessionClientFixture({
      equipmentById: {
        "equipment-1": { id: "equipment-1", job_id: "job-4", system_id: "system-old" },
      },
      equipmentCountBySystem: {
        "system-old": 0,
      },
      testRunCountBySystem: {
        "system-old": 0,
      },
    });
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue({});
    loadScopedInternalJobEquipmentForMutationMock.mockResolvedValue({
      job: { id: "job-4", customer_id: "cust-4" },
      equipment: { id: "equipment-1", job_id: "job-4", system_id: "system-old" },
    });

    const { updateJobEquipmentFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-4");
    formData.set("equipment_id", "equipment-1");
    formData.set("equipment_role", "furnace");
    formData.set("system_location", "Hallway");

    await expect(updateJobEquipmentFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-4/info?f=equipment",
    );

    expect(systemInsertCalls).toContainEqual({ job_id: "job-4", name: "Hallway" });
    expect(equipmentUpdateCalls).toContainEqual({
      values: expect.objectContaining({
        system_id: "system-new-1",
        system_location: "Hallway",
      }),
      eq: [["id", "equipment-1"], ["job_id", "job-4"]],
    });
    expect(systemDeleteCalls).toContainEqual([["job_id", "job-4"], ["id", "system-old"]]);
  });

  it("denies cross-account internal update equipment before coupled system or equipment writes", async () => {
    const { supabase, systemInsertCalls, systemDeleteCalls, equipmentUpdateCalls } = makeSessionClientFixture({
      equipmentById: {
        "equipment-2": { id: "equipment-2", job_id: "job-5", system_id: "system-5" },
      },
    });
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue({});
    loadScopedInternalJobEquipmentForMutationMock.mockResolvedValue(null);

    const { updateJobEquipmentFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-5");
    formData.set("equipment_id", "equipment-2");
    formData.set("equipment_role", "furnace");
    formData.set("system_location", "Attic");

    await expect(updateJobEquipmentFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-5?notice=not_authorized",
    );

    expect(systemInsertCalls).toHaveLength(0);
    expect(systemDeleteCalls).toHaveLength(0);
    expect(equipmentUpdateCalls).toHaveLength(0);
  });

  it("allows same-account internal delete equipment with coupled orphan system delete", async () => {
    const { supabase, systemDeleteCalls, equipmentDeleteCalls } = makeSessionClientFixture({
      equipmentById: {
        "equipment-3": { id: "equipment-3", job_id: "job-6", system_id: "system-6" },
      },
      equipmentCountBySystem: {
        "system-6": 0,
      },
      testRunCountBySystem: {
        "system-6": 0,
      },
    });
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue({});
    loadScopedInternalJobEquipmentForMutationMock.mockResolvedValue({
      job: { id: "job-6", customer_id: "cust-6" },
      equipment: { id: "equipment-3", job_id: "job-6", system_id: "system-6" },
    });

    const { deleteJobEquipmentFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-6");
    formData.set("equipment_id", "equipment-3");

    await expect(deleteJobEquipmentFromForm(formData)).resolves.toBeUndefined();

    expect(equipmentDeleteCalls).toContainEqual([["id", "equipment-3"], ["job_id", "job-6"]]);
    expect(systemDeleteCalls).toContainEqual([["job_id", "job-6"], ["id", "system-6"]]);
  });

  it("denies cross-account internal delete equipment before equipment or coupled system delete", async () => {
    const { supabase, systemDeleteCalls, equipmentDeleteCalls } = makeSessionClientFixture({
      equipmentById: {
        "equipment-4": { id: "equipment-4", job_id: "job-7", system_id: "system-7" },
      },
    });
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue({});
    loadScopedInternalJobEquipmentForMutationMock.mockResolvedValue(null);

    const { deleteJobEquipmentFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-7");
    formData.set("equipment_id", "equipment-4");

    await expect(deleteJobEquipmentFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-7?notice=not_authorized",
    );

    expect(equipmentDeleteCalls).toHaveLength(0);
    expect(systemDeleteCalls).toHaveLength(0);
  });
});