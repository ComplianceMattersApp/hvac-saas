import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const reportCenterTabsSource = readFileSync(
  resolve(__dirname, "../../../components/reports/ReportCenterTabs.tsx"),
  "utf-8",
);

const reportsDashboardSource = readFileSync(
  resolve(__dirname, "../../../app/reports/dashboard/page.tsx"),
  "utf-8",
);

const depositsPageSource = readFileSync(
  resolve(__dirname, "../../../app/reports/deposits/page.tsx"),
  "utf-8",
);

describe("report center deposits link wiring", () => {
  it("adds Deposits to the existing Reports navigation near financial reports", () => {
    expect(reportCenterTabsSource).toContain('href="/reports/payments"');
    expect(reportCenterTabsSource).toContain('href="/reports/deposits"');
    expect(reportCenterTabsSource.indexOf('href="/reports/payments"')).toBeLessThan(
      reportCenterTabsSource.indexOf('href="/reports/deposits"'),
    );
    expect(reportCenterTabsSource.indexOf('href="/reports/deposits"')).toBeLessThan(
      reportCenterTabsSource.indexOf('href="/reports/payment-reconciliation"'),
    );
    expect(reportCenterTabsSource).toMatch(/>\s*Deposits\s*<\/Link>/);
    expect(reportCenterTabsSource).toContain(
      "Review Stripe settlement fees, net deposits, payout timing, and CSV exports.",
    );
  });

  it("adds a visible Deposits card to the Reports dashboard billing area", () => {
    expect(reportsDashboardSource).toContain("Billing visibility");
    expect(reportsDashboardSource).toContain('href="/reports/deposits"');
    expect(reportsDashboardSource).toMatch(/>\s*Deposits\s*<\/div>/);
    expect(reportsDashboardSource).toContain(
      "Review Stripe fees, net deposits, payout timing, and CSV exports.",
    );
    expect(reportsDashboardSource.indexOf('href="/reports/payments"')).toBeLessThan(
      reportsDashboardSource.indexOf('href="/reports/deposits"'),
    );
  });

  it("marks the Deposits report as the active Reports navigation item", () => {
    expect(reportCenterTabsSource).toContain('| "deposits"');
    expect(reportCenterTabsSource).toContain('current === "deposits"');
    expect(depositsPageSource).toContain("ReportCenterTabs");
    expect(depositsPageSource).toContain('<ReportCenterTabs current="deposits" />');
  });

  it("does not introduce settlement sync or Stripe API wiring in the Reports navigation", () => {
    expect(reportCenterTabsSource).not.toContain("syncStripePaymentSettlements");
    expect(reportCenterTabsSource).not.toContain("syncStripePaymentSettlementForPayment");
    expect(reportCenterTabsSource).not.toMatch(/\bstripe\./);
    expect(reportsDashboardSource).not.toContain("syncStripePaymentSettlements");
    expect(reportsDashboardSource).not.toContain("syncStripePaymentSettlementForPayment");
    expect(reportsDashboardSource).not.toMatch(/\bstripe\./);
  });
});
