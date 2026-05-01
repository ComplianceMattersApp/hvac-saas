// lib/estimates/__tests__/estimate-domain.test.ts
// Compliance Matters: Estimate V1A domain contract tests.
// Covers: status constants, status helpers, total helpers, timestamp validation.

import { describe, expect, it } from "vitest";
import {
  ESTIMATE_STATUSES,
  ESTIMATE_OPEN_STATUSES,
  ESTIMATE_TERMINAL_STATUSES,
  ESTIMATE_STATUS_TIMESTAMP_MAP,
  isValidEstimateStatus,
  isTerminalEstimateStatus,
  isOpenEstimateStatus,
  computeEstimateSubtotalCents,
  computeLineSubtotalCents,
  validateEstimateTotals,
  validateEstimateStatusTimestamps,
  type EstimateStatus,
  type EstimateStatusTimestamps,
} from "../estimate-domain";

// ---------------------------------------------------------------------------
// Status contract
// ---------------------------------------------------------------------------

describe("ESTIMATE_STATUSES", () => {
  it("contains all expected statuses", () => {
    expect(ESTIMATE_STATUSES).toContain("draft");
    expect(ESTIMATE_STATUSES).toContain("sent");
    expect(ESTIMATE_STATUSES).toContain("approved");
    expect(ESTIMATE_STATUSES).toContain("declined");
    expect(ESTIMATE_STATUSES).toContain("expired");
    expect(ESTIMATE_STATUSES).toContain("cancelled");
    expect(ESTIMATE_STATUSES).toContain("converted");
  });

  it("has exactly 7 statuses", () => {
    expect(ESTIMATE_STATUSES).toHaveLength(7);
  });

  it("is partitioned into open and terminal with no overlap and no gap", () => {
    for (const status of ESTIMATE_STATUSES) {
      const isOpen     = ESTIMATE_OPEN_STATUSES.has(status);
      const isTerminal = ESTIMATE_TERMINAL_STATUSES.has(status);
      expect(isOpen !== isTerminal).toBe(true); // XOR: exactly one set
    }
  });
});

describe("isValidEstimateStatus", () => {
  it.each(ESTIMATE_STATUSES)("returns true for '%s'", (status) => {
    expect(isValidEstimateStatus(status)).toBe(true);
  });

  it("returns false for unknown strings", () => {
    expect(isValidEstimateStatus("pending")).toBe(false);
    expect(isValidEstimateStatus("void")).toBe(false);
    expect(isValidEstimateStatus("")).toBe(false);
  });

  it("returns false for non-string values", () => {
    expect(isValidEstimateStatus(null)).toBe(false);
    expect(isValidEstimateStatus(undefined)).toBe(false);
    expect(isValidEstimateStatus(1)).toBe(false);
  });
});

describe("isTerminalEstimateStatus", () => {
  const terminal: EstimateStatus[] = ["approved", "declined", "expired", "cancelled", "converted"];
  const open: EstimateStatus[] = ["draft", "sent"];

  it.each(terminal)("'%s' is terminal", (s) => {
    expect(isTerminalEstimateStatus(s)).toBe(true);
  });

  it.each(open)("'%s' is NOT terminal", (s) => {
    expect(isTerminalEstimateStatus(s)).toBe(false);
  });
});

