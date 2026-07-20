import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(__dirname, "../../../", path), "utf-8");
}

describe("report page wording polish", () => {
  it("uses the new primary report names on shared navigation and dashboard surfaces", () => {
    const tabsSource = source("components/reports/ReportCenterTabs.tsx");
    const dashboardSource = source("app/reports/dashboard/page.tsx");

    expect(tabsSource).toContain('href="/reports/payments"');
    expect(tabsSource).toContain("Payments");
    expect(tabsSource).toContain("Work History");
    expect(tabsSource).toContain("Priority Board");
    expect(dashboardSource).toContain("Billing follow-up");
    expect(dashboardSource).toContain("Work flow");
    expect(dashboardSource).toContain("Open invoices");
    expect(dashboardSource).not.toContain("Billing visibility");
    expect(dashboardSource).not.toContain("Ops flow");
    expect(dashboardSource).not.toContain("Payments Register");
  });

  it("uses operator-facing names on jobs, closeout, payments, and work history reports", () => {
    const jobsSource = source("app/reports/jobs/page.tsx");
    const closeoutSource = source("app/reports/closeout/page.tsx");
    const paymentsSource = source("app/reports/payments/page.tsx");
    const workHistorySource = source("app/reports/service-cases/page.tsx");

    expect(jobsSource).toContain("Jobs & visits");
    expect(jobsSource).toContain("Assigned team");
    expect(jobsSource).not.toContain("Jobs report");
    expect(jobsSource).not.toContain("visit rows");

    expect(closeoutSource).toContain("Closeout follow-up");
    expect(closeoutSource).toContain("Needs final review");
    expect(closeoutSource).not.toContain("Closeout report");

    expect(paymentsSource).toContain("Payments received");
    expect(paymentsSource).toContain("Money received");
    expect(paymentsSource).not.toContain("Payments Register");

    expect(workHistorySource).toContain("Work History");
    expect(workHistorySource).toContain("No work history found");
    expect(workHistorySource).not.toContain("Service cases report");
  });
});
