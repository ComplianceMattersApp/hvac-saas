import { describe, expect, it } from "vitest";
import { isEstimatesEnabled } from "@/lib/estimates/estimate-exposure";

describe("isEstimatesEnabled", () => {
  it("fails closed when unset or empty", () => {
    expect(isEstimatesEnabled(undefined)).toBe(false);
    expect(isEstimatesEnabled(null)).toBe(false);
    expect(isEstimatesEnabled("")).toBe(false);
    expect(isEstimatesEnabled("   ")).toBe(false);
  });

  it("accepts true values case-insensitively", () => {
    expect(isEstimatesEnabled("1")).toBe(true);
    expect(isEstimatesEnabled("true")).toBe(true);
    expect(isEstimatesEnabled("TRUE")).toBe(true);
    expect(isEstimatesEnabled("yes")).toBe(true);
    expect(isEstimatesEnabled("YeS")).toBe(true);
    expect(isEstimatesEnabled("on")).toBe(true);
    expect(isEstimatesEnabled("ON")).toBe(true);
  });

  it("rejects other values", () => {
    expect(isEstimatesEnabled("0")).toBe(false);
    expect(isEstimatesEnabled("false")).toBe(false);
    expect(isEstimatesEnabled("off")).toBe(false);
    expect(isEstimatesEnabled("no")).toBe(false);
    expect(isEstimatesEnabled("enabled")).toBe(false);
  });
});
