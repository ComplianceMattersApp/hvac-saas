import { describe, expect, it } from "vitest";
import { buildEstimateCoachReport } from "@/lib/estimates/estimate-coach";

function estimateFixture(overrides: Record<string, unknown> = {}) {
  return {
    customer_id: "customer-1",
    location_id: "location-1",
    title: "Replace rooftop unit",
    notes: "Replace failed unit and perform startup.",
    total_cents: 125000,
    proposalMode: "single_option_flat" as const,
    line_items: [{ id: "line-1" }],
    options: undefined,
    ...overrides,
  } as any;
}

describe("buildEstimateCoachReport", () => {
  it("returns only boundary guidance for a ready flat estimate", () => {
    const report = buildEstimateCoachReport({ estimate: estimateFixture(), customerEmail: "buyer@example.com" });
    expect(report.attentionCount).toBe(0);
    expect(report.suggestions).toHaveLength(1);
    expect(report.suggestions[0]).toMatchObject({ id: "commercial_scope_boundary", severity: "guidance" });
  });

  it("surfaces missing context, content, lines, total, and recipient email", () => {
    const report = buildEstimateCoachReport({
      estimate: estimateFixture({ customer_id: null, location_id: null, title: "", notes: null, total_cents: 0, line_items: [] }),
      customerEmail: null,
    });
    expect(report.attentionCount).toBe(7);
    expect(report.suggestions.map((item) => item.id)).toEqual(expect.arrayContaining([
      "missing_customer", "missing_location", "missing_title", "missing_scope_notes", "missing_recipient_email", "missing_lines", "zero_total",
    ]));
  });

  it("requires two populated options and ignores an unfinished optional choice", () => {
    const report = buildEstimateCoachReport({
      estimate: estimateFixture({
        proposalMode: "multi_option_packages",
        total_cents: 0,
        line_items: [],
        options: [
          { id: "good", label: "Good", total_cents: 50000, line_items: [{ id: "good-line" }] },
          { id: "better", label: "Better", total_cents: 0, line_items: [] },
        ],
      }),
      customerEmail: "buyer@example.com",
    });
    expect(report.attentionCount).toBe(1);
    expect(report.suggestions.map((item) => item.id)).toContain("missing_options");
    expect(report.suggestions.map((item) => item.id)).not.toContain("option_better_total");
    expect(report.suggestions.map((item) => item.id)).not.toContain("zero_total");
  });
});
