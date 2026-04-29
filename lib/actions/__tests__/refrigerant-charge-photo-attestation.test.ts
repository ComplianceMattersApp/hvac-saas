/**
 * refrigerant-charge-photo-attestation.test.ts
 *
 * Focused tests for the photo attestation path in refrigerant charge save actions.
 *
 * Verifies:
 * - photo attestation flag persists in ecc_test_runs.data (verification_method, photo_taken_timestamp)
 * - computed.status = "photo_evidence"
 * - computed_pass = null (attestation ≠ numeric pass)
 * - override_pass = null (attestation is not an exemption)
 * - numeric refrigerant charge path still produces correct computed values
 * - existing exemption path (package unit) still produces override_pass = true
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalEccJobForMutationMock = vi.fn();
const loadScopedInternalEccTestRunForMutationMock = vi.fn();
const evaluateEccOpsStatusMock = vi.fn();
const revalidateEccProjectionConsumersMock = vi.fn();

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

/** Build a supabase fixture that captures update() call arguments */
function makeCapturingSupabase() {
  const captured: {
    table: string;
    method: string;
    payload?: any;
  }[] = [];

  const supabase = {
    from(table: string) {
      // Chain builder — supports select/eq/order/limit/single/maybeSingle/update
      const chainNode = (resolveData: () => any): any => {
        const node: any = {
          select: vi.fn(() => chainNode(resolveData)),
          eq: vi.fn(() => chainNode(resolveData)),
          order: vi.fn(() => chainNode(resolveData)),
          limit: vi.fn(() => chainNode(resolveData)),
          single: vi.fn(async () => ({ data: resolveData(), error: null })),
          maybeSingle: vi.fn(async () => ({ data: resolveData(), error: null })),
          update: vi.fn((payload: any) => {
            captured.push({ table, method: "update", payload });
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
        // Return a minimal visit row so the action can continue
        return chainNode(() => ({ id: "visit-1", visit_number: 1 }));
      }

      // Default: return a run-like row for ecc_test_runs
      return chainNode(() => ({ id: "run-1", data: {}, system_id: "sys-1", visit_id: null }));
    },
  };

  return { supabase, captured };
}

// ---------------------------------------------------------------------------
// Form helpers
// ---------------------------------------------------------------------------

function buildPhotoAttestation(): FormData {
  const fd = new FormData();
  fd.set("job_id", "job-1");
  fd.set("test_run_id", "run-1");
  fd.set("system_id", "sys-1");
  fd.set("rc_photo_taken", "on");
  return fd;
}

function buildNumericReading(): FormData {
  const fd = new FormData();
  fd.set("job_id", "job-1");
  fd.set("test_run_id", "run-1");
  fd.set("system_id", "sys-1");
  // Passing readings: subcool within ±2F of target, superheat < 25F, filter drier confirmed
  fd.set("liquid_line_temp_f", "100");
  fd.set("condenser_sat_temp_f", "110");   // measured_subcool = 10F
  fd.set("target_subcool_f", "10");         // target = 10F → delta = 0 (pass)
  fd.set("suction_line_temp_f", "55");
  fd.set("evaporator_sat_temp_f", "40");    // measured_superheat = 15F (< 25, pass)
  fd.set("outdoor_temp_f", "75");           // above 55F qualification
  fd.set("lowest_return_air_db_f", "72");   // above 70F qualification
  fd.set("filter_drier_installed", "on");
  fd.set("refrigerant_type", "R-410A");
  return fd;
}

function buildPackageUnitExemption(): FormData {
  const fd = new FormData();
  fd.set("job_id", "job-1");
  fd.set("test_run_id", "run-1");
  fd.set("system_id", "sys-1");
  fd.set("rc_exempt_package_unit", "on");
  return fd;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("saveRefrigerantChargeDataFromForm — photo attestation path", () => {
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
      testRun: { id: "run-1", job_id: "job-1", test_type: "refrigerant_charge", system_id: "sys-1" },
    });

    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
    revalidateEccProjectionConsumersMock.mockReturnValue(undefined);
  });

  it("persists verification_method=photo_taken and photo_taken_timestamp in data", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveRefrigerantChargeDataFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveRefrigerantChargeDataFromForm(buildPhotoAttestation())).rejects.toThrow("REDIRECT:");

    const update = captured.find((c) => c.table === "ecc_test_runs" && c.method === "update");
    expect(update).toBeDefined();

    const data = update!.payload.data;
    expect(data.verification_method).toBe("photo_taken");
    expect(typeof data.photo_taken_timestamp).toBe("string");
    expect(new Date(data.photo_taken_timestamp).getTime()).toBeGreaterThan(0);
  });

  it("sets computed.status = photo_evidence when photo attestation selected", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveRefrigerantChargeDataFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveRefrigerantChargeDataFromForm(buildPhotoAttestation())).rejects.toThrow("REDIRECT:");

    const update = captured.find((c) => c.table === "ecc_test_runs" && c.method === "update");
    expect(update!.payload.computed.status).toBe("photo_evidence");
  });

  it("sets computed_pass = null (not a numeric pass) for photo attestation", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveRefrigerantChargeDataFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveRefrigerantChargeDataFromForm(buildPhotoAttestation())).rejects.toThrow("REDIRECT:");

    const update = captured.find((c) => c.table === "ecc_test_runs" && c.method === "update");
    expect(update!.payload.computed_pass).toBeNull();
  });

  it("sets override_pass = null for photo attestation (unlike exemptions which set true)", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveRefrigerantChargeDataFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveRefrigerantChargeDataFromForm(buildPhotoAttestation())).rejects.toThrow("REDIRECT:");

    const update = captured.find((c) => c.table === "ecc_test_runs" && c.method === "update");
    expect(update!.payload.override_pass).toBeNull();
  });

  it("includes user attestation language in computed.warnings", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveRefrigerantChargeDataFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveRefrigerantChargeDataFromForm(buildPhotoAttestation())).rejects.toThrow("REDIRECT:");

    const update = captured.find((c) => c.table === "ecc_test_runs" && c.method === "update");
    const warnings: string[] = update!.payload.computed.warnings ?? [];
    expect(warnings.some((w) => w.toLowerCase().includes("gauge photo"))).toBe(true);
  });
});

