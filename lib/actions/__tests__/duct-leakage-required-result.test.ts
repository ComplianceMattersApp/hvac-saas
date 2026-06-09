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

function buildSaveAndCompleteDuctFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("test_run_id", "run-1");
  formData.set("system_id", "system-1");
  formData.set("project_type", "alteration");
  formData.set("tonnage", "3");
  formData.set("airflow_method", "cooling");
  return formData;
}

function buildSaveDuctDraftFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("test_run_id", "run-1");
  formData.set("system_id", "system-1");
  formData.set("project_type", "alteration");
  formData.set("tonnage", "3");
  formData.set("airflow_method", "cooling");
  return formData;
}

describe("duct leakage required measured result hardening", () => {
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
      testRun: { id: "run-1", job_id: "job-1", test_type: "duct_leakage", system_id: "system-1" },
    });

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });

    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
    revalidateEccProjectionConsumersMock.mockReturnValue(undefined);
  });

  it("completion fails without measured duct leakage value", async () => {
    const { saveAndCompleteDuctLeakageFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      saveAndCompleteDuctLeakageFromForm(buildSaveAndCompleteDuctFormData())
    ).rejects.toThrow("Enter the measured duct leakage result before completing this test.");

    expect(createClientMock).not.toHaveBeenCalled();
    expect(evaluateEccOpsStatusMock).not.toHaveBeenCalled();
  });

  it("completion succeeds when measured duct leakage value is present", async () => {
    const { supabase, updates } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const fd = buildSaveAndCompleteDuctFormData();
    fd.set("measured_duct_leakage_cfm", "80");

    const { saveAndCompleteDuctLeakageFromForm } = await import("@/lib/actions/job-actions");

    await expect(saveAndCompleteDuctLeakageFromForm(fd)).rejects.toThrow("REDIRECT:/jobs/job-1#field-status-actions");

    const update = updates.find((call) => call.table === "ecc_test_runs");
    expect(update).toBeDefined();
    expect(update?.payload.is_completed).toBe(true);
    expect(update?.payload.override_pass).toBeNull();
    expect(evaluateEccOpsStatusMock).toHaveBeenCalledWith("job-1");
  });

  it("completion redirects with notice when Duct Leakage exception is selected without a reason", async () => {
    const fd = buildSaveAndCompleteDuctFormData();
    fd.set("duct_exception", "asbestos");

    const { saveAndCompleteDuctLeakageFromForm } = await import("@/lib/actions/job-actions");

    await expect(saveAndCompleteDuctLeakageFromForm(fd)).rejects.toThrow(
      "REDIRECT:/jobs/job-1/tests?t=duct_leakage&s=system-1&notice=override_reason_required",
    );

    expect(createClientMock).not.toHaveBeenCalled();
    expect(evaluateEccOpsStatusMock).not.toHaveBeenCalled();
  });

  it("completion succeeds for an Asbestos exception without measured leakage when reason is present", async () => {
    const { supabase, updates } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const fd = buildSaveAndCompleteDuctFormData();
    fd.set("duct_exception", "asbestos");
    fd.set("override_reason", "Duct test area contains suspect material.");

    const { saveAndCompleteDuctLeakageFromForm } = await import("@/lib/actions/job-actions");

    await expect(saveAndCompleteDuctLeakageFromForm(fd)).rejects.toThrow("REDIRECT:/jobs/job-1#field-status-actions");

    const update = updates.find((call) => call.table === "ecc_test_runs");
    expect(update).toBeDefined();
    expect(update?.payload.is_completed).toBe(true);
    expect(update?.payload.override_pass).toBe(true);
    expect(update?.payload.override_reason).toBe("Asbestos: Duct test area contains suspect material.");
    expect(update?.payload.override_pass).not.toBe(false);
    expect(evaluateEccOpsStatusMock).toHaveBeenCalledWith("job-1");
  });

  it("treats < 40' of ducting as an exempt Duct Leakage exception, not a failed result", async () => {
    const { supabase, updates } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const fd = buildSaveAndCompleteDuctFormData();
    fd.set("duct_exception", "under_40_ft_ducting");
    fd.set("override_reason", "Less than 40 feet of ducting present.");

    const { saveAndCompleteDuctLeakageFromForm } = await import("@/lib/actions/job-actions");

    await expect(saveAndCompleteDuctLeakageFromForm(fd)).rejects.toThrow("REDIRECT:/jobs/job-1#field-status-actions");

    const update = updates.find((call) => call.table === "ecc_test_runs");
    expect(update).toBeDefined();
    expect(update?.payload.override_pass).toBe(true);
    expect(update?.payload.override_reason).toBe("< 40' of ducting: Less than 40 feet of ducting present.");
    expect(update?.payload.override_pass).not.toBe(false);
  });

  it("Save Draft still succeeds without measured duct leakage value", async () => {
    const { supabase, updates } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveDuctLeakageDataFromForm } = await import("@/lib/actions/job-actions");

    await expect(saveDuctLeakageDataFromForm(buildSaveDuctDraftFormData())).rejects.toThrow("REDIRECT:");

    const update = updates.find((call) => call.table === "ecc_test_runs");
    expect(update).toBeDefined();
    expect(update?.payload.is_completed).toBeUndefined();

    const computed = update?.payload.computed as Record<string, unknown>;
    const warnings = Array.isArray(computed?.warnings) ? computed.warnings : [];
    expect(warnings).toContain("Missing measured duct leakage");
  });
});