describe("isOpenEstimateStatus", () => {
  const open: EstimateStatus[] = ["draft", "sent"];
  const terminal: EstimateStatus[] = ["approved", "declined", "expired", "cancelled", "converted"];

  it.each(open)("'%s' is open", (s) => {
    expect(isOpenEstimateStatus(s)).toBe(true);
  });

  it.each(terminal)("'%s' is NOT open", (s) => {
    expect(isOpenEstimateStatus(s)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Status timestamp map
// ---------------------------------------------------------------------------

describe("ESTIMATE_STATUS_TIMESTAMP_MAP", () => {
  it("maps each non-draft non-sent status to a unique timestamp field", () => {
    const mapped = Object.entries(ESTIMATE_STATUS_TIMESTAMP_MAP);
    const fields = mapped.map(([, field]) => field);
    // All mapped fields should be unique
    expect(new Set(fields).size).toBe(fields.length);
  });

  it("does not map 'draft' (no required timestamp)", () => {
    expect(ESTIMATE_STATUS_TIMESTAMP_MAP["draft"]).toBeUndefined();
  });

  it("maps 'sent' to sent_at", () => {
    expect(ESTIMATE_STATUS_TIMESTAMP_MAP["sent"]).toBe("sent_at");
  });

  it("maps 'approved' to approved_at", () => {
    expect(ESTIMATE_STATUS_TIMESTAMP_MAP["approved"]).toBe("approved_at");
  });

  it("maps 'converted' to converted_at", () => {
    expect(ESTIMATE_STATUS_TIMESTAMP_MAP["converted"]).toBe("converted_at");
  });
});

// ---------------------------------------------------------------------------
// Total helpers
// ---------------------------------------------------------------------------

const NULL_TIMESTAMPS: EstimateStatusTimestamps = {
  sent_at:      null,
  approved_at:  null,
  declined_at:  null,
  expired_at:   null,
  cancelled_at: null,
  converted_at: null,
};

describe("computeLineSubtotalCents", () => {
  it("returns quantity * unit_price_cents (integer)", () => {
    expect(computeLineSubtotalCents(2, 5000)).toBe(10000);
  });

  it("floors fractional cents", () => {
    // 1.5 * 3333 = 4999.5 -> floored to 4999
    expect(computeLineSubtotalCents(1.5, 3333)).toBe(4999);
  });

  it("handles quantity of 1", () => {
    expect(computeLineSubtotalCents(1, 12500)).toBe(12500);
  });

  it("handles zero unit price", () => {
    expect(computeLineSubtotalCents(5, 0)).toBe(0);
  });
});

describe("computeEstimateSubtotalCents", () => {
  it("returns 0 for empty line items", () => {
    expect(computeEstimateSubtotalCents([])).toBe(0);
  });

  it("sums line_subtotal_cents", () => {
    const lines = [
      { line_subtotal_cents: 5000 },
      { line_subtotal_cents: 3000 },
      { line_subtotal_cents: 2000 },
    ];
    expect(computeEstimateSubtotalCents(lines)).toBe(10000);
  });

  it("returns correct sum for a single item", () => {
    expect(computeEstimateSubtotalCents([{ line_subtotal_cents: 8750 }])).toBe(8750);
  });
});

describe("validateEstimateTotals", () => {
  it("returns true when totals are consistent", () => {
    expect(validateEstimateTotals({ subtotal_cents: 5000, total_cents: 5000 })).toBe(true);
    expect(validateEstimateTotals({ subtotal_cents: 4000, total_cents: 5000 })).toBe(true);
  });

  it("returns false when total < subtotal", () => {
    expect(validateEstimateTotals({ subtotal_cents: 5000, total_cents: 4000 })).toBe(false);
  });

  it("returns false for negative values", () => {
    expect(validateEstimateTotals({ subtotal_cents: -1, total_cents: 0 })).toBe(false);
    expect(validateEstimateTotals({ subtotal_cents: 0, total_cents: -1 })).toBe(false);
  });

  it("returns true for zero totals", () => {
    expect(validateEstimateTotals({ subtotal_cents: 0, total_cents: 0 })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Status timestamp validation
// ---------------------------------------------------------------------------

describe("validateEstimateStatusTimestamps", () => {
  it("draft with all null timestamps is valid", () => {
    expect(validateEstimateStatusTimestamps("draft", NULL_TIMESTAMPS)).toBe(true);
  });

  it("draft with any non-null timestamp is invalid", () => {
    expect(
      validateEstimateStatusTimestamps("draft", { ...NULL_TIMESTAMPS, sent_at: "2026-01-01T00:00:00Z" })
    ).toBe(false);
    expect(
      validateEstimateStatusTimestamps("draft", { ...NULL_TIMESTAMPS, approved_at: "2026-01-01T00:00:00Z" })
    ).toBe(false);
    expect(
      validateEstimateStatusTimestamps("draft", { ...NULL_TIMESTAMPS, converted_at: "2026-01-01T00:00:00Z" })
    ).toBe(false);
  });

  it.each([
    ["sent",      "sent_at"]      as const,
    ["approved",  "approved_at"]  as const,
    ["declined",  "declined_at"]  as const,
    ["expired",   "expired_at"]   as const,
    ["cancelled", "cancelled_at"] as const,
    ["converted", "converted_at"] as const,
  ])("status '%s' requires '%s' to be non-null", (status, field) => {
    const withTimestamp = { ...NULL_TIMESTAMPS, [field]: "2026-01-01T00:00:00Z" };
    expect(validateEstimateStatusTimestamps(status, withTimestamp)).toBe(true);
    // Without the required timestamp — invalid
    expect(validateEstimateStatusTimestamps(status, NULL_TIMESTAMPS)).toBe(false);
  });
});
