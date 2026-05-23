import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isEstimatesEnabled,
  isEstimateProposalLinksEnabled,
} from "@/lib/estimates/estimate-exposure";

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

describe("isEstimateProposalLinksEnabled", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.ENABLE_ESTIMATE_PROPOSAL_LINKS;
  });

  it.each([undefined, null, "", " "])("fails closed for empty input %s", (value) => {
    expect(isEstimateProposalLinksEnabled(value as string | null | undefined)).toBe(false);
  });

  it.each(["1", "true", "yes", "on", "  TRUE  "])(
    "returns true for enabled token %s",
    (value) => {
      expect(isEstimateProposalLinksEnabled(value)).toBe(true);
    }
  );

  it.each(["0", "false", "no", "off", "garbage"])(
    "returns false for disabled token %s",
    (value) => {
      expect(isEstimateProposalLinksEnabled(value)).toBe(false);
    }
  );

  it("uses process env when arg is omitted", () => {
    process.env.ENABLE_ESTIMATE_PROPOSAL_LINKS = "true";
    expect(isEstimateProposalLinksEnabled()).toBe(true);

    process.env.ENABLE_ESTIMATE_PROPOSAL_LINKS = "0";
    expect(isEstimateProposalLinksEnabled()).toBe(false);
  });
});
