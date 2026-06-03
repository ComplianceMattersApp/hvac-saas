import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const createClientMock = vi.fn();
const resolveUserDisplayMapMock = vi.fn();
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/staffing/human-layer", () => ({
  resolveUserDisplayMap: (...args: unknown[]) => resolveUserDisplayMapMock(...args),
}));

const DeferredInternalNotesBody = (
  await import("@/app/jobs/[id]/_components/DeferredInternalNotesBody")
).default;
const DeferredSharedNotesBody = (
  await import("@/app/jobs/[id]/_components/DeferredSharedNotesBody")
).default;
const DeferredTimelineBody = (
  await import("@/app/jobs/[id]/_components/DeferredTimelineBody")
).default;

type QueryResponse = {
  data: unknown;
  error: { message: string } | null;
};

const baseJobSummary = {
  id: "job-1",
  status: "open",
  ops_status: "need_to_schedule",
  field_complete: false,
  scheduled_date: null,
  window_start: null,
  window_end: null,
  parent_job_id: null,
  pending_info_reason: null,
  on_hold_reason: null,
};

function buildSupabaseClient(
  responses: {
    jobEvents: QueryResponse;
    linkedJobs?: QueryResponse;
  },
  calls: Array<{ method: string; args: unknown[] }>,
) {
  return {
    from: vi.fn((table: string) => {
      if (table !== "job_events" && table !== "jobs") {
        throw new Error(`Unexpected table ${table}`);
      }

      const response =
        table === "job_events"
          ? responses.jobEvents
          : (responses.linkedJobs ?? { data: [], error: null });

      const query: any = {
        select: (...args: unknown[]) => {
          calls.push({ method: "select", args });
          return query;
        },
        eq: (...args: unknown[]) => {
          calls.push({ method: "eq", args });
          return query;
        },
        in: (...args: unknown[]) => {
          calls.push({ method: "in", args });
          return query;
        },
        order: (...args: unknown[]) => {
          calls.push({ method: "order", args });
          return query;
        },
        limit: (...args: unknown[]) => {
          calls.push({ method: "limit", args });
          return query;
        },
        then: (
          resolve: (value: QueryResponse) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => Promise.resolve(response).then(resolve, reject),
      };

      return query;
    }),
  };
}

describe("job detail deferred narrative fail-open behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveUserDisplayMapMock.mockResolvedValue({});
    consoleErrorSpy.mockClear();
  });

  it("returns an isolated fallback when internal notes query fails", async () => {
    createClientMock.mockResolvedValue(
      buildSupabaseClient(
        {
          jobEvents: {
            data: null,
            error: { message: "canceling statement due to statement timeout" },
          },
        },
        [],
      ),
    );

    const jsx = await DeferredInternalNotesBody({
      jobId: "job-1",
      timelineJobIds: ["job-1", "job-2"],
      hasDirectNarrativeChain: true,
      emptyStateClassName: "empty-state",
    });

    const html = renderToStaticMarkup(jsx);

    expect(html).toContain("Section temporarily unavailable");
    expect(html).toContain("Internal notes are temporarily unavailable");
  });

  it("narrows shared notes reads to shared narrative event types", async () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    createClientMock.mockResolvedValue(
      buildSupabaseClient(
        {
          jobEvents: {
            data: [],
            error: null,
          },
        },
        calls,
      ),
    );

    const jsx = await DeferredSharedNotesBody({
      jobId: "job-1",
      timelineJobIds: ["job-1"],
      hasDirectNarrativeChain: false,
      emptyStateClassName: "empty-state",
    });

    renderToStaticMarkup(jsx);

    expect(calls).toContainEqual({
      method: "in",
      args: ["event_type", ["contractor_note", "public_note", "contractor_correction_submission"]],
    });
  });

  it("returns an isolated fallback when timeline query fails", async () => {
    createClientMock.mockResolvedValue(
      buildSupabaseClient(
        {
          jobEvents: {
            data: null,
            error: { message: "canceling statement due to statement timeout" },
          },
        },
        [],
      ),
    );

    const jsx = await DeferredTimelineBody({
      jobId: "job-1",
      timelineJobIds: ["job-1", "job-2"],
      hasDirectNarrativeChain: true,
      emptyStateClassName: "empty-state",
      jobSummary: baseJobSummary,
    });

    const html = renderToStaticMarkup(jsx);

    expect(html).toContain("Section temporarily unavailable");
    expect(html).toContain("Timeline is temporarily unavailable");
  });

  it("renders job history summary card while keeping detailed timeline entries", async () => {
    createClientMock.mockResolvedValue(
      buildSupabaseClient(
        {
          jobEvents: {
            data: [
              {
                id: "evt-1",
                job_id: "job-1",
                created_at: "2026-06-14T16:00:00.000Z",
                event_type: "schedule_updated",
                message: "Schedule updated",
                user_id: "user-1",
                meta: {
                  timeline_v: 1,
                  event_family: "scheduling",
                  actor_user_id: "user-1",
                  previous: {
                    scheduled_date: "2026-06-15",
                    window_start: "09:00",
                    window_end: "11:00",
                  },
                  next: {
                    scheduled_date: "2026-06-18",
                    window_start: "10:00",
                    window_end: "12:00",
                  },
                },
              },
            ],
            error: null,
          },
        },
        [],
      ),
    );

    const jsx = await DeferredTimelineBody({
      jobId: "job-1",
      timelineJobIds: ["job-1"],
      hasDirectNarrativeChain: true,
      emptyStateClassName: "empty-state",
      jobSummary: {
        ...baseJobSummary,
        ops_status: "scheduled",
        scheduled_date: "2026-06-18",
        window_start: "10:00",
        window_end: "12:00",
      },
    });

    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("Job History Summary");
    expect(html).toContain("A quick read of the job story. The detailed timeline below remains the full record.");
    expect(html).toContain("Scheduled");
    expect(html).toContain("Rescheduled from 2026-06-15 09:00-11:00 to 2026-06-18 10:00-12:00.");
    expect(html).toContain("Schedule updated");
    expect(html).not.toContain("missing_schedule_change_event");
  });

  it("renders closeout-first wording and omits diagnostic gaps", async () => {
    createClientMock.mockResolvedValue(
      buildSupabaseClient(
        {
          jobEvents: {
            data: [],
            error: null,
          },
        },
        [],
      ),
    );

    const jsx = await DeferredTimelineBody({
      jobId: "job-1",
      timelineJobIds: ["job-1"],
      hasDirectNarrativeChain: true,
      emptyStateClassName: "empty-state",
      jobSummary: {
        ...baseJobSummary,
        status: "completed",
        ops_status: "invoice_required",
        field_complete: true,
        scheduled_date: "2026-06-10",
        window_start: "08:00",
        window_end: "10:00",
      },
    });

    const html = renderToStaticMarkup(jsx);
    const fieldIdx = html.indexOf("Field work is complete, but closeout steps are still open.");
    const invoiceIdx = html.indexOf("Invoice follow-up is still required.");
    const scheduleIdx = html.indexOf("Currently scheduled for 2026-06-10 08:00-10:00.");

    expect(fieldIdx).toBeGreaterThan(-1);
    expect(invoiceIdx).toBeGreaterThan(fieldIdx);
    expect(scheduleIdx).toBeGreaterThan(invoiceIdx);
    expect(html).not.toContain("missing_");
    expect(html).not.toContain("timeline_v");
  });

  it("keeps failed and retest wording human-safe without raw linked ids in story text", async () => {
    createClientMock.mockResolvedValue(
      buildSupabaseClient(
        {
          jobEvents: {
            data: [
              {
                id: "evt-2",
                job_id: "job-1",
                created_at: "2026-06-11T09:00:00.000Z",
                event_type: "retest_created",
                message: "Retest created",
                user_id: "user-1",
                meta: {
                  child_job_id: "job-2",
                },
              },
            ],
            error: null,
          },
          linkedJobs: {
            data: [
              {
                id: "job-2",
                status: "completed",
                ops_status: "closed",
                parent_job_id: "job-1",
              },
            ],
            error: null,
          },
        },
        [],
      ),
    );

    const jsx = await DeferredTimelineBody({
      jobId: "job-1",
      timelineJobIds: ["job-1"],
      hasDirectNarrativeChain: true,
      emptyStateClassName: "empty-state",
      jobSummary: {
        ...baseJobSummary,
        status: "failed",
        ops_status: "failed",
        field_complete: true,
      },
    });

    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("Correction or retest needed");
    expect(html).toContain("Job is in failed/exception state and needs correction or retest attention.");
    expect(html).toContain("A linked retest/follow-up job is complete.");
    expect(html).not.toContain("job-2 is closed/completed");
    expect(html).not.toContain("Job is closed/completed.");
  });
});