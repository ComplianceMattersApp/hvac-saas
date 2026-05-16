import { describe, it, expect, vi, beforeEach } from "vitest";

describe("insertJobEvent - event id handoff (F5C-C)", () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn(),
    };
  });

  it("returns the inserted event id on success", async () => {
    const mockInsertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "event-123" },
        error: null,
      }),
    };

    mockSupabase.from.mockReturnValue(mockInsertChain);

    // We import inside the test to avoid top-level server component issues
    const { insertJobEvent } = await import("../job-actions");

    const eventId = await insertJobEvent({
      supabase: mockSupabase,
      jobId: "job-456",
      event_type: "on_my_way",
      meta: { test: true },
      userId: "user-789",
    });

    expect(eventId).toBe("event-123");
    expect(mockSupabase.from).toHaveBeenCalledWith("job_events");
    expect(mockInsertChain.insert).toHaveBeenCalledWith({
      job_id: "job-456",
      event_type: "on_my_way",
      meta: { test: true },
      user_id: "user-789",
    });
    expect(mockInsertChain.select).toHaveBeenCalledWith("id");
    expect(mockInsertChain.single).toHaveBeenCalled();
  });

  it("throws on insert error", async () => {
    const mockInsertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: new Error("Insert failed"),
      }),
    };

    mockSupabase.from.mockReturnValue(mockInsertChain);

    const { insertJobEvent } = await import("../job-actions");

    await expect(
      insertJobEvent({
        supabase: mockSupabase,
        jobId: "job-456",
        event_type: "on_my_way",
      })
    ).rejects.toThrow("Insert failed");
  });

  it("throws if event id is missing in response", async () => {
    const mockInsertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {},
        error: null,
      }),
    };

    mockSupabase.from.mockReturnValue(mockInsertChain);

    const { insertJobEvent } = await import("../job-actions");

    await expect(
      insertJobEvent({
        supabase: mockSupabase,
        jobId: "job-456",
        event_type: "on_my_way",
      })
    ).rejects.toThrow("Failed to retrieve inserted event id");
  });

  it("preserves existing behavior: null meta and userId", async () => {
    const mockInsertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "event-xyz" },
        error: null,
      }),
    };

    mockSupabase.from.mockReturnValue(mockInsertChain);

    const { insertJobEvent } = await import("../job-actions");

    const eventId = await insertJobEvent({
      supabase: mockSupabase,
      jobId: "job-123",
      event_type: "schedule_updated",
    });

    expect(eventId).toBe("event-xyz");
    expect(mockInsertChain.insert).toHaveBeenCalledWith({
      job_id: "job-123",
      event_type: "schedule_updated",
      meta: null,
      user_id: null,
    });
  });
});
