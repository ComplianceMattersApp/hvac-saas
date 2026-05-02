import { describe, expect, it } from "vitest";

import {
  formatEstimateEventLabel,
  formatEstimateEventSummary,
} from "@/lib/estimates/estimate-activity";

describe("estimate activity helpers", () => {
  it("maps core event labels to readable copy", () => {
    expect(formatEstimateEventLabel("estimate_created")).toBe("Estimate created");
    expect(formatEstimateEventLabel("line_item_added")).toBe("Line item added");
    expect(formatEstimateEventLabel("line_item_removed")).toBe("Line item removed");
    expect(formatEstimateEventLabel("estimate_sent")).toBe("Estimate marked sent");
  });

  it("renders transition summaries from metadata", () => {
    expect(
      formatEstimateEventSummary("estimate_sent", {
        previous_status: "draft",
        next_status: "sent",
      }),
    ).toBe("Draft -> Sent");
  });

  it("renders fallback summaries for sent and approved events", () => {
    expect(formatEstimateEventSummary("estimate_sent", null)).toMatch(/No customer email or PDF/);
    expect(formatEstimateEventSummary("estimate_approved", null)).toMatch(/No job, invoice, payment, or conversion record/);
  });

  it("renders line item summaries from item metadata when present", () => {
    expect(
      formatEstimateEventSummary("line_item_added", {
        item_name: "Permit allowance",
      }),
    ).toBe("Permit allowance");
  });
});