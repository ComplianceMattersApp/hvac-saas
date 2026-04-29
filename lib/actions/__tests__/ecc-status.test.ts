import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const setOpsStatusIfNotManualMock = vi.fn();
const forceSetOpsStatusMock = vi.fn();
const resolveEccScenarioMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/actions/ops-status", () => ({
  setOpsStatusIfNotManual: (...args: unknown[]) => setOpsStatusIfNotManualMock(...args),
  forceSetOpsStatus: (...args: unknown[]) => forceSetOpsStatusMock(...args),
}));

vi.mock("@/lib/ecc/scenario-resolver", () => ({
  resolveEccScenario: (...args: unknown[]) => resolveEccScenarioMock(...args),
}));

type QueryResponse = {
  data: any;
  error: { message: string } | null;
};

type SupabaseFixture = {
  job: Record<string, any>;
  systems?: Array<Record<string, any>>;
  equipmentRows?: Array<Record<string, any>>;
  runs?: Array<Record<string, any>>;
  correctionResolutionEvent?: Record<string, any> | null;
};

function makeResponse(data: any, error: { message: string } | null = null): QueryResponse {
  return { data, error };
}

function makeSupabase(fixture: SupabaseFixture) {
  return {
    from(table: string) {
      const filters: Array<{ column: string; value: unknown }> = [];

      const resolveTableResponse = (mode: "single" | "maybeSingle" | "many"): QueryResponse => {
        if (table === "jobs") {
          return makeResponse(fixture.job);
        }

        if (table === "job_systems") {
          return makeResponse(fixture.systems ?? [{ id: "sys-1" }]);
        }

        if (table === "job_equipment") {
          return makeResponse(fixture.equipmentRows ?? []);
        }

        if (table === "ecc_test_runs") {
          return makeResponse(
            fixture.runs ?? [
              {
                id: "run-1",
                system_id: "sys-1",
                test_type: "duct_leakage",
                is_completed: true,
                computed_pass: false,
                override_pass: null,
                data: {},
                computed: {},
              },
            ]
          );
        }

        if (table === "job_events" && mode === "maybeSingle") {
          const eventType = filters.find((filter) => filter.column === "event_type")?.value;
          if (eventType === "failure_resolved_by_correction_review") {
            return makeResponse(fixture.correctionResolutionEvent ?? null);
          }
        }

        return makeResponse(mode === "many" ? [] : null);
      };

      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          filters.push({ column, value });
          return query;
        }),
        limit: vi.fn(() => query),
        single: vi.fn(async () => resolveTableResponse("single")),
        maybeSingle: vi.fn(async () => resolveTableResponse("maybeSingle")),
        then: (onFulfilled: (value: QueryResponse) => unknown, onRejected?: (reason: unknown) => unknown) =>
          Promise.resolve(resolveTableResponse("many")).then(onFulfilled, onRejected),
      };

      return query;
    },
  };
}

async function runEvaluation(fixture: SupabaseFixture) {
  createClientMock.mockResolvedValue(makeSupabase(fixture));
  const { evaluateEccOpsStatus } = await import("@/lib/actions/ecc-status");
  await evaluateEccOpsStatus(String(fixture.job.id ?? "job-1"));
}

