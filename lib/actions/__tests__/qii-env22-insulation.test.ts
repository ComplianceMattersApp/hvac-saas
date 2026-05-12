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
  formData.set("qii_project_basis_note", "ENV-22 verification run");
  formData.set("verified_by_name", "Inspector Jane");
  formData.set("verified_at", "2026-03-12");
  formData.set("overall_qii_status", "partial");
  formData.set("general_notes", "Attic correction pending");

  formData.append("insulation_location[]", "Attic");
  formData.append("insulation_type[]", "Loose Fill");
  formData.append("insulation_brand[]", "Brand A");
  formData.append("required_r_value[]", "38");
  formData.append("installed_r_value[]", "30");
  formData.append("required_depth[]", "12");
  formData.append("observed_depth[]", "10");
  formData.append("depth_unit[]", "in");
  formData.append("manufacturer_label_provided[]", "yes");
  formData.append("loose_fill_coverage_chart_confirmed[]", "yes");
  formData.append("loose_fill_density_verified[]", "no");
  formData.append("loose_fill_depth_locations_checked[]", "4");
  formData.append("loose_fill_attic_rulers_installed[]", "no");
  formData.append("verification_status[]", "needs_correction");
  formData.append("correction_notes[]", "Increase depth in two bays");
  formData.append("entry_notes[]", "Needs correction visit");

  return formData;
}

describe("qii env-22 insulation actions", () => {
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
        test_type: "qii_insulation",
        system_id: "system-1",
      },
    });

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
  });

  it("saves qii env-22 insulation draft data", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveQiiEnv22InsulationDataFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveQiiEnv22InsulationDataFromForm(buildFormData())).rejects.toThrow("REDIRECT:");

    const update = captured.find((entry) => entry.table === "ecc_test_runs" && entry.method === "update");
    expect(update?.payload.data).toMatchObject({
      qii_project_basis_note: "ENV-22 verification run",
      verified_by_name: "Inspector Jane",
      overall_qii_status: "partial",
    });
    expect(update?.payload.data?.insulation_entries).toHaveLength(1);
    expect(update?.payload.computed_pass).toBeNull();
  });

  it("requires at least one row before marking complete", async () => {
    const { supabase } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("test_run_id", "run-1");
    formData.set("system_id", "system-1");

    const { saveAndCompleteQiiEnv22InsulationFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveAndCompleteQiiEnv22InsulationFromForm(formData)).rejects.toThrow(
      "Add at least one insulation verification row before completing this test.",
    );
  });

  it("sets is_completed flag and keeps computed_pass as null", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveAndCompleteQiiEnv22InsulationFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveAndCompleteQiiEnv22InsulationFromForm(buildFormData())).rejects.toThrow("REDIRECT:");

    const update = captured.find((entry) => entry.table === "ecc_test_runs" && entry.method === "update");
    expect(update?.payload.is_completed).toBe(true);
    expect(update?.payload.computed_pass).toBeNull();
    expect(update?.payload.computed).toMatchObject({
      entry_count: 1,
      compliance_statement: expect.any(String),
    });
  });
});
