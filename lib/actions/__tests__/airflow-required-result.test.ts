import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalEccJobForMutationMock = vi.fn();
const loadScopedInternalEccTestRunForMutationMock = vi.fn();
const evaluateEccOpsStatusMock = vi.fn();
const revalidateEccProjectionConsumersMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();

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
}));

vi.mock("@/lib/auth/internal-ecc-scope", () => ({
  loadScopedInternalEccJobForMutation: (...args: unknown[]) =>
    loadScopedInternalEccJobForMutationMock(...args),
  loadScopedInternalEccTestRunForMutation: (...args: unknown[]) =>
    loadScopedInternalEccTestRunForMutationMock(...args),
}));

vi.mock("@/lib/actions/ecc-status", () => ({
  evaluateEccOpsStatus: (...args: unknown[]) => evaluateEccOpsStatusMock(...args),
  revalidateEccProjectionConsumers: (...args: unknown[]) =>
    revalidateEccProjectionConsumersMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

function makeCapturingSupabase() {
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];

  const supabase = {
    from(table: string) {
      const chainNode = (resolveData: () => any): any => {
        const node: any = {
          select: vi.fn(() => chainNode(resolveData)),
          eq: vi.fn(() => chainNode(resolveData)),
          order: vi.fn(() => chainNode(resolveData)),
          limit: vi.fn(() => chainNode(resolveData)),
          single: vi.fn(async () => ({ data: resolveData(), error: null })),
          maybeSingle: vi.fn(async () => ({ data: resolveData(), error: null })),
          update: vi.fn((payload: Record<string, unknown>) => {
            updates.push({ table, payload });
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ error: null })),
              })),
            };
          }),
        };
        return node;
      };

      if (table === "job_visits") {
        return chainNode(() => ({ id: "visit-1" }));
      }

      return chainNode(() => ({
        id: "run-1",
        visit_id: "visit-1",
        system_id: "system-1",
        data: {},
      }));
    },
  };

  return { supabase, updates };
}

function buildSaveAndCompleteAirflowFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("test_run_id", "run-1");
  formData.set("system_id", "system-1");
  formData.set("project_type", "alteration");
  formData.set("tonnage", "3");
  formData.set("cfm_per_ton_target", "300");
  return formData;
}

describe("airflow required measured result hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: "user-1",
      internalUser: {
        user_id: "user-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    loadScopedInternalEccJobForMutationMock.mockResolvedValue({ id: "job-1", job_type: "ecc" });
    loadScopedInternalEccTestRunForMutationMock.mockResolvedValue({
      job: { id: "job-1", job_type: "ecc" },
      testRun: { id: "run-1", job_id: "job-1", test_type: "airflow", system_id: "system-1" },
    });

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });

    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
    revalidateEccProjectionConsumersMock.mockReturnValue(undefined);
  });

  it("completion fails without measured airflow when no exception is selected", async () => {
    const { saveAndCompleteAirflowFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      saveAndCompleteAirflowFromForm(buildSaveAndCompleteAirflowFormData())
    ).rejects.toThrow("Enter the measured airflow result before completing this test.");

    expect(createClientMock).not.toHaveBeenCalled();
    expect(evaluateEccOpsStatusMock).not.toHaveBeenCalled();
  });

  it("completion succeeds when measured airflow is present", async () => {
    const { supabase, updates } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const fd = buildSaveAndCompleteAirflowFormData();
    fd.set("measured_total_cfm", "950");

    const { saveAndCompleteAirflowFromForm } = await import("@/lib/actions/job-actions");

    await expect(saveAndCompleteAirflowFromForm(fd)).rejects.toThrow(
      "REDIRECT:/jobs/job-1/tests?t=airflow&s=system-1",
    );

    const update = updates.find((call) => call.table === "ecc_test_runs");
    expect(update).toBeDefined();
    expect(update?.payload.is_completed).toBe(true);
    expect(update?.payload.override_pass).toBeNull();
    expect(evaluateEccOpsStatusMock).toHaveBeenCalledWith("job-1");
  });

  it("completion redirects with notice when Airflow exception is selected without a reason", async () => {
    const fd = buildSaveAndCompleteAirflowFormData();
    fd.set("airflow_exception", "best_obtainable");

    const { saveAndCompleteAirflowFromForm } = await import("@/lib/actions/job-actions");

    await expect(saveAndCompleteAirflowFromForm(fd)).rejects.toThrow(
      "REDIRECT:/jobs/job-1/tests?t=airflow&s=system-1&notice=override_reason_required",
    );

    expect(createClientMock).not.toHaveBeenCalled();
    expect(evaluateEccOpsStatusMock).not.toHaveBeenCalled();
  });

  it("completion succeeds for Best Obtainable without measured airflow when reason is present", async () => {
    const { supabase, updates } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const fd = buildSaveAndCompleteAirflowFormData();
    fd.set("airflow_exception", "best_obtainable");
    fd.set("airflow_exception_reason", "Registers balanced to best obtainable field condition.");

    const { saveAndCompleteAirflowFromForm } = await import("@/lib/actions/job-actions");

    await expect(saveAndCompleteAirflowFromForm(fd)).rejects.toThrow(
      "REDIRECT:/jobs/job-1/tests?t=airflow&s=system-1",
    );

    const update = updates.find((call) => call.table === "ecc_test_runs");
    expect(update).toBeDefined();
    expect(update?.payload.is_completed).toBe(true);
    expect(update?.payload.override_pass).toBe(true);
    expect(update?.payload.override_reason).toBe("Best Obtainable: Registers balanced to best obtainable field condition.");
    expect(update?.payload.override_pass).not.toBe(false);
  });

  it("treats Other as an Airflow exception, not a failed normal result", async () => {
    const { supabase, updates } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const fd = buildSaveAndCompleteAirflowFormData();
    fd.set("airflow_exception", "other");
    fd.set("airflow_exception_reason", "Measurement location inaccessible.");

    const { saveAndCompleteAirflowFromForm } = await import("@/lib/actions/job-actions");

    await expect(saveAndCompleteAirflowFromForm(fd)).rejects.toThrow(
      "REDIRECT:/jobs/job-1/tests?t=airflow&s=system-1",
    );

    const update = updates.find((call) => call.table === "ecc_test_runs");
    expect(update).toBeDefined();
    expect(update?.payload.override_pass).toBe(true);
    expect(update?.payload.override_reason).toBe("Other: Measurement location inaccessible.");
    expect(update?.payload.override_pass).not.toBe(false);
  });
});
