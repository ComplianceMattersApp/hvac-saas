import { describe, expect, it } from "vitest";
import {
  PAYMENTS_REGISTER_METHOD_OPTIONS,
  buildPaymentsRegisterSearchParams,
  normalizeMethodForRegister,
  parsePaymentsRegisterFilters,
} from "@/lib/reports/payments-register";

describe("payments register helper", () => {
  it("maps internal payment methods to the simplified register taxonomy", () => {
    expect(normalizeMethodForRegister("card_stripe_online")).toBe("online_stripe");
    expect(normalizeMethodForRegister("card_off_platform")).toBe("card");
    expect(normalizeMethodForRegister("check")).toBe("check");
    expect(normalizeMethodForRegister("cash")).toBe("cash");
    expect(normalizeMethodForRegister("bank_transfer")).toBe("digital");
    expect(normalizeMethodForRegister("ach_off_platform")).toBe("other");
  });

  it("keeps ACH hidden from user-facing taxonomy options", () => {
    const values = PAYMENTS_REGISTER_METHOD_OPTIONS.map((option) => option.value);
    expect(values).toEqual(["online_stripe", "card", "check", "cash", "digital", "other"]);
  });

  it("parses and rebuilds URL filters safely", () => {
    const filters = parsePaymentsRegisterFilters(
      new URLSearchParams({
        status: "failed",
        method: "digital",
        from: "2026-05-01",
        to: "2026-05-24",
        q: "INV-2026",
      }),
    );

    expect(filters).toEqual({
      status: "failed",
      method: "digital",
      fromDate: "2026-05-01",
      toDate: "2026-05-24",
      query: "INV-2026",
    });

    const params = buildPaymentsRegisterSearchParams(filters);
    expect(params.toString()).toContain("status=failed");
    expect(params.toString()).toContain("method=digital");
    expect(params.toString()).toContain("from=2026-05-01");
    expect(params.toString()).toContain("to=2026-05-24");
    expect(params.toString()).toContain("q=INV-2026");
  });
});