describe("evaluateEccOpsStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    setOpsStatusIfNotManualMock.mockResolvedValue({
      finalStatus: "",
      manualLockPrevented: false,
      updated: false,
    });
    forceSetOpsStatusMock.mockResolvedValue(undefined);
    resolveEccScenarioMock.mockReturnValue({
      suggestedTests: [{ required: true, testType: "duct_leakage" }],
    });
  });

  it("forces failed when a required completed ECC run fails without correction-review resolution", async () => {
    await runEvaluation({
      job: {
        id: "job-1",
        status: "completed",
        job_type: "ecc",
        project_type: "changeout",
        field_complete: true,
        certs_complete: false,
        invoice_complete: false,
        ops_status: "paperwork_required",
        scheduled_date: "2026-04-10",
        window_start: "08:00",
        window_end: "10:00",
      },
      correctionResolutionEvent: null,
    });

    expect(forceSetOpsStatusMock).toHaveBeenCalledWith("job-1", "failed");
    expect(forceSetOpsStatusMock).toHaveBeenCalledTimes(1);
    expect(setOpsStatusIfNotManualMock).not.toHaveBeenCalled();
  });

  it("keeps evidence-approved failed ECC jobs on closeout progression instead of re-failing them", async () => {
    await runEvaluation({
      job: {
        id: "job-1",
        status: "completed",
        job_type: "ecc",
        project_type: "changeout",
        field_complete: true,
        certs_complete: true,
        invoice_complete: false,
        ops_status: "failed",
        scheduled_date: "2026-04-10",
        window_start: "08:00",
        window_end: "10:00",
      },
      correctionResolutionEvent: { id: "event-1" },
    });

    expect(forceSetOpsStatusMock).toHaveBeenCalledWith("job-1", "invoice_required");
    expect(forceSetOpsStatusMock).toHaveBeenCalledTimes(1);
    expect(setOpsStatusIfNotManualMock).not.toHaveBeenCalled();
  });

  it("allows evidence-approved ECC jobs with certs and invoice complete to remain closed", async () => {
    await runEvaluation({
      job: {
        id: "job-1",
        status: "completed",
        job_type: "ecc",
        project_type: "changeout",
        field_complete: true,
        certs_complete: true,
        invoice_complete: true,
        ops_status: "failed",
        scheduled_date: "2026-04-10",
        window_start: "08:00",
        window_end: "10:00",
      },
      correctionResolutionEvent: { id: "event-1" },
    });

    expect(forceSetOpsStatusMock).toHaveBeenCalledWith("job-1", "closed");
    expect(forceSetOpsStatusMock).toHaveBeenCalledTimes(1);
    expect(setOpsStatusIfNotManualMock).not.toHaveBeenCalled();
  });

  it("advances ordinary all-passed ECC jobs to closed when certs and invoice are complete", async () => {
    await runEvaluation({
      job: {
        id: "job-1",
        status: "completed",
        job_type: "ecc",
        project_type: "changeout",
        field_complete: true,
        certs_complete: true,
        invoice_complete: true,
        ops_status: "paperwork_required",
        scheduled_date: "2026-04-10",
        window_start: "08:00",
        window_end: "10:00",
      },
      runs: [
        {
          id: "run-1",
          system_id: "sys-1",
          test_type: "duct_leakage",
          is_completed: true,
          computed_pass: true,
          override_pass: null,
          data: {},
          computed: {},
        },
      ],
      correctionResolutionEvent: null,
    });

    expect(forceSetOpsStatusMock).toHaveBeenCalledWith("job-1", "closed");
    expect(forceSetOpsStatusMock).toHaveBeenCalledTimes(1);
    expect(setOpsStatusIfNotManualMock).not.toHaveBeenCalled();
  });

  it("does not throw or force a closeout status when required tests pass before field completion", async () => {
    await runEvaluation({
      job: {
        id: "job-1",
        status: "scheduled",
        job_type: "ecc",
        project_type: "changeout",
        field_complete: false,
        certs_complete: false,
        invoice_complete: false,
        ops_status: "scheduled",
        scheduled_date: "2026-04-10",
        window_start: "08:00",
        window_end: "10:00",
      },
      runs: [
        {
          id: "run-1",
          system_id: "sys-1",
          test_type: "duct_leakage",
          is_completed: true,
          computed_pass: true,
          override_pass: null,
          data: {},
          computed: {},
        },
      ],
      correctionResolutionEvent: null,
    });

    expect(forceSetOpsStatusMock).not.toHaveBeenCalled();
    expect(setOpsStatusIfNotManualMock).not.toHaveBeenCalled();
  });

  it("photo attestation completed run does not satisfy allRequiredPassed (outcome = unknown)", async () => {
    // A completed run with photo_evidence status has computed_pass=null and override_pass=null.
    // getOutcome() returns "unknown" → anyPass stays false → allRequiredPassed = false.
    // With field_complete=true, job should fall to paperwork_required (needs manual review).
    await runEvaluation({
      job: {
        id: "job-1",
        status: "completed",
        job_type: "ecc",
        project_type: "changeout",
        field_complete: true,
        certs_complete: false,
        invoice_complete: false,
        ops_status: "paperwork_required",
        scheduled_date: "2026-04-10",
        window_start: "08:00",
        window_end: "10:00",
      },
      runs: [
        {
          id: "run-1",
          system_id: "sys-1",
          test_type: "duct_leakage",
          is_completed: true,
          computed_pass: null,       // photo attestation: not a numeric pass
          override_pass: null,       // not overridden
          data: { verification_method: "photo_taken" },
          computed: { status: "photo_evidence" },
        },
      ],
      correctionResolutionEvent: null,
    });

    // anyPass=false, anyFail=false → not allRequiredPassed, not anyRequiredFail
    // field_complete=true → paperwork_required fallback
    expect(setOpsStatusIfNotManualMock).toHaveBeenCalledWith("job-1", "paperwork_required");
    expect(forceSetOpsStatusMock).not.toHaveBeenCalled();
  });

  it("photo attestation run does not trigger anyRequiredFail (outcome = unknown, not fail)", async () => {
    // Photo attestation must not cause the job to set ops_status = "failed".
    // outcome = "unknown" means anyFail stays false.
    await runEvaluation({
      job: {
        id: "job-1",
        status: "completed",
        job_type: "ecc",
        project_type: "changeout",
        field_complete: true,
        certs_complete: false,
        invoice_complete: false,
        ops_status: "paperwork_required",
        scheduled_date: "2026-04-10",
        window_start: "08:00",
        window_end: "10:00",
      },
      runs: [
        {
          id: "run-1",
          system_id: "sys-1",
          test_type: "duct_leakage",
          is_completed: true,
          computed_pass: null,
          override_pass: null,
          data: { verification_method: "photo_taken" },
          computed: { status: "photo_evidence" },
        },
      ],
      correctionResolutionEvent: null,
    });

    expect(forceSetOpsStatusMock).not.toHaveBeenCalledWith("job-1", "failed");
  });

  it("override_pass=true on a photo attestation run promotes it to pass for job resolution", async () => {
    // After admin review, if override_pass is set to true on a photo attestation run,
    // getOutcome() returns "pass" → allRequiredPassed = true → job resolves.
    await runEvaluation({
      job: {
        id: "job-1",
        status: "completed",
        job_type: "ecc",
        project_type: "changeout",
        field_complete: true,
        certs_complete: true,
        invoice_complete: true,
        ops_status: "paperwork_required",
        scheduled_date: "2026-04-10",
        window_start: "08:00",
        window_end: "10:00",
      },
      runs: [
        {
          id: "run-1",
          system_id: "sys-1",
          test_type: "duct_leakage",
          is_completed: true,
          computed_pass: null,
          override_pass: true,       // admin reviewed and approved
          data: { verification_method: "photo_taken" },
          computed: { status: "photo_evidence" },
        },
      ],
      correctionResolutionEvent: null,
    });

    expect(forceSetOpsStatusMock).toHaveBeenCalledWith("job-1", "closed");
    expect(forceSetOpsStatusMock).toHaveBeenCalledTimes(1);
  });
});