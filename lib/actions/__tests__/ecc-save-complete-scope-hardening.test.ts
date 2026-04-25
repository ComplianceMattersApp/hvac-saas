import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalEccJobForMutationMock = vi.fn();
const loadScopedInternalEccTestRunForMutationMock = vi.fn();
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

vi.mock("@/lib/actions/ecc-status", () => ({
  evaluateEccOpsStatus: (...args: unknown[]) => evaluateEccOpsStatusMock(...args),
}));

function makeAllowSupabaseFixture() {
  return {
    from(_table: string) {
      throw new Error("ALLOW_PATH_REACHED");
    },
  };
}

function makeDenySupabaseFixture() {
  const writeCalls: Array<{ table: string; method: "update" | "insert" | "delete" }> = [];

  const supabase = {
    from(table: string) {
      return {
        update: vi.fn(() => {
          writeCalls.push({ table, method: "update" });
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: null })),
            })),
          };
        }),
        insert: vi.fn(() => {
          writeCalls.push({ table, method: "insert" });
          return Promise.resolve({ error: null });
        }),
        delete: vi.fn(() => {
          writeCalls.push({ table, method: "delete" });
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: null })),
            })),
          };
        }),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: null, error: null })),
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        })),
      };
    },
  };

  return { supabase, writeCalls };
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

