import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const todayPageSource = readFileSync(
  resolve(__dirname, "../../../app/today/page.tsx"),
  "utf-8",
);

const todayReadModelSource = readFileSync(
  resolve(__dirname, "../today-read-model.ts"),
  "utf-8",
);

describe("today business attention wiring", () => {
  it("imports and uses the failed payment reconciliation read model", () => {
    expect(todayReadModelSource).toContain("loadFailedPaymentReconciliationItems");
    expect(todayReadModelSource).toContain("failedPaymentAttentionPromise");
    expect(todayReadModelSource).toContain("failedPaymentsOpenCount");
  });

  it("shows failed payment attention for financial access users and keeps non-financial users hidden", () => {
    expect(todayReadModelSource).toContain("canViewFinancialRegister");
    expect(todayReadModelSource).toContain("canViewFailedPaymentAttention");
    expect(todayReadModelSource).toContain("failedPaymentsOpenCount: canViewFailedPaymentAttention ? failedPaymentAttention.openCount : null");
    expect(todayPageSource).toContain("const showFailedPayments = pulse.failedPaymentsOpenCount !== null");
  });

  it("links failed payments to reports failed-payments queue", () => {
    expect(todayPageSource).toContain("FAILED PAYMENTS");
    expect(todayPageSource).toContain("/reports/failed-payments");
    expect(todayPageSource).toContain("at risk");
  });

  it("removes failed-payment workflow helper text from Today", () => {
    expect(todayPageSource).not.toContain("Review failed payments before retrying or contacting customers.");
    expect(todayPageSource).not.toContain("No open failed payments requiring attention.");
    expect(todayPageSource).not.toContain("Failed payments are not collected payments.");
  });

  it("does not expose retry, acknowledge, resolve, or customer-message actions", () => {
    expect(todayPageSource).not.toContain("Retry saved card");
    expect(todayPageSource).not.toContain("Acknowledge");
    expect(todayPageSource).not.toContain("Resolve");
    expect(todayPageSource).not.toContain("Send SMS");
    expect(todayPageSource).not.toContain("Send Email");
  });

  it("keeps service plan attention linked to service plans", () => {
    expect(todayPageSource).toContain("ACTIVE PLANS");
    expect(todayPageSource).toContain("PLANS OVERDUE");
    expect(todayPageSource).toContain("DUE IN 7 DAYS");
    expect(todayPageSource).toContain("PLANS NOT SCHEDULED");
    expect(todayPageSource).toContain("href=\"/service-plans\"");
    expect(todayPageSource).not.toContain("Planning visibility only.");
    expect(todayPageSource).not.toContain("Manage plans from Service Plans or the customer profile.");
  });

  it("keeps open invoice follow-up distinct and linked to payments report", () => {
    expect(todayPageSource).toContain("OPEN INVOICES");
    expect(todayPageSource).toContain("/reports/payments");
    expect(todayReadModelSource).toContain('label: "Payment Follow-Up"');
  });

  it("does not call Stripe and does not mutate payment/invoice/allocation/visit/next_due truth", () => {
    expect(todayPageSource.toLowerCase()).not.toContain("stripe");
    expect(todayReadModelSource.toLowerCase()).not.toContain("stripe");
    expect(todayReadModelSource).not.toContain("insert(");
    expect(todayReadModelSource).not.toContain("update(");
    expect(todayReadModelSource).not.toContain("upsert(");
    expect(todayReadModelSource).not.toContain("delete(");
  });
});
