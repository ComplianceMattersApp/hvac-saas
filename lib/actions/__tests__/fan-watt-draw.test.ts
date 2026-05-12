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

function buildFanFormData(partial = false) {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("test_run_id", "run-1");
  formData.set("system_id", "system-1");
  formData.set("actual_tested_watts", "346");
  formData.set("required_fan_efficacy_w_per_cfm", "0.45");
  formData.set("registers_fully_open_attested", "on");
  formData.set("fan_max_speed_attested", "on");
  formData.set("notes", "Fan efficacy verification");

  if (!partial) {
    formData.set("actual_tested_airflow_cfm", "788");
  }

  return formData;
}

describe("fan watt draw actions", () => {
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
      testRun: { id: "run-1", job_id: "job-1", test_type: "fan_watt_draw", system_id: "system-1" },
    });

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
  });

  it("saves a partial fan efficacy draft without requiring completion fields", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveFanWattDrawDataFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveFanWattDrawDataFromForm(buildFanFormData(true))).rejects.toThrow("REDIRECT:");

    const update = captured.find((entry) => entry.table === "ecc_test_runs" && entry.method === "update");
    expect(update?.payload.data).toMatchObject({
      actual_tested_watts: 346,
      actual_tested_airflow_cfm: null,
      required_fan_efficacy_w_per_cfm: 0.45,
      registers_fully_open_attested: true,
      fan_max_speed_attested: true,
      photo_taken_attested: false,
      notes: "Fan efficacy verification",
    });
    expect(update?.payload.computed_pass).toBeNull();
  });

  it("saves and completes fan efficacy with pass/fail computed from watts divided by airflow", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveAndCompleteFanWattDrawFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveAndCompleteFanWattDrawFromForm(buildFanFormData(false))).rejects.toThrow("REDIRECT:");

    const update = captured.find((entry) => entry.table === "ecc_test_runs" && entry.method === "update");
    expect(update?.payload.data).toMatchObject({
      actual_tested_watts: 346,
      actual_tested_airflow_cfm: 788,
      required_fan_efficacy_w_per_cfm: 0.45,
      registers_fully_open_attested: true,
      fan_max_speed_attested: true,
      photo_taken_attested: false,
      notes: "Fan efficacy verification",
    });
    expect(update?.payload.computed.actual_fan_efficacy_w_per_cfm).toBeCloseTo(346 / 788, 6);
    expect(update?.payload.computed.compliance_statement).toBe("System fan efficacy complies");
    expect(update?.payload.computed_pass).toBe(true);
    expect(update?.payload.is_completed).toBe(true);
  });
});
