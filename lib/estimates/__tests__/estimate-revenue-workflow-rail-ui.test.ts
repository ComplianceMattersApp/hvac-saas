import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const estimatesListSource = readFileSync(
  resolve(__dirname, "../../../app/estimates/page.tsx"),
  "utf8",
);

const newEstimateSource = readFileSync(
  resolve(__dirname, "../../../app/estimates/new/page.tsx"),
  "utf8",
);

const estimateDetailSource = readFileSync(
  resolve(__dirname, "../../../app/estimates/[id]/page.tsx"),
  "utf8",
);

describe("estimate revenue workflow rail UI", () => {
  it("shows a stage and next-step rail on the estimates list", () => {
    expect(estimatesListSource).toContain("Revenue Workflow Rail");
    expect(estimatesListSource).toContain("Stage:</span> Proposal workspace.");
    expect(estimatesListSource).toContain("Next:</span> Open a draft estimate to finalize customer delivery");
  });

  it("shows a stage and next-step rail on new estimate", () => {
    expect(newEstimateSource).toContain("Revenue Workflow Rail");
    expect(newEstimateSource).toContain("Stage:</span> Draft setup.");
    expect(newEstimateSource).toContain("Next:</span> Create the draft, then add proposal line items before finalizing customer delivery.");
  });

  it("resolves estimate detail rail copy from existing status and conversion state", () => {
    expect(estimateDetailSource).toContain("function resolveEstimateRevenueWorkflowRail");
    expect(estimateDetailSource).toContain("Stage:</span> {estimateRevenueWorkflowRail.stage}.");
    expect(estimateDetailSource).toContain("Next:</span> {estimateRevenueWorkflowRail.next}");
    expect(estimateDetailSource).toContain('stage: "Awaiting customer decision"');
    expect(estimateDetailSource).toContain('stage: "Approved"');
    expect(estimateDetailSource).toContain('stage: "Job linked"');
    expect(estimateDetailSource).toContain('stage: "Invoice draft linked"');
  });
});
