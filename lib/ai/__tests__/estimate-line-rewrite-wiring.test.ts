import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const assistant = readFileSync(join(process.cwd(), "app/estimates/[id]/EstimateLineRewriteAssistant.tsx"), "utf8");
const addLine = readFileSync(join(process.cwd(), "app/estimates/[id]/AddLineItemForm.tsx"), "utf8");
const addOptionLine = readFileSync(join(process.cwd(), "app/estimates/[id]/AddEstimateOptionLineForm.tsx"), "utf8");
const estimatePage = readFileSync(join(process.cwd(), "app/estimates/[id]/page.tsx"), "utf8");

describe("mobile estimate line rewrite wiring", () => {
  it("places the rewrite directly under both controlled description fields", () => {
    expect(addLine).toContain("<EstimateLineRewriteAssistant");
    expect(addOptionLine).toContain("<EstimateLineRewriteAssistant");
    expect(addLine).toContain("onUseRewrite={(description) => setPricebookDraft");
    expect(addOptionLine).toContain("onUseRewrite={(description) => setDraft");
  });

  it("uses plain mobile actions and requires explicit acceptance", () => {
    expect(assistant).toContain("Rewrite for customer");
    expect(assistant).toContain("Use rewrite");
    expect(assistant).toContain("Try again");
    expect(assistant).toContain("Keep mine");
    expect(assistant).toContain("min-h-11");
    expect(assistant).toContain("For a stronger estimate, add:");
  });

  it("places page-level coaching after estimate entry", () => {
    expect(estimatePage.lastIndexOf("<AddLineItemForm")).toBeLessThan(estimatePage.lastIndexOf("<EstimateCoachPanel"));
  });
});