describe("saveRefrigerantChargeDataFromForm — existing numeric path still works", () => {
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
      testRun: { id: "run-1", job_id: "job-1", test_type: "refrigerant_charge", system_id: "sys-1" },
    });

    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
    revalidateEccProjectionConsumersMock.mockReturnValue(undefined);
  });

  it("numeric path: computed.status = computed (not photo_evidence)", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveRefrigerantChargeDataFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveRefrigerantChargeDataFromForm(buildNumericReading())).rejects.toThrow("REDIRECT:");

    const update = captured.find((c) => c.table === "ecc_test_runs" && c.method === "update");
    expect(update!.payload.computed.status).toBe("computed");
  });

  it("numeric path: verification_method is null when photo not selected", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveRefrigerantChargeDataFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveRefrigerantChargeDataFromForm(buildNumericReading())).rejects.toThrow("REDIRECT:");

    const update = captured.find((c) => c.table === "ecc_test_runs" && c.method === "update");
    expect(update!.payload.data.verification_method).toBeNull();
  });

  it("numeric path with passing readings: computed_pass = true", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveRefrigerantChargeDataFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveRefrigerantChargeDataFromForm(buildNumericReading())).rejects.toThrow("REDIRECT:");

    const update = captured.find((c) => c.table === "ecc_test_runs" && c.method === "update");
    expect(update!.payload.computed_pass).toBe(true);
  });
});

describe("saveRefrigerantChargeDataFromForm — existing exemption path still works", () => {
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
      testRun: { id: "run-1", job_id: "job-1", test_type: "refrigerant_charge", system_id: "sys-1" },
    });

    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
    revalidateEccProjectionConsumersMock.mockReturnValue(undefined);
  });

  it("package unit exemption: override_pass = true (auto-pass, unlike photo attestation)", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveRefrigerantChargeDataFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveRefrigerantChargeDataFromForm(buildPackageUnitExemption())).rejects.toThrow("REDIRECT:");

    const update = captured.find((c) => c.table === "ecc_test_runs" && c.method === "update");
    expect(update!.payload.override_pass).toBe(true);
    expect(update!.payload.computed_pass).toBe(true);
    expect(update!.payload.computed.status).toBe("exempt");
  });

  it("package unit exemption: verification_method is null (distinct from photo attestation)", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveRefrigerantChargeDataFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveRefrigerantChargeDataFromForm(buildPackageUnitExemption())).rejects.toThrow("REDIRECT:");

    const update = captured.find((c) => c.table === "ecc_test_runs" && c.method === "update");
    // exemption does not set verification_method
    expect(update!.payload.data.verification_method).toBeNull();
  });
});

describe("saveAndCompleteRefrigerantChargeFromForm — photo attestation path", () => {
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
      testRun: { id: "run-1", job_id: "job-1", test_type: "refrigerant_charge", system_id: "sys-1" },
    });

    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
    revalidateEccProjectionConsumersMock.mockReturnValue(undefined);
  });

  it("Complete Test with photo attestation: is_completed=true, computed_pass=null, computed.status=photo_evidence", async () => {
    const { supabase, captured } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveAndCompleteRefrigerantChargeFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveAndCompleteRefrigerantChargeFromForm(buildPhotoAttestation())).rejects.toThrow(
      "REDIRECT:"
    );

    const update = captured.find((c) => c.table === "ecc_test_runs" && c.method === "update");
    expect(update).toBeDefined();
    expect(update!.payload.is_completed).toBe(true);
    expect(update!.payload.computed_pass).toBeNull();
    expect(update!.payload.computed.status).toBe("photo_evidence");
    expect(update!.payload.data.verification_method).toBe("photo_taken");
    expect(update!.payload.override_pass).toBeNull();
  });

  it("Complete Test with photo attestation: evaluateEccOpsStatus is called", async () => {
    const { supabase } = makeCapturingSupabase();
    createClientMock.mockResolvedValue(supabase);

    const { saveAndCompleteRefrigerantChargeFromForm } = await import("@/lib/actions/job-actions");
    await expect(saveAndCompleteRefrigerantChargeFromForm(buildPhotoAttestation())).rejects.toThrow(
      "REDIRECT:"
    );

    expect(evaluateEccOpsStatusMock).toHaveBeenCalledWith("job-1");
  });
});
