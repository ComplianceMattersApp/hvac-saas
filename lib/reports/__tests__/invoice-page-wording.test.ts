import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const reportPageSource = readFileSync(
  resolve(__dirname, "../../../app/reports/invoices/page.tsx"),
  "utf8",
);

describe("invoice page owner-facing wording", () => {
  it("uses Open Invoices copy and metrics that read like collections follow-up", () => {
    expect(reportPageSource).toContain("Invoices that still have money due. Use this page to follow up and keep payments moving.");
    expect(reportPageSource).toContain("Balances update from payments recorded in the app. This page does not charge cards or collect payment.");
    expect(reportPageSource).toContain("No app invoices to show");
    expect(reportPageSource).toContain("All invoices");
    expect(reportPageSource).toContain('label="Open invoices"');
    expect(reportPageSource).toContain('label="Total still owed"');
    expect(reportPageSource).toContain('label="Needs first payment"');
    expect(reportPageSource).toContain('label="Oldest balance"');
    expect(reportPageSource).toContain("Start with who owes money");
    expect(reportPageSource).toContain("Still Owed");
  });
});
