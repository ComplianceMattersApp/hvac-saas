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

function buildSupabaseClient(response: QueryResponse, calls: Array<{ method: string; args: unknown[] }>) {
  return {
    from: vi.fn((table: string) => {
      if (table !== "job_events") {
        throw new Error(`Unexpected table ${table}`);
      }

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
          data: null,
          error: { message: "canceling statement due to statement timeout" },
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
          data: [],
          error: null,
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
          data: null,
          error: { message: "canceling statement due to statement timeout" },
        },
        [],
      ),
    );

    const jsx = await DeferredTimelineBody({
      jobId: "job-1",
      timelineJobIds: ["job-1", "job-2"],
      hasDirectNarrativeChain: true,
      emptyStateClassName: "empty-state",
    });

    const html = renderToStaticMarkup(jsx);

    expect(html).toContain("Section temporarily unavailable");
    expect(html).toContain("Timeline is temporarily unavailable");
  });
});