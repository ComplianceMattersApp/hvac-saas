import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

function makeSupabase(params: {
  currentOpsStatus: string | null;
  rereadOpsStatus?: string | null;
}) {
  const { currentOpsStatus, rereadOpsStatus = currentOpsStatus } = params;

  const updateEqMock = vi.fn(async () => ({ error: null }));
  const updateMock = vi.fn(() => ({
    eq: updateEqMock,
  }));

  let selectSingleCount = 0;

  const selectEqMock = vi.fn(() => ({
    single: vi.fn(async () => {
      selectSingleCount += 1;
      if (selectSingleCount === 1) {
        return {
          data: { id: "job-1", ops_status: currentOpsStatus },
          error: null,
        };
      }

      return {
        data: { ops_status: rereadOpsStatus },
        error: null,
      };
    }),
  }));

  const selectMock = vi.fn(() => ({
    eq: selectEqMock,
  }));

  return {
    from: vi.fn(() => ({
      select: selectMock,
      update: updateMock,
    })),
    updateMock,
    updateEqMock,
    selectMock,
  };
}

describe("setOpsStatusIfNotManual", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns same-status no-op before manual lock and does not write", async () => {
    const fixture = makeSupabase({ currentOpsStatus: "paperwork_required" });
    createClientMock.mockResolvedValue(fixture);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const { setOpsStatusIfNotManual } = await import("@/lib/actions/ops-status");
    const result = await setOpsStatusIfNotManual("job-1", "paperwork_required");

    expect(result).toEqual(
      expect.objectContaining({
        jobId: "job-1",
        previousStatus: "paperwork_required",
        requestedStatus: "paperwork_required",
        finalStatus: "paperwork_required",
        updated: false,
        manualLockPrevented: false,
        note: "same_status_noop",
      })
    );
    expect(fixture.updateMock).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalledWith("[OPS_STATUS_SET]", expect.anything());
    expect(infoSpy).toHaveBeenCalledWith(
      "[OPS_STATUS_SET]",
      expect.objectContaining({
        jobId: "job-1",
        note: "same_status_noop",
      })
    );

    errorSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it("keeps manual-lock prevention for real status changes", async () => {
    const fixture = makeSupabase({ currentOpsStatus: "pending_info" });
    createClientMock.mockResolvedValue(fixture);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { setOpsStatusIfNotManual } = await import("@/lib/actions/ops-status");
    const result = await setOpsStatusIfNotManual("job-1", "scheduled");

    expect(result).toEqual(
      expect.objectContaining({
        jobId: "job-1",
        previousStatus: "pending_info",
        requestedStatus: "scheduled",
        finalStatus: "pending_info",
        updated: false,
        manualLockPrevented: true,
      })
    );
    expect(fixture.updateMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "[OPS_STATUS_SET]",
      expect.objectContaining({
        jobId: "job-1",
        manualLockPrevented: true,
      })
    );

    warnSpy.mockRestore();
  });
});
