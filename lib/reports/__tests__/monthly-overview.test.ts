import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildMonthlyRange } from "@/lib/reports/monthly-overview";

describe("monthly overview", () => {
  it("uses month-to-date for the current Los Angeles month", () => {
    const range = buildMonthlyRange("2026-07", new Date("2026-07-19T20:00:00.000Z"));
    expect(range).toMatchObject({
      month: "2026-07",
      isCurrentMonth: true,
      fromDate: "2026-07-01",
      toDate: "2026-07-19",
      throughDay: 19,
    });
  });

  it("uses a full calendar month for completed months", () => {
    const range = buildMonthlyRange("2026-06", new Date("2026-07-19T20:00:00.000Z"));
    expect(range).toMatchObject({
      isCurrentMonth: false,
      fromDate: "2026-06-01",
      toDate: "2026-06-30",
      throughDay: 30,
    });
  });

  it("keeps billed, received, deposited, outstanding, and jobs linked to distinct truth", () => {
    const model = fs.readFileSync(path.join(process.cwd(), "lib/reports/monthly-overview.ts"), "utf8");
    const page = fs.readFileSync(path.join(process.cwd(), "app/reports/monthly/page.tsx"), "utf8");
    expect(model).toContain('table: "internal_invoices"');
    expect(model).toContain('table: "internal_invoice_payments"');
    expect(model).toContain("getDepositsLedgerSummary");
    expect(model).toContain('.from("jobs")');
    expect(page).toContain("Outstanding now");
    expect(page).toContain("not a monthly total");
    expect(page).toContain("directional ratio");
  });

  it("requires financial authority and exposes drill-through navigation", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "app/reports/monthly/page.tsx"), "utf8");
    expect(page).toContain("requireFinancialRegisterAccessOrRedirect");
    expect(page).toContain("/reports/payments?");
    expect(page).toContain("/reports/deposits?");
    expect(page).toContain("/reports/invoices?view=open");
    expect(page).toContain("/reports/jobs?");
  });
});
