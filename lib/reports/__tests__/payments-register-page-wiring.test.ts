import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const paymentsPageSource = readFileSync(
  resolve(__dirname, "../../../app/reports/payments/page.tsx"),
  "utf-8",
);

describe("payments register page wiring", () => {
  it("keeps register truth language focused on collected payment truth", () => {
    expect(paymentsPageSource).toContain("Payments Register");
    expect(paymentsPageSource).toContain(
      "Current source of truth is internal_invoice_payments. This slice is read-only and does not add payment mutations or allocation behavior.",
    );
    expect(paymentsPageSource).toContain(
      "Payments Register shows collected payment truth. Confirm Payment shows reported payments awaiting verification. Failed Payments shows failed attempts needing review.",
    );
  });

  it("keeps recorded and failed lanes split", () => {
    expect(paymentsPageSource).toContain("Recorded payments");
    expect(paymentsPageSource).toContain("Failed attempts");
    expect(paymentsPageSource).toContain("Other payment states");
  });
});
