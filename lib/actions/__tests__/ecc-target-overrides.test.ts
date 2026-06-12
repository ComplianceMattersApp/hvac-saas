import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalEccJobForMutationMock = vi.fn();
const loadScopedInternalEccTestRunForMutationMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const evaluateEccOpsStatusMock = vi.fn();

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

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/actions/ecc-status", () => ({
  evaluateEccOpsStatus: (...args: unknown[]) => evaluateEccOpsStatusMock(...args),
}));

function makeCapturingSupabase() {
  const captured: Array<{ table: string; method: string; payload?: any }> = [];

  return {
    captured,
    supabase: {
      from(table: string) {
        const chainNode = (resolveData: () => any): any => {
          const node: any = {
            select: vi.fn(() => chainNode(resolveData)),
            eq: vi.fn(() => chainNode(resolveData)),
            order: vi.fn(() => chainNode(resolveData)),
            limit: vi.fn(() => chainNode(resolveData)),
            single: vi.fn(async () => ({ data: resolveData(), error: null })),
            maybeSingle: vi.fn(async () => ({ data: resolveData(), error: null })),
            update: vi.fn((payload: any) => {
              captured.push({ table, method: "update", payload });
              const selectNode = {
                maybeSingle: vi.fn(async () => ({ data: { id: "run-1" }, error: null })),
                single: vi.fn(async () => ({ data: { id: "run-1" }, error: null })),
              };
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(() => selectNode),
                    maybeSingle: vi.fn(async () => ({ data: { id: "run-1" }, error: null })),
                    single: vi.fn(async () => ({ data: { id: "run-1" }, error: null })),
                    then: (resolve: any) => resolve({ error: null }),
                  })),
                })),
              };
            }),
          };
          return node;
        };

        if (table === "job_visits") {
          return chainNode(() => ({ id: "visit-1", visit_number: 1 }));
        }

        if (table === "ecc_test_runs") {
          return chainNode(() => ({ id: "run-1", data: {}, system_id: "system-1", visit_id: null }));
        }

        throw new Error(`UNEXPECTED_TABLE:${table}`);
      },
    },
  };
}

