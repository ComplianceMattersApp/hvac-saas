import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const forceSetOpsStatusMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/actions/ecc-status", () => ({
  evaluateEccOpsStatus: vi.fn(async () => undefined),
}));

vi.mock("@/lib/actions/ops-status", () => ({
  forceSetOpsStatus: (...args: unknown[]) => forceSetOpsStatusMock(...args),
  setOpsStatusIfNotManual: vi.fn(async () => undefined),
}));

function supabaseForJob(job: Record<string, unknown>) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: job, error: null })),
        })),
      })),
    })),
  };
}

describe("healStalePaperworkOpsStatus closeout invariant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    forceSetOpsStatusMock.mockResolvedValue(undefined);
  });

  it("closes invoice_required after the invoice projection becomes complete", async () => {
    createClientMock.mockResolvedValue(supabaseForJob({
      id: "job-1",
      job_type: "ecc",
      status: "completed",
      field_complete: true,
      certs_complete: true,
      invoice_complete: true,
      ops_status: "invoice_required",
    }));

    const { healStalePaperworkOpsStatus } = await import("@/lib/actions/job-evaluator");

    await expect(healStalePaperworkOpsStatus("job-1")).resolves.toBe(true);
    expect(forceSetOpsStatusMock).toHaveBeenCalledWith("job-1", "closed");
  });

  it("advances paperwork_required to invoice_required when only certs are complete", async () => {
    createClientMock.mockResolvedValue(supabaseForJob({
      id: "job-2",
      job_type: "ecc",
      status: "completed",
      field_complete: true,
      certs_complete: true,
      invoice_complete: false,
      ops_status: "paperwork_required",
    }));

    const { healStalePaperworkOpsStatus } = await import("@/lib/actions/job-evaluator");

    await expect(healStalePaperworkOpsStatus("job-2")).resolves.toBe(true);
    expect(forceSetOpsStatusMock).toHaveBeenCalledWith("job-2", "invoice_required");
  });

  it("never overwrites an explicit operational blocker", async () => {
    createClientMock.mockResolvedValue(supabaseForJob({
      id: "job-3",
      job_type: "ecc",
      status: "completed",
      field_complete: true,
      certs_complete: true,
      invoice_complete: true,
      ops_status: "on_hold",
    }));

    const { healStalePaperworkOpsStatus } = await import("@/lib/actions/job-evaluator");

    await expect(healStalePaperworkOpsStatus("job-3")).resolves.toBe(false);
    expect(forceSetOpsStatusMock).not.toHaveBeenCalled();
  });
});
