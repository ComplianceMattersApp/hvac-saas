import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf-8",
);

describe("/ops failed payment alert card wiring", () => {
  it("renders failed-payment attention for financial access roles only", () => {
    expect(opsPageSource).toContain("canViewFinancialRegister");
    expect(opsPageSource).toContain("canViewFailedPaymentAttention");
    expect(opsPageSource).toContain("showFailedPaymentAttentionCard");
  });

  it("loads failed-payment read model and gates card on open summary count", () => {
    expect(opsPageSource).toContain("loadFailedPaymentReconciliationItems");
    expect(opsPageSource).toContain("failedPaymentReconciliation?.summary.openCount");
  });

  it("shows open count and balance-at-risk summary values", () => {
    expect(opsPageSource).toContain("Failed payments need attention");
    expect(opsPageSource).toContain("Open Failed");
    expect(opsPageSource).toContain("Balance At Risk");
  });

  it("shows declined/requires-action/blocked/retry-eligible breakdown", () => {
    expect(opsPageSource).toContain("Declined");
    expect(opsPageSource).toContain("Requires Action");
    expect(opsPageSource).toContain("Blocked Precondition");
    expect(opsPageSource).toContain("Retry Eligible");
  });

  it("links alert card to queue route and keeps invoice workspace row links", () => {
    expect(opsPageSource).toContain('/reports/failed-payments');
    expect(opsPageSource).toContain('Open failed-payment queue');
    expect(opsPageSource).toContain("Open invoice workspace");
    expect(opsPageSource).toContain("/jobs/${item.jobId}/invoice");
    expect(opsPageSource).not.toContain("/ops/payments-reconciliation");
  });

  it("does not expose retry action from the alert card", () => {
    expect(opsPageSource).not.toContain("Retry saved card");
    expect(opsPageSource).not.toContain("retryFailedScheduledAutopayAttemptFromForm");
  });

  it("keeps no-Stripe and no-mutation read-model verification visible", () => {
    expect(opsPageSource).toContain("noStripeCalls");
    expect(opsPageSource).toContain("noPaymentRowWrites");
    expect(opsPageSource).toContain("noAllocationRowWrites");
    expect(opsPageSource).toContain("noInvoiceMutations");
    expect(opsPageSource).toContain("noVisitOrNextDueMutations");
  });
});
