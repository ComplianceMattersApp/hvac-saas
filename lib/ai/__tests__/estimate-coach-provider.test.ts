import { describe, expect, it, vi } from "vitest";
import {
  buildEstimateCoachAiContext,
  calculateLunaCostMicrousd,
  generateEstimateCoachAiSuggestions,
  estimateCoachReservationMicrousd,
} from "@/lib/ai/estimate-coach-provider";

function estimateFixture() {
  return {
    id: "estimate-secret-id",
    estimate_number: "EST-SECRET",
    customer_id: "customer-secret-id",
    location_id: "location-secret-id",
    title: "Replace rooftop unit",
    notes: "Replace failed unit and verify startup.",
    total_cents: 125_000,
    proposalMode: "single_option_flat",
    line_items: [{
      id: "line-secret-id",
      item_name_snapshot: "Rooftop unit replacement",
      description_snapshot: "Remove existing unit and install replacement.",
      item_type_snapshot: "install",
      quantity: 1,
      unit_price_cents: 125_000,
      source_pricebook_item_id: "pricebook-secret-id",
    }],
    options: undefined,
  } as any;
}

describe("Estimate Coach OpenAI provider", () => {
  it("builds a bounded commercial snapshot without record identifiers or customer PII", () => {
    const context = buildEstimateCoachAiContext(estimateFixture());
    const serialized = JSON.stringify(context);
    expect(context).toMatchObject({
      title: "Replace rooftop unit",
      customerPresent: true,
      locationPresent: true,
      lines: [{ source: "pricebook" }],
    });
    expect(serialized).not.toContain("estimate-secret-id");
    expect(serialized).not.toContain("customer-secret-id");
    expect(serialized).not.toContain("location-secret-id");
    expect(serialized).not.toContain("pricebook-secret-id");
  });

  it("calculates Luna token cost in integer microdollars", () => {
    expect(calculateLunaCostMicrousd({ inputTokens: 5_000, cachedInputTokens: 0, outputTokens: 500 })).toBe(8_000);
    expect(calculateLunaCostMicrousd({ inputTokens: 5_000, cachedInputTokens: 1_000, outputTokens: 500 })).toBe(7_100);
  });

  it("reserves conservatively for bounded input and maximum output", () => {
    const context = buildEstimateCoachAiContext(estimateFixture());
    const reservation = estimateCoachReservationMicrousd(context);
    expect(reservation).toBeGreaterThan(7_200);
    expect(reservation).toBeGreaterThan(calculateLunaCostMicrousd({
      inputTokens: JSON.stringify(context).length,
      cachedInputTokens: 0,
      outputTokens: 1_200,
    }));
  });

  it("requests strict structured output with no tools and validates the result", async () => {
    const parse = vi.fn().mockResolvedValue({
      output_parsed: {
        summary: "The proposal has clear scope but could explain the customer outcome.",
        suggestions: [{
          kind: "wording_suggestion",
          title: "Clarify the outcome",
          detail: "Describe the expected comfort and reliability result.",
          proposedText: "Restore reliable rooftop cooling with a complete replacement and startup.",
          confidence: "high",
        }],
        warnings: [],
      },
      usage: {
        input_tokens: 2_000,
        input_tokens_details: { cached_tokens: 500 },
        output_tokens: 300,
      },
    });

    const result = await generateEstimateCoachAiSuggestions({
      context: buildEstimateCoachAiContext(estimateFixture()),
      client: { responses: { parse } } as any,
    });

    expect(parse).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-5.6-luna",
      store: false,
      reasoning: { effort: "none" },
      max_output_tokens: 1_200,
    }));
    const request = parse.mock.calls[0][0];
    expect(request.tools).toBeUndefined();
    expect(result.suggestions.suggestions[0].kind).toBe("wording_suggestion");
    expect(result.usage).toEqual({
      inputTokens: 2_000,
      cachedInputTokens: 500,
      outputTokens: 300,
      actualCostMicrousd: 3_350,
    });
  });

  it("rejects provider output that exceeds the app-owned response contract", async () => {
    const client = {
      responses: {
        parse: vi.fn().mockResolvedValue({
          output_parsed: { summary: "", suggestions: [], warnings: [] },
          usage: {},
        }),
      },
    };
    await expect(generateEstimateCoachAiSuggestions({
      context: buildEstimateCoachAiContext(estimateFixture()),
      client: client as any,
    })).rejects.toThrow();
  });
});