describe("ECC target override persistence", () => {
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
      testRun: { id: "run-1", job_id: "job-1", test_type: "duct_leakage", system_id: "system-1" },
    });

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
  });

  it("uses run-specific duct leakage percent target in compute and saved data", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("test_run_id", "run-1");
    formData.set("system_id", "system-1");
    formData.set("project_type", "all_new");
    formData.set("airflow_method", "cooling");
    formData.set("tonnage", "2");
    formData.set("measured_duct_leakage_cfm", "50");
    formData.set("leakage_percent_target", "8");

    const { saveDuctLeakageDataFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveDuctLeakageDataFromForm(formData)).rejects.toThrow("REDIRECT:");

    const update = captured.find((entry) => entry.table === "ecc_test_runs" && entry.method === "update");
    expect(update?.payload.data.leakage_percent_target).toBe(8);
    expect(update?.payload.computed.leakage_percent_allowed_display).toBe(8);
    expect(update?.payload.computed.max_leakage_cfm).toBe(64);
  });

  it("uses run-specific airflow CFM/ton target in compute and saved data", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("test_run_id", "run-1");
    formData.set("system_id", "system-1");
    formData.set("project_type", "all_new");
    formData.set("tonnage", "2");
    formData.set("measured_total_cfm", "760");
    formData.set("cfm_per_ton_target", "380");

    const { saveAirflowDataFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveAirflowDataFromForm(formData)).rejects.toThrow("REDIRECT:");

    const update = captured.find((entry) => entry.table === "ecc_test_runs" && entry.method === "update");
    expect(update?.payload.data.cfm_per_ton_required).toBe(380);
    expect(update?.payload.data.cfm_per_ton_target).toBe(380);
    expect(update?.payload.computed.required_total_cfm).toBe(760);
    expect(update?.payload.computed_pass).toBe(true);
  });

  it("redirects with validation notice when airflow exception is selected without reason (save)", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("test_run_id", "run-1");
    formData.set("system_id", "system-1");
    formData.set("project_type", "all_new");
    formData.set("tonnage", "2");
    formData.set("measured_total_cfm", "760");
    formData.set("airflow_exception", "best_obtainable");
    formData.set("airflow_exception_reason", "   ");

    const { saveAirflowDataFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveAirflowDataFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-1/tests?t=airflow&s=system-1&notice=override_reason_required",
    );

    expect(captured.filter((entry) => entry.table === "ecc_test_runs" && entry.method === "update")).toHaveLength(0);
  });

  it("redirects with validation notice when airflow exception is selected without reason (save and complete)", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("test_run_id", "run-1");
    formData.set("system_id", "system-1");
    formData.set("project_type", "all_new");
    formData.set("tonnage", "2");
    formData.set("measured_total_cfm", "760");
    formData.set("airflow_exception", "best_obtainable");
    formData.set("airflow_exception_reason", "");

    const { saveAndCompleteAirflowFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveAndCompleteAirflowFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-1/tests?t=airflow&s=system-1&notice=override_reason_required",
    );

    expect(captured.filter((entry) => entry.table === "ecc_test_runs" && entry.method === "update")).toHaveLength(0);
  });

  it("preserves successful airflow exception complete behavior when reason is provided", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("test_run_id", "run-1");
    formData.set("system_id", "system-1");
    formData.set("project_type", "all_new");
    formData.set("tonnage", "2");
    formData.set("measured_total_cfm", "760");
    formData.set("airflow_exception", "best_obtainable");
    formData.set("airflow_exception_reason", "Field verified airflow delivered despite instrumentation drift.");

    const { saveAndCompleteAirflowFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveAndCompleteAirflowFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-1/tests?t=airflow&s=system-1&notice=test_completed",
    );

    const update = captured.find((entry) => entry.table === "ecc_test_runs" && entry.method === "update");
    expect(update?.payload.override_pass).toBe(true);
    expect(update?.payload.override_reason).toBe(
      "Best Obtainable: Field verified airflow delivered despite instrumentation drift.",
    );
    expect(update?.payload.computed.override_mode).toBe("field_exception");
    expect(update?.payload.is_completed).toBe(true);
  });

  it("redirects with validation notice when duct manual override is selected without reason (save)", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("test_run_id", "run-1");
    formData.set("system_id", "system-1");
    formData.set("project_type", "all_new");
    formData.set("airflow_method", "cooling");
    formData.set("tonnage", "2");
    formData.set("measured_duct_leakage_cfm", "50");
    formData.set("override", "pass");
    formData.set("override_reason", "");

    const { saveDuctLeakageDataFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveDuctLeakageDataFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-1/tests?t=duct_leakage&s=system-1&notice=override_reason_required",
    );

    expect(captured.filter((entry) => entry.table === "ecc_test_runs" && entry.method === "update")).toHaveLength(0);
  });

  it("redirects with validation notice when duct manual override is selected without reason (save and complete)", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("test_run_id", "run-1");
    formData.set("system_id", "system-1");
    formData.set("project_type", "all_new");
    formData.set("airflow_method", "cooling");
    formData.set("tonnage", "2");
    formData.set("measured_duct_leakage_cfm", "50");
    formData.set("override", "fail");
    formData.set("override_reason", "   ");

    const { saveAndCompleteDuctLeakageFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveAndCompleteDuctLeakageFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-1/tests?t=duct_leakage&s=system-1&notice=override_reason_required",
    );

    expect(captured.filter((entry) => entry.table === "ecc_test_runs" && entry.method === "update")).toHaveLength(0);
  });

  it("preserves duct manual override complete behavior when reason is provided", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("test_run_id", "run-1");
    formData.set("system_id", "system-1");
    formData.set("project_type", "all_new");
    formData.set("airflow_method", "cooling");
    formData.set("tonnage", "2");
    formData.set("measured_duct_leakage_cfm", "50");
    formData.set("override", "pass");
    formData.set("override_reason", "Inspector-approved field condition override.");

    const { saveAndCompleteDuctLeakageFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveAndCompleteDuctLeakageFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-1/tests?t=duct_leakage&s=system-1&notice=test_completed",
    );

    const update = captured.find((entry) => entry.table === "ecc_test_runs" && entry.method === "update");
    expect(update?.payload.override_pass).toBe(true);
    expect(update?.payload.override_reason).toBe("Inspector-approved field condition override.");
    expect(update?.payload.is_completed).toBe(true);
  });

  it("redirects with validation notice when manual override action is selected without reason", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("test_run_id", "run-1");
    formData.set("system_id", "system-1");
    formData.set("test_type", "duct_leakage");
    formData.set("override", "pass");
    formData.set("override_reason", "");

    const { saveEccTestOverrideFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveEccTestOverrideFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-1/tests?t=duct_leakage&s=system-1&notice=override_reason_required",
    );

    expect(captured.filter((entry) => entry.table === "ecc_test_runs" && entry.method === "update")).toHaveLength(0);
  });

  it("preserves manual override action behavior when reason is provided", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("test_run_id", "run-1");
    formData.set("system_id", "system-1");
    formData.set("test_type", "duct_leakage");
    formData.set("override", "fail");
    formData.set("override_reason", "Verified fail override reason.");

    const { saveEccTestOverrideFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveEccTestOverrideFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-1/tests?t=duct_leakage&s=system-1&notice=results_saved",
    );

    const update = captured.find((entry) => entry.table === "ecc_test_runs" && entry.method === "update");
    expect(update?.payload.override_pass).toBe(false);
    expect(update?.payload.override_reason).toBe("Verified fail override reason.");
  });
});
