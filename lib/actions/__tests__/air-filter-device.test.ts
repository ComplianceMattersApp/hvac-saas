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

function buildAirFilterFormData(partial = false) {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("test_run_id", "run-1");
  formData.set("system_id", "system-1");
  formData.set("filter_location_description", "Return grille");
  formData.set("rack_type", "Media cabinet");
  formData.set("design_airflow_cfm", "900");
  formData.set("nominal_depth_inches", "2");
  formData.set("nominal_length_inches", "20");
  formData.set("notes", "Filter verification");

  if (!partial) {
    formData.set("nominal_width_inches", "20");
    formData.set("design_allowable_pressure_drop_iwc", "0.3");
  }

  return formData;
}

describe("air filter device actions", () => {
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
      testRun: { id: "run-1", job_id: "job-1", test_type: "air_filter_device", system_id: "system-1" },
    });

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
  });

  it("saves a partial air filter draft without requiring completion fields", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveAirFilterDeviceDataFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveAirFilterDeviceDataFromForm(buildAirFilterFormData(true))).rejects.toThrow("REDIRECT:");

    const update = captured.find((entry) => entry.table === "ecc_test_runs" && entry.method === "update");
    expect(update?.payload.data).toMatchObject({
      filter_location_description: "Return grille",
      rack_type: "Media cabinet",
      design_airflow_cfm: 900,
      nominal_depth_inches: 2,
      nominal_length_inches: 20,
      nominal_width_inches: null,
      design_allowable_pressure_drop_iwc: null,
      notes: "Filter verification",
    });
    expect(update?.payload.computed_pass).toBeNull();
  });

  it("saves and completes air filter verification with computed face-area compliance", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveAndCompleteAirFilterDeviceFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveAndCompleteAirFilterDeviceFromForm(buildAirFilterFormData(false))).rejects.toThrow("REDIRECT:");

    const update = captured.find((entry) => entry.table === "ecc_test_runs" && entry.method === "update");
    expect(update?.payload.computed.calculated_nominal_face_area_sq_in).toBe(400);
    expect(update?.payload.computed.required_minimum_face_area_sq_in).toBeCloseTo((900 / 150) * 144, 6);
    expect(update?.payload.computed.face_area_compliance).toBe("does_not_comply");
    expect(update?.payload.computed.compliance_statement).toBe("Air filter device face area does not comply");
    expect(update?.payload.computed_pass).toBe(false);
    expect(update?.payload.is_completed).toBe(true);
  });
});
