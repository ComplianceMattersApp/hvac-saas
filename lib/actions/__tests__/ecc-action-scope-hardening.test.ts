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
          select(columns?: string) {
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

            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: "run-1", data: {}, system_id: "system-1" },
                    error: null,
                  })),
                  single: vi.fn(async () => ({
                    data: { id: "run-1", data: {}, system_id: "system-1" },
                    error: null,
                  })),
                })),
              })),
            };
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

describe("duct leakage override reason — Asbestos", () => {
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
    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
  });


  it("persists Asbestos override reason with override_pass=true", async () => {
    const { supabase, updateCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalEccTestRunForMutationMock.mockResolvedValue({
      job: { id: "job-a1", job_type: "ecc" },
      testRun: { id: "run-a1", job_id: "job-a1", system_id: "sys-1", test_type: "duct_leakage" },
    });

    const { saveDuctLeakageDataFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-a1");
    formData.set("test_run_id", "run-a1");
    formData.set("system_id", "sys-1");
    formData.set("project_type", "alteration");
    formData.set("airflow_method", "cooling");
    formData.set("override", "pass");
    formData.set("override_reason", "Asbestos");

    await expect(saveDuctLeakageDataFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-a1/tests?t=duct_leakage&s=sys-1",
    );

    expect(updateCalls).toContainEqual({
      table: "ecc_test_runs",
      values: expect.objectContaining({
        override_pass: true,
        override_reason: "Asbestos",
      }),
      eq: [["id", "run-a1"], ["job_id", "job-a1"]],
    });
  });

  it("persists Smoke Test override reason with override_pass=true (existing path unchanged)", async () => {
    const { supabase, updateCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalEccTestRunForMutationMock.mockResolvedValue({
      job: { id: "job-a2", job_type: "ecc" },
      testRun: { id: "run-a2", job_id: "job-a2", system_id: "sys-1", test_type: "duct_leakage" },
    });

    const { saveDuctLeakageDataFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-a2");
    formData.set("test_run_id", "run-a2");
    formData.set("system_id", "sys-1");
    formData.set("project_type", "alteration");
    formData.set("airflow_method", "cooling");
    formData.set("override", "pass");
    formData.set("override_reason", "Smoke Test");

    await expect(saveDuctLeakageDataFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-a2/tests?t=duct_leakage&s=sys-1",
    );

    expect(updateCalls).toContainEqual({
      table: "ecc_test_runs",
      values: expect.objectContaining({
        override_pass: true,
        override_reason: "Smoke Test",
      }),
      eq: [["id", "run-a2"], ["job_id", "job-a2"]],
    });
  });

  it("numeric path writes override_pass=null and override_reason=null when no override selected", async () => {
    const { supabase, updateCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalEccTestRunForMutationMock.mockResolvedValue({
      job: { id: "job-a3", job_type: "ecc" },
      testRun: { id: "run-a3", job_id: "job-a3", system_id: "sys-1", test_type: "duct_leakage" },
    });

    const { saveDuctLeakageDataFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-a3");
    formData.set("test_run_id", "run-a3");
    formData.set("system_id", "sys-1");
    formData.set("project_type", "alteration");
    formData.set("measured_duct_leakage_cfm", "60");
    formData.set("tonnage", "3");
    formData.set("airflow_method", "cooling");
    formData.set("override", "none");

    await expect(saveDuctLeakageDataFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-a3/tests?t=duct_leakage&s=sys-1",
    );

    expect(updateCalls).toContainEqual({
      table: "ecc_test_runs",
      values: expect.objectContaining({
        override_pass: null,
        override_reason: null,
      }),
      eq: [["id", "run-a3"], ["job_id", "job-a3"]],
    });
  });
});

describe("internal ECC same-account hardening", () => {
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
    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
  });

  it("allows same-account internal override update", async () => {
    const { supabase, updateCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalEccTestRunForMutationMock.mockResolvedValue({
      job: { id: "job-1", job_type: "ecc" },
      testRun: { id: "run-1", job_id: "job-1", system_id: "system-1", test_type: "duct_leakage" },
    });

    const { saveEccTestOverrideFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("test_run_id", "run-1");
    formData.set("system_id", "system-1");
    formData.set("test_type", "duct_leakage");
    formData.set("override", "pass");
    formData.set("override_reason", "Manual review passed");

    await expect(saveEccTestOverrideFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-1/tests?t=duct_leakage&s=system-1",
    );

    expect(updateCalls).toContainEqual({
      table: "ecc_test_runs",
      values: {
        override_pass: true,
        override_reason: "Manual review passed",
        updated_at: expect.any(String),
      },
      eq: [["id", "run-1"], ["job_id", "job-1"]],
    });
  });

  it("denies cross-account internal override update before write", async () => {
    const { supabase, updateCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalEccTestRunForMutationMock.mockResolvedValue(null);

    const { saveEccTestOverrideFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-2");
    formData.set("test_run_id", "run-2");
    formData.set("override", "pass");
    formData.set("override_reason", "Manual review passed");

    await expect(saveEccTestOverrideFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-2?notice=not_authorized",
    );

    expect(updateCalls).toHaveLength(0);
  });

  it("allows same-account internal add test run", async () => {
    const { supabase, insertCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalEccJobForMutationMock.mockResolvedValue({ id: "job-3", job_type: "ecc" });

    const { addEccTestRunFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-3");
    formData.set("system_id", "system-1");
    formData.set("test_type", "duct_leakage");

    await expect(addEccTestRunFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-3/tests?t=duct_leakage&s=system-1",
    );

    expect(insertCalls).toContainEqual({
      table: "ecc_test_runs",
      values: expect.objectContaining({
        job_id: "job-3",
        visit_id: "visit-1",
        test_type: "duct_leakage",
        system_id: "system-1",
        system_key: "system-1",
        is_completed: false,
      }),
    });
  });

  it("denies cross-account internal add test run before insert", async () => {
    const { supabase, insertCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalEccJobForMutationMock.mockResolvedValue(null);

    const { addEccTestRunFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-4");
    formData.set("system_id", "system-1");
    formData.set("test_type", "duct_leakage");

    await expect(addEccTestRunFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-4?notice=not_authorized",
    );

    expect(insertCalls).toHaveLength(0);
  });

  it("allows same-account internal delete test run", async () => {
    const { supabase, deleteCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalEccTestRunForMutationMock.mockResolvedValue({
      job: { id: "job-5", job_type: "ecc" },
      testRun: { id: "run-5", job_id: "job-5", system_id: "system-1", test_type: "duct_leakage" },
    });

    const { deleteEccTestRunFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-5");
    formData.set("test_run_id", "run-5");

    await expect(deleteEccTestRunFromForm(formData)).resolves.toBeUndefined();

    expect(deleteCalls).toContainEqual({
      table: "ecc_test_runs",
      eq: [["id", "run-5"], ["job_id", "job-5"]],
    });
  });

  it("denies cross-account internal delete test run before delete", async () => {
    const { supabase, deleteCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalEccTestRunForMutationMock.mockResolvedValue(null);

    const { deleteEccTestRunFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-6");
    formData.set("test_run_id", "run-6");

    await expect(deleteEccTestRunFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-6?notice=not_authorized",
    );

    expect(deleteCalls).toHaveLength(0);
  });

  it("allows same-account internal duct leakage test save", async () => {
    const { supabase, updateCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalEccTestRunForMutationMock.mockResolvedValue({
      job: { id: "job-7", job_type: "ecc" },
      testRun: { id: "run-7", job_id: "job-7", system_id: "system-1", test_type: "duct_leakage" },
    });

    const { saveDuctLeakageDataFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-7");
    formData.set("test_run_id", "run-7");
    formData.set("system_id", "system-1");
    formData.set("project_type", "alteration");
    formData.set("measured_duct_leakage_cfm", "80");
    formData.set("tonnage", "3");
    formData.set("airflow_method", "cooling");

    await expect(saveDuctLeakageDataFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-7/tests?t=duct_leakage&s=system-1",
    );

    expect(updateCalls).toContainEqual({
      table: "ecc_test_runs",
      values: expect.objectContaining({
        computed_pass: true,
        override_pass: null,
        override_reason: null,
        updated_at: expect.any(String),
      }),
      eq: [["id", "run-7"], ["job_id", "job-7"]],
    });
  });

  it("denies cross-account internal duct leakage test save before write", async () => {
    const { supabase, updateCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalEccTestRunForMutationMock.mockResolvedValue(null);

    const { saveDuctLeakageDataFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-8");
    formData.set("test_run_id", "run-8");
    formData.set("project_type", "alteration");
    formData.set("measured_duct_leakage_cfm", "80");
    formData.set("tonnage", "3");
    formData.set("airflow_method", "cooling");

    await expect(saveDuctLeakageDataFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-8?notice=not_authorized",
    );

    expect(updateCalls).toHaveLength(0);
  });
});

