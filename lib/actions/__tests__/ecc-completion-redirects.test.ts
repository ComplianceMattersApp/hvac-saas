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

function makeEccCompletionSupabase(testType = "duct_leakage") {
  let eccSelectCount = 0;
  let jobSelectCount = 0;

  const updateResult = {
    eq: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    })),
  };

  return {
    from(table: string) {
      if (table === "ecc_test_runs") {
        return {
          select: vi.fn((columns?: string) => {
            if (String(columns ?? "").includes("id, job_id, test_type")) {
              const completeRun = {
                id: "run-1",
                job_id: "job-1",
                test_type: testType,
                visit_id: "visit-1",
                is_completed: false,
                system_id: "system-1",
                computed_pass: true,
                override_pass: null,
                data: { existing: true },
              };

              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    single: vi.fn(async () => ({ data: completeRun, error: null })),
                  })),
                })),
              };
            }

            if (String(columns ?? "").includes("computed_pass")) {
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      neq: vi.fn(() => ({
                        order: vi.fn(() => ({
                          limit: vi.fn(() => ({
                            eq: vi.fn(async () => ({ data: [], error: null })),
                          })),
                        })),
                      })),
                    })),
                  })),
                })),
              };
            }

            eccSelectCount += 1;
            const row = eccSelectCount === 1 ? { visit_id: "visit-1" } : { data: {} };
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: row, error: null })),
                })),
              })),
            };
          }),
          update: vi.fn(() => updateResult),
          delete: vi.fn(() => updateResult),
        };
      }

      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => {
                jobSelectCount += 1;
                return {
                  data:
                    jobSelectCount === 1
                      ? { ops_status: "testing", parent_job_id: null }
                      : { ops_status: "paperwork_required" },
                  error: null,
                };
              }),
            })),
          })),
        };
      }

      throw new Error(`UNEXPECTED_TABLE:${table}`);
    },
  };
}

function makeAddRunSupabase(existingRun = false) {
  return {
    from(table: string) {
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
        };
      }

      if (table === "ecc_test_runs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  limit: vi.fn(async () => ({
                    data: existingRun ? [{ id: "run-1" }] : [],
                    error: null,
                  })),
                })),
              })),
            })),
          })),
          insert: vi.fn(async () => ({ error: null })),
        };
      }

      throw new Error(`UNEXPECTED_TABLE:${table}`);
    },
  };
}

function baseFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("test_run_id", "run-1");
  formData.set("system_id", "system-1");
  return formData;
}

function ductFormData() {
  const formData = baseFormData();
  formData.set("project_type", "alteration");
  formData.set("measured_duct_leakage_cfm", "80");
  formData.set("tonnage", "3");
  formData.set("airflow_method", "cooling");
  return formData;
}

function airflowFormData() {
  const formData = baseFormData();
  formData.set("project_type", "alteration");
  formData.set("measured_total_cfm", "1200");
  formData.set("tonnage", "3");
  return formData;
}

function refrigerantFormData() {
  const formData = baseFormData();
  formData.set("rc_exempt_package_unit", "on");
  formData.set("rc_override_details", "Packaged equipment exemption");
  return formData;
}

function fanFormData() {
  const formData = baseFormData();
  formData.set("actual_tested_watts", "346");
  formData.set("actual_tested_airflow_cfm", "788");
  formData.set("required_fan_efficacy_w_per_cfm", "0.45");
  formData.set("registers_fully_open_attested", "on");
  formData.set("fan_max_speed_attested", "on");
  return formData;
}

function airFilterFormData() {
  const formData = baseFormData();
  formData.set("design_airflow_cfm", "900");
  formData.set("nominal_depth_inches", "2");
  formData.set("nominal_length_inches", "20");
  formData.set("nominal_width_inches", "20");
  return formData;
}

function ahriFormData() {
  const formData = baseFormData();
  formData.set("ahri_status", "verified_listed");
  formData.set("ahri_certificate_number", "CERT-123");
  return formData;
}

function localExhaustFormData() {
  const formData = baseFormData();
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
  return formData;
}

function qiiFormData() {
  const formData = baseFormData();
  formData.set("overall_qii_status", "partial");
  formData.append("insulation_location[]", "Attic");
  formData.append("insulation_type[]", "Loose Fill");
  formData.append("insulation_brand[]", "Brand A");
  formData.append("required_r_value[]", "38");
  formData.append("installed_r_value[]", "38");
  formData.append("required_depth[]", "12");
  formData.append("observed_depth[]", "12");
  formData.append("depth_unit[]", "in");
  formData.append("manufacturer_label_provided[]", "yes");
  formData.append("loose_fill_coverage_chart_confirmed[]", "yes");
  formData.append("loose_fill_density_verified[]", "yes");
  formData.append("loose_fill_depth_locations_checked[]", "4");
  formData.append("loose_fill_attic_rulers_installed[]", "yes");
  formData.append("verification_status[]", "pass");
  formData.append("correction_notes[]", "");
  formData.append("entry_notes[]", "");
  return formData;
}

