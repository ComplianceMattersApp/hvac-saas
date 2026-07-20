import { describe, expect, it, vi } from "vitest";
import { estimateLineRewriteReservationMicrousd, rewriteEstimateLineDescription } from "../estimate-line-rewrite-provider";

describe("estimate line rewrite provider", () => {
  it("returns a concise structured rewrite and measured usage", async () => {
    const parse = vi.fn().mockResolvedValue({
      output_parsed: { rewrittenDescription: "Furnish and install a new split HVAC system.", missingSpecifics: ["Equipment capacity", "Warranty"] },
      usage: { input_tokens: 80, output_tokens: 30, input_tokens_details: { cached_tokens: 0 } },
    });
    const result = await rewriteEstimateLineDescription({ itemName: "New Split System", itemType: "install", roughDescription: "new furnace condenser coil", client: { responses: { parse } } as any });
    expect(result.rewrite.missingSpecifics).toHaveLength(2);
    expect(result.usage.actualCostMicrousd).toBeGreaterThan(0);
    expect(parse).toHaveBeenCalledWith(expect.objectContaining({ store: false, max_output_tokens: 500 }));
  });

  it("reserves more than the maximum modeled output cost", () => {
    expect(estimateLineRewriteReservationMicrousd({ itemName: "System", itemType: "install", roughDescription: "rough notes" })).toBeGreaterThan(3_000);
  });
});
