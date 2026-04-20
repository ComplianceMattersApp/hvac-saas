import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const evaluateEccOpsStatusMock = vi.fn();
const evaluateJobOpsStatusMock = vi.fn();
const healStalePaperworkOpsStatusMock = vi.fn();
const revalidatePathMock = vi.fn();
const redirectMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

vi.mock("@/lib/actions/ecc-status", () => ({
  evaluateEccOpsStatus: (...args: unknown[]) => evaluateEccOpsStatusMock(...args),
}));

vi.mock("@/lib/actions/job-evaluator", () => ({
  evaluateJobOpsStatus: (...args: unknown[]) => evaluateJobOpsStatusMock(...args),
  healStalePaperworkOpsStatus: (...args: unknown[]) => healStalePaperworkOpsStatusMock(...args),
}));

vi.mock("@/lib/actions/ops-status", () => ({
  forceSetOpsStatus: vi.fn(),
}));

type JobSnapshot = {
  id: string;
  status: string;
  job_type: string;
  ops_status: string;
  field_complete: boolean;
  certs_complete: boolean;
  invoice_complete: boolean;
  scheduled_date: string | null;
  window_start: string | null;
  window_end: string | null;
  pending_info_reason: string | null;
  on_hold_reason: string | null;
  follow_up_date: string | null;
  next_action_note: string | null;
  action_required_by: string | null;
};

function makeSupabaseForRelease(before: JobSnapshot, afterOpsStatus: string) {
  let jobsSelectCount = 0;

  return {
    from(table: string) {
      if (table === "jobs") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          single: vi.fn(async () => {
            jobsSelectCount += 1;

            if (jobsSelectCount === 1) {
              return { data: before, error: null };
            }

            return { data: { ops_status: afterOpsStatus }, error: null };
          }),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        };

        return query;
      }

      if (table === "job_events") {
        return {
          insert: vi.fn(async () => ({ error: null })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

describe("releaseAndReevaluate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    evaluateEccOpsStatusMock.mockResolvedValue(undefined);
    evaluateJobOpsStatusMock.mockResolvedValue(undefined);
    healStalePaperworkOpsStatusMock.mockResolvedValue(true);
    revalidatePathMock.mockReturnValue(undefined);
    redirectMock.mockReturnValue(undefined);
  });

  it("heals fully complete ECC jobs to closed after release reevaluation", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseForRelease(
        {
          id: "job-1",
          status: "completed",
          job_type: "ecc",
          ops_status: "paperwork_required",
          field_complete: true,
          certs_complete: true,
          invoice_complete: true,
          scheduled_date: "2026-04-10",
          window_start: "08:00",
          window_end: "10:00",
          pending_info_reason: null,
          on_hold_reason: null,
          follow_up_date: null,
          next_action_note: null,
          action_required_by: null,
        },
        "closed",
      ),
    );

    const { releaseAndReevaluate } = await import("@/lib/actions/job-ops-actions");
    const nextOps = await releaseAndReevaluate("job-1", "unit_test");

    expect(evaluateEccOpsStatusMock).toHaveBeenCalledWith("job-1");
    expect(healStalePaperworkOpsStatusMock).toHaveBeenCalledWith("job-1");
    expect(healStalePaperworkOpsStatusMock).toHaveBeenCalledTimes(1);
    expect(nextOps).toBe("closed");
  });
});