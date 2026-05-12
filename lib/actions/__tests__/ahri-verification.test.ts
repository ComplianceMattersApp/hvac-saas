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

function buildAhriFormData(partial = false) {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("test_run_id", "run-1");
  formData.set("system_id", "system-1");
  formData.set("ahri_status", partial ? "not_started" : "verified_listed");
  formData.set("verified_by_name", "Office User");
  formData.set("verified_at", "2026-05-11");
  formData.set("verification_notes", "Checked AHRI directory");
  formData.set("matched_equipment_summary", "Outdoor X + Coil Y + Furnace Z");
  formData.set("outdoor_model", "X100");
  formData.set("indoor_coil_model", "Y200");
  formData.set("furnace_or_air_handler_model", "Z300");

  if (!partial) {
    formData.set("ahri_certificate_number", "CERT-123");
  }

  return formData;
}

describe("ahri verification actions", () => {
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
      testRun: { id: "run-1", job_id: "job-1", test_type: "ahri_verification", system_id: "system-1" },
    });

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
  });

  it("saves AHRI draft data", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveAhriVerificationDataFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveAhriVerificationDataFromForm(buildAhriFormData(true))).rejects.toThrow("REDIRECT:");

    const update = captured.find((entry) => entry.table === "ecc_test_runs" && entry.method === "update");
    expect(update?.payload.data).toMatchObject({
      ahri_status: "not_started",
      ahri_certificate_number: null,
      verified_by_name: "Office User",
      verified_at: "2026-05-11",
      verification_notes: "Checked AHRI directory",
      matched_equipment_summary: "Outdoor X + Coil Y + Furnace Z",
    });
    expect(update?.payload.computed_pass).toBeNull();
  });

  it("completes AHRI when verified/listed has certificate", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveAndCompleteAhriVerificationFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveAndCompleteAhriVerificationFromForm(buildAhriFormData(false))).rejects.toThrow("REDIRECT:");

    const update = captured.find((entry) => entry.table === "ecc_test_runs" && entry.method === "update");
    expect(update?.payload.data.ahri_status).toBe("verified_listed");
    expect(update?.payload.data.ahri_certificate_number).toBe("CERT-123");
    expect(update?.payload.computed.office_verification_status).toBe("verified_listed");
    expect(update?.payload.is_completed).toBe(true);
    expect(update?.payload.computed_pass).toBeNull();
  });

  it("rejects completion without AHRI status", async () => {
    const { supabase } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("test_run_id", "run-1");
    formData.set("system_id", "system-1");

    const { saveAndCompleteAhriVerificationFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveAndCompleteAhriVerificationFromForm(formData)).rejects.toThrow(
      "Select AHRI verification status before completing this test.",
    );
  });

  it("allows completion for needs_model_correction without certificate", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("test_run_id", "run-1");
    formData.set("system_id", "system-1");
    formData.set("ahri_status", "needs_model_correction");
    formData.set("verification_notes", "Model mismatch");

    const { saveAndCompleteAhriVerificationFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveAndCompleteAhriVerificationFromForm(formData)).rejects.toThrow("REDIRECT:");

    const update = captured.find((entry) => entry.table === "ecc_test_runs" && entry.method === "update");
    expect(update?.payload.data.ahri_status).toBe("needs_model_correction");
    expect(update?.payload.data.ahri_certificate_number).toBeNull();
    expect(update?.payload.is_completed).toBe(true);
  });
});
