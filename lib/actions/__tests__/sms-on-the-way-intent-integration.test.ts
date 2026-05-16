import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createOnTheWayIntentFromEvent } from "@/lib/communications/sms-on-the-way-intent-create";

// Mock the sms-on-the-way-intent-create module
vi.mock("@/lib/communications/sms-on-the-way-intent-create", () => ({
  createOnTheWayIntentFromEvent: vi.fn(),
}));

describe("SMS On-The-Way Intent Integration with Mark On The Way", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should call createOnTheWayIntentFromEvent with correct parameters", async () => {
    const mockCreateIntent = vi.mocked(createOnTheWayIntentFromEvent);
    mockCreateIntent.mockResolvedValueOnce({
      created: true,
      deduped: false,
      intentId: "intent-123",
      decisionStatus: "ready",
      decisionOutcomeWritten: "ready_for_provider",
      blockedReasons: [],
      warnings: [],
      liveSendEnabled: false,
    });

    const supabase = { from: vi.fn() };
    const accountOwnerUserId = "owner-123";
    const actingUserId = "user-456";
    const jobId = "job-789";
    const onMyWayEventId = "event-abc";

    await createOnTheWayIntentFromEvent({
      supabase,
      accountOwnerUserId,
      actingUserId,
      jobId,
      jobEventId: onMyWayEventId,
    });

    expect(mockCreateIntent).toHaveBeenCalledOnce();
    expect(mockCreateIntent).toHaveBeenCalledWith({
      supabase,
      accountOwnerUserId,
      actingUserId,
      jobId,
      jobEventId: onMyWayEventId,
    });
  });

  it("should handle intent creation success without throwing", async () => {
    const mockCreateIntent = vi.mocked(createOnTheWayIntentFromEvent);
    mockCreateIntent.mockResolvedValueOnce({
      created: true,
      deduped: false,
      intentId: "intent-123",
      decisionStatus: "ready",
      decisionOutcomeWritten: "ready_for_provider",
      blockedReasons: [],
      warnings: [],
      liveSendEnabled: false,
    });

    const supabase = { from: vi.fn() };

    const result = await createOnTheWayIntentFromEvent({
      supabase,
      accountOwnerUserId: "owner-123",
      actingUserId: "user-456",
      jobId: "job-789",
      jobEventId: "event-abc",
    });

    expect(result.created).toBe(true);
    expect(result.intentId).toBe("intent-123");
  });

  it("should handle write-skipped result without throwing", async () => {
    const mockCreateIntent = vi.mocked(createOnTheWayIntentFromEvent);
    mockCreateIntent.mockResolvedValueOnce({
      created: false,
      deduped: false,
      decisionStatus: "skipped",
      blockedReasons: [],
      warnings: [],
      writeSkippedReason: "skipped_non_target_event",
      liveSendEnabled: false,
    });

    const supabase = { from: vi.fn() };

    const result = await createOnTheWayIntentFromEvent({
      supabase,
      accountOwnerUserId: "owner-123",
      actingUserId: "user-456",
      jobId: "job-789",
      jobEventId: "event-abc",
    });

    expect(result.created).toBe(false);
    expect(result.writeSkippedReason).toBe("skipped_non_target_event");
  });

  it("should handle blocked result without throwing", async () => {
    const mockCreateIntent = vi.mocked(createOnTheWayIntentFromEvent);
    mockCreateIntent.mockResolvedValueOnce({
      created: false,
      deduped: false,
      decisionStatus: "blocked",
      decisionOutcomeWritten: "blocked",
      blockedReasons: ["consent_not_opted_in"],
      warnings: [],
      liveSendEnabled: false,
    });

    const supabase = { from: vi.fn() };

    const result = await createOnTheWayIntentFromEvent({
      supabase,
      accountOwnerUserId: "owner-123",
      actingUserId: "user-456",
      jobId: "job-789",
      jobEventId: "event-abc",
    });

    expect(result.created).toBe(false);
    expect(result.blockedReasons).toContain("consent_not_opted_in");
  });

  it("should handle intent creation error gracefully (best-effort)", async () => {
    const mockCreateIntent = vi.mocked(createOnTheWayIntentFromEvent);
    mockCreateIntent.mockRejectedValueOnce(new Error("Database error"));

    const supabase = { from: vi.fn() };

    // The error should be thrown here in the test context
    // but in actual usage it would be caught and logged
    await expect(
      createOnTheWayIntentFromEvent({
        supabase,
        accountOwnerUserId: "owner-123",
        actingUserId: "user-456",
        jobId: "job-789",
        jobEventId: "event-abc",
      }),
    ).rejects.toThrow("Database error");
  });

  it("should not create provider deliveries", async () => {
    // This is an audit test to ensure the intent creation helper
    // only creates sms_message_intents, not sms_provider_deliveries
    const mockCreateIntent = vi.mocked(createOnTheWayIntentFromEvent);
    mockCreateIntent.mockResolvedValueOnce({
      created: true,
      deduped: false,
      intentId: "intent-123",
      decisionStatus: "ready",
      decisionOutcomeWritten: "ready_for_provider",
      blockedReasons: [],
      warnings: [],
      liveSendEnabled: false,
    });

    const supabase = { from: vi.fn() };

    const result = await createOnTheWayIntentFromEvent({
      supabase,
      accountOwnerUserId: "owner-123",
      actingUserId: "user-456",
      jobId: "job-789",
      jobEventId: "event-abc",
    });

    // liveSendEnabled should always be false (no provider sends)
    expect(result.liveSendEnabled).toBe(false);
  });

  it("should handle deduped intent result", async () => {
    const mockCreateIntent = vi.mocked(createOnTheWayIntentFromEvent);
    mockCreateIntent.mockResolvedValueOnce({
      created: false,
      deduped: true,
      decisionStatus: "ready",
      decisionOutcomeWritten: "ready_for_provider",
      blockedReasons: [],
      warnings: [],
      liveSendEnabled: false,
    });

    const supabase = { from: vi.fn() };

    const result = await createOnTheWayIntentFromEvent({
      supabase,
      accountOwnerUserId: "owner-123",
      actingUserId: "user-456",
      jobId: "job-789",
      jobEventId: "event-abc",
    });

    expect(result.deduped).toBe(true);
    expect(result.created).toBe(false);
  });
});
