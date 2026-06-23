import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { canViewFinancialRegister } from "@/lib/auth/financial-access";

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
  it("keeps Reports navigation focused on four primary reports and moves Deposits under Advanced", () => {
    expect(reportCenterTabsSource).toContain('href="/reports/invoices?view=open"');
    expect(reportCenterTabsSource).toMatch(/>\s*Open Invoices\s*<\/ReportLink>/);
    expect(reportCenterTabsSource).toContain('href="/reports/payments"');
    expect(reportCenterTabsSource).toContain('href="/reports/deposits"');
    expect(reportCenterTabsSource).toContain("Advanced / More");
    expect(reportCenterTabsSource).toMatch(/>\s*Deposits\s*<\/Link>/);
    expect(reportCenterTabsSource).toContain("showDeposits = false");
    expect(reportCenterTabsSource).toContain("showDeposits ?");
    expect(reportCenterTabsSource).toContain(
      "Review Stripe fees, net deposits, payout timing, and CSV exports.",
    );
  });

  it("adds a visible Deposits card to the Reports dashboard billing area for financial roles", () => {
    expect(reportsDashboardSource).toContain("Billing follow-up");
    expect(reportsDashboardSource).toContain("canViewFinancialRegister");
    expect(reportsDashboardSource).toContain("canViewDepositsReport");
    expect(reportsDashboardSource).toContain('showDeposits={canViewDepositsReport}');
    expect(reportsDashboardSource).toContain('href="/reports/deposits"');
    expect(reportsDashboardSource).toContain("canViewDepositsReport ? (");
    expect(reportsDashboardSource).toMatch(/>\s*Deposits\s*<\/div>/);
    expect(reportsDashboardSource).toContain(
      "Review Stripe fees, net deposits, payout timing, and CSV exports.",
    );
    expect(reportsDashboardSource.indexOf('href="/reports/payments"')).toBeLessThan(
      reportsDashboardSource.indexOf('href="/reports/deposits"'),
    );
  });

  it("uses existing financial roles to show or hide Deposits links", () => {
    const baseUser = {
      user_id: "staff-1",
      is_active: true,
      account_owner_user_id: "owner-1",
    };

    expect(canViewFinancialRegister({
      actorUserId: "owner-1",
      internalUser: { ...baseUser, user_id: "owner-1", role: "owner" },
      resourceAccountOwnerUserId: "owner-1",
    })).toBe(true);
    expect(canViewFinancialRegister({
      actorUserId: "admin-1",
      internalUser: { ...baseUser, user_id: "admin-1", role: "admin" },
      resourceAccountOwnerUserId: "owner-1",
    })).toBe(true);
    expect(canViewFinancialRegister({
      actorUserId: "billing-1",
      internalUser: { ...baseUser, user_id: "billing-1", role: "billing" },
      resourceAccountOwnerUserId: "owner-1",
    })).toBe(true);
    expect(canViewFinancialRegister({
      actorUserId: "dispatcher-1",
      internalUser: { ...baseUser, user_id: "dispatcher-1", role: "dispatcher" },
      resourceAccountOwnerUserId: "owner-1",
    })).toBe(false);
    expect(canViewFinancialRegister({
      actorUserId: "tech-1",
      internalUser: { ...baseUser, user_id: "tech-1", role: "technician" },
      resourceAccountOwnerUserId: "owner-1",
    })).toBe(false);
  });

  it("marks the Deposits report as the active Reports navigation item", () => {
    expect(reportCenterTabsSource).toContain('| "deposits"');
    expect(reportCenterTabsSource).toContain('current === "deposits"');
    expect(depositsPageSource).toContain("ReportCenterTabs");
    expect(depositsPageSource).toContain('<ReportCenterTabs current="deposits" showDeposits />');
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
