import { describe, expect, it } from "vitest";

import { computeLiveSubtotal } from "@/lib/business/internal-invoice-live-subtotal";

// Lane 3: pure live-subtotal preview helper for the desktop edit + manual-add
// charge forms. Returns price × qty for valid non-negative inputs, else null so
// the UI falls back to the authoritative server value.
describe("computeLiveSubtotal", () => {
  it("returns the product for a valid price and quantity", () => {
    expect(computeLiveSubtotal("125.50", "2")).toBe(251);
    expect(computeLiveSubtotal("99.99", "1")).toBeCloseTo(99.99, 5);
  });

  it("treats a blank quantity (handled by callers as 1) via the default path", () => {
    // Callers substitute '1' when the quantity input is blank; the helper itself
    // still returns the product for an explicit '1'.
    expect(computeLiveSubtotal("40", "1")).toBe(40);
  });

  it("returns null for an empty price", () => {
    expect(computeLiveSubtotal("", "3")).toBeNull();
  });

  it("returns null for a non-numeric price", () => {
    expect(computeLiveSubtotal("abc", "2")).toBeNull();
  });

  it("returns null for a negative price", () => {
    expect(computeLiveSubtotal("-5", "2")).toBeNull();
  });

  it("returns null for a negative quantity", () => {
    expect(computeLiveSubtotal("10", "-1")).toBeNull();
  });

  it("returns null for an empty quantity string", () => {
    expect(computeLiveSubtotal("10", "")).toBeNull();
  });

  it("supports a zero price and zero quantity as valid non-negative inputs", () => {
    expect(computeLiveSubtotal("0", "5")).toBe(0);
    expect(computeLiveSubtotal("10", "0")).toBe(0);
  });
});
