import { describe, expect, it } from "vitest";

import {
  computeInvoiceTaxTotals,
  computeTaxCents,
  deriveInvoiceTaxInputs,
  formatTaxRatePercent,
  normalizeTaxRatePercent,
  parseTaxRatePercentInput,
} from "@/lib/invoices/invoice-tax";

const CA_RATE = 7.975;

describe("computeTaxCents", () => {
  it("rounds half-up to the cent", () => {
    // 1234c * 7.975% = 98.4115c → 98c
    expect(computeTaxCents(1234, CA_RATE)).toBe(98);
    // 10c * 5% = 0.5c → exactly half, rounds up
    expect(computeTaxCents(10, 5)).toBe(1);
    // 1c * 7.975% = 0.07975c → 0c
    expect(computeTaxCents(1, CA_RATE)).toBe(0);
    expect(computeTaxCents(10000, CA_RATE)).toBe(798);
  });

  it("treats a missing, zero, or negative rate as no tax", () => {
    expect(computeTaxCents(10000, null)).toBe(0);
    expect(computeTaxCents(10000, undefined)).toBe(0);
    expect(computeTaxCents(10000, 0)).toBe(0);
    expect(computeTaxCents(10000, -5)).toBe(0);
    expect(computeTaxCents(10000, "")).toBe(0);
  });

  it("returns zero for an empty or negative taxable base", () => {
    expect(computeTaxCents(0, CA_RATE)).toBe(0);
    expect(computeTaxCents(-500, CA_RATE)).toBe(0);
  });

  it("rounds once on the summed base, not per line", () => {
    // Three lines at 1234c each. Per-line rounding would give 3 × 98 = 294c;
    // rounding the sum gives 295c, and the sum is the correct answer.
    const perLine = 3 * computeTaxCents(1234, CA_RATE);
    const onSum = computeTaxCents(3 * 1234, CA_RATE);
    expect(perLine).toBe(294);
    expect(onSum).toBe(295);
    expect(
      computeInvoiceTaxTotals({
        lineItems: Array.from({ length: 3 }, () => ({ lineSubtotalCents: 1234, isTaxable: true })),
        ratePercent: CA_RATE,
      }).taxCents,
    ).toBe(295);
  });
});

describe("deriveInvoiceTaxInputs", () => {
  it("splits taxable from non-taxable", () => {
    expect(
      deriveInvoiceTaxInputs([
        { lineSubtotalCents: 10000, isTaxable: true },
        { lineSubtotalCents: 2500, isTaxable: false },
        { lineSubtotalCents: 500, isTaxable: true },
      ]),
    ).toEqual({ subtotalCents: 13000, taxableSubtotalCents: 10500, nonTaxableSubtotalCents: 2500 });
  });

  it("handles an invoice with no lines", () => {
    expect(deriveInvoiceTaxInputs([])).toEqual({
      subtotalCents: 0,
      taxableSubtotalCents: 0,
      nonTaxableSubtotalCents: 0,
    });
  });
});

describe("computeInvoiceTaxTotals", () => {
  const mixed = [
    { lineSubtotalCents: 10000, isTaxable: true },
    { lineSubtotalCents: 2500, isTaxable: false },
  ];

  it("taxes only the taxable lines and keeps total = subtotal + tax", () => {
    const totals = computeInvoiceTaxTotals({ lineItems: mixed, ratePercent: CA_RATE });
    expect(totals.taxableSubtotalCents).toBe(10000);
    expect(totals.taxCents).toBe(798);
    expect(totals.subtotalCents).toBe(12500);
    expect(totals.totalCents).toBe(12500 + 798);
    expect(totals.totalCents).toBe(totals.subtotalCents + totals.taxCents);
  });

  it("charges no tax to an exempt customer, however taxable the lines are", () => {
    const totals = computeInvoiceTaxTotals({ lineItems: mixed, ratePercent: CA_RATE, taxExempt: true });
    expect(totals.taxCents).toBe(0);
    expect(totals.totalCents).toBe(totals.subtotalCents);
  });

  it("leaves a rater invoice byte-identical to the pre-tax behavior", () => {
    // No rate configured and nothing marked taxable: subtotal === total, tax 0.
    const totals = computeInvoiceTaxTotals({
      lineItems: [
        { lineSubtotalCents: 45000, isTaxable: false },
        { lineSubtotalCents: 12500, isTaxable: false },
      ],
      ratePercent: null,
    });
    expect(totals).toMatchObject({ taxCents: 0, subtotalCents: 57500, totalCents: 57500 });
  });

  it("still charges nothing when a rate is set but no line is taxable", () => {
    const totals = computeInvoiceTaxTotals({
      lineItems: [{ lineSubtotalCents: 45000, isTaxable: false }],
      ratePercent: CA_RATE,
    });
    expect(totals.taxCents).toBe(0);
    expect(totals.totalCents).toBe(45000);
  });
});

describe("rate parsing and display", () => {
  it("accepts a bare number or a trailing percent sign", () => {
    expect(parseTaxRatePercentInput("7.975")).toBe(7.975);
    expect(parseTaxRatePercentInput("7.975%")).toBe(7.975);
    expect(parseTaxRatePercentInput(" 8 ")).toBe(8);
  });

  it("treats blank as clearing the rate", () => {
    expect(parseTaxRatePercentInput("")).toBeNull();
    expect(parseTaxRatePercentInput(null)).toBeNull();
  });

  it("rejects nonsense and out-of-range rates", () => {
    expect(parseTaxRatePercentInput("abc")).toBe("INVALID");
    expect(parseTaxRatePercentInput("-1")).toBe("INVALID");
    expect(parseTaxRatePercentInput("101")).toBe("INVALID");
  });

  it("clamps to the four decimals the column can store", () => {
    expect(parseTaxRatePercentInput("7.97531")).toBe(7.9753);
  });

  it("normalizes and formats for display", () => {
    expect(normalizeTaxRatePercent("7.9750")).toBe(7.975);
    expect(normalizeTaxRatePercent(0)).toBeNull();
    expect(formatTaxRatePercent("7.9750")).toBe("7.975%");
    expect(formatTaxRatePercent(null)).toBeNull();
  });
});
