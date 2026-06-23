import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const paymentsPageSource = readFileSync(
  resolve(__dirname, "../../../app/reports/payments/page.tsx"),
  "utf-8",
);

describe("payments register page wiring", () => {
  it("keeps payments received language focused on recorded money", () => {
    expect(paymentsPageSource).toContain("Payments received");
    expect(paymentsPageSource).toContain(
      "This page is view-only. Failed attempts do not count as money received.",
    );
    expect(paymentsPageSource).toContain(
      "Open Invoices shows who still owes money. Payments Received shows money already recorded. Confirm Payment is for field-reported payments that still need review.",
    );
  });

  it("keeps recorded and failed lanes split", () => {
    expect(paymentsPageSource).toContain("Money received");
    expect(paymentsPageSource).toContain("Failed payment attempts");
    expect(paymentsPageSource).toContain("Other payment records");
  });
});