describe("ECC completion redirects", () => {
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

  it.each([
    ["completeEccTestRunFromForm", "duct_leakage", baseFormData(), "/jobs/job-1/tests?t=duct_leakage&s=system-1&notice=test_completed"],
    ["saveAndCompleteDuctLeakageFromForm", "duct_leakage", ductFormData(), "/jobs/job-1/tests?t=duct_leakage&s=system-1&notice=test_completed"],
    ["saveAndCompleteAirflowFromForm", "airflow", airflowFormData(), "/jobs/job-1/tests?t=airflow&s=system-1&notice=test_completed"],
    ["saveAndCompleteRefrigerantChargeFromForm", "refrigerant_charge", refrigerantFormData(), "/jobs/job-1/tests?t=refrigerant_charge&s=system-1&notice=test_completed"],
    ["saveAndCompleteFanWattDrawFromForm", "fan_watt_draw", fanFormData(), "/jobs/job-1/tests?t=fan_watt_draw&s=system-1&notice=test_completed"],
    ["saveAndCompleteAirFilterDeviceFromForm", "air_filter_device", airFilterFormData(), "/jobs/job-1/tests?t=air_filter_device&s=system-1&notice=test_completed"],
    ["saveAndCompleteAhriVerificationFromForm", "ahri_verification", ahriFormData(), "/jobs/job-1/tests?t=ahri_verification&s=system-1&notice=test_completed"],
    ["saveAndCompleteLocalMechanicalExhaustFromForm", "local_mechanical_exhaust", localExhaustFormData(), "/jobs/job-1/tests?t=local_mechanical_exhaust&s=system-1&notice=test_completed"],
    ["saveAndCompleteQiiEnv22InsulationFromForm", "qii_insulation", qiiFormData(), "/jobs/job-1/tests?t=qii_insulation&s=system-1&notice=test_completed"],
  ])("%s returns to the ECC tests workspace", async (actionName, testType, formData, redirectUrl) => {
    createClientMock.mockResolvedValue(makeEccCompletionSupabase(testType));

    const actions = await import("@/lib/actions/job-actions");
    const action = actions[actionName as keyof typeof actions] as (data: FormData) => Promise<unknown>;

    await expect(action(formData)).rejects.toThrow(`REDIRECT:${redirectUrl}`);
  });

  it.each([
    ["saveDuctLeakageDataFromForm", "duct_leakage", ductFormData(), "/jobs/job-1/tests?t=duct_leakage&s=system-1&notice=results_saved"],
    ["saveAirflowDataFromForm", "airflow", airflowFormData(), "/jobs/job-1/tests?t=airflow&s=system-1&notice=results_saved"],
    ["saveRefrigerantChargeDataFromForm", "refrigerant_charge", refrigerantFormData(), "/jobs/job-1/tests?t=refrigerant_charge&s=system-1&notice=results_saved"],
    ["saveFanWattDrawDataFromForm", "fan_watt_draw", fanFormData(), "/jobs/job-1/tests?t=fan_watt_draw&s=system-1&notice=results_saved"],
    ["saveAirFilterDeviceDataFromForm", "air_filter_device", airFilterFormData(), "/jobs/job-1/tests?t=air_filter_device&s=system-1&notice=results_saved"],
    ["saveAhriVerificationDataFromForm", "ahri_verification", ahriFormData(), "/jobs/job-1/tests?t=ahri_verification&s=system-1&notice=results_saved"],
    ["saveLocalMechanicalExhaustDataFromForm", "local_mechanical_exhaust", localExhaustFormData(), "/jobs/job-1/tests?t=local_mechanical_exhaust&s=system-1&notice=results_saved"],
    ["saveQiiEnv22InsulationDataFromForm", "qii_insulation", qiiFormData(), "/jobs/job-1/tests?t=qii_insulation&s=system-1&notice=results_saved"],
  ])("%s stays on the focused test page with saved feedback", async (actionName, testType, formData, redirectUrl) => {
    createClientMock.mockResolvedValue(makeEccCompletionSupabase(testType));

    const actions = await import("@/lib/actions/job-actions");
    const action = actions[actionName as keyof typeof actions] as (data: FormData) => Promise<unknown>;

    await expect(action(formData)).rejects.toThrow(`REDIRECT:${redirectUrl}`);
  });

  it.each([
    ["creates a new run", false],
    ["resolves an existing run", true],
  ])("opens the editable test workspace after the first required-test click when it %s", async (_label, existingRun) => {
    createClientMock.mockResolvedValue(makeAddRunSupabase(existingRun));

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("system_id", "system-1");
    formData.set("test_type", "airflow");

    const { addEccTestRunFromForm } = await import("@/lib/actions/job-actions");

    await expect(addEccTestRunFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-1/tests?t=airflow&s=system-1",
    );
  });
});
