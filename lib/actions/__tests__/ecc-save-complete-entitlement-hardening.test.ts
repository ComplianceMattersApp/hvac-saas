import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalEccJobForMutationMock = vi.fn();
const loadScopedInternalEccTestRunForMutationMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const evaluateEccOpsStatusMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
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

function makeAllowSupabaseFixture() {
  const fromCalls: string[] = [];

  return {
    supabase: {
      from(table: string) {
        fromCalls.push(table);
        throw new Error("ALLOW_PATH_REACHED");
      },
    },
    fromCalls,
  };
}

type ActionName =
  | "markRefrigerantChargeExemptFromForm"
  | "saveRefrigerantChargeDataFromForm"
  | "saveAirflowDataFromForm"
  | "saveDuctLeakageDataFromForm"
  | "completeEccTestRunFromForm"
  | "saveAndCompleteDuctLeakageFromForm"
  | "saveAndCompleteAirflowFromForm"
  | "saveAndCompleteRefrigerantChargeFromForm";

function buildMarkRefrigerantChargeExemptFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("test_run_id", "run-1");
  formData.set("system_id", "system-1");
  formData.set("rc_exempt_package_unit", "on");
  return formData;
}

function buildSaveRefrigerantFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("test_run_id", "run-1");
  formData.set("system_id", "system-1");
  return formData;
}

function buildSaveAirflowFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("test_run_id", "run-1");
  formData.set("system_id", "system-1");
  formData.set("project_type", "alteration");
  formData.set("measured_total_cfm", "1200");
  formData.set("tonnage", "3");
  return formData;
}

function buildSaveDuctLeakageFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("test_run_id", "run-1");
  formData.set("system_id", "system-1");
  formData.set("project_type", "alteration");
  formData.set("measured_duct_leakage_cfm", "80");
  formData.set("tonnage", "3");
  formData.set("airflow_method", "cooling");
  return formData;
}

function buildCompleteRunFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("test_run_id", "run-1");
  formData.set("system_id", "system-1");
  return formData;
}

function buildSaveAndCompleteDuctFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("test_run_id", "run-1");
  formData.set("system_id", "system-1");
  formData.set("project_type", "alteration");
  formData.set("measured_duct_leakage_cfm", "80");
  formData.set("tonnage", "3");
  formData.set("airflow_method", "cooling");
  return formData;
}

function buildSaveAndCompleteAirflowFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("test_run_id", "run-1");
  formData.set("system_id", "system-1");
  formData.set("project_type", "alteration");
  formData.set("measured_total_cfm", "1200");
  formData.set("tonnage", "3");
  return formData;
}

function buildSaveAndCompleteRefrigerantFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("test_run_id", "run-1");
  formData.set("system_id", "system-1");
  return formData;
}

const actions: Array<{ name: ActionName; buildFormData: () => FormData }> = [
  { name: "markRefrigerantChargeExemptFromForm", buildFormData: buildMarkRefrigerantChargeExemptFormData },
  { name: "saveRefrigerantChargeDataFromForm", buildFormData: buildSaveRefrigerantFormData },
  { name: "saveAirflowDataFromForm", buildFormData: buildSaveAirflowFormData },
  { name: "saveDuctLeakageDataFromForm", buildFormData: buildSaveDuctLeakageFormData },
  { name: "completeEccTestRunFromForm", buildFormData: buildCompleteRunFormData },
  { name: "saveAndCompleteDuctLeakageFromForm", buildFormData: buildSaveAndCompleteDuctFormData },
  { name: "saveAndCompleteAirflowFromForm", buildFormData: buildSaveAndCompleteAirflowFormData },
  { name: "saveAndCompleteRefrigerantChargeFromForm", buildFormData: buildSaveAndCompleteRefrigerantFormData },
];

async function invokeAction(actionName: ActionName, formData: FormData) {
  const mod = await import("@/lib/actions/job-actions");
  return (mod as Record<ActionName, (fd: FormData) => Promise<unknown>>)[actionName](formData);
}

describe("ECC data-save/save-complete entitlement hardening", () => {
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
      testRun: { id: "run-1", job_id: "job-1", system_id: "system-1", test_type: "duct_leakage" },
    });

    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  for (const { name, buildFormData } of actions) {
    it(`${name}: allows active entitlement`, async () => {
      const { supabase, fromCalls } = makeAllowSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);

      await expect(invokeAction(name, buildFormData())).rejects.toThrow("ALLOW_PATH_REACHED");
      expect(fromCalls.length).toBeGreaterThan(0);
    });

    it(`${name}: allows valid trial entitlement`, async () => {
      const { supabase, fromCalls } = makeAllowSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_trial",
      });

      await expect(invokeAction(name, buildFormData())).rejects.toThrow("ALLOW_PATH_REACHED");
      expect(fromCalls.length).toBeGreaterThan(0);
    });

    it(`${name}: allows internal comped entitlement`, async () => {
      const { supabase, fromCalls } = makeAllowSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_internal_comped",
      });

      await expect(invokeAction(name, buildFormData())).rejects.toThrow("ALLOW_PATH_REACHED");
      expect(fromCalls.length).toBeGreaterThan(0);
    });
  }

  const blockedCases = [
    "blocked_trial_expired",
    "blocked_trial_missing_end",
    "blocked_missing_entitlement",
  ] as const;

  for (const reason of blockedCases) {
    for (const { name, buildFormData } of actions) {
      it(`${name}: blocks ${reason} before writes or side effects`, async () => {
        const { supabase, fromCalls } = makeAllowSupabaseFixture();
        createClientMock.mockResolvedValue(supabase);
        resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
          authorized: false,
          reason,
        });

        await expect(invokeAction(name, buildFormData())).rejects.toThrow(
          `REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=${reason}`,
        );

        expect(fromCalls).toHaveLength(0);
        expect(evaluateEccOpsStatusMock).not.toHaveBeenCalled();
        expect(revalidatePathMock).not.toHaveBeenCalled();
      });
    }
  }
});
