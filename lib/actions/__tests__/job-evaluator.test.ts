import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const evaluateEccOpsStatusMock = vi.fn();
const setOpsStatusIfNotManualMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/actions/ecc-status", () => ({
  evaluateEccOpsStatus: (...args: unknown[]) => evaluateEccOpsStatusMock(...args),
}));

vi.mock("@/lib/actions/ops-status", () => ({
  setOpsStatusIfNotManual: (...args: unknown[]) => setOpsStatusIfNotManualMock(...args),
  forceSetOpsStatus: vi.fn(),
}));

type JobRow = {
  id: string;
  job_type: string | null;
  status: string | null;
  scheduled_date: string | null;
  window_start: string | null;
  window_end: string | null;
  field_complete: boolean | null;
  certs_complete: boolean | null;
  invoice_complete: boolean | null;
  ops_status: string | null;
};

function buildJob(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: "job-1",
    job_type: "ecc",
    status: "open",
    scheduled_date: null,
    window_start: null,
    window_end: null,
    field_complete: false,
    certs_complete: false,
    invoice_complete: false,
    ops_status: "need_to_schedule",
    ...overrides,
  };
}

function makeSupabaseForJob(job: JobRow | null, error: { message: string } | null = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: job, error })),
        })),
      })),
    })),
  };
}

async function runWithJob(job: JobRow) {
  createClientMock.mockResolvedValue(makeSupabaseForJob(job));
  const { evaluateJobOpsStatus } = await import("@/lib/actions/job-evaluator");
  await evaluateJobOpsStatus(job.id);
}

describe("evaluateJobOpsStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setOpsStatusIfNotManualMock.mockResolvedValue({
      finalStatus: "",
      manualLockPrevented: false,
      updated: false,
    });
    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
  });

  it("ECC pre-field unscheduled resolves to need_to_schedule", async () => {
    await runWithJob(
      buildJob({
        job_type: "ecc",
        field_complete: false,
        scheduled_date: null,
        window_start: null,
        window_end: null,
        ops_status: "need_to_schedule",
      })
    );

    expect(setOpsStatusIfNotManualMock).toHaveBeenCalledWith("job-1", "need_to_schedule");
    expect(setOpsStatusIfNotManualMock).toHaveBeenCalledTimes(1);
    expect(evaluateEccOpsStatusMock).not.toHaveBeenCalled();
  });

  it("ECC pre-field scheduled resolves to scheduled", async () => {
    await runWithJob(
      buildJob({
        job_type: "ecc",
        field_complete: false,
        scheduled_date: "2026-03-27",
        window_start: "08:00",
        window_end: "10:00",
        ops_status: "need_to_schedule",
      })
    );

    expect(setOpsStatusIfNotManualMock).toHaveBeenCalledWith("job-1", "scheduled");
    expect(setOpsStatusIfNotManualMock).toHaveBeenCalledTimes(1);
    expect(evaluateEccOpsStatusMock).not.toHaveBeenCalled();
  });

  it("ECC pre-field schedule removed resolves back to need_to_schedule", async () => {
    await runWithJob(
      buildJob({
        job_type: "ecc",
        field_complete: false,
        scheduled_date: null,
        window_start: null,
        window_end: null,
        ops_status: "scheduled",
      })
    );

    expect(setOpsStatusIfNotManualMock).toHaveBeenCalledWith("job-1", "need_to_schedule");
    expect(setOpsStatusIfNotManualMock).toHaveBeenCalledTimes(1);
    expect(evaluateEccOpsStatusMock).not.toHaveBeenCalled();
  });

  it("ECC failed pre-field state is not overwritten by scheduling", async () => {
    await runWithJob(
      buildJob({
        job_type: "ecc",
        field_complete: false,
        scheduled_date: "2026-03-27",
        window_start: "08:00",
        window_end: "10:00",
        ops_status: "failed",
      })
    );

    expect(setOpsStatusIfNotManualMock).not.toHaveBeenCalled();
    expect(evaluateEccOpsStatusMock).not.toHaveBeenCalled();
  });

  it("ECC retest_needed pre-field state is not overwritten by scheduling", async () => {
    await runWithJob(
      buildJob({
        job_type: "ecc",
        field_complete: false,
        scheduled_date: "2026-03-27",
        window_start: "08:00",
        window_end: "10:00",
        ops_status: "retest_needed",
      })
    );

    expect(setOpsStatusIfNotManualMock).not.toHaveBeenCalled();
    expect(evaluateEccOpsStatusMock).not.toHaveBeenCalled();
  });

  it("service pre-field scheduled path still resolves to scheduled", async () => {
    await runWithJob(
      buildJob({
        job_type: "service",
        field_complete: false,
        scheduled_date: "2026-03-27",
        window_start: "08:00",
        window_end: "10:00",
        ops_status: "need_to_schedule",
      })
    );

    expect(setOpsStatusIfNotManualMock).toHaveBeenCalledWith("job-1", "scheduled");
    expect(setOpsStatusIfNotManualMock).toHaveBeenCalledTimes(1);
    expect(evaluateEccOpsStatusMock).not.toHaveBeenCalled();
  });

  it("ECC post-field path delegates to evaluateEccOpsStatus", async () => {
    await runWithJob(
      buildJob({
        job_type: "ecc",
        field_complete: true,
        status: "completed",
        scheduled_date: "2026-03-27",
        window_start: "08:00",
        window_end: "10:00",
      })
    );

    expect(evaluateEccOpsStatusMock).toHaveBeenCalledWith("job-1");
    expect(evaluateEccOpsStatusMock).toHaveBeenCalledTimes(1);
    expect(setOpsStatusIfNotManualMock).not.toHaveBeenCalled();
  });

  it("pre-field path calls setOpsStatusIfNotManual (does not bypass manual-lock boundary)", async () => {
    await runWithJob(
      buildJob({
        job_type: "service",
        field_complete: false,
        scheduled_date: "2026-03-27",
        window_start: "08:00",
        window_end: "10:00",
        ops_status: "pending_info",
      })
    );

    expect(setOpsStatusIfNotManualMock).toHaveBeenCalledWith("job-1", "scheduled");
    expect(setOpsStatusIfNotManualMock).toHaveBeenCalledTimes(1);
  });

  it("throws when job lookup fails", async () => {
    createClientMock.mockResolvedValue(makeSupabaseForJob(null, { message: "boom" }));
    const { evaluateJobOpsStatus } = await import("@/lib/actions/job-evaluator");

    await expect(evaluateJobOpsStatus("job-1")).rejects.toThrow("boom");
  });
});
