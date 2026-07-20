import { describe, expect, it, vi } from "vitest";
import {
  dollarsToMicrousd,
  formatMicrousd,
  loadAiBudgetSnapshot,
  releaseAiUsage,
  reserveAiUsage,
  settleAiUsage,
} from "@/lib/ai/usage-budget";

function queryResult(result: { data: any; error: any }) {
  const builder: any = Promise.resolve(result);
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => builder);
  builder.gte = vi.fn(() => builder);
  return builder;
}

describe("AI usage budget helpers", () => {
  it("converts owner-entered dollars to integer microusd with bounds", () => {
    expect(dollarsToMicrousd("25")).toBe(25_000_000);
    expect(dollarsToMicrousd("25.55")).toBe(25_550_000);
    expect(dollarsToMicrousd("0.99")).toBeNull();
    expect(dollarsToMicrousd("1001")).toBeNull();
    expect(formatMicrousd(25_500_000)).toBe("$25.50");
  });

  it("summarizes completed, reserved, rejected, and per-feature usage", async () => {
    const settings = queryResult({ data: { monthly_limit_microusd: 25_000_000, is_enabled: true }, error: null });
    const usage = queryResult({
      data: [
        { feature_key: "trainer", status: "completed", actual_cost_microusd: 1_500_000, estimated_cost_microusd: 2_000_000 },
        { feature_key: "estimate_coach", status: "completed", actual_cost_microusd: 500_000, estimated_cost_microusd: 700_000 },
        { feature_key: "trainer", status: "reserved", actual_cost_microusd: 0, estimated_cost_microusd: 1_000_000 },
        { feature_key: "trainer", status: "rejected", actual_cost_microusd: 0, estimated_cost_microusd: 5_000_000 },
      ],
      error: null,
    });
    const admin = { from: vi.fn((table: string) => table === "ai_global_budget_settings" ? settings : usage) };

    const snapshot = await loadAiBudgetSnapshot({ admin, now: new Date("2026-07-19T12:00:00Z") });
    expect(snapshot).toMatchObject({
      available: true,
      enabled: true,
      completedCostMicrousd: 2_000_000,
      reservedCostMicrousd: 1_000_000,
      remainingMicrousd: 22_000_000,
      completedRequests: 2,
      rejectedRequests: 1,
      byFeature: { trainer: 1_500_000, estimate_coach: 500_000 },
    });
    expect(usage.gte).toHaveBeenCalledWith("created_at", "2026-07-01T00:00:00.000Z");
  });

  it("fails closed when the budget schema is unavailable", async () => {
    const failed = queryResult({ data: null, error: { code: "42P01" } });
    const admin = { from: vi.fn(() => failed) };
    const snapshot = await loadAiBudgetSnapshot({ admin });
    expect(snapshot).toMatchObject({ available: false, enabled: false, remainingMicrousd: 0 });
  });

  it("uses service-role RPC contracts for reserve, settle, and release", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ accepted: true, reason: "reserved", remaining_microusd: 24_000_000 }], error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const admin = { rpc };
    await expect(reserveAiUsage({ admin, requestId: "req-1", featureKey: "trainer", model: "gpt-5.6-luna", estimatedCostMicrousd: 1_000_000 })).resolves.toEqual({ accepted: true, reason: "reserved", remainingMicrousd: 24_000_000 });
    await expect(settleAiUsage({ admin, requestId: "req-1", actualCostMicrousd: 500_000, inputTokens: 1000, cachedInputTokens: 0, outputTokens: 200 })).resolves.toBe(true);
    await expect(releaseAiUsage({ admin, requestId: "req-2" })).resolves.toBe(true);
    expect(rpc).toHaveBeenNthCalledWith(1, "reserve_ai_usage_budget", expect.objectContaining({ p_feature_key: "trainer" }));
  });
});
