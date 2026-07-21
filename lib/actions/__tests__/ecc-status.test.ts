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
  jobUpdates?: Array<Record<string, any>>;
  jobEvents?: Array<Record<string, any>>;
};

function makeResponse(data: any, error: { message: string } | null = null): QueryResponse {
  return { data, error };
}

function makeSupabase(fixture: SupabaseFixture) {
  const jobUpdates = fixture.jobUpdates ?? [];
  const jobEvents = fixture.jobEvents ?? [];

  return {
    from(table: string) {
      const filters: Array<{ column: string; value: unknown }> = [];

      const resolveTableResponse = (mode: "single" | "maybeSingle" | "many"): QueryResponse => {
        if (table === "jobs") {
          return makeResponse({
            permit_number: "PERMIT-TEST",
            pending_info_reason: null,
            ...fixture.job,
          });
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
        update: vi.fn((payload: Record<string, any>) => {
          if (table === "jobs") jobUpdates.push(payload);
          return query;
        }),
        insert: vi.fn((payload: Record<string, any>) => {
          if (table === "job_events") jobEvents.push(payload);
          return query;
        }),
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
    __jobUpdates: jobUpdates,
    __jobEvents: jobEvents,
  };
}

async function runEvaluation(fixture: SupabaseFixture) {
  const supabase = makeSupabase(fixture);
  createClientMock.mockResolvedValue(supabase);
  const { evaluateEccOpsStatus } = await import("@/lib/actions/ecc-status");
  await evaluateEccOpsStatus(String(fixture.job.id ?? "job-1"));
  return supabase;
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

    expect(forceSetOpsStatusMock).toHaveBeenCalledWith(
      "job-1",
      "failed",
      expect.objectContaining({ timing: undefined })
    );
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

    expect(forceSetOpsStatusMock).toHaveBeenCalledWith(
      "job-1",
      "invoice_required",
      expect.objectContaining({ timing: undefined })
    );
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

    expect(forceSetOpsStatusMock).toHaveBeenCalledWith(
      "job-1",
      "closed",
      expect.objectContaining({ timing: undefined })
    );
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

    expect(forceSetOpsStatusMock).toHaveBeenCalledWith(
      "job-1",
      "closed",
      expect.objectContaining({ timing: undefined })
    );
    expect(forceSetOpsStatusMock).toHaveBeenCalledTimes(1);
    expect(setOpsStatusIfNotManualMock).not.toHaveBeenCalled();
  });

  it("sets Permit Needed when ECC closeout is ready but permit number is blank", async () => {
    const supabase = await runEvaluation({
      job: {
        id: "job-permit-needed",
        status: "completed",
        job_type: "ecc",
        project_type: "changeout",
        field_complete: true,
        certs_complete: false,
        invoice_complete: false,
        ops_status: "paperwork_required",
        pending_info_reason: null,
        permit_number: null,
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

    expect((supabase as any).__jobUpdates).toContainEqual({
      ops_status: "pending_info",
      pending_info_reason: "Permit Needed",
    });
    expect((supabase as any).__jobEvents).toEqual([
      expect.objectContaining({
        job_id: "job-permit-needed",
        event_type: "ops_update",
        message: "Permit number needed",
        meta: expect.objectContaining({
          event_family: "ecc_permit",
          source_action: "evaluateEccOpsStatus",
        }),
      }),
    ]);
    expect(setOpsStatusIfNotManualMock).not.toHaveBeenCalled();
    expect(forceSetOpsStatusMock).not.toHaveBeenCalled();
  });

  it("does not let Permit Needed overwrite unresolved failed ECC truth", async () => {
    const supabase = await runEvaluation({
      job: {
        id: "job-failed-before-permit",
        status: "completed",
        job_type: "ecc",
        project_type: "changeout",
        field_complete: true,
        certs_complete: false,
        invoice_complete: false,
        ops_status: "paperwork_required",
        pending_info_reason: null,
        permit_number: null,
        scheduled_date: "2026-04-10",
        window_start: "08:00",
        window_end: "10:00",
      },
      correctionResolutionEvent: null,
    });

    expect(forceSetOpsStatusMock).toHaveBeenCalledWith(
      "job-failed-before-permit",
      "failed",
      expect.objectContaining({ timing: undefined })
    );
    expect((supabase as any).__jobUpdates).toEqual([]);
  });

  it("does not let Permit Needed overwrite an explicit on-hold blocker", async () => {
    const supabase = await runEvaluation({
      job: {
        id: "job-on-hold-before-permit",
        status: "completed",
        job_type: "ecc",
        project_type: "changeout",
        field_complete: true,
        certs_complete: false,
        invoice_complete: false,
        ops_status: "on_hold",
        pending_info_reason: null,
        permit_number: null,
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

    expect((supabase as any).__jobUpdates).toEqual([]);
    expect(setOpsStatusIfNotManualMock).not.toHaveBeenCalled();
    expect(forceSetOpsStatusMock).not.toHaveBeenCalled();
  });

  it("does not let Permit Needed overwrite an existing manual pending-info reason", async () => {
    const supabase = await runEvaluation({
      job: {
        id: "job-manual-pending-reason",
        status: "completed",
        job_type: "ecc",
        project_type: "changeout",
        field_complete: true,
        certs_complete: false,
        invoice_complete: false,
        ops_status: "paperwork_required",
        pending_info_reason: "Missing AHJ attachment",
        permit_number: null,
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

    expect((supabase as any).__jobUpdates).toEqual([]);
    expect(setOpsStatusIfNotManualMock).toHaveBeenCalledWith(
      "job-manual-pending-reason",
      "paperwork_required",
      expect.objectContaining({ timing: undefined })
    );
    expect(forceSetOpsStatusMock).not.toHaveBeenCalled();
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
    expect(setOpsStatusIfNotManualMock).toHaveBeenCalledWith(
      "job-1",
      "paperwork_required",
      expect.objectContaining({ timing: undefined })
    );
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

    expect(forceSetOpsStatusMock).toHaveBeenCalledWith(
      "job-1",
      "closed",
      expect.objectContaining({ timing: undefined })
    );
    expect(forceSetOpsStatusMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a closed ECC job terminal when its permit number remains valid", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await runEvaluation({
      job: {
        id: "job-closed",
        status: "completed",
        job_type: "ecc",
        project_type: "changeout",
        field_complete: true,
        certs_complete: false,
        invoice_complete: false,
        ops_status: "closed",
        permit_number: "PERMIT-123",
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

    expect(setOpsStatusIfNotManualMock).not.toHaveBeenCalled();
    expect(forceSetOpsStatusMock).not.toHaveBeenCalled();

    expect(errorSpy).not.toHaveBeenCalledWith(
      "[ECC_EVAL]",
      expect.objectContaining({ reason: "closed_terminal_noop" })
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "[ECC_EVAL]",
      expect.objectContaining({
        jobId: "job-closed",
        reason: "closed_terminal_noop",
        final_ops_status: "closed",
        updated: false,
      })
    );

    errorSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it("reopens a closed ECC job as Permit Needed when its permit number is missing", async () => {
    const supabase = await runEvaluation({
      job: {
        id: "job-closed-missing-permit",
        status: "completed",
        job_type: "ecc",
        project_type: "changeout",
        field_complete: true,
        certs_complete: false,
        invoice_complete: true,
        ops_status: "closed",
        permit_number: null,
        pending_info_reason: null,
      },
    });

    expect((supabase as any).__jobUpdates).toContainEqual({
      ops_status: "pending_info",
      pending_info_reason: "Permit Needed",
    });
    expect((supabase as any).__jobEvents).toContainEqual(expect.objectContaining({
      job_id: "job-closed-missing-permit",
      event_type: "ops_update",
      message: "Permit number needed",
      meta: expect.objectContaining({ reason: "closed_missing_permit_revalidation" }),
    }));
  });

  it("preserves manual-lock handling for non-closed field-complete fallback", async () => {
    setOpsStatusIfNotManualMock.mockResolvedValueOnce({
      finalStatus: "pending_info",
      manualLockPrevented: true,
      updated: false,
    });

    await runEvaluation({
      job: {
        id: "job-pending-info",
        status: "completed",
        job_type: "ecc",
        project_type: "changeout",
        field_complete: true,
        certs_complete: false,
        invoice_complete: false,
        ops_status: "pending_info",
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

    expect(setOpsStatusIfNotManualMock).toHaveBeenCalledWith(
      "job-pending-info",
      "paperwork_required",
      expect.objectContaining({ timing: undefined })
    );
    expect(forceSetOpsStatusMock).not.toHaveBeenCalled();
  });

  it("same-status field_complete_fallback logs as info, not error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    setOpsStatusIfNotManualMock.mockResolvedValueOnce({
      finalStatus: "paperwork_required",
      manualLockPrevented: false,
      updated: false,
      note: "same_status_noop",
    });

    await runEvaluation({
      job: {
        id: "job-same-status-fallback",
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

    expect(errorSpy).not.toHaveBeenCalledWith(
      "[ECC_EVAL]",
      expect.objectContaining({ reason: "field_complete_fallback" })
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "[ECC_EVAL]",
      expect.objectContaining({
        jobId: "job-same-status-fallback",
        reason: "field_complete_fallback",
        updated: false,
      })
    );

    errorSpy.mockRestore();
    infoSpy.mockRestore();
  });
});