describe("internal ECC save/save-complete same-account hardening", () => {
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

    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
  });

  it("allows same-account internal saveRefrigerantChargeDataFromForm past scoped ECC preflight", async () => {
    createClientMock.mockResolvedValue(makeAllowSupabaseFixture());
    const { saveRefrigerantChargeDataFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveRefrigerantChargeDataFromForm(buildSaveRefrigerantFormData())).rejects.toThrow(
      "ALLOW_PATH_REACHED",
    );
  });

  it("allows same-account internal saveAirflowDataFromForm past scoped ECC preflight", async () => {
    createClientMock.mockResolvedValue(makeAllowSupabaseFixture());
    const { saveAirflowDataFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveAirflowDataFromForm(buildSaveAirflowFormData())).rejects.toThrow("ALLOW_PATH_REACHED");
  });

  it("allows same-account internal completeEccTestRunFromForm past scoped ECC preflight", async () => {
    createClientMock.mockResolvedValue(makeAllowSupabaseFixture());
    const { completeEccTestRunFromForm } = await import("@/lib/actions/job-actions");
    await expect(completeEccTestRunFromForm(buildCompleteRunFormData())).rejects.toThrow("ALLOW_PATH_REACHED");
  });

  it("allows same-account internal saveAndCompleteDuctLeakageFromForm past scoped ECC preflight", async () => {
    createClientMock.mockResolvedValue(makeAllowSupabaseFixture());
    const { saveAndCompleteDuctLeakageFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveAndCompleteDuctLeakageFromForm(buildSaveAndCompleteDuctFormData())).rejects.toThrow(
      "ALLOW_PATH_REACHED",
    );
  });

  it("allows same-account internal saveAndCompleteAirflowFromForm past scoped ECC preflight", async () => {
    createClientMock.mockResolvedValue(makeAllowSupabaseFixture());
    const { saveAndCompleteAirflowFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveAndCompleteAirflowFromForm(buildSaveAndCompleteAirflowFormData())).rejects.toThrow(
      "ALLOW_PATH_REACHED",
    );
  });

  it("allows same-account internal saveAndCompleteRefrigerantChargeFromForm past scoped ECC preflight", async () => {
    createClientMock.mockResolvedValue(makeAllowSupabaseFixture());
    const { saveAndCompleteRefrigerantChargeFromForm } = await import("@/lib/actions/job-actions");
    await expect(
      saveAndCompleteRefrigerantChargeFromForm(buildSaveAndCompleteRefrigerantFormData()),
    ).rejects.toThrow("ALLOW_PATH_REACHED");
  });

  it("denies cross-account internal saveRefrigerantChargeDataFromForm before ecc_test_runs writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalEccJobForMutationMock.mockResolvedValue(null);

    const { saveRefrigerantChargeDataFromForm } = await import("@/lib/actions/job-actions");

    await expect(saveRefrigerantChargeDataFromForm(buildSaveRefrigerantFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );
    expect(writeCalls.filter((call) => call.table === "ecc_test_runs")).toHaveLength(0);
  });

  it("denies cross-account internal saveAirflowDataFromForm before ecc_test_runs writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalEccJobForMutationMock.mockResolvedValue(null);

    const { saveAirflowDataFromForm } = await import("@/lib/actions/job-actions");

    await expect(saveAirflowDataFromForm(buildSaveAirflowFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );
    expect(writeCalls.filter((call) => call.table === "ecc_test_runs")).toHaveLength(0);
  });

  it("denies cross-account internal completeEccTestRunFromForm before ecc_test_runs writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalEccJobForMutationMock.mockResolvedValue(null);

    const { completeEccTestRunFromForm } = await import("@/lib/actions/job-actions");

    await expect(completeEccTestRunFromForm(buildCompleteRunFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );
    expect(writeCalls.filter((call) => call.table === "ecc_test_runs")).toHaveLength(0);
    expect(evaluateEccOpsStatusMock).not.toHaveBeenCalled();
    expect(writeCalls.filter((call) => call.table === "job_events")).toHaveLength(0);
  });

  it("denies cross-account internal saveAndCompleteDuctLeakageFromForm before ecc_test_runs writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalEccJobForMutationMock.mockResolvedValue(null);

    const { saveAndCompleteDuctLeakageFromForm } = await import("@/lib/actions/job-actions");

    await expect(saveAndCompleteDuctLeakageFromForm(buildSaveAndCompleteDuctFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );
    expect(writeCalls.filter((call) => call.table === "ecc_test_runs")).toHaveLength(0);
  });

  it("denies cross-account internal saveAndCompleteAirflowFromForm before ecc_test_runs writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalEccJobForMutationMock.mockResolvedValue(null);

    const { saveAndCompleteAirflowFromForm } = await import("@/lib/actions/job-actions");

    await expect(saveAndCompleteAirflowFromForm(buildSaveAndCompleteAirflowFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );
    expect(writeCalls.filter((call) => call.table === "ecc_test_runs")).toHaveLength(0);
  });

  it("denies cross-account internal saveAndCompleteRefrigerantChargeFromForm before ecc_test_runs writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalEccJobForMutationMock.mockResolvedValue(null);

    const { saveAndCompleteRefrigerantChargeFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      saveAndCompleteRefrigerantChargeFromForm(buildSaveAndCompleteRefrigerantFormData()),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?notice=not_authorized");
    expect(writeCalls.filter((call) => call.table === "ecc_test_runs")).toHaveLength(0);
  });

  it("denies non-internal saveRefrigerantChargeDataFromForm before ecc_test_runs writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockRejectedValue(new Error("Active internal user required."));

    const { saveRefrigerantChargeDataFromForm } = await import("@/lib/actions/job-actions");

    await expect(saveRefrigerantChargeDataFromForm(buildSaveRefrigerantFormData())).rejects.toThrow(
      "Active internal user required.",
    );
    expect(writeCalls.filter((call) => call.table === "ecc_test_runs")).toHaveLength(0);
  });

  it("denies non-internal saveAirflowDataFromForm before ecc_test_runs writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockRejectedValue(new Error("Active internal user required."));

    const { saveAirflowDataFromForm } = await import("@/lib/actions/job-actions");

    await expect(saveAirflowDataFromForm(buildSaveAirflowFormData())).rejects.toThrow(
      "Active internal user required.",
    );
    expect(writeCalls.filter((call) => call.table === "ecc_test_runs")).toHaveLength(0);
  });

  it("denies non-internal completeEccTestRunFromForm before ecc_test_runs writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockRejectedValue(new Error("Active internal user required."));

    const { completeEccTestRunFromForm } = await import("@/lib/actions/job-actions");

    await expect(completeEccTestRunFromForm(buildCompleteRunFormData())).rejects.toThrow(
      "Active internal user required.",
    );
    expect(writeCalls.filter((call) => call.table === "ecc_test_runs")).toHaveLength(0);
    expect(evaluateEccOpsStatusMock).not.toHaveBeenCalled();
    expect(writeCalls.filter((call) => call.table === "job_events")).toHaveLength(0);
  });

  it("denies non-internal saveAndCompleteDuctLeakageFromForm before ecc_test_runs writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockRejectedValue(new Error("Active internal user required."));

    const { saveAndCompleteDuctLeakageFromForm } = await import("@/lib/actions/job-actions");

    await expect(saveAndCompleteDuctLeakageFromForm(buildSaveAndCompleteDuctFormData())).rejects.toThrow(
      "Active internal user required.",
    );
    expect(writeCalls.filter((call) => call.table === "ecc_test_runs")).toHaveLength(0);
  });

  it("denies non-internal saveAndCompleteAirflowFromForm before ecc_test_runs writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockRejectedValue(new Error("Active internal user required."));

    const { saveAndCompleteAirflowFromForm } = await import("@/lib/actions/job-actions");

    await expect(saveAndCompleteAirflowFromForm(buildSaveAndCompleteAirflowFormData())).rejects.toThrow(
      "Active internal user required.",
    );
    expect(writeCalls.filter((call) => call.table === "ecc_test_runs")).toHaveLength(0);
  });

  it("denies non-internal saveAndCompleteRefrigerantChargeFromForm before ecc_test_runs writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockRejectedValue(new Error("Active internal user required."));

    const { saveAndCompleteRefrigerantChargeFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      saveAndCompleteRefrigerantChargeFromForm(buildSaveAndCompleteRefrigerantFormData()),
    ).rejects.toThrow("Active internal user required.");
    expect(writeCalls.filter((call) => call.table === "ecc_test_runs")).toHaveLength(0);
  });
});