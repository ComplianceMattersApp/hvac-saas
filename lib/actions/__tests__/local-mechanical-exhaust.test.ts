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

function buildFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("test_run_id", "run-1");
  formData.set("system_id", "system-1");
  formData.set("building_type", "Single Family");
  formData.set("total_kitchen_floor_area", "150");
  formData.set("kitchen_average_ceiling_height", "9");
  formData.set("kitchen_type", "Non-Enclosed");
  formData.set("system_name", "Kitchen Hood A");
  formData.set("manufacturer_name", "ExhaustCo");
  formData.set("system_type", "Range Hood");
  formData.set("hvi_aham_model_number", "HX-1200");
  formData.set("hvi_aham_rated_airflow_cfm", "300");
  formData.set("hvi_aham_sound_rating", "2.5 sones");
  formData.set("minimum_airflow_cfm", "250");
  formData.set("operation_schedule", "Intermittent");
  formData.set("notes", "Office documented");
  return formData;
}

describe("local mechanical exhaust actions", () => {
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
      testRun: {
        id: "run-1",
        job_id: "job-1",
        test_type: "local_mechanical_exhaust",
        system_id: "system-1",
      },
    });

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
  });

  it("saves local mechanical exhaust draft data", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveLocalMechanicalExhaustDataFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveLocalMechanicalExhaustDataFromForm(buildFormData())).rejects.toThrow("REDIRECT:");

    const update = captured.find((entry) => entry.table === "ecc_test_runs" && entry.method === "update");
    expect(update?.payload.data).toMatchObject({
      system_name: "Kitchen Hood A",
      manufacturer_name: "ExhaustCo",
      system_type: "Range Hood",
      hvi_aham_model_number: "HX-1200",
      hvi_aham_rated_airflow_cfm: 300,
      minimum_airflow_cfm: 250,
    });
    expect(update?.payload.computed_pass).toBeNull();
  });

  it("requires completion fields before marking complete", async () => {
    const { supabase } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("test_run_id", "run-1");
    formData.set("system_id", "system-1");

    const { saveAndCompleteLocalMechanicalExhaustFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveAndCompleteLocalMechanicalExhaustFromForm(formData)).rejects.toThrow(
      "Enter system name or location before completing this test.",
    );
  });
});
