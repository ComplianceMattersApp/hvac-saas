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
        if (table !== "ecc_test_runs") {
          throw new Error(`UNEXPECTED_TABLE:${table}`);
        }

        const query: any = {
          update: vi.fn((payload: any) => {
            captured.push({ table, method: "update", payload });
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ error: null })),
              })),
            };
          }),
        };

        return query;
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
});
